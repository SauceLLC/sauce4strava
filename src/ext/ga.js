/* global ga, browser */

(async function () {
    "use strict";

    self.sauce = self.sauce || {};
    const ns = self.sauce.ga = {};

    (function(i, s, o, g, r, a, m) {
        i['GoogleAnalyticsObject'] = r;
        i[r] = i[r] || function() {
            (i[r].q = i[r].q || []).push(arguments);
        }, i[r].l = 1 * new Date();
        a = s.createElement(o), m = s.getElementsByTagName(o)[0];
        a.async = 1;
        a.src = g;
        m.parentNode.insertBefore(a, m);
    })(self, document, 'script', 'https://www.google-analytics.com/analytics.js', 'ga');

    ns.getTracker = async function(name) {
        await new Promise(resolve => ga(resolve)); // Wait for ga to be fully loaded.
        return ga.getByName(name || 't0');  // t0 is the default.
    };

    ns.createTracker = async function(name) {
        const gaClientIdKey = 'ga:clientId';
        ga('create', 'UA-64711223-1', {
            name,
            storage: 'none',  // cookies dont work in firefox bg page
            clientId: localStorage.getItem(gaClientIdKey)
        });
        const tracker = await ns.getTracker(name);
        if (navigator.sendBeacon) {
            tracker.set('transport', 'beacon');
        }
        tracker.set('checkProtocolTask', () => undefined);  // needed when used in an ext.
        localStorage.setItem(gaClientIdKey, tracker.get('clientId'));
        return tracker;
    };

    if (await browser.runtime.getBackgroundPage() !== self) {
        const t = await ns.createTracker();
        t.send('pageview', location.pathname);
    }
})();
