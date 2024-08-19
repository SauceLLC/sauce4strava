/* global browser, sauce */

import "../ext/webext.js";
import "../common/base.js";
import "../common/base_init.js";
import "../common/proxy.js";
import "./proxy.js";
import "../common/lib.js";
import "../common/storage.js";
import "./migrate.js";
import "./menu.js";
import "./trailforks.js";
import "./hist/db.js";

import * as patron from './patron.mjs';
import * as hist from './hist.mjs';

patron.initProxyExports();

sauce.ns('hist', () => Object.fromEntries(Object.entries(hist))); // For console debugging only.

// Sadly 'onInstalled' callbacks are not reliable on Safari so we need
// to try migrations every startup.
const migrationsRun = sauce.migrate.runMigrations();
// XXX migrate to browser.storage.local (will need async refactor (if even possible)
//self.currentUser = Number(localStorage.getItem('currentUser')) || undefined;


function setCurrentUser(id) {
    if (id != null) {
        console.info("Current user updated:", id);
// XXX migrate to browser.storage.local (will need async refactor (if even possible)
//        localStorage.setItem('currentUser', id);
    } else {
        console.warn("Current user logged out");
// XXX migrate to browser.storage.local (will need async refactor (if even possible)
//        localStorage.removeItem('currentUser');
    }
    self.currentUser = id;
    const ev = new Event('currentUserUpdate');
    ev.id = id;
    self.dispatchEvent(ev);
}


async function maybeStartSyncManager() {
    await migrationsRun;
    if (self.currentUser && !hist.hasSyncManager()) {
        hist.startSyncManager(self.currentUser);
    }
}


// Make a suspend safe timeout.  Internally the clock for a site does not increment
// during OS power save modes.  Timeouts spanning such a suspend event will eventually
// run but without consideration for wall clock changes (i.e. they are late).
const _timeoutsQ = [];
const _timeoutsH = {};
let wakeLoopId;

function wakeLoop() {
    const now = Date.now();
    let i = _timeoutsQ.length;
    while (i && _timeoutsQ[i - 1].ts < now) {
        const entry = _timeoutsQ[--i];
        if (!entry.complete && !entry.cleared) {
            clearTimeout(entry.id);
            setTimeout(entry.callback, 0, ...entry.args);
        }
        delete _timeoutsH[entry.id];
    }
    _timeoutsQ.length = i;
    if (!i) {
        clearInterval(wakeLoopId);
        wakeLoopId = null;
    }
}


sauce.suspendSafeSetTimeout = function(callback, ms, ...args) {
    const entry = {ts: Date.now() + ms, callback, args};
    entry.id = setTimeout(() => {
        entry.complete = true;
        callback(...args);
    }, ms);
    _timeoutsQ.push(entry);
    _timeoutsQ.sort((a, b) => b.ts - a.ts);
    _timeoutsH[entry.id] = entry;
    if (wakeLoopId == null && (_timeoutsQ.length > 100 || ms > 1000)) {
        wakeLoopId = setInterval(wakeLoop, 1000);
    }
    return entry.id;
};


sauce.suspendSafeClearTimeout = function(id) {
    const entry = _timeoutsH[id];
    if (entry) {
        entry.cleared = true;
    }
    clearTimeout(id);
};


sauce.setWakeupAlarm = function(ms) {
    // This will reload the entire page if we were unloaded.
    const when = Math.round(Date.now() + ms);
    browser.alarms.create(`SetTimeoutBackup-${when}`, {when});
};


sauce.suspendSafeSleep = function(ms) {
    return new Promise(resolve => sauce.suspendSafeSetTimeout(resolve, ms));
};


if (browser.runtime.getURL('').startsWith('safari-web-extension:')) {
    // Workaround for visibiltyState = 'prerender' causing GA to pause until unload
    Object.defineProperty(document, 'visibilityState', {value: 'hidden'});
    document.dispatchEvent(new Event('visibilitychange'));
}

// Required to make site start with alarms API
browser.alarms.onAlarm.addListener(() =>
    void maybeStartSyncManager().catch(console.error)); // pur pot hack. :/

browser.runtime.onInstalled.addListener(async details => {
    if (['install', 'update'].includes(details.reason) && !details.temporary) {
        const version = browser.runtime.getManifest().version;
        if (details.previousVersion && version !== details.previousVersion) {
            await sauce.storage.set('recentUpdate', {previousVersion: details.previousVersion, version});
        }
    }
});

browser.runtime.onMessage.addListener(msg => {
    if (msg && msg.source === 'ext/boot') {
        if (msg.op === 'setCurrentUser') {
            const id = msg.currentUser || undefined;
            if (self.currentUser !== id) {
                setCurrentUser(id);
            }
        }
    }
});

if (browser.declarativeContent) {
    // Chromium...
    browser.runtime.onInstalled.addListener(details => {
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

maybeStartSyncManager();
