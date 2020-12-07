/* global sauce */

(function() {
    'use strict';

    self.sauce = self.sauce || {};
    const ns = self.sauce.hist = {};

    const actIdsCache = new sauce.cache.TTLCache('hist-activity-ids', Infinity);
    const actDescCache = new sauce.cache.TTLCache('hist-activity-descs', Infinity);
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


    async function retryFetch(url, options={}) {
        const maxRetries = 5;
        const headers = options.headers || {};
        headers["x-requested-with"] = "XMLHttpRequest";  // Required for most Strava endpoints
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


    let lastStreamFetch = 0;
    let fetched = 0;
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
        const maxRequestPerMinute = 30;
        while (Date.now() - lastStreamFetch < 60000 / maxRequestPerMinute) {
            await sleep(100);
        }
        lastStreamFetch = Date.now();
        let resp;
        try {
            resp = await retryFetch(`/activities/${activityId}/streams?${q}`);
        } catch(e) {
            if (e.resp && e.resp.status === 404) {
                console.warn("No streams found for:", activityId);
            } else {
                throw e;
            }
        }
        console.warn("Fetch count:", ++fetched);
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

        const activities = (await actDescCache.get(athleteId)) || [];
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
            await actDescCache.set(athleteId, activities);
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
        await actDescCache.set(athleteId, activities);
        return activities;
    };


    ns.othersActivityIds = async function(athleteId) {
        const cachedIds = new Map();
        const fetchedIds = new Map();
        let cacheEndDate;
        let bulkStartDate;
        const now = new Date();

        function cacheKey(year, month) {
            return `${athleteId}-${year}-${month}`;
        }

        function isSameData(a, b) {
            return a.length === b.length && a.every((x, i) => x === b[i]);
        }

        function *yearMonthRange(date) {
            for (let year = date.getUTCFullYear(), month = date.getUTCMonth() + 1;; year--, month=12) {
                for (let m = month; m; m--) {
                    yield [year, m];
                }
            }
        }

        async function fetchIds(year, month) {
            const propType = 'html';
            const q = new URLSearchParams();
            q.set('interval_type', 'month');
            q.set('chart_type', 'miles');
            q.set('year_offset', '0');
            q.set('interval', '' + year +  month.toString().padStart(2, '0'));
            const resp = await retryFetch(`/athletes/${athleteId}/interval?${q}`);
            const data = await resp.text();
            const raw = data.match(/jQuery\('#interval-rides'\)\.html\((.*)\)/)[1];
            const norm = self.Function(`"use strict"; return (${raw})`)();
            const frag = document.createElement('div');
            frag[`inner${propType.toUpperCase()}`] = norm;
            const batch = [];
            for (const x of frag.querySelectorAll('.feed-entry[id^="Activity-"]')) {
                const athUrl = x.querySelector('.avatar-content').getAttribute('href');
                const athId = Number(athUrl.match(/\/athletes\/([0-9]*)/)[1]);
                if (athId !== athleteId) {
                    continue;
                }
                const id = x.id.split(/Activity-/)[1];
                if (!id) {
                    throw new Error("Invalid Activity");
                }
                batch.push(Number(id));
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
                    work.set(cacheKey(year, month), fetchIds(year, month));
                }
                await Promise.all(work.values());
                let added = 0;
                for (const [key, p] of work.entries()) {
                    const fetched = await p;
                    fetchedIds.set(key, fetched);
                    const cached = cachedIds.get(key);
                    if (!cached || !isSameData(cached, fetched)) {
                        added += fetched.length;
                    }
                    await actIdsCache.set(key, fetched);
                }
                if (!added) {
                    // Full year without an activity or updates.  Stop looking..
                    const [year, month] = iter.next().value;
                    await actIdsCache.set(cacheKey(year, month), 'SENTINEL');
                    cacheEndDate = null;
                    return;
                }
            }
        }

        // Load all cached data...
        let cacheMisses = 0;
        let lastCacheHit = now;
        for (const [year, month] of yearMonthRange(now)) {
            const ids = await actIdsCache.get(cacheKey(year, month));
            if (ids === undefined) {
                if (++cacheMisses > 36) {  // 3 years is enough
                    cacheEndDate = new Date(lastCacheHit);
                    break;
                }
            } else if (ids === 'SENTINEL') {
                break;
            } else {
                cachedIds.set(cacheKey(year, month), ids);
                lastCacheHit = `${year}-${month}`;
            }
        }
        if (cachedIds.size) {
            // Look for cache consistency with fetched values. Then we can
            // use bulk mode or just the cache if it's complete.
            for (const [year, month] of yearMonthRange(now)) {
                const key = cacheKey(year, month);
                const fetched = await fetchIds(year, month);
                fetchedIds.set(key, fetched);
                const cached = cachedIds.get(key);
                if (!cached) {
                    await actIdsCache.set(cacheKey(year, month), fetched);
                    const prior = year * 12 + month - 1;
                    bulkStartDate = new Date(`${Math.floor(prior / 12)}-${prior % 12 || 12}`);
                    break;
                } else {
                    if (isSameData(cached, fetched)) {
                        break;
                    } else {
                        // Found updated data
                        await actIdsCache.set(cacheKey(year, month), fetched);
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
        const ids = [];
        const dedup = new Set();  // Unknown bug causes dups (likely upstream)
        for (const [year, month] of yearMonthRange(now)) {
            const key = cacheKey(year, month);
            if (fetchedIds.has(key)) {
                for (const x of fetchedIds.get(key)) {
                    if (!dedup.has(x)) {
                        ids.push(x);
                        dedup.add(x);
                    }
                }
            } else if (cachedIds.has(key)) {
                for (const x of cachedIds.get(key)) {
                    if (!dedup.has(x)) {
                        ids.push(x);
                        dedup.add(x);
                    }
                }
            } else {
                return ids;
            }
        }
    };
})();
