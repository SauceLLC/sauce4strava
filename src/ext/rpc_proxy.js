/* global sauce */

(function() {
    'use strict';

    const hooks = {};

    self.browser = self.browser || self.chrome;

    document.addEventListener('saucerpcrequest', async ev => {
        const req = ev.detail;
        if (!req || req.extId != browser.runtime.id) {
            console.warn("ignore event", ev);
            return;
        }
        const detail = {rid: req.rid};
        try {
            const data = JSON.stringify(await browser.runtime.sendMessage(req.msg));
            Object.assign(detail, {success: true, data});
        } catch(e) {
            console.error('RPC Listener:', e);
            Object.assign(detail, {success: false, error: e.message});
        }
        document.dispatchEvent(new document.defaultView.CustomEvent('saucerpcresponse', {detail}));
    });
})();
