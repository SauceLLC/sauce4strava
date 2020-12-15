/* global sauce */

// NOTE: Must be assigned to self and have matching name for FF
self.sauceBaseInit = function sauceBaseInit() {
    'use strict';

    self.sauce = self.sauce || {};

    function buildPath(path) {
        let offt = self;
        for (const x of path) {
            if (!offt[x]) {
                offt[x] = {};
            }
            offt = offt[x];
        }
        return offt;
    }


    sauce.ns = function(ns, callback) {
        const offt = buildPath(`sauce.${ns}`.split('.'));
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


    const _modules = {};
    sauce.getModule = async function(url) {
        // Note: modules are only supported in the site context and the background page.
        // Content scripts of the extention itself do NOT work and cannot work without
        // browser support due to isolation issues.
        if (!_modules[url]) {
            const script = document.createElement('script');
            const doneEvent = 'sauceModuleImportDone-' + (Date.now() + Math.random());
            const extUrl = self.browser ? self.browser.runtime.getURL('') : sauce.extUrl;
            _modules[url] = await new Promise((resolve, reject) => {
                script.addEventListener('error', ev => reject(new Error(`Module load error: ${url}`)));
                script.type = 'module';
                script.src = extUrl + `src/common/module-loader.mjs?doneEvent=${doneEvent}&script=${url}`;
                function onDone(ev) {
                    document.removeEventListener(doneEvent, onDone);
                    script.remove();
                    if (ev.error) {
                        reject(ev.error);
                    } else {
                        resolve(ev.module);
                    }
                }
                document.addEventListener(doneEvent, onDone);
                document.documentElement.appendChild(script);
            });
        }
        return _modules[url];
    };


    sauce.loadModule = async function(namespace, url) {
        const path = namespace.split('.');
        const root = buildPath(path.slice(0, -1));
        const name = path.pop();
        if (!root[name]) {
            root[name] = await sauce.getModule(url);
        }
        return root[name];
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


    class Database {
        constructor(name) {
            this.name = name;
            this._init = new Promise((resolve, reject) => {
                const req = indexedDB.open(name, this.version);
                req.addEventListener('error', ev => reject(req.error));
                req.addEventListener('success', ev => resolve(ev.target.result));
                req.addEventListener('blocked', ev => reject(new Error('Blocked by existing DB connection')));
                req.addEventListener('upgradeneeded', ev => {
                    console.info(`Upgrading DB from v${ev.oldVersion} to v${this.version}`);
                    this.migrate(ev.target.result, ev.oldVersion);
                });
            }).then(x => this._idb = x);
        }

        get version() {
            throw new Error("Pure Virtual");
        }

        migrate(idb, oldVersion) {
            throw new Error("Pure Virtual");
        }

        async getTransaction(stores, mode) {
            await this._init;
            return this._idb.transaction(stores, mode);
        }

        async getStore(name, mode) {
            const t = await this.getTransaction([name], mode);
            return t.objectStore(name);
        }
    }


    class DBStore {
        constructor(db, name) {
            this.db = db;
            this.name = name;
        }

        _request(req) {
            return new Promise((resolve, reject) => {
                req.addEventListener('error', ev => reject(req.error));
                req.addEventListener('success', ev => resolve(req.result));
            });
        }

        _walkKeyPath(data, keyPath) {
            let offt = data;
            for (const x of keyPath.split('.')) {
                offt = offt[x];
            }
            return offt;
        }

        _extractKey(data, keyPath) {
            // keyPath can be a single key-ident or an array of key-idents where
            // a key ident can be a dot.notation string or just a solitary string.
            if (!Array.isArray(keyPath)) {
                return this._walkKeyPath(data, keyPath);
            } else {
                return keyPath.map(x => this._walkKeyPath(data, x));
            }
        }

        async _getStore(mode) {
            return await this.db.getStore(this.name, mode);
        }

        async _storeCall(storeName, mode, onStore) {
            const t = this.db.transaction(storeName, mode);
            const store = t.objectStore(storeName);
            return await onStore(store);
        }

        async get(query, options={}) {
            const store = await this._getStore('readonly');
            const ifc = options.index ? store.index(options.index) : store;
            return await this._request(ifc.get(query));
        }

        async getMany(queries, options={}) {
            const store = await this._getStore('readonly');
            const ifc = options.index ? store.index(options.index) : store;
            return await Promise.all(queries.map(q => this._request(ifc.get(q))));
        }

        async put(data, options={}) {
            const store = await this._getStore('readwrite');
            let key;
            if (options.index) {
                const index = store.index(options.index);
                key = await this._request(index.getKey(this._extractKey(data, index.keyPath)));
            }
            return await this._request(store.put(data, key));
        }

        async putMany(datas, options={}) {
            const store = await this._getStore('readwrite');
            const index = options.index && store.index(options.index);
            await Promise.all(datas.map(async data => {
                let key;
                if (index) {
                    key = await this._request(index.getKey(this._extractKey(data, index.keyPath)));
                }
                return await this._request(store.put(data, key));
            }));
        }

        async delete(query, options={}) {
            const store = await this._getStore('readwrite');
            let key;
            if (options.index) {
                const index = store.index(options.index);
                key = await this._request(index.getKey(query));
            } else {
                key = query;
            }
            return await this._request(store.delete(key));
        }

        async *values(query, options={}) {
            for await (const c of this.cursor(query, options)) {
                yield c.value;
            }
        }

        async *keys(query, options={}) {
            for await (const c of this.cursor(query, Object.assign({keys: true}, options))) {
                yield c.primaryKey;
            }
        }

        async *cursor(query, options={}) {
            const store = await this._getStore(options.mode);
            const ifc = options.index ? store.index(options.index) : store;
            const curFunc = options.keys ? ifc.openKeyCursor : ifc.openCursor;
            const req = curFunc.call(ifc, query, options.direction);
            let resolve;
            let reject;
            // Callbacks won't invoke until we release control of the event loop, so this is safe..
            req.addEventListener('error', ev => reject(req.error));
            req.addEventListener('success', ev => resolve(ev.target.result));
            while (true) {
                const cursor = await new Promise((_resolve, _reject) => {
                    resolve = _resolve;
                    reject = _reject;
                });
                if (!cursor) {
                    return;
                }
                if (!options.filter || options.filter(cursor)) {
                    yield cursor;
                }
                cursor.continue();
            }
        }
    }

    sauce.db = {
        Database,
        DBStore
    };


    class CacheDatabase extends Database {
        get version() {
            return 1;
        }

        migrate(idb, oldVersion) {
            if (!oldVersion || oldVersion < 1) {
                const store = idb.createObjectStore("entries", {autoIncrement: true});
                store.createIndex('bucket-expiration', ['bucket', 'expiration']);
                store.createIndex('bucket-key', ['bucket', 'key'], {unique: true});
            }
        }
    }


    class CacheStore extends DBStore {
        async purgeExpired(bucket) {
            const q = IDBKeyRange.bound([bucket, -Infinity], [bucket, Date.now()]);
            const curIter = this.cursor(q, {mode: 'readwrite', index: 'bucket-expiration'});
            let count = 0;
            for await (const c of curIter) {
                await this._request(c.delete());
                count++;
            }
            return count;
        }
    }


    class TTLCache {
        constructor(bucket, ttl) {
            const db = new CacheDatabase('SauceCache');
            this.store = new CacheStore(db, 'entries');
            this.bucket = bucket;
            this.ttl = ttl;
            this.gc();  // bg okay
        }

        async gc() {
            const maxSleep = 6 * 3600 * 1000;
            for (let sleep = 10000;; sleep = Math.min(sleep * 1.25, maxSleep)) {
                await new Promise(resolve => setTimeout(resolve, sleep));
                const count = await this.store.purgeExpired(this.bucket);
                if (count) {
                    console.info(`Flushed ${count} objects from TTL cache`);
                }
            }
        }

        async getEntry(key) {
            const entry = await this.store.get([this.bucket, key], {index: 'bucket-key'});
            if (entry && entry.expiration > Date.now()) {
                return entry;
            }
        }

        async get(key) {
            const entry = await this.getEntry(key);
            return entry && entry.value;
        }

        async getEntries(keys) {
            const entries = await this.store.getMany(keys.map(k => [this.bucket, k]),
                {index: 'bucket-key'});
            const now = Date.now();
            return entries.filter(x => x && x.expiration > now);
        }

        async getObject(keys) {
            const entries = await this.getEntries(keys);
            const obj = {};
            for (const x of entries) {
                obj[x.key] = x.value;
            }
            return obj;
        }

        async set(key, value, options={}) {
            const ttl = options.ttl || this.ttl;
            const created = Date.now();
            const expiration = created + ttl;
            await this.store.put({
                bucket: this.bucket,
                key,
                created,
                expiration,
                value
            }, {index: 'bucket-key'});
        }

        async setObject(obj, options={}) {
            const ttl = options.ttl || this.ttl;
            const created = Date.now();
            const expiration = created + ttl;
            await this.store.putMany(Object.entries(obj).map(([key, value]) => ({
                bucket: this.bucket,
                key,
                created,
                expiration,
                value,
            })), {index: 'bucket-key'});
        }

        async delete(key) {
            await this.store.delete([this.bucket, key], {index: 'bucket-key'});
        }

        values() {
            const q = IDBKeyRange.bound([this.bucket, Date.now()], [this.bucket, Infinity]);
            return this.store.values(q, {index: 'bucket-expiration'});
        }

        keys() {
            const q = IDBKeyRange.bound([this.bucket, Date.now()], [this.bucket, Infinity]);
            return this.store.keys(q, {index: 'bucket-key'});
        }
    }

    sauce.cache = {
        TTLCache
    };
};
