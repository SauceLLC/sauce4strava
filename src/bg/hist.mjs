/* global sauce */

import * as jobs from '/src/common/jscoop/jobs.js';
import * as queues from '/src/common/jscoop/queues.js';
import * as locks from '/src/common/jscoop/locks.js';
import * as processors from '/src/bg/hist/processors.mjs';
const {
    ActivitiesStore,
    StreamsStore,
    AthletesStore,
    PeaksStore,
    ActivityModel
} = sauce.hist.db;


const activityListVersion = 2;  // Increment to force full update of activities.
const namespace = 'hist';
const DBTrue = 1;
const DBFalse = 0;
let syncManager;


export const actsStore = new ActivitiesStore();
export const streamsStore = new StreamsStore();
export const athletesStore = new AthletesStore();
export const peaksStore = new PeaksStore();


function issubclass(A, B) {
    return A && B && (A.prototype instanceof B || A === B);
}


ActivityModel.addSyncManifest({
    processor: 'streams',
    name: 'fetch',
    version: 1,
    errorBackoff: 8 * 3600 * 1000,
    data: new Set([
        'time',
        'heartrate',
        'altitude',
        'distance',
        'moving',
        'velocity_smooth',
        'cadence',
        'latlng',
        'watts',
        'watts_calc',
        'grade_adjusted_distance',
        'temp',
    ])
});

ActivityModel.addSyncManifest({
    processor: 'local',
    name: 'athlete-settings',
    version: 2,
    data: {processor: processors.AthleteSettingsProcessor}
});

ActivityModel.addSyncManifest({
    processor: 'local',
    name: 'extra-streams',
    version: 1,
    data: {processor: processors.extraStreamsProcessor}
});

ActivityModel.addSyncManifest({
    processor: 'local',
    name: 'activity-stats',
    version: 2,
    depends: ['extra-streams', 'athlete-settings'],
    data: {processor: processors.activityStatsProcessor}
});

ActivityModel.addSyncManifest({
    processor: 'local',
    name: 'peaks',
    version: 8, // Use sauce.peaks for ranges.
    depends: ['extra-streams'],
    data: {processor: processors.peaksProcessor}
});

ActivityModel.addSyncManifest({
    processor: 'local',
    name: 'training-load',
    version: 4,
    depends: ['activity-stats'],
    data: {processor: processors.TrainingLoadProcessor}
});


class FetchError extends Error {
    static fromResp(resp) {
        const msg = `${this.name}: ${resp.url} [${resp.status}]`;
        const instance = new this(msg);
        instance.resp = resp;
        return instance;
    }
}


class ThrottledFetchError extends FetchError {}


async function sleep(ms) {
    await new Promise(resolve => setTimeout(resolve, ms));
}


async function retryFetch(urn, options={}) {
    const maxRetries = 5;
    const headers = options.headers || {};
    headers["x-requested-with"] = "XMLHttpRequest";  // Required for most Strava endpoints
    const url = `https://www.strava.com${urn}`;
    for (let r = 1;; r++) {
        const resp = await fetch(url, Object.assign({headers}, options));
        if (resp.ok) {
            return resp;
        }
        if (resp.status >= 500 && resp.status < 600 && r <= maxRetries) {
            console.info(`Server error for: ${resp.url} - Retry: ${r}/${maxRetries}`);
            await sleep(1000 * r);
            continue;
        }
        if (resp.status === 429) {
            throw ThrottledFetchError.fromResp(resp);
        }
        throw FetchError.fromResp(resp);
    }
}


class SauceRateLimiter extends jobs.RateLimiter {
    async getState() {
        const storeKey = `hist-rate-limiter-${this.label}`;
        return await sauce.storage.get(storeKey);
    }

    async setState(state) {
        const storeKey = `hist-rate-limiter-${this.label}`;
        await sauce.storage.set(storeKey, state);
    }
}


// We must stay within API limits;  Roughly 40/min, 300/hour and 1000/day...
let streamRateLimiterGroup;
const getStreamRateLimiterGroup = (function() {
    return function() {
        if (!streamRateLimiterGroup) {
            const g = new jobs.RateLimiterGroup();
            g.push(new SauceRateLimiter('streams-min', {period: (60 + 5) * 1000, limit: 30, spread: true}));
            g.push(new SauceRateLimiter('streams-hour', {period: (3600 + 500) * 1000, limit: 200}));
            g.push(new SauceRateLimiter('streams-day', {period: (86400 + 3600) * 1000, limit: 700}));
            streamRateLimiterGroup = g;
        }
        return streamRateLimiterGroup;
    };
})();


async function incrementStreamsUsage() {
    // Used for pages to indicate they used the streams API.  This helps
    // keep us on top of overall stream usage better to avoid throttling.
    const g = getStreamRateLimiterGroup();
    await g.increment();
}
sauce.proxy.export(incrementStreamsUsage, {namespace});


function getBaseType(activity) {
    if (activity.type.match(/Ride/)) {
        return 'ride';
    } else if (activity.type.match(/Run|Hike|Walk/)) {
        return 'run';
    } else if (activity.type.match(/Swim/)) {
        return 'swim';
    } else {
        return 'workout';
    }
}


async function updateSelfActivities(athlete, options={}) {
    const forceUpdate = options.forceUpdate;
    const filteredKeys = [
        'activity_url',
        'activity_url_for_twitter',
        'distance',
        'elapsed_time',
        'elevation_gain',
        'elevation_unit',
        'moving_time',
        'long_unit',
        'short_unit',
        'start_date',
        'start_day',
        'start_time',
        'static_map',
        'twitter_msg',
    ];
    const knownIds = new Set(forceUpdate ?  [] : await actsStore.getAllKeysForAthlete(athlete.pk));
    for (let concurrency = 1, page = 1, pageCount, total;; concurrency = Math.min(concurrency * 2, 25)) {
        const work = new jobs.UnorderedWorkQueue({maxPending: 25});
        for (let i = 0; page === 1 || page <= pageCount && i < concurrency; page++, i++) {
            await work.put((async () => {
                const q = new URLSearchParams();
                q.set('new_activity_only', 'false');
                q.set('page', page);
                const resp = await retryFetch(`/athlete/training_activities?${q}`);
                return await resp.json();
            })());
        }
        if (!work.pending() && !work.fulfilled()) {
            break;
        }
        const adding = [];
        for await (const data of work) {
            if (total === undefined) {
                total = data.total;
                pageCount = Math.ceil(total / data.perPage);
            }
            for (const x of data.models) {
                if (!knownIds.has(x.id)) {
                    const record = Object.assign({
                        athlete: athlete.pk,
                        ts: (new Date(x.start_time)).getTime()
                    }, x);
                    record.basetype = getBaseType(record);
                    for (const x of filteredKeys) {
                        delete record[x];
                    }
                    adding.push(record);
                    knownIds.add(x.id);
                }
            }
        }
        // Don't give up until we've met or exceeded the indicated number of acts.
        // If a user has deleted acts that we previously fetched our count will
        // be higher.  So we also require than the entire work group had no effect
        // before stopping.
        //
        // NOTE: If the user deletes a large number of items we may end up not
        // syncing some activities.  A full resync will be required to recover.
        if (adding.length) {
            if (forceUpdate) {
                console.info(`Updating ${adding.length} activities`);
                await actsStore.updateMany(new Map(adding.map(x => [x.id, x])));
            } else {
                console.info(`Adding ${adding.length} new activities`);
                await actsStore.putMany(adding);
            }
        } else if (knownIds.size >= total) {
            break;
        }
    }
}


async function updatePeerActivities(athlete, options={}) {
    const forceUpdate = options.forceUpdate;
    const knownIds = new Set(forceUpdate ? [] : await actsStore.getAllKeysForAthlete(athlete.pk));

    function *yearMonthRange(date) {
        for (let year = date.getUTCFullYear(), month = date.getUTCMonth() + 1;; year--, month=12) {
            for (let m = month; m; m--) {
                yield [year, m];
            }
        }
    }

    async function fetchMonth(year, month) {
        // Welcome to hell.  It gets really ugly in here in an effort to avoid
        // any eval usage which is required to render this HTML into a DOM node.
        // So are doing horrible HTML parsing with regexps..
        //
        // Note this code is littered with debugger statements.  All of them are
        // cases I'd like to personally inspect if they happen.
        const q = new URLSearchParams();
        q.set('interval_type', 'month');
        q.set('chart_type', 'hours');
        q.set('year_offset', '0');
        q.set('interval', '' + year +  month.toString().padStart(2, '0'));
        const resp = await retryFetch(`/athletes/${athlete.pk}/interval?${q}`);
        const data = await resp.text();
        const raw = data.match(/jQuery\('#interval-rides'\)\.html\((.*)\)/)[1];
        const batch = [];
        const activityIconMap = {
            'icon-run': 'run',
            'icon-hike': 'run',
            'icon-walk': 'run',
            'icon-ride': 'ride',
            'icon-virtualride': 'ride',
            'icon-swim': 'swim',
            'icon-alpineski': 'ski',
            'icon-nordicski': 'ski',
            'icon-backcountryski': 'ski',
            'icon-snowboard': 'ski',
            'icon-rollerski': 'ski',
            'icon-ebikeride': 'ebike',
            'icon-workout': 'workout',
            'icon-standuppaddling': 'workout',
            'icon-yoga': 'workout',
            'icon-snowshoe': 'workout',
            'icon-kayaking': 'workout',
            'icon-golf': 'workout',
            'icon-weighttraining': 'workout',
            'icon-rowing': 'workout',
            'icon-canoeing': 'workout',
            'icon-elliptical': 'workout',
            'icon-rockclimbing': 'workout',
            'icon-iceskate': 'workout',
            'icon-watersport': 'workout',
        };
        const attrSep = String.raw`(?: |\\"|\\')`;
        function tagWithAttrValue(tag, attrVal, matchVal) {
            return `<${tag} [^>]*?${attrSep}${matchVal ? '(' : ''}${attrVal}${matchVal ? ')' : ''}${attrSep}`;
        }
        const iconRegexps = [];
        for (const key of Object.keys(activityIconMap)) {
            iconRegexps.push(new RegExp(tagWithAttrValue('span', key, true)));
        }
        const feedEntryExp = tagWithAttrValue('div', 'feed-entry');
        const subEntryExp = tagWithAttrValue('li', 'feed-entry');
        const feedEntryRegexp = new RegExp(`(${feedEntryExp}.*?)(?=${feedEntryExp}|$)`, 'g');
        const subEntryRegexp = new RegExp(`(${subEntryExp}.*?)(?=${subEntryExp}|$)`, 'g');
        const activityRegexp = new RegExp(`^[^>]*?${attrSep}activity${attrSep}`);
        const groupActivityRegexp = new RegExp(`^[^>]*?${attrSep}group-activity${attrSep}`);
        const scriptData = {};
        function addEntry(id, ts, basetype) {
            if (!id) {
                sauce.report.error(new Error('Invalid activity id for: ' + athlete.pk));
                debugger;
                return;
            }
            batch.push({
                id,
                ts,
                basetype,
                athlete: athlete.pk,
                name: scriptData[id] && scriptData[id].name,
            });
        }
        function getBaseType(entry) {
            for (const x of iconRegexps) {
                const m = entry.match(x);
                if (m) {
                    return activityIconMap[m[1]];
                }
            }
            sauce.report.error(new Error('Unhandled activity type for: ' + athlete.pk));
            debugger;
            return 'workout'; // XXX later this is probably fine to assume.
        }
        for (const m of raw.matchAll(/<script>(.+?)<\\\/script>/g)) {
            const scriptish = m[1];
            const idMatch = scriptish.match(/entity_id = \\"(.+?)\\";/);
            if (!idMatch) {
                continue;
            }
            const id = Number(idMatch[1]);
            if (!id) {
                sauce.report.error(new Error('Unable to find activity id from script tag for: ' + athlete.pk));
                debugger;
                continue;
            }
            let escapedName = scriptish.match(/ title: \\"(.*?)\\",\\n/)[1];
            if (escapedName == null) {
                sauce.report.error(new Error('Unable to get name from script tag for act: ' + id));
                debugger;
                continue;
            }
            // This is just terrible, but we can't use eval..  Strava does some very particular escaping
            // that mostly has no effect but does break JSON.parse.  Sadly we MUST run JSON.parse to do
            // unicode sequence unescape, ie. "\u1234"
            escapedName = escapedName.replace(/\\'/g, "'");
            escapedName = escapedName.replace(/\\\\"/g, '"');
            escapedName = escapedName.replace(/\\\\(u[0-9]{4})/g, "\\$1");
            escapedName = escapedName.replace(/\\\$/g, "$");
            let name;
            try {
                name = JSON.parse('"' + escapedName + '"');
            } catch(e) {
                sauce.report.error(new Error('Unable to use JSON.parse on name for: ' + id));
                name = escapedName;
            }
            scriptData[id] = {name};
        }
        for (const [, entry] of raw.matchAll(feedEntryRegexp)) {
            let isGroup;
            if (!entry.match(activityRegexp)) {
                if (entry.match(groupActivityRegexp)) {
                    isGroup = true;
                } else {
                    continue;
                }
            }
            let basetype;
            for (const x of iconRegexps) {
                const m = entry.match(x);
                if (m) {
                    basetype = activityIconMap[m[1]];
                    break;
                }
            }
            if (!basetype) {
                sauce.report.error(new Error('Unhandled activity type for: ' + athlete.pk));
                debugger;
                basetype = 'workout'; // XXX later this is probably fine to assume.
            }
            let ts;
            const dateM = entry.match(/<time [^>]*?datetime=\\'(.*?)\\'/);
            if (dateM) {
                const isoDate = dateM[1].replace(/ UTC$/, 'Z').replace(/ /, 'T');
                ts = (new Date(isoDate)).getTime();
            }
            if (!ts) {
                sauce.report.error(new Error('Unable to get timestamp for: ' + athlete.pk));
                debugger;
                continue;
            }
            if (isGroup) {
                for (const [, subEntry] of entry.matchAll(subEntryRegexp)) {
                    const athleteM = subEntry.match(/<a [^>]*?entry-athlete[^>]*? href=\\'\/(?:athletes|pros)\/([0-9]+)\\'/);
                    if (!athleteM) {
                        sauce.report.error(new Error('Unable to get athlete ID from feed for: ' + athlete.pk));
                        debugger;
                        continue;
                    }
                    if (Number(athleteM[1]) !== athlete.pk) {
                        continue;
                    }
                    const idMatch = subEntry.match(/id=\\'Activity-([0-9]+)\\'/);
                    if (!idMatch) {
                        sauce.report.error(new Error('Group parser failed to find activity for: ' + athlete.pk));
                        debugger;
                        continue;
                    }
                    addEntry(Number(idMatch[1]), ts, getBaseType(subEntry));
                }
            } else {
                const idMatch = entry.match(/id=\\'Activity-([0-9]+)\\'/);
                if (!idMatch) {
                    sauce.report.error(new Error('Unable to get activity ID for: ' + athlete.pk));
                    debugger;
                    continue;
                }
                addEntry(Number(idMatch[1]), ts, getBaseType(entry));
            }
        }
        return batch;
    }

    async function batchImport(startDate) {
        const minEmpty = 12;
        const minRedundant = 2;
        const iter = yearMonthRange(startDate);
        for (let concurrency = 1;; concurrency = Math.min(25, concurrency * 2)) {
            const work = new jobs.UnorderedWorkQueue({maxPending: 25});
            for (let i = 0; i < concurrency; i++) {
                const [year, month] = iter.next().value;
                await work.put(fetchMonth(year, month));
            }
            let empty = 0;
            let redundant = 0;
            const adding = [];
            for await (const data of work) {
                if (!data.length) {
                    empty++;
                    continue;
                }
                let foundNew;
                for (const x of data) {
                    if (!knownIds.has(x.id)) {
                        adding.push(x);
                        knownIds.add(x.id);
                        foundNew = true;
                    }
                }
                if (!foundNew) {
                    redundant++;
                }
            }
            if (adding.length) {
                if (forceUpdate) {
                    console.info(`Updating ${adding.length} activities`);
                    await actsStore.updateMany(new Map(adding.map(x => [x.id, x])));
                } else {
                    console.info(`Adding ${adding.length} new activities`);
                    await actsStore.putMany(adding);
                }
            } else if (empty >= minEmpty && empty >= Math.floor(concurrency)) {
                const [year, month] = iter.next().value;
                const date = new Date(`${month === 12 ? year + 1 : year}-${month === 12 ? 1 : month + 1}`);
                await athlete.save({activitySentinel: date.getTime()});
                break;
            } else if (redundant >= minRedundant  && redundant >= Math.floor(concurrency)) {
                // Entire work set was redundant.  Don't refetch any more.
                break;
            }
        }
    }

    // Fetch newest activities (or all of them if this is the first time).
    await batchImport(new Date());
    const sentinel = await athlete.get('activitySentinel');
    if (!sentinel) {
        // We never finished a prior sync so find where we left off..
        const last = await actsStore.getOldestForAthlete(athlete.pk);
        await batchImport(new Date(last.ts));
    }
}


async function expandPeakActivities(peaks) {
    const activities = await actsStore.getMany(peaks.map(x => x.activity));
    for (let i = 0; i < activities.length; i++) {
        peaks[i].activity = activities[i];
    }
    return peaks;
}


async function _aggregatePeaks(work, options={}) {
    const peaks = [].concat(...await Promise.all(work));
    if (options.expandActivities) {
        await expandPeakActivities(peaks);
    }
    return peaks;
}


async function _makePeaksFilterOptions(options={}) {
    const filter = options.filter;
    if (!filter || filter === 'all') {
        return options;
    }
    const ts = options.filterTS || Date.now();
    const d = sauce.date.toLocaleDayDate(ts + 86400 * 1000);
    let start;
    let end;
    if (filter === 'year') {
        start = d.setMonth(0, 1);
        end = d.setMonth(12, 1);
    } else if (filter === 'season') {
        const startMonth = Number(await sauce.storage.get('season_start_month')) || 1;
        const startDay = Number(await sauce.storage.get('season_start_day')) || 1;
        const seasonDate = d.setMonth(startMonth - 1, startDay);
        if (seasonDate >= ts) {
            end = seasonDate;
            start = d.setMonth(startMonth - 13, startDay);
        } else {
            start = seasonDate;
            end = d.setMonth(startMonth + 11, startDay);
        }
    } else if (!isNaN(Number(filter))) {
        end = d.getTime();
        start = d.setDate(-Number(filter) + d.getDate());
    } else {
        throw new TypeError('Invalid Filter');
    }
    return {start, end, excludeUpper: true, ...options};
}


export async function getPeaksForAthlete(athleteId, type, periods, options={}) {
    periods = Array.isArray(periods) ? periods : [periods];
    options = await _makePeaksFilterOptions(options);
    return await _aggregatePeaks(periods.map(x =>
        peaksStore.getForAthlete(athleteId, type, x, options)), options);
}
sauce.proxy.export(getPeaksForAthlete, {namespace});


export async function getPeaksFor(type, periods, options={}) {
    periods = Array.isArray(periods) ? periods : [periods];
    options = await _makePeaksFilterOptions(options);
    return await _aggregatePeaks(periods.map(x =>
        peaksStore.getFor(type, x, options)), options);
}
sauce.proxy.export(getPeaksFor, {namespace});


export async function getPeaksRelatedToActivityId(activityId, ...args) {
    const activity = await actsStore.get(activityId);
    return activity ? await getPeaksRelatedToActivity(activity, ...args) : null;
}
sauce.proxy.export(getPeaksRelatedToActivityId, {namespace});


export async function getPeaksRelatedToActivity(activity, type, periods, options={}) {
    periods = Array.isArray(periods) ? periods : [periods];
    options = await _makePeaksFilterOptions({filterTS: activity.ts, ...options});
    const results = [];
    for (const period of periods) {
        const peaks = await peaksStore.getForAthlete(activity.athlete, type, period,
            {...options, limit: undefined, expandActivities: false});
        if (options.limit) {
            const index = peaks.findIndex(x => x.activity === activity.id);
            if (index < options.limit - 1) {
                peaks.length = Math.min(options.limit, peaks.length);
            } else {
                const mid = options.limit / 2;
                peaks.splice(mid, Math.round(index - (mid * 1.5)));
                peaks.length = options.limit;
            }
        }
        results.push(peaks);
    }
    const aggregated = [].concat(...results);
    if (options.expandActivities) {
        return await expandPeakActivities(aggregated);
    } else {
        return aggregated;
    }
}
sauce.proxy.export(getPeaksRelatedToActivity, {namespace});


async function getSelfFTPHistory() {
    const resp = await fetch("https://www.strava.com/settings/performance");
    const raw = await resp.text();
    const table = [];
    if (raw) {
        const encoded = raw.match(/all_ftps = (\[.*\]);/);
        if (encoded) {
            for (const x of JSON.parse(encoded[1])) {
                table.push({ts: x.start_date * 1000, value: x.value});
            }
        }
    }
    return table;
}
sauce.proxy.export(getSelfFTPHistory, {namespace});


async function addAthlete({id, ...data}) {
    if (!id || !data.name) {
        throw new TypeError('id and name values are required');
    }
    const athlete = await athletesStore.get(id, {model: true});
    if (!data.ftpHistory && (!athlete || !athlete.get('ftpHistory'))) {
        if (id === self.currentUser) {
            data.ftpHistory = await getSelfFTPHistory();
        } else {
            const ftp = (await sauce.storage.getAthleteProp(id, 'ftp_override')) ||
                        (await sauce.storage.getAthleteProp(id, 'ftp_lastknown'));
            if (ftp) {
                data.ftpHistory = [{ts: Date.now(), value: ftp}];
            }
        }
    }
    if (!data.weightHistory && (!athlete || !athlete.get('weightHistory'))) {
        const w = (await sauce.storage.getAthleteProp(id, 'weight_override')) ||
                  (await sauce.storage.getAthleteProp(id, 'weight_lastknown'));
        if (w) {
            data.weightHistory = [{ts: Date.now(), value: w}];
        }
    }
    if (athlete) {
        await athlete.save(data);
        return athlete.data;
    } else {
        await athletesStore.put({id, ...data});
        return {id, ...data};
    }
}
sauce.proxy.export(addAthlete, {namespace});


export async function getAthlete(id) {
    return await athletesStore.get(id);
}
sauce.proxy.export(getAthlete, {namespace});


async function getEnabledAthletes() {
    return await athletesStore.getEnabled();
}
sauce.proxy.export(getEnabledAthletes, {namespace});


async function getActivitiesForAthlete(athleteId, options={}) {
    if (options.includeTrainingLoadSeed) {
        const activities = [];
        const start = options.start;
        const startDay = sauce.date.toLocaleDayDate(start);
        let atl = 0;
        let ctl = 0;
        for await (const a of actsStore.byAthlete(athleteId,
            {...options, direction: 'prev', start: undefined})) {
            if (a.ts > start) {
                activities.push(a);
            } else if (a.ts < startDay && a.training) {
                const seedDay = sauce.date.toLocaleDayDate(a.ts);
                const zeros = [...sauce.date.dayRange(seedDay, startDay)].map(() => 0);
                zeros.pop();  // Exclude seed day.
                atl = a.training.atl || 0;
                ctl = a.training.ctl || 0;
                if (zeros.length) {
                    atl = sauce.perf.calcATL(zeros, atl);
                    ctl = sauce.perf.calcCTL(zeros, ctl);
                }
                break;
            }
        }
        if (activities.length) {
            activities[activities.length - 1].trainingLoadSeed = {
                atl,
                ctl,
            };
            activities.reverse();
        }
        return activities;
    } else if (options.limit) {
        const activities = [];
        for await (const a of actsStore.byAthlete(athleteId, options)) {
            activities.push(a);
        }
        return activities;
    } else {
        return await actsStore.getAllForAthlete(athleteId, options);
    }
}
sauce.proxy.export(getActivitiesForAthlete, {namespace});


async function getNewestActivityForAthlete(athleteId, options) {
    return await actsStore.getNewestForAthlete(athleteId, options);
}
sauce.proxy.export(getNewestActivityForAthlete, {namespace});


async function getOldestActivityForAthlete(athleteId, options) {
    return await actsStore.getOldestForAthlete(athleteId, options);
}
sauce.proxy.export(getOldestActivityForAthlete, {namespace});


export async function getActivitySiblings(activityId, options={}) {
    const siblings = [];
    for await (const x of actsStore.siblings(activityId, options)) {
        siblings.push(x);
    }
    return siblings;
}
sauce.proxy.export(getActivitySiblings, {namespace});


export async function getActivity(id) {
    return await actsStore.get(id);
}
sauce.proxy.export(getActivity, {namespace});


export async function updateActivity(id, updates) {
    return await actsStore.update(id, updates);
}
sauce.proxy.export(updateActivity, {namespace});


async function updateActivities(updates) {
    const updateMap = new Map(Object.entries(updates).map(([id, data]) => [Number(id), data]));
    return await actsStore.updateMany(updateMap);
}
sauce.proxy.export(updateActivities, {namespace});


export async function deleteActivity(id) {
    await actsStore.delete(id);
    await streamsStore.delete(id, {index: 'activity'});
    await peaksStore.delete(id, {index: 'activity'});
}
sauce.proxy.export(deleteActivity, {namespace});


export async function enableAthlete(id) {
    return await syncManager.enableAthlete(id);
}
sauce.proxy.export(enableAthlete, {namespace});


export async function updateAthlete(id, updates) {
    return await syncManager.updateAthlete(id, updates);
}
sauce.proxy.export(updateAthlete, {namespace});


async function setAthleteHistoryValues(athleteId, key, data, options={}) {
    const athlete = await athletesStore.get(athleteId, {model: true});
    if (!athlete) {
        throw new Error('Athlete not found: ' + athleteId);
    }
    const clean = athlete.setHistoryValues(key, data);
    await athlete.save();
    if (!options.disableSync) {
        await invalidateAthleteSyncState(athleteId, 'local', 'activity-stats');
    }
    return clean;
}
sauce.proxy.export(setAthleteHistoryValues, {namespace});


export async function disableAthlete(id) {
    return await syncManager.disableAthlete(id);
}
sauce.proxy.export(disableAthlete, {namespace});


async function syncAthlete(athleteId, options={}) {
    let syncDone;
    if (options.wait) {
        syncDone = new Promise((resolve, reject) => {
            const onSyncActive = ev => {
                if (ev.athlete === athleteId && ev.data === false) {
                    syncManager.removeEventListener('active', onSyncActive);
                    resolve();
                }
            };
            syncManager.addEventListener('active', onSyncActive);
            syncManager.addEventListener('error', ev => reject(new Error(ev.data.error)));
        });
    }
    await syncManager.refreshRequest(athleteId, options);
    await syncDone;
}
sauce.proxy.export(syncAthlete, {namespace});


export async function integrityCheck(athleteId, options={}) {
    const haveStreamsFor = new Set();
    const missingStreamsFor = [];
    const inFalseErrorState = [];
    for await (const [id,] of streamsStore.byAthlete(athleteId, 'time', {keys: true})) {
        haveStreamsFor.add(id);
    }
    const streamManifest = ActivityModel.getSyncManifest('streams', 'fetch');
    const activities = new Map((await actsStore.getAllForAthlete(athleteId, {models: true}))
        .map(x => [x.pk, x]));
    for (const a of activities.values()) {
        if (haveStreamsFor.has(a.pk)) {
            if (a.hasAnySyncErrors('streams')) {
                inFalseErrorState.push(a.pk);
            }
            haveStreamsFor.delete(a.pk);
        } else {
            if (a.hasSyncSuccess(streamManifest)) {
                missingStreamsFor.push(a.pk);
            }
        }
    }
    if (options.repair) {
        const localManifests = ActivityModel.getSyncManifests('local');
        for (const id of missingStreamsFor) {
            console.warn('Repairing activity with missing streams:', id);
            const a = activities.get(id);
            a.clearSyncState(streamManifest);
            for (const m of localManifests) {
                a.clearSyncState(m);
            }
            await a.save();
        }
        for (const id of inFalseErrorState) {
            console.warn('Repairing activity with false-error state:', id);
            const a = activities.get(id);
            a.setSyncSuccess(streamManifest);
            for (const m of localManifests) {
                a.clearSyncState(m);
            }
            await a.save();
        }
        for (const id of haveStreamsFor) {
            if (!options.prune) {
                console.warn('Ignoring missing activity repair (use "prune" to override):', id);
            } else {
                console.warn('Removing detached stream for activity:', id);
                await streamsStore.delete(id, {index: 'activity'});
            }
        }
    }
    return {
        missingStreamsFor,
        deteachedStreamsFor: Array.from(haveStreamsFor),
        inFalseErrorState
    };
}
sauce.proxy.export(integrityCheck, {namespace});


export async function danglingActivities(options={}) {
    const athletes = new Map((await athletesStore.getAll()).map(x => [x.id, x]));
    const noAthleteFor = [];
    const syncDisabledFor = [];
    for await (const c of actsStore.cursor(null, {index: 'athlete-ts'})) {
        const athleteId = c.key[0];
        if (!athletes.has(athleteId)) {
            noAthleteFor.push(c.primaryKey);
        } else if (!athletes.get(athleteId).sync) {
            syncDisabledFor.push(c.primaryKey);
        }
    }
    return {noAthleteFor, syncDisabledFor};
}
sauce.proxy.export(danglingActivities, {namespace});


export async function danglingStreams(options={}) {
    const athletes = new Map((await athletesStore.getAll()).map(x => [x.id, x]));
    const activities = new Set(await actsStore.getAllKeys());
    const noActivityFor = [];
    const noAthleteFor = [];
    const syncDisabledFor = [];
    const mode = options.prune ? 'readwrite' : 'readonly';
    for await (const c of streamsStore.cursor(null, {index: 'athlete', mode})) {
        const [activity, stream] = c.primaryKey;
        const athlete = c.key;
        if (!activities.has(activity)) {
            if (options.prune) {
                c.delete();
            } else {
                noActivityFor.push({activity, stream, athlete});
            }
        } else if (!athletes.has(athlete)) {
            if (options.prune) {
                c.delete();
            } else {
                noAthleteFor.push({activity, stream, athlete});
            }
        } else if (!athletes.get(athlete).sync) {
            if (options.prune) {
                c.delete();
            } else {
                syncDisabledFor.push({activity, stream, athlete});
            }
        }
    }
    return {noActivityFor, noAthleteFor, syncDisabledFor};
}
sauce.proxy.export(danglingActivities, {namespace});


export async function invalidateAthleteSyncState(athleteId, processor, name, options={}) {
    if (!athleteId || !processor) {
        throw new TypeError("'athleteId' and 'processor' are required args");
    }
    let athlete;
    if (!options.disableSync) {
        athlete = await athletesStore.get(athleteId, {model: true});
        if (athlete.isEnabled() && syncManager) {
            const job = syncManager.activeJobs.get(athleteId);
            if (job) {
                job.cancel();
                await job.wait();
            }
        }
    }
    await actsStore.invalidateForAthleteWithSync(athleteId, processor, name);
    if (!options.disableSync && athlete.isEnabled() && syncManager) {
        await syncAthlete(athleteId, {
            noActivityScan: true,
            noStreamsFetch: processor === 'local',
            ...options
        });
    }
}
sauce.proxy.export(invalidateAthleteSyncState, {namespace});


export async function invalidateActivitySyncState(activityId, processor, name, options={}) {
    if (!activityId || !processor) {
        throw new TypeError("'activityId' and 'processor' are required args");
    }
    const manifests = ActivityModel.getSyncManifests(processor, name);
    if (!manifests.length) {
        throw new TypeError('Invalid sync processor/name');
    }
    const activity = await actsStore.get(activityId, {model: true});
    let athlete;
    if (!options.disableSync) {
        athlete = await athletesStore.get(activity.get('athlete'), {model: true});
        if (athlete.isEnabled() && syncManager) {
            const job = syncManager.activeJobs.get(athlete.pk);
            if (job) {
                job.cancel();
                await job.wait();
            }
        }
    }
    for (const m of manifests) {
        activity.clearSyncState(m);
    }
    await activity.save();
    if (!options.disableSync && athlete.isEnabled() && syncManager) {
        await syncAthlete(athlete.pk, {
            noActivityScan: true,
            noStreamsFetch: processor === 'local',
            ...options
        });
    }
}
sauce.proxy.export(invalidateActivitySyncState, {namespace});


export async function activityCounts(athleteId, activities) {
    activities = activities || await actsStore.getAllForAthlete(athleteId, {models: true});
    const streamManifests = ActivityModel.getSyncManifests('streams');
    const localManifests = ActivityModel.getSyncManifests('local');
    const total = activities.length;
    let imported = 0;
    let unavailable = 0;
    let processed = 0;
    let unprocessable = 0;
    for (const a of activities) {
        let success = null;
        for (const m of streamManifests) {
            if (a.hasSyncError(m)) {
                success = false;
                break;
            } else if (a.hasSyncSuccess(m)) {
                success = true;
            } else {
                success = null;
                break;
            }
        }
        if (success) {
            imported++;
        } else {
            if (success === false) {
                unavailable++;
            }
            continue;
        }
        success = null;
        for (const m of localManifests) {
            if (a.hasSyncError(m)) {
                success = false;
                break;
            } else if (a.hasSyncSuccess(m)) {
                success = true;
            } else {
                success = null;
                break;
            }
        }
        if (success) {
            processed++;
        } else {
            if (success === false) {
                unprocessable++;
            }
        }
    }
    return {
        total,
        imported,
        unavailable,
        processed,
        unprocessable
    };
}
sauce.proxy.export(activityCounts, {namespace});


export async function activityTypeCounts(athleteId, options) {
    return await actsStore.countTypesForAthlete(athleteId, options);
}
sauce.proxy.export(activityTypeCounts, {namespace});


class SyncJob extends EventTarget {
    constructor(athlete, isSelf) {
        super();
        this.athlete = athlete;
        this.isSelf = isSelf;
        this._cancelEvent = new locks.Event();
        this._rateLimiters = getStreamRateLimiterGroup();
        this._procQueue = new queues.Queue();
        this.setStatus('init');
    }

    async wait() {
        await this._runPromise;
    }

    cancel() {
        this._cancelEvent.set();
    }

    cancelled() {
        return this._cancelEvent.isSet();
    }

    run(options) {
        this._runPromise = this._run(options);
    }

    emit(name, data) {
        const ev = new Event(name);
        ev.data = data;
        this.dispatchEvent(ev);
    }

    setStatus(status) {
        this.status = status;
        this.emit('status', status);
    }

    async _run(options={}) {
        if (!options.noActivityScan) {
            this.setStatus('activity-scan');
            const updateFn = this.isSelf ? updateSelfActivities : updatePeerActivities;
            try {
                await updateFn(this.athlete, {forceUpdate: options.forceActivityUpdate});
            } finally {
                await this.athlete.save({lastSyncActivityListVersion: activityListVersion});
            }
        }
        this.setStatus('data-sync');
        try {
            await this._syncData(options);
        } catch(e) {
            this.setStatus('error');
            throw e;
        }
        this.setStatus('complete');
    }

    async _syncData(options={}) {
        const activities = await actsStore.getAllForAthlete(this.athlete.pk, {models: true});
        this.allActivities = new Map(activities.map(x => [x.pk, x]));
        const unfetched = [];
        let deferCount = 0;
        const streamManifest = ActivityModel.getSyncManifest('streams', 'fetch');
        for (const a of activities) {
            if (a.isSyncComplete('streams') || a.getSyncError(streamManifest) === 'no-streams') {
                if (!a.isSyncComplete('local')) {
                    if (a.nextAvailManifest('local')) {
                        this._procQueue.putNoWait(a);
                    } else {
                        deferCount++;
                    }
                }
            } else if (a.nextAvailManifest('streams')) {
                if (a.nextAvailManifest('streams')) {
                    unfetched.push(a);
                } else {
                    deferCount++;
                }
            }
        }
        if (deferCount) {
            console.warn(`Deferring sync of ${deferCount} activities due to error`);
        }
        const workers = [];
        if (unfetched.length && !options.noStreamsFetch) {
            workers.push(this._fetchStreamsWorker(unfetched));
        } else if (!this._procQueue.size) {
            console.debug("No activity sync required for: " + this.athlete);
            return;
        } else {
            this._procQueue.putNoWait(null);  // sentinel
        }
        workers.push(this._localProcessWorker());
        await Promise.all(workers);
    }

    async _fetchStreamsWorker(...args) {
        try {
            return await this.__fetchStreamsWorker(...args);
        } finally {
            this._procQueue.putNoWait(null);
        }
    }

    async __fetchStreamsWorker(activities) {
        activities.sort((a, b) => b.get('ts') - a.get('ts'));  // newest -> oldest
        const q = new URLSearchParams();
        const manifest = ActivityModel.getSyncManifest('streams', 'fetch');
        const localManifests = ActivityModel.getSyncManifests('local');
        for (const x of manifest.data) {
            q.append('stream_types[]', x);
        }
        for (const activity of activities) {
            let error;
            let data;
            activity.clearSyncState(manifest);
            for (const m of localManifests) {
                activity.clearSyncState(m);
            }
            try {
                data = await this._fetchStreams(activity, q);
            } catch(e) {
                console.warn("Fetch streams error (will retry later):", e);
                error = e;
            }
            if (this._cancelEvent.isSet()) {
                console.info('Sync streams cancelled');
                return;
            }
            if (data) {
                await streamsStore.putMany(Object.entries(data).map(([stream, data]) => ({
                    activity: activity.pk,
                    athlete: this.athlete.pk,
                    stream,
                    data
                })));
                activity.setSyncSuccess(manifest);
                this._procQueue.putNoWait(activity);
            } else if (data === null) {
                activity.setSyncError(manifest, new Error('no-streams'));
                this._procQueue.putNoWait(activity);
            } else if (error) {
                // Often this is an activity converted to private.
                activity.setSyncError(manifest, error);
            }
            await activity.save();
        }
        console.info("Completed streams fetch for: " + this.athlete);
    }

    async _localSetSyncError(activities, manifest, e) {
        console.warn(`Top level local processing error (${manifest.name}) v${manifest.version}`, e);
        sauce.report.error(e);
        for (const a of activities) {
            a.setSyncError(manifest, e);
        }
        await actsStore.saveModels(activities);
    }

    async _localSetSyncDone(activities, manifest) {
        // NOTE: The processor is free to use setSyncError(), but we really can't
        // trust them to consistently use setSyncSuccess().  Failing to do so would
        // be a disaster, so we handle that here.  The model is: Optionally tag the
        // activity as having a sync error otherwise we assume it worked or does
        // not need further processing, so mark it as done (success).
        for (const a of activities) {
            if (!a.hasSyncError(manifest)) {
                a.setSyncSuccess(manifest);
            }
        }
        await actsStore.saveModels(activities);
    }

    async _localProcessWorker() {
        let batchLimit = 20;
        let lastProgressHash;
        const batch = new Set();
        const offloaded = new Set();
        const offloadedActive = new Map();
        let procQueue = this._procQueue;
        while ((procQueue || offloaded.size) && !this._cancelEvent.isSet()) {
            const available = [...offloaded].some(x => x.size) ||
                (procQueue && procQueue.size);
            if (!available) {
                const waiters = [...offloaded, this._cancelEvent];
                if (!procQueue) {
                    // No new incoming data, instruct offload queues to get busy..
                    for (const x of offloaded) {
                        console.debug('Flushing offload processor:', x.manifest.name);
                        x.flush();
                    }
                } else {
                    waiters.push(procQueue);
                }
                await Promise.any([...waiters.map(x => x.wait()), ...offloaded]);
                if (this._cancelEvent.isSet()) {
                    return;
                }
            }
            for (const proc of offloaded) {
                const finished = proc.getBatch(batchLimit - batch.size);
                if (finished.length) {
                    for (const a of finished) {
                        batch.add(a);
                    }
                    await this._localSetSyncDone(finished, proc.manifest);
                }
                if (proc.done() && !proc.size) {
                    try {
                        await proc;
                    } catch(e) {
                        await this._localSetSyncError(proc.pending, proc.manifest, e);
                    }
                    console.debug("Offload processor finished:", proc.manifest.name);
                    offloaded.delete(proc);
                }
                if (batch.size >= batchLimit) {
                    break;
                }
            }
            if (procQueue) {
                while (procQueue.size && batch.size < batchLimit) {
                    const a = procQueue.getNoWait();
                    if (a === null) {
                        procQueue = null;
                        break;
                    }
                    batch.add(a);
                }
            }
            batchLimit = Math.min(500, Math.ceil(batchLimit * 1.30));
            while (batch.size && !this._cancelEvent.isSet()) {
                const manifestBatches = new Map();
                for (const a of batch) {
                    const m = a.nextAvailManifest('local');
                    if (!m) {
                        batch.delete(a);
                        continue;
                    }
                    if (!manifestBatches.has(m)) {
                        manifestBatches.set(m, []);
                    }
                    const manifestBatch = manifestBatches.get(m);
                    manifestBatch.push(a);
                    a.clearSyncState(m);
                }
                for (const [m, activities] of manifestBatches.entries()) {
                    const processor = m.data.processor;
                    if (issubclass(processor, processors.OffloadProcessor)) {
                        let procInstance = offloadedActive.get(processor);
                        if (!procInstance) {
                            console.debug("Creating new offload processor:", m.name);
                            procInstance = new processor({
                                manifest: m,
                                athlete: this.athlete,
                                cancelEvent: this._cancelEvent
                            });
                            offloadedActive.set(processor, procInstance);
                            offloaded.add(procInstance);
                            // The processor can remain in the offloaded set until it's fully drained
                            // in the upper queue mgmt section, but we need to remove it from the active
                            // set immediately so we don't requeue data to it.
                            procInstance.finally(() => void offloadedActive.delete(processor));
                        }
                        await procInstance.putIncoming(activities);
                        for (const a of activities) {
                            batch.delete(a);
                        }
                        console.debug(`${m.name}: enqueued ${activities.length} activities`);
                    } else {
                        const s = Date.now();
                        try {
                            await processor({
                                manifest: m,
                                activities,
                                athlete: this.athlete,
                                cancelEvent: this._cancelEvent,
                            });
                            await this._localSetSyncDone(activities, m);
                        } catch(e) {
                            await this._localSetSyncError(activities, m, e);
                        }
                        const elapsed = Math.round((Date.now() - s)).toLocaleString();
                        console.debug(`${m.name}: ${elapsed}ms for ${activities.length} activities`);
                    }
                }
                const counts = await activityCounts(this.athlete.pk, [...this.allActivities.values()]);
                const progressHash = JSON.stringify(counts);
                if (progressHash !== lastProgressHash) {
                    lastProgressHash = progressHash;
                    const ev = new Event('progress');
                    ev.data = {counts};
                    this.dispatchEvent(ev);
                }
            }
        }
    }

    async _fetchStreams(activity, q) {
        for (let i = 1;; i++) {
            const impendingSuspend = this._rateLimiters.willSuspendFor();
            const minRateLimit = 10000;
            if (impendingSuspend > minRateLimit) {
                console.info(`Rate limited for ${Math.round(impendingSuspend / 60 / 1000)} minutes`);
                for (const x of this._rateLimiters) {
                    if (x.willSuspendFor()) {
                        console.debug('' + x);
                    }
                }
                this.emit('ratelimiter', {
                    suspended: true,
                    until: Date.now() + impendingSuspend
                });
            }
            await Promise.race([this._rateLimiters.wait(), this._cancelEvent.wait()]);
            if (this._cancelEvent.isSet()) {
                return;
            }
            if (impendingSuspend > minRateLimit) {
                this.emit('ratelimiter', {suspended: false});
            }
            console.debug(`Fetching streams for: ${activity.pk} ${new Date(activity.get('ts'))}`);
            try {
                const resp = await retryFetch(`/activities/${activity.pk}/streams?${q}`);
                return await resp.json();
            } catch(e) {
                if (!e.resp) {
                    throw e;
                } else if (e.resp.status === 404) {
                    return null;
                } else if (e.resp.status === 429) {
                    const delay = 60000 * i;
                    console.warn(`Hit Throttle Limits: Delaying next request for ${Math.round(delay / 1000)}s`);
                    await Promise.race([sleep(delay), this._cancelEvent.wait()]);
                    if (this._cancelEvent.isSet()) {
                        return;
                    }
                    console.info("Resuming after throttle period");
                    continue;
                } else {
                    throw e;
                }
            }
        }
    }
}


class SyncManager extends EventTarget {
    constructor(currentUser) {
        super();
        console.info(`Starting Sync Manager for:`, currentUser);
        this.refreshInterval = 6 * 3600 * 1000;
        this.refreshErrorBackoff = 1 * 3600 * 1000;
        this.currentUser = currentUser;
        this.activeJobs = new Map();
        this._stopping = false;
        this._athleteLock = new locks.Lock();
        this._refreshRequests = new Map();
        this._refreshEvent = new locks.Event();
        this._refreshLoop = this.refreshLoop();
    }

    stop() {
        this._stopping = true;
        for (const x of this.activeJobs.values()) {
            x.cancel();
        }
        this._refreshEvent.set();
    }

    async join() {
        await Promise.allSettled(Array.from(this.activeJobs.values()).map(x => x.wait()));
        await this._refreshLoop;
    }

    async syncVersionHash() {
        const manifests = [].concat(
            ActivityModel.getSyncManifests('local'),
            ActivityModel.getSyncManifests('streams'));
        const records = [];
        for (const x of manifests) {
            records.push(`${x.processor}-${x.name}-v${x.version}`);
        }
        records.sort();
        const text = new TextEncoder();
        const buf = await crypto.subtle.digest('SHA-256', text.encode(JSON.stringify(records)));
        return Array.from(new Uint8Array(buf)).map(x => x.toString(16).padStart(2, '0')).join('');
    }

    async refreshLoop() {
        let errorBackoff = 1000;
        const syncHash = await this.syncVersionHash();
        while (!this._stopping) {
            try {
                await this._refresh(syncHash);
            } catch(e) {
                sauce.report.error(e);
                await sleep(errorBackoff *= 1.5);
            }
            this._refreshEvent.clear();
            const enabledAthletes = await athletesStore.getEnabled({models: true});
            if (!enabledAthletes.length) {
                console.debug('No athletes enabled for sync.');
                await this._refreshEvent.wait();
            } else {
                let oldest = -1;
                const now = Date.now();
                for (const athlete of enabledAthletes) {
                    if (this.isActiveSync(athlete)) {
                        continue;
                    }
                    const age = now - athlete.get('lastSync');
                    oldest = Math.max(age, oldest);
                }
                if (oldest === -1) {
                    await this._refreshEvent.wait();
                } else {
                    const deadline = this.refreshInterval - oldest;
                    const next = Math.round(deadline / 1000).toLocaleString();
                    console.debug(`Next Sync Manager refresh in ${next} seconds`);
                    await Promise.race([sleep(deadline), this._refreshEvent.wait()]);
                }
            }
        }
    }

    async _refresh(syncHash) {
        for (const a of await athletesStore.getEnabled({models: true})) {
            if (this.isActiveSync(a)) {
                continue;
            }
            const forceActivityUpdate = a.get('lastSyncActivityListVersion') !== activityListVersion;
            const shouldRun =
                this._refreshRequests.has(a.pk) ||
                a.get('lastSyncVersionHash') !== syncHash ||
                forceActivityUpdate ||
                (!this._isDeferred(a) && Date.now() - a.get('lastSync') > this.refreshInterval);
            if (shouldRun) {
                const options = Object.assign({
                    forceActivityUpdate,
                    syncHash,
                }, this._refreshRequests.get(a.pk));
                this._refreshRequests.delete(a.pk);
                this.runSyncJob(a, options);  // bg okay
            }
        }
    }

    isActiveSync(athlete) {
        return this.activeJobs.has(athlete.pk);
    }

    _isDeferred(athlete) {
        const lastError = athlete.get('lastSyncError');
        return !!lastError && Date.now() - lastError < this.refreshErrorBackoff;
    }

    async runSyncJob(athlete, options) {
        const start = Date.now();
        console.info('Starting sync job for: ' + athlete);
        const athleteId = athlete.pk;
        const isSelf = this.currentUser === athleteId;
        const syncJob = new SyncJob(athlete, isSelf);
        syncJob.addEventListener('status', ev => this.emitForAthlete(athlete, 'status', ev.data));
        syncJob.addEventListener('progress', ev => this.emitForAthlete(athlete, 'progress', ev.data));
        syncJob.addEventListener('ratelimiter', ev => this.emitForAthlete(athlete, 'ratelimiter', ev.data));
        this.emitForAthlete(athlete, 'active', true);
        this.activeJobs.set(athleteId, syncJob);
        syncJob.run(options);
        try {
            await syncJob.wait();
        } catch(e) {
            sauce.report.error(e);
            athlete.set('lastSyncError', Date.now());
            this.emitForAthlete(athlete, 'error', {error: e.message});
        } finally {
            athlete.set('lastSyncVersionHash', options.syncHash);
            athlete.set('lastSync', Date.now());
            await this._athleteLock.acquire();
            try {
                await athlete.save();
            } finally {
                this._athleteLock.release();
            }
            this.activeJobs.delete(athleteId);
            this._refreshEvent.set();
            this.emitForAthlete(athlete, 'active', false);
            console.info(`Sync completed in ${Math.round((Date.now() - start) / 1000)} seconds for: ` + athlete);
        }
    }

    emitForAthlete(athlete, ...args) {
        return this.emitForAthleteId(athlete.pk, ...args);
    }

    emitForAthleteId(athleteId, name, data) {
        const ev = new Event(name);
        ev.athlete = athleteId,
        ev.data = data;
        this.dispatchEvent(ev);
    }

    refreshRequest(id, options={}) {
        if (!id) {
            throw new TypeError('Athlete ID arg required');
        }
        this._refreshRequests.set(id, options);
        this._refreshEvent.set();
    }

    async updateAthlete(id, obj) {
        if (!id) {
            throw new TypeError('Athlete ID arg required');
        }
        await this._athleteLock.acquire();
        try {
            const athlete = await athletesStore.get(id, {model: true});
            if (!athlete) {
                throw new Error('Athlete not found: ' + id);
            }
            await athlete.save(obj);
        } finally {
            this._athleteLock.release();
        }
    }

    async enableAthlete(id) {
        if (!id) {
            throw new TypeError('Athlete ID arg required');
        }
        await this.updateAthlete(id, {
            sync: DBTrue,
            lastSync: 0,
            lastSyncError: 0,
            lastSyncActivityListVersion: null
        });
        this._refreshEvent.set();
        this.emitForAthleteId(id, 'enable');
    }

    async disableAthlete(id) {
        if (!id) {
            throw new TypeError('Athlete ID arg required');
        }
        await this.updateAthlete(id, {sync: DBFalse});
        if (this.activeJobs.has(id)) {
            const syncJob = this.activeJobs.get(id);
            syncJob.cancel();
        }
        this._refreshEvent.set();
        this.emitForAthleteId(id, 'disable');
    }

    async purgeAthleteData(athlete) {
        if (!athlete) {
            throw new TypeError('Athlete arg required');
        }
        // Obviously use with extreme caution!
        await actsStore.deleteForAthlete(athlete);
    }
}


class SyncController extends sauce.proxy.Eventing {
    constructor(athleteId) {
        super();
        this.athleteId = athleteId;
        this._syncListeners = [];
        const activeJob = syncManager && syncManager.activeJobs.get(athleteId);
        this.state = {
            active: !!activeJob,
            status: activeJob && activeJob.status,
            error: null
        };
        this._setupEventRelay('active', ev => {
            this.state.active = ev.data;
            if (this.state.active) {
                this.state.error = null;
            }
        });
        this._setupEventRelay('status', ev => this.state.status = ev.data);
        this._setupEventRelay('error', ev => this.state.error = ev.data.error);
        this._setupEventRelay('enable');
        this._setupEventRelay('disable');
        this._setupEventRelay('progress');
        this._setupEventRelay('ratelimiter');
    }

    delete() {
        for (const [name, listener] of this._syncListeners) {
            const sm = syncManager;
            if (sm) {
                sm.removeEventListener(name, listener);
            }
        }
        this._syncListeners.length = 0;
    }

    _setupEventRelay(name, internalCallback) {
        const listener = ev => {
            if (ev.athlete === this.athleteId) {
                if (internalCallback) {
                    internalCallback(ev);
                }
                this.dispatchEvent(ev);
            }
        };
        syncManager.addEventListener(name, listener);
        this._syncListeners.push([name, listener]);
    }

    isActiveSync() {
        return !!(syncManager && syncManager.activeJobs.has(this.athleteId));
    }

    async cancel() {
        if (syncManager) {
            const job = syncManager.activeJobs.get(this.athleteId);
            if (job) {
                job.cancel();
                await job.wait();
                return true;
            }
        }
    }

    rateLimiterResumes() {
        if (this.isActiveSync()) {
            const g = streamRateLimiterGroup;
            if (g && g.suspended()) {
                return streamRateLimiterGroup.resumes();
            }
        }
    }

    rateLimiterSuspended() {
        if (this.isActiveSync()) {
            const g = streamRateLimiterGroup;
            return g && g.suspended();
        }
    }

    async lastSync() {
        return (await athletesStore.get(this.athleteId)).lastSync;
    }

    async nextSync() {
        return syncManager.refreshInterval + await this.lastSync();
    }

    getState() {
        return this.state;
    }
}
sauce.proxy.export(SyncController, {namespace});


class DataExchange extends sauce.proxy.Eventing {
    constructor(athleteId) {
        super();
        this.athleteId = athleteId;
        this.importing = {};
    }

    async export() {
        // Use a size estimate scheme to try and stay within platform limits.
        let sizeEstimate = 0;
        const sizeLimit = 10 * 1024 * 1024;
        let batch = [];
        const dispatch = () => {
            const ev = new Event('data');
            ev.data = Array.from(batch);
            batch.length = 0;
            sizeEstimate = 0;
            this.dispatchEvent(ev);
        };
        if (this.athleteId) {
            batch.push({store: 'athletes', data: await athletesStore.get(this.athleteId)});
            sizeEstimate += 1000;
        } else {
            for (const data of await athletesStore.getAll()) {
                sizeEstimate += 1000;
                batch.push({store: 'athletes', data});
            }
        }
        const actsWork = (async () => {
            const iter = this.athleteId ?
                actsStore.byAthlete(this.athleteId) :
                actsStore.values();
            for await (const data of iter) {
                batch.push({store: 'activities', data});
                sizeEstimate += 1500;  // Tuned on my data + headroom.
                if (sizeEstimate >= sizeLimit) {
                    dispatch();
                }
            }
        })();
        const streamsWork = (async () => {
            const iter = this.athleteId ?
                streamsStore.byAthlete(this.athleteId) :
                streamsStore.values();
            const estSizePerArrayEntry = 6.4;  // Tuned on my data + headroom.
            for await (const data of iter) {
                batch.push({store: 'streams', data});
                sizeEstimate += 100 + (data && data.data) ?
                    data.data.length * estSizePerArrayEntry : 0;
                if (sizeEstimate >= sizeLimit) {
                    dispatch();
                }
            }
        })();
        await Promise.all([actsWork, streamsWork]);
        if (batch.length) {
            dispatch();
        }
    }

    async import(data) {
        for (const x of data) {
            if (!this.importing[x.store]) {
                this.importing[x.store] = [];
            }
            this.importing[x.store].push(x.data);
        }
        const size = sauce.data.sum(Object.values(this.importing).map(x => x.length));
        if (size > 1000) {
            await this.flush();
        }
    }

    async flush() {
        if (this.importing.athletes) {
            await athletesStore.putMany(this.importing.athletes.splice(0, Infinity));
        }
        if (this.importing.activities) {
            await actsStore.putMany(this.importing.activities.splice(0, Infinity));
        }
        if (this.importing.streams) {
            await streamsStore.putMany(this.importing.streams.splice(0, Infinity));
        }
    }
}
sauce.proxy.export(DataExchange, {namespace});


export function startSyncManager() {
    if (!self.disabled && self.currentUser) {
        syncManager = new SyncManager(self.currentUser);
    }
}


addEventListener('currentUserUpdate', async ev => {
    if (syncManager && syncManager.currentUser !== ev.id) {
        console.info("Stopping Sync Manager due to user change...");
        syncManager.stop();
        await syncManager.join();
        console.debug("Sync Manager stopped.");
    }
    syncManager = ev.id ? new SyncManager(ev.id) : null;
});

addEventListener('enabled', ev => {
    if (!syncManager && self.currentUser) {
        console.info("Starting Sync Manager...");
        syncManager = new SyncManager(self.currentUser);
    }
});

addEventListener('disabled', async ev => {
    if (syncManager) {
        console.info("Stopping Sync Manager...");
        const mgr = syncManager;
        syncManager = null;
        mgr.stop();
        await mgr.join();
        console.debug("Sync Manager stopped.");
    }
});
