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
        localStorage.setItem(`sp-${athleteId}`, JSON.stringify([exp, patronLevel]));
        return patronLevel;
    }


    async function fetchLevelNames() {
        const resp = await fetch('https://saucellc.io/patron_levels.json');
        const patronLevelNames = await resp.json();
        patronLevelNames.sort((a, b) => b.level - a.level);
        sauce.storage.set({patronLevelNames});  // bg okay (only for ext pages)
        const exp = Date.now() + (1 * 86400 * 1000);
        localStorage.setItem(`sp-level-names`, JSON.stringify([exp, patronLevelNames]));
        return patronLevelNames;
    }


    ns.getLevel = function() {
        const athleteId = Number(localStorage.getItem('ajs_user_id'));
        if (!athleteId) {
            return 0;
        }
        const cacheEntry = localStorage.getItem(`sp-${athleteId}`);
        if (cacheEntry) {
            const [exp, level] = JSON.parse(cacheEntry);
            if (exp > Date.now()) {
                // cache hit
                return level;
            }
        }
        return fetchLevel(athleteId);
    };


    ns.getLevelName = function(level) {
        const cacheEntry = localStorage.getItem(`sp-level-names`);
        let exp, levels;
        if (cacheEntry) {
            [exp, levels] = JSON.parse(cacheEntry);
            if (exp <= Date.now()) {
                // expired
                level = null;
            }
        }
        function _getName(levels) {
            for (const x of levels) {
                if (x.level <= level) {
                    return x.name;
                }
            }
        }
        if (levels) {
            return _getName(levels);
        } else {
            return fetchLevelNames().then(_getName);
        }
    };
})();
