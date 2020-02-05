/* global ga, browser, sauce */

(function() {
    'use strict';


    function reportLifecycleEvent(action, label) {
        ga('send', 'event', 'ExtensionLifecycle', action, label);
    }


    const showing = new Set();

    browser.runtime.onInstalled.addListener(async details => {
        reportLifecycleEvent('installed', details.reason);
        await sauce.migrate.runMigrations();
    });
    browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        const url = new URL(tab.url);
        if (url.origin.match(/^https?:\/\/.*?\.strava\.com$/i)) {
            browser.pageAction.show(tabId);
            showing.add(tabId);
        } else if (showing.has(tabId)) {
            browser.pageAction.hide(tabId);
            showing.delete(tabId);
        }
    });
})();
