/* global sauce, browser */

(function() {
    'use strict';

    self.sauce = self.sauce || {};
    const ns = sauce.proxy = sauce.proxy || {};


    async function invoke(data, sender) {
        if (!data || !data.desc || !data.desc.call) {
            throw new Error("Invalid Message");
        }
        if (data.desc.call === 'sauce-proxy-init') {
            return {pid: data.pid, exports: Array.from(ns.exports.values()).map(x => x.desc)};
        }
        const entry = ns.exports.get(data.desc.call);
        if (!entry) { 
            return ns._wrapError(new Error('Invalid proxy call: ' + data.desc.call));
        } else { 
            return await entry.exec.call(sender, data);
        }
    }


    browser.runtime.onConnect.addListener(port => {
        if (port.name !== 'sauce-proxy-port') {
            console.warn("Unexpected extension port usage");
            return;
        }
        const onMessage = async data => {
            if (data.once) {
                port.onMessage.removeListener(onMessage);
            }
            data.port = port;
            port.postMessage(await invoke(data, port.sender));
        };
        port.onMessage.addListener(onMessage);
    });
})();
