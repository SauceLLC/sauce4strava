/* global sauce, browser */

(function() {
    'use strict';

    self.sauce = self.sauce || {};
    const ns = sauce.proxy = sauce.proxy || {};
    const exports = new Map();


    ns.export = function(fn, options={}) {
        const eventing = !!options.eventing;
        const name = options.name || fn.name;
        const call = options.namespace ? `${options.namespace}.${name}` : name;
        exports.set(call, {
            desc: {
                call,
                eventing
            },
            fn
        });
    };


    browser.runtime.onMessage.addListener(async (data, sender) => {
        if (!data || !data.call) {
            throw new Error("Invalid Message");
        }
        if (data.call === 'sauce-proxy-init') {
            return Array.from(exports.values()).map(x => x.desc);
        }
        const entry = exports.get(data.call);
        return await entry.fn.apply(sender, data.args);
    });
})();
