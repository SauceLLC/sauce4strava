/* global sauce */

sauce.ns('hist', async ns => {
    'use strict';

    const namespace = 'hist';
    const extUrl = self.browser ? self.browser.runtime.getURL('') : sauce.extUrl;
    const jobs = await sauce.getModule(extUrl + 'src/common/jscoop/jobs.js');
    const queues = await sauce.getModule(extUrl + 'src/common/jscoop/queues.js');
    const futures = await sauce.getModule(extUrl + 'src/common/jscoop/futures.js');

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


    const actsStore = new sauce.db.ActivitiesStore();
    const streamsStore = new sauce.db.StreamsStore();


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


    function getBaseType(activity) {
        if (activity.type.match(/Ride/)) {
            return 'ride';
        } else if (activity.type.match(/Run|Hike|Walk/)) {
            return 'run';
        } else if (activity.type.match(/Swim/)) {
            return 'swim';
        }
    }


    async function syncSelfActivities(athlete, options={}) {
        const activities = await actsStore.getAllForAthlete(athlete);
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
                            athlete,
                            ts: x.start_date_local_raw * 1000
                        }, x);
                        record.basetype = getBaseType(record);
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
                await actsStore.putMany(adding);
                console.info(`Synchronized ${adding.length} new activities`);
            } else if (activities.length >= total) {
                break;
            }
        }
        activities.sort((a, b) => b.ts - a.ts);
        return activities;
    }
    sauce.proxy.export(syncSelfActivities, {namespace});


    async function syncPeerActivities(athlete, options={}) {
        const activities = await actsStore.getAllForAthlete(athlete);
        const knownIds = new Set(activities.map(x => x.id));

        function *yearMonthRange(date) {
            for (let year = date.getUTCFullYear(), month = date.getUTCMonth() + 1;; year--, month=12) {
                for (let m = month; m; m--) {
                    yield [year, m];
                }
            }
        }

        async function fetchMonthOld(year, month) {
            const q = new URLSearchParams();
            q.set('interval_type', 'month');
            q.set('chart_type', 'miles');
            q.set('year_offset', '0');
            q.set('interval', '' + year +  month.toString().padStart(2, '0'));
            const resp = await retryFetch(`/athletes/${athlete}/interval?${q}`);
            const data = await resp.text();
            const batch = [];
            const raw = data.match(/jQuery\('#interval-rides'\)\.html\((.*)\)/)[1];
            const ts = (new Date(`${year}-${month}`)).getTime(); // Just an approximate value for sync.
            for (const m of raw.matchAll(/<script>(.+?)<\\\/script>/g)) {
                const scriptish = m[1];
                const entity = scriptish.match(/entity = \\"(.+?)\\";/);
                if (!entity || entity[1] !== 'Activity') {
                    continue;
                }
                const actAthleteId = scriptish.match(/activity_athlete = {id: \\"([0-9]+)\\"};/);
                if (!actAthleteId || Number(actAthleteId[1]) !== athlete) {
                    continue;
                }
                // NOTE: Maybe someday we can safely get more fields in there.
                batch.push({
                    id: Number(scriptish.match(/entity_id = \\"(.+?)\\";/)[1]),
                    athlete,
                    ts
                });
            }
            return batch;
        }

        async function fetchMonth(year, month) {
            // Welcome to hell.  It gets really ugly in here in an effort to avoid
            // any eval usage which is required to render this HTML into a DOM node.
            // So are doing horrible HTML parsing with regexps..
            const q = new URLSearchParams();
            q.set('interval_type', 'month');
            q.set('chart_type', 'miles');
            q.set('year_offset', '0');
            q.set('interval', '' + year +  month.toString().padStart(2, '0'));
            const resp = await retryFetch(`/athletes/${athlete}/interval?${q}`);
            const data = await resp.text();
            const raw = data.match(/jQuery\('#interval-rides'\)\.html\((.*)\)/)[1];
            const batch = [];
            const activityIconMap = {
                'icon-run': 'run',
                'icon-hike': 'run',
                'icon-walk': 'run',
                'icon-ride': 'ride',
                'icon-virtualride': 'ride',
                'icon-alpineski': 'ski',
                'icon-nordicski': 'ski',
                'icon-backcountryski': 'ski',
                'icon-ebikeride': 'ebike',
                'icon-workout': 'workout',
                'icon-standuppaddling': 'workout',
                'icon-yoga': 'workout',
                'icon-snowshoe': 'workout',
            };
            const attrSep = String.raw`(?: |\\"|\\')`;
            function tagWithAttrValue(tag, attrVal, matchVal) {
                return `<${tag} [^>]*?${attrSep}${matchVal ? '(' : ''}${attrVal}${matchVal ? ')' : ''}${attrSep}`;
            }
            const iconRegexps = [];
            for (const key of Object.keys(activityIconMap)) {
                iconRegexps.push(new RegExp(tagWithAttrValue('span', key, true)));
            }
            const feedEntryExp = tagWithAttrValue('div', 'feed-entry');
            const subEntryExp = tagWithAttrValue('li', 'feed-entry');
            const feedEntryRegexp = new RegExp(`(${feedEntryExp}.*?)(?=${feedEntryExp}|$)`, 'g');
            const subEntryRegexp = new RegExp(`(${subEntryExp}.*?)(?=${subEntryExp}|$)`, 'g');
            const activityRegexp = new RegExp(`^[^>]*?${attrSep}activity${attrSep}`);
            const groupActivityRegexp = new RegExp(`^[^>]*?${attrSep}group-activity${attrSep}`);
            for (const [, entry] of raw.matchAll(feedEntryRegexp)) {
                let isGroup;
                if (!entry.match(activityRegexp)) {
                    if (entry.match(groupActivityRegexp)) {
                        isGroup = true;
                    } else {
                        continue;
                    }
                }
                let basetype;
                for (const x of iconRegexps) {
                    const m = entry.match(x);
                    if (m) {
                        basetype = activityIconMap[m[1]];
                        break;
                    }
                }
                if (!basetype) {
                    console.error("Unhandled activity type for:", entry);
                    debugger;
                    basetype = 'workout'; // XXX later this is probably fine to assume.
                }
                let ts;
                const dateM = entry.match(/<time [^>]*?datetime=\\'(.*?)\\'/);
                if (!dateM) {
                    console.error("Unable to get timestamp from feed entry"); 
                    debugger;
                    ts = (new Date(`${year}-${month}`)).getTime(); // Just an approximate value for sync.
                } else {
                    ts = (new Date(dateM[1])).getTime();
                }
                let idMatch;
                if (isGroup) {
                    for (const [, subEntry] of entry.matchAll(subEntryRegexp)) {
                        const athleteM = subEntry.match(/<a [^>]*?entry-athlete[^>]*? href=\\'\/(?:athletes|pros)\/([0-9]+)\\'/);
                        if (!athleteM) {
                            console.error("Unable to get athlete ID from feed sub entry"); 
                            debugger;
                            continue;
                        }
                        if (Number(athleteM[1]) !== athlete) {
                            console.warn("Skipping activity from other athlete");
                            continue;
                        }
                        idMatch = subEntry.match(/id=\\'Activity-([0-9]+)\\'/);
                        break;
                    }
                    if (!idMatch) {
                        console.error("Group activity parser failed to find activity for this athlete");
                        debugger;
                        continue;
                    }
                } else {
                    idMatch = entry.match(/id=\\'Activity-([0-9]+)\\'/);
                }
                if (!idMatch) {
                    console.error("Unable to get activity ID feed entry"); 
                    debugger;
                    continue;
                }
                const id = Number(idMatch[1]);
                console.warn({id, ts, basetype, athlete});
                batch.push({
                    id,
                    ts,
                    basetype,
                    athlete,
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
                    const data1 = await fetchMonth(year, month);
                    const data2 = await fetchMonthOld(year, month);
                    if (data1.length !== data2.length || !data1.every((x, i) => data2[i] === x)) {
                        console.error("Fetch month methods differ!", data1, data2);
                        debugger;
                    }
                    await work.put(data1);
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
                    await actsStore.putMany(adding);
                    console.info(`Synchronized ${adding.length} new activities`);
                } else if (empty >= minEmpty && empty >= Math.floor(concurrency)) {
                    const [year, month] = iter.next().value;
                    const date = new Date(`${month === 12 ? year + 1 : year}-${month === 12 ? 1 : month + 1}`);
                    await actsStore.put({id: -athlete, sentinel: date.getTime()});
                    break;
                } else if (redundant >= minRedundant  && redundant >= Math.floor(concurrency)) {
                    // Entire work set was redundant.  Don't refetch any more.
                    break;
                }
            }
        }

        // Fetch lastest activities (or all of them if this is the first time).
        await batchImport(new Date());
        // Sentinel is stashed as a special record to indicate that we have scanned
        // some distance into the past.  Without this we never know how far back
        // we looked given there is no page count or total to work with.
        const sentinel = await actsStore.get(-athlete);
        if (!sentinel) {
            // We never finished a prior sync so find where we left off..
            const last = await actsStore.firstForAthlete(athlete);
            await batchImport(new Date(last.ts));
        }
        activities.sort((a, b) => b.ts - a.ts);
        return activities;
    }
    sauce.proxy.export(syncPeerActivities, {namespace});


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
                    return null;
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


    async function syncStreams(athlete) {
        const filter = c => !c.value.noStreams;
        const activities = await actsStore.getAllForAthlete(athlete, {filter});
        const outstanding = new Set(activities.map(x => x.id));
        for await (const x of streamsStore.activitiesByAthlete(athlete)) {
            outstanding.delete(x);
        }
        if (!outstanding.size) {
            console.info("All activities synchronized");
            return;
        }
        console.info(`Need to synchronize ${outstanding.size} of ${activities.length} activities...`);
        for (const id of outstanding) {
            try {
                const data = await fetchAllStreams(id);
                if (data) {
                    await streamsStore.putMany(Object.entries(data).map(([stream, data]) => ({
                        activity: id,
                        athlete,
                        stream,
                        data
                    })));
                } else if (data === null) {
                    const activity = await actsStore.get(id);
                    activity.noStreams = true;
                    await actsStore.put(activity);
                }
            } catch(e) {
                console.warn("Fetch streams errors:", e);
            }
        }
        console.info("Completed activities fetch/sync");
    }
    sauce.proxy.export(syncStreams, {namespace});


    class WorkerPoolExecutor {
        constructor(url, options={}) {
            this.url = url;
            this.maxWorkers = options.maxWorkers || (navigator.hardwareConcurrency * 2);
            this._idle = new queues.Queue();
            this._busy = new Set();
            this._id = 0;
        }

        async _getWorker() {
            let worker;
            if (!this._idle.qsize()) {
                if (this._busy.size >= this.maxWorkers) {
                    console.warn("Waiting for available worker...");
                    worker = await this._idle.get();
                } else {
                    worker = new Worker(this.url);
                }
            } else {
                worker = await this._idle.get();
            }
            if (worker.dead) {
                return await this._getWorker();
            }
            if (worker.gcTimeout) {
                clearTimeout(worker.gcTimeout);
            }
            this._busy.add(worker);
            return worker;
        }

        async exec(call, ...args) {
            const id = this._id++;
            const f = new futures.Future();
            const onMessage = ev => {
                if (!ev.data || ev.data.id == null) {
                    f.setError(new Error("Invalid Worker Message"));
                } else if (ev.data.id !== id) {
                    console.warn('Ignoring worker message from other job');
                    return;
                } else {
                    if (ev.data.success) {
                        f.setResult(ev.data.value);
                    } else {
                        f.setError(ev.data.value);
                    }
                }
            };
            const worker = await this._getWorker();
            worker.addEventListener('message', onMessage);
            try {
                worker.postMessage({call, args, id});
                return await f;
            } finally {
                worker.removeEventListener('message', onMessage);
                this._busy.delete(worker);
                worker.gcTimeout = setTimeout(() => {
                    worker.dead = true;
                    worker.terminate();
                }, 30000);
                this._idle.put(worker);
            }
        }
    }

    const workerPool = new WorkerPoolExecutor(extUrl + 'src/bg/hist-worker.js');


    async function findPeaks(...args) {
        const s = Date.now();
        const result = await Promise.all([
            workerPool.exec('findPeaks', ...args),
        ]);
        console.debug('Done: took', Date.now() - s);
        return result;
    }
    sauce.proxy.export(findPeaks, {namespace});


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


    async function exportStreams(name, athlete) {
        name = name || 'streams-export';
        const entriesPerFile = 5000;  // Blob and JSON.stringify have arbitrary limits.
        const batch = [];
        let page = 0;
        function dl(data) {
            const blob = new Blob([JSON.stringify(data)]);
            download(blob, `${name}-${page++}.json`);
        }
        const iter = athlete ? streamsStore.byAthlete(athlete) : streamsStore.values();
        for await (const x of iter) {
            batch.push(x);
            if (batch.length === entriesPerFile) {
                dl(batch);
                batch.length = 0;
            }
        }
        if (batch.length) {
            dl(batch);
        }
        console.info("Export done");
    }
    sauce.proxy.export(exportStreams, {namespace});


    async function importStreams(name='streams-export', host='http://localhost:8001') {
        let added = 0;
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
            added += data.length;
            await streamsStore.putMany(data);
            console.info(`Imported ${data.length} from:`, url);
        }
        console.info(`Imported ${added} entries in total.`);
    }
    sauce.proxy.export(importStreams, {namespace});


    async function getSelfFTPs() {
        const resp = await fetch("https://www.strava.com/settings/performance");
        const raw = await resp.text();
        return JSON.parse(raw.match(/all_ftps = (\[.*\]);/)[1]);
    }
    sauce.proxy.export(getSelfFTPs, {namespace});


    class SyncManager extends sauce.proxy.Eventing {
        constructor(...args) {
            super();
            console.warn("I MaDE it", args);
        }

        a(...args) {
            return Math.random();
        }
    }
    sauce.proxy.export(SyncManager, {namespace});
    

    return {
        importStreams,
        exportStreams,
        syncSelfActivities,
        syncPeerActivities,
        syncStreams,
        findPeaks,
        streamsStore,
        actsStore,
    };
});
