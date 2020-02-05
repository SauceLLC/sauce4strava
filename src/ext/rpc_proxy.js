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


    window.addEventListener('message', async ev => {
        if (ev.source !== window || !ev.data || ev.data.extId !== browser.runtime.id ||
            ev.data.type !== 'sauce-rpc-request') {
            //console.error("DROP EVENT", ev, ev.data, browser.runtime.id, ev.source, window);
            return;
        }
        let data;
        try {
            const result = await messageHandler(ev.data.msg);
            data = {success: true, rid: ev.data.rid, result};
        } catch(e) {
            console.error('RPC Listener:', e);
            data = {success: false, rid: ev.data.rid, result: e.message};
        }
        data.extId = browser.runtime.id;
        data.type = 'sauce-rpc-response';
        ev.source.postMessage(data);
    });
})();
