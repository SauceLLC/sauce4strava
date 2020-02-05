/* global sauce */

(function() {
    'use strict';

    const hooks = {};

    self.browser = self.browser || self.chrome;

    function addHook(system, op, callback) {
        const sysTable = hooks[system] || (hooks[system] = {});
        sysTable[op] = callback;
    }


    function _getI18nMessage(args) {
        try {
            return browser.i18n.getMessage.apply(null, args);
        } catch(e) {
            console.warn(`Failed to get i18n message for: ${args[0]}: ${e.message}`);
        }
    }


    addHook('storage', 'set', sauce.storage.set);
    addHook('storage', 'get', sauce.storage.get);
    addHook('ga', 'apply', async function({args, meta}) {
        const tabId = (this && this.tab && this.tab.id) || 0;
        let tracker = await sauce.ga.getTracker(tabId);
        const url = new URL(this.url);
        if (!tracker) {
            tracker = await sauce.ga.createTracker(tabId);
            tracker.set('hostname', url.hostname);
        }
        tracker.set('referrer', meta.referrer);
        tracker.set('location', url.href.split('#')[0]);
        const width = tabId ? this.tab.width : window.outerWidth;
        const height = tabId ? this.tab.height : window.outerHeight;
        tracker.set('viewportSize', `${width}x${height}`);
        const method = args.shift();
        tracker[method].apply(tracker, args);
    });
    addHook('app', 'getDetails', () => browser.app.getDetails());
    addHook('locale', 'getMessage', _getI18nMessage);
    addHook('locale', 'getMessages', batch => batch.map(x => _getI18nMessage(x)));


    async function onMessage(msg, sender, setResponse) {
        try {
            const hook = hooks[msg.system][msg.op];
            const data = await hook.call(sender, msg.data);
            setResponse({success: true, data});
        } catch(e) {
            console.error('RPC Listener:', e);
            setResponse({
                success: false,
                error: e.message
            });
        }
    }

    if (browser.runtime.onMessageExternal) {
        browser.runtime.onMessageExternal.addListener(onMessage);
    } else {
        document.addEventListener('saucerpcrequest', async ev => {
            const req = ev.detail;
            if (!req || req.extId != browser.runtime.id) {
                console.warn("ignore event", ev);
                return;
            }
            const msg = req.msg;
            let detail;
            try {
                const hook = hooks[msg.system][msg.op];
                detail = {success: true, data: await hook.call(browser.tabs.getCurrent(), msg.data)};
            } catch(e) {
                console.error('RPC Listener:', e);
                detail = {success: false, error: e.message};
            }
            document.dispatchEvent(new CustomEvent('saucerpcresponse', {detail}));
        });
    }
})();
