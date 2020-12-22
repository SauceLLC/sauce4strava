/* global sauce, browser */

(function() {
    'use strict';

    self.sauce = self.sauce || {};
    const ns = sauce.proxy = sauce.proxy || {};


    browser.runtime.onMessage.addListener(async (data, sender) => {
        if (!data || !data.desc || !data.desc.call) {
            throw new Error("Invalid Message");
        }
        if (data.desc.call === 'sauce-proxy-init') {
            return Array.from(ns.exports.values()).map(x => x.desc);
        }
        const entry = ns.exports.get(data.desc.call);
        if (!entry) { 
            return ns._wrapError(new Error('Invalid proxy call: ' + data.desc.call));
        } else { 
            return await entry.exec.call(sender, data.pid, ...data.args);
        }   
    });
})();
