/* global sauce, browser */

(function() {
    'use strict';


    const isPopup = (new URLSearchParams(window.location.search)).get('popup') !== null;
    if (isPopup) {
        document.documentElement.classList.add('popup');
    }

    function estimateStorageSize(count) {
        return count * 750;
    }


    class DummyDatabase extends sauce.db.Database {
        get migrations() {
            return [{
                version: 1,
                migrate: (idb, t, next) => {
                    idb.createObjectStore("dummy", {autoIncrement: true});
                    next();
                }
            }];
        }
    }

    class DummyStore extends sauce.db.DBStore {
        constructor() {
            super(new DummyDatabase('SauceWebkitQuotaHack'), 'dummy');
        }
    }


    async function startAlloc(size) {
        size *= 1024 * 1024;
        const store = new DummyStore();
        addEventListener('unload', () => {
            console.warn("UNLOAD A BITCH");
            indexedDB.deleteDatabase(store.db.name);
        });
        try {
            const buf = new ArrayBuffer(Math.min(128 * 1024 * 1024, size));
            for (let s = 0; s < size; s += buf.byteLength) {
                console.warn("writing: ", buf.byteLength, s);
                await store.put({buf});
            }
        } finally {
            console.warn("DONE");
            indexedDB.deleteDatabase(store.db.name);
        }
    }


    async function main() {
        document.querySelector('a.dismiss').addEventListener('click', () => {
            browser.tabs.update({active: true});  // required to allow self.close()
            self.close();
        });
        const estEl = document.querySelector('form.alloc-settings .est-space .usage');
        const countEl = document.querySelector('form.alloc-settings input[name="athlete-count"]');
        estEl.textContent = estimateStorageSize(Number(countEl.value)).toLocaleString();
        countEl.addEventListener('input', ev => {
            estEl.textContent = estimateStorageSize(Number(countEl.value)).toLocaleString();
        });
        const startEl = document.querySelector('form.alloc-settings input[name="start"]');
        startEl.addEventListener('click', ev => {
            ev.preventDefault();
            countEl.disabled = (startEl.disabled = true);
            document.documentElement.classList.add('active');
            startAlloc(estimateStorageSize(Number(countEl.value)));
        });
        (await sauce.ga.getOrCreateTracker()).send('pageview');
    }

    document.addEventListener('DOMContentLoaded', main);
})();
