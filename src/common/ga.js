/* global sauce, browser, ga */

sauce.ns('ga', ns => {
    "use strict";

    (function(i, s, o, g, r, a, m) {
        i['GoogleAnalyticsObject'] = r;
        i[r] = i[r] || function() {
            (i[r].q = i[r].q || []).push(arguments);
        }, i[r].l = 1 * new Date();
        a = s.createElement(o), m = s.getElementsByTagName(o)[0];
        a.async = 1;
        a.src = g;
        if (m) {
            m.parentNode.insertBefore(a, m);
        } else {
            s.documentElement.appendChild(a);
        }
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
        try {
            localStorage.setItem(gaClientIdKey, tracker.get('clientId'));
        } catch(e) {/*no-pragma*/}
        if (await browser.runtime.getBackgroundPage() !== self) {
            // An ext option page tracker.  Must override page to avoid getting filtered at ga.
            tracker.set('page', `/EXTENTION_PAGE${location.pathname}`);
        }
        return tracker;
    };


    let _trackerCreations = new Map();
    ns.getOrCreateTracker = async function(name) {
        if (!_trackerCreations.has(name)) {
            _trackerCreations.set(name, ns.createTracker(name));
        }
        return await _trackerCreations.get(name);
    };
});
