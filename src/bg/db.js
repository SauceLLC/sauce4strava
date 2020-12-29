/* global sauce */

sauce.ns('hist.db', async ns => {

    'use strict';

    class HistDatabase extends sauce.db.Database {
        get version() {
            return 6;
        }

        migrate(idb, t, oldVersion, newVersion) {
            if (!oldVersion || oldVersion < 1) {
                let store = idb.createObjectStore("streams", {keyPath: ['activity', 'stream']});
                store.createIndex('activity', 'activity');
                store.createIndex('athlete-stream', ['athlete', 'stream']);
                store = idb.createObjectStore("activities", {keyPath: 'id'});
                store.createIndex('athlete-ts', ['athlete', 'ts']);
            }
            if (oldVersion < 2) {
                const store = t.objectStore("streams");
                store.createIndex('athlete', 'athlete');
            }
            if (oldVersion < 3) {
                const store = t.objectStore("activities");
                store.createIndex('athlete-basetype-ts', ['athlete', 'basetype', 'ts']);
            }
            // Version 4 was deprecated in dev.
            if (oldVersion < 5) {
                const store = idb.createObjectStore("athletes", {keyPath: 'id'});
                store.createIndex('sync', 'sync');
            }
            if (oldVersion < 6) {
                // XXX REmove me... ASAP
                // This is just to avoid having to manually update my test clients Remove ASAP
                setTimeout(async () => {
                    const s = new ActivitiesStore();
                    const acts = await s.getAll();
                    await s.putMany(acts.map(x => Object.assign(x, {streamsVersion: 1})));
                    console.warn("XXX Retrofitted streamsVersion on all activities", acts.length);
                }, 0);
                // /XXX
            }
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

        async *activitiesByAthlete(athlete, options={}) {
            // Every real activity has a time stream, so look for just this one.
            const q = IDBKeyRange.only([athlete, 'time']);
            options.index = 'athlete-stream';
            for await (const x of this.keys(q, options)) {
                yield x[0];
            }
        }

        async getCountForAthlete(athlete, stream='time') {
            // Every real activity has a time stream, so look for just this one.
            const q = IDBKeyRange.only([athlete, stream]);
            return await this.count(q, {index: 'athlete-stream'});
        }

        async getAthletes(...args) {
            const athletes = [];
            const q = IDBKeyRange.bound(-Infinity, Infinity);
            for await (const x of this.values(q, {unique: true, index: 'athlete'})) {
                athletes.push(x.athlete);
            }
            return athletes;
        }
    }


    class ActivitiesStore extends sauce.db.DBStore {
        constructor() {
            super(histDatabase, 'activities');
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
            for await (const x of this.values(q, options)) {
                yield x;
            }
        }

        async getAllForAthlete(athlete, ...args) {
            const activities = [];
            for await (const x of this.byAthlete(athlete, ...args)) {
                activities.push(x);
            }
            return activities;
        }

        async getCountForAthlete(athlete) {
            const q = IDBKeyRange.bound([athlete, -Infinity], [athlete, Infinity]);
            return await this.count(q, {index: 'athlete-ts'});
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

        async deleteAthlete(athlete) {
            const deletes = [];
            const q = IDBKeyRange.bound([athlete, -Infinity], [athlete, Infinity]);
            for await (const key of this.keys(q, {index: 'athlete-ts'})) {
                deletes.push(key);
            }
            const store = this._getStore('readwrite');
            await Promise.all(deletes.map(k => this._request(store.delete(k))));
            return deletes.length;
        }
    }


    class AthletesStore extends sauce.db.DBStore {
        constructor() {
            super(histDatabase, 'athletes');
        }

        async getEnabledAthletes() {
            const athletes = [];
            const q = IDBKeyRange.only(1);
            for await (const x of this.values(q, {index: 'sync'})) {
                athletes.push(x);
            }
            return athletes;
        }
    }


    return {
        HistDatabase,
        ActivitiesStore,
        StreamsStore,
        AthletesStore,
    };
});
