/* global sauce */

(async function() {
    'use strict';

    self.sauce = self.sauce || {};
    const ns = self.sauce.hist = {};

    const streamsCache = new sauce.cache.TTLCache('hist-streams', Infinity);

    const extUrl = self.browser ? self.browser.runtime.getURL('') : sauce.extUrl;
    const jobs = await sauce.getModule(extUrl + 'src/common/jscoop/jobs.js');

    // NOTE: If this list grows we have to re-sync!
    const syncStreamTypes = [
        'time',
        'heartrate',
        'altitude',
        'distance',
        'moving',
        'velocity_smooth',
        'cadence',
        'latlng',
        'watts',
        'watts_calc',
        'grade_adjusted_distance',
        'temp',
    ];


    class FetchError extends Error {
        static fromResp(resp) {
            const msg = `${this.name}: ${resp.url} [${resp.status}]`;
            const instance = new this(msg);
            instance.resp = resp;
            return instance;
        }
    }

    class ThrottledFetchError extends FetchError {}


    async function sleep(ms) {
        await new Promise(resolve => setTimeout(resolve, ms));
    }


    class HistDatabase extends sauce.db.Database {
        get version() {
            return 1;
        }

        migrate(idb, oldVersion) {
            if (!oldVersion || oldVersion < 1) {
                let store = idb.createObjectStore("streams", {keyPath: ['activity', 'stream']});
                store.createIndex('activity', 'activity');
                store.createIndex('athlete-stream', ['athlete', 'stream']);
                store = idb.createObjectStore("activities", {keyPath: 'id'});
                store.createIndex('athlete-ts', ['athlete', 'ts']);
            }
        }
    }

    const histDatabase = new HistDatabase('SauceHist');


    class StreamsStore extends sauce.db.DBStore {
        constructor() {
            super(histDatabase, 'streams');
        }

        async *byAthlete(athlete) {
            const q = IDBKeyRange.only(athlete);
            for await (const x of super.values(q, {index: 'athlete'})) {
                yield x;
            }
        }
    }


    class ActivitiesStore extends sauce.db.DBStore {
        constructor() {
            super(histDatabase, 'activities');
        }

        async *byAthlete(athlete, reverse) {
            const q = IDBKeyRange.bound([athlete, -Infinity], [athlete, Infinity]);
            const direction = reverse ? 'next' : 'prev';
            for await (const x of super.values(q, {index: 'athlete-ts', direction})) {
                yield x;
            }
        }

        async firstForAthlete(athlete) {
            const q = IDBKeyRange.bound([athlete, -Infinity], [athlete, Infinity]);
            for await (const x of super.values(q, {index: 'athlete-ts'})) {
                return x;
            }
        }

        async lastForAthlete(athlete) {
            const q = IDBKeyRange.bound([athlete, -Infinity], [athlete, Infinity]);
            for await (const x of super.values(q, {index: 'athlete-ts', direction: 'prev'})) {
                return x;
            }
        }
    }


    ns.actsStore = new ActivitiesStore();
    ns.streamsStore = new StreamsStore();


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
                console.info(`Server error for: ${resp.url} - Retry: ${r}/${maxRetries}`);
                await sleep(1000 * r);
                continue;
            }
            if (resp.status === 429) {
                throw ThrottledFetchError.fromResp(resp);
            }
            throw FetchError.fromResp(resp);
        }
    }


    class SauceRateLimiter extends jobs.RateLimiter {
        async getState() {
            const storeKey = `hist-rate-limiter-${this.label}`;
            return await sauce.storage.get(storeKey);
        }

        async setState(state) {
            const storeKey = `hist-rate-limiter-${this.label}`;
            await sauce.storage.set(storeKey, state);
        }
    }


    // We must stay within API limits;  Roughy 40/min, 300/hour and 1000/day...
    const getStreamRateLimiterGroup = (function() {
        let group;
        return function() {
            if (!group) {
                group = new jobs.RateLimiterGroup();
                group.push(new SauceRateLimiter('streams-min', {period: (60 + 5) * 1000, limit: 30, spread: true}));
                group.push(new SauceRateLimiter('streams-hour', {period: (3600 + 500) * 1000, limit: 200}));
                group.push(new SauceRateLimiter('streams-day', {period: (86400 + 3600) * 1000, limit: 700}));
            }
            return group;
        };
    })();


    async function getStreams(activityId, streamTypes, options={}) {
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
        if (!missing.size || options.disableFetch) {
            return results;
        }
        const q = new URLSearchParams();
        for (const x of missing) {
            q.append('stream_types[]', x);
        }
        const rateLimiters = getStreamRateLimiterGroup();
        await rateLimiters.wait();
        console.group();
        for (const x of rateLimiters) {
            console.info('' + x);
        }
        console.groupEnd();
        let resp;
        try {
            resp = await retryFetch(`/activities/${activityId}/streams?${q}`);
        } catch(e) {
            if (!e.resp || e.resp.status !== 404) {
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
    }


    ns.selfActivities = async function(athleteId, options={}) {
        const activities = [];
        for await (const x of ns.actsStore.byAthlete(athleteId)) {
            activities.push(x);
        }
        if (options.disableFetch) {
            return activities;
        }
        const localIds = new Set(activities.map(x => x.id));
        for (let concurrency = 1, page = 1, pageCount, total;; concurrency = Math.min(concurrency * 2, 25)) {
            const work = new jobs.UnorderedWorkQueue({maxPending: 25});
            for (let i = 0; page === 1 || page <= pageCount && i < concurrency; page++, i++) {
                await work.put((async () => {
                    const q = new URLSearchParams();
                    q.set('new_activity_only', 'false');
                    q.set('page', page);
                    const resp = await retryFetch(`/athlete/training_activities?${q}`);
                    return await resp.json();
                })());
            }
            if (!work.pending() && !work.fulfilled()) {
                break;
            }
            const adding = [];
            for await (const data of work) {
                if (total === undefined) {
                    total = data.total;
                    pageCount = Math.ceil(total / data.perPage);
                }
                for (const x of data.models) {
                    if (!localIds.has(x.id)) {
                        const record = Object.assign({
                            athlete: athleteId,
                            ts: x.start_date_local_raw * 1000
                        }, x);
                        adding.push(record);
                        activities.push(record);  // Sort later.
                    }
                }
            }
            // Don't give up until we've met or exceeded the indicated number of acts.
            // If a user has deleted acts that we previously fetched our count will
            // be higher.  So we also require than the entire work group had no effect
            // before stopping.
            if (adding.length) {
                await ns.actsStore.putMany(adding);
                console.info(`Synchronized ${adding.length} new activities`);
            } else if (activities.length >= total) {
                break;
            }
        }
        activities.sort((a, b) => b.ts - a.ts);
        return activities;
    };


    ns.peerActivities = async function(athleteId, options={}) {
        const activities = [];
        for await (const x of ns.actsStore.byAthlete(athleteId)) {
            activities.push(x);
        }
        if (options.disableFetch) {
            return activities;
        }
        const knownIds = new Set(activities.map(x => x.id));

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
            const ts = (new Date(`${year}-${month}`)).getTime(); // Just an approximate value for sync.
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
                batch.push({
                    id: Number(scriptish.match(/entity_id = \\"(.+?)\\";/)[1]),
                    athlete: athleteId,
                    ts
                });
            }
            return batch;
        }

        async function batchImport(startDate) {
            const minEmpty = 12;
            const minRedundant = 2;
            const iter = yearMonthRange(startDate);
            for (let concurrency = 1;; concurrency = Math.min(25, concurrency * 2)) {
                const work = new jobs.UnorderedWorkQueue({maxPending: 25});
                for (let i = 0; i < concurrency; i++) {
                    const [year, month] = iter.next().value;
                    await work.put(fetchMonth(year, month));
                }
                let empty = 0;
                let redundant = 0;
                const adding = [];
                for await (const data of work) {
                    if (!data.length) {
                        empty++;
                        continue;
                    }
                    let foundNew;
                    for (const x of data) {
                        if (!knownIds.has(x.id)) {
                            adding.push(x);
                            activities.push(x);  // Sort later.
                            knownIds.add(x.id);
                            foundNew = true;
                        }
                    }
                    if (!foundNew) {
                        redundant++;
                    }
                }
                if (adding.length) {
                    await ns.actsStore.putMany(adding);
                    console.info(`Synchronized ${adding.length} new activities`);
                } else if (empty >= minEmpty && empty >= Math.floor(concurrency)) {
                    const [year, month] = iter.next().value;
                    const date = new Date(`${month === 12 ? year + 1 : year}-${month === 12 ? 1 : month + 1}`);
                    console.warn("Place sentinel just before here:", date);
                    await ns.actsStore.put({id: -athleteId, sentinel: date.getTime()});
                    break;
                } else if (redundant >= minRedundant  && redundant >= Math.floor(concurrency)) {
                    // Entire work set was redundant.  Don't refetch any more.
                    const date = iter.next().value;
                    console.warn("Overlapping at:", date);
                    break;
                }
            }
        }

        // Fetch lastest activities (or all of them if this is the first time).
        await batchImport(new Date());
        // Sentinel is stashed as a special record to indicate that we have scanned
        // some distance into the past.  Without this we never know how far back
        // we looked given there is no page count or total to work with.
        const sentinel = await ns.actsStore.get(-athleteId);
        if (!sentinel) {
            // We never finished a prior sync so find where we left off..
            const last = await ns.actsStore.firstForAthlete(athleteId);
            await batchImport(new Date(last.ts));
        }
        activities.sort((a, b) => b.ts - a.ts);
        return activities;
    };


    // This routine is recommend for most cases as it has throttle handling and
    // gets all the pertinent streams so we don't abuse the Strava API.
    // Better to get all the data for each activity so we don't have to fetch it
    // again.
    ns.getAllStreams = async function(id, options={}) {
        const disableFetch = options.disableFetch;
        for (let i = 1;; i++) {
            try {
                return await getStreams(id, syncStreamTypes, {disableFetch}).then(streams => ({id, streams}));
            } catch(e) {
                if (e.toString().indexOf('ThrottledFetchError') !== -1) {
                    const delay = 60000 * i;
                    console.warn(`Hit Throttle Limits: Delaying next request for ${Math.round(delay / 1000)}s`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    console.warn("Resuming after throttle period");
                    continue;
                } else {
                    throw e;
                }
            }
        }
    };


    async function availStreamsFilter(acts) {
        const ids = new Set(acts.map(x => x.id));
        const avail = new Map();
        for await (const x of streamsCache.values()) {
            const id = Number(x.key.split('-')[0]);
            if (ids.has(id)) {
                if (!avail.has(id)) {
                    avail.set(id, {});
                }
                avail.get(id)[x.key.split('-')[1]] = x.value;
            }
        }
        return avail;
    }


    ns.syncPeerStreams = async function(athleteId) {
        const acts = await ns.peerActivities(athleteId);
        return await syncStreams(acts);
    };


    ns.syncSelfStreams = async function(athleteId) {
        const acts = await ns.selfActivities(athleteId);
        return await syncStreams(acts);
    };


    let _syncing = false;
    async function syncStreams(acts) {
        if (_syncing) {
            throw new Error("Sorry a sync job is running");
        }
        _syncing = true;
        try {
            const remaining = new Set(acts.map(x => x.id));
            for await (const x of streamsCache.values()) {
                remaining.delete(Number(x.key.split('-')[0]));
            }
            if (!remaining.size) {
                console.info("All activities synchronized");
                return;
            }
            console.info(`Need to synchronize ${remaining.size} of ${acts.length} activities...`);
            for (const id of remaining) {
                try {
                    await ns.getAllStreams(id);
                } catch(e) {
                    console.warn("Get streams errors:", e);
                }
            }
            console.info("Completed activities fetch/sync");
        } finally {
            _syncing = false;
        }
    }


    ns.findPeerPeaks = async function(athleteId, ...args) {
        const acts = await ns.peerActivities(athleteId, {disableFetch: true});
        const streamsMap = await availStreamsFilter(acts);
        return await findPeaks(streamsMap, ...args);
    };


    ns.findSelfPeaks = async function(athleteId, ...args) {
        const acts = await ns.selfActivities(athleteId, {disableFetch: true});
        const streamsMap = await availStreamsFilter(acts);
        return await findPeaks(streamsMap, ...args);
    };


    async function findPeaks(streamsMap, period, options={}) {
        const type = options.type || 'power';
        const limit = options.limit || 10;
        const peaks = [];
        let best = -Infinity;
        let i = 0;
        for (const [id, streams] of streamsMap.entries()) {
            const s = Date.now();
            if (type === 'power') {
                if (streams && streams.time && streams.watts) {
                    const roll = sauce.power.peakPower(period, streams.time, streams.watts);
                    if (roll) {
                        const avg = roll.avg();
                        peaks.push([avg, roll, id]);
                        peaks.sort((a, b) => b[0] - a[0]);
                        if (best < avg) {
                            best = avg;
                            console.info("NEW BEST!", `https://www.strava.com/activities/${id}`, avg);
                        }
                    }
                }
            } else {
                throw new Error("Invalid peak type: " + type);
            }
            i++;
            console.debug('Processing:', i, 'took', Date.now() - s);
        }
        return peaks.slice(0, limit).map(([avg, roll, id]) => ({roll, id}));
    }


    function download(blob, name) {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = name;
        link.style.display = 'none';
        document.body.appendChild(link);
        try {
            link.click();
        } finally {
            link.remove();
            URL.revokeObjectURL(link.href);
        }
    }


    ns.exportStreams = async function(name) {
        name = name || 'streams-export';
        const valuesIter = streamsCache.values();
        const entriesPerFile = 5000;  // Blob and JSON.stringify have arbitrary limits.
        for (let i = 0, done; !done; i++) {
            const data = [];
            while (true) {
                const x = await valuesIter.next();
                if (x.done) {
                    done = true;
                    break;
                }
                data.push(x.value);
                if (data.length === entriesPerFile) {
                    break;
                }
            }
            const blob = new Blob([JSON.stringify(data)]);
            download(blob, `${name}-${i}.json`); 
            if (data.length !== entriesPerFile) {
                break;
            }
        }
        console.info("Export done");
    };


    ns.importStreams = async function(url) {
        const resp = await fetch(url);
        const data = await resp.json();
        const obj = {};
        for (const x of data) {
            obj[x.key] = x.value;
        }
        await streamsCache.setObject(obj);
        console.info(`Imported ${data.length} entries`);
    };
})();
