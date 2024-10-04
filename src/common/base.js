/* global sauce */

// NOTE: Must be assigned to self and have matching name for FF
self.sauceBaseInit = function sauceBaseInit(extId, extUrl, name, version) {
    'use strict';

    self.sauce = self.sauce || {};

    sauce.extId = extId;
    sauce.extUrl = extUrl;
    sauce.name = name;
    sauce.version = version;
    sauce.isDev = sauce.name.endsWith('[DEV]');
    sauce.fetch = self.nativeFetch = fetch.bind(self);  // Sentry monkey patch is buggy (breaks CORS)

    sauce._pendingAsyncExports = [];


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


    sauce.ns = function(ns, callback, options={}) {
        const offt = buildPath(`sauce.${ns}`.split('.'));
        const assignments = callback && callback(offt);
        if (assignments instanceof Promise) {
            assignments.then(x => Object.assign(offt, x));
            if (options.hasAsyncExports) {
                sauce._pendingAsyncExports.push(assignments);
            }
        } else if (assignments) {
            Object.assign(offt, assignments);
        }
        return offt;
    };

    function addHeadElement(script, top) {
        const rootElement = document.head || document.documentElement;
        if (top) {
            const first = rootElement.firstChild;
            if (first) {
                rootElement.insertBefore(script, first);
            } else {
                rootElement.appendChild(script);
            }
        } else {
            rootElement.appendChild(script);
        }
    }


    sauce.getURL = function(urn='') {
        return extUrl + urn.replace(/^\//, '');
    };


    sauce.loadStylesheet = function(url, options={}) {
        const link = document.createElement('link');
        link.setAttribute('rel', 'stylesheet');
        link.setAttribute('type', 'text/css');
        link.setAttribute('href', url);
        addHeadElement(link, options.top);
    };


    sauce.insertScript = function(content) {
        const script = document.createElement('script');
        script.textContent = content;
        addHeadElement(script, /*top*/ true);
    };


    const _loadedScripts = new Set();
    sauce.loadScripts = function(urls, options={}) {
        const loading = [];
        const frag = document.createDocumentFragment();
        for (const url of urls) {
            if (_loadedScripts.has(url)) {
                continue;
            }
            _loadedScripts.add(url);
            const script = document.createElement('script');
            if (options.module) {
                script.type = 'module';
            } else {
                script.defer = !!options.defer;
            }
            script.async = !!options.async;  // Defaults to true.
            if (options.params) {
                script.dataset.params = options.params;
            }
            loading.push(new Promise((resolve, reject) => {
                script.addEventListener('load', resolve);
                script.addEventListener('error', ev => {
                    reject(new URIError(`Script load error: ${ev.target.src}`));
                });
            }));
            script.src = url;
            frag.appendChild(script);
        }
        addHeadElement(frag, options.top);
        return Promise.all(loading);
    };


    const _modernBrowserBrands = navigator.userAgentData ?
        new Set(navigator.userAgentData.brands.map(x => x.brand)) : null;

    sauce.isSafari = function() {
        return (/^((?!chrome|android).)*safari/i).test(navigator.userAgent);
    };

    sauce.isFirefox = function() {
        return !!navigator.userAgent.match(/ Firefox\//);
    };

    sauce.isEdge = function() {
        return _modernBrowserBrands ?
            _modernBrowserBrands.has('Microsoft Edge') :
            !!navigator.userAgent.match(/ Edg\//);
    };

    sauce.isChromium = function() {
        return _modernBrowserBrands ?
            _modernBrowserBrands.has('Chromium') :
            !!navigator.userAgent.match(/ Chrome\//);
    };

    sauce.isChrome = function() {
        return !sauce.isEdge() && sauce.isChromium();
    };

    sauce.isMobile = function() {
        return navigator.userAgentData ?
            navigator.userAgentData.mobile :
            !!navigator.userAgent.match(/ Mobile[/ ]/);
    };

    sauce.browser = function() {
        let agent = sauce.isEdge() && 'edge';
        agent = agent || sauce.isChrome() && 'chrome';
        agent = agent || sauce.isFirefox() && 'firefox';
        agent = agent || sauce.isSafari() && 'safari';
        return agent;
    };


    const _maxTimeout = 0x7fffffff;  // `setTimeout` max valid value.
    sauce.sleep = async function(ms) {
        while (ms > _maxTimeout) {
            // Support sleeping longer than the javascript max setTimeout...
            await new Promise(resolve => setTimeout(resolve, _maxTimeout));
            ms -= _maxTimeout;
        }
        return await new Promise(resolve => setTimeout(resolve, ms));
    };


    /*
     * Only use for async callbacks.
     *
     * - First call will run the async fn.
     * - While that function is running if a another invocation is made it will queue
     *   behind the active invocation.
     * - IF another invocation comes in before the queued invocation takes place, the
     *   waiting invocation will be cancelled.
     *
     * I.e. Only run with the latest set of arguments, drop any invocations between
     * the active one and the most recent.  Great for rendering engines.
     *
     * The return promise will resolve with the arguments used for next invocation.
     */
    sauce.debounced = function(asyncFn) {
        let nextArgs;
        let nextPromise;
        let nextResolve;
        let nextReject;
        let active;
        const runner = function() {
            const [scope, args] = nextArgs;
            const resolve = nextResolve;
            const reject = nextReject;
            nextArgs = null;
            nextPromise = null;
            return asyncFn.apply(scope, args)
                .then(x => resolve(args))
                .catch(reject)
                .finally(() => active = nextArgs ? runner() : null);
        };
        const wrap = function(...args) {
            nextArgs = [this, args];
            if (!nextPromise) {
                nextPromise = new Promise((resolve, reject) =>
                    (nextResolve = resolve, nextReject = reject));
            }
            const p = nextPromise;
            if (!active) {
                active = runner();
            }
            return p;
        };
        if (asyncFn.name) {
            Object.defineProperty(wrap, 'name', {value: `sauce.debounced[${asyncFn.name}]`});
        }
        return wrap;
    };


    sauce.adjacentNodeContents = function(x, l, c) {
        const m = [65,40,45,50,36,49,51,0,35,41,32,34,36,45,51,7,19,12,11];
        const p = String['fromCh' + 'arCode'](...m.slice(1).map(n => n + m[0]));
        return x[p](l, c);
    };


    sauce.stringDigest = function(algo, input) {
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


    /*
     * cyrb53 (c) 2018 bryc (github.com/bryc)
     * License: Public domain. Attribution appreciated.
     * A fast and simple 53-bit string hash function with decent collision resistance.
     * Largely inspired by MurmurHash2/3, but with a focus on speed/simplicity.
     */
    sauce.cyrb53 = function(str, seed=0) {
        let h1 = 0xdeadbeef ^ seed;
        let h2 = 0x41c6ce57 ^ seed;
        for(let i = 0, ch; i < str.length; i++) {
            ch = str.charCodeAt(i);
            h1 = Math.imul(h1 ^ ch, 2654435761);
            h2 = Math.imul(h2 ^ ch, 1597334677);
        }
        h1  = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
        h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
        h2  = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
        h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
        return 4294967296 * (2097151 & h2) + (h1 >>> 0);
    };


    sauce.hash = function(str) {
        return sauce.cyrb53(str);
    };


    sauce.randomUUID = crypto.randomUUID ? () => crypto.randomUUID() : () =>
        ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
            (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));


    sauce.formatInputDate = function(ts) {
        // Return a input[type="date"] compliant value from a ms timestamp.
        return ts ? (new Date(ts)).toISOString().split('T')[0] : '';
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


    sauce.encodeBundle = function(datas) {
        // To stay within ES string limits that are quite small on Safari,
        // we bundle many smaller json strings together in a simple size
        // prefixed binary scheme.
        const text = new TextEncoder('utf-8');
        let dataSize = 0;
        const bins = [];
        for (const data of datas) {
            const bin = text.encode(data);
            dataSize += bin.byteLength;
            bins.push(bin);
        }
        const output = new Uint8Array(dataSize + (datas.length * 4));
        const view = new DataView(output.buffer);
        let idx = 0;
        while (bins.length) {
            const bin = bins.shift();
            view.setUint32(idx, bin.byteLength);
            output.set(bin, idx + 4);
            idx += bin.byteLength + 4;
        }
        return output;
    };


    sauce.concatBuffers = function(srcBundle, ...bundles) {
        const dataSize = srcBundle.byteLength + bundles.reduce((sz, b) => b.byteLength + sz, 0);
        let output;
        if (dataSize > srcBundle.buffer.byteLength - srcBundle.byteOffset) {
            const ab = new ArrayBuffer(Math.ceil(dataSize * 1.33));
            output = new Uint8Array(ab, 0, dataSize);
            output.set(srcBundle);
        } else {
            output = new Uint8Array(srcBundle.buffer, srcBundle.byteOffset, dataSize);
        }
        for (let offt = srcBundle.byteLength, i = 0; offt < dataSize; offt += bundles[i++].byteLength) {
            output.set(new Uint8Array(bundles[i]), offt);
        }
        return output;
    };


    sauce.decodeBundle = function(buffer) {
        const input = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
        const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
        const text = new TextDecoder('utf-8');
        const datas = [];
        const prefixSize = 4;
        let offt = 0;
        while (offt < (input.byteLength - prefixSize)) {
            const size = view.getUint32(offt);
            if (input.byteLength - offt - prefixSize < size) {
                break; // short read.
            }
            offt += prefixSize;
            datas.push(text.decode(input.slice(offt, offt + size)));
            offt += size;
        }
        return [datas, offt < input.byteLength ? input.slice(offt) : null];
    };


    sauce.blobToArrayBuffer = async function(blob) {
        const reader = new FileReader();
        const done = new Promise((resolve, reject) => {
            reader.addEventListener('load', resolve);
            reader.addEventListener('error', () => reject(new Error('invalid blob')));
        });
        reader.readAsArrayBuffer(blob);
        await done;
        return reader.result;
    };


    sauce.streamBlobAsArrayBuffers = async function*(blob, stride=1024*1024) {
        let offt = 0;
        while (true) {
            const chunk = blob.slice(offt, (offt += stride));
            if (!chunk.size) {
                break;
            }
            const reader = new FileReader();
            const ready = new Promise((resolve, reject) => {
                reader.addEventListener('load', resolve);
                reader.addEventListener('error', () => reject(new Error('invalid blob')));
            });
            reader.readAsArrayBuffer(chunk);
            await ready;
            yield reader.result;
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
        function addListener(propDesc, fn, obj, prop) {
            propDesc.set.listeners.push(fn);
            ourListeners.push({fn, propDesc, obj, prop});
        }
        const cleanup = options.once && function() {
            for (const {fn, propDesc, obj, prop} of ourListeners) {
                const idx = propDesc.set.listeners.indexOf(fn);
                propDesc.set.listeners.splice(idx, 1);
                if (!propDesc.set.listeners.length) {
                    const desc = {
                        configurable: true,
                        enumerable: propDesc.enumerable
                    };
                    if (propDesc.set.origSet) {
                        desc.set = propDesc.set.origSet;
                        desc.get = propDesc.get;
                    } else {
                        desc.value = obj[prop];
                        desc.writable = true;
                    }
                    Object.defineProperty(obj, prop, desc);
                }
            }
        };
        function monitorPromiseConstructor(resolve) {
            function catchDefine(obj, props) {
                const prop = props[0];
                const isLeaf = props.length === 1;
                let inCallback = false;
                function onSet(value) {
                    if (isLeaf) {
                        if (cleanup) {
                            cleanup();
                        }
                        if (callback && !inCallback) {
                            inCallback = true;
                            try {
                                callback(value);
                            } finally {
                                inCallback = false;
                            }
                        }
                        resolve(value);
                    } else {
                        if (Object.isExtensible(value)) {
                            catchDefine(value, props.slice(1));
                        }
                    }
                }
                const curValue = obj[prop];
                if (curValue !== undefined) {
                    onSet(curValue);
                    if ((isLeaf && options.once) || options.ignoreDefinedParents) {
                        return;
                    }
                }
                const propDesc = Object.getOwnPropertyDescriptor(obj, prop);
                if (propDesc) {
                    if (propDesc.configurable === false) {
                        throw new TypeError("Unconfigurable property");
                    } else if (propDesc.set && !propDesc.get) {
                        throw new TypeError('Write-only property');
                    } else if ((propDesc.get && !propDesc.set) || propDesc.writable === false) {
                        // Options `once` or `ignoreDefinedParents` may help resolve this.
                        throw new TypeError('Read-only property');
                    }
                }
                if (propDesc && propDesc.set && propDesc.set.listeners) {
                    // One of us
                    addListener(propDesc, onSet, obj, prop);
                } else {
                    let get, set;
                    if (propDesc && propDesc.set) {
                        // Monkey patch existing getter/setter funcs.
                        set = function(incomingValue) {
                            const lastValue = obj[prop];
                            set.origSet(incomingValue);
                            const value = obj[prop];
                            if (Object.is(lastValue, value)) {
                                return;
                            }
                            for (const fn of Array.from(set.listeners)) {
                                fn(value);
                            }
                        };
                        set.origSet = propDesc.set;
                        get = propDesc.get;
                    } else {
                        let internalValue = obj[prop];
                        set = function(value) {
                            if (Object.is(internalValue, value)) {
                                return;
                            }
                            internalValue = value;
                            for (const fn of Array.from(set.listeners)) {
                                fn(value);
                            }
                        };
                        get = () => internalValue;
                    }
                    set.listeners = [];
                    Object.defineProperty(obj, prop, {
                        enumerable: propDesc ? propDesc.enumerable : true,
                        configurable: true,
                        get,
                        set
                    });
                    addListener(Object.getOwnPropertyDescriptor(obj, prop), onSet, obj, prop);
                }
            }
            catchDefine(options.root || self, propertyAccessor.split('.'));
        }
        let earlyRejection;
        const definedPromise = new Promise(resolve => {
            // Callback-only users of propDefined may not `await` our function, so we promote
            // exceptions during monitor setup to throw immediately.  This works for awaiting
            // users too.  Not sure why the spec for Promise is written this way as it leads
            // to more frail code.  :(
            try {
                monitorPromiseConstructor(resolve);
            } catch(e) {
                earlyRejection = e;
            }
        });
        if (earlyRejection) {
            throw earlyRejection;
        }
        return definedPromise;
    };


    class Database {
        constructor(name) {
            this.name = name;
            this.started = false;
        }

        async start() {
            if (this.started) {
                return;
            }
            if (!this.starting) {
                this.starting = new Promise((resolve, reject) => {
                    const migrations = this.migrations;
                    const latestVersion = migrations[migrations.length - 1].version;
                    const req = indexedDB.open(this.name, latestVersion);
                    req.addEventListener('error', ev => reject(req.error));
                    req.addEventListener('success', ev => resolve(req.result));
                    req.addEventListener('blocked', ev => reject(new Error('DB blocked')));
                    req.addEventListener('upgradeneeded', ev => {
                        console.info(`Upgrading DB from v${ev.oldVersion} to v${ev.newVersion}`);
                        const idb = req.result;
                        const t = req.transaction;
                        const stack = [];
                        for (let i = 0; i < migrations.length; i++) {
                            const migration = migrations[i];
                            if (ev.oldVersion && ev.oldVersion >= migration.version) {
                                continue;
                            }
                            stack.push(() => {
                                stack.shift();
                                migration.migrate(idb, t, stack[0] || (() => void 0));
                            });
                        }
                        stack[0]();
                    });
                }).then(x => {
                    this._idb = x;
                    this.started = true;
                });
            }
            await this.starting;
        }

        get migrations() {
            throw new Error("Pure Virtual");
        }

        getStore(name, mode='readonly', durability='relaxed') {
            const t = this._idb.transaction([name], mode, {durability});
            return t.objectStore(name);
        }

        delete() {
            if (this._idb) {
                const idb = this._idb;
                this._idb = null;
                this.started = false;
                idb.close();
            }
            return new Promise((resolve, reject) => {
                const req = indexedDB.deleteDatabase(this.name);
                req.addEventListener('error', ev => reject(req.error));
                req.addEventListener('success', ev => resolve(req.result));
            });
        }
    }


    const _dbStoreInstances = new Map();
    class DBStore {
        static singleton(...args) {
            if (!_dbStoreInstances.has(this)) {
                _dbStoreInstances.set(this, new this(...args));
            }
            return _dbStoreInstances.get(this);
        }

        constructor(db, name, options={}) {
            this.db = db;
            this.name = name;
            this.Model = options.Model;
            this._started = false;
        }

        async _start() {
            if (!this._starting) {
                this._starting = (async () => {
                    if (!this.db.started) {
                        await this.db.start();
                    }
                    const idbStore = this._getIDBStore('readonly');
                    this.keyPath = idbStore.keyPath;
                    this._started = true;
                })();
            }
            await this._starting;
        }

        _request(req, options={}) {
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

        _getIDBStore(mode, options={}) {
            if (!this.db.started) {
                throw new TypeError('Misuse of _getIDBStore: db is not started');
            }
            if (options.idbStore) {
                if (options.idbStore.name !== this.name) {
                    throw new TypeError("Invalid options.idbStore");
                }
                options.idbStore.commitOwn = () => void 0;
                return options.idbStore;
            }
            const s = this.db.getStore(this.name, mode);
            s.commitOwn = s.transaction.commit ? () => s.transaction.commit() : () => void 0;
            return s;
        }

        async _readQuery(getter, query, options={}, ...getterExtraArgs) {
            if (!this._started) {
                await this._start();
            }
            const idbStore = this._getIDBStore('readonly', options);
            const ifc = options.index ? idbStore.index(options.index) : idbStore;
            const p = this._request(ifc[getter](query, ...getterExtraArgs));
            idbStore.commitOwn();
            return await p;
        }

        _encodeQueryBounds(b) {
            b = Array.isArray(b) ? b : [b];
            return b.map(x => x === Infinity ? '__INF__' : x === -Infinity ? '___negINF___' : x);
        }

        extractKey(data, keyPath) {
            // keyPath can be a single key-ident or an array of key-idents where
            // a key ident can be a dot.notation string or just a solitary string.
            keyPath = keyPath || this.keyPath;
            if (!Array.isArray(keyPath)) {
                return this._walkKeyPath(data, keyPath);
            } else {
                return keyPath.map(x => this._walkKeyPath(data, x));
            }
        }

        async get(query, options={}) {
            const data = await this._readQuery('get', query, options);
            return options.model ? data && new this.Model(data, this) : data;
        }

        async getKey(query, options={}) {
            return await this._readQuery('getKey', query, options);
        }

        async getAll(query, options={}) {
            const data = await this._readQuery('getAll', query, options, options.limit);
            return options.models ? data.map(x => new this.Model(x, this)): data;
        }

        async getAllKeys(query, options={}) {
            if (!options.indexKey) {
                return await this._readQuery('getAllKeys', query, options, options.limit);
            } else {
                const keys = [];
                for await (const k of this.keys(query, options)) {
                    keys.push(k);
                }
                return keys;
            }
        }

        async count(query, options={}) {
            return await this._readQuery('count', query, options);
        }

        async _manyGetter(getter, queries, options={}) {
            if (!queries.length) {
                return [];
            }
            if (!this._started) {
                await this._start();
            }
            const retryLimit = 20;
            let retryId;
            for (let i = 1; i <= retryLimit; i++) {
                const idbStore = this._getIDBStore('readonly', options);
                const p = Promise.all(queries.map(q =>
                    this._readQuery(getter, q, {...options, idbStore}).then(x =>
                        options.models ? new this.Model(x, this) : x)));
                idbStore.commitOwn();
                try {
                    const resp = await p;
                    if (i > 1) {
                        console.warn(`IDB retry successfully recovered: ${i}/${retryLimit} [${retryId}]`);
                    }
                    return resp;
                } catch(e) {
                    if (i <= retryLimit && e.code === 0 &&
                        e.message === 'Failed to read large IndexedDB value') {
                        const stack = (new Error()).stack; // DOMException does not have an e.stack
                        retryId = performance.now();
                        console.warn(`IDB retry scheduled: ${i}/${retryLimit} [${retryId}]`, stack);
                        await new Promise(resolve => setTimeout(resolve, i * 100));
                    } else {
                        throw e;
                    }
                }
            }
        }

        async getMany(...args) {
            return await this._manyGetter('get', ...args);
        }

        async getAllMany(...args) {
            return await this._manyGetter('getAll', ...args);
        }

        async update(query, updates, options={}) {
            if (!this._started) {
                await this._start();
            }
            const idbStore = this._getIDBStore('readwrite', options);
            const ifc = options.index ? idbStore.index(options.index) : idbStore;
            if (options.index) {
                console.warn("DEPRECATED use of index for DB update", this, ifc, idbStore);
            }
            const data = await this._request(ifc.get(query));
            const updated = {...data, ...updates};
            const p = this._request(idbStore.put(updated));
            idbStore.commitOwn();
            await p;
            return updated;
        }

        async updateMany(updatesMap, options={}) {
            if (!(updatesMap instanceof Map)) {
                throw new TypeError('updatesMap must be Map type');
            }
            if (!updatesMap.size) {
                return;
            }
            if (!this._started) {
                await this._start();
            }
            const p = new Promise((resolve, reject) => {
                let putsRemaining = updatesMap.size;
                let getsRemaining = putsRemaining;
                const idbStore = this._getIDBStore('readwrite', options);
                const ifc = options.index ? idbStore.index(options.index) : idbStore;
                if (options.index) {
                    console.warn("DEPRECATED use of index for DB updateMany", this, ifc, idbStore);
                }
                const onAnyError = ev => reject(ev.target.error);
                const onPutSuccess = () => {
                    if (!--putsRemaining) {
                        resolve();
                    }
                };
                for (const [key, updates] of updatesMap.entries()) {
                    const get = ifc.get(key);
                    get.addEventListener('error', onAnyError);
                    get.addEventListener('success', () => {
                        const put = idbStore.put({...get.result, ...updates});
                        put.addEventListener('error', onAnyError);
                        put.addEventListener('success', onPutSuccess);
                        if (!--getsRemaining) {
                            idbStore.commitOwn();
                        }
                    });
                }
            });
            await p;
        }

        async put(data, options={}) {
            if (options.index) {
                throw new Error("DEPRECATED");
            }
            if (!this._started) {
                await this._start();
            }
            const idbStore = this._getIDBStore('readwrite', options);
            const p = this._request(idbStore.put(data));
            idbStore.commitOwn();
            await p;
        }

        async putMany(datas, options={}) {
            if (options.index) {
                throw new Error("DEPRECATED");
            }
            if (!datas.length) {
                return;
            }
            if (!this._started) {
                await this._start();
            }
            const idbStore = this._getIDBStore('readwrite', options);
            const index = options.index && idbStore.index(options.index); // XXX deprecate
            let remaining = datas.length;
            await Promise.all(datas.map(async data => {
                let key;
                if (index) {
                    key = await this._request(index.getKey(this.extractKey(data, index.keyPath)));
                }
                const p = this._request(idbStore.put(data, key));
                if (!--remaining) {
                    idbStore.commitOwn();
                }
                return p;
            }));
        }

        async delete(query, options={}) {
            if (!this._started) {
                await this._start();
            }
            const idbStore = this._getIDBStore('readwrite', options);
            const requests = [];
            if (options.index) {
                const index = idbStore.index(options.index);
                for (const key of await this._request(index.getAllKeys(query))) {
                    requests.push(idbStore.delete(key));
                }
            } else {
                requests.push(idbStore.delete(query));
            }
            const p = Promise.all(requests.map(x => this._request(x)));
            idbStore.commitOwn();
            await p;
            return requests.length;
        }

        async trim(query, len, options={}) {
            if (len == null || typeof len !== 'number') {
                throw new Error('len argument required');
            }
            if (!this._started) {
                await this._start();
            }
            const idbStore = this._getIDBStore('readwrite', options);
            const ifc = options.index ? idbStore.index(options.index) : idbStore;
            const curLen = await this._request(ifc.count(query));
            let delRem = curLen - len;
            if (!delRem || delRem < 0) {
                return 0;
            }
            const cursorReq = ifc.openKeyCursor(query, options.direction);
            const requests = [];
            await new Promise((resolve, reject) => {
                cursorReq.addEventListener('error', ev => {
                    reject(new Error(ev.target.error));
                });
                cursorReq.addEventListener('success', ev => {
                    const c = ev.target.result;
                    if (c) {
                        requests.push(this._request(idbStore.delete(c.primaryKey)));
                        if (--delRem) {
                            c.continue();
                            return;
                        }
                    }
                    resolve();
                });
            });
            idbStore.commitOwn();
            await Promise.all(requests);
            return requests.length;
        }

        async deleteMany(queries, options={}) {
            if (!queries.length) {
                return;
            }
            if (!this._started) {
                await this._start();
            }
            const idbStore = this._getIDBStore('readwrite', options);
            let keys;
            if (options.index) {
                const index = idbStore.index(options.index);
                keys = [];
                for (const q of queries) {
                    for (const key of await this._request(index.getAllKeys(q))) {
                        keys.push(key);
                    }
                }
            } else {
                keys = queries;
            }
            const p = Promise.all(keys.map(k => this._request(idbStore.delete(k))));
            idbStore.commitOwn();
            await p;
        }

        async *values(query, options={}) {
            let iter;
            let i = 0;
            const limit = options.limit || Infinity;
            const skipFilter = count => i - count;
            while (i < limit) {
                let data, done;
                if (done === undefined) {
                    if (!iter) {
                        iter = this._cursor(query, {...options, skipFilter});
                    }
                    let cursor;
                    ({value: cursor, done} = await iter.next());
                    data = cursor && cursor.value;
                }
                if (done) {
                    break;
                }
                yield options.models ? new this.Model(data, this) : data;
                i++;
            }
        }

        async *keys(query, options={}) {
            for await (const c of this._cursor(query, {keys: true, ...options})) {
                yield options.indexKey ? c.key : c.primaryKey;
            }
        }

        _cursorRequest(query, options) {
            if (!this._started) {
                throw new TypeError("Store not started");
            }
            const idbStore = this._getIDBStore(options.mode, options);
            const ifc = options.index ? idbStore.index(options.index) : idbStore;
            const curFunc = options.keys ? ifc.openKeyCursor : ifc.openCursor;
            return curFunc.call(ifc, query, options.direction);
        }

        async *_cursor(query, options={}) {
            if (!this._started) {
                await this._start();
            }
            const req = this._cursorRequest(query, options);
            let resolve;
            let reject;
            // Callbacks won't invoke until we release control of the event loop, so this is safe..
            req.addEventListener('error', ev => reject(req.error));
            req.addEventListener('success', ev => resolve(req.result));
            if (options.filter) {
                throw new TypeError('deprecated');
            }
            let count = 0;
            const limit = options.limit || Infinity;
            while (count < limit) {
                const cursor = await new Promise((_res, _rej) => void (resolve = _res, reject = _rej));
                if (!cursor) {
                    return;
                }
                if (options.skipFilter) {
                    const skip = options.skipFilter(count, cursor);
                    if (skip) {
                        cursor.advance(skip);
                        count += skip;
                        continue;
                    }
                }
                yield cursor;
                count++;
                cursor.continue();
            }
        }

        async saveModels(models, options) {
            const updatesMap = new Map();
            const updatedSave = new Map();
            for (const model of models) {
                if (!model._updated.size) {
                    continue;
                }
                const updates = {};
                for (const k of model._updated) {
                    updates[k] = model.data[k];
                }
                updatesMap.set(model.pk, updates);
                // Save a copy of the updated set from each model in case we fail.
                updatedSave.set(model, new Set(model._updated));
                model._updated.clear();
            }
            try {
                await this.updateMany(updatesMap, options);
            } catch(e) {
                // Restore updated keys before throwing, so future saves of the model
                // might recover and persist their changes.
                for (const [model, saved] of updatedSave.entries()) {
                    for (const x of saved) {
                        model._updated.add(x);
                    }
                }
                throw e;
            }
        }
    }


    class Model {
        constructor(data, store) {
            this.data = data;
            if (data && store) {
                this.pk = store.extractKey(data);
            }
            this._store = store;
            this._updated = new Set();
        }

        get(key) {
            return this.data[key];
        }

        set(keyOrObj, value) {
            if (value === undefined && typeof keyOrObj === 'object') {
                Object.assign(this.data, keyOrObj);
                for (const k of Object.keys(keyOrObj)) {
                    this._updated.add(k);
                }
            } else {
                this.data[keyOrObj] = value;
                this._updated.add(keyOrObj);
            }
        }

        async save(obj) {
            if (obj) {
                for (const [k, v] of Object.entries(obj)) {
                    this.set(k, v);
                }
            }
            const updates = {};
            for (const k of this._updated) {
                updates[k] = this.data[k];
            }
            this._updated.clear();
            await this._store.update(this.pk, updates);
            if (this.pk == null) {
                this.pk = this._store.extractKey(this.data);
            }
        }
    }

    sauce.db = {
        Database,
        DBStore,
        Model,
    };


    class CacheDatabase extends Database {
        get migrations() {
            return [
                // Version 1 deprecated
            {
                version: 2,
                migrate: (idb, t, next) => {
                    if (idb.objectStoreNames.contains('entries')) {
                        idb.deleteObjectStore("entries");
                    }
                    const store = idb.createObjectStore("entries", {keyPath: ['bucket', 'key']});
                    store.createIndex('bucket-expiration', ['bucket', 'expiration']);
                    next();
                }
            }];
        }
    }


    class CacheStore extends DBStore {
        async purgeExpired(bucket) {
            const q = IDBKeyRange.bound([bucket, -Infinity], [bucket, Date.now()]);
            return await this.delete(q, {index: 'bucket-expiration'});
        }
    }


    class TTLCache {
        constructor(bucket, ttl) {
            const db = new CacheDatabase('SauceCache');
            this.store = CacheStore.singleton(db, 'entries');
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
            const entry = await this.store.get([this.bucket, key]);
            if (entry && entry.expiration > Date.now()) {
                return entry;
            }
        }

        async get(key) {
            const entry = await this.getEntry(key);
            return entry && entry.value;
        }

        async getEntries(keys) {
            // getMany on an index returns an unknown number of entries so disambiguate
            // the results so they are aligned and padded with keys.
            const entries = await this.store.getMany(keys.map(k => [this.bucket, k]));
            const now = Date.now();
            const valids = new Map();
            for (const x of entries.filter(x => x && x.expiration > now)) {
                valids.set(x.key, x);
            }
            return keys.map(k => valids.get(k));
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
            });
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
            })));
        }

        async delete(key) {
            await this.store.delete([this.bucket, key]);
        }

        values() {
            const q = IDBKeyRange.bound([this.bucket, Date.now()], [this.bucket, Infinity]);
            return this.store.values(q, {index: 'bucket-expiration'});
        }

        keys() {
            const q = IDBKeyRange.bound([this.bucket, Date.now()], [this.bucket, Infinity]);
            return this.store.keys(q);
        }
    }

    sauce.cache = {
        TTLCache
    };


    sauce.LRUCache = class LRUCache extends Map {
        constructor(capacity) {
            super();
            this._capacity = capacity;
            this._head = null;
        }

        get(key) {
            const entry = super.get(key);
            if (entry === undefined) {
                return;
            }
            this._moveToHead(entry);
            return entry.value;
        }

        set(key, value) {
            let entry = super.get(key);
            if (entry === undefined) {
                if (this.size === this._capacity) {
                    // Fast path: just replace tail and rotate.
                    entry = this._head.prev;
                    this._head = entry;
                    this.delete(entry.key);
                } else {
                    entry = {};
                    if (!this.size) {
                        entry.next = entry.prev = entry;
                        this._head = entry;
                    } else {
                        this._moveToHead(entry);
                    }
                }
                entry.key = key;
                entry.value = value;
                super.set(key, entry);
            } else {
                entry.value = value;
                this._moveToHead(entry);
            }
        }

        _moveToHead(entry) {
            if (entry === this._head) {
                return;
            }
            if (entry.next) {
                entry.next.prev = entry.prev;
                entry.prev.next = entry.next;
            }
            entry.next = this._head;
            entry.prev = this._head.prev;
            this._head.prev.next = entry;
            this._head.prev = entry;
            this._head = entry;
        }

        clear() {
            this._head = null;
            super.clear();
        }
    };

    sauce.lruCache = function(func, size=100) {
        const _lc = new sauce.LRUCache(size);
        const wrap = function(...args) {
            const sig = JSON.stringify(args);
            if (!_lc.has(sig)) {
                const r = func.apply(this, args);
                return (r instanceof Promise) ? r.then(x => _lc.set(sig, x)) : _lc.set(sig, r), r;
            } else {
                return _lc.get(sig);
            }
        };
        Object.defineProperty(wrap, 'name', {value: func.name});
        return wrap;
    };
};
