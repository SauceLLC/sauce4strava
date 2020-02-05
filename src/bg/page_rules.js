/* global chrome, ga */

(function() {
    'use strict';

    self.browser = self.browser || self.chrome;

    const showing = new Set();

    function reportLifecycleEvent(action, label) {
        ga('send', 'event', 'ExtensionLifecycle', action, label);
    }

    browser.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
        const url = new URL(tab.url);
        if (url.origin.match(/^https?:\/\/.*?\.strava\.com$/i)) {
            if (!showing.has(tabId)) {
                browser.pageAction.show(tabId);
                showing.add(tabId);
            }
        } else if (showing.has(tabId)) {
            browser.pageAction.hide(tabId);
            showing.delete(tabId);
        }
    });
    browser.runtime.onInstalled.addListener(details => {
        if (details.reason === 'install') {
            reportLifecycleEvent('install');
        }
    });
})();
