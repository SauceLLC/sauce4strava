/* global sauce, browser */

(function() {
    'use strict';

    self.sauce = self.sauce || {};
    const ns = sauce.proxy = sauce.proxy || {};
    const bgInit = browser.runtime.sendMessage({desc: {call: 'sauce-proxy-init'}});


    function makeBackgroundExec(desc) {
        return async function({pid, port, args}) {
            if (port) {
                // Use port based communication where we just setup a router for events.
                const bgPort = browser.runtime.connect({name: `sauce-proxy-port`});
                port.addEventListener('message', ev => bgPort.postMessage(ev.data));
                port.start();
                const response = await new Promise(resolve => {
                    const onAck = msg => {
                        // The first message back is the response to the exec call.
                        // After that it's up to the user how they use the port.
                        bgPort.onMessage.removeListener(onAck);
                        resolve(msg);
                    };
                    bgPort.onMessage.addListener(onAck);
                    bgPort.postMessage({desc, args, pid});
                });
                bgPort.onMessage.addListener(msg => port.postMessage(msg));
                return response;
            } else {
                return await browser.runtime.sendMessage({desc, args, pid});
            }
        };
    }


    async function onMessageEstablishChannel(ev) {
        if (ev.source !== self || !ev.data || ev.data.type !== 'sauce-proxy-establish-channel') {
            return;
        }
        self.removeEventListener('message', onMessageEstablishChannel);
        for (const desc of await bgInit) {
            ns.exports.set(desc.call, {desc, exec: makeBackgroundExec(desc)});
        }
        const respChannel = new MessageChannel();
        const respPort = respChannel.port1;
        ev.data.requestPort.addEventListener('message', async ev => {
            let data;
            const entry = ns.exports.get(ev.data.desc.call);
            if (!entry) {
                data = ns._wrapError(new Error('Invalid proxy call: ' + ev.data.desc.call));
            } else {
                data = await entry.exec(ev.data);
            }
            data.type = 'sauce-proxy-response';
            respPort.postMessage(data);
        });
        ev.data.requestPort.addEventListener('messageerror', ev => console.error("Message Error:", ev));
        ev.data.requestPort.start();
        ev.data.requestPort.postMessage({
            type: 'sauce-proxy-establish-channel-ack',
            exports: Array.from(ns.exports.values()).map(x => x.desc),
            responsePort: respChannel.port2
        }, [respChannel.port2]);
    }
    self.addEventListener('message', onMessageEstablishChannel);
})();
