/* global sauce, browser */

(function() {
    'use strict';

    self.sauce = self.sauce || {};
    const ns = sauce.proxy = sauce.proxy || {};
    const bgInit = browser.runtime.sendMessage({call: 'sauce-proxy-init'});


    function makeBackgroundExec(desc) {
        return async function(pid, ...args) {
            const data = await browser.runtime.sendMessage({desc, args, pid});
            data.pid = pid;
            return data;
        };
    }


    async function onMessageEstablishChannel(ev) {
        const extId = browser.runtime.id;
        if (ev.source !== self || !ev.data || ev.data.extId !== extId ||
            ev.data.type !== 'sauce-proxy-establish-channel') {
            return;
        }
        self.removeEventListener('message', onMessageEstablishChannel);
        for (const desc of await bgInit) {
            ns.exports.set(desc.call, {desc, exec: makeBackgroundExec(desc)});
        }
        const reqPort = ev.ports[0];
        const respChannel = new MessageChannel();
        const respPort = respChannel.port1;
        reqPort.addEventListener('message', async ev => {
            if (!ev.data || ev.data.extId !== extId) {
                throw new TypeError('Proxy Protocol Violation [PAGE]');
            }
            let data;
            const entry = ns.exports.get(ev.data.desc.call);
            if (!entry) {
                data = ns._wrapError(new Error('Invalid proxy call: ' + ev.data.desc.call));
            } else {
                data = await entry.exec(ev.data.pid, ...ev.data.args);
            }
            data.extId = extId;
            data.type = 'sauce-proxy-response';
            respPort.postMessage(data);
        });
        reqPort.addEventListener('messageerror', ev => console.error("Message Error:", ev));
        reqPort.start();
        reqPort.postMessage({
            type: 'sauce-proxy-establish-channel-ack',
            extId,
            exports: Array.from(ns.exports.values()).map(x => x.desc)
        }, [respChannel.port2]);
    }
    self.addEventListener('message', onMessageEstablishChannel);
})();
