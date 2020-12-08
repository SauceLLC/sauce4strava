/* global sauce */

(function() {
    'use strict';

    self.sauce = self.sauce || {};
    const ns = self.sauce.hist = {};

    const actPeersCache = new sauce.cache.TTLCache('hist-activities-peers', Infinity);
    const actSelfCache = new sauce.cache.TTLCache('hist-activities-self', Infinity);
    const streamsCache = new sauce.cache.TTLCache('hist-streams', Infinity);


    async function sleep(ms) {
        await new Promise(resolve => setTimeout(resolve, ms));
    }


    class FetchError extends Error {
        static fromResp(resp) {
            const msg = `${this.name}: ${resp.url} [${resp.status}]`;
            const instance = new this(msg);
            instance.resp = resp;
            return instance;
        }
    }

    class ThrottledFetchError extends FetchError {}


    async function retryFetch(urn, options={}) {
        const maxRetries = 5;
        const headers = options.headers || {};
        headers["x-requested-with"] = "XMLHttpRequest";  // Required for most Strava endpoints
        const url = `https://www.strava.com${urn}`;
        for (let r = 1;; r++) {
            const resp = await fetch(url, Object.assign({headers}, options));
            if (resp.ok) {
                return resp;
            }
            if (resp.status >= 500 && resp.status < 600 && r <= maxRetries) {
                console.warn(`Server error for: ${resp.url} - Retry: ${r}/${maxRetries}`);
                await sleep(1000 * r);
                continue;
            }
            if (resp.status === 429) {
                throw ThrottledFetchError.fromResp(resp);
            }
            throw FetchError.fromResp(resp);
        }
    }


    class RateLimiter {
        static async singleton(label, spec) {
            if (!this._instances) {
                this._instances = {};
            }
            if (!this._instances[label]) {
                this._instances[label] = new this(label, spec);
            }
            const instance = this._instances[label];
            await instance._init;
            return instance;
        }

        constructor(label, spec) {
            this.version = 1;
            this.label = label;
            this.spec = spec;
            this.storeKey = `hist-rate-limiter-${label}`;
            this._init = this.loadState();
        }

        toString() {
            return `RateLimiter [${this.label}]: period: ${this.state.spec.period / 1000}s, ` +
                `limit: ${this.state.spec.limit}, count: ${this.state.count}`;
        }

        async loadState() {
            const state = await sauce.storage.get(this.storeKey);
            if (!state || state.version !== this.version) {
                this.state = {
                    version: this.version,
                    first: Date.now(),
                    last: 0,
                    count: 0,
                    spec: this.spec
                };
                await this.saveState();
            } else {
                this.state = state;
            }
        }

        async saveState() {
            await sauce.storage.set(this.storeKey, this.state);
        }

        async wait() {
            const spreadDelay = this.state.spec.period / this.state.spec.limit;
            this.checkForResetCond();
            // Perform as loop because this should work with concurreny too.
            while (this.state.count >= this.state.spec.limit ||
                   (this.state.spec.spread && Date.now() - this.state.last < spreadDelay)) {
                await sleep(50);
                this.checkForResetCond();
            }
        }

        checkForResetCond() {
            if (Date.now() - this.state.first > this.state.spec.period) {
                console.warn(`Reseting rate limit period for: ${this}`);
                this.state.count = 0;
                this.state.first = Date.now();
                this.saveState();  // bg okay
            }
        }

        inc() {
            this.state.count++;
            this.state.last = Date.now();
            this.saveState();  // bg okay
        }
    }


    ns.streams = async function(activityId, streamTypes) {
        const q = new URLSearchParams();
        const cacheKey = stream => `${activityId}-${stream}`;
        const missing = new Set();
        const results = {};
        for (const x of streamTypes) {
            const cached = await streamsCache.get(cacheKey(x));
            if (cached === undefined) {
                missing.add(x);
            } else {
                results[x] = cached;
            }
        }
        if (!missing.size) {
            return results;
        }
        for (const x of missing) {
            q.append('stream_types[]', x);
        }
        // We must stay within API limits;  Roughy 40/min, 300/hour and 1000/day...
        const rateLimiters = await Promise.all([
            RateLimiter.singleton('streams-min', {period: (60 + 5) * 1000, limit: 30, spread: true}),
            RateLimiter.singleton('streams-hour', {period: (3600 + 500) * 1000, limit: 200}),
            RateLimiter.singleton('streams-day', {period: (86400 + 3600) * 1000, limit: 700})
        ]);
        await Promise.all(rateLimiters.map(x => x.wait()));
        console.group('Stream Fetch');
        for (const x of rateLimiters) {
            x.inc();
            console.warn(x.toString());
        }
        console.groupEnd();
        let resp;
        try {
            resp = await retryFetch(`/activities/${activityId}/streams?${q}`);
            //resp = await sleep(400);
        } catch(e) {
            if (e.resp && e.resp.status === 404) {
                console.warn("No streams found for:", activityId);
            } else {
                throw e;
            }
        }
        const data = resp === undefined ? {} : await resp.json();
        for (const [key, value] of Object.entries(data)) {
            results[key] = value;
            missing.delete(key);
            await streamsCache.set(cacheKey(key), value);
        }
        for (const x of missing) {
            await streamsCache.set(cacheKey(x), null);
        }
        return results;
    };


    ns.selfActivities = async function(athleteId) {
        async function fetchPage(page) {
            const q = new URLSearchParams();
            q.set('new_activity_only', 'false');
            q.set('page', page);
            const resp = await retryFetch(`/athlete/training_activities?${q}`);
            return await resp.json();
        }

        const activities = (await actSelfCache.get(athleteId)) || [];
        const cachedIds = new Set(activities.map(x => x.id));
        const seed = await fetchPage(1);
        let added = 0;
        for (const x of seed.models) {
            if (!cachedIds.has(x.id)) {
                activities.push(x);
                added++;
            }
        }
        if (!added) {
            // No new data at all.
            return activities;
        } else if (added < seed.models.length) {
            // Some new data, but we overlap with cache already.
            await actSelfCache.set(athleteId, activities);
            return activities;
        }
        const pages = Math.ceil(seed.total / seed.perPage);
        let page = 2;
        for (let concurrency = 2, done = false; !done && page <= pages; concurrency *= 2) {
            const work = [];
            for (let i = 0; page <= pages && i < concurrency; page++, i++) {
                work.push(fetchPage(page));
            }
            if (!work.length) {
                break;
            }
            const lastAddCount = added;
            for (const data of await Promise.all(work)) {
                for (const x of data.models) {
                    if (!cachedIds.has(x.id)) {
                        activities.push(x);
                        added++;
                    }
                }
                if (lastAddCount === added) {
                    done = true;
                    break;
                }
            }
        }
        await actSelfCache.set(athleteId, activities);
        return activities;
    };


    ns.peerActivities = async function(athleteId) {
        const cachedDescs = new Map();
        const fetchedDescs = new Map();
        let cacheEndDate;
        let bulkStartDate;
        let sentinelDate;
        const now = new Date();

        function cacheKey(year, month) {
            return `${athleteId}-${year}-${month}`;
        }

        function isSameData(a, b) {
            return JSON.stringify(a) === JSON.stringify(b);
        }

        function *yearMonthRange(date) {
            for (let year = date.getUTCFullYear(), month = date.getUTCMonth() + 1;; year--, month=12) {
                for (let m = month; m; m--) {
                    yield [year, m];
                }
            }
        }

        async function fetchMonth(year, month) {
            const q = new URLSearchParams();
            q.set('interval_type', 'month');
            q.set('chart_type', 'miles');
            q.set('year_offset', '0');
            q.set('interval', '' + year +  month.toString().padStart(2, '0'));
            const resp = await retryFetch(`/athletes/${athleteId}/interval?${q}`);
            const data = await resp.text();
            const batch = [];
            const raw = data.match(/jQuery\('#interval-rides'\)\.html\((.*)\)/)[1];
            for (const [, scriptish] of raw.matchAll(/<script>(.+?)<\\\/script>/g)) {
                const entity = scriptish.match(/entity = \\"(.+?)\\";/);
                if (!entity || entity[1] !== 'Activity') {
                    continue;
                }
                const actAthleteId = scriptish.match(/activity_athlete = {id: \\"([0-9]+)\\"};/);
                if (!actAthleteId || Number(actAthleteId[1]) !== athleteId) {
                    continue;
                }
                // NOTE: Maybe someday we can safely get more fields in there.
                batch.push({id: Number(scriptish.match(/entity_id = \\"(.+?)\\";/)[1])});
            }
            return batch;
        }

        async function bulkImport(lastImportDate) {
            // Search for new ids until we reach cache consistency or the end of any data.
            const iter = yearMonthRange(lastImportDate);
            for (;;) {
                const work = new Map();
                for (let i = 0; i < 12; i++) {
                    const [year, month] = iter.next().value;
                    work.set(cacheKey(year, month), fetchMonth(year, month));
                }
                await Promise.all(work.values());
                let added = 0;
                let found = 0;
                for (const [key, p] of work.entries()) {
                    const fetched = await p;
                    found += fetched.length;
                    fetchedDescs.set(key, fetched);
                    const cached = cachedDescs.get(key);
                    if (!cached || !isSameData(cached, fetched)) {
                        added += fetched.length;
                    }
                    await actPeersCache.set(key, fetched);
                }
                if (!added) {
                    // Full year without an activity or updates.  Stop looking..
                    if (!found) {
                        // No data either, don't bother with tail search
                        if (sentinelDate) {
                            const oldKey = cacheKey(sentinelDate.getUTCFullYear(), sentinelDate.getUTCMonth() + 1);
                            await actPeersCache.delete(oldKey);
                        }
                        const [year, month] = iter.next().value;
                        await actPeersCache.set(cacheKey(year, month), 'SENTINEL');
                        cacheEndDate = null;
                    }
                    return;
                }
            }
        }

        // Load all cached data...
        let cacheMisses = 0;
        let lastCacheHit = now;
        for (const [year, month] of yearMonthRange(now)) {
            const cached = await actPeersCache.get(cacheKey(year, month));
            if (cached === undefined) {
                if (++cacheMisses > 36) {  // 3 years is enough
                    cacheEndDate = new Date(lastCacheHit);
                    break;
                }
            } else if (cached === 'SENTINEL') {
                sentinelDate = new Date(`${year}-${month}`);
                break;
            } else {
                cachedDescs.set(cacheKey(year, month), cached);
                lastCacheHit = `${year}-${month}`;
            }
        }
        if (cachedDescs.size) {
            // Look for cache consistency with fetched values. Then we can
            // use bulk mode or just the cache if it's complete.
            for (const [year, month] of yearMonthRange(now)) {
                const key = cacheKey(year, month);
                const fetched = await fetchMonth(year, month);
                fetchedDescs.set(key, fetched);
                const cached = cachedDescs.get(key);
                if (!cached) {
                    await actPeersCache.set(cacheKey(year, month), fetched);
                    const prior = year * 12 + month - 1;
                    bulkStartDate = new Date(`${Math.floor(prior / 12)}-${prior % 12 || 12}`);
                    break;
                } else {
                    if (isSameData(cached, fetched)) {
                        break;
                    } else {
                        // Found updated data
                        await actPeersCache.set(cacheKey(year, month), fetched);
                    }
                }
            }
        }
        if (bulkStartDate) {
            // Fill the head...
            await bulkImport(bulkStartDate);
        }
        if (cacheEndDate) {
            // Fill the tail...
            await bulkImport(cacheEndDate);
        }
        const activities = [];
        const dedup = new Set();
        for (const [year, month] of yearMonthRange(now)) {
            const key = cacheKey(year, month);
            if (fetchedDescs.has(key)) {
                for (const x of fetchedDescs.get(key)) {
                    if (!dedup.has(x.id)) {
                        dedup.add(x.id);
                        activities.push(x);
                    }
                }
            } else if (cachedDescs.has(key)) {
                for (const x of cachedDescs.get(key)) {
                    if (!dedup.has(x.id)) {
                        dedup.add(x.id);
                        activities.push(x);
                    }
                }
            } else {
                return activities;
            }
        }
    };
})();
