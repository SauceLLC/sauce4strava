/* global ga, browser, sauce */

(function() {
    'use strict';

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


    async function fetchCurrentUser() {
        // A last resort technique for learning the current user.
        const resp = await fetch("https://www.strava.com/settings/profile");
        if (resp.ok) {
            const html = await resp.text();
            const idMatch = html.match(/athlete_id: ([0-9]+),/);
            if (idMatch) {
                const id = Number(idMatch[1]);
                if (!isNaN(id)) {
                    return id;
                }
            }
        }
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

    if (self.currentUser == null) {
        (async function() {
            console.info('Using profile page hack to learn current user...');
            let id;
            try {
                id = await fetchCurrentUser();
            } catch(e) {
                console.warn('Failed to learn current user:', e);
                return;
            }
            if (id == null) {
                console.warn('User ID not found: Possibly logged out');
            } else {
                setCurrentUser(id);
                // Since we are the first to learn of this, put it in storage so the UI
                // can pick it up immediately without having to visit an analysis page.
                await sauce.storage.set('currentUser', id);
            }
        })();
    }
})();
