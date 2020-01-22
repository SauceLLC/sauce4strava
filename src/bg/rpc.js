/* global chrome, sauce */

(function() {
    'use strict';

    const hooks = {};

    function addHook(system, op, callback) {
        const sysTable = hooks[system] || (hooks[system] = {});
        sysTable[op] = callback;
    }

    addHook('storage', 'set', sauce.storage.set);
    addHook('storage', 'get', sauce.storage.get);
    addHook('ga', 'apply', async function({args, meta}) {
        let tracker = await sauce.ga.getTracker(this.tab.id);
        const url = new URL(this.url);
        if (!tracker) {
            tracker = await sauce.ga.createTracker(this.tab.id);
            tracker.set('hostname', url.hostname);
        }
        tracker.set('referrer', meta.referrer);
        tracker.set('location', url.href.split('#')[0]);
        tracker.set('viewportSize', `${this.tab.width}x${this.tab.height}`);
        const method = args.shift();
        tracker[method].apply(tracker, args);
    });
    addHook('app', 'getDetails', () => chrome.app.getDetails());
    addHook('locale', 'getMessage', args => chrome.i18n.getMessage.apply(null, args));
    addHook('locale', 'getMessages', batch => batch.map(args =>
        chrome.i18n.getMessage.apply(null, args)));


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

    chrome.runtime.onMessageExternal.addListener(onMessage);
    chrome.runtime.onMessage.addListener(onMessage);
})();
