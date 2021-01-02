/* global ga, browser, sauce */

(function() {
    'use strict';


    function reportLifecycleEvent(action, label) {
        ga('send', 'event', 'ExtensionLifecycle', action, label);
    }

    if (browser.runtime.getURL('').startsWith('safari-web-extension:')) {
        // Workaround for visibiltyState = 'prerender' causing GC to pause until unload
        Object.defineProperty(document, 'visibilityState', {value: 'hidden'});
        document.dispatchEvent(new Event('visibilitychange'));
    }

    browser.runtime.onInstalled.addListener(async details => {
        reportLifecycleEvent('installed', details.reason);
        await sauce.migrate.runMigrations();
    });

    const setTimeoutSave = self.setTimeout;
    self.setTimeout = (fn, ms) => {
        const when = Date.now() + ms;
        const r = setTimeoutSave(fn, ms);
        browser.alarms.create(`SetTimeoutBackup-${when}`, {when});
        return r;
    };

    // Required to make site start with alarms API
    browser.alarms.onAlarm.addListener(() => void 0);

    self.currentUser = Number(localStorage.getItem('currentUser')) || undefined;
    browser.runtime.onMessage.addListener(msg => {
        if (msg && msg.source === 'ext/boot') {
            if (msg.op === 'setCurrentUser') {
                const id = msg.currentUser || undefined;
                if (self.currentUser !== id) {
                    self.currentUser = id;
                    localStorage.setItem('currentUser', id);
                    const ev = new Event('currentUserUpdate');
                    ev.id = id;
                    self.dispatchEvent(ev);
                }
            }
        }
    });
})();
