/* global ga, browser, sauce */

import * as hist from '/src/bg/hist.mjs';

// For console debugging only.
sauce.ns('hist', () => Object.fromEntries(Object.entries(hist)));

// Required to make site start with alarms API
browser.alarms.onAlarm.addListener(() => void 0);

self.disabled = Boolean(Number(localStorage.getItem('disabled')));
self.currentUser = Number(localStorage.getItem('currentUser')) || undefined;


function reportLifecycleEvent(action, label) {
    ga('send', 'event', 'ExtensionLifecycle', action, label);
}


function setCurrentUser(id) {
    if (id != null) {
        console.info("Current user updated:", id);
        localStorage.setItem('currentUser', id);
    } else {
        console.warn("Current user logged out");
        localStorage.removeItem('currentUser');
    }
    self.currentUser = id;
    const ev = new Event('currentUserUpdate');
    ev.id = id;
    self.dispatchEvent(ev);
}


const setTimeoutSave = self.setTimeout;
self.setTimeout = (fn, ms) => {
    try {
        return setTimeoutSave(fn, ms);
    } finally {
        if (ms > 60000) {
            const when = Math.round(Date.now() + ms);
            browser.alarms.create(`SetTimeoutBackup-${when}`, {when});
        }
    }
};

if (browser.runtime.getURL('').startsWith('safari-web-extension:')) {
    // Workaround for visibiltyState = 'prerender' causing GC to pause until unload
    Object.defineProperty(document, 'visibilityState', {value: 'hidden'});
    document.dispatchEvent(new Event('visibilitychange'));
}

browser.runtime.onInstalled.addListener(async details => {
    reportLifecycleEvent('installed', details.reason);
    await sauce.migrate.runMigrations();
});

browser.runtime.onMessage.addListener(msg => {
    if (msg && msg.source === 'ext/boot') {
        if (msg.op === 'setEnabled') {
            if (self.disabled) {
                console.info("Extension enabled.");
                self.disabled = false;
                localStorage.removeItem('disabled');
                self.dispatchEvent(new Event('enabled'));
            }
        } else if (msg.op === 'setDisabled') {
            if (!self.disabled) {
                console.info("Extension disabled.");
                self.disabled = true;
                localStorage.setItem('disabled', '1');
                self.dispatchEvent(new Event('disabled'));
            }
        } else if (msg.op === 'setCurrentUser') {
            const id = msg.currentUser || undefined;
            if (self.currentUser !== id) {
                setCurrentUser(id);
            }
        }
    }
});


if (browser.declarativeContent) {
    // Chromium...
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
} else {
    // Firefox, Safari, etc...
    const showing = new Set();
    browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        const url = new URL(tab.url);
        if (url.origin.match(/^https:\/\/www\.strava\.com$/i)) {
            browser.pageAction.show(tabId);
            showing.add(tabId);
        } else if (showing.has(tabId)) {
            browser.pageAction.hide(tabId);
            showing.delete(tabId);
        }
    });
}

if (!self.disabled && self.currentUser) {
    hist.startSyncManager();
}
