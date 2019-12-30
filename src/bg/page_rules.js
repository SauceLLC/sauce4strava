/* global chrome, ga */

(function() {
    'use strict';

    function reportLifecycleEvent(action, label) {
        ga('send', 'event', 'ExtensionLifecycle', action, label);
    }


    chrome.runtime.onInstalled.addListener(details => {
        chrome.declarativeContent.onPageChanged.removeRules(undefined, function() {
            chrome.declarativeContent.onPageChanged.addRules([{
                conditions: [
                    new chrome.declarativeContent.PageStateMatcher({
                        pageUrl: {
                            hostSuffix: '.strava.com',
                            schemes: ['https', 'http']
                        }
                    })
                ],
                actions: [new chrome.declarativeContent.ShowPageAction()]
            }]);
        });
        if (details.reason === 'install') {
            reportLifecycleEvent('install');
        }
    });

    chrome.runtime.onSuspend.addListener(() => {
        reportLifecycleEvent('suspend');
    });

    chrome.runtime.onStartup.addListener(() => {
        reportLifecycleEvent('startup');
    });
})();
