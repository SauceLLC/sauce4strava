/* global sauce */

sauce.ns('hist.db', ns => {

    'use strict';

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


    class HistDatabase extends sauce.db.Database {
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
                    if (idb.objectStoreNames.contains('peaks')) {
                        idb.deleteObjectStore('peaks'); // XXX dev only
                    }
                    const store = idb.createObjectStore("peaks", {keyPath: ['activity', 'type', 'period']});
                    store.createIndex('activity', 'activity');
                    store.createIndex('athlete-type-period-value', ['athlete', 'type', 'period', 'value']);
                    store.createIndex('type-period-value', ['type', 'period', 'value']);
                    store.createIndex('athlete-activitytype-type-period-value', ['athlete', 'activityType', 'type', 'period', 'value']);
                    store.createIndex('activitytype-type-period-value', ['activityType', 'type', 'period', 'value']);
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
            }];
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
    }


    class PeaksStore extends sauce.db.DBStore {
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

        safeSort(peaks, type) {
            // Handle non-numeric types that have on occasion crept in.  Yes, we should fix all these
            // cases upstream before they get into the database, but the chance of it happening is
            // non-zero with the way I hack on this, so be careful about sorting properly here in
            // the event of value===undefined.
            if (this.getDirectionForType(type) === 'prev') {
                peaks.sort((a, b) => (b.value || 0) - (a.value || 0));
            } else {
                peaks.sort((a, b) => (a.value || 0) - (b.value || 0));
            }
            peaks.forEach((x, i) => x.rank = i + 1);
        }

        async getForAthlete(athleteId, type, period, options={}) {
            period = period && Math.round(period);
            const q = IDBKeyRange.bound(
                [athleteId, type, period, options.start || -Infinity],
                [athleteId, type, period, options.end || Infinity]);
            const peaks = await this.getAll(q, {
                index: 'athlete-type-period-ts',
                ...options,
                limit: undefined
            });
            this.safeSort(peaks, type);
            return options.limit ? peaks.slice(0, options.limit) : peaks;
        }

        async getFor(type, period, options={}) {
            period = period && Math.round(period);
            const q = IDBKeyRange.bound(
                [type, period, options.start || -Infinity],
                [type, period, options.end || Infinity]);
            const peaks = await this.getAll(q, {
                index: 'type-period-ts',
                ...options,
                limit: undefined
            });
            this.safeSort(peaks, type);
            return options.limit ? peaks.slice(0, options.limit) : peaks;
        }

        async deleteForActivity(activityId) {
            return await this.delete(activityId, {index: 'activity'});
        }

        async deleteForAthlete(athleteId) {
            return await this.delete(athleteId, {index: 'athlete'});
        }
    }


    class ActivitiesStore extends sauce.db.DBStore {
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

        async getAllForAthlete(athlete, options={}) {
            return await this.getAll(...this._queryForAthlete(athlete, options));
        }

        async *siblings(id, options={}) {
            const act = await this.get(id);
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

        async invalidateForAthleteWithSync(athlete, processor, name) {
            const activities = await this.getAllForAthlete(athlete, {models: true});
            const manifests = this.Model.getSyncManifests(processor, name);
            for (const a of activities) {
                for (const m of manifests) {
                    a.clearSyncState(m);
                }
            }
            await this.saveModels(activities);
        }

        async getOldestForAthlete(athlete, options={}) {
            for await (const x of this.byAthlete(athlete, options)) {
                return x;
            }
        }

        async getNewestForAthlete(athlete, options={}) {
            for await (const x of this.byAthlete(athlete, {direction: 'prev', ...options})) {
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


    class AthletesStore extends sauce.db.DBStore {
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


    class ActivityModel extends sauce.db.Model {
        static addSyncManifest(manifest) {
            if (!this._syncManifests) {
                this._syncManifests = {};
            }
            if (!this._syncManifests[manifest.processor]) {
                this._syncManifests[manifest.processor] = {};
            }
            this._syncManifests[manifest.processor][manifest.name] = Object.assign({
                errorBackoff: defaultSyncErrorBackoff,
            }, manifest);
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

        _getSyncState(manifest) {
            const processor = manifest.processor;
            const name = manifest.name;
            if (!processor || !name) {
                throw new TypeError("processor and name required");
            }
            return this.data.syncState &&
                this.data.syncState[processor] &&
                this.data.syncState[processor][name];
        }

        _setSyncState(manifest, state, options={}) {
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
                for (const dep of this.dependantManifests(manifest.processor, manifest.name)) {
                    // It might be safe to clear deps in error state too, but I'm being
                    // paranoid for now in the offchance that I'm missing a way that this
                    // could break backoff handling (i.e. runaway processing).
                    if (!this.hasSyncError(dep)) {
                        this.clearSyncState(dep);
                    }
                }
            }
            const sync = this.data.syncState = this.data.syncState || {};
            const proc = sync[processor] = sync[processor] || {};
            proc[name] = state;
            this._updated.add('syncState');
        }

        setSyncSuccess(manifest) {
            const state = this._getSyncState(manifest) || {};
            if (state.error && state.error.ts) {
                throw new TypeError("'clearSyncState' not used before 'setSyncSuccess'");
            }
            delete state.error;
            state.version = manifest.version;
            this._setSyncState(manifest, state);
        }

        setSyncError(manifest, e) {
            const state = this._getSyncState(manifest) || {};
            state.version = manifest.version;
            const error = state.error = state.error || {count: 0};
            error.count++;
            error.ts = Date.now();
            error.message = e.message;
            this._setSyncState(manifest, state);
        }

        hasSyncSuccess(manifest) {
            const state = this._getSyncState(manifest);
            return !!(state && state.version === manifest.version && !(state.error && state.error.ts));
        }

        getSyncError(manifest) {
            const state = this._getSyncState(manifest);
            const error = state && state.error;
            return (error && error.ts) ? (error.message || 'error') : undefined;
        }

        hasSyncError(manifest) {
            const state = this._getSyncState(manifest);
            return !!(state && state.error && state.error.ts);
        }

        hasAnySyncErrors(processor) {
            const manifests = this.constructor.getSyncManifests(processor);
            return manifests.some(m => this.hasSyncError(m));
        }

        clearSyncState(manifest) {
            const state = this._getSyncState(manifest);
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
                    this._setSyncState(manifest, state);
                }
            }
        }

        dependantManifests(processor, manifest) {
            const allManifests = this.constructor.getSyncManifests(processor);
            const deps = new Set();
            function dependants(name) {
                for (const x of allManifests) {
                    if (x.depends && x.depends.includes(name)) {
                        deps.add(x);
                        dependants(x.name);
                    }
                }
            }
            dependants(manifest);
            return [...deps];
        }

        nextAvailManifest(processor) {
            const manifests = this.constructor.getSyncManifests(processor);
            if (!manifests) {
                throw new TypeError("Invalid sync processor");
            }
            const states = new Map(manifests.map(m => [m.name, this._getSyncState(m)]));
            const completed = new Set();
            const pending = new Set();
            // Pass 1: Compile completed and pending sets without dep evaluation.
            for (const m of manifests) {
                const state = states.get(m.name);
                if (state && state.version === m.version && (!state.error || !state.error.ts)) {
                    completed.add(m.name);
                } else {
                    pending.add(m.name);
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
                const state = states.get(name);
                const e = state && state.error;
                if (e && e.ts && Date.now() - e.ts < m.errorBackoff * (2 ** e.count)) {
                    return;  // Unavailable until error backoff expires.
                } else {
                    return m;
                }
            }
        }

        isSyncComplete(processor) {
            const manifests = this.constructor.getSyncManifests(processor);
            for (const m of manifests) {
                const state = this._getSyncState(m);
                if (!state || state.version !== m.version || (state.error && state.error.ts)) {
                    return false;
                }
            }
            return true;
        }
    }


    class AthleteModel extends sauce.db.Model {
        toString() {
            if (this.data && this.data.name) {
                return `<${this.data.name} (${this.pk})>`;
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

        getFTPAt(ts) {
            return sauce.model.getAthleteHistoryValueAt(this.data.ftpHistory, ts);
        }

        getWeightAt(ts) {
            return sauce.model.getAthleteHistoryValueAt(this.data.weightHistory, ts);
        }

        setFTPHistory(data) {
            return this.setHistoryValues('ftp', data);
        }

        setWeightHistory(data) {
            return this.setHistoryValues('weight', data);
        }
    }


    return {
        HistDatabase,
        ActivitiesStore,
        StreamsStore,
        PeaksStore,
        AthletesStore,
        ActivityModel,
        AthleteModel,
    };
});
