/* global sauce */

sauce.ns('hist.db', async ns => {

    'use strict';

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
            // Version 6 was deprecated in dev.
            // Version 7 was deprecated in dev.
            // Version 8 was deprecated in dev.
            {
                version: 9,
                migrate: (idb, t, next) => {
                    const store = t.objectStore("activities");
                    store.createIndex('athlete-streams-version', ['athlete', 'syncState.streams.version']);
                    store.createIndex('athlete-local-version', ['athlete', 'syncState.local.version']);
                    next();
                }
            },
            // Version 10 was deprecated in dev.
            // Version 11 was deprecated in dev.
            {
                version: 12,
                migrate: (idb, t, next) => {
                    const store = t.objectStore("activities");
                    const curReq = store.openCursor();
                    curReq.onsuccess = ev => {
                        const c = ev.target.result;
                        if (!c) {
                            next();
                            return;
                        }
                        if (c.value.noStreams) {
                            delete c.value.noStreams;
                            c.value.syncState = {streams: {version: -Infinity}};
                            c.update(c.value);
                        }
                        c.continue();
                    };
                }
            }, {
                version: 13,
                migrate: (idb, t, next) => {
                    const store = t.objectStore("activities");
                    store.createIndex('athlete-streams-error', ['athlete', 'syncState.streams.errorTS']);
                    store.createIndex('athlete-local-error', ['athlete', 'syncState.local.errorTS']);
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

        async getForAthleteWithSyncVersion(athlete, syncLabel, syncValue, options={}) {
            // NOTE: There needs to be an index for the syncLabel.
            const q = IDBKeyRange.only([athlete, syncValue]);
            const index = `athlete-${syncLabel}-version`;
            const activities = [];
            const iter = options.keys ? this.keys : this.values;
            for await (const x of iter.call(this, q, {index})) {
                activities.push(x);
            }
            return activities;
        }

        async getForAthleteWithSyncLatest(athlete, syncLabel, options={}) {
            const manifest = this.Model.getSyncManifest(syncLabel);
            const latestVersion = manifest[manifest.length - 1].version;
            return await this.getForAthleteWithSyncVersion(athlete, syncLabel, latestVersion, options);
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

        async countForAthleteWithSyncError(athlete, syncLabel) {
            const q = IDBKeyRange.bound([athlete, 0], [athlete, Infinity], /*exclude lower*/ true);
            return await this.count(q, {index: `athlete-${syncLabel}-error`});
        }

        async countForAthleteWithSyncVersion(athlete, syncLabel, syncVersion) {
            const q = IDBKeyRange.only([athlete, syncVersion]);
            return await this.count(q, {index: `athlete-${syncLabel}-version`});
        }

        async countForAthleteWithSyncLatest(athlete, syncLabel) {
            const manifest = this.Model.getSyncManifest(syncLabel);
            const latestVersion = manifest[manifest.length - 1].version;
            return await this.countForAthleteWithSyncVersion(athlete, syncLabel, latestVersion);
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
        static setSyncManifest(name, manifest) {
            if (!this._syncManifests) {
                this._syncManifests = {};
            }
            this._syncManifests[name] = manifest;
        }

        static getSyncManifest(name) {
            if (!name) {
                throw new TypeError("name required");
            }
            return this._syncManifests[name];
        }

        toString() {
            if (this.data && this.data.ts) {
                return `<Activity (${this.pk}) - ${(new Date(this.data.ts)).toLocaleDateString()}>`;
            } else {
                return `<Activity (${this.pk})>`;
            }
        }

        getSyncState(name) {
            if (!name) {
                throw new TypeError("name required");
            }
            return (this.data.syncState && this.data.syncState[name]) || undefined;
        }

        isSyncLatest(name) {
            const state = this.getSyncState(name);
            if (state && state.version) {
                const m = this.constructor.getSyncManifest(name);
                const latest = m[m.length - 1].version;
                return state.version >= latest;
            } else {
                return false;
            }
        }

        nextAvailSync(name) {
            const manifest = this.constructor.getSyncManifest(name);
            if (!manifest || !manifest.length) {
                console.warn('No sync available for empty manifest:', name);
                return;
            }
            const state = this.getSyncState(name);
            if (!state) {
                return manifest[0];
            }
            for (const m of manifest) {
                if (m.version > state.version) {
                    if (state.errorTS && Date.now() - state.errorTS < state.errorCount * m.errorBackoff) {
                        return;  // Unavailable until error backoff expires.
                    } else {
                        return m;
                    }
                }
            }
        }

        shouldSync(name) {
            return !this.isSyncLatest(name) && !!this.nextAvailSync(name);
        }

        setSyncError(name, error) {
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
            const state = this.getSyncState(name);
            return !!(state && state.errorTS);
        }

        clearSyncError(name) {
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
            if (!name) {
                throw new TypeError("name required");
            }
            this.data.syncState = this.data.syncState || {};
            const state = this.data.syncState[name] = this.data.syncState[name] || {};
            state.version = version;
            this._updated.add('syncState');
        }

        setSyncVersionLatest(name) {
            const m = this.constructor.getSyncManifest(name);
            const latest = m[m.length - 1].version;
            return this.setSyncVersion(name, latest);
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
