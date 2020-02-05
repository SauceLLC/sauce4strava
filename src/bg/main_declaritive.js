/* global chrome, ga */

(function() {
    'use strict';

    self.browser = self.browser || self.chrome;


    function reportLifecycleEvent(action, label) {
        ga('send', 'event', 'ExtensionLifecycle', action, label);
    }


    browser.runtime.onInstalled.addListener(details => {
        browser.declarativeContent.onPageChanged.removeRules(undefined, () => {
            browser.declarativeContent.onPageChanged.addRules([{
                actions: [new browser.declarativeContent.ShowPageAction()],
                conditions: [new browser.declarativeContent.PageStateMatcher({
                    pageUrl: {
                        hostSuffix: '.strava.com',
                        schemes: ['https', 'http']
                    }
                })],
            }]);
        });
        if (details.reason === 'install') {
            reportLifecycleEvent('install');
        }
    });
})();
