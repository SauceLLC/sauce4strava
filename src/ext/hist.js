/* global sauce */

(function() {
    'use strict';

    self.sauce = self.sauce || {};
    const ns = self.sauce.hist = {};


    const othersActCache = new sauce.cache.TTLCache('hist-others-activity-ids', 365 * 86400 * 1000);
    const selfActCache = new sauce.cache.TTLCache('hist-self-activities', 365 * 86400 * 1000);
    const streamsCache = new sauce.cache.TTLCache('hist-streams', 365 * 86400 * 1000);

    let lastStreamFetch = 0;
    ns.streams = async function(activityId, streamTypes) {
        const q = new URLSearchParams();
        const cacheKey = stream => `${activityId}-${stream}`;
        const missing = new Set();
        const results = {};
        for (const x of streamTypes) {
            const cached = await streamsCache.get(cacheKey(x));
            if (cached === undefined) {
                missing.add(x);
            } else {
                results[x] = cached;
            }
        }
        if (!missing.size) {
            return results;
        }
        for (const x of missing) {
            q.append('stream_types[]', x);
        }
        while (Date.now() - lastStreamFetch < 1000) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        lastStreamFetch = Date.now();
        const resp = await fetch(`/activities/${activityId}/streams?${q}`);
        if (!resp.ok) {
            throw new Error(`Fetch streams failed: ${resp.status}`);
        }
        const data = await resp.json();
        for (const [key, value] of Object.entries(data)) {
            results[key] = value;
            missing.delete(key);
            await streamsCache.set(cacheKey(key), value);
        }
        for (const x of missing) {
            await streamsCache.set(cacheKey(x), null);
        }
        return results;
    };


    ns.selfActivities = async function() {
        async function getPage(page) {
            const q = new URLSearchParams();
            q.set('new_activity_only', 'false');
            q.set('page', page);
            const resp = await fetch(`/athlete/training_activities?${q}`, {
                headers: {
                    'x-requested-with': 'XMLHttpRequest'
                }
            });
            return await resp.json();
        }
        const activities = [];
        const seed = await getPage(1);
        for (const x of seed.models) {
            activities.push(x);
        }
        const pages = Math.ceil(seed.total / seed.perPage);
        const work = [];
        for (let p = 2; p <= pages; p++) {
            work.push(getPage(p));
        }
        for (const data of await Promise.all(work)) {
            for (const x of data.models) {
                activities.push(x);
            }
        }
        return activities;
    };


    ns.othersActivityIds = async function(athleteId=56679) {
        async function getPage(year, month) {
            const cacheKey = `${athleteId}-${year}-${month}`;
            const startTS = new Date(`${year}-${month}`).getTime();
            const allowCacheTS = startTS + (45 * 86400 * 1000);
            const cachedEntry = await othersActCache.getEntry(cacheKey);
            if (cachedEntry && cachedEntry.created > allowCacheTS) {
                return cachedEntry.value;
            }
            const propType = 'html';
            const q = new URLSearchParams();
            q.set('interval_type', 'month');
            q.set('chart_type', 'miles');
            q.set('year_offset', '0');
            q.set('interval', '' + year +  month.toString().padStart(2, '0'));
            const resp = await fetch(`/athletes/${athleteId}/interval?${q}`, {
                headers: {"x-requested-with": "XMLHttpRequest"},
            });
            if (!resp.ok) {
                throw new Error('Request Error: ' + resp.status);
            }
            const data = await resp.text();
            const raw = data.match(/jQuery\('#interval-rides'\)\.html\((.*)\)/)[1];
            const norm = self.Function(`"use strict"; return (${raw})`)();
            const frag = document.createElement('div');
            frag[`inner${propType.toUpperCase()}`] = norm;
            const batch = [];
            for (const x of frag.querySelectorAll('.feed-entry[id^="Activity-"]')) {
                const athUrl = x.querySelector('.avatar-content').getAttribute('href');
                const athId = Number(athUrl.match(/\/athletes\/([0-9]*)/)[1]);
                if (athId !== athleteId) {
                    continue;
                }
                const id = x.id.split(/Activity-/)[1];
                if (!id) {
                    throw new Error("Invalid Activity");
                }
                batch.push(Number(id));
            }
            await othersActCache.set(cacheKey, batch);
            return batch;
        }
        const ids = [];
        const now = new Date();
        for (let year = now.getFullYear(), month = now.getMonth() + 1;; year--, month=12) {
            const work = [];
            for (let m = month; m; m--) {
                work.push(getPage(year, m));
            }
            const size = ids.length;
            for (const batch of await Promise.all(work)) {
                for (const x of batch) {
                    ids.push(x);
                }
            }
            if (ids.length === size) {
                // An entire year of no activity.  Ya donezo.
                break;
            }
        }
        return ids;
    };
})();
