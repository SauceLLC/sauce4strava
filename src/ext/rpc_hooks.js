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
    }, {backgroundOnly: true});
    addHook('locale', 'getMessage', _getI18nMessage);
    addHook('locale', 'getMessages', batch => batch.map(x => _getI18nMessage(x)));
    addHook('util', 'ping', x => x);
    addHook('util', 'bgping', x => x, {backgroundOnly: true});
    addHook('storage', 'update', (() => {
        let _activeUpdate;
        return async ({keyPath, updates}) => {
            // keyPath can be dot.notation.
            const priorUpdate = _activeUpdate;
            const ourUpdate = (async () => {
                if (priorUpdate) {
                    await priorUpdate;
                }
                const keys = keyPath.split('.');
                const rootKey = keys.shift();
                const rootRef = await sauce.storage.get(rootKey) || {};
                let ref = rootRef;
                for (const key of keys) {
                    if (ref[key] == null) {
                        ref[key] = {};
                    }
                    ref = ref[key];
                }
                Object.assign(ref, updates);
                await sauce.storage.set({[rootKey]: rootRef});
                return ref;
            })();
            _activeUpdate = ourUpdate;
            try {
                return await ourUpdate;
            } finally {
                if (ourUpdate === _activeUpdate) {
                    _activeUpdate = null;
                }
            }
        };
    })(), {backgroundOnly: true});
})();
