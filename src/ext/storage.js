/* global browser */


(function () {
    "use strict";

    self.sauce = self.sauce || {};
    const ns = self.sauce.storage = {};

    ns.set = async function set(key, value, options={}) {
        let data;
        if (typeof key === 'object' && value === undefined) {
            data = key;
        } else {
            data = {[key]: value};
        }
        const store = options.sync ? browser.storage.sync : browser.storage.local;
        return await store.set(data);
    };
    sauce.proxy.export(ns.set, {namespace: 'storage'});

    ns.get = async function get(key, options={}) {
        const store = options.sync ? browser.storage.sync : browser.storage.local;
        const o = await store.get(key);
        return typeof key === 'string' ? o[key] : o;
    };
    sauce.proxy.export(ns.get, {namespace: 'storage'});

    ns.remove = async function remove(key, options={}) {
        const store = options.sync ? browser.storage.sync : browser.storage.local;
        return await store.remove(key);
    };
    sauce.proxy.export(ns.remove, {namespace: 'storage'});

    ns.clear = async function clear(options={}) {
        const store = options.sync ? browser.storage.sync : browser.storage.local;
        return await store.clear();
    };
    sauce.proxy.export(ns.clear, {namespace: 'storage'});

    ns.getAthleteInfo = async function getAthleteInfo(id) {
        const athlete_info = await ns.get('athlete_info');
        if (athlete_info && athlete_info[id]) {
            return athlete_info[id];
        }
    };
    sauce.proxy.export(ns.getAthleteInfo, {namespace: 'storage'});

    ns.updateAthleteInfo = async function updateAthleteInfo(id, updates) {
        return await ns.update(`athlete_info.${id}`, updates);
    };
    sauce.proxy.export(ns.updateAthleteInfo, {namespace: 'storage'});

    ns.setAthleteProp = async function setAthleteProp(id, key, value) {
        await ns.updateAthleteInfo(id, {[key]: value});
    };
    sauce.proxy.export(ns.setAthleteProp, {namespace: 'storage'});

    ns.getAthleteProp = async function getAthleteProp(id, key) {
        const info = await ns.getAthleteInfo(id);
        return info && info[key];
    };
    sauce.proxy.export(ns.getAthleteProp, {namespace: 'storage'});

    ns.getPref = async function getPref(key) {
        const prefs = await ns.get('preferences');
        return prefs && prefs[key];
    };
    sauce.proxy.export(ns.getPref, {namespace: 'storage'});

    ns.setPref = async function setPref(key, value) {
        return await ns.update('preferences', {[key]: value});
    };
    sauce.proxy.export(ns.setPref, {namespace: 'storage'});

    let _activeUpdate;
    ns.update = async function update(keyPath, updates, options={}) {
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
            await store.set({[rootKey]: rootRef});
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
    sauce.proxy.export(ns.update, {namespace: 'storage'});
})();
