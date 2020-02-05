/* global ga, browser, sauce */

(function() {
    'use strict';


    function reportLifecycleEvent(action, label) {
        ga('send', 'event', 'ExtensionLifecycle', action, label);
    }


    browser.runtime.onInstalled.addListener(async details => {
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
        reportLifecycleEvent('installed', details.reason);
        await sauce.migrate.runMigrations();
    });
})();
