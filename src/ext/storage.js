/* global browser */


(function () {
    "use strict";

    self.sauce = self.sauce || {};
    const ns = self.sauce.storage = {};

    ns.set = async function(key, value) {
        let data;
        if (typeof key === 'object' && value === undefined) {
            data = key;
        } else {
            data = {[key]: value};
        }
        return await browser.storage.local.set(data);
    };

    ns.get = async function(key) {
        const o = await browser.storage.local.get(key);
        return typeof key === 'string' ? o[key] : o;
    };

    ns.remove = async function(key) {
        return await browser.storage.local.remove(key);
    };

    ns.clear = async function() {
        return await browser.storage.local.clear();
    };
})();
