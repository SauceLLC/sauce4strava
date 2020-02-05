/* global */


(function () {
    "use strict";

    self.browser = self.browser || self.chrome;

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


    function promiseStorage(method, ...args) {
        const iface = getStorageInterface();
        return new Promise((resolve, reject) => {
            args.push(x => {
                if (browser.runtime.lastError) {
                    reject(lastError);
                } else {
                    resolve(x);
                }
            });
            iface[method].apply(iface, args);
        });
    }
   

    ns.set = async function(key, value) {
        let data;
        if (typeof key === 'object' && value === undefined) {
            data = key;
        } else {
            data = {[key]: value};
        }
        return await promiseStorage('set', data);
    };

    ns.get = async function(key) {
        const o = await promiseStorage('get', key);
        return typeof key === 'string' ? o[key] : o;
    };

    ns.remove = async function(key) {
        return await promiseStorage('remove', key);
    };

    ns.clear = async function() {
        return await promiseStorage('clear');
    };
})();
