/* global chrome */


(function () {
    "use strict";

    self.sauce = self.sauce || {};
    const ns = self.sauce.storage = {};

    ns.set = function(key, value) {
        let data;
        if (typeof key === 'object' && value === undefined) {
            data = key;
        } else {
            data = {[key]: value};
        }
        return new Promise(resolve => chrome.storage.sync.set(data, resolve));
    };

    ns.get = async function(key) {
        const o = await new Promise(resolve => chrome.storage.sync.get(key, resolve));
        return typeof key === 'string' ? o[key] : o;
    };

    ns.remove = function(key) {
        return new Promise(resolve => chrome.storage.sync.remove(key, resolve));
    };

    ns.clear = function() {
        return new Promise(resolve => chrome.storage.sync.clear(resolve));
    };
})();
