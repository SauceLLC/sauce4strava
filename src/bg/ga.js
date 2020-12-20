/* global sauce */

(function() {
    'use strict';

    async function applyWithContext(ctx, method, ...args) {
        const tracker = await sauce.ga.getOrCreateTracker(this.tab.id);
        const url = new URL(this.url);
        tracker.set('hostname', url.hostname);
        if (ctx.referrer) {
            tracker.set('referrer', ctx.referrer);
        }
        tracker.set('location', url.href.split('#')[0]);
        tracker.set('viewportSize', `${this.tab.width}x${this.tab.height}`);
        tracker[method].apply(tracker, args);
    }
    sauce.proxy.export(applyWithContext, {namespace: 'ga'});
})();
