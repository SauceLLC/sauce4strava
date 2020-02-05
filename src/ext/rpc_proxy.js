/* global sauce, browser */

(function() {
    'use strict';

    self.sauce = self.sauce || {};
    sauce.rpc = sauce.rpc || {};


    async function messageHandler(msg) {
        const hook = sauce.rpc.hooks[msg.system][msg.op];
        if (hook.options && hook.options.backgroundOnly) {
            return await browser.runtime.sendMessage(msg);
        } else {
            return await hook.callback(msg.data);
        }
    }


    async function onMessageEstablishChannel(ev) {
        if (ev.source !== self || !ev.data || ev.data.extId !== browser.runtime.id ||
            ev.data.type !== 'sauce-rpc-establish-channel') {
            console.error("Skipping EVENT", ev);
            return;
        }
        window.removeEventListener('message', onMessageEstablishChannel);
        const reqPort = ev.ports[0];
        const respChannel = new MessageChannel();
        const respPort = respChannel.port1;
        reqPort.addEventListener('message', async ev => {
            if (!ev.data || ev.data.extId !== browser.runtime.id) {
                throw new TypeError('RPC PROTOCOL VIOLATION FROM PAGE!');
            }
            let data;
            try {
                const result = await messageHandler(ev.data.msg);
                data = {success: true, rid: ev.data.rid, result};
            } catch(e) {
                console.error('RPC Listener:', e);
                data = {success: false, rid: ev.data.rid, result: e.message};
            }
            data.extId = browser.runtime.id; // redundant XXX
            data.type = 'sauce-rpc-response'; // redundant XXX
            respPort.postMessage(data);
        });
        reqPort.addEventListener('messageerror', ev => console.error("Message Error:", ev));
        reqPort.start();
        reqPort.postMessage({
            type: 'sauce-rpc-establish-channel-ack',
            extId: browser.runtime.id,
        }, [respChannel.port2]);
    }
    window.addEventListener('message', onMessageEstablishChannel);
})();
