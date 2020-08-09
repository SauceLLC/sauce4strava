/* global sauce */

function sauceBaseInit() {
    'use strict';

    self.sauce = self.sauce || {};

    sauce.ns = function(ns, callback) {
        let offt = sauce;
        for (const x of ns.split('.')) {
            if (!offt[x]) {
                offt = (offt[x] = {});
            }
        }
        const assignments = callback && callback(offt);
        if (assignments) {
            Object.assign(offt, assignments);
        }
        return offt;
    };


    sauce.stringDigest = function(algo, input) {
        if (typeof input !== 'string') {
            throw new TypeError('Input should string');
        }
        const encoder = new TextEncoder();
        const data = encoder.encode(input);
        return sauce.digest(algo, data);
    };


    sauce.digest = async function(algo, data) {
        const hash = await crypto.subtle.digest(algo, data);
        const hashArray = Array.from(new Uint8Array(hash));
        return hashArray.map(x => x.toString(16).padStart(2, '0')).join('');
    };


    sauce.sha1 = function(input) {
        return sauce.stringDigest('SHA-1', input);
    };


    sauce.sha256 = function(input) {
        return sauce.stringDigest('SHA-256', input);
    };


    sauce.theme = function(name) {
        const doc = document.documentElement;
        const classes = Array.from(doc.classList);
        for (const x of classes) {
            if (x.startsWith('sauce-theme-')) {
                doc.classList.remove(x);
            }
        }
        if (name) {
            doc.classList.add('sauce-theme-enabled');
            doc.classList.add(`sauce-theme-${name}`);
        }
    };


    sauce.propDefined = function(propertyAccessor, callback, options) {
        if (typeof callback === 'object' && options === undefined) {
            options = callback;
            callback = null;
        } else {
            options = options || {};
        }
        const ourListeners = [];
        function addListener(propDesc, fn) {
            propDesc.set.listeners.push(fn);
            ourListeners.push({fn, propDesc});
        }
        return new Promise(resolve => {
            function catchDefine(obj, props) {
                const prop = props[0];
                function onSet(value) {
                    if (props.length > 1) {
                        if (Object.isExtensible(value)) {
                            catchDefine(value, props.slice(1));
                        }
                    } else {
                        if (options.once) {
                            for (const {fn, propDesc} of ourListeners) {
                                const idx = propDesc.set.listeners.indexOf(fn);
                                propDesc.set.listeners.splice(idx, 1);
                                if (!propDesc.set.listeners.length) {
                                    Object.defineProperty(obj, prop, {
                                        value: obj[prop],
                                        configurable: true,
                                        writable: true,
                                        enumerable: propDesc.enumerable
                                    });
                                }
                            }
                        }
                        if (callback) {
                            callback(value);
                        }
                        resolve(value);
                    }
                }
                const curValue = obj[prop];
                if (curValue !== undefined) {  // Not stoked on this test.
                    onSet(curValue);
                    if (options.once) {
                        return;  // Just walk the props.
                    }
                }
                const propDesc = Object.getOwnPropertyDescriptor(obj, prop);
                if (propDesc && propDesc.set && propDesc.set.listeners) {
                    addListener(propDesc, onSet);
                } else if (!propDesc || (propDesc.configurable && !propDesc.set)) {
                    let internalValue = propDesc ? propDesc.value : undefined;
                    const set = function(value) {
                        if (Object.is(internalValue, value)) {
                            return;
                        }
                        internalValue = value;
                        for (const fn of Array.from(set.listeners)) {
                            fn(value);
                        }
                    };
                    set.listeners = [];
                    Object.defineProperty(obj, prop, {
                        enumerable: true,
                        configurable: true,
                        get: () => internalValue,
                        set
                    });
                    addListener(Object.getOwnPropertyDescriptor(obj, prop), onSet);
                } else if (!options.once) {
                    console.error("Value already exists, consider using `once` option");
                    throw new TypeError("Unconfigurable");
                }
            }
            catchDefine(options.root || self, propertyAccessor.split('.'));
        });
    };


    class Benchmark {
        constructor(label) {
            this.label = label;
            this.steps = [];
            this.count = 0;
            this.times = {};
        }

        _step(key) {
            if (this.steps.length && !this.times[key]) {
                this.times[key] = 0;
            }
            this.steps.push({
                key,
                ts: Date.now()
            });
        }

        _makeTimingLog(startIndex, endIndex) {
            const step = this.steps[startIndex];
            const nextStep = this.steps[endIndex];
            let elapsed = 0;
            for (let i = startIndex + 1; i <= endIndex; i++) {
                const step = this.steps[i];
                elapsed += this.times[step.key];
            }
            const avg = Number((elapsed / this.count).toFixed(2)).toLocaleString();
            return `${step.key}-${nextStep.key}: sum=${elapsed.toLocaleString()}ms, avg=${avg}ms`;
        }

        displayStats() {
            const logs = [];
            if (this.steps.length > 2) {
                for (let i = 0; i < this.steps.length - 1; i++) {
                    logs.push(this._makeTimingLog(i, i + 1));
                }
            }
            logs.push(this._makeTimingLog(0, this.steps.length - 1));
            this._lastDisplay = Date.now();
            console.group('Benchmark', this.label, 'count', this.count);
            for (const x of logs) {
                console.info(x);
            }
            console.groupEnd();
        }

        enter() {
            this.steps.length = 0;
            this._step('start');
        }

        step(label) {
            this._step(label || String.fromCharCode(65 + this.steps.length));
        }

        leave() {
            this._step('finish');
            this.count++;
            for (let i = this.steps.length - 1; i > 0; i--) {
                const step = this.steps[i];
                const prevStep = this.steps[i - 1];
                this.times[step.key] += step.ts - prevStep.ts;
            }
            if (!this._schedDisplay) {
                this._schedDisplay = setTimeout(() => {
                    this._schedDisplay = null;
                    this.displayStats();
                }, 1000);
            }
        }
    }
    sauce.Benchmark = Benchmark;


    class IDBExpirationBucket {
        static async factory() {
            const instance = new this();
            instance.db = await new Promise((resolve, reject) => {
                const request = indexedDB.open('SauceCache', 1);
                request.addEventListener('error', ev => reject(request.error));
                request.addEventListener('success', ev => resolve(ev.target.result));
                request.addEventListener('blocked', ev => reject(new Error('Blocked by existing DB connection')));
                request.addEventListener('upgradeneeded', ev => {
                    const db = ev.target.result;
                    if (ev.oldVersion < 1) {
                        const store = db.createObjectStore("entries", {autoIncrement: true});
                        store.createIndex('bucket-expiration', ['bucket', 'expiration']);
                        store.createIndex('bucket-key', ['bucket', 'key'], {unique: true});
                    }
                });
            });
            return instance;
        }

        requestPromise(req) {
            return new Promise((resolve, reject) => {
                req.addEventListener('error', ev => reject(req.error));
                req.addEventListener('success', ev => resolve(req.result));
            });
        }

        async _storeCall(transactionMode, onStore) {
            const t = this.db.transaction('entries', transactionMode);
            const store = t.objectStore('entries');
            const result = await onStore(store);
            return await new Promise((resolve, reject) => {
                t.addEventListener('abort', ev => reject('Transaction Abort'));
                t.addEventListener('error', ev => reject(t.error));
                t.addEventListener('complete', ev => resolve(result));
            });
        }

        async get(keyOrRange) {
            return await this._storeCall('readonly', async store => {
                const index = store.index('bucket-key');
                return await this.requestPromise(index.get(keyOrRange));
            });
        }

        async getMany(keyOrRangeArray) {
            return await this._storeCall('readonly', async store => {
                const index = store.index('bucket-key');
                return await Promise.all(keyOrRangeArray.map(x =>
                    this.requestPromise(index.get(x))));
            });
        }

        async put(data) {
            await this._storeCall('readwrite', async store => {
                const index = store.index('bucket-key');
                const key = await this.requestPromise(index.getKey([data.bucket, data.key]));
                if (key) {
                    await this.requestPromise(store.delete(key));
                }
                return await this.requestPromise(store.put(data));
            });
        }

        async putMany(dataArray) {
            await this._storeCall('readwrite', async store => {
                const index = store.index('bucket-key');
                await Promise.all(dataArray.map(async data => {
                    const key = await this.requestPromise(index.getKey([data.bucket, data.key]));
                    if (key) {
                        await this.requestPromise(store.delete(key));
                    }
                    return await this.requestPromise(store.put(data));
                }));
            });
        }

        async delete(keyOrRange) {
            await this._storeCall('readwrite', async store => {
                const index = store.index('bucket-key');
                const key = await this.requestPromise(index.getKey(keyOrRange));
                return await this.requestPromise(store.delete(key));
            });
        }

        async purgeExpired(bucket) {
            return await this._storeCall('readwrite', async store => {
                const now = Date.now();
                const index = store.index('bucket-expiration');
                const cursorReq = index.openCursor(IDBKeyRange.bound([bucket, -Infinity], [bucket, now]));
                return await new Promise((resolve, reject) => {
                    let count = 0;
                    cursorReq.addEventListener('error', ev => reject(cursorReq.error));
                    cursorReq.addEventListener('success', async ev => {
                        try {
                            const cursor = ev.target.result;
                            if (!cursor) {
                                resolve(count);
                                return;
                            }
                            await this.requestPromise(cursor.delete());
                            count++;
                            cursor.continue();
                        } catch(e) {
                            reject(e);
                        }
                    });
                });
            });
        }
    }


    class TTLCache {
        constructor(bucket, ttl) {
            this.bucket = bucket;
            this.ttl = ttl;
            this._initing = this.init();
        }

        async init() {
            this.idb = await IDBExpirationBucket.factory();
            this.gc();  // bg okay
        }

        async gc() {
            for (let sleep = 10000;; sleep = Math.min(sleep + 1000, 60000)) {
                await new Promise(resolve => setTimeout(resolve, sleep));
                const count = await this.idb.purgeExpired(this.bucket);
                if (count) {
                    console.info(`Flushed ${count} objects from TTL cache`);
                }
            }
        }

        async get(key) {
            await this._initing;
            const entry = await this.idb.get([this.bucket, key]);
            if (entry && entry.expiration > Date.now()) {
                return entry.value;
            }
        }

        async getObject(keys) {
            await this._initing;
            const entries = await this.idb.getMany(keys.map(k => [this.bucket, k]));
            const now = Date.now();
            const obj = {};
            for (const x of entries) {
                if (x && x.expiration > now) {
                    obj[x.key] = x.value;
                }
            }
            return obj;
        }

        async set(key, value, options={}) {
            await this._initing;
            const ttl = options.ttl || this.ttl;
            const expiration = Date.now() + ttl;
            await this.idb.put({
                bucket: this.bucket,
                key,
                expiration,
                value
            });
        }

        async setObject(obj, options={}) {
            await this._initing;
            const ttl = options.ttl || this.ttl;
            const expiration = Date.now() + ttl;
            await this.idb.putMany(Object.entries(obj).map(([key, value]) => ({
                bucket: this.bucket,
                key,
                value,
                expiration
            })));
        }
    }
    sauce.cache = {
        TTLCache
    };
}

sauceBaseInit;  // eslint
