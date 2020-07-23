/* global browser */


(function () {
    "use strict";

    self.sauce = self.sauce || {};
    const ns = self.sauce.storage = {};

    ns.set = async function(key, value, options={}) {
        let data;
        if (typeof key === 'object' && value === undefined) {
            data = key;
        } else {
            data = {[key]: value};
        }
        const store = options.sync ? browser.storage.sync : browser.storage.local;
        return await store.set(data);
    };

    ns.get = async function(key, options={}) {
        const store = options.sync ? browser.storage.sync : browser.storage.local;
        const o = await store.get(key);
        return typeof key === 'string' ? o[key] : o;
    };

    ns.remove = async function(key, options={}) {
        const store = options.sync ? browser.storage.sync : browser.storage.local;
        return await store.remove(key);
    };

    ns.clear = async function(options={}) {
        const store = options.sync ? browser.storage.sync : browser.storage.local;
        return await store.clear();
    };

    let _activeUpdate;
    ns.update = async (keyPath, updates, options={}) => {
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
})();
