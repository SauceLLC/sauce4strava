/* global browser */


(function () {
    "use strict";

    self.sauce = self.sauce || {};
    const ns = self.sauce.storage = {};

    let _storageIface;
    function getStorageInterface() {
        if (_storageIface === undefined) {
            // Just disable sync for firefox for now.
            _storageIface = navigator.userAgent.match(/Firefox/) ?
                browser.storage.local :
                browser.storage.sync;
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
        const storage = getStorageInterface();
        return await storage.set(data);
    };

    ns.get = async function(key) {
        const storage = getStorageInterface();
        const o = await storage.get(key);
        return typeof key === 'string' ? o[key] : o;
    };

    ns.remove = async function(key) {
        const storage = getStorageInterface();
        return await storage.remove(key);
    };

    ns.clear = async function() {
        const storage = getStorageInterface();
        return await storage.clear();
    };
})();
