/* global sauce */

sauce.ns('hist.db', async ns => {

    'use strict';

    const defaultSyncErrorBackoff = 300 * 1000;  // Actual is (<value-ms> * errorCount)


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
            // Versions 6 -> 15 were deprecated in dev.
            {
                version: 16,
                migrate: (idb, t, next) => {
                    const store = t.objectStore("activities");
                    if ((new Set(store.indexNames)).has('sync')) {
                        store.deleteIndex('sync');  // XXX dev clients only, remove later.
                    }
                    store.createIndex('sync_lookup', '_syncLookup', {multiEntry: true});
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

        async getForAthlete(athlete, options={}) {
            console.warn("DEPRECATED");
            const activities = [];
            for await (const x of this.byAthlete(athlete, options)) {
                activities.push(x);
            }
            return activities;
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

        _syncQuery(athlete, processor, name, version, options={}) {
            // DEPRECATED
            const lower = [athlete, processor];
            const upper = [athlete, processor];
            // The rules for this are quite insane because the array evaluation acts like
            // a disjunction but only when a range is used.  Exact matches cause further
            // evaluation of each array index to happen.  So the first open bounds must also
            // be the last array index to apply a query to.
            let excludeLower;
            let excludeUpper;
            if (name == null) {
                // Do some lexicographic magic when name is null to trick indedexdb into giving
                // us an open result for that "column".
                const maxNameSize = 1000;
                lower.push('');
                upper.push(''.padStart(maxNameSize, 'z'));
                if (version != null || options.error != null) {
                    throw new TypeError("Invalid Query: 'name' unset with 'version' and/or 'error' set");
                }
            } else {
                let lowerVer;
                let upperVer;
                if (version == null && options.error == null) {
                    lowerVer = -Infinity;
                    upperVer = Infinity;
                } else if (version == null && options.error != null) {
                    lowerVer = options.error ? -Infinity : 0;
                    upperVer = options.error ? 0 : Infinity;
                    excludeLower = lowerVer === 0;
                    excludeUpper = upperVer === 0;
                } else if (version != null && options.error == null) {
                    lowerVer = upperVer = version;
                } else if (version != null && options.error != null) {
                    lowerVer = upperVer = (version * options.error ? -1 : 1);
                }
                lower.splice(2, 0, name, lowerVer);
                upper.splice(2, 0, name, upperVer);
            }
            return IDBKeyRange.bound(lower, upper, excludeLower, excludeUpper);
        }

        async invalidateForAthleteWithSync(athlete, processor, name) {
            const manifests = this.Model.getSyncManifests(processor, name);
            const keys = new Set();
            for (const m of manifests) {
                const q = this._syncQuery(athlete, processor, m.name);
                for await (const k of this.keys(q, {index: 'sync_lookup'})) {
                    keys.add(k);
                }
            }
            const acts = await this.getMany(keys, {models: true});
            for (const a of acts) {
                for (const m of manifests) {
                    a.clearSyncState(m);
                }
            }
            await this.saveModels(acts);
        }

        async getForAthleteWithSync(athlete, processor, options={}) {
            console.warn("DEPRECATED");
            if (options.version != null && options.name == null) {
                throw new TypeError("'version' set without 'name' set");
            }
            const s = Date.now();
            const manifests = this.Model.getSyncManifests(processor, options.name);
            const acts = new Map();
            const seed = manifests.shift();
            const version = options.version != null ? options.version : options.error == null ? seed.version : null;
            const q = this._syncQuery(athlete, processor, seed.name, version, options);
            const iter = options.keys ? this.keys : this.values;
            for await (const obj of iter.call(this, q, {index: 'sync_lookup'})) {
                const pk = options.models ? obj.pk : options.keys ? obj : obj.id;
                acts.set(pk, {obj, count: 1});
            }
            console.warn('withSync 1', Date.now() - s);
            if (!manifests.length) {
                return Array.from(acts.values()).map(x => x.obj);
            }
            for (const m of manifests) {
                const version = options.version != null ? options.version : options.error == null ? m.version : null;
                const q = this._syncQuery(athlete, processor, m.name, version, options);
                for await (const k of this.keys(q, {index: 'sync_lookup'})) {
                    // If this is new, we don't care, cause the filter will eliminate it later.
                    if (acts.has(k)) {
                        acts.get(k).count++;
                    }
                }
            }
            console.warn('withSync 2', Date.now() - s);
            const conjuction = [];
            for (const x of acts.values()) {
                if (x.count === manifests.length + 1) {
                    conjuction.push(x.obj);
                }
            }
            console.warn('withSync 3', Date.now() - s);
            return conjuction;
        }

        async getAllForAthleteWithSync(athlete, processor, options={}) {
            if (options.version != null && options.name == null) {
                throw new TypeError("'version' set without 'name' set");
            }
            const activities = await this.getAllForAthlete(athlete, {models: true});
            const manifests = this.Model.getSyncManifests(processor, options.name);
            const filtered = new Map();
            for (const a of activities) {
                for (const m of manifests) {
                    if (options.error) {
                        if (a.hasSyncError(m)) {
                            filtered.set(a.pk, a);
                            break;
                        }
                    } else {
                        if (a.hasSyncSuccess(m)) {
                            filtered.set(a.pk, a);
                        } else if (filtered.has(a.pk)) {
                            filtered.delete(a.pk);
                            break;
                        }
                    }
                }
            }
            if (options.keys) {
                return [...filtered.keys()];
            } else if (options.models) {
                return [...filtered.values()];
            } else if (options.count) {
                return filtered.size;
            } else {
                return [...filtered.values()].map(x => x.data);
            }
        }

        async oldestForAthlete(athlete) {
            const q = IDBKeyRange.bound([athlete, -Infinity], [athlete, Infinity]);
            for await (const x of this.values(q, {index: 'athlete-ts'})) {
                return x;
            }
        }

        async latestForAthlete(athlete) {
            const q = IDBKeyRange.bound([athlete, -Infinity], [athlete, Infinity]);
            for await (const x of this.values(q, {index: 'athlete-ts', direction: 'prev'})) {
                return x;
            }
        }

        async deleteForAthlete(athlete) {
            const q = IDBKeyRange.bound([athlete, -Infinity], [athlete, Infinity]);
            return this.delete(q, {index: 'athlete-ts'});
        }

        async countForAthlete(athlete) {
            const q = IDBKeyRange.bound([athlete, -Infinity], [athlete, Infinity]);
            return await this.count(q, {index: 'athlete-ts'});
        }

        async countForAthleteWithSync(athlete, processor, options={}) {
            // DEPRECATED || needs update
            options.keys = true;
            return (await this.getForAthleteWithSync(athlete, processor, options)).length;
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
            this._updated.add('_syncLookup');
            if (!this.data._syncLookup) {
                this.data._syncLookup = [];
            }
            const versionAndError = (state.version || 0) * (hasError ? -1 : 1);
            const deleteIndex = state.version == null && state.error == null;
            for (let i = 0; i < this.data._syncLookup.length; i++) {
                const x = this.data._syncLookup[i];
                if (x[this.SYNC_LOOKUP.processor] === processor && x[this.SYNC_LOOKUP.name] === name) {
                    if (deleteIndex) {
                        this.data._syncLookup.splice(i, 1);
                    } else {
                        x[this.SYNC_LOOKUP.versionAndError] = versionAndError;
                    }
                    return;
                }
            }
            if (!deleteIndex) {
                const syncLookup = Object.keys(this.SYNC_LOOKUP).map(() => 0);  // IDB can't handle empty items
                syncLookup[this.SYNC_LOOKUP.athlete] = this.data.athlete;
                syncLookup[this.SYNC_LOOKUP.processor] = processor;
                syncLookup[this.SYNC_LOOKUP.name] = name;
                syncLookup[this.SYNC_LOOKUP.versionAndError] = versionAndError;
                this.data._syncLookup.push(syncLookup);
            }
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
            return !!(state && state.version === manifest.version);
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
            const manifestsMap = new Map(manifests.map(x => [x.name, x]));
            if (!manifests) {
                throw new TypeError("Invalid sync processor");
            }
            const states = new Map(manifests.map(m => [m.name, this._getSyncState(m)]));
            const completed = new Set();
            const pending = new Set();
            const tainted = new Set();
            // Pass 1: Compile completed and pending sets without dep evaluation.
            for (const m of manifests) {
                if (!tainted.has(m.name)) {
                    const state = states.get(m.name);
                    if (state && state.version >= m.version && (!state.error || !state.error.ts)) {
                        completed.add(m.name);
                    } else {
                        pending.add(m.name);
                    }
                }
            }
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
            if (!pending.size) {
                return;
            }
            for (const name of pending) {
                const m = manifestsMap.get(name);
                const state = states.get(name);
                const e = state && state.error;
                if (e && e.ts && Date.now() - e.ts < e.count * m.errorBackoff) {
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

    // For indexeddb we have to use nested arrays when using multiEntry indexes.
    ActivityModel.prototype.SYNC_LOOKUP = {
        athlete: 0,
        processor: 1,
        name: 2,
        versionAndError: 3,
    };


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
        AthletesStore,
        ActivityModel,
        AthleteModel,
    };
});
