/* global sauce */

sauce.ns('hist.db', async ns => {

    'use strict';


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
            // Versions 6 -> 14 were deprecated in dev.
            {
                version: 15,
                migrate: (idb, t, next) => {
                    const store = t.objectStore("activities");
                    store.createIndex('sync', 'sync', {multiEntry: true});
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
            for await (const x of this.values(q, options)) {
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

        async getKeysForAthlete(athlete, options={}) {
            const q = IDBKeyRange.only(athlete);
            options.index = 'athlete';
            return await this.getAllKeys(q, options);
        }
    }


    class ActivitiesStore extends sauce.db.DBStore {
        constructor() {
            super(histDatabase, 'activities', {Model: ActivityModel});
        }

        async *byAthlete(athlete, options={}) {
            let q;
            const start = options.start || -Infinity;
            const end = options.end || Infinity;
            if (options.type) {
                q = IDBKeyRange.bound([athlete, options.type, start], [athlete, options.type, end]);
                options.index = 'athlete-basetype-ts';
            } else {
                q = IDBKeyRange.bound([athlete, start], [athlete, end]);
                options.index = 'athlete-ts';
            }
            options.reverse = !options.reverse;  // Go from newest to oldest by default
            const iter = options.keys ? this.keys : this.values;
            for await (const x of iter.call(this, q, options)) {
                yield x;
            }
        }

        async getForAthlete(athlete, options={}) {
            const activities = [];
            for await (const x of this.byAthlete(athlete, options)) {
                activities.push(x);
            }
            return activities;
        }

        _syncQuery(athlete, processor, name, version, error) {
            // Do some lexicographic magic when name is null to trick indedexdb into giving
            // us an open result for that "column".
            const maxNameSize = 1000;
            const lower = [athlete, processor];
            const upper = [athlete, processor];
            // The rules for this are quite insane...
            if (name == null) {
                lower.push('');
                upper.push(''.padStart(maxNameSize, 'z'));
                if (version != null || error != null) {
                    throw new TypeError('Invalid Query: name unset with version and error set');
                }
            } else if (version == null) {
                lower.splice(100, 0, name, -Infinity);
                upper.splice(100, 0, name, Infinity);
                if (error != null) {
                    throw new TypeError('Invalid Query: version unset with error set');
                }
            } else {
                lower.splice(100, 0, name, version, error == null ? -Infinity : Number(error));
                upper.splice(100, 0, name, version, error == null ? Infinity : Number(error));
            }
            return IDBKeyRange.bound(lower, upper);
        }

        async getForAthleteWithSyncVersion(athlete, processor, name, version, options={}) {
            const q = this._syncQuery(athlete, processor, name, version);
            const activities = [];
            const iter = options.keys ? this.keys : this.values;
            for await (const x of iter.call(this, q, {index: 'sync'})) {
                activities.push(x);
            }
            return activities;
        }

        async getForAthleteWithSyncLatest(athlete, processor, name, options={}) {
            let manifests;
            if (name) {
                manifests = [this.Model.getSyncManifest(processor, name)];
            } else {
                manifests = this.Model.getSyncManifests(processor);
            }
            const acts = new Map();
            for (const x of await this.getForAthleteWithSyncVersion(athlete, processor,
                manifests[0].name, manifests[0].version, options)) {
                const pk = options.models ? x.pk : options.keys ? x : x.id;
                acts.set(pk, {obj: x, count: 1});
            }
            for (let i = 1; i < manifests.length; i++) {
                for (const k of await this.getForAthleteWithSyncVersion(athlete, processor,
                    manifests[i].name, manifests[i].version, {keys: true})) {
                    // If this is new, we don't care, cause the filter will eliminate it later.
                    if (acts.has(k)) {
                        acts.get(k).count++;
                    }
                }
            }
            const latest = [];
            for (const x of acts.values()) {
                if (x.count === manifests.length) {
                    latest.push(x.obj);
                }
            }
            return latest;
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

        async deleteForAthlete(athlete) {
            const q = IDBKeyRange.bound([athlete, -Infinity], [athlete, Infinity]);
            return this.delete(q, {index: 'athlete-ts'});
        }

        async countForAthlete(athlete) {
            const q = IDBKeyRange.bound([athlete, -Infinity], [athlete, Infinity]);
            return await this.count(q, {index: 'athlete-ts'});
        }

        async countForAthleteWithSyncError(athlete, processor, name, version) {
            const q = this._syncQuery(athlete, processor, name, version, true);
            return await this.count(q, {index: 'sync'});
        }

        async countForAthleteWithSyncVersion(athlete, processor, name, version) {
            const q = this._syncQuery(athlete, processor, name, version);
            return await this.count(q, {index: 'sync'});
        }

        async countForAthleteWithSyncLatest(athlete, processor, name) {
            const manifest = this.Model.getSyncManifest(processor, name);
            const latestVersion = manifest[manifest.length - 1].version;
            return await this.countForAthleteWithSyncVersion(athlete, processor, latestVersion);
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
            this._syncManifests[manifest.processor][manifest.name] = manifest;
        }

        static getSyncManifests(processor) {
            if (!processor) {
                throw new TypeError("processor required");
            }
            return Object.values(this._syncManifests[processor]);
        }

        static getSyncManifest(processor, name) {
            if (!processor || !name) {
                throw new TypeError("processor and name required");
            }
            const proc = this._syncManifests[processor];
            return proc && proc[name];
        }

        toString() {
            if (this.data && this.data.ts) {
                return `<Activity (${this.pk}) - ${(new Date(this.data.ts)).toLocaleDateString()}>`;
            } else {
                return `<Activity (${this.pk})>`;
            }
        }

        getSyncState(processor, name) {
            if (!processor || !name) {
                throw new TypeError("processor and name required");
            }
            if (this.data.sync) {
                for (const x of this.data.sync) {
                    if (x[this.SYNC.processor] === processor &&
                        x[this.SYNC.name] === name) {
                        const version = x[this.SYNC.version];
                        return {
                            processor,
                            name,
                            version,
                            error: this.data.syncErrors[`${processor}-${name}-${version}`],
                        };
                    }
                }
            }
        }

        nextAvailSync(processor) {
            debugger;
            const manifests = this.constructor.getSyncManifests(processor);
            if (!manifests) {
                throw new TypeError("Invalid sync processor");
            }
            const states = new Map(Object.keys(manifests).map(x => [x, this.getSyncState(processor, x)]));
            const completed = new Set();
            const pending = new Set();
            const tainted = new Set();
            // Pass 1: Compile completed and pending sets without dep evaluation.
            for (const [name, manifest] of Object.entries(manifests)) {
                if (!tainted.has(name)) {
                    const state = states.get(name);
                    if (state && state.version >= manifest.version) {
                        completed.add(name);
                    } else {
                        pending.add(name);
                    }
                    idle = false;
                }
            }
            let idle;
            do {
                idle = true;
                // Pass 2: Triage the deps until no further taints are discovered...
                for (const name of setUnion(completed, pending)) {
                    const manifest = manifests[name];
                    if (!manifest.depends) {
                        continue;
                    }
                    for (const x of setUnion(pending, tainted)) {
                        if (manifest.depends.indexOf(x) !== -1) {
                            console.warn("Tainting:", name, 'because of',  x);
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
                const m = manifests[name];
                const state = states.get(name);
                const e = state.error;
                if (e && e.ts && Date.now() - e.ts < e.count * m.errorBackoff) {
                    return;  // Unavailable until error backoff expires.
                } else {
                    return m;
                }
            }
        }

        setSyncError(name, error) {
            throw new TypeError("PORT ME");
            if (!name) {
                throw new TypeError("name required");
            }
            this.data.syncState = this.data.syncState || {};
            const state = this.data.syncState[name] = this.data.syncState[name] || {};
            state.errorCount = (state.errorCount || 0) + 1;
            state.errorTS = Date.now();
            state.errorMessage = error.message;
            this._updated.add('syncState');
        }

        hasSyncError(name) {
            throw new TypeError("PORT ME");
            const state = this.getSyncState(name);
            return !!(state && state.errorTS);
        }

        clearSyncError(name) {
            throw new TypeError("PORT ME");
            if (!name) {
                throw new TypeError("name required");
            }
            this.data.syncState = this.data.syncState || {};
            const state = this.data.syncState[name] = this.data.syncState[name] || {};
            delete state.errorTS;
            delete state.errorMessage;
            // NOTE: Do not delete errorCount.  We need this to perform backoff
            this._updated.add('syncState');
        }

        setSyncVersion(name, version) {
            throw new TypeError("PORT ME");
            if (!name) {
                throw new TypeError("name required");
            }
            this.data.syncState = this.data.syncState || {};
            const state = this.data.syncState[name] = this.data.syncState[name] || {};
            state.version = version;
            this._updated.add('syncState');
        }

        setSyncVersionLatest(name) {
            throw new TypeError("PORT ME");
            const m = this.constructor.getSyncManifest(name);
            const latest = m[m.length - 1].version;
            return this.setSyncVersion(name, latest);
        }
    }

    // For indexeddb we have to use nested arrays when using multiEntry indexes.
    ActivityModel.prototype.SYNC = {
        athlete: 0,
        processor: 1,
        name: 2,
        version: 3,
        error: 4,
    };


    class AthleteModel extends sauce.db.Model {
        toString() {
            if (this.data && this.data.name) {
                return `<${this.data.name} (${this.pk})>`;
            } else {
                return `<Athlete (${this.pk})>`;
            }
        }

        _getHistoryValueAt(key, ts) {
            const values = this.data[key];
            if (values) {
                let v = values[0].value;
                for (const x of this.data[key]) {
                    if (x.ts > ts) {
                        break;
                    }
                    v = x.value;
                }
                return v;
            }
        }

        _setHistoryValueAt(key, value, ts) {
            const values = this.data[key] = this.data[key] || [];
            values.push({ts, value});
            values.sort((a, b) => b.ts - a.ts);
            this.set(key, values);
        }

        getFTPAt(ts) {
            return this._getHistoryValueAt('ftpHistory', ts);
        }

        getWeightAt(ts) {
            return this._getHistoryValueAt('weightHistory', ts);
        }

        setFTPAt(value, ts) {
            return this._setHistoryValueAt('ftpHistory', value, ts);
        }

        setWeightAt(value, ts) {
            return this._setHistoryValueAt('weightHistory', value, ts);
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
