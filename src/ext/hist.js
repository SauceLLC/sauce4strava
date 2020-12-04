/* global */

(function() {
    'use strict';

    self.sauce = self.sauce || {};
    const ns = self.sauce.hist = {};


    //const actCache = new sauce.cache.TTLCache('activities', 365 * 86400 * 1000);

    /*async function fetchStreams(activityId, streamTypes) {
        const streams = new Strava.Labs.Activities.Streams(activityId);
        await new Promise((resolve, reject) => {
            streams.fetchStreams(streamTypes, {
                success: resolve,
                error: (_, ajax) => {
                    let e;
                    if (ajax.status === 429) {
                        e = new ThrottledNetworkError();
                    } else {
                        e = new Error(`Fetch streams failed: ${ajax.status} ${ajax.statusText}`);
                    }
                    reject(e);
                }
            });
        });
        return streamTypes.map(x => streams.getStream(x));
    }*/


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
            const propType = 'html';
            const q = new URLSearchParams();
            q.set('interval_type', 'month');
            q.set('chart_type', 'miles'); // XXX
            q.set('year_offset', '0'); // XXX
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
