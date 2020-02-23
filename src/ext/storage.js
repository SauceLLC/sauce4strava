/* global browser */


(function () {
    "use strict";

    self.sauce = self.sauce || {};
    const ns = self.sauce.storage = {};

    let _storageIface;
    async function getStorageInterface() {
        if (_storageIface === undefined) {
            try {
                await browser.storage.sync.get('irrelevant');
                _storageIface = browser.storage.sync;
            } catch(e) {
                _storageIface = browser.storage.local;
            }
        }
        return _storageIface;
    }


    ns.set = async function(key, value) {
        let data;
        if (typeof key === 'object' && value === undefined) {
            data = key;
        } else {
            data = {[key]: value};
        }
        const storage = await getStorageInterface();
        return await storage.set(data);
    };

    ns.get = async function(key) {
        const storage = await getStorageInterface();
        const o = await storage.get(key);
        return typeof key === 'string' ? o[key] : o;
    };

    ns.remove = async function(key) {
        const storage = await getStorageInterface();
        return await storage.remove(key);
    };

    ns.clear = async function() {
        const storage = await getStorageInterface();
        return await storage.clear();
    };
})();
