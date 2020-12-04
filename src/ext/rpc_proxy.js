/* global sauce, browser */

(function() {
    'use strict';

    self.sauce = self.sauce || {};
    sauce.rpc = sauce.rpc || {};


    async function messageHandler(msg) {
        const hook = sauce.rpc.hooks[msg.system][msg.op];
        if (!hook) {
            throw new Error(`Invalid RPC hook: ${msg.system} ${msg.op}`);
        }
        if (msg.bg || (hook.options && hook.options.bg)) {
            return await browser.runtime.sendMessage(msg);
        } else {
            return await hook.callback(msg.data);
        }
    }


    async function onMessageEstablishChannel(ev) {
        const extId = browser.runtime.id;
        if (ev.source !== self || !ev.data || ev.data.extId !== extId ||
            ev.data.type !== 'sauce-rpc-establish-channel') {
            return;
        }
        window.removeEventListener('message', onMessageEstablishChannel);
        const reqPort = ev.ports[0];
        const respChannel = new MessageChannel();
        const respPort = respChannel.port1;
        reqPort.addEventListener('message', async ev => {
            if (!ev.data || ev.data.extId !== extId) {
                throw new TypeError('RPC Protocol Violation [PAGE]');
            }
            let data;
            try {
                const result = await messageHandler(ev.data.msg);
                data = {success: true, rid: ev.data.rid, result};
            } catch(e) {
                console.error('RPC Hook Error:', e);
                data = {success: false, rid: ev.data.rid, result: e.message};
            }
            data.extId = extId;
            data.type = 'sauce-rpc-response';
            respPort.postMessage(data);
        });
        reqPort.addEventListener('messageerror', ev => console.error("Message Error:", ev));
        reqPort.start();
        reqPort.postMessage({
            type: 'sauce-rpc-establish-channel-ack',
            extId,
        }, [respChannel.port2]);
    }
    window.addEventListener('message', onMessageEstablishChannel);
})();
