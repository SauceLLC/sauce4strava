/* global sauce, browser */

import * as jobs from '/src/common/jscoop/jobs.mjs';
import * as queues from '/src/common/jscoop/queues.mjs';
import * as locks from '/src/common/jscoop/locks.mjs';
import * as net from './net.mjs';
import * as meta from './meta.mjs';
import * as db from './hist/db.mjs';
import * as processors from './hist/processors.mjs';
import * as dataExchange from './hist/data-exchange.mjs';

const activityListVersion = 3;  // Increment to force full update of activities.
const noStreamsTag = 'no-streams-v2'; // Increment if no stream handling is updated.
const namespace = 'hist';
const DBTrue = 1;
const DBFalse = 0;
const sleep = sauce.sleep;

export let syncManager;
export const actsStore = db.ActivitiesStore.singleton();
export const streamsStore = db.StreamsStore.singleton();
export const athletesStore = db.AthletesStore.singleton();
export const peaksStore = db.PeaksStore.singleton();
export const syncLogsStore = db.SyncLogsStore.singleton();

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


db.ActivityModel.addSyncManifest({
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

db.ActivityModel.addSyncManifest({
    processor: 'local',
    name: 'athlete-settings',
    version: 2,
    data: {processor: processors.athleteSettingsProcessor}
});

db.ActivityModel.addSyncManifest({
    processor: 'local',
    name: 'extra-streams',
    version: 3, // Updated active AND run powers (again)
    data: {processor: processors.extraStreamsProcessor}
});

db.ActivityModel.addSyncManifest({
    processor: 'local',
    name: 'run-power',
    version: 1,
    depends: ['extra-streams', 'athlete-settings'],
    data: {processor: processors.runPowerProcessor}
});

db.ActivityModel.addSyncManifest({
    processor: 'local',
    name: 'activity-stats',
    version: 7,  // Fix powerZones accumulator (don't include zero pads)
    depends: ['extra-streams', 'athlete-settings', 'run-power'],
    storageOptionTriggers: ['analysis-prefer-estimated-power-tss'],
    data: {processor: processors.activityStatsProcessor}
});

db.ActivityModel.addSyncManifest({
    processor: 'local',
    name: 'peaks',
    version: 15, // Repair run pace regression from 14
    depends: ['extra-streams'],
    storageOptionTriggers: ['analysis-disable-np', 'analysis-disable-xp'],
    //data: {processor: processors.PeaksProcessorNoWorkerSupport}
    data: {processor: processors.PeaksProcessor}
});

db.ActivityModel.addSyncManifest({
    processor: 'local',
    name: 'peaks-finalizer',
    version: 1,
    depends: ['athlete-settings', 'run-power', 'peaks'],
    storageOptionTriggers: ['analysis-disable-np', 'analysis-disable-xp'],
    data: {processor: processors.peaksFinalizerProcessor}
});

db.ActivityModel.addSyncManifest({
    processor: 'local',
    name: 'training-load',
    version: 4,
    depends: ['activity-stats'],
    data: {processor: processors.TrainingLoadProcessor}
});


class OffscreenDocumentRPC {

    constructor() {
        this.idleTimeout = 60000;
        this._pending = new Map();
        this._callIdCounter = 1;
        this._connecting = null;
        this._port = null;
        this._idleKillId = null;
        sauce.storage.addListener(async (key, value) => {
            if (key === 'options' && this._port && !this._connecting) {
                await this._invoke('_setConfig', [{options: value, deviceId: sauce.deviceId}]);
            }
        });
    }

    async _connect() {
        const url = browser.runtime.getURL('pages/offscreen.html');
        const existing = await browser.runtime.getContexts({
            contextTypes: ['OFFSCREEN_DOCUMENT'],
            documentUrls: [url],
        });
        if (!existing.length) {
            console.info("Creating new offscreen document...");
            await browser.offscreen.createDocument({
                url,
                reasons: ['DOM_PARSER'],
                justification: 'Safely parse HTML'
            });
        } else {
            // Unlikely, possibly browser bug...
            console.warn("Unexpected use of existing offscreen document...");
        }
        this._port = await browser.runtime.connect({name: 'sauce-offscreen-proxy-port'});
        this._port.onMessage.addListener(this._onPortMessage.bind(this));
        this._port.onDisconnect.addListener(port => {
            if (this._port === port) {
                this._port = null;
            }
        });
        await this._invoke('_setConfig', [{options: sauce.options, deviceId: sauce.deviceId}]);
        this._connecting = null;
    }

    _deferKill() {
        clearTimeout(this._idleKillId);
        this._idleKillId = setTimeout(async () => {
            if (this._pending.size) {
                this._deferKill();
                return;
            }
            this._port = null;
            console.info("Closing idle offscreen document...");
            this._killing = browser.offscreen.closeDocument();
            try {
                await this._killing;
            } finally {
                this._killing = null;
            }
        }, this.idleTimeout);
    }

    async invoke(name, ...args) {
        if (!this._port) {
            if (this._killing) {
                await this._killing;
            }
            if (!this._connecting) {
                this._connecting = this._connect();
            }
            await this._connecting;
        }
        return this._invoke(name, args);
    }

    _invoke(name, args) {
        let resolve, reject;
        const id = this._callIdCounter++;
        const promise = new Promise((_resolve, _reject) => (resolve = _resolve, reject = _reject));
        this._pending.set(id, {resolve, reject});
        this._port.postMessage({op: 'call', name, args, id});
        this._deferKill();
        return promise;
    }

    _onPortMessage(msg) {
        const {resolve, reject} = this._pending.get(msg.id);
        this._pending.delete(msg.id);
        if (msg.success) {
            resolve(msg.value);
        } else {
            console.error("Offscreen document error:", msg.error);
            reject(new Error(msg.error.message));
        }
    }
}


class PseudoDocumentRPC {
    constructor() {
        this._importing = import('./offscreen.mjs').then(m => this._calls = m.calls);
    }

    async _connect() {}

    async invoke(name, ...args) {
        if (!this._calls) {
            await this._importing;
        }
        if (!Object.prototype.hasOwnProperty.call(this._calls, name)) {
            throw new TypeError(`Invalid RPC call: ${name}`);
        }
        return this._calls[name](...args);
    }
}


// In chromium we are in a service worker without DOM but also without the ability to start
// web workers unless we use their maligned offscreen-document API.  Firefox does not support
// service workers for extenstions but does have background pages which support all the APIs
// we need.  Ergo we need a "special" proxy..
export const specialProxy = new Proxy(
    browser.offscreen ? new OffscreenDocumentRPC() : new PseudoDocumentRPC(),
    {get: (target, prop) => (...args) => target.invoke(prop, ...args)});


class SauceRateLimiter extends jobs.RateLimiter {

    constructor(name, spec) {
        super(name, spec, {sleep: aggressiveSleep});
        this.syncStorage = false; // Testing reliability with sync false 2025-02-04
        /*
        sauce.storage.addListener((key, value) => {
            if (key === this._storeKey && sauce.hash(JSON.stringify(value)) !== this._lastSavedHash) {
                this._mergeExternalState(value);  // bg okay
            }
        }, {sync: this.syncStorage});
        */
    }

    // hack to avoid race with early loadState called via constructor
    get _storeKey() {
        return `hist-rate-limiter-${this.label}`;
    }

    async _decodeState(state) {
        if (!state) {
            return state;
        }
        const clone = structuredClone(state);
        if (state.zBucketV1) {
            delete clone.zBucketV1;
            const r = await sauce.data.decompress(sauce.data.fromBase64(state.zBucketV1.zDeltas));
            const deltas = sauce.data.fromVarintArray(await r.arrayBuffer());
            const start = state.zBucketV1.start;
            clone.bucket = [start];
            for (const x of deltas) {
                clone.bucket.push(x + clone.bucket[clone.bucket.length - 1]);
            }
        }
        return clone;
    }

    async _encodeState(state) {
        // Compact the state so it fits inside of QUOTA_BYTES_PER_ITEM
        if (!state) {
            return state;
        }
        const clone = structuredClone(state);
        if (state.bucket && state.bucket.length > 1) {
            delete clone.bucket;
            const start = state.bucket[0];
            let prev = start;
            const deltas = [];
            for (const x of state.bucket.slice(1)) {
                deltas.push(x - prev);
                prev = x;
            }
            const r = await sauce.data.compress(sauce.data.toVarintArray(deltas));
            const zDeltas = sauce.data.toBase64(await r.arrayBuffer());
            clone.zBucketV1 = {
                start,
                zDeltas,
            };
        }
        return clone;
    }

    async getStateBuggy() {
        return await this._decodeState(await sauce.storage.get(this._storeKey, {sync: this.syncStorage}));
    }

    async setStateBuggy(state) {
        const encodedState = await this._encodeState(state);
        this._lastSavedHash = sauce.hash(JSON.stringify(encodedState));
        await sauce.storage.set(this._storeKey, encodedState, {sync: this.syncStorage});
    }

    async getState() {
        const storeKey = `hist-rate-limiter-${this.label}`;
        const state = await sauce.storage.get(storeKey);
        if (state && !state.bucket) {
            console.warn("Healing migration from buggy rate limiter state");
            state.bucket = [];
        }
    }

    async setState(state) {
        const storeKey = `hist-rate-limiter-${this.label}`;
        await sauce.storage.set(storeKey, state);
    }

    async _mergeExternalStateBuggy(encodedState) {
        const state = await this._decodeState(encodedState);
        let count = 0;
        for (const x of state.bucket) {
            if (!this.state.bucket.includes(x)) {
                this.state.bucket.push(x);
                count++;
            }
        }
        if (count) {
            this.state.bucket.sort();
            this._drain();
            console.info(`Merged ${count} external uses: ${this}`);
        }
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


function _makePeaksFilterOptions(options={}) {
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
    options = _makePeaksFilterOptions(options);
    return await _aggregatePeaks(periods.map(x =>
        peaksStore.getForAthlete(athleteId, type, x, options)), options);
}
sauce.proxy.export(getPeaksForAthlete, {namespace});


export async function getPeaksFor(type, periods, options={}) {
    periods = Array.isArray(periods) ? periods : [periods];
    options = _makePeaksFilterOptions(options);
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
    options = _makePeaksFilterOptions({filterTS: activity.ts, ...options});
    const results = [];
    for (const period of periods) {
        const peaks = await peaksStore.getForAthlete(
            activity.athlete, type, period, {...options, limit: undefined, expandActivities: false});
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


export async function getPeaksForActivityIds(activityIds, options={}) {
    return await peaksStore.getForActivities(activityIds, options);
}
sauce.proxy.export(getPeaksForActivityIds, {namespace});


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


export async function deleteAthlete(id) {
    return await athletesStore.delete(id);
}
sauce.proxy.export(deleteAthlete, {namespace});


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
        for await (const a of actsStore.byAthlete(athleteId, {...options, direction: 'prev',
                                                              start: undefined})) {
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


export async function exportSyncChangeset(athleteId) {
    const athlete = await athletesStore.get(athleteId);
    const activities = await actsStore.getAllForAthlete(athleteId);
    const settings = [
        'disableRunWatts', 'estRunWatts', 'estCyclingWatts',
        'estRunningPeaks', 'estCyclingPeaks'
    ];
    const data = {
        version: 1,
        athleteId,
        deviceId: sauce.deviceId,
        settings: {},
        ftpHistory: athlete.ftpHistory,
        weightHistory: athlete.weightHistory,
        activityOverrides: {},
    };
    for (const k of settings) {
        data.settings[k] = athlete[k];
    }
    for (const x of activities) {
        if (x.tssOverride !== undefined) {
            data.activityOverrides[x.id] = {tssOverride: x.tssOverride};
        }
        if (x.peaksExclude !== undefined) {
            if (!data.activityOverrides[x.id]) {
                data.activityOverrides[x.id] = {};
            }
            data.activityOverrides[x.id].peaksExclude = x.peaksExclude;
        }
    }
    const filename = `hist-md-${athleteId}/${sauce.deviceId}`;
    let file = await meta.get(filename);
    const priorHash = file && file.hash;
    if (!file) {
        file = await meta.create(filename, data);
    } else {
        await meta.set(file, data);
        if (priorHash === file.hash) {
            console.debug("Skipping no-op sync changeset");
        } else {
            await meta.save(file);
        }
    }
    await addSyncChangesetReceipt(athleteId, file);
    if (priorHash !== file.hash) {
        syncLogsStore.logInfo(athleteId, 'Exported settings changeset:', filename);
    }
}
sauce.proxy.export(exportSyncChangeset, {namespace});


async function addSyncChangesetReceipt(athleteId, changeset) {
    await syncManager._athleteLock.acquire();
    try {
        const athlete = await athletesStore.get(athleteId, {model: true});
        if (!athlete) {
            throw new Error('Athlete not found: ' + athleteId);
        }
        const receipts = new Map(athlete.get('syncSettingsReceipts') || []);
        receipts.set(changeset.data.deviceId, {updated: changeset.updated, hash: changeset.hash});
        await athlete.save({syncSettingsReceipts: Array.from(receipts.entries())});
    } finally {
        syncManager._athleteLock.release();
    }
}
sauce.proxy.export(addSyncChangesetReceipt, {namespace});


function diffHistories(to, from) {
    from = new Map(from.map(x => [JSON.stringify(x), x]));
    to = new Map(to.map(x => [JSON.stringify(x), x]));
    const diffs = [];
    for (const [sig, entry] of to) {
        if (from.has(sig)) {
            from.delete(sig);
            continue;
        }
        let found;
        for (const [k, v] of from) {
            if (v.ts === entry.ts) {
                diffs.push({type: 'changed', entry, from: v});
                from.delete(k);
                found = true;
                break;
            }
        }
        if (!found) {
            diffs.push({type: 'added', entry});
        }
    }
    for (const entry of from.values()) {
        diffs.push({type: 'removed', entry});
    }
    return diffs;
}


function toUTCLocaleDateString(ts) {
    return new Date(ts).toLocaleDateString(undefined, {timeZone: 'UTC'});
}


export async function applySyncChangeset(athleteId, changeset, {replace, dryrun}={}) {
    // XXX Should probably take a lock for this whole thing...
    const data = changeset.data;
    if (!data || data.version !== 1) {
        throw new TypeError("Unsupported changeset version");
    }
    const athlete = await athletesStore.get(athleteId, {model: true});
    if (!athlete) {
        throw new Error("Athlete not found");
    }
    const activities = await actsStore.getAllForAthlete(athleteId, {models: true});
    let edited = false;
    const logs = [];
    if (data.ftpHistory && data.ftpHistory.length) {
        const diffs = diffHistories(data.ftpHistory, athlete.get('ftpHistory') || []);
        if (diffs.length) {
            for (const x of diffs) {
                const value = x.type === 'changed' ?
                    `${x.from.value}w ⇾ ${x.entry.value}w` :
                    `${x.entry.value}w`;
                const type = x.entry.type ? `(${x.entry.type}) ` : '';
                logs.push(`FTP ${x.type} [${toUTCLocaleDateString(x.entry.ts)}]: ${type}${value}`);
            }
            if (!dryrun) {
                await athlete.save({ftpHistory: data.ftpHistory});
                edited = true;
            }
        }
    }
    if (data.weightHistory && data.weightHistory.length) {
        const diffs = diffHistories(data.weightHistory, athlete.get('weightHistory') || []);
        if (diffs.length) {
            for (const x of diffs) {
                const value = x.type === 'changed' ?
                    `${x.from.value?.toFixed(2)}kg ⇾ ${x.entry.value?.toFixed(2)}kg` :
                    `${x.entry.value.toFixed(2)}kg`;
                const type = x.entry.type ? `(${x.entry.type}) ` : '';
                logs.push(`Weight ${x.type} [${toUTCLocaleDateString(x.entry.ts)}]: ${type}${value}`);
            }
            if (!dryrun) {
                await athlete.save({weightHistory: data.weightHistory});
                edited = true;
            }
        }
    }
    if (data.settings) {
        let settingsEdited;
        for (const [k, v] of Object.entries(data.settings)) {
            if (athlete.get(k) !== v) {
                if (!replace && v === undefined) {
                    console.debug("Ignore unsetting of athlete setting:", k);
                    continue;
                }
                logs.push(`Athlete setting: (${k}) ${athlete.get(k) ?? '<unset>'} ⇾ ${v ?? '<unset>'}`);
                if (!dryrun) {
                    athlete.set(k, v);
                    settingsEdited = true;
                }
            }
        }
        if (settingsEdited) {
            await athlete.save();
            edited = true;
        }
    }
    const toSave = new Set();
    for (const x of activities) {
        for (const key of ['tssOverride', 'peaksExclude']) {
            const suggested = (data.activityOverrides[x.pk] ?? {})[key];
            const existing = x.get(key);
            if (suggested !== existing) {
                if (!replace && suggested === undefined) {
                    console.debug("Ignore unsetting of activity override:", key);
                    continue;
                }
                if (suggested == null && existing == null) {
                    continue;  // Only one side is null but the operation is still a no-op
                }
                const localeDate = (new Date(x.get('ts'))).toLocaleDateString();
                let name = x.get('name');
                if (name.length > 12) {
                    name = name.substr(0, 7) + '…' + name.substr(-5);
                }
                logs.push(`Activity [${localeDate}, ${name}]: ` +
                          `(${key}) ${existing ?? '<unset>'} ⇾ ${suggested ?? '<unset>'}`);
                if (!dryrun) {
                    x.set(key, suggested);
                    toSave.add(x);
                }
            }
        }
    }
    if (!dryrun) {
        if (toSave.size) {
            await Promise.all(Array.from(toSave).map(x => x.save()));
            console.info(`Updated: ${toSave.size} models`);
            edited = true;
        } else {
            console.info("No differences found");
        }
        await addSyncChangesetReceipt(athleteId, changeset);
        if (edited) {
            await invalidateAthleteSyncState(athleteId, 'local');
        }
        for (const x of logs) {
            syncLogsStore.logInfo(athleteId, x);
        }
        schedSyncChangesetExport(athleteId);
    }
    return logs;
}
sauce.proxy.export(applySyncChangeset, {namespace});


export async function getAvailableSyncChangesets(athleteId) {
    const athlete = await athletesStore.get(athleteId);
    if (!athlete || !athlete.syncSettings) {
        return [];
    }
    const receipts = new Map(athlete.syncSettingsReceipts || []);
    const dir = `hist-md-${athleteId}/`;
    await meta.load({forceFetch: true}); // XXX for testing and demo...
    const changesets = (await meta.getAll(dir)).filter(x => {
        return x.data?.version === 1 && (
            !receipts.has(x.data.deviceId) ||
            receipts.get(x.data.deviceId).hash !== x.hash
        );
    });
    changesets.sort((a, b) => b.updated - a.updated);  // newest -> oldest
    return changesets;
}
sauce.proxy.export(getAvailableSyncChangesets, {namespace});


// EXPERIMENT
export async function fetchAthleteStatsHistory(athleteId) {
    // If we find no delta of two readings in a <n> day period we stop "searching"
    // for new activity based athlete stats.
    const minSearch = 14 * 86400 * 1000;
    const stats = new Map();
    function same(a, b) {
        return (a && a.weight) === (b && b.weight) && (a && a.ftp) === (b && b.ftp);
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
        const resp = await net.retryFetch(`/activities/${activityId}/power_data`);
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
    return db.ActivityModel.getSyncManifests(processor).map(x => ({...x, data: undefined}));
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


async function setAthleteHistoryValues(athleteId, key, data) {
    const athlete = await athletesStore.get(athleteId, {model: true});
    if (!athlete) {
        throw new Error('Athlete not found: ' + athleteId);
    }
    const clean = athlete.setHistoryValues(key, data);
    await athlete.save();
    const processor = key === 'weight' ? 'extra-streams' : 'athlete-settings';
    await invalidateAthleteSyncState(athleteId, 'local', processor);
    if (athlete.get('syncSettings')) {
        schedSyncChangesetExport(athlete.pk);
    }
    return clean;
}
sauce.proxy.export(setAthleteHistoryValues, {namespace});


const _pendingSyncChangesetExports = new Map();
async function schedSyncChangesetExport(athleteId) {
    clearTimeout(_pendingSyncChangesetExports.get(athleteId));
    const athlete = await athletesStore.get(athleteId);
    if (!athlete || !athlete.syncSettings) {
        return;
    }
    await updateAthlete(athleteId, {syncSettingsTS: null});
    clearTimeout(_pendingSyncChangesetExports.get(athleteId));
    _pendingSyncChangesetExports.set(athleteId, setTimeout(async () => {
        await updateAthlete(athleteId, {syncSettingsTS: Date.now()});
        await exportSyncChangeset(athleteId);
        const f = await meta.get(`device-meta/${sauce.deviceId}`);
        if (!f || Date.now() - f.updated > 7 * 86400_000) {
            await updateDeviceMetaData();
        }
    }, 5000));
}
sauce.proxy.export(schedSyncChangesetExport, {namespace});


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
    const streamManifest = db.ActivityModel.getSyncManifest('streams', 'fetch');
    const activities = new Map((await actsStore.getAllForAthlete(athleteId, {models: true}))
        .map(x => [x.pk, x]));
    for (const a of activities.values()) {
        if (haveStreamsFor.has(a.pk)) {
            if (a.hasSyncErrors('streams')) {
                inFalseErrorState.push(a.pk);
            }
            haveStreamsFor.delete(a.pk);
        } else {
            if (a.hasManifestSyncSuccess(streamManifest)) {
                missingStreamsFor.push(a.pk);
            }
        }
    }
    if (options.repair) {
        const localManifests = db.ActivityModel.getSyncManifests('local');
        for (const id of missingStreamsFor) {
            syncLogsStore.logWarn(athleteId, 'Repairing activity with missing streams:', id);
            const a = activities.get(id);
            a.clearManifestSyncState(streamManifest);
            for (const m of localManifests) {
                a.clearManifestSyncState(m);
            }
            await a.save();
        }
        for (const id of inFalseErrorState) {
            syncLogsStore.logWarn(athleteId, 'Repairing activity with false-error state:', id);
            const a = activities.get(id);
            a.setManifestSyncSuccess(streamManifest);
            for (const m of localManifests) {
                a.clearManifestSyncState(m);
            }
            await a.save();
        }
        for (const id of haveStreamsFor) {
            if (!options.prune) {
                syncLogsStore.logWarn(
                    athleteId, 'Ignoring missing activity repair (use "prune" to override):', id);
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
    const pruned = [];
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
    };
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
    };
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
    };
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


let _peaksGCId;
function schedPeaksGC(mature=15000) {
    clearTimeout(_peaksGCId);
    _peaksGCId = setTimeout(async () => {
        const status = await danglingPeaks({prune: true});
        if (status.pruned.length) {
            console.warn(`Removed ${status.pruned.length} database entries from 'peaks' store`);
        }
    }, mature);
}


async function _invalidateSyncStateEnter(athleteId, processor, name, options) {
    syncLogsStore.logWarn(athleteId, `Invalidating sync state: ${processor}:${name || '*'}`);
    if (!syncManager) {
        return;
    }
    let defaultSyncOptions;
    const job = syncManager.activeJobs.get(athleteId);
    if (job) {
        defaultSyncOptions = {
            noActivityScan: !!job.options.noActivityScan || job.statusHistory.some((x, i) =>
                x.status === 'activity-scan' && i !== job.statusHistory.length - 1),
            noStreamsFetch: !!job.options.noStreamsFetch,
        };
        await job.cancel();
    } else {
        defaultSyncOptions = {
            noActivityScan: true,
            noStreamsFetch: processor === 'local'
        };
    }
    if (!options.disableSync) {
        const athlete = await athletesStore.get(athleteId, {model: true});
        if (athlete && athlete.isEnabled()) {
            return {
                athleteId,
                defaultSyncOptions,
                options,
            };
        }
    }
}


async function _invalidateSyncStateExit(state) {
    if (!state) {
        return;
    }
    await syncAthlete(state.athleteId, {...state.defaultSyncOptions, ...state.options});
}


export async function invalidateAthleteSyncState(athleteId, processor, name, options={}) {
    if (!athleteId || !processor) {
        throw new TypeError("'athleteId' and 'processor' are required args");
    }
    const state = await _invalidateSyncStateEnter(athleteId, processor, name, options);
    await actsStore.invalidateForAthleteWithSync(athleteId, processor, name);
    await _invalidateSyncStateExit(state);
}
sauce.proxy.export(invalidateAthleteSyncState, {namespace});



export async function invalidateActivitySyncState(activityId, processor, name, options={}) {
    if (!activityId || !processor) {
        throw new TypeError("'activityId' and 'processor' are required args");
    }
    const manifests = db.ActivityModel.getSyncManifests(processor, name);
    if (!manifests.length) {
        throw new TypeError('Invalid sync processor/name');
    }
    const activity = await actsStore.get(activityId, {model: true});
    const athleteId = activity.get('athlete');
    const state = await _invalidateSyncStateEnter(athleteId, processor, name, options);
    for (const m of manifests) {
        activity.clearManifestSyncState(m);
    }
    await activity.save();
    await _invalidateSyncStateExit(state);
}
sauce.proxy.export(invalidateActivitySyncState, {namespace});


export async function invalidateSyncState(...args) {
    for (const athlete of await athletesStore.getEnabled()) {
        await invalidateAthleteSyncState(athlete.id, ...args);
    }
}
sauce.proxy.export(invalidateSyncState, {namespace});


export async function activityCounts(athleteId, activities) {
    activities = activities || await actsStore.getAllForAthlete(athleteId, {models: true});
    const streamManifests = db.ActivityModel.getSyncManifests('streams');
    const localManifests = db.ActivityModel.getSyncManifests('local');
    const total = activities.length;
    let imported = 0;
    let unavailable = 0;
    let processed = 0;
    let unprocessable = 0;
    for (const a of activities) {
        let successes = 0;
        for (const m of streamManifests) {
            if (a.hasManifestSyncError(m)) {
                successes = -1;
                break;
            } else if (a.hasManifestSyncSuccess(m)) {
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
            if (a.hasManifestSyncError(m)) {
                successes = -1;
                break;
            } else if (a.hasManifestSyncSuccess(m)) {
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
    constructor(athlete, isSelf, options={}) {
        super();
        this.athlete = athlete;
        this.isSelf = isSelf;
        this.options = options;
        this._cancelEvent = new locks.Event();
        this._rateLimiters = getStreamRateLimiterGroup();
        this._procQueue = new queues.Queue();
        this.running = false;
        this.started = false;
        this.status = undefined;
        this.statusTimestamp = undefined;
        this.statusHistory = [];
        this.niceSaveActivities = sauce.debounced(this.saveActivities);
        this.niceSendProgressEvent = sauce.debounced(this.sendProgressEvent);
        this.setStatus('init');
        this.logDebug(`Sync initialized: ${this.athlete}`);
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

    async cancel() {
        this.setStatus('cancelling');
        this.logWarn('Cancelling sync job:', this.athlete);
        await this.athlete.save({lastSync: Date.now()});  // Prevent immediate restart.
        this._cancelEvent.set();
        await this.wait();
        if (syncManager) {
            syncManager.cancelRefreshRequest(this.athlete.pk);
        }
    }

    cancelled() {
        return this._cancelEvent.isSet();
    }

    run() {
        if (this.started) {
            throw new Error("already started");
        }
        const start = Date.now();
        const tags = [
            this.options.noActivityScan && 'no-activity-scan',
            this.options.noStreamsFetch && 'no-streams-fetch',
        ].filter(x => x);
        const tagsStr = tags.length ? ` [${tags.join(', ')}]` : '';
        this.logInfo(`Starting sync job${tagsStr}: ${this.athlete}`);
        this.started = true;
        this.running = true;
        this._runPromise = this._run().finally(() => {
            this.running = false;
            const duration = Math.round((Date.now() - start) / 1000);
            this.logInfo(`Sync completed [${duration.toLocaleString()}s]: ${this.athlete}`);
        });
        return this._runPromise;
    }

    async _run() {
        this.setStatus('checking-network');
        await Promise.race([net.online(), this._cancelEvent.wait()]);
        if (this._cancelEvent.isSet()) {
            return;
        }
        if (!this.options.noActivityScan) {
            this.setStatus('activity-scan');
            try {
                await this._scanActivities({forceUpdate: this.options.forceActivityUpdate});
            } catch(e) {
                if (!(e instanceof net.CancelledError)) {
                    throw e;
                }
            } finally {
                await this.athlete.save({lastSyncActivityListVersion: activityListVersion});
            }
        }
        if (this._cancelEvent.isSet()) {
            return;
        }
        this.setStatus('processing');
        try {
            await this._processData();
        } catch(e) {
            this.setStatus('error');
            throw e;
        }
        this.setStatus('complete');
        await syncLogsStore.trimLogs(this.athlete.pk, 5000);
    }

    emit(name, data) {
        const ev = new Event(name);
        ev.data = data;
        this.dispatchEvent(ev);
    }

    setStatus(status) {
        const ts = Date.now();
        this.status = status;
        this.statusTimestamp = ts;
        this.statusHistory.push({status, ts});
        this.emit('status', status);
    }

    async retryFetch(urn, options={}) {
        return await net.retryFetch(urn, {cancelEvent: this._cancelEvent, ...options});
    }

    async _scanActivities() {
        const forceUpdate = this.options.forceActivityUpdate;
        const known = forceUpdate ? new Map() : await actsStore.getAllHashesForAthlete(this.athlete.pk);
        const iter = this.isSelf ? this._scanSelfActivitiesIter : this._scanPeerActivitiesIter;
        for await (const batch of iter.call(this, {known})) {
            let adding = 0;
            let updating = 0;
            for (const x of batch) {
                if (known.has(x.id)) {
                    updating++;
                } else {
                    adding++;
                }
                known.set(x.id, x.hash);
            }
            const f = new Intl.DateTimeFormat();
            const range = f.formatRange(
                sauce.data.min(batch.map(x => x.ts)),
                sauce.data.max(batch.map(x => x.ts)));
            if (adding) {
                this.logInfo(`Adding ${adding} activities:`, range);
            }
            if (updating) {
                this.logInfo(`Updating ${updating} activities:`, range);
            }
            await actsStore.updateMany(new Map(batch.map(x => [x.id, x])));
            await this.niceSendProgressEvent();
        }
    }

    async *_scanSelfActivitiesIter({known}) {
        const q = new URLSearchParams({feed_type: 'my_activity'});
        let pageTS = Math.floor(Date.now() / 1000);
        let emptyCount = 0;
        while (!this._cancelEvent.isSet()) {
            const resp = await this.retryFetch(`/dashboard/feed?${q}`);
            let data;
            try {
                data = await resp.json();
            } catch(e) {
                // If the credentials are not valid Strava returns HTML
                // This would seem impossible, but with add-ons like Facebook Containers
                // it can happen and has happened to some users.
                this.logError("Activity feed returned invalid JSON");
                break;
            }
            if (!data.entries.length) {
                break;
            }
            const batch = [];
            let lastTS;
            for (const x of data.entries) {
                if (x.entity === 'Activity') {
                    const entry = this.activityToDatabase(await this.parseFeedActivity(x));
                    if (entry && (!known.has(entry.id) || known.get(entry.id) !== entry.hash)) {
                        batch.push(entry);
                    }
                } else if (x.entity === 'GroupActivity') {
                    for (const a of x.rowData.activities.filter(x => x.athlete_id === this.athlete.pk)) {
                        const entry = this.activityToDatabase(await this.parseFeedGroupActivity(a));
                        if (entry && (!known.has(entry.id) || known.get(entry.id) !== entry.hash)) {
                            batch.push(entry);
                        }
                    }
                } else {
                    this.logDebug("Ignoring non-activity type:", x.entity);
                    continue;
                }
                lastTS = x.cursorData.updated_at;
            }
            // Strava's feed API is not exactly chronological.  Post entity types are out of order and break
            // paging.  Only trust that activity types are chronological and if we can't find any of those,
            // manually backoff the pageTS value until we find something.
            if (lastTS !== undefined) {
                if (!batch.length) {
                    break;  // Normal nothing new state
                }
                pageTS = lastTS;
                emptyCount = 0;
            } else {
                const pageOffset = Math.round(1.5 ** emptyCount++);
                this.logWarn("No chronological activity entries found: Using manual page offset mitigation",
                             pageOffset);
                pageTS -= pageOffset;
            }
            q.set('before', pageTS);
            if (batch.length) {
                yield batch;
            }
        }
    }

    async *_scanPeerActivitiesIter({known}) {
        yield* this._scanPeerActivitiesFromIter(new Date(), known);
        const sentinel = await this.athlete.get('activitySentinel');
        if (!sentinel) {
            // We may have never finished a prior sync so find where we left off..
            const last = await actsStore.getOldestForAthlete(this.athlete.pk);
            if (last) {
                yield* this._scanPeerActivitiesFromIter(new Date(last.ts), known);
            }
        }
    }

    async *_scanPeerActivitiesFromIter(startDate, known) {
        const minEmpty = known.size ? 2 : 16;
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
                await work.put(this._fetchFeedMonth(year, month));
            }
            const batch = [];
            for await (const data of work) {
                if (!data.length) {
                    empty++;
                    continue;
                }
                empty = 0;
                for (const x of data) {
                    if (!known.has(x.id) || x.hash !== known.get(x.id)) {
                        batch.push(x);
                    }
                }
                if (!batch.length) {
                    redundant++;
                } else {
                    redundant = 0;
                }
            }
            if (batch.length) {
                yield batch;
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

    async fetchSelfActivity(id) {
        try {
            const resp = await this.retryFetch(`/athlete/training_activities/${id}`);
            return await resp.json();
        } catch(e) {
            if (e.resp && e.resp.status === 404) {
                return null;
            } else {
                throw e;
            }
        }
    }

    // DEPRECATED...
    async _scanSelfActivitiesLegacy(options={}) {
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
        const knownIds = new Set(forceUpdate ? [] : await actsStore.getAllKeysForAthlete(this.athlete.pk));
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
                    const resp = await this.retryFetch(`/athlete/training_activities?${q}`);
                    try {
                        return await resp.json();
                    } catch(e) {
                        // If the credentials are not valid Strava returns HTML
                        // This would seem impossible, but with add-ons like Facebook Containers
                        // it can happen and has happened to some users.
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
                        // 10-30-2024 Strava change: `type` is now `sport_type`.
                        if (record.sport_type && !record.type) {
                            record.type = record.sport_type;
                        } else {
                            this.logWarn("Strava rolled back breaking change from 10-30-2024?", record);
                        }
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
                const f = new Intl.DateTimeFormat();
                const range = f.formatRange(
                    sauce.data.min(adding.map(x => x.ts)),
                    sauce.data.max(adding.map(x => x.ts)));
                if (forceUpdate) {
                    this.logInfo(`Updating ${adding.length} activities:`, range);
                    await actsStore.updateMany(new Map(adding.map(x => [x.id, x])));
                } else {
                    this.logInfo(`Adding ${adding.length} new activities:`, range);
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

    async parseRawReactProps(raw) {
        return await specialProxy.parseRawReactProps(raw);
    }

    activityToDatabase({id, ts, type, name, ...extra}) {
        if (!id) {
            this.logError(`Invalid activity id for athlete: ${this.athlete.pk}`);
            return;
        }
        let basetype = type && sauce.model.getActivityBaseType(type);
        if (!basetype) {
            this.logError('Unknown activity type: ' + id);
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
            hash: 0,
        };
        data.hash = sauce.hash(JSON.stringify(data));
        return data;
    }

    async parseFeedActivity({activity, cursorData}) {
        const ts = activity.startDate ?
            (new Date(activity.startDate)).getTime() :
            (cursorData.updated_at - (activity.elapsedTime || 0)) * 1000;
        const media = [];
        if (activity.mapAndPhotos?.photoList?.length) {
            for (const x of activity.mapAndPhotos.photoList) {
                if (!x || !x.thumbnail) {
                    continue;
                }
                if (x.video) {
                    // See: https://docs.mux.com/guides/enable-static-mp4-renditions
                    //      https://docs.mux.com/guides/get-images-from-a-video
                    const m = x.video.match(/:\/\/stream\.mux\.com\/(.*?)\.m3u8/);
                    const id = m && m[1];
                    if (id) {
                        // NOTE: The one problem with not using HLS is that we don't have enough
                        // info to know if the video is only available as low or medium mp4 file.
                        let url;
                        let quality;
                        for (quality of ['high', 'medium', 'low']) {
                            const testUrl = `https://stream.mux.com/${id}/${quality}.mp4`;
                            const r = await fetch(testUrl, {method: 'HEAD'});
                            if (r.ok) {
                                url = testUrl;
                                break;
                            }
                        }
                        if (url) {
                            this.logDebug("Found stream.mux.com video service URL:", x.video, new Date(ts));
                            media.push({
                                type: 'video',
                                url,
                                thumbnail: x.thumbnail,
                                muxId: id,
                                muxQuality: quality,
                            });
                        } else {
                            this.logWarn("No acceptable static video URL found:", x.video, new Date(ts));
                        }
                    } else {
                        // 03-2025: Seeing cloudfront based videos now..
                        // 04-2025: Sometimes these are m3u8 playlists, othertimes mp4 files..
                        //          We can use the mp4 files, but the m3u8 files aren't worth the effort
                        //          of doing full HLS playback support.
                        // In test I only ever see .m3u8 or .mp4 but we might as well look for a
                        // few video container extensions that are likely to playback natively.
                        const supportedExts = [
                            'mp4', 'm4v',
                            'mkv', 'webm',
                            'ogv', 'ogg',
                            'mov',
                            'mpeg', 'mpg', 'mp2',
                            '3gp',
                            'ts'
                        ];
                        const unsupportedExts = ['m3u8'];
                        const ext = (x.video.match(/\.([^.\s]+?)$/)?.[1] || '').toLowerCase();
                        if (supportedExts.indexOf(ext) !== -1) {
                            this.logDebug("Found static video URL:", x.video, new Date(ts));
                            media.push({
                                type: 'video',
                                url: x.video,
                                thumbnail: x.thumbnail,
                            });
                        } else if (unsupportedExts.indexOf(ext) !== -1) {
                            this.logWarn("Found unsupported video service URL:", x.video, new Date(ts));
                        } else {
                            this.logError("Unexpected video URL format:", x.video, new Date(ts));
                        }
                    }
                } else if (x.large) {
                    media.push({
                        type: 'image',
                        url: x.large,
                        thumbnail: x.thumbnail,
                    });
                }
            }
        }
        return {
            id: Number(activity.id),
            ts,
            type: activity.type,
            name: activity.activityName,
            description: activity.description ?
                await specialProxy.stripHTML(activity.description) :
                undefined,
            virtual: activity.isVirtual,
            trainer: activity.isVirtual ? true : undefined,
            commute: activity.isCommute,
            map: activity.mapAndPhotos?.activityMap ?
                {url: activity.mapAndPhotos.activityMap.url} :
                undefined,
            media: media.length ? media : undefined,
            elapsedTime: activity.elapsedTime,
        };
    }

    async parseFeedGroupActivity(a) {
        return {
            id: a.activity_id,
            ts: (new Date(a.start_date)).getTime(),
            type: a.type,
            name: a.name,
            description: a.description ? await specialProxy.stripHTML(a.description) : undefined,
            virtual: a.is_virtual,
            trainer: a.is_virtual ? true : undefined,
            commute: a.is_commute,
            map: a.activity_map ? {url: a.activity_map.url} : undefined,
            media: a.photos?.length ? a.photos.map(x => {
                const urlsBySize = Object.entries(x.urls).toSorted((a, b) => a[0] - b[0]).map(x => x[1]);
                return {
                    type: x.static_video_url ? 'video' : 'image',
                    url: x.static_video_url || urlsBySize.at(-1),
                    thumbnail: urlsBySize[0],
                };
            }) : undefined,
            elapsedTime: a.elapsed_time,
        };
    }

    async _fetchFeedMonth(year, month) {
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
            if (!(e instanceof net.CancelledError)) {
                // In some cases Strava just returns 500 for a month.  I suspect it's when the only
                // activity data in a month is private, but it's an upstream problem and we need to
                // treat it like an empty response.
                this.logError(`Upstream activity fetch error: ${this.athlete.pk} [${q}]`);
            }
            return [];
        }
        const raw = data.match(/jQuery\('#interval-rides'\)\.html\((.*)\)/)[1];
        const batch = [];
        const rawProps = raw.match(
            /data-react-class=\\['"]Microfrontend\\['"] data-react-props=\\['"](.+?)\\['"]/);
        let feedEntries;
        try {
            if (rawProps) {
                const data = await this.parseRawReactProps(rawProps[1]);
                feedEntries = data.appContext.preFetchedEntries;
            }
        } catch(e) {
            this.logError('Parse activity feed props error:', e);
        }
        if (feedEntries) {
            try {
                for (const x of feedEntries) {
                    if (x.entity === 'Activity') {
                        batch.push(this.activityToDatabase(await this.parseFeedActivity(x)));
                    } else if (x.entity === 'GroupActivity') {
                        for (const a of x.rowData.activities.filter(x => x.athlete_id === this.athlete.pk)) {
                            batch.push(this.activityToDatabase(await this.parseFeedGroupActivity(a)));
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

    async _processData() {
        const activities = await actsStore.getAllForAthlete(this.athlete.pk, {models: true});
        this.allActivities = new Map(activities.map(x => [x.pk, x]));
        const unfetched = [];
        let deferCount = 0;
        const streamManifest = db.ActivityModel.getSyncManifest('streams', 'fetch');
        for (const a of activities) {
            if (a.isSyncComplete('streams') || a.getManifestSyncError(streamManifest) === noStreamsTag) {
                if (!a.isSyncComplete('local')) {
                    if (!a.hasSyncErrors('local', {blocking: true})) {
                        this._procQueue.putNoWait(a);
                    } else {
                        deferCount++;
                    }
                }
            } else {
                if (!a.hasSyncErrors('streams', {blocking: true})) {
                    unfetched.push(a);
                } else {
                    deferCount++;
                }
            }
        }
        if (deferCount) {
            this.logWarn(`Deferring processing of ${deferCount} activities due to error`);
        }
        const workers = [];
        if (unfetched.length && !this.options.noStreamsFetch) {
            workers.push(this._fetchStreamsWorker(unfetched));
        } else if (!this._procQueue.size) {
            this.logDebug(`No data processing required: ${this.athlete}`);
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
        const manifest = db.ActivityModel.getSyncManifest('streams', 'fetch');
        const localManifests = db.ActivityModel.getSyncManifests('local');
        for (const x of manifest.data) {
            q.append('stream_types[]', x);
        }
        let count = 0;
        for (const activity of activities) {
            if (this._cancelEvent.isSet()) {
                return count;
            }
            let error;
            let data;
            activity.clearManifestSyncState(manifest);
            for (const m of localManifests) {
                activity.clearManifestSyncState(m);
            }
            try {
                data = await this._fetchStreams(activity, q);
            } catch(e) {
                error = e;
            }
            if (data) {
                await streamsStore.putMany(Object.entries(data).map(([stream, data]) => ({
                    activity: activity.pk,
                    athlete: this.athlete.pk,
                    stream,
                    data
                })));
                activity.setManifestSyncSuccess(manifest);
                this._procQueue.putNoWait(activity);
                count++;
            } else if (data === null) {
                if (this.isSelf) {
                    try {
                        const data = await this.fetchSelfActivity(activity.pk);
                        if (data) {
                            this.logDebug(`Using fallback stats for no-streams activity: ${activity.pk}`);
                            activity.set('statsFallback', {
                                activeTime: data.moving_time_raw,
                                altitudeGain: data.elevation_gain_raw,
                                distance: data.distance_raw,
                            });
                        }
                    } catch(e) {
                        error = e;
                    }
                }
                if (!error) {
                    activity.setManifestSyncError(manifest, new Error(noStreamsTag));
                    this._procQueue.putNoWait(activity);
                    count++;
                }
            }
            if (error && !(error instanceof net.CancelledError)) {
                this.logWarn("Fetch streams error (will retry later):", error);
                activity.setManifestSyncError(manifest, error);
            }
            await activity.save();
        }
        this.logInfo(`Completed streams fetch: ${this.athlete}`);
    }

    _localSetSyncError(activities, manifest, e) {
        this.logError(`Top level local processing error (${manifest.name}) v${manifest.version}`, e);
        for (const a of activities) {
            a.setManifestSyncError(manifest, e);
        }
    }

    _localSetSyncDone(activities, manifest) {
        // NOTE: The processor is free to use setManifestSyncError(), but we really can't
        // trust them to consistently use setManifestSyncSuccess().  Failing to do so would
        // be a disaster, so we handle that here.  The model is: Optionally tag the
        // activity as having a sync error otherwise we assume it worked or does
        // not need further processing, so mark it as done (success).
        for (const a of activities) {
            if (!a.hasManifestSyncError(manifest)) {
                a.setManifestSyncSuccess(manifest);
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
                const rate = Math.round(finished.length / (totTime / finished.length / 1000))
                    .toLocaleString();
                this.logDebug(`Processor batch [${m.name}-v${m.version}]: ${elapsed}ms (avg), ` +
                    `${finished.length} activities (${rate}/s)`);
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
        this.batchLimit = 10;
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
                for (const f of [...offFinWaiters, ...incoming]) {
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
            this.batchLimit = Math.min(200, Math.ceil(this.batchLimit * 1.5));
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
                    a.clearManifestSyncState(m);
                }
                for (const [m, activities] of manifestBatches.entries()) {
                    const processor = m.data.processor;
                    const s = Date.now();
                    if (issubclass(processor, processors.OffloadProcessor)) {
                        let proc = offloadedActive.get(processor);
                        if (!proc || proc.stopping) {
                            this.logDebug(`Creating new offload processor: ${m.name}-v${m.version}`);
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
                            proc.start().catch(e => undefined).finally(() => {
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
                        const rate = Math.round(activities.length / ((Date.now() - s) / 1000))
                            .toLocaleString();
                        this.logDebug(`Processor batch [${m.name}-v${m.version}]: ${elapsed}ms, ` +
                            `${activities.length} activities (${rate}/s)`);
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
        done = done || new Set();
        const activities = this.allActivities ? Array.from(this.allActivities.values()) : undefined;
        const counts = await activityCounts(this.athlete.pk, activities);
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


class SyncManager extends EventTarget {
    constructor(currentUser) {
        super();
        const msg = `Starting Sync Manager (v${sauce.version}): ${currentUser}`;
        console.info(msg);
        getEnabledAthletes().then(athletes => {
            for (const x of athletes) {
                syncLogsStore.write('debug', x.id, msg);
                if (x.syncSettings && Date.now() - (x.syncSettingsTS || 0) > 86400_000) {
                    schedSyncChangesetExport(x.id);
                }
            }
        });
        this.refreshInterval = 12 * 3600 * 1000;
        this.refreshErrorBackoff = 1 * 3600 * 1000;
        this.syncJobTimeout = 4 * 60 * 60 * 1000;
        this.maxSyncJobs = navigator.hardwareConcurrency >= 8 ? 4 : 2;
        this.currentUser = currentUser;
        this.activeJobs = new Map();
        this.stopping = false;
        this.stopped = true;
        this._athleteLock = new locks.Lock();
        this._refreshRequests = new Map();
        this._refreshEvent = new locks.Event();
        this._refreshLoop = null;
        sauce.storage.addListener(async (key, newValue, oldValue) => {
            if (this.stopping || key !== 'options') {
                return;
            }
            const manifests = db.ActivityModel.getSyncManifests('local');
            const keys = Array.from(new Set([].concat(...manifests.map(x => x.storageOptionTriggers || []))));
            const oldSig = JSON.stringify(keys.map(x => [x, oldValue && oldValue[x]]));
            const newSig = JSON.stringify(keys.map(x => [x, newValue && newValue[x]]));
            if (oldSig !== newSig) {
                console.info("Sauce options change triggering refresh...");
                for (const m of manifests) {
                    db.ActivityModel.updateSyncManifestStorageOptionsHash(m);
                }
                const athletes = await athletesStore.getEnabled();
                for (const x of athletes) {
                    this.refreshRequest(x.id, {noActivityScan: true});
                }
            }
        });
    }

    async stop() {
        this.stopping = true;
        for (const x of this.activeJobs.values()) {
            x.cancel();
        }
        this._refreshEvent.set();
        await this.join();
        this.stopped = true;
        console.debug("Sync Manager stopped:", this.currentUser);
    }

    start() {
        if (!this.stopped || this._refreshLoop) {
            throw new TypeError("Not stopped");
        }
        this.stopped = false;
        this.stopping = false;
        const manifests = db.ActivityModel.getSyncManifests('local');
        for (const m of manifests) {
            db.ActivityModel.updateSyncManifestStorageOptionsHash(m);
        }
        this._refreshLoop = this.refreshLoop();
        this._refreshLoop.catch(e =>
            console.error('Unexpected sync engine refresh loop error:', e.stack));
        schedPeaksGC(600000);
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
            db.ActivityModel.getSyncManifests('local'),
            db.ActivityModel.getSyncManifests('streams'));
        const records = [];
        for (const x of manifests) {
            records.push(`${x.processor}-${x.name}-v${x.version}`);
        }
        records.sort();
        const text = new TextEncoder();
        const buf = await crypto.subtle.digest('SHA-256', text.encode(JSON.stringify(records)));
        return Array.from(new Uint8Array(buf)).map(x => x.toString(16).padStart(2, '0')).join('');
    }

    nextSyncDeadline(athlete) {
        const now = Date.now();
        const lastError = athlete.get('lastSyncError');
        const deferred = lastError ? this.refreshErrorBackoff - (now - lastError) : 0;
        const next = this.refreshInterval - (now - athlete.get('lastSync'));
        return Math.max(0, next, deferred);
    }

    runningJobsCount() {
        let c = 0;
        for (const x of this.activeJobs.values()) {
            if (x.running) {
                c++;
            }
        }
        return c;
    }

    async refreshLoop() {
        let errorBackoff = 1000;
        const syncHash = await this.syncVersionHash();
        let activeTimerStart;
        while (!this.stopping) {
            this._refreshEvent.clear();
            const athletes = await athletesStore.getEnabled({models: true});
            for (const x of Array.from(this.activeJobs.values())) {
                if (!x.running && (x.cancelled() || x.started)) {
                    this._removeSyncJob(x);
                }
            }
            try {
                this._enqueueJobs(athletes, syncHash);
            } catch(e) {
                console.error('Sync job creation error:', e);
                await Promise.race([aggressiveSleep(errorBackoff *= 1.5), this._refreshEvent.wait()]);
                continue;
            }
            if (this.activeJobs.size && !activeTimerStart) {
                activeTimerStart = Date.now();
            }
            for (const x of this.activeJobs.values()) {
                if (this.runningJobsCount() >= this.maxSyncJobs) {
                    break;
                } else if (!x.started && !x.cancelled()) {
                    const {promise} = await this._createSyncJobRunner(x, syncHash);
                    promise.catch(e => console.error('Sync job run error:', e));
                }
            }
            if (this.activeJobs.size || !athletes.length) {
                await this._refreshEvent.wait();
            } else {
                if (activeTimerStart) {
                    const elapsed = Math.round((Date.now() - activeTimerStart) / 1000);
                    console.info(`Sync engine reached idle after: ${elapsed.toLocaleString()} seconds`);
                    activeTimerStart = null;
                }
                const nextSyncDeadline = Math.min(...athletes.map(x => this.nextSyncDeadline(x)));
                const next = Math.round(nextSyncDeadline / 1000 / 60).toLocaleString();
                console.info(`Next Sync Manager refresh in ${next} minute(s)...`);
                await Promise.race([aggressiveSleep(nextSyncDeadline), this._refreshEvent.wait()]);
            }
        }
    }

    _enqueueJobs(athletes, syncHash) {
        for (const a of athletes) {
            const refreshRequest = this._refreshRequests.get(a.pk);
            this._refreshRequests.delete(a.pk);
            if (this.activeJobs.has(a.pk)) {
                continue;
            }
            const forceActivityUpdate = a.get('lastSyncActivityListVersion') !== activityListVersion;
            if (!!refreshRequest ||
                a.get('lastSyncVersionHash') !== syncHash ||
                forceActivityUpdate ||
                this.nextSyncDeadline(a) <= 0) {
                this._addSyncJob(a, {forceActivityUpdate, ...refreshRequest});
            }
        }
    }

    _addSyncJob(athlete, options) {
        const isSelf = this.currentUser === athlete.pk;
        const syncJob = new SyncJob(athlete, isSelf, options);
        syncJob.addEventListener('status', ev => this.emitForAthlete(athlete, 'status', ev.data));
        syncJob.addEventListener('progress', ev => this.emitForAthlete(athlete, 'progress', ev.data));
        syncJob.addEventListener('ratelimiter', ev => this.emitForAthlete(athlete, 'ratelimiter', ev.data));
        syncJob.addEventListener('log', ev => this.emitForAthlete(athlete, 'log', ev.data));
        syncJob.setStatus('queued');
        this.activeJobs.set(athlete.pk, syncJob);
        this.emitForAthlete(athlete, 'active', {active: true, athlete: athlete.data});
        return syncJob;
    }

    _removeSyncJob(syncJob) {
        const key = syncJob.athlete.pk;
        if (!this.activeJobs.has(key)) {
            return;
        }
        const assertSameJob = this.activeJobs.get(key);
        if (syncJob !== assertSameJob) {
            throw new Error('sync job life cycle internal error');
        }
        this.activeJobs.delete(key);
        this.emitForAthlete(syncJob.athlete, 'active', {active: false, athlete: syncJob.athlete.data});
    }

    async _createSyncJobRunner(syncJob, syncHash) {
        const athlete = syncJob.athlete;
        // Clear lastSync so runtime terminations will resume immediately on next startup.
        await this.saveAthleteModel(athlete, {lastSync: 0});
        syncJob.run();
        const promise = (async () => {
            try {
                await Promise.race([sleep(this.syncJobTimeout), syncJob.wait()]);
            } catch(e) {
                syncJob.logError('Sync job error:', e.stack);
                athlete.set('lastSyncError', Date.now());
                this.emitForAthlete(athlete, 'error', {error: e.message});
            } finally {
                if (syncJob.running) {
                    // Timeout hit, just cancel and reschedule soon.  This is a paranoia based
                    // protection for future mistakes or edge cases that might lead to a sync
                    // job hanging indefinitely.   NOTE: it will be more common that this is
                    // triggered by initial sync jobs that hit the large rate limiter delays.
                    // There is no issue here since we just reschedule the job in either case.
                    syncJob.logWarn('Sync job timeout');
                    await syncJob.cancel();
                    this._refreshRequests.set(athlete.pk, {});  // retry...
                } else {
                    athlete.set('lastSyncVersionHash', syncHash);
                }
                athlete.set('lastSync', Date.now());
                await this.saveAthleteModel(athlete);
                this._refreshEvent.set();
            }
        })();
        return {promise};  // must wrap to avoid Promise chaining
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

    async saveAthleteModel(athlete, obj) {
        if (!athlete) {
            throw new TypeError('Athlete Model arg required');
        }
        await this._athleteLock.acquire();
        try {
            await athlete.save(obj);
        } finally {
            this._athleteLock.release();
        }
    }

    async enableAthlete(id) {
        if (!id) {
            throw new TypeError('Athlete ID arg required');
        }
        syncLogsStore.logInfo(id, `Enabling athlete sync`);
        await invalidateAthleteSyncState(id, 'local');
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
        syncLogsStore.logInfo(id, `Disabling athlete sync`);
        await this.updateAthlete(id, {sync: DBFalse});
        if (this.activeJobs.has(id)) {
            const syncJob = this.activeJobs.get(id);
            await syncJob.cancel();
        }
        await invalidateAthleteSyncState(id, 'local');
        this._refreshEvent.set();
        this.emitForAthleteId(id, 'disable');
        schedPeaksGC();
    }
}


class SyncController extends sauce.proxy.Eventing {
    constructor(athleteId) {
        super();
        this.athleteId = athleteId;
        this._syncListeners = [];
        const job = syncManager && syncManager.activeJobs.get(athleteId);
        this.state = {
            active: !!job,
            status: job ? job.status : undefined,
            error: null
        };
        if (syncManager) {
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

    isSyncActive() {
        return !!(syncManager && syncManager.activeJobs.has(this.athleteId));
    }

    async cancel() {
        if (syncManager) {
            const job = syncManager.activeJobs.get(this.athleteId);
            if (job) {
                await job.cancel();
                return true;
            }
        }
    }

    rateLimiterResumes() {
        if (this.isSyncActive()) {
            const g = streamRateLimiterGroup;
            if (g && g.suspended()) {
                return streamRateLimiterGroup.resumes();
            }
        }
    }

    rateLimiterSuspended() {
        if (this.isSyncActive()) {
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
        // XXX dangerous. Can become out of congruence with syncManager
        return this.state;
    }

    getStatus() {
        const job = syncManager && syncManager.activeJobs.get(this.athleteId);
        return job ? job.status : undefined;
    }

    async getLogs(options) {
        return await syncLogsStore.getLogs(this.athleteId, options);
    }
}
sauce.proxy.export(SyncController, {namespace});


export async function updateDeviceMetaData() {
    let location;
    try {
        const iploc = await (await fetch('https://ipapi.co/json')).json();
        location = {
            region: iploc.region,
            country: iploc.country,
        };
    } catch(e) {
        console.warn("Failed to get geoip info", e);
    }
    const data = {
        location,
        ...sauce.deviceInfo(),
    };
    const filename = `device-meta/${sauce.deviceId}`;
    const file = await meta.get(filename);
    if (!file) {
        await meta.create(filename, data);
    } else {
        await meta.save(file, data);
    }
}
sauce.proxy.export(updateDeviceMetaData, {namespace});


export async function getDevicesMetaData() {
    return await meta.getAll('device-meta/');
}
sauce.proxy.export(getDevicesMetaData, {namespace});


export async function getDeviceMetaData(deviceId) {
    return await meta.get(`device-meta/${deviceId}`);
}
sauce.proxy.export(getDeviceMetaData, {namespace});


export function startSyncManager(id) {
    if (syncManager) {
        throw new Error("SyncManager already exists");
    }
    if (id) {
        syncManager = new SyncManager(id);
        syncManager.start();
    }
}


const _syncManagerLock = new locks.Lock();
export async function stopSyncManager() {
    await _syncManagerLock.acquire();
    try {
        await _stopSyncManager();
    } finally {
        _syncManagerLock.release();
    }
}


async function _stopSyncManager() {
    if (!syncManager) {
        return;
    }
    console.info("Stopping Sync Manager...");
    const mgr = syncManager;
    syncManager = null;
    await mgr.stop();
}


export function hasSyncManager() {
    return !!syncManager;
}


export function getSyncManager() {
    return syncManager;
}


export async function restartSyncManager(id) {
    await _syncManagerLock.acquire();
    try {
        if (syncManager) {
            if (syncManager.currentUser === id) {
                return;
            }
            console.info("Current user changed:", syncManager.currentUser, '->', id);
            await _stopSyncManager();
        }
        if (id != null) {
            startSyncManager(id);
        }
    } finally {
        _syncManagerLock.release();
    }
}
