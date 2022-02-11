/* global browser, sauce */

sauce.ns('storage', ns => {
    "use strict";


    function maybeExport(fn, options) {
        // storage is used in ext pages where proxy is not used.
        if (sauce.proxy && sauce.proxy.export && !browser.runtime.getBackgroundPage) {
            sauce.proxy.export(fn, {namespace: 'storage', ...options});
        }
    }


    async function storeSetOrRemove(store, data) {
        // Handle {foo: undefined} which by default will act like a noop to `set()`.
        const removes = Object.entries(data).filter(([_, v]) => v === undefined);
        if (removes.length) {
            await store.remove(removes.map(x => x[0]));
        }
        return await store.set(data);
    }


    ns.set = async function set(key, value, options={}) {
        let data;
        if (typeof key === 'object' && value === undefined) {
            data = key;
        } else {
            data = {[key]: value};
        }
        const store = options.sync ? browser.storage.sync : browser.storage.local;
        return await storeSetOrRemove(store, data);
    };
    maybeExport(ns.set);


    ns.get = async function get(key, options={}) {
        const store = options.sync ? browser.storage.sync : browser.storage.local;
        const o = await store.get(key);
        return typeof key === 'string' ? o[key] : o;
    };
    maybeExport(ns.get);


    ns.remove = async function remove(key, options={}) {
        const store = options.sync ? browser.storage.sync : browser.storage.local;
        return await store.remove(key);
    };
    maybeExport(ns.remove);


    ns.clear = async function clear(options={}) {
        const store = options.sync ? browser.storage.sync : browser.storage.local;
        return await store.clear();
    };
    maybeExport(ns.clear);


    ns.getAthleteInfo = async function getAthleteInfo(id) {
        const athlete_info = await ns.get('athlete_info');
        if (athlete_info && athlete_info[id]) {
            return athlete_info[id];
        }
    };
    maybeExport(ns.getAthleteInfo);


    ns.updateAthleteInfo = async function updateAthleteInfo(id, updates) {
        return await ns.update(`athlete_info.${id}`, updates);
    };
    maybeExport(ns.updateAthleteInfo);


    ns.getPref = async function getPref(path) {
        const prefs = await ns.get('preferences');
        let ref = prefs || {};
        for (const key of path.split('.')) {
            if (ref[key] == null) {
                return ref[key];
            }
            ref = ref[key];
        }
        return ref;
    };
    maybeExport(ns.getPref);


    ns.setPref = async function setPref(path, value) {
        const keys = path.split('.');
        // update() uses Object.assign, so we need to feed it single entry object.
        let o;
        let fqPath = 'preferences';
        if (keys.length === 1) {
            o = {[path]: value};
        } else if (keys.length > 1) {
            const leaf = keys.pop();
            fqPath += '.' + keys.join('.');
            o = {[leaf]: value};
        } else {
            throw new TypeError("setPref misuse");
        }
        await ns.update(fqPath, o);
    };
    maybeExport(ns.setPref, {name: '_setPref'});


    let _activeUpdate;
    ns.update = async function update(keyPath, updates, options={}) {
        if (typeof updates !== 'object') {
            throw new TypeError('updates arg must be an object');
        }
        const store = options.sync ? browser.storage.sync : browser.storage.local;
        const priorUpdate = _activeUpdate;
        const ourUpdate = (async () => {
            if (priorUpdate) {
                await priorUpdate;
            }
            // keyPath can be dot.notation.
            const keys = keyPath.split('.');
            const rootKey = keys.shift();
            const rootRef = (await store.get(rootKey))[rootKey] || {};
            let ref = rootRef;
            for (const key of keys) {
                if (ref[key] == null) {
                    ref[key] = {};
                }
                ref = ref[key];
            }
            Object.assign(ref, updates);
            await storeSetOrRemove(store, {[rootKey]: rootRef});
            return ref;
        })();
        _activeUpdate = ourUpdate;
        try {
            return await ourUpdate;
        } finally {
            if (ourUpdate === _activeUpdate) {
                _activeUpdate = null;
            }
        }
    };
    maybeExport(ns.update);
});
