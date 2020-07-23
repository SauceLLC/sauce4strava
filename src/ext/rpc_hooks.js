/* global sauce, browser */

(function() {
    'use strict';

    self.sauce = self.sauce || {};
    sauce.rpc = sauce.rpc || {};
    sauce.rpc.hooks = {};


    function addHook(system, op, callback, options) {
        const sysTable = sauce.rpc.hooks[system] || (sauce.rpc.hooks[system] = {});
        sysTable[op] = {
            callback,
            options,
        };
    }


    function _getI18nMessage(args) {
        try {
            return browser.i18n.getMessage.apply(null, args);
        } catch(e) {
            console.warn(`Failed to get i18n message for: ${args[0]}: ${e.message}`);
        }
    }


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
    }, {backgroundOnly: true});
    addHook('locale', 'getMessage', _getI18nMessage);
    addHook('locale', 'getMessages', batch => batch.map(x => _getI18nMessage(x)));
    addHook('util', 'ping', x => x);
    addHook('util', 'bgping', x => x, {backgroundOnly: true});
    addHook('storage', 'get', ({args}) => sauce.storage.get.apply(null, args));
    addHook('storage', 'set', ({args}) => sauce.storage.set.apply(null, args));
    addHook('storage', 'update', ({args}) => sauce.storage.update.apply(null, args),
        {backgroundOnly: true});
    addHook('options', 'openOptionsPage', () => browser.runtime.openOptionsPage(),
        {backgroundOnly: true});
})();
