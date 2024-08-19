/* global sauce */

import * as jobs from '/src/common/jscoop/jobs.mjs';
import * as queues from '/src/common/jscoop/queues.mjs';
import * as locks from '/src/common/jscoop/locks.mjs';
import * as processors from '/src/bg/hist/processors.mjs';
import * as dataExchange from '/src/bg/hist/data-exchange.mjs';


const {
    ActivitiesStore,
    StreamsStore,
    AthletesStore,
    PeaksStore,
    SyncLogsStore,
    ActivityModel
} = sauce.hist.db;


const activityListVersion = 2;  // Increment to force full update of activities.
const namespace = 'hist';
const DBTrue = 1;
const DBFalse = 0;
const sleep = sauce.sleep;

export let syncManager;
export const actsStore = ActivitiesStore.singleton();
export const streamsStore = StreamsStore.singleton();
export const athletesStore = AthletesStore.singleton();
export const peaksStore = PeaksStore.singleton();
export const syncLogsStore = SyncLogsStore.singleton();

sauce.proxy.export(dataExchange.DataExchange, {namespace});


function issubclass(A, B) {
    return A && B && (A.prototype instanceof B || A === B);
}


// Try to make sure we wake or even restart the whole bg page around the time
// this sleep should resolve.
function aggressiveSleep(ms) {
    if (ms < 120000) {
        return sauce.sleep(ms);
    } else {
        sauce.setWakeupAlarm(ms);
        return sauce.suspendSafeSleep(ms);
    }
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
    version: 4,  // add hr zones, fix manual entries
    depends: ['extra-streams', 'athlete-settings', 'run-power'],
    data: {processor: processors.activityStatsProcessor}
});

ActivityModel.addSyncManifest({
    processor: 'local',
    name: 'peaks',
    version: 13, // Updated np and xp (simplified and true)
    depends: ['extra-streams'],
    data: {processor: processors.PeaksProcessorNoWorkerSupport}
});

ActivityModel.addSyncManifest({
    processor: 'local',
    name: 'peaks-finalizer',
    version: 1,
    depends: ['athlete-settings', 'run-power', 'peaks'],
    data: {processor: processors.peaksFinalizerProcessor}
});

ActivityModel.addSyncManifest({
    processor: 'local',
    name: 'training-load',
    version: 4,
    depends: ['activity-stats'],
    data: {processor: processors.TrainingLoadProcessor}
});

/*ActivityModel.addSyncManifest({
    processor: 'local',
    name: 'activity-athlete-stats',
    version: 1,
    data: {processor: processors.activityAthleteStatsProcessor}
});*/


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
    constructor(name, spec) {
        super(name, spec, {sleep: aggressiveSleep});
    }

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
    const athleteInfo = (await sauce.storage.getAthleteInfo(id)) || {};
    if (!data.ftpHistory && (!athlete || !athlete.get('ftpHistory'))) {
        if (id === self.currentUser) {
            data.ftpHistory = await getSelfFTPHistory();
        } else {
            const ftp = athleteInfo.ftp_override || athleteInfo.ftp_lastknown;
            if (ftp) {
                data.ftpHistory = [{ts: Date.now(), value: ftp}];
            }
        }
    }
    if (!data.weightHistory && (!athlete || !athlete.get('weightHistory'))) {
        const w = athleteInfo.weight_override || athleteInfo.weight_lastknown;
        if (w) {
            data.weightHistory = [{ts: Date.now(), value: w}];
        }
    }
    if (!data.gender) {
        data.gender = athleteInfo.gender || 'male';
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


// EXPERIMENT
export async function fetchAthleteStatsHistory(athleteId) {
    // If we find no delta of two readings in a <n> day period we stop "searching"
    // for new activity based athlete stats.
    const minSearch = 14 * 86400 * 1000;
    const stats = new Map();
    function same(a, b) {
        return (a && a.weight) == (b && b.weight) && (a && a.ftp) == (b && b.ftp);
    }
    async function search(batch, seeds={}) {
        let leftStats = seeds.leftStats;
        let leftIndex;
        if (!leftStats) {
            for (const [i, x] of batch.entries()) {
                leftStats = await fetchAthleteStatsForActivity(x.id);
                if (leftStats) {
                    stats.set(x.ts, leftStats);
                    leftIndex = i;
                    break;
                }
            }
        } else {
            leftIndex = batch.findIndex(x => x.id === leftStats.activity);
        }
        let rightStats = seeds.rightStats;
        let rightIndex;
        if (leftStats && !rightStats) {
            for (rightIndex = batch.length - 1; rightIndex > leftIndex; rightIndex--) {
                const x = batch[rightIndex];
                rightStats = await fetchAthleteStatsForActivity(x.id);
                if (rightStats) {
                    stats.set(x.ts, rightStats);
                    break;
                }
            }
        } else if (leftStats) {
            rightIndex = batch.findIndex(x => x.id === rightStats.activity);
        }
        const size = (rightIndex - leftIndex) + 1;
        if (size > 2 && leftStats && rightStats) {
            if (!same(leftStats, rightStats) ||
                (batch[rightIndex].ts - batch[leftIndex].ts > minSearch)) {
                const midIndex = leftIndex + Math.ceil(size / 2);
                await search(batch.slice(leftIndex, midIndex), {leftStats});
                if (midIndex !== rightIndex) {
                    await search(batch.slice(midIndex, rightIndex + 1), {rightStats});
                }
            }
        }
    }
    await search(await actsStore.getAllForAthlete(athleteId));
    const sorted = Array.from(stats.entries()).sort(([a], [b]) => a - b);
    let prev;
    const history = [];
    for (const [ts, x] of sorted) {
        if (!prev || !same(prev, x)) {
            history.push({ts, ...x});
            prev = x;
        }
    }
    return history;
}
sauce.proxy.export(fetchAthleteStatsHistory, {namespace});


export async function fetchAthleteStatsForActivity(activityId) {
    let data;
    try {
        const resp = await retryFetch(`/activities/${activityId}/power_data`);
        data = await resp.json();
    } catch(e) {
        if (!e.resp || ![401, 404].includes(e.resp.status)) {
            console.error('Activity power_data api error:', e);
        }
        return;
    }
    return {
        activity: activityId,
        weight: data.athlete_weight,
        ftp: data.athlete_ftp,
    };
}
sauce.proxy.export(fetchAthleteStatsForActivity, {namespace});


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


export async function getActivities(ids) {
    return await actsStore.getMany(ids);
}
sauce.proxy.export(getActivities, {namespace});


export function getActivitySyncManifests(processor) {
    return ActivityModel.getSyncManifests(processor).map(x => ({...x, data: undefined}));
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


export async function getStreamsForActivity(id) {
    return await streamsStore.getForActivity(id);
}
sauce.proxy.export(getStreamsForActivity, {namespace});


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
            syncLogsStore.logWarn(athleteId, 'Repairing activity with missing streams:', id);
            const a = activities.get(id);
            a.clearSyncState(streamManifest);
            for (const m of localManifests) {
                a.clearSyncState(m);
            }
            await a.save();
        }
        for (const id of inFalseErrorState) {
            syncLogsStore.logWarn(athleteId, 'Repairing activity with false-error state:', id);
            const a = activities.get(id);
            a.setSyncSuccess(streamManifest);
            for (const m of localManifests) {
                a.clearSyncState(m);
            }
            await a.save();
        }
        for (const id of haveStreamsFor) {
            if (!options.prune) {
                syncLogsStore.logWarn(athleteId,
                    'Ignoring missing activity repair (use "prune" to override):', id);
            } else {
                syncLogsStore.logWarn(athleteId, 'Removing detached stream for activity:', id);
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


async function retryFetch(urn, options={}) {
    const maxErrors = 3;
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
        if ((!resp || (resp.status >= 500 && resp.status < 600)) && r <= maxErrors) {
            console.info(`Server error for: ${urn} - Retry: ${r}/${maxErrors}`);
            // To avoid triggering Anti-DDoS HTTP Throttling of Extension-Originated Requests
            // perform a cool down before relinquishing control. Ie. do one last sleep.
            // See: http://dev.chromium.org/throttling
            const sleeping = sleep(5000 * 2 ** r);
            if (options.cancelEvent) {
                await Promise.race([sleeping, options.cancelEvent.wait()]);
                if (options.cancelEvent.isSet()) {
                    throw new Error('cancelled');
                }
            } else {
                await sleeping;
            }
            if (r < maxErrors) {
                continue;
            }
        }
        if (fetchError) {
            throw fetchError;
        } else if (resp.status === 429) {
            const delay = 30000 * 2 ** r;
            console.warn(`Hit Throttle Limits: Delaying next request for ${Math.round(delay / 1000)}s`);
            if (options.cancelEvent) {
                await Promise.race([sleep(delay), options.cancelEvent.wait()]);
                if (options.cancelEvent.isSet()) {
                    throw new Error('cancelled');
                }
            } else {
                await sleep(delay);
            }
            continue;
        } else {
            throw FetchError.fromResp(resp);
        }
    }
}


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

    log(level, ...messages) {
        const record = syncLogsStore.log(level, this.athlete.pk, ...messages);
        const ev = new Event('log');
        ev.data = record;
        this.dispatchEvent(ev);
    }

    logDebug(...messages) {
        return this.log('debug', ...messages);
    }

    logInfo(...messages) {
        return this.log('info', ...messages);
    }

    logWarn(...messages) {
        return this.log('warn', ...messages);
    }

    logError(...messages) {
        return this.log('error', ...messages);
    }

    async wait() {
        await this._runPromise;
    }

    cancel() {
        this._cancelEvent.set();
        if (syncManager) {
            syncManager.cancelRefreshRequest(this.athlete.pk);
        }
    }

    cancelled() {
        return this._cancelEvent.isSet();
    }

    run(options) {
        this._running = true;
        this._runPromise = this._run(options).finally(() => this._running = false);
    }

    async _run(options={}) {
        if (options.delay) {
            this.setStatus('deferred');
            this.logDebug(`Deferring sync job [${Math.round(options.delay / 1000)}s] for: ` + this.athlete);
            await Promise.race([sauce.sleep(options.delay), this._cancelEvent.wait()]);
        }
        if (this._cancelEvent.isSet()) {
            return;
        }
        this.logInfo('Starting sync job for: ' + this.athlete);
        const start = Date.now();
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
        const duration = Math.round((Date.now() - start) / 1000);
        this.logInfo(`Sync completed in ${duration.toLocaleString()} seconds for: ` + this.athlete);
    }

    emit(name, data) {
        const ev = new Event(name);
        ev.data = data;
        this.dispatchEvent(ev);
    }

    setStatus(status) {
        this.status = status;
        this.emit('status', status);
    }

    isRunning() {
        return !!this._running;
    }

    async retryFetch(urn, options={}) {
        return await retryFetch(urn, {cancelEvent: this._cancelEvent, ...options});
    }

    async updateSelfActivitiesV2(options={}) {
        const forceUpdate = options.forceUpdate;
        const knownIds = new Set(forceUpdate ?  [] : await actsStore.getAllKeysForAthlete(this.athlete.pk));
        const q = new URLSearchParams({feed_type: 'my_activity'});
        while (true) {
            const resp = await this.retryFetch(`/dashboard/feed?${q}`);
            let data;
            try {
                data = await resp.json();
            } catch(e) {
                // If the credentials are not valid Strava returns HTML
                // This would seem impossible, but with addons like Facebook Containers
                // it can happen and has happend to some users.
                break;
            }
            let batch = [];
            for (const x of data.entries) {
                if (x.entity === 'Activity') {
                    const a = x.activity;
                    const id = Number(a.id);
                    if (!knownIds.has(id)) {
                        batch.push(this.activityToDatabase({
                            id,
                            ts: x.cursorData.updated_at * 1000,
                            type: a.type,
                            name: a.activityName,
                            description: a.description,
                            virtual: a.isVirtual,
                            trainer: a.isVirtual ? true : undefined,
                            commute: a.isCommute,
                            map: a.mapAndPhotos && a.mapAndPhotos.activityMap ?
                                a.mapAndPhotos.activityMap.url : undefined,
                            photos: a.mapAndPhotos && a.mapAndPhotos.photoList ?
                                a.mapAndPhotos.photoList.map(p => p && p.large).filter(p => p).map(url => ({url})) :
                                undefined,
                        }));
                    }
                } else if (x.entity === 'GroupActivity') {
                    for (const a of x.rowData.activities.filter(x => x.athlete_id === this.athlete.pk)) {
                        debugger;
                        if (!knownIds.has(a.activity_id)) {
                            batch.push(this.activityToDatabase({
                                id: a.activity_id,
                                ts: (new Date(a.start_date)).getTime(),
                                type: a.type,
                                name: a.name,
                                description: a.description,
                                virtual: a.is_virtual,
                                trainer: a.is_virtual ? true : undefined,
                                commute: a.is_commute,
                                map: a.activity_map && a.activity_map.url,
                                photos: a.photos ? this.groupPhotosToDatabase(a.photos) : undefined,
                            }));
                        }
                    }
                }
                q.set('before', x.cursorData.updated_at);
            }
            if (!batch.length) {
                break;
            }
            batch = batch.filter(x => x);
            if (forceUpdate) {
                this.logInfo(`Updating ${batch.length} activities`);
                await actsStore.updateMany(new Map(batch.map(x => [x.id, x])));
            } else {
                this.logInfo(`Adding ${batch.length} new activities`);
                await actsStore.putMany(batch);
            }
        }
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
            if (this._cancelEvent.isSet()) {
                break;
            }
            const work = new jobs.UnorderedWorkQueue({maxPending: 25});
            for (let i = 0; page === 1 || page <= pageCount && i < concurrency; page++, i++) {
                await work.put((async () => {
                    const q = new URLSearchParams();
                    q.set('new_activity_only', 'false');
                    q.set('page', page);
                    const resp = await this.retryFetch(`/athlete/training_activities?${q}`,
                        {cancelEvent: this._cancelEvent});
                    try {
                        return await resp.json();
                    } catch(e) {
                        // If the credentials are not valid Strava returns HTML
                        // This would seem impossible, but with addons like Facebook Containers
                        // it can happen and has happend to some users.
                        return;
                    }
                })());
            }
            if (!work.pending() && !work.fulfilled()) {
                break;
            }
            const adding = [];
            for await (const data of work) {
                if (!data) {
                    continue;  // skip non JSON resp.
                }
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
                    this.logInfo(`Updating ${adding.length} activities`);
                    await actsStore.updateMany(new Map(adding.map(x => [x.id, x])));
                } else {
                    this.logInfo(`Adding ${adding.length} new activities`);
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

    parseRawReactProps(raw) {
        const frag = document.createElement('div');
        // Unescapes html entities, ie. "&quot;"
        const htmlEntitiesKey = String.fromCharCode(...[33, 39, 36, 30, 46, 5, 10, 2, 12]
            .map((x, i) => (x ^ i) + 72));
        frag[htmlEntitiesKey] = raw;
        return JSON.parse(frag[htmlEntitiesKey]
            .replace(/\\\\/g, '\\')
            .replace(/\\\$/g, '$')
            .replace(/\\`/g, '`'));
    }

    groupPhotosToDatabase(stravaData) {
        if (stravaData) {
            return stravaData.map(x => {
                const bySize = Object.entries(x.urls);
                bySize.sort((a, b) => b[0] - a[0]);
                return {url: bySize[0][1]};
            });
        }
    }

    activityToDatabase({id, ts, type, name, ...extra}) {
        if (!id) {
            this.logError('Invalid activity id for athlete: ' + this.athlete.pk);
            return;
        }
        let basetype = type && sauce.model.getActivityBaseType(type);
        if (!basetype) {
            this.logError('Unknown activity type for: ' + id);
            basetype = 'workout';
        }
        const data = {
            id,
            ts,
            type,
            basetype,
            athlete: this.athlete.pk,
            name,
            ...extra,
        };
        return data;
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
            const resp = await this.retryFetch(`/athletes/${this.athlete.pk}/interval?${q}`,
                {cancelEvent: this._cancelEvent});
            data = await resp.text();
        } catch(e) {
            // In some cases Strava just returns 500 for a month.  I suspect it's when the only
            // activity data in a month is private, but it's an upstream problem and we need to
            // treat it like an empty response.
            this.logError(`Upstream activity fetch error: ${this.athlete.pk} [${q}]`);
            return [];
        }
        // Desc seems to be wrapped in a <p> but I'm not sure if this is 100% of the time and doing
        // other html sanitizing is inconsistent with how other html chars are escaped (or not escaped).
        const unwrapDesc = x => x && x.replace(/^\s*?<p>/, '').replace(/<\/p>\s*?$/, '');
        const raw = data.match(/jQuery\('#interval-rides'\)\.html\((.*)\)/)[1];
        const batch = [];
        const rawProps = raw.match(
            /data-react-class=\\['"]Microfrontend\\['"] data-react-props=\\['"](.+?)\\['"]/);
        let feedEntries;
        try {
            if (rawProps) {
                const data = this.parseRawReactProps(rawProps[1]);
                feedEntries = data.appContext.preFetchedEntries;
            } else {
                // Legacy as of 03-2023, remove in future release.
                const legacyRawProps = raw.match(
                    /data-react-class=\\['"]FeedRouter\\['"] data-react-props=\\['"](.+?)\\['"]/);
                if (legacyRawProps) {
                    const data = this.parseRawReactProps(legacyRawProps[1]);
                    feedEntries = data.preFetchedEntries;
                }
            }
        } catch(e) {
            this.logError('Parse activity feed props error:', e);
        }
        if (feedEntries) {
            try {
                for (const x of feedEntries) {
                    if (x.entity === 'Activity') {
                        const a = x.activity;
                        batch.push(this.activityToDatabase({
                            id: Number(a.id),
                            ts: x.cursorData.updated_at * 1000,
                            type: a.type,
                            name: a.activityName,
                            description: unwrapDesc(a.description),
                            virtual: a.isVirtual,
                            trainer: a.isVirtual ? true : undefined,
                            commute: a.isCommute,
                            map: a.mapAndPhotos && a.mapAndPhotos.activityMap ?
                                a.mapAndPhotos.activityMap.url : undefined,
                            photos: a.mapAndPhotos && a.mapAndPhotos.photoList ?
                                a.mapAndPhotos.photoList.map(p => p && p.large).filter(p => p).map(url => ({url})) :
                                undefined,
                            //kudos: await (await fetch(`https://www.strava.com/feed/activity/${a.id}/kudos`)).json(),
                        }));
                    } else if (x.entity === 'GroupActivity') {
                        for (const a of x.rowData.activities.filter(x => x.athlete_id === this.athlete.pk)) {
                            batch.push(this.activityToDatabase({
                                id: a.activity_id,
                                ts: (new Date(a.start_date)).getTime(),
                                type: a.type,
                                name: a.name,
                                description: unwrapDesc(a.description),
                                virtual: a.is_virtual,
                                trainer: a.is_virtual ? true : undefined,
                                commute: a.is_commute,
                                map: a.activity_map && a.activity_map.url,
                                photos: a.photos ? this.groupPhotosToDatabase(a.photos) : undefined,
                                //kudos: await (await fetch(`https://www.strava.com/feed/activity/${a.activity_id}/kudos`)).json(),
                            }));
                        }
                    }
                }
            } catch(e) {
                this.logError('Error processing activity props:', e);
            }
        } else {
            this.logWarn("No feed entries were found, upstream change?");
        }
        return batch.filter(x => x);
    }

    async _batchImport(startDate, knownIds, forceUpdate) {
        const minEmpty = knownIds.size ? 2 : 16;
        const minRedundant = 2;
        const maxConcurrent = 10;
        const iter = this._yearMonthRange(startDate);
        let empty = 0;
        let redundant = 0;
        for (let concurrency = 1;; concurrency = Math.min(maxConcurrent, concurrency * 2)) {
            if (this._cancelEvent.isSet()) {
                break;
            }
            const work = new jobs.UnorderedWorkQueue({maxPending: maxConcurrent});
            for (let i = 0; i < concurrency; i++) {
                const [year, month] = iter.next().value;
                await work.put(this.fetchMonth(year, month));
            }
            const adding = [];
            for await (const data of work) {
                if (!data.length) {
                    empty++;
                    continue;
                }
                empty = 0;
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
                } else {
                    redundant = 0;
                }
            }
            if (adding.length) {
                if (forceUpdate) {
                    this.logInfo(`Updating ${adding.length} activities`);
                    await actsStore.updateMany(new Map(adding.map(x => [x.id, x])));
                } else {
                    this.logInfo(`Adding ${adding.length} new activities`);
                    await actsStore.putMany(adding);
                }
            } else if (empty >= minEmpty) {
                const [year, month] = iter.next().value;
                const date = new Date(`${month === 12 ? year + 1 : year}-${month === 12 ? 1 : month + 1}`);
                await this.athlete.save({activitySentinel: date.getTime()});
                break;
            } else if (redundant >= minRedundant) {
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
            this.logWarn(`Deferring sync of ${deferCount} activities due to error`);
        }
        const workers = [];
        if (unfetched.length && !options.noStreamsFetch) {
            workers.push(this._fetchStreamsWorker(unfetched));
        } else if (!this._procQueue.size) {
            this.logDebug("No activity sync required for: " + this.athlete);
            return;
        } else {
            this._procQueue.putNoWait(null);  // sentinel
        }
        workers.push(this._localProcessWorker());
        await Promise.all(workers);
    }

    async _fetchStreamsWorker(...args) {
        try {
            await this.__fetchStreamsWorker(...args);
        } finally {
            this._procQueue.putNoWait(null);
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
                this.logWarn("Fetch streams error (will retry later):", e);
                error = e;
            }
            if (this._cancelEvent.isSet()) {
                this.logInfo('Sync streams cancelled');
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
        this.logInfo("Completed streams fetch for: " + this.athlete);
    }

    _localSetSyncError(activities, manifest, e) {
        this.logError(`Top level local processing error (${manifest.name}) v${manifest.version}`, e);
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
                this.logDebug(`Proc batch [${m.name}]: ${elapsed}ms (avg), ${finished.length} ` +
                    `activities (${rate}/s)`);
            }
            if (proc.stopped && !proc.available) {
                // It is fulfilled but we need to pickup any errors.
                try {
                    await proc.runPromise;
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
                this.logInfo("Offload processor finished:", m.name);
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
                            this.logInfo('Requesting offload processor stop:', x.manifest.name);
                            x.stop();
                        } else if (x.pending) {
                            this.logDebug('Requesting offload processor flush:', x.manifest.name);
                            x.flush();
                        }
                    }
                } else {
                    incoming.push(procQueue.wait());
                }
                const offFinWaiters = Array.from(offloaded).map(x => x.waitFinished());
                const offloadedDone = Array.from(offloaded).map(x => x.runPromise.catch(e => undefined));
                await Promise.race([...offFinWaiters, ...incoming, ...offloadedDone]);
                for (const f of offFinWaiters) {
                    if (!f.done()) {
                        f.cancel();
                    }
                }
                if (this._cancelEvent.isSet()) {
                    return;
                }
            }
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
            await this._localDrainOffloaded(offloaded, batch);
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
                for (const [m, activities] of manifestBatches.entries()) {
                    const processor = m.data.processor;
                    const s = Date.now();
                    if (issubclass(processor, processors.OffloadProcessor)) {
                        let proc = offloadedActive.get(processor);
                        if (!proc || proc.stopping) {
                            this.logDebug("Creating new offload processor:", m.name);
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
                            proc.start().catch(e => undefined).finally(() => {;
                                if (offloadedActive.get(processor) === proc) {
                                    offloadedActive.delete(processor);
                                }
                            });
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
                        this.logDebug(`Proc batch [${m.name}]: ${elapsed}ms, ${activities.length} ` +
                            `activities (${rate}/s)`);
                    }
                    await sauce.sleep(0); // Run in next task for better offloaded latency
                }
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
                this.logInfo(`Rate limited for ${Math.round(impendingSuspend / 60 / 1000)} minutes`);
                for (const x of this._rateLimiters) {
                    if (x.willSuspendFor()) {
                        this.logDebug('' + x);
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
            this.logDebug(`Fetching streams for activity: ${activity.pk} [${localeDate}]`);
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
        this.syncJobTimeout = 4 * 60 * 60 * 1000;
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
                this.logError('Sync refresh error:', e);
                await aggressiveSleep(errorBackoff *= 1.5);
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
                    await Promise.race([aggressiveSleep(deadline), this._refreshEvent.wait()]);
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
                this.runSyncJob(a, options).catch(e =>
                    syncLogsStore.logError(a.id, 'Outer run sync job error:', e));
                delay = Math.min((delay + 90000) * 1.10, 3600 * 1000);
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
        syncJob.addEventListener('log', ev => this.emitForAthlete(athlete, 'log', ev.data));
        this.emitForAthlete(athlete, 'active', {active: true, athlete: athlete.data});
        this.activeJobs.set(athleteId, syncJob);
        syncJob.run(options);
        try {
            await Promise.race([sleep(this.syncJobTimeout), syncJob.wait()]);
        } catch(e) {
            syncJob.logError('Sync job error:', e);
            athlete.set('lastSyncError', Date.now());
            this.emitForAthlete(athlete, 'error', {error: e.message});
        } finally {
            if (syncJob.isRunning()) {
                // Timeout hit, just cancel and reschedule soon.  This is a paranoia based
                // protection for future mistakes or edge cases that might lead to a sync
                // job hanging indefinitely.   NOTE: it will be more common that this is
                // triggered by initial sync jobs that hit the large rate limiter delays.
                // There is no issue here since we just reschedule the job in either case.
                syncJob.logWarn('Sync job timeout');
                syncJob.cancel();
                await syncJob.wait();
                this._refreshRequests.set(athleteId, {});
            } else {
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

    cancelRefreshRequest(id) {
        if (!id) {
            throw new TypeError('Athlete ID arg required');
        }
        this._refreshRequests.delete(id);
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
        this._setupEventRelay('log');
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

    async getLogs() {
        return await syncLogsStore.getLogs(this.athleteId);
    }
}
sauce.proxy.export(SyncController, {namespace});


async function setStoragePersistent() {
    // This only works in some cases and may have no effect with unlimitedStorage
    // but it's evolving on all the browers and it's a good thing to ask for.
    if (navigator.storage && navigator.storage.persisted) {
        const isPersisted = await navigator.storage.persisted();
        if (!isPersisted && navigator.storage.persist) {
            await navigator.storage.persist();
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
