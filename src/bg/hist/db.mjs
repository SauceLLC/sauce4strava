/* global sauce */
/* eslint no-unreachable-loop: off */

import * as meta from '../meta.mjs';

const defaultSyncErrorBackoff = 300 * 1000;  // Actual is (<value-ms> * 2^errorCount)


function setUnion(...sets) {
    const union = new Set();
    for (const s of sets) {
        for (const x of s) {
            union.add(x);
        }
    }
    return union;
}


export class ActivityModel extends sauce.db.Model {

    static addSyncManifest(desc) {
        if (!this._syncManifests) {
            this._syncManifests = {};
        }
        if (!this._syncManifests[desc.processor]) {
            this._syncManifests[desc.processor] = {};
        }
        const manifest = this._syncManifests[desc.processor][desc.name] = {
            errorBackoff: defaultSyncErrorBackoff,
            ...desc,
        };
        if (sauce.options) {
            this.updateSyncManifestStorageOptionsHash(manifest);
        }
        return manifest;
    }

    static getSyncManifests(processor, name) {
        if (!processor) {
            throw new TypeError("processor required");
        }
        const proc = this._syncManifests[processor];
        if (name) {
            const m = proc[name];
            return m ? [m] : [];
        } else {
            return Object.values(proc);
        }
    }

    static getSyncManifest(processor, name) {
        if (!processor || !name) {
            throw new TypeError("processor and name required");
        }
        return this.getSyncManifests(processor, name)[0];
    }

    static updateSyncManifestStorageOptionsHash(manifest) {
        if (manifest.storageOptionTriggers) {
            const bundle = manifest.storageOptionTriggers.map(x => [x, sauce.options[x]]);
            manifest.storageOptionHash = sauce.hash(JSON.stringify(bundle));
        } else {
            manifest.storageOptionHash = null;
        }
    }

    // Who we depend on...
    static requiredManifests(processor, name) {
        const manifests = new Set();
        const bubble = deps => {
            for (const x of deps) {
                const m = this.getSyncManifest(processor, x);
                manifests.add(m);
                if (m.depends) {
                    bubble(m.depends);
                }
            }
        };
        const root = this.getSyncManifest(processor, name);
        if (root.depends) {
            bubble(root.depends);
        }
        return [...manifests];
    }

    // Who depends on us...
    static dependantManifests(processor, name) {
        if (!this._dependantManifestsCache) {
            this._dependantManifestsCache = new Map();
        }
        const cacheKey = processor + name;
        if (this._dependantManifestsCache.has(cacheKey)) {
            return this._dependantManifestsCache.get(cacheKey);
        }
        const allManifests = this.getSyncManifests(processor);
        const manifests = new Set();
        const cascade = _name => {
            for (const x of allManifests) {
                if (x.depends && x.depends.includes(_name)) {
                    manifests.add(x);
                    cascade(x.name);
                }
            }
        };
        cascade(name);
        const r = Object.freeze(Array.from(manifests));
        this._dependantManifestsCache.set(cacheKey, r);
        return r;
    }

    toString() {
        if (this.data && this.data.ts) {
            return `<Activity (${this.pk}) - ${(new Date(this.data.ts)).toLocaleDateString()}>`;
        } else {
            return `<Activity (${this.pk})>`;
        }
    }

    getLocaleDay() {
        return sauce.date.toLocaleDayDate(this.data.ts);
    }

    getTSS() {
        return sauce.model.getActivityTSS(this.data);
    }

    _getManifestSyncState(manifest) {
        const processor = manifest.processor;
        const name = manifest.name;
        if (!processor || !name) {
            throw new TypeError("processor and name required");
        }
        return this.data.syncState &&
            this.data.syncState[processor] &&
            this.data.syncState[processor][name];
    }

    _setManifestSyncState(manifest, state, options={}) {
        const processor = manifest.processor;
        const name = manifest.name;
        if (!processor || !name) {
            throw new TypeError("processor and name required");
        }
        const hasError = state.error && state.error.ts;
        if (hasError && !state.version) {
            throw new TypeError("Cannot set 'error' without 'version'");
        }
        if (!options.noRecurse) {
            for (const dep of this.constructor.dependantManifests(manifest.processor, manifest.name)) {
                // It might be safe to clear deps in error state too, but I'm being
                // paranoid for now in the offchance that I'm missing a way that this
                // could break backoff handling (i.e. runaway processing).
                if (!this.hasManifestSyncError(dep)) {
                    this.clearManifestSyncState(dep);
                }
            }
        }
        const sync = this.data.syncState = this.data.syncState || {};
        const proc = sync[processor] = sync[processor] || {};
        proc[name] = state;
        this._updated.add('syncState');
    }

    setManifestSyncSuccess(manifest) {
        const state = this._getManifestSyncState(manifest) || {};
        if (state.error && state.error.ts) {
            throw new TypeError("'clearManifestSyncState' not used before 'setManifestSyncSuccess'");
        }
        delete state.error;
        state.version = manifest.version;
        state.storageOptionHash = manifest.storageOptionHash;
        this._setManifestSyncState(manifest, state);
    }

    setManifestSyncError(manifest, e) {
        const state = this._getManifestSyncState(manifest) || {};
        state.version = manifest.version;
        const error = state.error = state.error || {count: 0};
        error.count++;
        error.ts = Date.now();
        error.message = e.message;
        this._setManifestSyncState(manifest, state);
    }

    hasManifestSyncSuccess(manifest) {
        // WARNING this is different than asking if the sync is dirty.
        // This only asks if it HAS succeeded.
        const state = this._getManifestSyncState(manifest);
        return !!(state && state.version === manifest.version && !(state.error && state.error.ts));
    }

    getManifestSyncError(manifest) {
        const state = this._getManifestSyncState(manifest);
        const error = state && state.error;
        return (error && error.ts) ? (error.message || 'error') : undefined;
    }

    hasManifestSyncError(manifest, {blocking}={}) {
        const state = this._getManifestSyncState(manifest);
        const error = state && state.error;
        if (error && error.ts) {
            if (blocking) {
                const backoff = manifest.errorBackoff * (2 ** error.count);
                const deferredUntil = error.ts + backoff;
                if (Date.now() < deferredUntil) {
                    return true;
                }
            } else {
                return true;
            }
        }
        return false;
    }

    clearManifestSyncState(manifest) {
        const state = this._getManifestSyncState(manifest);
        if (state) {
            let altered;
            if (state.error && state.error.ts) {
                // NOTE: Do not delete error.count.  We need this to perform backoff
                delete state.error.ts;
                delete state.error.message;
                altered = true;
            }
            if (state.version) {
                delete state.version;
                altered = true;
            }
            if (altered) {
                this._setManifestSyncState(manifest, state);
            }
        }
    }

    isManifestSyncStateDirty(manifest) {
        const state = this._getManifestSyncState(manifest);
        return !!(
            !state ||
            state.error?.ts ||
            state.version !== manifest.version ||
            state.storageOptionHash !== manifest.storageOptionHash
        );
    }

    hasSyncErrors(processor, options) {
        const manifests = this.constructor.getSyncManifests(processor);
        return manifests.some(m => this.hasManifestSyncError(m, options));
    }

    nextAvailManifest(processor) {
        const manifests = this.constructor.getSyncManifests(processor);
        if (!manifests) {
            throw new TypeError("Invalid sync processor");
        }
        const completed = new Set();
        const pending = new Set();
        // Pass 1: Compile completed and pending sets without dep evaluation.
        for (const m of manifests) {
            if (this.isManifestSyncStateDirty(m)) {
                pending.add(m.name);
            } else {
                completed.add(m.name);
            }
        }
        if (!pending.size) {
            return;
        }
        const manifestsMap = new Map(manifests.map(x => [x.name, x]));
        const tainted = new Set();
        let idle;
        do {
            idle = true;
            // Pass 2: Triage the deps until no further taints are discovered...
            for (const name of setUnion(completed, pending)) {
                const manifest = manifestsMap.get(name);
                if (!manifest.depends) {
                    continue;
                }
                for (const x of setUnion(pending, tainted)) {
                    if (manifest.depends.includes(x)) {
                        completed.delete(name);
                        pending.delete(name);
                        tainted.add(name);
                        idle = false;
                        break;
                    }
                }
            }
        } while (!idle);
        for (const name of pending) {
            const m = manifestsMap.get(name);
            if (this.hasManifestSyncError(m, {blocking: true})) {
                return;  // Unavailable until error backoff expires.
            } else {
                return m;
            }
        }
    }

    isSyncComplete(processor) {
        const manifests = this.constructor.getSyncManifests(processor);
        return manifests.every(x => !this.isManifestSyncStateDirty(x));
    }
}


export class AthleteModel extends sauce.db.Model {
    toString() {
        if (this.data && this.data.name) {
            return `<${this.data.name.trim()} (${this.pk})>`;
        } else {
            return `<Athlete (${this.pk})>`;
        }
    }

    setHistoryValues(key, values) {
        values.sort((a, b) => b.ts - a.ts);
        this.set(key + 'History', values);
        return values;
    }

    isEnabled() {
        return !!this.data.sync;
    }

    getFTPAt(ts, basetype) {
        return sauce.model.getAthleteFTPAt(this.data, ts, basetype);
    }

    getWeightAt(ts) {
        return sauce.model.getAthleteWeightAt(this.data, ts);
    }

    setFTPHistory(data) {
        return this.setHistoryValues('ftp', data);
    }

    setWeightHistory(data) {
        return this.setHistoryValues('weight', data);
    }

    async save(...args) {
        await meta.load();
        let metaId = this.get('metaId');
        if (!metaId) {
            const entries = await meta.get(`athlete-${this.pk}`);
            let entry = entries[0];
            if (!entry) {
                entry = await meta.create(`athlete-${this.pk}`);
            }
            metaId = entry.id;
            this.set('metaId', metaId);
        }
        const ret = await super.save(...args);
        await meta.save(metaId, this.data);
        return ret;
    }
}


export class HistDatabase extends sauce.db.Database {
    get migrations() {
        return [{
            version: 1,
            migrate: (idb, t, next) => {
                let store = idb.createObjectStore("streams", {keyPath: ['activity', 'stream']});
                store.createIndex('activity', 'activity');
                store.createIndex('athlete-stream', ['athlete', 'stream']);
                store = idb.createObjectStore("activities", {keyPath: 'id'});
                store.createIndex('athlete-ts', ['athlete', 'ts']);
                next();
            }
        }, {
            version: 2,
            migrate: (idb, t, next) => {
                const store = t.objectStore("streams");
                store.createIndex('athlete', 'athlete');
                next();
            }
        }, {
            version: 3,
            migrate: (idb, t, next) => {
                const store = t.objectStore("activities");
                store.createIndex('athlete-basetype-ts', ['athlete', 'basetype', 'ts']);
                next();
            }
        },
        // Version 4 was deprecated in dev.
        {
            version: 5,
            migrate: (idb, t, next) => {
                const store = idb.createObjectStore("athletes", {keyPath: 'id'});
                store.createIndex('sync', 'sync');
                next();
            }
        },
        // Versions 6 -> 25 were deprecated in dev.
        {
            version: 26,
            migrate: (idb, t, next) => {
                const store = idb.createObjectStore("peaks", {keyPath: ['activity', 'type', 'period']});
                store.createIndex('activity', 'activity');
                store.createIndex('athlete-type-period-value', ['athlete', 'type', 'period', 'value']);
                store.createIndex('type-period-value', ['type', 'period', 'value']);
                store.createIndex('athlete-activitytype-type-period-value',
                                  ['athlete', 'activityType', 'type', 'period', 'value']);
                store.createIndex('activitytype-type-period-value',
                                  ['activityType', 'type', 'period', 'value']);
                next();
            }
        }, {
            version: 27,
            migrate: (idb, t, next) => {
                const store = t.objectStore("peaks");
                store.createIndex('athlete', 'athlete');
                next();
            }
        }, {
            version: 28,
            migrate: (idb, t, next) => {
                const store = t.objectStore("peaks");
                store.deleteIndex('athlete-activitytype-type-period-value');
                store.deleteIndex('activitytype-type-period-value');
                store.createIndex('athlete-type-period-ts', ['athlete', 'type', 'period', 'ts']);
                store.createIndex('type-period-ts', ['type', 'period', 'ts']);
                next();
            }
        }, {
            version: 29,
            migrate: (idb, t, next) => {
                const store = t.objectStore("peaks");
                store.deleteIndex('athlete-type-period-value', ['athlete', 'type', 'period', 'value']);
                store.deleteIndex('type-period-value', ['type', 'period', 'value']);
                next();
            }
        }, {
            version: 30,
            migrate: (idb, t, next) => {
                const store = idb.createObjectStore("sync-logs", {autoIncrement: true});
                store.createIndex('athlete-ts', ['athlete', 'ts']);
                next();
            }
        },
        // Version 31 was deprecated in dev.
        {
            version: 32,
            migrate: (idb, t, next) => {
                const store = t.objectStore("activities");
                store.createIndex('athlete-id-hash', ['athlete', 'id', 'hash']);
                next();
            }
        }];
    }
}

const histDatabase = new HistDatabase('SauceHist');


export class StreamsStore extends sauce.db.DBStore {
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
        const iter = options.keys ? this.keys : this.values;
        for await (const x of iter.call(this, q, options)) {
            yield x;
        }
    }

    async *manyByAthlete(athlete, streams, options={}) {
        const buffer = new Map();
        const ready = [];
        let wake;
        function add(v) {
            ready.push(v);
            if (wake) {
                wake();
            }
        }
        Promise.all(streams.map(async stream => {
            for await (const entry of this.byAthlete(athlete, stream)) {
                const o = buffer.get(entry.activity);
                if (o === undefined) {
                    buffer.set(entry.activity, {[stream]: entry.data});
                } else {
                    o[stream] = entry.data;
                    if (Object.keys(o).length === streams.length) {
                        add({
                            athlete,
                            activity: entry.activity,
                            streams: o
                        });
                        buffer.delete(entry.activity);
                    }
                }
            }
        })).then(() => add(null));
        while (true) {
            while (ready.length) {
                const v = ready.shift();
                if (!v) {
                    return;
                }
                yield v;
            }
            await new Promise(resolve => wake = resolve);
        }
    }

    async getAllKeysForAthlete(athlete, options={}) {
        const q = IDBKeyRange.only(athlete);
        options.index = 'athlete';
        return await this.getAllKeys(q, options);
    }

    async getForActivity(activityId, options={}) {
        const data = await this.getAll(activityId, {index: 'activity', ...options});
        return Object.fromEntries(data.map(({stream, data}) => [stream, data]));
    }

    async getManyForActivities(activityIds, options={}) {
        const data = await this.getAllMany(activityIds, {index: 'activity', ...options});
        return data.map(x => Object.fromEntries(x.map(({stream, data}) => [stream, data])));
    }
}


export class PeaksStore extends sauce.db.DBStore {
    constructor() {
        super(histDatabase, 'peaks');
    }

    makeTimeFilter(options={}) {
        const start = options.start;
        const end = options.end;
        if (start && end) {
            return x => x.value.ts >= start && x.value.ts <= end;
        } else if (start) {
            return x => x.value.ts >= start;
        } else if (end) {
            return x => x.value.ts <= start;
        }
    }

    async *byAthlete(athlete, options={}) {
        const q = IDBKeyRange.only(athlete);
        const iter = options.keys ? this.keys : this.values;
        for await (const x of iter.call(this, q, {index: 'athlete', ...options})) {
            yield x;
        }
    }

    getDirectionForType(type) {
        if (['pace', 'gap'].includes(type)) {
            return 'next';
        } else {
            return 'prev';
        }
    }

    orderedAndTrimmed(peaks, type, options={}) {
        // Handle non-numeric types that have on occasion crept in.  Yes, we should fix all these
        // cases upstream before they get into the database, but the chance of it happening is
        // non-zero with the way I hack on this, so be careful about sorting properly here in
        // the event of value===undefined.
        if (options.activityType) {
            peaks = peaks.filter(x => x.activityType === options.activityType);
        }
        if (options.skipEstimates) {
            peaks = peaks.filter(x => !x.estimate);
        }
        if (this.getDirectionForType(type) === 'prev') {
            peaks.sort((a, b) => (b.value || 0) - (a.value || 0));
        } else {
            peaks.sort((a, b) => (a.value || 0) - (b.value || 0));
        }
        const skip = options.skip || 0;
        if (options.limit + skip) {
            peaks.length = Math.min(peaks.length, options.limit + skip);
        }
        peaks.forEach((x, i) => x.rank = i + 1);
        return skip ? peaks.slice(skip) : peaks;
    }

    async getForAthlete(athleteId, type, period, options={}) {
        if (typeof period !== 'number') {
            throw new TypeError("Period must be a number");
        }
        const q = IDBKeyRange.bound(
            [athleteId, type, period, options.start || -Infinity],
            [athleteId, type, period, options.end || Infinity]);
        const peaks = await this.getAll(q, {
            index: 'athlete-type-period-ts',
            ...options,
            limit: undefined
        });
        return this.orderedAndTrimmed(peaks, type, options);
    }

    async getFor(type, period, options={}) {
        if (typeof period !== 'number') {
            throw new TypeError("Period must be a number");
        }
        const q = IDBKeyRange.bound(
            [type, period, options.start || -Infinity],
            [type, period, options.end || Infinity]);
        const peaks = await this.getAll(q, {
            index: 'type-period-ts',
            ...options,
            limit: undefined
        });
        return this.orderedAndTrimmed(peaks, type, options);
    }

    async getForActivity(activityId, options={}) {
        return await this.getAll(activityId, {index: 'activity', ...options});
    }

    async getForActivities(activityIds, options={}) {
        const {type, period} = options;
        if (type && period) {
            if (Array.isArray(period)) {
                if (period.length !== 2 || period[0] > period[1]) {
                    throw new TypeError('period array argument should be: [low, high]');
                }
                return await this.getAllMany(activityIds.map(id =>
                    IDBKeyRange.bound([id, type, period[0]], [id, type, period[1]])), options);
            } else {
                const peaks = await this.getMany(activityIds.map(id => [id, type, period]), options);
                return peaks.map(x => x ? [x] : []);
            }
        } else if (type) {
            return await this.getAllMany(activityIds.map(id =>
                IDBKeyRange.bound([id, type, 0], [id, type, Infinity])), options);
        } else if (period) {
            throw new Error("period without type unsupported");
        } else {
            return await this.getAllMany(activityIds, {index: 'activity', ...options});
        }
    }

    async deleteForActivity(activityId) {
        return await this.delete(activityId, {index: 'activity'});
    }

    async deleteForAthlete(athleteId) {
        return await this.delete(athleteId, {index: 'athlete'});
    }
}


export class ActivitiesStore extends sauce.db.DBStore {
    constructor() {
        super(histDatabase, 'activities', {Model: ActivityModel});
    }

    _queryForAthlete(athlete, inOptions) {
        let q;
        const options = Object.assign({}, inOptions);
        const start = options.start || -Infinity;
        const end = options.end || Infinity;
        if (options.type) {
            q = IDBKeyRange.bound(
                [athlete, options.type, start],
                [athlete, options.type, end],
                options.excludeLower, options.excludeUpper);
            options.index = 'athlete-basetype-ts';
        } else {
            q = IDBKeyRange.bound([athlete, start], [athlete, end],
                                  options.excludeLower, options.excludeUpper);
            options.index = 'athlete-ts';
        }
        return [q, options];
    }

    async *byAthlete(athlete, options={}) {
        const iter = options.keys ? this.keys : this.values;
        for await (const x of iter.call(this, ...this._queryForAthlete(athlete, options))) {
            yield x;
        }
    }

    async getAllKeysForAthlete(athlete, options={}) {
        return await this.getAllKeys(...this._queryForAthlete(athlete, options));
    }

    async getAllHashesForAthlete(athlete, options={}) {
        const q = IDBKeyRange.bound([athlete, -Infinity, -Infinity], [athlete, Infinity, Infinity]);
        const keys = await this.getAllKeys(q, {index: 'athlete-id-hash', indexKey: true});
        return new Map(keys.map(x => [x[1], x[2]]));
    }

    async getAllForAthlete(athlete, options={}) {
        return await this.getAll(...this._queryForAthlete(athlete, options));
    }

    async *siblings(actThing, options={}) {
        let act;
        if (actThing instanceof ActivityModel) {
            act = actThing.data;
        } else if (typeof actThing === 'number') {
            console.warn("DEPRECATED");
            act = await this.get(actThing, options); // uses a full transaction.
        } else {
            act = actThing;
        }
        let start;
        let end;
        if (options.direction === 'prev') {
            options.excludeUpper = true;
            start = -Infinity;
            end = act.ts;
        } else {
            options.excludeLower = true;
            start = act.ts;
            end = Infinity;
        }
        yield *this.byAthlete(act.athlete, Object.assign({start, end}, options));
    }

    async getNextSibling(actThing, options={}) {
        for await (const x of this.siblings(actThing, {models: options.model, ...options})) {
            return x;
        }
    }

    async getPrevSibling(actThing, options={}) {
        for await (const x of this.siblings(actThing, {direction: 'prev',
                                                       models: options.model,
                                                       ...options})) {
            return x;
        }
    }

    async invalidateForAthleteWithSync(athlete, processor, name) {
        const activities = await this.getAllForAthlete(athlete, {models: true});
        const manifests = this.Model.getSyncManifests(processor, name);
        for (const a of activities) {
            for (const m of manifests) {
                a.clearManifestSyncState(m);
            }
        }
        await this.saveModels(activities);
    }

    async getOldestForAthlete(athlete, options={}) {
        for await (const x of this.byAthlete(athlete, {models: options.model, ...options})) {
            return x;
        }
    }

    async getNewestForAthlete(athlete, options={}) {
        for await (const x of this.byAthlete(athlete, {direction: 'prev',
                                                       models: options.model,
                                                       ...options})) {
            return x;
        }
    }

    async deleteForAthlete(athlete) {
        const q = IDBKeyRange.bound([athlete, -Infinity], [athlete, Infinity]);
        return await this.delete(q, {index: 'athlete-ts'});
    }

    async countForAthlete(athlete) {
        const q = IDBKeyRange.bound([athlete, -Infinity], [athlete, Infinity]);
        return await this.count(q, {index: 'athlete-ts'});
    }

    async countTypesForAthlete(athlete, options={}) {
        if (!this.db.started) {
            await this.db.start();
        }
        const work = [];
        const idbStore = this._getIDBStore('readonly');
        const start = options.start || -Infinity;
        const end = options.end || Infinity;
        const basetypes = ['ride', 'run', 'swim', 'workout'];
        for (const type of basetypes) {
            const q = IDBKeyRange.bound([athlete, type, start], [athlete, type, end]);
            work.push(this.count(q, {index: 'athlete-basetype-ts', idbStore}).then(count =>
                ({type, count})));
        }
        return await Promise.all(work);
    }
}


export class AthletesStore extends sauce.db.DBStore {
    constructor() {
        super(histDatabase, 'athletes', {Model: AthleteModel});
    }

    async getEnabled(options={}) {
        const athletes = [];
        const q = IDBKeyRange.only(1);
        options.index = 'sync';
        for await (const x of this.values(q, options)) {
            athletes.push(x);
        }
        return athletes;
    }
}


export class SyncLogsStore extends sauce.db.DBStore {
    constructor() {
        super(histDatabase, 'sync-logs');
    }

    async getLogs(athleteId, {limit}={}) {
        let q;
        if (athleteId != null) {
            q = IDBKeyRange.bound([athleteId, -Infinity], [athleteId, Infinity]);
        } else {
            q = IDBKeyRange.bound([-Infinity, -Infinity], [Infinity, Infinity]);
        }
        const logs = [];
        for await (const x of this.values(q, {index: 'athlete-ts', limit, direction: 'prev'})) {
            logs.push(x);
            if (limit && logs.length >= limit) {
                break;
            }
        }
        return logs;
    }

    async trimLogs(athleteId, len) {
        let q;
        if (athleteId != null) {
            q = IDBKeyRange.bound([athleteId, -Infinity], [athleteId, Infinity]);
        } else {
            q = IDBKeyRange.bound([-Infinity, -Infinity], [Infinity, Infinity]);
        }
        return await this.trim(q, len, {index: 'athlete-ts'});
    }

    write(level, athleteId, ...messages) {
        if (!['debug', 'info', 'warn', 'error'].includes(level)) {
            throw new TypeError("Invalid log level argument");
        }
        const message = messages.join(' ');
        const record = {athlete: athleteId, ts: Date.now(), message, level};
        this.put(record);  // bg okay
        return record;
    }

    log(level, athleteId, ...messages) {
        console[level](`Sync Log (${athleteId}):`, ...messages);
        return this.write(level, athleteId, ...messages);
    }

    logDebug(athleteId, ...messages) {
        return this.log('debug', athleteId, ...messages);
    }

    logInfo(athleteId, ...messages) {
        return this.log('info', athleteId, ...messages);
    }

    logWarn(athleteId, ...messages) {
        return this.log('warn', athleteId, ...messages);
    }

    logError(athleteId, ...messages) {
        return this.log('error', athleteId, ...messages);
    }
}
