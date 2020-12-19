/* global sauce */

(function() {
    'use strict';

    async function ga({args, meta}) {
        const tracker = await sauce.ga.getOrCreateTracker(this.tab.id);
        const url = new URL(this.url);
        tracker.set('hostname', url.hostname);
        tracker.set('referrer', meta.referrer);
        tracker.set('location', url.href.split('#')[0]);
        tracker.set('viewportSize', `${this.tab.width}x${this.tab.height}`);
        const method = args.shift();
        tracker[method].apply(tracker, args);
    }
    sauce.proxy.export(ga);
})();
