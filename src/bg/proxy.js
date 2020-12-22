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
            return Array.from(ns.exports.values()).map(x => x.desc);
        }
        const entry = ns.exports.get(data.desc.call);
        if (!entry) { 
            return ns._wrapError(new Error('Invalid proxy call: ' + data.desc.call));
        } else { 
            return await entry.exec.call(sender, data);
        }
    }


    browser.runtime.onMessage.addListener(invoke);

    browser.runtime.onConnect.addListener(port => {
        if (port.name !== 'sauce-proxy-port') {
            debugger;
            return;
        }
        const onEstablish = async data => {
            port.onMessage.removeListener(onEstablish);
            data.port = port;
            port.postMessage(await invoke(data, port.sender));
        };
        port.onMessage.addListener(onEstablish);
    });
})();
