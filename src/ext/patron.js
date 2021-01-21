/* global sauce */

(function () {
    "use strict";

    self.sauce = self.sauce || {};
    const ns = self.sauce.patron = {};

    
    async function sha256(input) {
        const encoder = new TextEncoder();
        const data = encoder.encode(input);
        const hash = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hash));
        return hashArray.map(x => x.toString(16).padStart(2, '0')).join('');
    }


    async function fetchLevel(athleteId) {
        const resp = await fetch('https://saucellc.io/patrons.json');
        const fullPatrons = await resp.json();
        const hash = await sha256(athleteId);
        let exp;
        let patronLevel;
        if (fullPatrons[hash]) {
            patronLevel = fullPatrons[hash].level;
            exp = Date.now() + (7 * 86400 * 1000);
        } else {
            patronLevel = 0;
            exp = Date.now() + (3600 * 1000);
        }
        sauce.storage.set({patronLevel});  // bg okay (only for ext pages)
        const encoded = JSON.stringify([exp, patronLevel]);
        try {
            sessionStorage.setItem(`sp-${athleteId}`, encoded);
        } catch(e) {
            console.error("Unable to cache patron level in sessionStorage:", e);
        }
        try {
            localStorage.setItem(`sp-${athleteId}`, encoded);
        } catch(e) {
            console.warn("Unable to cache patron level in localStorage:", e);
        }
        return patronLevel;
    }


    async function updateLevelNames() {
        const resp = await fetch('https://saucellc.io/patron_levels.json');
        const patronLevelNames = await resp.json();
        patronLevelNames.sort((a, b) => b.level - a.level);
        const patronLevelNamesTimestamp = Date.now();
        await sauce.storage.set({patronLevelNames, patronLevelNamesTimestamp});
        return patronLevelNames;
    }


    ns.getLevel = function() {
        const idKey = 'sauce-last-known-user-id';
        const athleteId = Number(sessionStorage.getItem(idKey)) ||
                          Number(localStorage.getItem(idKey)) || undefined;
        if (!athleteId) {
            return 0;
        }
        const cacheEntry = sessionStorage.getItem(`sp-${athleteId}`) ||
                           localStorage.getItem(`sp-${athleteId}`);
        if (cacheEntry) {
            const [exp, level] = JSON.parse(cacheEntry);
            if (exp > Date.now()) {
                // cache hit
                return level;
            }
        }
        return fetchLevel(athleteId);
    };


    ns.getLevelName = async function(level) {
        const ts = await sauce.storage.get('patronLevelNamesTimestamp');
        let levels;
        if (!ts || ts < Date.now() - 7 * 86400 * 1000) {
            levels = await updateLevelNames();
        } else {
            levels = await sauce.storage.get('patronLevelNames');
        }
        for (const x of levels) {
            if (x.level <= level) {
                return x.name;
            }
        }
    };
})();
