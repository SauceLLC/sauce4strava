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

    /*
    browser.runtime.onMessage.addListener(async (msg, sender) => {
        const hook = sauce.proxy.hooks[msg.system][msg.op];
        if (!msg.bg && !(hook.options && hook.options.bg)) {
            console.error("Hook should not be running in BG:", msg, hook);
            throw new Error("Non background-only hook being sent to background page!");
        }
        return await hook.callback.call(sender, msg.data);
    });
    */

    browser.runtime.onMessage.addListener(async (data, sender) => {
        if (!data || !data.call || data.call !== 'sauce-proxy-init') {
            throw new Error("Invalid Message");
        }
        return Array.from(exports.values()).map(x => x.desc);
    });
})();
