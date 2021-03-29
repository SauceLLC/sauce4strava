/* global sauce, browser */

(function() {
    'use strict';


    const isPopup = (new URLSearchParams(window.location.search)).get('popup') !== null;
    if (isPopup) {
        document.documentElement.classList.add('popup');
    }


    function sleep(seconds) {
        return new Promise(resolve => setTimeout(resolve, seconds * 1000));
    }


    function onEventDelegate(rootElement, evName, selector, callback) {
        // redneck event delegation..
        rootElement.addEventListener(evName, ev => {
            if (ev.target && ev.target.closest) {
                const delegateTarget = ev.target.closest(selector);
                if (delegateTarget) {
                    ev.delegateTarget = delegateTarget;
                    return callback(ev);
                }
            }
        });
    }


    async function reportEvent(eventCategory, eventAction, eventLabel) {
        const t = await sauce.ga.getOrCreateTracker();
        return t.send('event', {eventCategory, eventAction, eventLabel});
    }


    async function main() {
        document.querySelector('a.dismiss').addEventListener('click', () => {
            browser.tabs.update({active: true});  // required to allow self.close()
            self.close();
        });
        (await sauce.ga.getOrCreateTracker()).send('pageview');
    }

    document.addEventListener('DOMContentLoaded', main);
})();
