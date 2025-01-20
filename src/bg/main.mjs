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
import "./hist/db.js";

import * as patron from './patron.mjs';
import * as hist from './hist.mjs';

patron.initProxyExports();

sauce.ns('hist', () => Object.fromEntries(Object.entries(hist))); // For console debugging only.

let _starting = undefined;
self.currentUser = null;


async function start() {
    await setStoragePersistent();
    // Sadly 'onInstalled' callbacks are not reliable on Safari so we need
    // to try migrations every startup.
    await sauce.migrate.runMigrations();
    sauce.storage.addListener((key, value) => {
        if (key === 'options') {
            sauce.options = value;
        }
    });
    const config = await sauce.storage.get(null);
    sauce.options = config.options;
    self.currentUser = config.currentUser || null;
    await hist.startSyncManager(self.currentUser);
    sauce.proxy.startBackgroundHandler();
}


async function setStoragePersistent() {
    // This only works in some cases and may have no effect with unlimitedStorage
    // but it's evolving on all the browers and it's a good thing to ask for.
    if (navigator.storage && navigator.storage.persisted) {
        const isPersisted = await navigator.storage.persisted();
        if (!isPersisted && navigator.storage.persist) {
            await navigator.storage.persist();
        }
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


sauce.downloadBlob = async function(blob, {name}={}) {
    const id = crypto.randomUUID();
    if (!name) {
        name = blob.name || 'generated-by-sauce';
    }
    const transferCache = new sauce.cache.TTLCache('transfer-cache', 900 * 1000);
    await transferCache.set(id, {blob, name});
    const q = new URLSearchParams({id});
    await browser.tabs.create({url: `/pages/download.html?${q}`});
};


// Required for alarms API to actually wake us up.
// Actual work commences without instigation.
browser.alarms.onAlarm.addListener(() => undefined);

browser.runtime.onInstalled.addListener(async details => {
    if (['install', 'update'].includes(details.reason) && !details.temporary) {
        const version = browser.runtime.getManifest().version;
        if (details.previousVersion && version !== details.previousVersion) {
            const msg = `Sauce updated: ${details.previousVersion} -> ${version}`;
            console.warn(msg);
            await sauce.storage.set('recentUpdate', {previousVersion: details.previousVersion, version});
            const athletes = await hist.getEnabledAthletes();
            for (const x of athletes) {
                hist.syncLogsStore.write('warn', x.id, msg);
            }
        }
    }
});

browser.runtime.onMessage.addListener(async msg => {
    if (msg && msg.source === 'ext/boot') {
        if (msg.op === 'setCurrentUser') {
            await _starting;
            const id = msg.currentUser || null;
            if (id !== self.currentUser) {
                self.currentUser = id;
                await hist.restartSyncManager(id);
            }
        }
    }
});

_starting = start();
