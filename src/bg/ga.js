/* global sauce */

sauce.ns('ga', ns => {
    'use strict';

    async function applyWithContext(ctx, method, ...args) {
        const id = (this && this.tab && this.tab.id) || 't1';
        const tracker = await sauce.ga.getOrCreateTracker(id);
        if (this && this.url) {
            const url = new URL(this.url);
            tracker.set('hostname', url.hostname);
            tracker.set('location', url.href.split('#')[0]);
        } else {
            tracker.set('hostname', 'www.strava.com');
            tracker.set('location', 'https://www.strava.com/');
        }
        if (this && this.tab) {
            tracker.set('viewportSize', `${this.tab.width}x${this.tab.height}`);
        }
        if (ctx.referrer) {
            tracker.set('referrer', ctx.referrer);
        }
        tracker[method].apply(tracker, args);
    }
    sauce.proxy.export(applyWithContext, {namespace: 'ga'});

    return {
        applyWithContext
    };
});
