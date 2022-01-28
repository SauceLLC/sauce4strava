/* global sauce */

import * as jobs from '/lib/jscoop/jobs.mjs';
import * as queues from '/lib/jscoop/queues.mjs';
import * as locks from '/lib/jscoop/locks.mjs';
import * as processors from '/src/bg/hist/processors.mjs';

const {
    ActivitiesStore,
    StreamsStore,
    AthletesStore,
    PeaksStore,
    ActivityModel
} = sauce.hist.db;


const activityListVersion = 2;  // Increment to force full update of activities.
const namespace = 'hist';
const DBTrue = 1;
const DBFalse = 0;
const sleep = sauce.sleep;
let syncManager;


export const actsStore = ActivitiesStore.singleton();
export const streamsStore = StreamsStore.singleton();
export const athletesStore = AthletesStore.singleton();
export const peaksStore = PeaksStore.singleton();


function issubclass(A, B) {
    return A && B && (A.prototype instanceof B || A === B);
}


ActivityModel.addSyncManifest({
    processor: 'streams',
    name: 'fetch',
    version: 1,
    errorBackoff: 8 * 3600 * 1000,
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

ActivityModel.addSyncManifest({
    processor: 'local',
    name: 'athlete-settings',
    version: 2,
    data: {processor: processors.athleteSettingsProcessor}
});

ActivityModel.addSyncManifest({
    processor: 'local',
    name: 'extra-streams',
    version: 3, // Updated active AND run powers (again)
    data: {processor: processors.extraStreamsProcessor}
});

ActivityModel.addSyncManifest({
    processor: 'local',
    name: 'run-power',
    version: 1,
    depends: ['extra-streams', 'athlete-settings'],
    data: {processor: processors.runPowerProcessor}
});

ActivityModel.addSyncManifest({
    processor: 'local',
    name: 'activity-stats',
    version: 3,  // add coggan power zones
    depends: ['extra-streams', 'athlete-settings', 'run-power'],
    data: {processor: processors.activityStatsProcessor}
});

ActivityModel.addSyncManifest({
    processor: 'local',
    name: 'peaks',
    version: 11, // provide extra fields for seperate wkg/rank proc
    depends: ['extra-streams'],
    data: {processor: processors.PeaksProcessor}
});

ActivityModel.addSyncManifest({
    processor: 'local',
    name: 'peaks-wkg',
    version: 1,
    depends: ['athlete-settings', 'run-power', 'peaks'],
    data: {processor: processors.peaksWkgProcessor}
});

ActivityModel.addSyncManifest({
    processor: 'local',
    name: 'training-load',
    version: 4,
    depends: ['activity-stats'],
    data: {processor: processors.TrainingLoadProcessor}
});


class FetchError extends Error {
    static fromResp(resp) {
        const msg = `${this.name}: ${resp.url} [${resp.status}]`;
        const instance = new this(msg);
        instance.resp = resp;
        return instance;
    }
}


class Timeout extends Error {}


async function networkOnline(timeout) {
    if (navigator.onLine === undefined || navigator.onLine) {
        return;
    }
    console.debug("Network offline");
    await new Promise((resolve, reject) => {
        let timeoutID;
        const cb = () => {
            if (navigator.onLine) {
                console.debug("Network online");
                if (timeout) {
                    clearTimeout(timeoutID);
                }
                removeEventListener('online', cb);
                resolve();
            }
        };
        addEventListener('online', cb);
        if (timeout) {
            timeoutID = setTimeout(() => {
                console.warn("Timeout waiting for online network");
                removeEventListener('online', cb);
                reject(new Timeout('network offline'));
            }, timeout);
        }
    });
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


const _reported = new Set();
async function reportErrorOnce(e) {
    const key = e.message + e.stack;
    if (_reported.has(key)) {
        return;
    }
    _reported.add(key);
    return await sauce.report.error(e);
}


async function expandPeakActivities(peaks) {
    const activities = await actsStore.getMany(peaks.map(x => x.activity));
    for (let i = 0; i < activities.length; i++) {
        peaks[i].activity = activities[i];
    }
    return peaks;
}


async function _aggregatePeaks(work, options={}) {
    const peaks = [].concat(...await Promise.all(work));
    if (options.expandActivities) {
        await expandPeakActivities(peaks);
    }
    return peaks;
}


async function _makePeaksFilterOptions(options={}) {
    const filter = options.filter;
    if (!filter || filter === 'all') {
        return options;
    }
    const ts = options.filterTS || Date.now();
    const d = sauce.date.toLocaleDayDate(ts);
    let start;
    let end;
    if (filter === 'year') {
        start = d.setMonth(0, 1);
        end = d.setMonth(12, 1);
    } else if (!isNaN(filter)) {
        end = +sauce.date.dayAfter(d);
        start = +sauce.date.adjacentDay(d, -Number(filter));
    } else {
        throw new TypeError('Invalid Filter');
    }
    return {start, end, excludeUpper: true, ...options};
}


export async function getPeaksForAthlete(athleteId, type, periods, options={}) {
    periods = Array.isArray(periods) ? periods : [periods];
    options = await _makePeaksFilterOptions(options);
    return await _aggregatePeaks(periods.map(x =>
        peaksStore.getForAthlete(athleteId, type, x, options)), options);
}
sauce.proxy.export(getPeaksForAthlete, {namespace});


export async function getPeaksFor(type, periods, options={}) {
    periods = Array.isArray(periods) ? periods : [periods];
    options = await _makePeaksFilterOptions(options);
    return await _aggregatePeaks(periods.map(x =>
        peaksStore.getFor(type, x, options)), options);
}
sauce.proxy.export(getPeaksFor, {namespace});


export async function getPeaksRelatedToActivityId(activityId, ...args) {
    const activity = await actsStore.get(activityId);
    return activity ? await getPeaksRelatedToActivity(activity, ...args) : null;
}
sauce.proxy.export(getPeaksRelatedToActivityId, {namespace});


export async function getPeaksRelatedToActivity(activity, type, periods, options={}) {
    periods = Array.isArray(periods) ? periods : [periods];
    options = await _makePeaksFilterOptions({filterTS: activity.ts, ...options});
    const results = [];
    for (const period of periods) {
        const peaks = await peaksStore.getForAthlete(activity.athlete, type, period,
            {...options, limit: undefined, expandActivities: false});
        if (options.limit) {
            const index = peaks.findIndex(x => x.activity === activity.id);
            if (index < options.limit - 1) {
                peaks.length = Math.min(options.limit, peaks.length);
            } else {
                const mid = options.limit / 2;
                peaks.splice(mid, Math.round(index - (mid * 1.5)));
                peaks.length = options.limit;
            }
        }
        results.push(peaks);
    }
    const aggregated = [].concat(...results);
    if (options.expandActivities) {
        return await expandPeakActivities(aggregated);
    } else {
        return aggregated;
    }
}
sauce.proxy.export(getPeaksRelatedToActivity, {namespace});


export async function getPeaksForActivityId(activityId, options={}) {
    return await peaksStore.getForActivity(activityId, options);
}
sauce.proxy.export(getPeaksForActivityId, {namespace});


export async function deletePeaksForActivity(activityId) {
    await peaksStore.deleteForActivity(activityId);
}
sauce.proxy.export(deletePeaksForActivity, {namespace});


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
    if (!id || !data.name) {
        throw new TypeError('id and name values are required');
    }
    const athlete = await athletesStore.get(id, {model: true});
    if (!data.ftpHistory && (!athlete || !athlete.get('ftpHistory'))) {
        if (id === self.currentUser) {
            data.ftpHistory = await getSelfFTPHistory();
        } else {
            const ftp = (await sauce.storage.getAthleteProp(id, 'ftp_override')) ||
                        (await sauce.storage.getAthleteProp(id, 'ftp_lastknown'));
            if (ftp) {
                data.ftpHistory = [{ts: Date.now(), value: ftp}];
            }
        }
    }
    if (!data.weightHistory && (!athlete || !athlete.get('weightHistory'))) {
        const w = (await sauce.storage.getAthleteProp(id, 'weight_override')) ||
                  (await sauce.storage.getAthleteProp(id, 'weight_lastknown'));
        if (w) {
            data.weightHistory = [{ts: Date.now(), value: w}];
        }
    }
    if (athlete) {
        await athlete.save(data);
        return athlete.data;
    } else {
        await athletesStore.put({id, ...data});
        return {id, ...data};
    }
}
sauce.proxy.export(addAthlete, {namespace});


export async function getAthlete(id) {
    return await athletesStore.get(id);
}
sauce.proxy.export(getAthlete, {namespace});


export async function getEnabledAthletes() {
    const athletes = await athletesStore.getEnabled();
    athletes.sort((a, b) => {
        // Current user always first, then alphanumeric name.
        const an = a.name && a.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        const bn = b.name && b.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        return a.id === self.currentUser ? -1 : (an < bn && b.id !== self.currentUser) ? -1 : 1;
    });
    return athletes;
}
sauce.proxy.export(getEnabledAthletes, {namespace});


async function getActivitiesForAthlete(athleteId, options={}) {
    if (options.includeTrainingLoadSeed) {
        const activities = [];
        const start = options.start;
        const startDay = sauce.date.toLocaleDayDate(start);
        let atl = 0;
        let ctl = 0;
        for await (const a of actsStore.byAthlete(athleteId,
            {...options, direction: 'prev', start: undefined})) {
            if (a.ts > start) {
                activities.push(a);
            } else if (a.ts < startDay && a.training) {
                const seedDay = sauce.date.toLocaleDayDate(a.ts);
                const zeros = [...sauce.date.dayRange(seedDay, startDay)].map(() => 0);
                zeros.pop();  // Exclude seed day.
                atl = a.training.atl || 0;
                ctl = a.training.ctl || 0;
                if (zeros.length) {
                    atl = sauce.perf.calcATL(zeros, atl);
                    ctl = sauce.perf.calcCTL(zeros, ctl);
                }
                break;
            }
        }
        if (activities.length) {
            activities[activities.length - 1].trainingLoadSeed = {
                atl,
                ctl,
            };
            activities.reverse();
        }
        return activities;
    } else if (options.limit) {
        const activities = [];
        for await (const a of actsStore.byAthlete(athleteId, options)) {
            activities.push(a);
        }
        return activities;
    } else {
        return await actsStore.getAllForAthlete(athleteId, options);
    }
}
sauce.proxy.export(getActivitiesForAthlete, {namespace});


async function getNewestActivityForAthlete(athleteId, options) {
    return await actsStore.getNewestForAthlete(athleteId, options);
}
sauce.proxy.export(getNewestActivityForAthlete, {namespace});


async function getOldestActivityForAthlete(athleteId, options) {
    return await actsStore.getOldestForAthlete(athleteId, options);
}
sauce.proxy.export(getOldestActivityForAthlete, {namespace});


export async function getActivitySiblings(activityId, options={}) {
    const siblings = [];
    for await (const x of actsStore.siblings(activityId, options)) {
        siblings.push(x);
    }
    return siblings;
}
sauce.proxy.export(getActivitySiblings, {namespace});


export async function getActivity(id) {
    return await actsStore.get(id);
}
sauce.proxy.export(getActivity, {namespace});


export function getActivitySyncManifests(processor) {
    return ActivityModel.getSyncManifests(processor);
}
sauce.proxy.export(getActivitySyncManifests, {namespace});


export async function updateActivity(id, updates) {
    return await actsStore.update(id, updates);
}
sauce.proxy.export(updateActivity, {namespace});


async function updateActivities(updates) {
    const updateMap = new Map(Object.entries(updates).map(([id, data]) => [Number(id), data]));
    await actsStore.updateMany(updateMap);
}
sauce.proxy.export(updateActivities, {namespace});


export async function deleteActivity(id) {
    await actsStore.delete(id);
    await streamsStore.delete(id, {index: 'activity'});
    await peaksStore.delete(id, {index: 'activity'});
}
sauce.proxy.export(deleteActivity, {namespace});


export async function enableAthlete(id) {
    return await syncManager.enableAthlete(id);
}
sauce.proxy.export(enableAthlete, {namespace});


export async function updateAthlete(id, updates) {
    return await syncManager.updateAthlete(id, updates);
}
sauce.proxy.export(updateAthlete, {namespace});


async function setAthleteHistoryValues(athleteId, key, data, options={}) {
    const athlete = await athletesStore.get(athleteId, {model: true});
    if (!athlete) {
        throw new Error('Athlete not found: ' + athleteId);
    }
    const clean = athlete.setHistoryValues(key, data);
    await athlete.save();
    if (!options.disableSync) {
        await invalidateAthleteSyncState(athleteId, 'local', 'athlete-settings');
    }
    return clean;
}
sauce.proxy.export(setAthleteHistoryValues, {namespace});


export async function disableAthlete(id) {
    return await syncManager.disableAthlete(id);
}
sauce.proxy.export(disableAthlete, {namespace});


async function syncAthlete(athleteId, options={}) {
    let syncDone;
    if (options.wait) {
        syncDone = new Promise((resolve, reject) => {
            const onSyncActive = ev => {
                if (ev.athlete === athleteId && ev.data.active === false) {
                    syncManager.removeEventListener('active', onSyncActive);
                    resolve();
                }
            };
            syncManager.addEventListener('active', onSyncActive);
            syncManager.addEventListener('error', ev => reject(new Error(ev.data.error)));
        });
    }
    syncManager.refreshRequest(athleteId, options);
    await syncDone;
}
sauce.proxy.export(syncAthlete, {namespace});


export async function integrityCheck(athleteId, options={}) {
    const haveStreamsFor = new Set();
    const missingStreamsFor = [];
    const inFalseErrorState = [];
    for await (const [id] of streamsStore.byAthlete(athleteId, 'time', {keys: true})) {
        haveStreamsFor.add(id);
    }
    const streamManifest = ActivityModel.getSyncManifest('streams', 'fetch');
    const activities = new Map((await actsStore.getAllForAthlete(athleteId, {models: true}))
        .map(x => [x.pk, x]));
    for (const a of activities.values()) {
        if (haveStreamsFor.has(a.pk)) {
            if (a.hasAnySyncErrors('streams')) {
                inFalseErrorState.push(a.pk);
            }
            haveStreamsFor.delete(a.pk);
        } else {
            if (a.hasSyncSuccess(streamManifest)) {
                missingStreamsFor.push(a.pk);
            }
        }
    }
    if (options.repair) {
        const localManifests = ActivityModel.getSyncManifests('local');
        for (const id of missingStreamsFor) {
            console.warn('Repairing activity with missing streams:', id);
            const a = activities.get(id);
            a.clearSyncState(streamManifest);
            for (const m of localManifests) {
                a.clearSyncState(m);
            }
            await a.save();
        }
        for (const id of inFalseErrorState) {
            console.warn('Repairing activity with false-error state:', id);
            const a = activities.get(id);
            a.setSyncSuccess(streamManifest);
            for (const m of localManifests) {
                a.clearSyncState(m);
            }
            await a.save();
        }
        for (const id of haveStreamsFor) {
            if (!options.prune) {
                console.warn('Ignoring missing activity repair (use "prune" to override):', id);
            } else {
                console.warn('Removing detached stream for activity:', id);
                await streamsStore.delete(id, {index: 'activity'});
            }
        }
    }
    return {
        missingStreamsFor,
        deteachedStreamsFor: Array.from(haveStreamsFor),
        inFalseErrorState
    };
}
sauce.proxy.export(integrityCheck, {namespace});


export async function danglingAthletes(options={}) {
    const syncDisabledFor = [];
    for (const x of await athletesStore.getAll()) {
        if (!x.sync) {
            syncDisabledFor.push({athlete: x.id, name: x.name});
        }
    }
    let pruned = [];
    if (options.prune) {
        await athletesStore.deleteMany(syncDisabledFor.map(x => x.athlete));
        pruned.push(...syncDisabledFor);
        syncDisabledFor.length = 0;
    }
    return {syncDisabledFor, pruned};
}
sauce.proxy.export(danglingAthletes, {namespace});


export async function danglingActivities(options={}) {
    const athletes = new Map((await athletesStore.getAll()).map(x => [x.id, x]));
    const noAthleteFor = [];
    const syncDisabledFor = [];
    const pruned = [];
    const cOptions = {
        keys: !options.prune,  // key cursor can't delete. :/
        index: 'athlete-ts',
        mode: options.prune ? 'readwrite' : 'readonly',
        _willInvalidateCaches: options.prune,
    };
    try {
        for await (const c of actsStore._cursor(null, cOptions)) {
            const athleteId = c.key[0];
            if (!athletes.has(athleteId)) {
                if (options.prune) {
                    c.delete();
                    pruned.push(c.primaryKey);
                } else {
                    noAthleteFor.push(c.primaryKey);
                }
            } else if (!athletes.get(athleteId).sync) {
                if (options.prune) {
                    c.delete();
                    pruned.push(c.primaryKey);
                } else {
                    syncDisabledFor.push(c.primaryKey);
                }
            }
        }
    } finally {
        if (options.prune) {
            streamsStore.invalidateCaches();
        }
    }
    return {noAthleteFor, syncDisabledFor, pruned};
}
sauce.proxy.export(danglingActivities, {namespace});


export async function danglingStreams(options={}) {
    const athletes = new Map((await athletesStore.getAll()).map(x => [x.id, x]));
    const activities = new Set(await actsStore.getAllKeys());
    const noActivityFor = [];
    const noAthleteFor = [];
    const syncDisabledFor = [];
    const pruned = [];
    const cOptions = {
        keys: !options.prune,  // key cursor can't delete. :/
        index: 'athlete',
        mode: options.prune ? 'readwrite' : 'readonly',
        _willInvalidateCaches: options.prune,
    };
    try {
        for await (const c of streamsStore._cursor(null, cOptions)) {
            const [activity, stream] = c.primaryKey;
            const athlete = c.key;
            if (!activities.has(activity)) {
                if (options.prune) {
                    c.delete();
                    pruned.push({activity, stream, athlete});
                } else {
                    noActivityFor.push({activity, stream, athlete});
                }
            } else if (!athletes.has(athlete)) {
                if (options.prune) {
                    c.delete();
                    pruned.push({activity, stream, athlete});
                } else {
                    noAthleteFor.push({activity, stream, athlete});
                }
            } else if (!athletes.get(athlete).sync) {
                if (options.prune) {
                    c.delete();
                    pruned.push({activity, stream, athlete});
                } else {
                    syncDisabledFor.push({activity, stream, athlete});
                }
            }
        }
    } finally {
        if (options.prune) {
            streamsStore.invalidateCaches();
        }
    }
    return {noActivityFor, noAthleteFor, syncDisabledFor, pruned};
}
sauce.proxy.export(danglingStreams, {namespace});


export async function danglingPeaks(options={}) {
    const athletes = new Map((await athletesStore.getAll()).map(x => [x.id, x]));
    const activities = new Set(await actsStore.getAllKeys());
    const noActivityFor = [];
    const noAthleteFor = [];
    const syncDisabledFor = [];
    const pruned = [];
    const cOptions = {
        keys: !options.prune,  // key cursor can't delete. :/
        index: 'athlete',
        mode: options.prune ? 'readwrite' : 'readonly',
        _willInvalidateCaches: options.prune,
    };
    try {
        for await (const c of peaksStore._cursor(null, cOptions)) {
            const [activity, type, period] = c.primaryKey;
            const athlete = c.key;
            if (!activities.has(activity)) {
                if (options.prune) {
                    c.delete();
                    pruned.push({activity, type, period, athlete});
                } else {
                    noActivityFor.push({activity, type, period, athlete});
                }
            } else if (!athletes.has(athlete)) {
                if (options.prune) {
                    c.delete();
                    pruned.push({activity, type, period, athlete});
                } else {
                    noAthleteFor.push({activity, type, period, athlete});
                }
            } else if (!athletes.get(athlete).sync) {
                if (options.prune) {
                    c.delete();
                    pruned.push({activity, type, period, athlete});
                } else {
                    syncDisabledFor.push({activity, type, period, athlete});
                }
            }
        }
    } finally {
        if (options.prune) {
            streamsStore.invalidateCaches();
        }
    }
    return {noActivityFor, noAthleteFor, syncDisabledFor, pruned};
}
sauce.proxy.export(danglingPeaks, {namespace});


export async function dangling(options={}) {
    return {
        peaks: await danglingPeaks(options),
        streams: await danglingStreams(options),
        activities: await danglingActivities(options),
        athletes: await danglingAthletes(options),
    };
}
sauce.proxy.export(dangling, {namespace});


export async function invalidateAthleteSyncState(athleteId, processor, name, options={}) {
    if (!athleteId || !processor) {
        throw new TypeError("'athleteId' and 'processor' are required args");
    }
    let athlete;
    if (!options.disableSync) {
        athlete = await athletesStore.get(athleteId, {model: true});
        if (athlete.isEnabled() && syncManager) {
            const job = syncManager.activeJobs.get(athleteId);
            if (job) {
                job.cancel();
                await job.wait();
            }
        }
    }
    await actsStore.invalidateForAthleteWithSync(athleteId, processor, name);
    if (!options.disableSync && athlete.isEnabled() && syncManager) {
        await syncAthlete(athleteId, {
            noActivityScan: true,
            noStreamsFetch: processor === 'local',
            ...options
        });
    }
}
sauce.proxy.export(invalidateAthleteSyncState, {namespace});


export async function invalidateSyncState(...args) {
    for (const athlete of await athletesStore.getEnabled()) {
        await invalidateAthleteSyncState(athlete.id, ...args);
    }
}
sauce.proxy.export(invalidateSyncState, {namespace});



export async function invalidateActivitySyncState(activityId, processor, name, options={}) {
    if (!activityId || !processor) {
        throw new TypeError("'activityId' and 'processor' are required args");
    }
    const manifests = ActivityModel.getSyncManifests(processor, name);
    if (!manifests.length) {
        throw new TypeError('Invalid sync processor/name');
    }
    const activity = await actsStore.get(activityId, {model: true});
    let athlete;
    if (!options.disableSync) {
        athlete = await athletesStore.get(activity.get('athlete'), {model: true});
        if (athlete.isEnabled() && syncManager) {
            const job = syncManager.activeJobs.get(athlete.pk);
            if (job) {
                job.cancel();
                await job.wait();
            }
        }
    }
    for (const m of manifests) {
        activity.clearSyncState(m);
    }
    await activity.save();
    if (!options.disableSync && athlete.isEnabled() && syncManager) {
        await syncAthlete(athlete.pk, {
            noActivityScan: true,
            noStreamsFetch: processor === 'local',
            ...options
        });
    }
}
sauce.proxy.export(invalidateActivitySyncState, {namespace});


export async function activityCounts(athleteId, activities) {
    activities = activities || await actsStore.getAllForAthlete(athleteId, {models: true});
    const streamManifests = ActivityModel.getSyncManifests('streams');
    const localManifests = ActivityModel.getSyncManifests('local');
    const total = activities.length;
    let imported = 0;
    let unavailable = 0;
    let processed = 0;
    let unprocessable = 0;
    for (const a of activities) {
        let successes = 0;
        for (const m of streamManifests) {
            if (a.hasSyncError(m)) {
                successes = -1;
                break;
            } else if (a.hasSyncSuccess(m)) {
                successes++;
            }
        }
        if (successes === streamManifests.length) {
            imported++;
        } else {
            if (successes === -1) {
                unavailable++;
            }
            continue;
        }
        successes = 0;
        for (const m of localManifests) {
            if (a.hasSyncError(m)) {
                successes = -1;
                break;
            } else if (a.hasSyncSuccess(m)) {
                successes++;
            }
        }
        if (successes === localManifests.length) {
            processed++;
        } else {
            if (successes === -1) {
                unprocessable++;
            }
        }
    }
    return {
        total,
        imported,
        unavailable,
        processed,
        unprocessable
    };
}
sauce.proxy.export(activityCounts, {namespace});


export async function activityTypeCounts(athleteId, options) {
    return await actsStore.countTypesForAthlete(athleteId, options);
}
sauce.proxy.export(activityTypeCounts, {namespace});


class SyncJob extends EventTarget {
    constructor(athlete, isSelf) {
        super();
        this.athlete = athlete;
        this.isSelf = isSelf;
        this._cancelEvent = new locks.Event();
        this._rateLimiters = getStreamRateLimiterGroup();
        this._procQueue = new queues.Queue();
        this._running = false;
        this.niceSaveActivities = sauce.debounced(this.saveActivities);
        this.niceSendProgressEvent = sauce.debounced(this.sendProgressEvent);
        this.setStatus('init');
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

    run(options) {
        const start = Date.now();
        this.reportEvent('start');
        this._running = true;
        this._runPromise = this._run(options).then(() => {
            const duration = Math.round((Date.now() - start) / 1000);
            this.reportEvent('completed', duration < 5 * 60 ?
                `${Math.round(duration / 60)}-mins` :
                `${(duration / 3600).toFixed(1)}-hours`);
        }).finally(() => this._running = false);
    }

    emit(name, data) {
        const ev = new Event(name);
        ev.data = data;
        this.dispatchEvent(ev);
    }

    reportEvent(action, label, options) {
        sauce.report.event('SyncJob', action, label, {
            nonInteraction: true,
            ...options
        });  // bg okay
    }

    setStatus(status) {
        this.status = status;
        this.emit('status', status);
    }

    isRunning() {
        return !!this._running;
    }

    async _run(options={}) {
        this.setStatus('checking-network');
        await Promise.race([networkOnline(), this._cancelEvent.wait()]);
        if (this._cancelEvent.isSet()) {
            return;
        }
        if (!options.noActivityScan) {
            this.setStatus('activity-scan');
            const updateFn = this.isSelf ? this.updateSelfActivities : this.updatePeerActivities;
            try {
                await updateFn.call(this, {forceUpdate: options.forceActivityUpdate});
            } finally {
                await this.athlete.save({lastSyncActivityListVersion: activityListVersion});
            }
        }
        this.setStatus('data-sync');
        try {
            await this._syncData(options);
        } catch(e) {
            this.setStatus('error');
            throw e;
        }
        this.setStatus('complete');
    }

    async updateSelfActivities(options={}) {
        const forceUpdate = options.forceUpdate;
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
        const knownIds = new Set(forceUpdate ?  [] : await actsStore.getAllKeysForAthlete(this.athlete.pk));
        for (let concurrency = 1, page = 1, pageCount, total;; concurrency = Math.min(concurrency * 2, 25)) {
            const work = new jobs.UnorderedWorkQueue({maxPending: 25});
            for (let i = 0; page === 1 || page <= pageCount && i < concurrency; page++, i++) {
                await work.put((async () => {
                    const q = new URLSearchParams();
                    q.set('new_activity_only', 'false');
                    q.set('page', page);
                    const resp = await this.retryFetch(`/athlete/training_activities?${q}`);
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
                            athlete: this.athlete.pk,
                            ts: (new Date(x.start_time)).getTime()
                        }, x);
                        record.basetype = sauce.model.getActivityBaseType(record.type);
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
                if (forceUpdate) {
                    console.info(`Updating ${adding.length} activities`);
                    await actsStore.updateMany(new Map(adding.map(x => [x.id, x])));
                } else {
                    console.info(`Adding ${adding.length} new activities`);
                    await actsStore.putMany(adding);
                }
            } else if (knownIds.size >= total) {
                break;
            }
        }
    }

    *_yearMonthRange(date) {
        for (let year = date.getUTCFullYear(), month = date.getUTCMonth() + 1;; year--, month=12) {
            for (let m = month; m; m--) {
                yield [year, m];
            }
        }
    }

    async fetchMonth(year, month) {
        // Welcome to hell.  It gets really ugly in here in an effort to avoid
        // any eval usage which is required to render this HTML into a DOM node.
        // So are doing horrible HTML parsing with regexps..
        //
        // Note this code is littered with debugger statements.  All of them are
        // cases I'd like to personally inspect if they happen.
        const q = new URLSearchParams();
        q.set('interval_type', 'month');
        q.set('chart_type', 'hours');
        q.set('year_offset', '0');
        q.set('interval', '' + year +  month.toString().padStart(2, '0'));
        let data;
        try {
            const resp = await this.retryFetch(`/athletes/${this.athlete.pk}/interval?${q}`);
            data = await resp.text();
        } catch(e) {
            // In some cases Strava just returns 500 for a month.  I suspect it's when the only
            // activity data in a month is private, but it's an upstream problem and we need to
            // treat it like an empty response.
            reportErrorOnce(new Error(`Upstream activity fetch error: ${this.athlete.pk} [${q}]`));
            return [];
        }
        const raw = data.match(/jQuery\('#interval-rides'\)\.html\((.*)\)/)[1];
        const batch = [];
        const addEntry = (id, ts, type, name) => {
            if (!id) {
                reportErrorOnce(new Error('Invalid activity id for athlete: ' + this.athlete.pk));
                debugger;
                return;
            }
            let basetype = type && sauce.model.getActivityBaseType(type);
            if (!basetype) {
                reportErrorOnce(new Error('Unknown activity type for: ' + id));
                basetype = 'workout';
                debugger;
            }
            batch.push({
                id,
                ts,
                basetype,
                athlete: this.athlete.pk,
                name
            });
        };
        const frag = document.createElement('div');
        const parseCard = cardHTML => {
            // This is just terrible, but we can't use eval..  Strava does some very particular
            // escaping that mostly has no effect but does break JSON.parse.  Sadly we MUST run
            // JSON.parse to disambiguate the JSON payload and to unescape unicode sequences.
            const isActivity = !!cardHTML.match(/data-react-class=\\"Activity\\"/);
            const isGroupActivity = !!cardHTML.match(/data-react-class=\\"GroupActivity\\"/);
            if (!isActivity && !isGroupActivity) {
                return;
            }
            const props = cardHTML.match(/data-react-props=\\"(.+?)\\"/)[1];
            // Unescapes html entities, ie. "&quot;"
            const htmlEntitiesKey = String.fromCharCode(...[33, 39, 36, 30, 46, 5, 10, 2, 12]
                .map((x, i) => (x ^ i) + 72));
            frag[htmlEntitiesKey] = props;
            const escaped = frag[htmlEntitiesKey]
                .replace(/\\\\/g, '\\')
                .replace(/\\\$/g, '$')
                .replace(/\\`/g, '`');
            const data = JSON.parse(escaped);
            if (isGroupActivity) {
                for (const x of data.rowData.activities.filter(x => x.athlete_id === this.athlete.pk)) {
                    addEntry(x.activity_id, (new Date(x.start_date)).getTime(), x.type, x.name);
                }
            } else {
                const a = data.activity;
                addEntry(Number(a.id), data.cursorData.updated_at * 1000, a.type, a.activityName);
            }
        };
        for (const m of raw.matchAll(/<div class=\\'react-card-container\\'>(.+?)<\\\/div>/g)) {
            try {
                parseCard(m[1]);
            } catch(e) {
                reportErrorOnce(e);
                continue;
            }
        }
        return batch;
    }

    async _batchImport(startDate, knownIds, forceUpdate) {
        const minEmpty = 12;
        const minRedundant = 2;
        const iter = this._yearMonthRange(startDate);
        for (let concurrency = 1;; concurrency = Math.min(25, concurrency * 2)) {
            const work = new jobs.UnorderedWorkQueue({maxPending: 25});
            for (let i = 0; i < concurrency; i++) {
                const [year, month] = iter.next().value;
                await work.put(this.fetchMonth(year, month));
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
                if (forceUpdate) {
                    console.info(`Updating ${adding.length} activities`);
                    await actsStore.updateMany(new Map(adding.map(x => [x.id, x])));
                } else {
                    console.info(`Adding ${adding.length} new activities`);
                    await actsStore.putMany(adding);
                }
            } else if (empty >= minEmpty && empty >= Math.floor(concurrency)) {
                const [year, month] = iter.next().value;
                const date = new Date(`${month === 12 ? year + 1 : year}-${month === 12 ? 1 : month + 1}`);
                await this.athlete.save({activitySentinel: date.getTime()});
                break;
            } else if (redundant >= minRedundant  && redundant >= Math.floor(concurrency)) {
                // Entire work set was redundant.  Don't refetch any more.
                break;
            }
        }
    }

    async updatePeerActivities(options={}) {
        const forceUpdate = options.forceUpdate;
        const knownIds = new Set(forceUpdate
            ? [] : await actsStore.getAllKeysForAthlete(this.athlete.pk));
        await this._batchImport(new Date(), knownIds, forceUpdate);
        const sentinel = await this.athlete.get('activitySentinel');
        if (!sentinel) {
            // We never finished a prior sync so find where we left off..
            const last = await actsStore.getOldestForAthlete(this.athlete.pk);
            await this._batchImport(new Date(last.ts), knownIds, forceUpdate);
        }
    }

    async _syncData(options={}) {
        const activities = await actsStore.getAllForAthlete(this.athlete.pk, {models: true});
        this.allActivities = new Map(activities.map(x => [x.pk, x]));
        const unfetched = [];
        let deferCount = 0;
        const streamManifest = ActivityModel.getSyncManifest('streams', 'fetch');
        for (const a of activities) {
            if (a.isSyncComplete('streams') || a.getSyncError(streamManifest) === 'no-streams') {
                if (!a.isSyncComplete('local')) {
                    if (a.nextAvailManifest('local')) {
                        this._procQueue.putNoWait(a);
                    } else {
                        deferCount++;
                    }
                }
            } else if (a.nextAvailManifest('streams')) {
                if (a.nextAvailManifest('streams')) {
                    unfetched.push(a);
                } else {
                    deferCount++;
                }
            }
        }
        if (deferCount) {
            console.warn(`Deferring sync of ${deferCount} activities due to error`);
        }
        const workers = [];
        if (unfetched.length && !options.noStreamsFetch) {
            workers.push(this._fetchStreamsWorker(unfetched));
        } else if (!this._procQueue.size) {
            console.debug("No activity sync required for: " + this.athlete);
            return;
        } else {
            this._procQueue.putNoWait(null);  // sentinel
        }
        workers.push(this._localProcessWorker());
        await Promise.all(workers);
    }

    async _fetchStreamsWorker(...args) {
        let imported;
        try {
            imported = await this.__fetchStreamsWorker(...args);
        } finally {
            this._procQueue.putNoWait(null);
        }
        if (imported) {
            this.reportEvent('imported', 'streams', {eventValue: imported});
        }
    }

    async __fetchStreamsWorker(activities) {
        activities.sort((a, b) => b.get('ts') - a.get('ts'));  // newest -> oldest
        const q = new URLSearchParams();
        const manifest = ActivityModel.getSyncManifest('streams', 'fetch');
        const localManifests = ActivityModel.getSyncManifests('local');
        for (const x of manifest.data) {
            q.append('stream_types[]', x);
        }
        let count = 0;
        for (const activity of activities) {
            let error;
            let data;
            activity.clearSyncState(manifest);
            for (const m of localManifests) {
                activity.clearSyncState(m);
            }
            try {
                data = await this._fetchStreams(activity, q);
            } catch(e) {
                console.warn("Fetch streams error (will retry later):", e);
                error = e;
            }
            if (this._cancelEvent.isSet()) {
                console.info('Sync streams cancelled');
                return count;
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
                count++;
            } else if (data === null) {
                activity.setSyncError(manifest, new Error('no-streams'));
                this._procQueue.putNoWait(activity);
                count++;
            } else if (error) {
                // Often this is an activity converted to private.
                activity.setSyncError(manifest, error);
            }
            await activity.save();
        }
        console.info("Completed streams fetch for: " + this.athlete);
    }

    async retryFetch(urn, options={}) {
        const maxRetries = 5;
        const headers = options.headers || {};
        headers["x-requested-with"] = "XMLHttpRequest";  // Required for most Strava endpoints
        const url = `https://www.strava.com${urn}`;
        for (let r = 1;; r++) {
            let resp;
            let fetchError;
            await networkOnline(120000);
            try {
                resp = await fetch(url, Object.assign({headers}, options));
            } catch(e) {
                fetchError = e;
            }
            if (resp && resp.ok) {
                return resp;
            }
            if ((!resp || (resp.status >= 500 && resp.status < 600)) && r <= maxRetries) {
                console.info(`Server error for: ${urn} - Retry: ${r}/${maxRetries}`);
                // To avoid triggering Anti-DDoS HTTP Throttling of Extension-Originated Requests
                // perform a cool down before relinquishing control. Ie. do one last sleep.
                // See: http://dev.chromium.org/throttling
                await sleep(1000 * 2 ** r);
                if (r < maxRetries) {
                    continue;
                }
            }
            if (fetchError) {
                throw fetchError;
            } else if (resp.status === 429) {
                const delay = 60000 * r;
                console.warn(`Hit Throttle Limits: Delaying next request for ${Math.round(delay / 1000)}s`);
                await Promise.race([sleep(delay), this._cancelEvent.wait()]);
                if (this._cancelEvent.isSet()) {
                    return;
                }
                console.info("Resuming after throttle period");
                continue;
            } else {
                throw FetchError.fromResp(resp);
            }
        }
    }

    _localSetSyncError(activities, manifest, e) {
        console.warn(`Top level local processing error (${manifest.name}) v${manifest.version}`, e);
        sauce.report.error(e);
        for (const a of activities) {
            a.setSyncError(manifest, e);
        }
    }

    _localSetSyncDone(activities, manifest) {
        // NOTE: The processor is free to use setSyncError(), but we really can't
        // trust them to consistently use setSyncSuccess().  Failing to do so would
        // be a disaster, so we handle that here.  The model is: Optionally tag the
        // activity as having a sync error otherwise we assume it worked or does
        // not need further processing, so mark it as done (success).
        for (const a of activities) {
            if (!a.hasSyncError(manifest)) {
                a.setSyncSuccess(manifest);
            }
        }
    }

    async _localDrainOffloaded(offloaded, batch) {
        for (const proc of Array.from(offloaded)) {
            const m = proc.manifest;
            const finished = proc.getFinished(this.batchLimit - batch.size);
            if (finished.length) {
                const now = Date.now();
                let totTime = 0;
                for (const a of finished) {
                    batch.add(a);
                    totTime += now - a._procStart;
                    delete a._procStart;
                }
                this._localSetSyncDone(finished, m);
                const elapsed = Math.round(totTime / finished.length).toLocaleString();
                const rate = Math.round(finished.length / (totTime / finished.length / 1000)).toLocaleString();
                console.debug(`Proc batch [${m.name}]: ${elapsed}ms (avg), ${finished.length} ` +
                    `activities (${rate}/s)`);
            }
            if (proc.done() && !proc.available) {
                // It is fulfilled but we need to pickup any errors.
                try {
                    await proc;
                    if (proc.pending || proc.available) {
                        throw new Error("Processor prematurely stopped: " + m.name);
                    }
                } catch(e) {
                    const inError = proc.drainAll();
                    this._localSetSyncError(inError, m, e);
                    // Save them since they never re-enter the batch.
                    for (const x of inError) {
                        this.needSave.add(x);
                    }
                } finally {
                    offloaded.delete(proc);
                }
                console.info("Offload processor finished:", m.name);
            }
        }
    }

    async _localProcessWorker() {
        this.batchLimit = 20;
        this.needSave = new Set();
        const done = new Set();
        const batch = new Set();
        const offloaded = new Set();
        const offloadedActive = new Map();
        let procQueue = this._procQueue;
        while ((procQueue || offloaded.size) && !this._cancelEvent.isSet()) {
            const available = [...offloaded].some(x => x.available) || (procQueue && procQueue.size);
            if (!available) {
                const incoming = [this._cancelEvent.wait()];
                if (!procQueue) {
                    // No new incoming data, instruct offload queues to get busy or die..
                    const anyPending = Array.from(offloaded).some(x => x.pending);
                    for (const x of offloaded) {
                        if (!anyPending) {
                            console.info('Requesting offload processor stop:', x.manifest.name);
                            x.stop();
                        } else if (x.pending) {
                            console.debug('Requesting offload processor flush:', x.manifest.name);
                            x.flush();
                        }
                    }
                } else {
                    incoming.push(procQueue.wait());
                }
                const offFinWaiters = Array.from(offloaded).map(x => x.waitFinished());
                try {
                    await Promise.race([...offFinWaiters, ...incoming, ...offloaded]);
                } catch(e) {
                    console.warn('Top level waiter or offloaded processor error');
                    // Offloaded proc error handling still happens next...
                }
                for (const f of offFinWaiters) {
                    if (!f.done()) {
                        f.cancel();
                    }
                }
                if (this._cancelEvent.isSet()) {
                    return;
                }
            }

            await this._localDrainOffloaded(offloaded, batch);

            if (procQueue) {
                while (procQueue.size && batch.size < this.batchLimit) {
                    const a = procQueue.getNoWait();
                    if (a === null) {
                        procQueue = null;
                        break;
                    }
                    batch.add(a);
                }
            }
            this.batchLimit = Math.min(500, Math.ceil(this.batchLimit * 1.8));
            while (batch.size && !this._cancelEvent.isSet()) {
                const manifestBatches = new Map();
                for (const a of batch) {
                    const m = a.nextAvailManifest('local');
                    if (!m) {
                        batch.delete(a);
                        done.add(a);
                        this.needSave.add(a);
                        continue;
                    }
                    if (!manifestBatches.has(m)) {
                        manifestBatches.set(m, []);
                    }
                    const manifestBatch = manifestBatches.get(m);
                    manifestBatch.push(a);
                    a.clearSyncState(m);
                }
                await Promise.all(Array.from(manifestBatches.entries()).map(async ([m, activities]) => {
                    const processor = m.data.processor;
                    const s = Date.now();
                    if (issubclass(processor, processors.OffloadProcessor)) {
                        let proc = offloadedActive.get(processor);
                        if (!proc || proc.stopping) {
                            console.debug("Creating new offload processor:", m.name);
                            proc = new processor({
                                manifest: m,
                                athlete: this.athlete,
                                cancelEvent: this._cancelEvent
                            });
                            offloaded.add(proc);
                            offloadedActive.set(processor, proc);
                            // The processor can remain in the offloaded set until it's fully drained
                            // in the upper queue mgmt section, but we need to remove it from the active
                            // set immediately so we don't requeue data to it.
                            proc.finally(() => {
                                if (offloadedActive.get(processor) === proc) {
                                    offloadedActive.delete(processor);
                                }
                            });
                            proc.start();
                        }
                        await proc.putIncoming(activities);
                        for (const a of activities) {
                            a._procStart = s;
                            batch.delete(a);
                        }
                    } else {
                        try {
                            await processor({
                                manifest: m,
                                activities,
                                athlete: this.athlete,
                                cancelEvent: this._cancelEvent,
                            });
                            this._localSetSyncDone(activities, m);
                        } catch(e) {
                            this._localSetSyncError(activities, m, e);
                        }
                        const elapsed = Math.round((Date.now() - s)).toLocaleString();
                        const rate = Math.round(activities.length / ((Date.now() - s) / 1000)).toLocaleString();
                        console.debug(`Proc batch [${m.name}]: ${elapsed}ms, ${activities.length} ` +
                            `activities (${rate}/s)`);
                    }
                }));

                await this._localDrainOffloaded(offloaded, batch);

                this.niceSaveActivities();
                this.niceSendProgressEvent(done);
            }
        }
        await this.niceSaveActivities();
        await this.niceSendProgressEvent(done);
    }

    async saveActivities() {
        const saving = Array.from(this.needSave);
        this.needSave.clear();
        await actsStore.saveModels(saving);
    }

    async sendProgressEvent(done) {
        const counts = await activityCounts(this.athlete.pk, [...this.allActivities.values()]);
        const progressHash = JSON.stringify(counts);
        if (progressHash === this._lastProgressHash && !done.size) {
            return;
        }
        this._lastProgressHash = progressHash;
        const ev = new Event('progress');
        const d = Array.from(done);
        done.clear();
        ev.data = {
            counts,
            done: {
                count: d.length,
                oldest: d.length ? sauce.data.min(d.map(x => x.get('ts'))) : null,
                newest: d.length ? sauce.data.max(d.map(x => x.get('ts'))) : null,
                ids: d.map(x => x.pk),
            },
        };
        this.dispatchEvent(ev);
    }

    async _fetchStreams(activity, q) {
        for (let i = 1;; i++) {
            const impendingSuspend = this._rateLimiters.willSuspendFor();
            const minRateLimit = 10000;
            if (impendingSuspend > minRateLimit) {
                console.info(`Rate limited for ${Math.round(impendingSuspend / 60 / 1000)} minutes`);
                for (const x of this._rateLimiters) {
                    if (x.willSuspendFor()) {
                        console.debug('' + x);
                    }
                }
                this.emit('ratelimiter', {
                    suspended: true,
                    until: Date.now() + impendingSuspend
                });
            }
            await Promise.race([this._rateLimiters.wait(), this._cancelEvent.wait()]);
            if (this._cancelEvent.isSet()) {
                return;
            }
            if (impendingSuspend > minRateLimit) {
                this.emit('ratelimiter', {suspended: false});
            }
            const localeDate = (new Date(activity.get('ts'))).toLocaleDateString();
            console.debug(`Fetching streams for activity: ${activity.pk} [${localeDate}]`);
            try {
                const resp = await this.retryFetch(`/activities/${activity.pk}/streams?${q}`);
                return await resp.json();
            } catch(e) {
                if (!e.resp) {
                    throw e;
                } else if (e.resp.status === 404) {
                    return null;
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
        this.refreshInterval = 12 * 3600 * 1000;
        this.refreshErrorBackoff = 1 * 3600 * 1000;
        this.syncJobTimeout = 90 * 60 * 1000;
        this.currentUser = currentUser;
        this.activeJobs = new Map();
        this.stopping = false;
        this.stopped = true;
        this._athleteLock = new locks.Lock();
        this._refreshRequests = new Map();
        this._refreshEvent = new locks.Event();
        this._refreshLoop = null;
    }

    async stop() {
        this.stopping = true;
        for (const x of this.activeJobs.values()) {
            x.cancel();
        }
        this._refreshEvent.set();
        await this.join();
        this.stopped = true;
    }

    start() {
        if (!this.stopped || this._refreshLoop) {
            throw new TypeError("Not stopped");
        }
        this.stopped = false;
        this.stopping = false;
        this._refreshLoop = this.refreshLoop();
    }

    async join() {
        await Promise.allSettled(Array.from(this.activeJobs.values()).map(x => x.wait()));
        try {
            await this._refreshLoop;
        } finally {
            this._refreshLoop = null;
        }
    }


    async syncVersionHash() {
        const manifests = [].concat(
            ActivityModel.getSyncManifests('local'),
            ActivityModel.getSyncManifests('streams'));
        const records = [];
        for (const x of manifests) {
            records.push(`${x.processor}-${x.name}-v${x.version}`);
        }
        records.sort();
        const text = new TextEncoder();
        const buf = await crypto.subtle.digest('SHA-256', text.encode(JSON.stringify(records)));
        return Array.from(new Uint8Array(buf)).map(x => x.toString(16).padStart(2, '0')).join('');
    }

    async refreshLoop() {
        let errorBackoff = 1000;
        const syncHash = await this.syncVersionHash();
        while (!this.stopping) {
            try {
                await this._refresh(syncHash);
            } catch(e) {
                sauce.report.error(e);
                await sleep(errorBackoff *= 1.5);
            }
            this._refreshEvent.clear();
            const enabledAthletes = await athletesStore.getEnabled({models: true});
            if (!enabledAthletes.length) {
                console.debug('No athletes enabled for sync.');
                await this._refreshEvent.wait();
            } else {
                let deadline = Infinity;
                for (const athlete of enabledAthletes) {
                    if (this.isActiveSync(athlete)) {
                        continue;
                    }
                    deadline = Math.min(deadline, this.nextSyncDeadline(athlete));
                }
                if (deadline === Infinity) {
                    // All activities are active.
                    await this._refreshEvent.wait();
                } else {
                    const next = Math.round(deadline / 1000 / 60).toLocaleString();
                    console.debug(`Next Sync Manager refresh in ${next} minute(s)`);
                    await Promise.race([sleep(deadline), this._refreshEvent.wait()]);
                }
            }
        }
    }

    async _refresh(syncHash) {
        let delay = 0;
        for (const a of await athletesStore.getEnabled({models: true})) {
            if (this.isActiveSync(a)) {
                continue;
            }
            const forceActivityUpdate = a.get('lastSyncActivityListVersion') !== activityListVersion;
            const requested = this._refreshRequests.has(a.pk);
            const shouldRun =
                requested ||
                a.get('lastSyncVersionHash') !== syncHash ||
                forceActivityUpdate ||
                this.nextSyncDeadline(a) <= 0;
            if (shouldRun) {
                const options = Object.assign({
                    forceActivityUpdate,
                    syncHash,
                    delay: requested ? 0 : delay,
                }, this._refreshRequests.get(a.pk));
                this._refreshRequests.delete(a.pk);
                this.runSyncJob(a, options).catch(sauce.report.error);
                delay = Math.min((delay + 30000) * 1.15, 3600 * 1000);
            }
        }
    }

    isActiveSync(athlete) {
        return this.activeJobs.has(athlete.pk);
    }

    nextSyncDeadline(athlete) {
        const now = Date.now();
        const lastError = athlete.get('lastSyncError');
        const deferred = lastError ? this.refreshErrorBackoff - (now - lastError) : 0;
        const next = this.refreshInterval - (now - athlete.get('lastSync'));
        return Math.max(0, next, deferred);
    }

    async runSyncJob(athlete, options) {
        const athleteId = athlete.pk;
        const isSelf = this.currentUser === athleteId;
        const syncJob = new SyncJob(athlete, isSelf);
        syncJob.addEventListener('status', ev => this.emitForAthlete(athlete, 'status', ev.data));
        syncJob.addEventListener('progress', ev => this.emitForAthlete(athlete, 'progress', ev.data));
        syncJob.addEventListener('ratelimiter', ev => this.emitForAthlete(athlete, 'ratelimiter', ev.data));
        this.emitForAthlete(athlete, 'active', {active: true, athlete: athlete.data});
        this.activeJobs.set(athleteId, syncJob);
        if (options.delay) {
            syncJob.setStatus('deferred');
            console.debug(`Deferring sync job [${Math.round(options.delay / 1000)}s] for: ` + athlete);
            await sauce.sleep(options.delay);
        }
        console.info('Starting sync job for: ' + athlete);
        const start = Date.now();
        syncJob.run(options);
        try {
            await Promise.race([sleep(this.syncJobTimeout), syncJob.wait()]);
        } catch(e) {
            sauce.report.error(e);
            athlete.set('lastSyncError', Date.now());
            this.emitForAthlete(athlete, 'error', {error: e.message});
        } finally {
            if (syncJob.isRunning()) {
                // Timeout hit, just cancel and reschedule soon.  This is a paranoia based
                // protection for future mistakes or edge cases that might lead to a sync
                // job hanging indefinitely.   NOTE: it will be more common that this is
                // triggered by initial sync jobs that hit the large rate limiter delays.
                // There is no issue here since we just reschedule the job in either case.
                console.info('Sync job timeout for: ' + athlete);
                syncJob.cancel();
                await syncJob.wait();
                this._refreshRequests.set(athleteId, {});
            } else {
                const duration = Math.round((Date.now() - start) / 1000).toLocaleString();
                console.info(`Sync completed in ${duration} seconds for: ` + athlete);
                athlete.set('lastSyncVersionHash', options.syncHash);
                athlete.set('lastSync', Date.now());
            }
            await this._athleteLock.acquire();
            try {
                await athlete.save();
            } finally {
                this._athleteLock.release();
            }
            this.activeJobs.delete(athleteId);
            this._refreshEvent.set();
            this.emitForAthlete(athlete, 'active', {active: false, athlete: athlete.data});
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

    refreshRequest(id, options={}) {
        if (!id) {
            throw new TypeError('Athlete ID arg required');
        }
        this._refreshRequests.set(id, options);
        this._refreshEvent.set();
    }

    async updateAthlete(id, obj) {
        if (!id) {
            throw new TypeError('Athlete ID arg required');
        }
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

    async enableAthlete(id) {
        if (!id) {
            throw new TypeError('Athlete ID arg required');
        }
        await this.updateAthlete(id, {
            sync: DBTrue,
            lastSync: 0,
            lastSyncError: 0,
            lastSyncActivityListVersion: null
        });
        this._refreshEvent.set();
        this.emitForAthleteId(id, 'enable');
    }

    async disableAthlete(id) {
        if (!id) {
            throw new TypeError('Athlete ID arg required');
        }
        await this.updateAthlete(id, {sync: DBFalse});
        if (this.activeJobs.has(id)) {
            const syncJob = this.activeJobs.get(id);
            syncJob.cancel();
        }
        this._refreshEvent.set();
        this.emitForAthleteId(id, 'disable');
    }
}


class SyncController extends sauce.proxy.Eventing {
    constructor(athleteId) {
        super();
        this.athleteId = athleteId;
        this._syncListeners = [];
        const activeJob = syncManager && syncManager.activeJobs.get(athleteId);
        this.state = {
            active: !!activeJob,
            status: activeJob && activeJob.status,
            error: null
        };
        this._setupEventRelay('active', ev => {
            this.state.active = ev.data;
            if (this.state.active) {
                this.state.error = null;
            }
        });
        this._setupEventRelay('status', ev => this.state.status = ev.data);
        this._setupEventRelay('error', ev => this.state.error = ev.data.error);
        this._setupEventRelay('enable');
        this._setupEventRelay('disable');
        this._setupEventRelay('progress');
        this._setupEventRelay('ratelimiter');
        this._setupEventRelay('importing-athlete');
    }

    delete() {
        for (const [name, listener] of this._syncListeners) {
            const sm = syncManager;
            if (sm) {
                sm.removeEventListener(name, listener);
            }
        }
        this._syncListeners.length = 0;
    }

    _setupEventRelay(name, internalCallback) {
        const listener = ev => {
            if (ev.athlete === this.athleteId) {
                if (internalCallback) {
                    internalCallback(ev);
                }
                this.dispatchEvent(ev);
            }
        };
        syncManager.addEventListener(name, listener);
        this._syncListeners.push([name, listener]);
    }

    isActiveSync() {
        return !!(syncManager && syncManager.activeJobs.has(this.athleteId));
    }

    async cancel() {
        if (syncManager) {
            const job = syncManager.activeJobs.get(this.athleteId);
            if (job) {
                job.cancel();
                await job.wait();
                return true;
            }
        }
    }

    rateLimiterResumes() {
        if (this.isActiveSync()) {
            const g = streamRateLimiterGroup;
            if (g && g.suspended()) {
                return streamRateLimiterGroup.resumes();
            }
        }
    }

    rateLimiterSuspended() {
        if (this.isActiveSync()) {
            const g = streamRateLimiterGroup;
            return g && g.suspended();
        }
    }

    async lastSync() {
        return (await athletesStore.get(this.athleteId)).lastSync;
    }

    async nextSync() {
        const a = await athletesStore.get(this.athleteId, {model: true});
        return Date.now() + syncManager.nextSyncDeadline(a);
    }

    getState() {
        return this.state;
    }
}
sauce.proxy.export(SyncController, {namespace});


class DataExchange extends sauce.proxy.Eventing {
    constructor(athleteId) {
        super();
        this.athleteId = athleteId;
        this.importing = {};
        this.importedAthletes = new Set();
    }

    async export() {
        // Use a size estimate scheme to try and stay within platform limits.
        let sizeEstimate = 0;
        const sizeLimit = 4 * 1024 * 1024;
        let batch = [];
        const dispatch = () => {
            const ev = new Event('data');
            ev.data = batch.map(JSON.stringify);
            batch.length = 0;
            sizeEstimate = 0;
            this.dispatchEvent(ev);
        };
        if (this.athleteId) {
            batch.push({store: 'athletes', data: await athletesStore.get(this.athleteId)});
            sizeEstimate += 1000;
        } else {
            for (const data of await athletesStore.getAll()) {
                sizeEstimate += 1000;
                batch.push({store: 'athletes', data});
            }
        }
        const actsWork = (async () => {
            const iter = this.athleteId ?
                actsStore.byAthlete(this.athleteId, {_skipCache: true}) :
                actsStore.values(null, {_skipCache: true});
            for await (const data of iter) {
                // We want a clean slate on restore.
                if (data.syncState && data.syncState.local) {
                    delete data.syncState.local;
                }
                batch.push({store: 'activities', data});
                sizeEstimate += 1500;  // Tuned on my data + headroom.
                if (sizeEstimate >= sizeLimit) {
                    dispatch();
                }
            }
        })();
        const streamsWork = (async () => {
            const iter = this.athleteId ?
                streamsStore.byAthlete(this.athleteId, null, {_skipCache: true}) :
                streamsStore.values(null, {_skipCache: true});
            const estSizePerArrayEntry = 6.4;  // Tuned on my data + headroom.
            for await (const data of iter) {
                batch.push({store: 'streams', data});
                sizeEstimate += 100 + (data && data.data) ?
                    data.data.length * estSizePerArrayEntry : 0;
                if (sizeEstimate >= sizeLimit) {
                    dispatch();
                }
            }
        })();
        await Promise.all([actsWork, streamsWork]);
        if (batch.length) {
            dispatch();
        }
    }

    async import(data) {
        if (syncManager && !syncManager.stopped) {
            await syncManager.stop();
        }
        let newAthletes;
        for (const x of data) {
            const {store, data} = JSON.parse(x);
            if (!this.importing[store]) {
                this.importing[store] = [];
            }
            this.importing[store].push(data);
            newAthletes |= store === 'athletes';  // Immediate flush for client UI.
        }
        const size = sauce.data.sum(Object.values(this.importing).map(x => x.length));
        if (size > 1000 || newAthletes) {
            await this.flush();
        }
    }

    async flush() {
        if (this.importing.athletes && this.importing.athletes.length) {
            const athletes = this.importing.athletes.splice(0, Infinity);
            for (const x of athletes) {
                x.sync = DBTrue;  // It's possible to export disabled athletes.  Just reenable them.
                this.importedAthletes.add(x.id);
                console.debug(`Importing athlete: ${x.name} [${x.id}]`);
                await athletesStore.put(x);
                if (syncManager) {
                    syncManager.emitForAthleteId(x.id, 'importing-athlete', x);
                }
            }
        }
        if (this.importing.activities && this.importing.activities.length) {
            const activities = this.importing.activities.splice(0, Infinity);
            // Ensure we do a full resync after athlete is enabled.
            for (const x of activities) {
                if (x.syncState && x.syncState.local) {
                    delete x.syncState.local;
                }
            }
            console.debug(`Importing ${activities.length} activities`);
            await actsStore.putMany(activities);
        }
        if (this.importing.streams && this.importing.streams.length) {
            const streams = this.importing.streams.splice(0, Infinity);
            console.debug(`Importing ${streams.length} streams`);
            await streamsStore.putMany(streams);
        }
    }

    async finish() {
        this._finishing = true;
        if (syncManager) {
            if (syncManager.stopped) {
                syncManager.start();
            }
            for (const x of this.importedAthletes) {
                await syncManager.enableAthlete(x);
            }
        }
    }

    delete() {
        if (!this._finishing) {
            this.finish();
        }
    }
}
sauce.proxy.export(DataExchange, {namespace});


async function setStoragePersistent() {
    // This only works in some cases and may have no effect with unlimitedStorage
    // but it's evolving on all the browers and it's a good thing to ask for.
    if (navigator.storage && navigator.storage.persisted) {
        let isPersisted = await navigator.storage.persisted();
        if (!isPersisted) {
            isPersisted = await navigator.storage.persist();
        }
        if (!isPersisted) {
            console.debug(`Persisted storage not granted`);
        }
    }
}


let _setStoragePersistent;
export function startSyncManager(id) {
    if (syncManager) {
        throw new Error("SyncManager already exists");
    }
    if (id) {
        if (!_setStoragePersistent) {
            _setStoragePersistent = true;
            setTimeout(setStoragePersistent, 0);  // Run out of ctx to avoid startup races.
        }
        syncManager = new SyncManager(id);
        syncManager.start();
    }
}


export async function stopSyncManager() {
    if (!syncManager) {
        return false;
    }
    console.info("Stopping Sync Manager...");
    const mgr = syncManager;
    syncManager = null;
    await mgr.stop();
    console.debug("Sync Manager stopped.");
    return true;
}


export function hasSyncManager() {
    return !!syncManager;
}


addEventListener('currentUserUpdate', async ev => {
    if (syncManager) {
        if (syncManager.currentUser === ev.id) {
            return;
        }
        console.info("Current user changed:", syncManager.currentUser, '->', ev.id);
        await stopSyncManager();
    }
    if (ev.id) {
        startSyncManager(ev.id);
    }
});
