/* global browser */

(function() {
    'use strict';

    window.addEventListener('message', async ev => {
        if (ev.source !== window || !ev.data || ev.data.extId !== browser.runtime.id ||
            ev.data.type !== 'sauce-rpc-request') {
            console.error("DROP EVENT", ev, ev.data, browser.runtime.id, ev.source, window);
            return;
        }
        let data;
        try {
            const result = await browser.runtime.sendMessage(ev.data.msg);
            data = {success: true, rid: ev.data.rid, result};
        } catch(e) {
            console.error('RPC Listener:', e);
            data = {success: false, rid: ev.data.rid, result: e.message};
        }
        data.extId = browser.runtime.id;
        data.type = 'sauce-rpc-response';
        ev.source.postMessage(data);
    });

    document.addEventListener('saucerpcrequest', async ev => {
        const req = ev.detail;
        if (!req || req.extId != browser.runtime.id) {
            console.warn("ignore event", ev);
            return;
        }
        const view = document.defaultView;
        let respEv;
        try {
            const data = await browser.runtime.sendMessage(req.msg);
            respEv = new view.CustomEvent('saucerpcresponsesuccess', {detail: {rid: req.rid, data, foo: 'bar'}});
        } catch(e) {
            console.error('RPC Listener:', e);
            respEv = new view.CustomEvent('saucerpcresponseerror', {detail: {rid: req.rid, error: e.message}});
        }
        document.dispatchEvent(respEv);
    });
})();
