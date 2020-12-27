/* global ga, browser, sauce */

(function() {
    'use strict';


    function reportLifecycleEvent(action, label) {
        ga('send', 'event', 'ExtensionLifecycle', action, label);
    }


    browser.runtime.onInstalled.addListener(async details => {
        reportLifecycleEvent('installed', details.reason);
        await sauce.migrate.runMigrations();
    });

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

    function ping(arg) {
        return arg;
    }
    sauce.proxy.export(ping);
})();
