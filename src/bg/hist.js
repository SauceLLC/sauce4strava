/* global sauce, browser */

sauce.ns('hist', async ns => {
    'use strict';

    const namespace = 'hist';
    const jobs = await sauce.getModule('/src/common/jscoop/jobs.js');
    const queues = await sauce.getModule('/src/common/jscoop/queues.js');
    const futures = await sauce.getModule('/src/common/jscoop/futures.js');
    const locks = await sauce.getModule('/src/common/jscoop/locks.js');
    const DBTrue = 1;
    const DBFalse = 0;

    const actsStore = new sauce.hist.db.ActivitiesStore();
    const streamsStore = new sauce.hist.db.StreamsStore();
    const athletesStore = new sauce.hist.db.AthletesStore();


    sauce.hist.db.ActivityModel.addSyncManifest({
        processor: 'streams',
        name: 'fetch',
        version: 1,
        errorBackoff: 86400 * 1000,
        data: new Set([
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
        ])
    });

    sauce.hist.db.ActivityModel.addSyncManifest({
        processor: 'local',
        name: 'active-stream',
        version: 1,
        errorBackoff: 3600 * 1000,
        data: activeStreamProcessor
    });

    sauce.hist.db.ActivityModel.addSyncManifest({
        processor: 'local',
        name: 'running-watts-stream',
        version: 1,
        depends: ['active-stream'],
        errorBackoff: 300 * 1000,
        data: runningWattsProcessor
    });

    sauce.hist.db.ActivityModel.addSyncManifest({
        processor: 'local',
        name: 'activity-stats',
        version: 2,
        depends: ['active-stream', 'running-watts-stream'],
        errorBackoff: 300 * 1000,
        data: activityStatsProcessor
    });


    async function getActivitiesStreams(activities, streams) {
        const streamKeys = [];
        const actStreams = new Map();
        for (const a of activities) {
            for (const stream of streams) {
                streamKeys.push([a.pk, stream]);
            }
            actStreams.set(a.pk, {});
        }
        for (const x of await streamsStore.getMany(streamKeys)) {
            if (x) {
                actStreams.get(x.activity)[x.stream] = x.data;
            }
        }
        return actStreams;
    }


    async function activeStreamProcessor({manifest, activities, athlete}) {
        const actStreams = await getActivitiesStreams(activities,
            ['time', 'moving', 'cadence', 'watts', 'distance']);
        const activeStreams = [];
        for (const activity of activities) {
            const streams = actStreams.get(activity.pk);
            if (!streams.moving) {
                continue;
            }
            const isTrainer = activity.get('trainer');
            try {
                const activeStream = sauce.data.createActiveStream(streams, {isTrainer});
                activeStreams.push({
                    activity: activity.pk,
                    athlete: athlete.pk,
                    stream: 'active',
                    data: activeStream
                });
            } catch(e) {
                console.warn("Failed to create active stream for: " + activity, e);
                activity.setSyncError(manifest, e);
                continue;
            }
        }
        await streamsStore.putMany(activeStreams);
    }


    async function runningWattsProcessor({manifest, activities, athlete}) {
        const runs = activities.filter(x => x.get('basetype') === 'run');
        const actStreams = await getActivitiesStreams(runs, ['time', 'grade_adjusted_distance']);
        const wattsStreams = [];
        for (const activity of runs) {
            const streams = actStreams.get(activity.pk);
            const gap = streams.grade_adjusted_distance;
            if (!gap) {
                continue;
            }
            const weight = athlete.getWeightAt(activity.get('ts'));
            if (!weight) {
                activity.setSyncError(manifest, new Error("no-weight"));
                continue;
            }
            try {
                const wattsStream = [0];
                for (let i = 1; i < gap.length; i++) {
                    const dist = gap[i] - gap[i - 1];
                    const time = streams.time[i] - streams.time[i - 1];
                    const kj = sauce.pace.work(weight, dist);
                    wattsStream.push(kj * 1000 / time);
                }
                wattsStreams.push({
                    activity: activity.pk,
                    athlete: athlete.pk,
                    stream: 'watts_calc',
                    data: wattsStream
                });
            } catch(e) {
                console.warn("Failed to create active stream for: " + activity);
                activity.setSyncError(manifest, e);
                continue;
            }
        }
        await streamsStore.putMany(wattsStreams);
    }


    async function activityStatsProcessor({manifest, activities, athlete}) {
        const actStreams = await getActivitiesStreams(activities,
            ['time', 'heartrate', 'active', 'watts', 'watts_calc']);
        const hrZones = athlete.get('hrZones');
        const ltHR = hrZones && (hrZones.z4 + hrZones.z3) / 2;
        const maxHR = hrZones && sauce.perf.estimateMaxHR(hrZones);
        for (const activity of activities) {
            const ftp = athlete.getFTPAt(activity.get('ts'));
            const streams = actStreams.get(activity.pk);
            const stats = {};
            if (streams.heartrate) {
                if (hrZones) {
                    try {
                        const restingHR = ftp ? sauce.perf.estimateRestingHR(ftp) : 60;
                        stats.tTss = sauce.perf.tTSS(streams.heartrate, streams.time, streams.active,
                            ltHR, restingHR, maxHR, athlete.get('gender'));
                    } catch(e) {
                        activity.setSyncError(manifest, e);
                        continue;
                    }
                }
            }
            if (ftp && (streams.watts || streams.watts_calc)) {
                try {
                    const corrected = sauce.power.correctedPower(streams.time, streams.watts || streams.watts_calc);
                    if (!corrected) {
                        continue;
                    }
                    stats.activeTime = sauce.data.activeTime(streams.time, streams.active);
                    stats.kj = corrected.kj();
                    stats.power = stats.kj * 1000 / stats.activeTime;
                    stats.tss = sauce.power.calcTSS(stats.np || stats.power, stats.activeTime, ftp);
                    if (streams.watts || activity.get('basetype') === 'run') {
                        stats.np = corrected.np();
                        stats.xp = corrected.xp();
                    }
                    stats.tss = sauce.power.calcTSS(stats.np || stats.power, stats.activeTime, ftp);
                    stats.intensity = (stats.np || stats.power) / ftp;
                } catch(e) {
                    activity.setSyncError(manifest, e);
                    continue;
                }
            }
            activity.set({stats});
        }
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


    async function sleep(ms) {
        await new Promise(resolve => setTimeout(resolve, ms));
    }


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


    // We must stay within API limits;  Roughly 40/min, 300/hour and 1000/day...
    let streamRateLimiterGroup;
    const getStreamRateLimiterGroup = (function() {
        return function() {
            if (!streamRateLimiterGroup) {
                const g = new jobs.RateLimiterGroup();
                g.push(new SauceRateLimiter('streams-min', {period: (60 + 5) * 1000, limit: 30, spread: true}));
                g.push(new SauceRateLimiter('streams-hour', {period: (3600 + 500) * 1000, limit: 200}));
                g.push(new SauceRateLimiter('streams-day', {period: (86400 + 3600) * 1000, limit: 700}));
                streamRateLimiterGroup = g;
            }
            return streamRateLimiterGroup;
        };
    })();


    async function incrementStreamsUsage() {
        // Used for pages to indicate they used the streams API.  This helps
        // keep us on top of overall stream usage better to avoid throttling.
        const g = getStreamRateLimiterGroup();
        await g.increment();
    }
    sauce.proxy.export(incrementStreamsUsage, {namespace});


    function getBaseType(activity) {
        if (activity.type.match(/Ride/)) {
            return 'ride';
        } else if (activity.type.match(/Run|Hike|Walk/)) {
            return 'run';
        } else if (activity.type.match(/Swim/)) {
            return 'swim';
        }
    }


    async function updateSelfActivities(athlete, options={}) {
        const filteredKeys = [
            'activity_url',
            'activity_url_for_twitter',
            'distance',
            'elapsed_time',
            'elevation_gain',
            'elevation_unit',
            'moving_time',
            'long_unit',
            'short_unit',
            'start_date',
            'start_day',
            'start_time',
            'static_map',
            'twitter_msg',
        ];
        const knownIds = new Set(await actsStore.getForAthlete(athlete, {keys: true}));
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
                    if (!knownIds.has(x.id)) {
                        const record = Object.assign({
                            athlete,
                            ts: x.start_date_local_raw * 1000
                        }, x);
                        record.basetype = getBaseType(record);
                        for (const x of filteredKeys) {
                            delete record[x];
                        }
                        adding.push(record);
                        knownIds.add(x.id);
                    }
                }
            }
            // Don't give up until we've met or exceeded the indicated number of acts.
            // If a user has deleted acts that we previously fetched our count will
            // be higher.  So we also require than the entire work group had no effect
            // before stopping.
            //
            // NOTE: If the user deletes a large number of items we may end up not
            // syncing some activities.  A full resync will be required to recover.
            if (adding.length) {
                await actsStore.putMany(adding);
                console.info(`Found ${adding.length} new activities`);
            } else if (knownIds.size >= total) {
                break;
            }
        }
    }


    async function updatePeerActivities(athlete, options={}) {
        const knownIds = new Set(await actsStore.getForAthlete(athlete, {keys: true}));

        function *yearMonthRange(date) {
            for (let year = date.getUTCFullYear(), month = date.getUTCMonth() + 1;; year--, month=12) {
                for (let m = month; m; m--) {
                    yield [year, m];
                }
            }
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
                'icon-swim': 'swim',
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
                if (dateM) {
                    const isoDate = dateM[1].replace(/ UTC$/, 'Z').replace(/ /, 'T');
                    ts = (new Date(isoDate)).getTime();
                }
                if (!ts) {
                    console.error("Unable to get timestamp from feed entry");
                    debugger;
                    ts = (new Date(`${year}-${month}`)).getTime(); // Just an approximate value for sync.
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
                    console.info(`Found ${adding.length} new activities`);
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

        // Fetch latest activities (or all of them if this is the first time).
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
    }



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

    const extUrl = browser.runtime.getURL('');
    const workerPool = new WorkerPoolExecutor(extUrl + 'src/bg/hist-worker.js');


    async function findPeaks(...args) {
        const s = Date.now();
        const result = await workerPool.exec('findPeaks', ...args);
        console.debug('Done: took', Date.now() - s);
        return result;
    }
    sauce.proxy.export(findPeaks, {namespace});


    async function bulkTSS(...args) {
        const s = Date.now();
        const result = await workerPool.exec('bulkTSS', ...args);
        console.debug('Done: took', Date.now() - s);
        return result;
    }
    sauce.proxy.export(bulkTSS, {namespace});


    // XXX maybe move to analysis page until we figure out the strategy for all
    // historical data.
    async function getSelfFTPHistory() {
        const resp = await fetch("https://www.strava.com/settings/performance");
        const raw = await resp.text();
        const table = [];
        if (raw) {
            const encoded = raw.match(/all_ftps = (\[.*\]);/);
            if (encoded) {
                for (const x of JSON.parse(encoded[1])) {
                    table.push({ts: x.start_date * 1000, value: x.value});
                }
            }
        }
        return table;
    }
    sauce.proxy.export(getSelfFTPHistory, {namespace});


    async function addAthlete({id, ...data}) {
        if (!id || !data.gender || !data.name) {
            throw new TypeError('id, gender and name values are required');
        }
        const athlete = await athletesStore.get(id, {model: true});
        if (athlete) {
            await athlete.save(data);
            return athlete.data;
        } else {
            await athletesStore.put({id, ...data});
            return {id, ...data};
        }
    }
    sauce.proxy.export(addAthlete, {namespace});


    async function getAthlete(id) {
        return await athletesStore.get(id);
    }
    sauce.proxy.export(getAthlete, {namespace});


    async function getEnabledAthletes() {
        return await athletesStore.getEnabled();
    }
    sauce.proxy.export(getEnabledAthletes, {namespace});


    async function getActivitiesForAthlete(athleteId, options={}) {
        return await actsStore.getForAthlete(athleteId, options);
    }
    sauce.proxy.export(getActivitiesForAthlete, {namespace});


    async function enableAthlete(id) {
        if (!id) {
            throw new TypeError('id is required');
        }
        if (!ns.syncManager) {
            throw new Error("Sync Manager is not available");
        }
        await ns.syncManager.enableAthlete(id);
    }
    sauce.proxy.export(enableAthlete, {namespace});


    async function disableAthlete(id) {
        if (!id) {
            throw new TypeError('id is required');
        }
        if (!ns.syncManager) {
            throw new Error("Sync Manager is not available");
        }
        await ns.syncManager.disableAthlete(id);
    }
    sauce.proxy.export(disableAthlete, {namespace});


    async function invalidateSyncState(athleteId, processor, name) {
        if (!athleteId || !processor) {
            throw new TypeError("'athleteId' and 'processor' are required args");
        }
        const athlete = await athletesStore.get(athleteId, {model: true});
        if (athlete.isEnabled() && ns.syncManager) {
            const job = ns.syncManager.activeJobs.get(athleteId);
            if (job) {
                job.cancel();
                await job.wait();
            }
        }
        await actsStore.invalidateForAthleteWithSync(athleteId, processor, name);
        if (athlete.isEnabled() && ns.syncManager) {
            await ns.syncManager.resetAthlete(athleteId);
        }
    }
    sauce.proxy.export(invalidateSyncState, {namespace});


    async function activityCounts(athleteId) {
        const [total, imported, unavailable, processed, unprocessable] = await Promise.all([
            actsStore.countForAthlete(athleteId),
            actsStore.countForAthleteWithSync(athleteId, 'streams'),
            actsStore.countForAthleteWithSync(athleteId, 'streams', {name: 'fetch', error: true}),
            actsStore.countForAthleteWithSync(athleteId, 'local'),
            actsStore.countForAthleteWithSync(athleteId, 'local', {error: true}),
        ]);
        return {
            total,
            imported,
            unavailable,
            processed,
            unprocessable
        };
    }
    sauce.proxy.export(activityCounts, {namespace});


    class SyncJob extends EventTarget {
        constructor(athlete, isSelf) {
            super();
            this.athlete = athlete;
            this.isSelf = isSelf;
            this.status = 'init';
            this._cancelEvent = new locks.Event();
            this._rateLimiters = getStreamRateLimiterGroup();
            this._procQueue = new queues.Queue();
        }

        async wait() {
            await this._runPromise;
        }

        cancel() {
            this._cancelEvent.set();
        }

        cancelled() {
            return this._cancelEvent.isSet();
        }

        run() {
            this._runPromise = this._run();
        }

        async _run() {
            this.status = 'activities-update';
            const updateFn = this.isSelf ? updateSelfActivities : updatePeerActivities;
            await updateFn(this.athlete.pk);
            this.counts = await activityCounts(this.athlete.pk);
            this.status = 'activities-sync';
            try {
                await this._syncData();
            } catch(e) {
                this.status = 'error';
                throw e;
            }
            this.status = 'complete';
        }

        async _syncData() {
            const athleteId = this.athlete.pk;
            const fetchedIds = new Set(await actsStore.getForAthleteWithSync(athleteId, 'streams', {keys: true}));
            const localIds = new Set(await actsStore.getForAthleteWithSync(athleteId, 'local', {keys: true}));
            const unfetched = new Map();
            const unprocessed = new Set();
            const activities = new Map();
            for (const id of await actsStore.getForAthlete(athleteId, {keys: true})) {
                if (!fetchedIds.has(id)) {
                    unfetched.set(id, null);
                    activities.set(id, null);
                } else if (!localIds.has(id)) {
                    unprocessed.add(id);
                    activities.set(id, null);
                }
            }
            for (const a of await actsStore.getMany(Array.from(activities.keys()), {models: true})) {
                activities.set(a.pk, a);
            }
            // After getting all our raw data we need to check that we can sync based on error backoff...
            let deferCount = 0;
            for (const id of unfetched.keys()) {
                const a = activities.get(id);
                if (!a.nextAvailManifest('streams')) {
                    deferCount++;
                    unfetched.delete(id);
                } else {
                    unfetched.set(id, a);
                }
            }
            for (const id of unprocessed) {
                const a = activities.get(id);
                if (!a.nextAvailManifest('local')) {
                    deferCount++;
                } else {
                    this._procQueue.putNoWait(a);
                }
            }
            if (deferCount) {
                console.warn(`Deferring sync of ${deferCount} activities due to error`);
            }
            const workers = [];
            if (unfetched.size) {
                workers.push(this._fetchStreamsWorker([...unfetched.values()]));
            } else if (!this._procQueue.qsize()) {
                console.debug("No activity sync required for: " + this.athlete);
                return;
            } else {
                this._procQueue.putNoWait(null);  // sentinel
            }
            workers.push(this._localProcessWorker());
            await Promise.all(workers);
            console.debug("Activity sync completed for: " + this.athlete);
        }

        async _fetchStreamsWorker(...args) {
            try {
                return await this.__fetchStreamsWorker(...args);
            } finally {
                this._procQueue.putNoWait(null);
            }
        }

        async __fetchStreamsWorker(activities) {
            const q = new URLSearchParams();
            const manifest = sauce.hist.db.ActivityModel.getSyncManifest('streams', 'fetch');
            for (const x of manifest.data) {
                q.append('stream_types[]', x);
            }
            for (const activity of activities) {
                let error;
                let data;
                activity.clearSyncState(manifest);
                try {
                    data = await this._fetchStreams(activity, q);
                } catch(e) {
                    console.warn("Fetch streams error (will retry later):", e);
                    error = e;
                }
                if (this._cancelEvent.isSet()) {
                    console.info('Sync streams cancelled');
                    return;
                }
                if (data) {
                    await streamsStore.putMany(Object.entries(data).map(([stream, data]) => ({
                        activity: activity.pk,
                        athlete: this.athlete.pk,
                        stream,
                        data
                    })));
                    activity.setSyncSuccess(manifest);
                    this._procQueue.putNoWait(activity);
                } else if (data === null) {
                    activity.setSyncError(manifest, new Error('no-streams'));
                } else if (error) {
                    // Often this is an activity converted to private.
                    activity.setSyncError(manifest, error);
                }
                await activity.save();
            }
            console.info("Completed streams fetch for: " + this.athlete);
        }

        async _localProcessWorker() {
            let done = false;
            let batchSize = 12;
            while (!done && !this._cancelEvent.isSet()) {
                if (!this._procQueue.qsize()) {
                    await Promise.race([this._procQueue.wait(), this._cancelEvent.wait()]);
                    continue;
                }
                const batch = new Set();
                const wasInErrorState = new Set();
                while (this._procQueue.qsize()) {
                    const a = this._procQueue.getNoWait();
                    if (a === null) {
                        done = true;
                        break;
                    }
                    batch.add(a);
                    if (a.hasAnySyncErrors('local')) {
                        wasInErrorState.add(a);
                    }
                    if (batch.size >= batchSize) {
                        break;
                    }
                }
                batchSize = Math.min(500, batchSize * 1.33);
                while (batch.size && !this._cancelEvent.isSet()) {
                    // Step 1: Group activities by manifest...
                    const manifestBatches = new Map();
                    for (const a of batch) {
                        const m = a.nextAvailManifest('local');
                        if (!m) {
                            debugger;
                            batch.delete(a);
                            continue;
                        }
                        if (!manifestBatches.has(m)) {
                            manifestBatches.set(m, []);
                        }
                        manifestBatches.get(m).push(a);
                        a.clearSyncState(m);
                    }
                    // Step 2: Process each manifest grouping...
                    for (const [m, activities] of manifestBatches.entries()) {
                        const s = Date.now();
                        const fn = m.data;
                        const count = activities.length;
                        try {
                            console.debug(`Local processing (${fn.name}) v${m.version} for ` +
                                          `${count} activities`);
                            await fn({manifest: m, activities, athlete: this.athlete});
                        } catch(e) {
                            console.warn(`Top level local processing error (${fn.name}) ` +
                                         `v${m.version} for ${count} activities`);
                            for (const a of activities) {
                                a.setSyncError(m, e);
                            }
                        }
                        // NOTE: The processor is free to use setSyncError(), but we really can't
                        // trust them to consistently use setSyncSuccess().  Failing to do so would
                        // be a disaster, so we handle that here.  The model is: Optionally tag the
                        // activity as having a sync error otherwise we assume it worked or does
                        // not need further processing, so mark it as done (success).
                        for (const a of activities) {
                            if (!a.hasSyncError(m)) {
                                a.setSyncSuccess(m);
                            }
                        }
                        await actsStore.saveModels(activities);
                        const elapsed = Date.now() - s;
                        console.info(`${fn.name} ${Math.round(elapsed / count)}ms / activity, ` +
                                     `${count} activities`);
                    }
                    // Step 3: Perform accounting and consolidation...
                    const lastBatchSize = batch.size;
                    for (const a of batch) {
                        const m = a.nextAvailManifest('local');
                        if (!m) {
                            // Activity is done...
                            if (a.isSyncComplete('local')) {
                                // Finished successfully.
                                this.counts.processed++;
                                if (wasInErrorState.has(a)) {
                                    this.counts.unprocessable--;
                                }
                            } else {
                                // Finished with error.
                                if (!a.hasAnySyncErrors('local')) {
                                    // XXX remove once validated..
                                    throw new Error("NOPE should for sure have errors if isSyncComplete is empty");
                                }
                                if (!wasInErrorState.has(a)) {
                                    this.counts.unprocessable++;
                                }
                            }
                            batch.delete(a);
                        }
                    }
                    // Step 4: Conditionally notify listeners of any progress...
                    if (batch.size !== lastBatchSize) {
                        const ev = new Event('progress');
                        ev.data = {counts: this.counts};
                        this.dispatchEvent(ev);
                    }
                }
            }
        }

        async _fetchStreams(activity, q) {
            for (let i = 1;; i++) {
                await Promise.race([this._rateLimiters.wait(), this._cancelEvent.wait()]);
                if (this._cancelEvent.isSet()) {
                    return;
                }
                console.group(`Fetching streams for: ${activity.pk} ${new Date(activity.get('ts'))}`);
                for (const x of this._rateLimiters) {
                    console.debug('' + x);
                }
                console.groupEnd();
                try {
                    const resp = await retryFetch(`/activities/${activity.pk}/streams?${q}`);
                    return await resp.json();
                } catch(e) {
                    if (!e.resp) {
                        throw e;
                    } else if (e.resp.status === 404) {
                        return null;
                    } else if (e.resp.status === 429) {
                        const delay = 60000 * i;
                        console.warn(`Hit Throttle Limits: Delaying next request for ${Math.round(delay / 1000)}s`);
                        await Promise.race([sleep(delay), this._cancelEvent.wait()]);
                        if (this._cancelEvent.isSet()) {
                            return;
                        }
                        console.info("Resuming after throttle period");
                        continue;
                    } else {
                        throw e;
                    }
                }
            }
        }
    }


    class SyncManager extends EventTarget {
        constructor(currentUser) {
            super();
            console.info(`Starting Sync Manager for:`, currentUser);
            this.refreshInterval = 6 * 3600 * 1000;
            this.refreshErrorBackoff = 1 * 3600 * 1000;
            this.currentUser = currentUser;
            this.activeJobs = new Map();
            this._stopping = false;
            this._athleteLock = new locks.Lock();
            this._refreshRequests = new Set();
            this._refreshEvent = new locks.Event();
            this._refreshLoop = this.refreshLoop();
        }

        stop() {
            this._stopping = true;
            for (const x of this.activeJobs.values()) {
                x.cancel();
            }
            this._refreshEvent.set();
        }

        async join() {
            await Promise.allSettled(Array.from(this.activeJobs.values()).map(x => x.wait()));
            await this._refreshLoop;
        }

        async refreshLoop() {
            let errorBackoff = 1000;
            while (!this._stopping) {
                try {
                    await this._refresh();
                } catch(e) {
                    console.error('SyncManager refresh error:', e);
                    sauce.report.error(e);
                    await sleep(errorBackoff *= 1.5);
                }
                this._refreshEvent.clear();
                const enabledAthletes = await athletesStore.getEnabled({models: true});
                if (!enabledAthletes.length) {
                    console.debug('No athletes enabled for sync.');
                    await this._refreshEvent.wait();
                } else {
                    let oldest = -1;
                    const now = Date.now();
                    for (const athlete of enabledAthletes) {
                        if (this.isActiveSync(athlete) || this._isDeferred(athlete)) {
                            continue;
                        }
                        const age = now - athlete.get('lastSync');
                        oldest = Math.max(age, oldest);
                    }
                    if (oldest === -1) {
                        await this._refreshEvent.wait();
                    } else {
                        const deadline = this.refreshInterval - oldest;
                        console.debug(`Next Sync Manager refresh in ${Math.round(deadline / 1000)} seconds`);
                        await Promise.race([sleep(deadline), this._refreshEvent.wait()]);
                    }
                }
            }
        }

        async _refresh() {
            for (const athlete of await athletesStore.getEnabled({models: true})) {
                if (this.isActiveSync(athlete)) {
                    continue;
                }
                const now = Date.now();
                if ((now - athlete.get('lastSync') > this.refreshInterval && !this._isDeferred(athlete)) ||
                    this._refreshRequests.has(athlete.pk)) {
                    this._refreshRequests.delete(athlete.pk);
                    this.runSyncJob(athlete);  // bg okay
                }
            }
        }

        isActiveSync(athlete) {
            return this.activeJobs.has(athlete.pk);
        }

        _isDeferred(athlete) {
            const lastError = athlete.get('lastError');
            return !!lastError && Date.now() - lastError < this.refreshErrorBackoff;
        }

        async runSyncJob(athlete) {
            const start = Date.now();
            console.debug('Starting sync job for: ' + athlete);
            const athleteId = athlete.pk;
            const isSelf = this.currentUser === athleteId;
            const syncJob = new SyncJob(athlete, isSelf);
            syncJob.addEventListener('progress', ev => this.emitForAthlete(athlete, 'progress', ev.data));
            this.emitForAthlete(athlete, 'start');
            this.activeJobs.set(athleteId, syncJob);
            syncJob.run();
            try {
                await syncJob.wait();
            } catch(e) {
                console.error('Sync error occurred:', e);
                athlete.set('lastError', Date.now());
                this.emitForAthlete(athlete, 'error', syncJob.status);
            } finally {
                athlete.set('lastSync', Date.now());
                await this._athleteLock.acquire();
                try {
                    await athlete.save();
                } finally {
                    this._athleteLock.release();
                }
                this.activeJobs.delete(athleteId);
                this._refreshEvent.set();
                this.emitForAthlete(athlete, 'stop', syncJob.status);
                console.debug(`Sync completed in ${Date.now() - start}ms for: ` + athlete);
            }
        }

        emitForAthlete(athlete, ...args) {
            return this.emitForAthleteId(athlete.pk, ...args);
        }

        emitForAthleteId(athleteId, name, data) {
            const ev = new Event(name);
            ev.athlete = athleteId,
            ev.data = data;
            this.dispatchEvent(ev);
        }

        refreshRequest(athleteId) {
            this._refreshRequests.add(athleteId);
            this._refreshEvent.set();
        }

        async updateAthlete(id, obj) {
            await this._athleteLock.acquire();
            try {
                const athlete = await athletesStore.get(id, {model: true});
                if (!athlete) {
                    throw new Error('Athlete not found: ' + id);
                }
                await athlete.save(obj);
            } finally {
                this._athleteLock.release();
            }
        }

        async resetAthlete(id) {
            await this.updateAthlete(id, {lastSync: 0, lastError: 0});
            this._refreshEvent.set();
        }

        async enableAthlete(id) {
            await this.updateAthlete(id, {sync: DBTrue, lastSync: 0, lastError: 0});
            this._refreshEvent.set();
            this.emitForAthleteId(id, 'enable');
        }

        async disableAthlete(id) {
            await this.updateAthlete(id, {sync: DBFalse});
            if (this.activeJobs.has(id)) {
                const syncJob = this.activeJobs.get(id);
                syncJob.cancel();
            }
            this._refreshEvent.set();
            this.emitForAthleteId(id, 'disable');
        }

        async purgeAthleteData(athlete) {
            // Obviously use with extreme caution!
            await actsStore.deleteForAthlete(athlete);
        }
    }


    class SyncController extends sauce.proxy.Eventing {
        constructor(athleteId) {
            super();
            this.athleteId = athleteId;
            this._syncListeners = [];
            this._setupEventRelay('start');
            this._setupEventRelay('stop');
            this._setupEventRelay('progress');
            this._setupEventRelay('enable');
            this._setupEventRelay('disable');
        }

        delete() {
            for (const [name, listener] of this._syncListeners) {
                const sm = ns.syncManager;
                if (sm) {
                    sm.removeEventListener(name, listener);
                }
            }
            this._syncListeners.length = 0;
        }

        _setupEventRelay(name) {
            const listener = ev => {
                if (ev.athlete === this.athleteId) {
                    this.dispatchEvent(ev);
                }
            };
            ns.syncManager.addEventListener(name, listener);
            this._syncListeners.push([name, listener]);
        }

        isActiveSync() {
            return !!(ns.syncManager && ns.syncManager.activeJobs.has(this.athleteId));
        }

        async start() {
            if (!ns.syncManager) {
                throw new Error("Sync Manager is not available");
            }
            await ns.syncManager.enableAthlete(this. athleteId);
        }

        async cancel() {
            if (ns.syncManager) {
                const job = ns.syncManager.activeJobs.get(this.athleteId);
                if (job) {
                    job.cancel();
                    await job.wait();
                    return true;
                }
            }
        }

        rateLimiterResumes() {
            const g = streamRateLimiterGroup;
            if (g && g.sleeping()) {
                return streamRateLimiterGroup.resumes();
            }
        }

        rateLimiterSleeping() {
            const g = streamRateLimiterGroup;
            return g && g.sleeping();
        }

        async lastSync() {
            return (await athletesStore.get(this.athleteId)).lastSync;
        }

        async nextSync() {
            return ns.syncManager.refreshInterval + await this.lastSync();
        }
    }
    sauce.proxy.export(SyncController, {namespace});


    class DataExchange extends sauce.proxy.Eventing {
        constructor(athleteId) {
            super();
            this.athleteId = athleteId;
            this.importing = {};
        }

        async export() {
            const entriesPerEvent = 500;  // Stay within String limits
            let batch = [];
            const dispatch = () => {
                while (batch.length) {
                    const ev = new Event('data');
                    ev.data = batch.splice(0, entriesPerEvent);
                    this.dispatchEvent(ev);
                }
            };
            if (this.athleteId) {
                batch.push({store: 'athletes', data: await athletesStore.get(this.athleteId)});
            } else {
                for (const data of await athletesStore.getAll()) {
                    batch.push({store: 'athletes', data});
                }
            }
            const pendingActStreams = [];
            const actsIter = this.athleteId ? actsStore.getForAthlete(this.athleteId) : actsStore.getAll();
            for (const activity of await actsIter) {
                batch.push({store: 'activities', data: activity});
                pendingActStreams.push(activity.id);
                if (pendingActStreams.length >= entriesPerEvent) {
                    const streams = await streamsStore.getMany(pendingActStreams, {index: 'activity'});
                    for (const data of streams) {
                        batch.push({store: 'streams', data});
                    }
                    pendingActStreams.length = 0;
                }
                if (batch.length >= entriesPerEvent) {
                    dispatch();
                }
            }
            if (pendingActStreams.length) {
                const streams = await streamsStore.getMany(pendingActStreams, {index: 'activity'});
                for (const data of streams) {
                    batch.push({store: 'streams', data});
                }
            }
            if (batch.length) {
                dispatch();
            }
        }

        async import(data) {
            for (const x of data) {
                if (!this.importing[x.store]) {
                    this.importing[x.store] = [];
                }
                this.importing[x.store].push(x.data);
            }
            const size = sauce.data.sum(Object.values(this.importing).map(x => x.length));
            if (size > 1000) {
                await this.flush();
            }
        }

        async flush() {
            if (this.importing.athletes) {
                await athletesStore.putMany(this.importing.athletes.splice(0, Infinity));
            }
            if (this.importing.activities) {
                await actsStore.putMany(this.importing.activities.splice(0, Infinity));
            }
            if (this.importing.streams) {
                await streamsStore.putMany(this.importing.streams.splice(0, Infinity));
            }
        }
    }
    sauce.proxy.export(DataExchange, {namespace});


    if (self.currentUser) {
        ns.syncManager = new SyncManager(self.currentUser);
    }
    addEventListener('currentUserUpdate', async ev => {
        if (ns.syncManager && ns.syncManager.currentUser !== ev.id) {
            console.warn("Stopping Sync Manager due to user change...");
            ns.syncManager.stop();
            await ns.syncManager.join();
            console.debug("Sync Manager stopped.");
        }
        ns.syncManager = ev.id ? new SyncManager(ev.id) : null;
    });


    return {
        invalidateSyncState,
        findPeaks,
        bulkTSS,
        streamsStore,
        actsStore,
        athletesStore,
        activityCounts,
        SyncManager,
    };
}, {hasAsyncExports: true});
