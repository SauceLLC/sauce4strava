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
        const tracker = await sauce.ga.getOrCreateTracker(this.tab.id);
        const url = new URL(this.url);
        tracker.set('hostname', url.hostname);
        tracker.set('referrer', meta.referrer);
        tracker.set('location', url.href.split('#')[0]);
        tracker.set('viewportSize', `${this.tab.width}x${this.tab.height}`);
        const method = args.shift();
        tracker[method].apply(tracker, args);
    }, {bg: true});

    addHook('locale', 'getMessage', _getI18nMessage);

    addHook('locale', 'getMessages', batch => batch.map(x => _getI18nMessage(x)));

    addHook('util', 'ping', x => x);

    addHook('util', 'bgping', x => x, {bg: true});

    addHook('storage', 'get', ({args}) => sauce.storage.get.apply(null, args));

    addHook('storage', 'set', ({args}) => sauce.storage.set.apply(null, args));

    addHook('storage', 'update', ({args}) => sauce.storage.update.apply(null, args), {bg: true});

    addHook('options', 'openOptionsPage', () => browser.runtime.openOptionsPage(), {bg: true});

    addHook('trailforks', 'intersections', ({args}) => sauce.trailforks.intersections.apply(null, args), {bg: true});

    addHook('hist', 'selfActivities', ({args}) => sauce.hist.selfActivities.apply(null, args), {bg: true});

    addHook('hist', 'peerActivities', ({args}) => sauce.hist.peerActivities.apply(null, args), {bg: true});

    addHook('hist', 'streams', ({args}) => sauce.hist.streams.apply(null, args), {bg: true});

    addHook('hist', 'findPeerAthletePeaks', ({args}) => sauce.hist.findPeerAthletePeaks.apply(null, args), {bg: true});
    addHook('hist', 'findSelfAthletePeaks', ({args}) => sauce.hist.findSelfAthletePeaks.apply(null, args), {bg: true});
    addHook('hist', 'findActivityPeaks', ({args}) => sauce.hist.findActivityPeaks.apply(null, args), {bg: true});
})();
