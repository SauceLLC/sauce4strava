/* global browser */

(function() {
    'use strict';

    browser.runtime.onInstalled.addListener(async details => {
        browser.declarativeContent.onPageChanged.removeRules(undefined, () => {
            browser.declarativeContent.onPageChanged.addRules([{
                actions: [new browser.declarativeContent.ShowPageAction()],
                conditions: [new browser.declarativeContent.PageStateMatcher({
                    pageUrl: {
                        hostSuffix: 'www.strava.com',
                        schemes: ['https']
                    }
                })],
            }]);
        });
    });
})();
