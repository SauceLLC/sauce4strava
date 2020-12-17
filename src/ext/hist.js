/* global sauce */

(async function() {
    'use strict';

    self.sauce = self.sauce || {};
    const ns = self.sauce.hist = {};

    const streamsCache = new sauce.cache.TTLCache('hist-streams', Infinity);

    const extUrl = self.browser ? self.browser.runtime.getURL('') : sauce.extUrl;
    const jobs = await sauce.getModule(extUrl + 'src/common/jscoop/jobs.js');
    const queues = await sauce.getModule(extUrl + 'src/common/jscoop/queues.js');

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
            return 2;
        }

        migrate(idb, t, oldVersion, newVersion) {
            if (!oldVersion || oldVersion < 1) {
                let store = idb.createObjectStore("streams", {keyPath: ['activity', 'stream']});
                store.createIndex('activity', 'activity');
                store.createIndex('athlete-stream', ['athlete', 'stream']);
                store = idb.createObjectStore("activities", {keyPath: 'id'});
                store.createIndex('athlete-ts', ['athlete', 'ts']);
            }
            if (oldVersion < 2) {
                const store = t.objectStore("streams");
                store.createIndex('athlete', 'athlete');
            }
        }
    }

    const histDatabase = new HistDatabase('SauceHist');


    class StreamsStore extends sauce.db.DBStore {
        constructor() {
            super(histDatabase, 'streams');
        }

        async *byAthlete(athlete, stream, options={}) {
            let q;
            if (stream != null) {
                options.index = 'athlete-stream';
                q = IDBKeyRange.only([athlete, stream]);
            } else {
                options.index = 'athlete';
                q = IDBKeyRange.only(athlete);
            }
            for await (const x of this.values(q, options)) {
                yield x;
            }
        }

        async *manyByAthlete(athlete, streams, options={}) {
            const buffer = new Map();
            const store = await this._getStore();
            const ready = new queues.Queue();
            Promise.all(streams.map(async stream => {
                for await (const entry of this.byAthlete(athlete, stream, {store})) {
                    const o = buffer.get(entry.activity);
                    if (o === undefined) {
                        buffer.set(entry.activity, {[stream]: entry.data});
                    } else {
                        o[stream] = entry.data;
                        if (Object.keys(o).length === streams.length) {
                            ready.put({
                                athlete,
                                activity: entry.activity,
                                streams: o
                            });
                            buffer.delete(entry.activity);
                        }
                    }
                }
            })).then(() => ready.put(null));
            while (true) {
                const v = await ready.get();
                if (!v) {
                    break;
                }
                yield v;
            }
        }

        async *activitiesByAthlete(athlete, options={}) {
            // Every real activity has a time stream, so look for just this one.
            const q = IDBKeyRange.only([athlete, 'time']);
            options.index = 'athlete-stream';
            for await (const x of this.keys(q, options)) {
                debugger;
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
            for await (const x of this.values(q, {index: 'athlete-ts', direction})) {
                yield x;
            }
        }

        async getAllForAthlete(athlete, ...args) {
            const activities = [];
            for await (const x of this.byAthlete(athlete, ...args)) {
                activities.push(x);
            }
            return activities;
        }

        async firstForAthlete(athlete) {
            const q = IDBKeyRange.bound([athlete, -Infinity], [athlete, Infinity]);
            for await (const x of this.values(q, {index: 'athlete-ts'})) {
                return x;
            }
        }

        async lastForAthlete(athlete) {
            const q = IDBKeyRange.bound([athlete, -Infinity], [athlete, Infinity]);
            for await (const x of this.values(q, {index: 'athlete-ts', direction: 'prev'})) {
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




    ns.syncSelfActivities = async function(athleteId, options={}) {
        const activities = await ns.actsStore.getAllForAthlete(athleteId);
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


    ns.syncPeerActivities = async function(athleteId, options={}) {
        const activities = await ns.actsStore.getAllForAthlete(athleteId);
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


    async function fetchAllStreams(activityId) {
        const q = new URLSearchParams();
        for (const x of syncStreamTypes) {
            q.append('stream_types[]', x);
        }
        const rateLimiters = getStreamRateLimiterGroup();
        for (let i = 1;; i++) {
            await rateLimiters.wait();
            console.group('Fetch All Streams: ' + activityId);
            for (const x of rateLimiters) {
                console.info('' + x);
            }
            console.groupEnd();
            try {
                const resp = await retryFetch(`/activities/${activityId}/streams?${q}`);
                return await resp.json();
            } catch(e) {
                if (!e.resp) {
                    throw e;
                } else if (e.resp.status === 404) {
                    return;
                } else if (e.resp.status === 429) {
                    const delay = 60000 * i;
                    console.warn(`Hit Throttle Limits: Delaying next request for ${Math.round(delay / 1000)}s`);
                    await sleep(delay);
                    console.info("Resuming after throttle period");
                    continue;
                } else {
                    throw e;
                }
            }
        }
    }




    ns.syncStreams = async function(athleteId) {
        const activities = await ns.actsStore.getAllForAthlete(athleteId);
        const outstanding = new Set(activities.map(x => x.id));
        for await (const x of ns.streamsStore.activitiesByAthlete(athleteId)) {
            outstanding.delete(x);
        }
        if (!outstanding.size) {
            console.info("All activities synchronized");
            return;
        }
        console.info(`Need to synchronize ${outstanding.size} of ${activities.length} activities...`);
        for (const id of outstanding) {
            try {
                await fetchAllStreams(id);
            } catch(e) {
                console.warn("Fetch streams errors:", e);
            }
        }
        console.info("Completed activities fetch/sync");
    };


    ns.findPeaks = async function(athleteId, period, options={}) {
        const s = Date.now();
        const streamsMap = new Map();
        for await (const group of ns.streamsStore.manyByAthlete(athleteId, ['time', 'watts'])) {
            streamsMap.set(group.activity, group.streams);
        }
        console.log('Get streams time:', Date.now() - s);
        const type = options.type || 'power';
        const limit = options.limit || 10;
        const peaks = [];
        let best = -Infinity;
        let i = 0;
        for (const [id, streams] of streamsMap.entries()) {
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
            if (!(i % 100)) {
                console.debug('Processing:', i, 'took', (Date.now() - s) / i);
            }
        }
        console.debug('Done:', i, 'took', Date.now() - s);
        return peaks.slice(0, limit).map(([avg, roll, id]) => ({roll, id}));
    };


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


    ns.importLegacyStreams = async function(name, host='http://localhost:8001') {
        let added = 0;
        let skipped = 0;
        for (let i = 0;; i++) {
            const url = host + `/${name}-${i}.json`;
            const resp = await fetch(url);
            if (!resp.ok) {
                if (resp.status === 404) {
                    break;
                }
                throw new Error('HTTP Error: ' + resp.status);
            }
            const data = await resp.json();
            // Must cross ref every single activity we know of to find the athlete.
            const activities = new Map();
            for await (const x of ns.actsStore.values()) {
                // Filter sentinels
                if (x.id > 0) {
                    activities.set(x.id, x.athlete);
                }
            }
            await ns.streamsStore.putMany(data.map(x => {
                const [activityS, stream] = x.key.split('-', 2);
                if (!stream) {
                    return;  // skip empty, we used to keep them.
                }
                const activity = Number(activityS);
                const athlete = activities.get(activity);
                if (!athlete) {
                    skipped++;
                    return;  // removed by filter() after map
                } else {
                    added++;
                    return {
                        activity,
                        athlete,
                        stream,
                        data: x.value
                    };
                }
            }).filter(x => x));
        }
        console.info(`Imported ${added} entries, skipped ${skipped}`);
    };
})();
