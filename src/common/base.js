/* global sauce */

// NOTE: Must be assigned to self and have matching name for FF
self.sauceBaseInit = function sauceBaseInit() {
    'use strict';

    self.sauce = self.sauce || {};
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


    sauce.formatInputDate = function(ts) {
        // Return a input[type="date"] compliant value from a ms timestamp.
        return ts ? (new Date(ts)).toISOString().split('T')[0] : '';
    };


    if (!Object.fromEntries) {
        Object.fromEntries = entries => entries.reduce((agg, [k, v]) => (agg[k] = v, agg), {});
    }


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
            const bin = text.encode(JSON.stringify(data));
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
        return output.buffer;
    };


    sauce.concatBundles = function(...bundles) {
        const dataSize = bundles.reduce((sz, b) => b.byteLength + sz, 0);
        const output = new Uint8Array(dataSize);
        for (let offt = 0, i = 0; offt < dataSize; offt += bundles[i++].byteLength) {
            output.set(new Uint8Array(bundles[i]), offt);
        }
        return output.buffer;
    };


    sauce.decodeBundle = function(buffer) {
        const input = new Uint8Array(buffer);
        const view = new DataView(buffer);
        const text = new TextDecoder('utf-8');
        const datas = [];
        let idx = 0;
        while (idx < input.byteLength) {
            const size = view.getUint32(idx);
            idx += 4;
            datas.push(JSON.parse(text.decode(input.slice(idx, idx + size))));
            idx += size;
        }
        return datas;
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


    const _modules = {};
    sauce.getModule = async function(urn) {
        // Note: modules are only supported in the site context and the background page.
        // Content scripts of the extention itself do NOT work and cannot work without
        // browser support due to isolation issues.
        if (!_modules[urn]) {
            const script = document.createElement('script');
            const doneEvent = 'smid-' + (Date.now() + Math.random());
            const extUrl = self.browser ? self.browser.runtime.getURL('') : sauce.extUrl;
            _modules[urn] = await new Promise((resolve, reject) => {
                script.addEventListener('error', ev => reject(new Error(`Module load error: ${urn}`)));
                script.type = 'module';
                script.src = extUrl + `src/common/module-loader.mjs?ondone=${doneEvent}&module=${urn}`;
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
        return _modules[urn];
    };


    sauce.downloadBlob = function(blob, name) {
        const url = URL.createObjectURL(blob);
        try {
            sauce.downloadURL(url, name || blob.name);
        } finally {
            URL.revokeObjectURL(url);
        }
    };


    sauce.downloadURL = function(url, name) {
        const link = document.createElement('a');
        link.href = url;
        link.download = name;
        link.style.display = 'none';
        document.body.appendChild(link);
        try {
            link.click();
        } finally {
            link.remove();
        }
    };


    sauce.dialog = function(options={}) {
        const $dialog = options.el || self.jQuery(`<div>${options.body || ''}</div>`);
        const dialogClass = `sauce-dialog ${options.dialogClass || ''}`;
        if (options.flex) {
            $dialog.addClass('flex');
        }
        // Assign default button(s) (will be clobbered if options.buttons is defined)
        const defaultClass = 'btn';
        const buttons = [{
            text: 'Close', // XXX locale
            click: () => $dialog.dialog('close'),
            class: defaultClass,
        }];
        if (Array.isArray(options.extraButtons)) {
            for (const x of options.extraButtons) {
                if (!x.class) {
                    x.class = defaultClass;
                }
                buttons.push(x);
            }
        } else if (options.extraButtons && typeof options.extraButtons === 'object') {
            for (const [text, click] of Object.entries(options.extraButtons)) {
                buttons.push({text, click, class: defaultClass});
            }
        }
        $dialog.dialog(Object.assign({buttons}, options, {dialogClass}));
        $dialog.on('click', 'a.help-info', ev => {
            const helpFor = ev.currentTarget.dataset.help;
            ev.currentTarget.classList.add('hidden');
            $dialog.find(`.help[data-for="${helpFor}"]`).toggleClass('visible');
        });
        $dialog.on('click', '.help a.sauce-dismiss', ev => {
            const help = ev.currentTarget.closest('.help');
            help.classList.remove('visible');
            $dialog.find(`a.help-info[data-help="${help.dataset.for}"]`).removeClass('hidden');
        });
        if (options.autoDestroy) {
            $dialog.on('dialogclose', ev => void $dialog.dialog('destroy'));
        }
        if (options.closeOnMobileBack) {
            const dialogId = Math.random();
            history.pushState({dialogId}, null);
            const onPop = ev => $dialog.dialog('close');
            window.addEventListener('popstate', onPop);
            $dialog.on('dialogclose', ev => {
                window.removeEventListener('popstate', onPop);
                if (history.state.dialogId === dialogId) {
                    history.go(-1);
                }
            });
        }
        return $dialog;
    };


    sauce.modal = function(options) {
        return sauce.dialog(Object.assign({
            modal: true,
        }, options));
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
                let inCallback = false;
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
                        if (callback && !inCallback) {
                            inCallback = true;
                            try {
                                callback(value);
                            } finally {
                                inCallback = false;
                            }
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
                    req.addEventListener('success', ev => resolve(ev.target.result));
                    req.addEventListener('blocked', ev => reject(new Error('Blocked by existing DB connection')));
                    req.addEventListener('upgradeneeded', ev => {
                        console.info(`Upgrading DB from v${ev.oldVersion} to v${ev.newVersion}`);
                        const idb = ev.target.result;
                        const t = ev.target.transaction;
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
    }


    class DBStore {
        constructor(db, name, options={}) {
            this.db = db;
            this.name = name;
            this.Model = options.Model;
        }

        _request(req, options={}) {
            if (options.commit) {
                //console.warn("COMIT!", req);
                //req.transaction.commit();
            }
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
                if (options.idbStore.name !== this.name || options.idbStore.transaction.mode !== mode) {
                    throw new TypeError("Invalid options.idbStore");
                }
                return options.idbStore;
            }
            return this.db.getStore(this.name, mode);
        }

        async _readQuery(getter, query, options={}, ...getterExtraArgs) {
            if (!this.db.started) {
                await this.db.start();
            }
            const idbStore = this._getIDBStore('readonly', options);
            const ifc = options.index ? idbStore.index(options.index) : idbStore;
            return [await this._request(ifc[getter](query, ...getterExtraArgs)), idbStore];
        }

        extractKey(data, keyPath) {
            // keyPath can be a single key-ident or an array of key-idents where
            // a key ident can be a dot.notation string or just a solitary string.
            if (!Array.isArray(keyPath)) {
                return this._walkKeyPath(data, keyPath);
            } else {
                return keyPath.map(x => this._walkKeyPath(data, x));
            }
        }

        async get(query, options={}) {
            const [data, idbStore] = await this._readQuery('get', query, options);
            return options.model ? data && new this.Model(data, this, idbStore.keyPath) : data;
        }

        async getKey(query, options={}) {
            return (await this._readQuery('getKey', query, options))[0];
        }

        async getAll(query, options={}) {
            const [data, idbStore] = await this._readQuery('getAll', query, options, options.count);
            return options.models ? data.map(x => new this.Model(x, this, idbStore.keyPath)): data;
        }

        async getAllKeys(query, options={}) {
            if (!options.indexKey) {
                return (await this._readQuery('getAllKeys', query, options, options.count))[0];
            } else {
                const keys = [];
                for await (const k of this.keys(query, options)) {
                    keys.push(k);
                }
                return keys;
            }
        }

        async count(query, options={}) {
            return (await this._readQuery('count', query, options))[0];
        }

        async getMany(queries, options={}) {
            if (!this.db.started) {
                await this.db.start();
            }
            const idbStore = this._getIDBStore('readonly', options);
            const ifc = options.index ? idbStore.index(options.index) : idbStore;
            const data = [];
            // Performance tuned to avoid Promise.all
            await new Promise((resolve, reject) => {
                let pending = 0;
                const onSuccess = ev => {
                    if (options.index) {
                        for (const x of ev.target.result) {
                            data.push(x);
                        }
                    } else {
                        data.push(ev.target.result);
                    }
                    if (!--pending) {
                        resolve();
                    }
                };
                const onError = ev => reject(ev.target.error);
                for (const q of queries) {
                    pending++;
                    const req = options.index ? ifc.getAll(q) : ifc.get(q);
                    req.addEventListener('success', onSuccess);
                    req.addEventListener('error', onError);
                }
                if (!pending) {
                    resolve();
                }
            });
            return options.models ? data.map(x => new this.Model(x, this, idbStore.keyPath)): data;
        }

        async update(query, updates, options={}) {
            if (!this.db.started) {
                await this.db.start();
            }
            const idbStore = this._getIDBStore('readwrite', options);
            const ifc = options.index ? idbStore.index(options.index) : idbStore;
            const data = await this._request(ifc.get(query));
            const updated = Object.assign({}, data, updates);
            await this._request(idbStore.put(updated), {commit: true});
            return updated;
        }

        async updateMany(updatesMap, options={}) {
            if (!(updatesMap instanceof Map)) {
                throw new TypeError('updatesMap must be Map type');
            }
            if (!this.db.started) {
                await this.db.start();
            }
            const idbStore = this._getIDBStore('readwrite', options);
            const ifc = options.index ? idbStore.index(options.index) : idbStore;
            return await Promise.all(Array.from(updatesMap.entries()).map(async ([key, updates]) => {
                const data = await this._request(ifc.get(key));
                const updated = Object.assign({}, data, updates);
                await this._request(idbStore.put(updated));
                return updated;
            }));
        }

        async put(data, options={}) {
            if (!this.db.started) {
                await this.db.start();
            }
            const idbStore = this._getIDBStore('readwrite', options);
            let key;
            if (options.index) {
                const index = idbStore.index(options.index);
                key = await this._request(index.getKey(this.extractKey(data, index.keyPath)));
            }
            await this._request(idbStore.put(data, key));
        }

        async putMany(datas, options={}) {
            if (!this.db.started) {
                await this.db.start();
            }
            const idbStore = this._getIDBStore('readwrite', options);
            const index = options.index && idbStore.index(options.index);
            await Promise.all(datas.map(async data => {
                let key;
                if (index) {
                    key = await this._request(index.getKey(this.extractKey(data, index.keyPath)));
                }
                await this._request(idbStore.put(data, key));
            }));
        }

        async delete(query, options={}) {
            if (!this.db.started) {
                await this.db.start();
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
            await Promise.all(requests.map(x => this._request(x)));
            return requests.length;
        }

        async deleteMany(queries, options={}) {
            if (!this.db.started) {
                await this.db.start();
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
            await Promise.all(keys.map(k => this._request(idbStore.delete(k))));
        }

        async *values(query, options={}) {
            let keyPath;
            for await (const c of this.cursor(query, options)) {
                if (options.models) {
                    if (keyPath === undefined) {
                        if (c.source instanceof IDBIndex) {
                            keyPath = c.source.objectStore.keyPath;
                        } else {
                            keyPath = c.source.keyPath;
                        }
                    }
                    yield new this.Model(c.value, this, keyPath);
                } else {
                    yield c.value;
                }
            }
        }

        async *keys(query, options={}) {
            for await (const c of this.cursor(query, Object.assign({keys: true}, options))) {
                yield options.indexKey ? c.key : c.primaryKey;
            }
        }

        _cursorRequest(query, options) {
            if (!this.db.started) {
                throw new TypeError("DB not started");
            }
            const idbStore = this._getIDBStore(options.mode, options);
            const ifc = options.index ? idbStore.index(options.index) : idbStore;
            const curFunc = options.keys ? ifc.openKeyCursor : ifc.openCursor;
            return curFunc.call(ifc, query, options.direction);
        }

        async *cursor(query, options={}) {
            if (!this.db.started) {
                await this.db.start();
            }
            const req = this._cursorRequest(query, options);
            let resolve;
            let reject;
            // Callbacks won't invoke until we release control of the event loop, so this is safe..
            req.addEventListener('error', ev => reject(req.error));
            req.addEventListener('success', ev => resolve(ev.target.result));
            let count = 0;
            while (true) {
                const cursor = await new Promise((_resolve, _reject) => {
                    resolve = _resolve;
                    reject = _reject;
                });
                if (!cursor) {
                    return;
                }
                if (!options.filter || options.filter(cursor)) {
                    count++;
                    yield cursor;
                    if (options.limit && count >= options.limit) {
                        return;
                    }
                }
                cursor.continue();
            }
        }

        async cursorAll(query, resultFn, options={}) {
            // This is ever so slightly faster than cursor.. Might remove..
            if (!this.db.started) {
                await this.db.start();
            }
            const req = this._cursorRequest(query, options);
            const results = [];
            await new Promise((resolve, reject) => {
                let count = 0;
                req.addEventListener('error', ev => reject(req.error));
                req.addEventListener('success', ev => {
                    const cursor = ev.target.result;
                    if (!cursor) {
                        resolve();
                    } else if (!options.filter || options.filter(cursor)) {
                        count++;
                        results.push(resultFn(cursor));
                        if (options.limit && count >= options.limit) {
                            resolve();
                        } else {
                            cursor.continue();
                        }
                    }
                });
            });
            return results;
        }

        async saveModels(models) {
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
                await this.updateMany(updatesMap);
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
        constructor(data, store, keyPath) {
            this.data = data;
            this.keyPath = keyPath;
            if (data && store) {
                this.pk = store.extractKey(data, keyPath);
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
                this.pk = this._store.extractKey(this.data, this.keyPath);
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
            return [{
                version: 1,
                migrate: (idb, t, next) => {
                    const idbStore = idb.createObjectStore("entries", {autoIncrement: true});
                    idbStore.createIndex('bucket-expiration', ['bucket', 'expiration']);
                    idbStore.createIndex('bucket-key', ['bucket', 'key'], {unique: true});
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


    async function ga(...args) {
        if (!sauce.ga || !sauce.ga.applyWithContext) {
            await sauce.proxy.connected;
        }
        return await sauce.ga.applyWithContext({referrer: document.referrer}, ...args);
    }


    async function reportEvent(eventCategory, eventAction, eventLabel, options) {
        await ga('send', 'event', Object.assign({
            eventCategory,
            eventAction,
            eventLabel,
        }, options));
    }


    async function reportError(e) {
        if (e && e.disableReport) {
            console.warn('Ignoring non-reporting error:', e);
            return;
        }
        const page = location.pathname;
        const version = (sauce && sauce.version) ||
            (self.browser && self.browser.runtime.getManifest().version);
        const desc = [`v${version}`];
        try {
            if (e == null || !e.stack) {
                console.error("Non-exception object was thrown:", e);
                const props = {type: typeof e};
                try {
                    props.json = JSON.parse(JSON.stringify(e));
                } catch(_) {/*no-pragma*/}
                if (e != null) {
                    props.klass = e.constructor && e.constructor.name;
                    props.name = e.name;
                    props.message = e.message;
                    props.code = e.code;
                }
                desc.push(`Invalid Error: ${JSON.stringify(props)}`);
                for (const x of _stackFrameAudits) {
                    desc.push(` Audit frame: ${x}`);
                }
            } else {
                desc.push(e.stack);
            }
        } catch(intError) {
            desc.push(`Internal error during report error: ${intError.stack} ::: ${e}`);
        }
        for (const x of getStackFrames().slice(1)) {
            desc.push(` Stack frame: ${x}`);
        }
        const exDescription = desc.join('\n');
        console.error('Reporting:', e);
        await ga('send', 'exception', {
            exDescription,
            exFatal: true,
            page
        });
        await reportEvent('Error', 'exception', desc, {nonInteraction: true, page});
    }


    function getStackFrames() {
        const e = new Error();
        return e.stack.split(/\n/).slice(2).map(x => x.trim());
    }


    let _stackFrameAudits = [];
    function auditStackFrame() {
        const frames = getStackFrames();
        const caller = frames && frames[1];
        if (typeof caller === 'string') { // be paranoid for now
            _stackFrameAudits.push(caller);
        }
    }

    sauce.report = {
        ga,
        event: reportEvent,
        error: reportError,
        auditStackFrame,
    };
};
