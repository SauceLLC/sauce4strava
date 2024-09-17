/* global sauce */

import * as queues from '/src/common/jscoop/queues.mjs';
import * as locks from '/src/common/jscoop/locks.mjs';
import {offscreenProxy} from '/src/bg/hist.mjs';

const actsStore = sauce.hist.db.ActivitiesStore.singleton();
const peaksStore = sauce.hist.db.PeaksStore.singleton();
const streamsStore = sauce.hist.db.StreamsStore.singleton();

const minEstPeakPowerPeriod = 300;


function withTimeout(promise, delay) {
    let timeoutId;
    const timeout = new Promise((_, rej) => {
        timeoutId = setTimeout(() => rej(new Error(`Promise timeout (${delay})`)), delay);
    });
    promise.finally(() => clearTimeout(timeoutId));
    return Promise.race([promise, timeout]);
}


async function getActivitiesStreams(activities, streamsDesc) {
    const streamKeys = [];
    const actStreams = new Map();
    for (const a of activities) {
        let streams;
        if (Array.isArray(streamsDesc)) {
            streams = streamsDesc;
        } else {
            const type = a.get('basetype');
            streams = streamsDesc[type === 'run' ? 'run' : type === 'ride' ? 'ride' : 'other'];
        }
        actStreams.set(a.pk, {});
        for (const stream of streams) {
            streamKeys.push([a.pk, stream]);
        }
    }
    const getStreams = streamsStore.getMany(streamKeys, {_skipClone: true, _skipCache: true});
    for (const x of await withTimeout(getStreams, 120000)) {
        if (x) {
            actStreams.get(x.activity)[x.stream] = x.data;
        }
    }
    return actStreams;
}


export class OffloadProcessor {
    constructor({manifest, athlete, cancelEvent}) {
        this.manifest = manifest;
        this.athlete = athlete;
        this.started = false;
        this.stopping = false;
        this.stopped = false;
        this.runPromise = null;
        this._inflight = new Set();
        this._incoming = new queues.PriorityQueue();
        this._finished = new queues.Queue();
        this._flushEvent = new locks.Event();
        this._stopEvent = new locks.Event();
        cancelEvent.wait().then(() => this._stop());
    }

    flush() {
        this._flushEvent.set();
    }

    start() {
        if (this.started) {
            throw new Error('Already started');
        }
        this.started = true;
        this.runPromise = this._run().finally(() => this.stopped = true);
        return this.runPromise;
    }

    stop() {
        if (this._inflight.size || this._incoming.size || this._finished.size) {
            console.error("Premature stop of offload proc", this);
        }
        this._stop();
    }

    _stop() {
        this.stopping = true;
        this._stopEvent.set();
    }

    get pending() {
        return this._incoming.size + this._incoming._unfinishedTasks;
    }

    get available() {
        return this._finished.size;
    }

    drainAll() {
        if (!this.stopping) {
            throw new Error("Invalid state for drainAll");
        }
        const items = [];
        for (const x of this._incoming.getAllNoWait()) {
            items.push(x);
        }
        for (const x of this._finished.getAllNoWait()) {
            items.push(x);
        }
        for (const x of this._inflight) {
            items.push(x);
            this._inflight.clear();
        }
        return items;
    }

    putIncoming(activities) {
        if (this.stopping) {
            throw new Error("Invalid state for putIncoming");
        }
        for (const a of activities) {
            this._incoming.putNoWait(a, a.get('ts'));
        }
        return this._incoming.size;
    }

    getFinished(count) {
        const batch = [];
        while (this._finished.size && batch.length < count) {
            const a = this._finished.getNoWait();
            this._inflight.delete(a);
            batch.push(a);
        }
        this._finished.taskDone(batch.length);
        return batch;
    }

    waitFinished() {
        // Returns Future, must use <ret>.cancel() if not consuming data.
        return this._finished.wait();
    }

    putFinished(activities) {
        for (const a of activities) {
            this._finished.putNoWait(a);
        }
        this._incoming.taskDone(activities.length);
    }

    async getAllIncoming(options={}) {
        const minWait = options.minWait;
        const maxWait = options.maxWait;
        const maxSize = options.maxSize || 1;
        let deadline = maxWait && Date.now() + maxWait;
        const stop = this._stopEvent.wait();
        console.warn('getAllIncoming', this, {minWait, maxWait, maxSize, deadline, stop});
        while (!this.stopping) {
            const timeouts = [];
            if (minWait && maxWait) {
                timeouts.push(sauce.sleep(Math.min(minWait, deadline - Date.now())));
            } else if (minWait) {
                timeouts.push(sauce.sleep(minWait));
            } else if (maxWait) {
                timeouts.push(sauce.sleep(maxWait));
            }
            const dataWait = this._incoming.wait({size: maxSize});
            console.warn('getAllIncoming await race...', this,
                {minWait, maxWait, maxSize, deadline, stop, timeouts, dataWait});
            await Promise.race([stop, dataWait, this._flushEvent.wait(), ...timeouts]);
            const moreData = dataWait.done();
            if (!moreData) {
                console.warn('getall', {moreData}, this);
                dataWait.cancel();
            }
            if (this._stopEvent.isSet()) {
                console.warn('getall stop event', this);
                return;
            }
            const size = this._incoming.size;
            const flush = this._flushEvent.isSet();
            if (flush) {
                console.warn('getall flush (so clear)', {size}, this);
                this._flushEvent.clear();
                if (!size) {
                    // We're just waiting for out-of-band work to finish.
                    continue;
                }
            } else if (moreData && size < maxSize && Date.now() < deadline) {
                // We are still within the constraints and have a positive ingest rate.
                // Continue waiting for stagnation or other events.
                console.warn('getall fcontineut to wait because we think there is more.l.',
                    {moreData, size, maxSize, deadline}, this);
                continue;
            }
            deadline = maxWait && Date.now() + maxWait;
            if (!size) {
                console.warn('getall no size continue...', {size, deadline}, this);
                continue;
            }
            const items = this._incoming.getAllNoWait();
            console.warn('getall DO IT!!!!!!!!!!', {items}, this);
            for (const x of items) {
                this._inflight.add(x);
            }
            return items;
        }
    }

    async _run() {
        try {
            await this.processor();
        } finally {
            this._stop();
        }
        await this._incoming.join();
    }

    async processor() {
        /* Subclass should keep this alive for the duration of their execution.
         * It is also their job to monitor flushEvent and stopEvent. */
        await undefined;  // lint
        throw new TypeError("Pure virutal method");
    }
}


export async function athleteSettingsProcessor({manifest, activities, athlete}) {
    let invalidate;
    const hrTS = athlete.get('hrZonesTS');
    if (hrTS == null || Date.now() - hrTS > 86400 * 1000) {
        // The HR zones API is based on activities, so technically it is historical but
        // this leads to a lot of complications so we simply look for the latest values.
        // If the zones are updated we need to trigger an invalidation of all activities.
        const origZones = athlete.get('hrZones');
        const origHash = origZones ? JSON.stringify(origZones) : null;
        let recentActivity = await actsStore.getNewestForAthlete(athlete.pk);
        let remainingAttempts = 10;
        while (recentActivity && remainingAttempts--) {
            const zones = await sauce.perf.fetchHRZones(recentActivity.id);
            if (!zones) {
                recentActivity = await actsStore.getPrevSibling(recentActivity);
                continue;
            }
            invalidate = !origHash || JSON.stringify(zones) !== origHash;
            athlete.set('hrZones', zones);
            athlete.set('hrZonesTS', Date.now());
            await athlete.save();
            break;
        }
    }
    const gender = athlete.get('gender');
    if (!gender) {
        let remainingAttempts = 10;
        for (const activity of activities) {
            const gender = await sauce.perf.fetchPeerGender(activity.pk);
            if (!gender) {
                if (--remainingAttempts) {
                    console.error("Unable to to learn gender");
                    break;
                }
                continue;
            }
            athlete.set('gender', gender);
            await athlete.save();
            invalidate = true;
        }
    }
    if (invalidate) {
        console.info("Athlete settings updated for:", athlete.pk, athlete.get('name'));
        sauce.hist.invalidateAthleteSyncState(athlete.pk, manifest.processor, manifest.name,
            {noStreamsFetch: false}).catch(e =>
            console.error("Failed to force resync during athlete settings update:", e));
    }
}


export async function extraStreamsProcessor({manifest, activities, athlete}) {
    const actStreams = await getActivitiesStreams(activities,
        ['time', 'moving', 'active', 'cadence', 'watts', 'watts_calc', 'distance',
         'grade_adjusted_distance']);
    const upStreams = [];
    const disableRunWatts = athlete.get('disableRunWatts');
    const createEstRunWatts = athlete.get('estRunWatts');
    for (const activity of activities) {
        const streams = actStreams.get(activity.pk);
        if (!streams.moving) {
            continue;
        }
        const isTrainer = activity.get('trainer');
        const basetype = activity.get('basetype');
        const isSwim = basetype === 'swim';
        const isRun = basetype === 'run';
        let watts;
        if (isRun) {
            if (createEstRunWatts) {
                const gad = streams.grade_adjusted_distance;
                const weight = athlete.getWeightAt(activity.get('ts'));
                if (gad && weight && streams.time.length > 25) {
                    try {
                        const data = sauce.pace.createWattsStream(streams.time, gad, weight);
                        if (!sauce.data.isArrayEqual(data, streams.watts_calc)) {
                            streams.watts_calc = data;
                            upStreams.push({
                                activity: activity.pk,
                                athlete: athlete.pk,
                                stream: 'watts_calc',
                                data
                            });
                        }
                    } catch(e) {
                        console.error("Failed to create running watts stream for: " + activity, e);
                        activity.setSyncError(manifest, e);
                    }
                }
                // Real watts can still take prio unless disableRunWatts is active.
                watts = disableRunWatts ? streams.watts_calc : streams.watts || streams.watts_calc;
            } else if (!disableRunWatts) {
                watts = streams.watts;
            }
        } else {
            watts = streams.watts;
        }
        try {
            const data = sauce.data.createActiveStream({...streams, watts}, {isTrainer, isSwim});
            if (!sauce.data.isArrayEqual(data, streams.active)) {
                upStreams.push({activity: activity.pk, athlete: athlete.pk, stream: 'active', data});
            }
        } catch(e) {
            console.error("Failed to create active stream for: " + activity, e);
            activity.setSyncError(manifest, e);
        }
    }
    await streamsStore.putMany(upStreams);
}


/*
 * Handle watts_calc generation and also peak power for runs seperately.
 * Any weight changes will require these to be updated and this makes
 * much faster work of those sync updates than rerunning all of the peak
 * calculations.  Note that extra streams may have already generated the
 * watts_calc stream for us, but we have to double check that it's not
 * updated here too.
 */
export async function runPowerProcessor({manifest, activities, athlete}) {
    const disableRunWatts = athlete.get('disableRunWatts');
    const createEstWatts = athlete.get('estRunWatts');
    const createEstPeaks = createEstWatts && athlete.get('estRunPeaks');
    const actStreams = await getActivitiesStreams(activities,
        ['time', 'active', 'watts', 'watts_calc', 'grade_adjusted_distance']);
    const periods = (await sauce.peaks.getRanges('periods')).map(x => x.value);
    const upStreams = [];
    const upPeaks = [];
    for (const activity of activities) {
        if (activity.get('basetype') !== 'run') {
            continue;
        }
        const streams = actStreams.get(activity.pk);
        const gad = streams.grade_adjusted_distance;
        const weight = athlete.getWeightAt(activity.get('ts'));
        if (createEstWatts && gad && weight && streams.time.length > 25) {
            try {
                const data = sauce.pace.createWattsStream(streams.time, gad, weight);
                if (!sauce.data.isArrayEqual(data, streams.watts_calc)) {
                    streams.watts_calc = data;
                    upStreams.push({activity: activity.pk, athlete: athlete.pk, stream: 'watts_calc', data});
                }
            } catch(e) {
                console.error("Failed to create running watts stream for: " + activity, e);
                activity.setSyncError(manifest, e);
            }
        }
        if (activity.get('peaksExclude')) {
            continue;
        }
        let watts;
        let estimate;
        if (createEstPeaks && streams.watts_calc) {
            watts = streams.watts_calc;
            estimate = true;
        }
        if (!disableRunWatts && streams.watts) {
            watts = streams.watts;
            estimate = false;
        }
        if (watts) {
            try {
                for (const period of periods.filter(x => !!streams.watts || x >= minEstPeakPowerPeriod)) {
                    const rp = sauce.power.peakPower(period, streams.time, watts,
                        {activeStream: streams.active});
                    if (rp) {
                        const entry = sauce.peaks.createStoreEntry('power', period, rp.avg(),
                            rp, streams.time, activity, {estimate});
                        if (entry) {
                            upPeaks.push(entry);
                        }
                    }
                }
            } catch(e) {
                console.error("Failed to create peaks for: " + activity, e);
                activity.setSyncError(manifest, e);
            }
        }
    }
    await Promise.all([
        streamsStore.putMany(upStreams),
        peaksStore.putMany(upPeaks),
    ]);
}


export async function activityAthleteStatsProcessor({manifest, activities, athlete}) {
}


export async function activityStatsProcessor({manifest, activities, athlete}) {
    const actStreams = await getActivitiesStreams(activities,
        ['time', 'heartrate', 'active', 'watts', 'watts_calc', 'altitude', 'distance']);
    const hrZones = athlete.get('hrZones');
    const ltHR = hrZones && (hrZones.z4 + hrZones.z3) / 2;
    const maxHR = hrZones && sauce.perf.estimateMaxHR(hrZones);
    const rawAttrMap = {
        activeTime: 'moving_time_raw',
        distance: 'distance_raw',
        altitudeGain: 'elevation_gain_raw',
    };
    const upActs = [];
    let powerZones;
    let powerZonesFTP;
    const useEstWatts = activity =>
        (activity.data.basetype === 'run' && athlete.data.estRunWatts) ||
        (activity.data.basetype === 'ride' && athlete.data.estCyclingWatts);
    const disableRunWatts = athlete.data.disableRunWatts;
    for (const activity of activities) {
        const streams = actStreams.get(activity.pk);
        const stats = {};
        for (const [statKey, rawKey] of Object.entries(rawAttrMap)) {
            const rawVal = activity.get(rawKey);
            if (rawVal != null) {
                stats[statKey] = rawVal;
            }
        }
        if (streams.time && streams.active) {
            stats.activeTime = sauce.data.activeTime(streams.time, streams.active);
            if (streams.distance && stats.distance == null && streams.distance.length > 1) {
                stats.distance = streams.distance[streams.distance.length - 1] - streams.distance[0];
            }
            const ftp = athlete.getFTPAt(activity.get('ts'));
            if (streams.heartrate && hrZones) {
                try {
                    const restingHR = ftp ? sauce.perf.estimateRestingHR(ftp) : 60;
                    stats.tTss = sauce.perf.tTSS(streams.heartrate, streams.time, streams.active,
                        ltHR, restingHR, maxHR, athlete.get('gender'));
                    const zones = {...hrZones, z5: Infinity}; // Z5 was always just implied.
                    stats.hrZonesTime = Object.keys(zones).map(() => 0);
                    let prevT;
                    for (const [i, hr] of streams.heartrate.entries()) {
                        const active = streams.active[i];
                        const t = streams.time[i];
                        const gap = t - prevT;
                        prevT = t;
                        if (gap && gap > 0 && hr && active) {
                            // Unrolled for speed.
                            if (hr <= zones.z1) {
                                stats.hrZonesTime[0] += gap;
                            } else if (hr <= zones.z2) {
                                stats.hrZonesTime[1] += gap;
                            } else if (hr <= zones.z3) {
                                stats.hrZonesTime[2] += gap;
                            } else if (hr <= zones.z4) {
                                stats.hrZonesTime[3] += gap;
                            } else if (hr <= zones.z5) {
                                stats.hrZonesTime[4] += gap;
                            } else {
                                throw new TypeError("Unexpected power zone");
                            }
                        }
                    }
                } catch(e) {
                    activity.setSyncError(manifest, e);
                    continue;
                }
            }
            if (streams.altitude && stats.altitudeGain == null) {
                stats.altitudeGain = sauce.geo.altitudeChanges(streams.altitude).gain;
            }
            let estimate = false;
            let watts = activity.data.basetype !== 'run' && !disableRunWatts ? streams.watts : undefined;
            if (!watts && useEstWatts(activity)) {
                watts = streams.watts_calc;
                estimate = true;
            }
            if (watts) {
                try {
                    const corrected = sauce.power.correctedPower(streams.time, watts,
                        {activeStream: streams.active});
                    if (!corrected) {
                        continue;
                    }
                    stats.estimate = estimate;
                    stats.kj = corrected.joules() / 1000;
                    stats.power = corrected.avg({active: true});
                    if (!stats.estimate) {
                        stats.np = corrected.np();
                        stats.xp = corrected.xp();
                    }
                    if (ftp) {
                        if (ftp !== powerZonesFTP) {
                            powerZones = sauce.power.cogganZones(ftp);
                            powerZonesFTP = ftp;
                        }
                        stats.powerZonesTime = Object.keys(powerZones).map(() => 0);
                        let prevT;
                        // Use internal interface for iteration as it's much faster on FF.
                        for (let i = corrected._offt; i < corrected._length; i++) {
                            const t = corrected._times[i];
                            const w = corrected._values[i];
                            const gap = t - prevT;
                            prevT = t;
                            if (gap && gap > 0 && w) {  // !!w is because z1 is "active" recovery
                                // Unrolled for speed, make sure we have enough for all systems.
                                if (w <= powerZones.z1) {
                                    stats.powerZonesTime[0] += gap;
                                } else if (w <= powerZones.z2) {
                                    stats.powerZonesTime[1] += gap;
                                } else if (w <= powerZones.z3) {
                                    stats.powerZonesTime[2] += gap;
                                } else if (w <= powerZones.z4) {
                                    stats.powerZonesTime[3] += gap;
                                } else if (w <= powerZones.z5) {
                                    stats.powerZonesTime[4] += gap;
                                } else if (w <= powerZones.z6) {
                                    stats.powerZonesTime[5] += gap;
                                } else if (w <= powerZones.z7) {
                                    stats.powerZonesTime[6] += gap;
                                } else {
                                    throw new TypeError("Unexpected power zone");
                                }
                            }
                        }
                        stats.tss = sauce.power.calcTSS(stats.np || stats.power, stats.activeTime, ftp);
                        stats.intensity = (stats.np || stats.power) / ftp;
                    }
                } catch(e) {
                    activity.setSyncError(manifest, e);
                    continue;
                }
            }
        }
        const prevStats = activity.get('stats');
        if ((prevStats && JSON.stringify(prevStats)) !== (stats && JSON.stringify(stats))) {
            upActs.push(activity);
            activity.set({stats});
        }
    }
    await actsStore.saveModels(upActs);
}


function rankUpdated(a, b) {
    return (a && a.level || null) !== (b && b.level || null);
}


export async function peaksFinalizerProcessor({manifest, activities, athlete}) {
    // Add/update w/kg peaks and do cleanup for unused entries.
    const ids = activities.map(x => x.pk);
    const [wkgs, powers, nps, xps, paces, gaps, hrs] = await Promise.all([
        peaksStore.getForActivities(ids, {type: 'power_wkg', _skipClone: true, _skipCache: true}),
        peaksStore.getForActivities(ids, {type: 'power', _skipClone: true, _skipCache: true}),
        peaksStore.getForActivities(ids, {type: 'np', _skipClone: true, _skipCache: true}),
        peaksStore.getForActivities(ids, {type: 'xp', _skipClone: true, _skipCache: true}),
        peaksStore.getForActivities(ids, {type: 'pace', _skipClone: true, _skipCache: true}),
        peaksStore.getForActivities(ids, {type: 'gap', _skipClone: true, _skipCache: true}),
        peaksStore.getForActivities(ids, {type: 'hr', _skipClone: true, _skipCache: true}),
    ]);
    const options = await sauce.storage.get('options');
    const disableNP = !!options['analysis-disable-np'];
    const disableXP = !!options['analysis-disable-xp'];
    const validPeriods = new Set((await sauce.peaks.getRanges('periods')).map(x => x.value));
    const validDistances = new Set((await sauce.peaks.getRanges('distances')).map(x => x.value));
    const gender = athlete.get('gender') || 'male';
    const getRankLevel = (period, p, wp, weight) => {
        const rank = sauce.power.rankLevel(period, p, wp, weight, gender);
        if (rank.level > 0) {
            return rank;
        }
    };
    const useEstPowerRunPeaks = athlete.data.estRunWatts && athlete.data.estRunPeaks;
    const useEstPowerCyclingPeaks = athlete.data.estCyclingWatts && athlete.data.estCyclingPeaks;
    const disableRunWatts = athlete.data.disableRunWatts;
    const allowEstPowerPeaks = actData =>
        (actData.basetype === 'run' && useEstPowerRunPeaks) ||
        (actData.basetype === 'ride' && useEstPowerCyclingPeaks);
    const upPeaks = [];
    const deleting = new Set();
    for (const [index, activity] of activities.entries()) {
        const actData = activity.data;
        const deleteEstimates = !allowEstPowerPeaks(actData);
        const deleteAll = actData.peaksExclude;

        // Cleanup: Remove estimated powers and/or obsolete periods/distances...
        for (const peaks of [powers, nps, xps, wkgs]) {
            for (const x of peaks[index]) {
                if (deleteAll ||
                    !validPeriods.has(x.period) ||
                    (deleteEstimates && x.estimate) ||
                    (disableRunWatts && actData.basetype === 'run' && !x.estimate) ||
                    (x.estimate && x.period < minEstPeakPowerPeriod) ||
                    (peaks === nps && x.period < sauce.power.npMinTime) ||
                    (peaks === xps && x.period < sauce.power.xpMinTime) ||
                    (peaks === nps && disableNP) ||
                    (peaks === xps && disableXP)) {
                    deleting.add(x);
                }
            }
        }
        for (const x of hrs[index]) {
            if (deleteAll || !validPeriods.has(x.period)) {
                deleting.add(x);
            }
        }
        for (const peaks of [paces, gaps]) {
            for (const x of peaks[index]) {
                if (deleteAll || !validDistances.has(x.period)) {
                    deleting.add(x);
                }
            }
        }

        // Addendum: Update ranks and power_wkg where applicable...
        const weight = athlete.getWeightAt(actData.ts);
        if (!weight) {
            continue;
        }
        const isRide = actData.basetype === 'ride';
        for (const x of powers[index]) {
            if (deleting.has(x)) {
                continue;
            }
            const rankLevel = isRide ? getRankLevel(x.activeTime, x.value, x.wp, weight) : undefined;
            const wkgPeak = {...x, rankLevel, type: 'power_wkg', value: x.value / weight};
            if (rankUpdated(rankLevel, x.rankLevel)) {
                upPeaks.push({...x, rankLevel}, wkgPeak);
            } else {
                // Even if rank didn't change we could have a wkg change..
                const existing = wkgs[index].find(xx => xx.period === x.period);
                if (!existing ||
                    (existing.value !== wkgPeak.value ||
                     rankUpdated(rankLevel, existing.rankLevel))) {
                    if (deleting.has(existing)) {
                        deleting.delete(existing);  // legacy value, but we're overwriting it.
                    }
                    upPeaks.push(wkgPeak);
                }
            }
        }
        for (const x of [...nps[index], ...xps[index]]) {
            if (deleting.has(x)) {
                continue;
            }
            const rankLevel = isRide ? getRankLevel(x.activeTime, x.power, x.value, weight) : undefined;
            if (rankUpdated(rankLevel, x.rankLevel)) {
                upPeaks.push({...x, rankLevel});
            }
        }
    }
    if (deleting.size) {
        console.warn("Cleaning up obsolete peaks:", deleting.size);
        await peaksStore.deleteMany(Array.from(deleting).map(x => [x.activity, x.type, x.period]));
    }
    if (upPeaks.length) {
        console.info("Adding/updating peaks:", upPeaks.length);
        await peaksStore.putMany(upPeaks);
    }
}


export class PeaksProcessor extends OffloadProcessor {

    constructor(...args) {
        super(...args);
    }

    async processor() {
        this.periods = (await sauce.peaks.getRanges('periods')).map(x => x.value);
        this.distances = (await sauce.peaks.getRanges('distances')).map(x => x.value);
        const options = await sauce.storage.get('options');
        this.disableNP = !!options['analysis-disable-np'];
        this.disableXP = !!options['analysis-disable-xp'];
        this.useEstWatts = this.athlete.get('estCyclingWatts') && this.athlete.get('estCyclingPeaks');
        // NOTE: The spec requires that 8 is the max mem value returned, so this is
        // just a low mem device check at best.
        const maxBatch = navigator.deviceMemory < 8 ? 20 : 50;
        while (!this.stopping) {
            const activities = await this.getAllIncoming();
            if (!activities) {
                continue;
            }
            const jobs = [];
            for (let i = 0; i < activities.length;) {
                const batch = activities.slice(i, (i += maxBatch));
                jobs.push(this._process(batch.map(x => x.data)).then(() => this.putFinished(batch)));
                jobs.at(-1).batch = batch.length;
            }
            console.error("JOBS", jobs);
            await Promise.all(jobs);
        }
    }

    getRankLevel(period, p, wp, weight) {
        const rank = sauce.power.rankLevel(period, p, wp, weight, this.gender);
        if (rank.level > 0) {
            return rank;
        }
    }

    async _process(activities) {
        const s = Date.now();
        const peaks = await offscreenProxy.invoke('peaksProcessor', this.athlete.data, activities, {
            periods: this.periods,
            distances: this.distances,
            disableNP: this.disableNP,
            disableXP: this.disableXP,
            useEstWatts: this.useEstWatts,
        });
        console.info("back from offscreen/worker ...", Date.now() - s, peaks);
        await peaksStore.putMany(peaks);
    }
}

export class PeaksProcessorNoWorkerSupport extends OffloadProcessor {

    constructor(...args) {
        super(...args);
        this.useEstWatts = this.athlete.get('estCyclingWatts') && this.athlete.get('estCyclingPeaks');
        this.gender = this.athlete.get('gender') || 'male';
    }

    async processor() {
        this.periods = (await sauce.peaks.getRanges('periods')).map(x => x.value);
        this.distances = (await sauce.peaks.getRanges('distances')).map(x => x.value);
        const options = await sauce.storage.get('options');
        this.disableNP = !!options['analysis-disable-np'];
        this.disableXP = !!options['analysis-disable-xp'];
        // NOTE: The spec requires that 8 is the max mem value returned, so this is
        // just a low mem device check at best.
        const maxBatch = navigator.deviceMemory < 8 ? 20 : 50;
        while (!this.stopping) {
            const activities = await this.getAllIncoming();
            if (!activities) {
                continue;
            }
            for (let i = 0; i < activities.length;) {
                const batch = activities.slice(i, (i += maxBatch));
                await this._process(batch);
                this.putFinished(batch);
            }
        }
    }

    getRankLevel(period, p, wp, weight) {
        const rank = sauce.power.rankLevel(period, p, wp, weight, this.gender);
        if (rank.level > 0) {
            return rank;
        }
    }

    async _process(activities) {
        const actStreams = await getActivitiesStreams(activities, {
            run: ['time', 'active', 'heartrate', 'distance', 'grade_adjusted_distance'],
            ride: ['time', 'active', 'heartrate', 'watts', 'watts_calc'].filter(x =>
                x !== 'watts_calc' || this.useEstWatts),
            other: ['time', 'active', 'heartrate', 'watts'],
        });
        const upPeaks = [];
        for (const activity of activities) {
            if (activity.get('peaksExclude')) {
                continue;  // cleanup happens in finalizer proc.
            }
            const streams = actStreams.get(activity.pk);
            if (!streams.time) {
                continue;
            }
            const basetype = activity.get('basetype');
            const isRun = basetype === 'run';
            const isRide = basetype === 'ride';
            const wattsStream = streams.watts || streams.watts_calc;
            const estPower = !streams.watts;
            const totalTime = streams.time[streams.time.length - 1] - streams.time[0];
            const weight = this.athlete.getWeightAt(activity.get('ts'));
            const addPeak = (a1, a2, a3, a4, extra) => {
                const entry = sauce.peaks.createStoreEntry(a1, a2, a3, a4, streams.time, activity, extra);
                if (entry) {
                    upPeaks.push(entry);
                }
            };

            // Prepare the rolls and periodized rolls [cheap]...
            let paceRoll, gapRoll, powerRoll, hrRoll;
            const hrPeriods = [];
            const pacePeriods = [];
            const gapPeriods = [];
            const powerPeriods = [];

            if (streams.heartrate) {
                hrRoll = sauce.data.correctedRollingAverage(streams.time, null,
                    {active: true, ignoreZeros: true});
                if (hrRoll) {
                    for (const period of this.periods) {
                        if (period <= totalTime) {
                            hrPeriods.push({roll: hrRoll.clone({period})});
                        }
                    }
                }
            }
            if (isRun) {
                if (streams.distance) {
                    const gad = streams.grade_adjusted_distance;
                    paceRoll = new sauce.pace.RollingPace();
                    gapRoll = gad && new sauce.pace.RollingPace();
                    for (const period of this.distances) {
                        if (period <= streams.distance[streams.distance.length - 1]) {
                            pacePeriods.push({roll: paceRoll.clone({period})});
                        }
                        if (gad && period <= gad[gad.length - 1]) {
                            gapPeriods.push({roll: gapRoll.clone({period})});
                        }
                    }
                }
            } else if (wattsStream) {  // Runs have their own processor for peak power
                powerRoll = sauce.power.correctedRollingPower(streams.time, null,
                    {inlineNP: !estPower && !this.disableNP, inlineXP: !estPower && !this.disableXP});
                if (powerRoll) {
                    for (const period of this.periods) {
                        if (period > totalTime || (estPower && period < minEstPeakPowerPeriod)) {
                            continue;
                        }
                        const inlineNP = !estPower && !this.disableNP && period >= sauce.power.npMinTime;
                        const inlineXP = !estPower && !this.disableXP && period >= sauce.power.xpMinTime;
                        let weightedRoll;
                        if (inlineNP || inlineXP) {
                            weightedRoll = powerRoll.clone({period, inlineNP, inlineXP, active: true});
                            weightedRoll.hasNP = inlineNP;
                            weightedRoll.hasXP = inlineXP;
                        }
                        powerPeriods.push({
                            roll: powerRoll.clone({period, inlineNP: false, inlineXP: false}),
                            weightedRoll
                        });
                    }
                }
            }

            // Do the calcs [expensive]...
            for (let i = 0; i < streams.time.length; i++) {
                const t = streams.time[i];
                const a = streams.active[i];
                if (hrRoll) {
                    hrRoll.add(t, streams.heartrate[i], a);
                    for (let i = 0; i < hrPeriods.length; i++) {
                        const x = hrPeriods[i];
                        if (t < x.roll.period) {
                            // continue; // XXX
                        }
                        x.roll.resize();
                        if (x.roll.full()) {
                            const value = x.roll.avg();
                            if (value && (!x.leader || value >= x.leader.value)) {
                                x.leader = {roll: x.roll.clone(), value};
                            }
                        }
                    }
                }
                if (powerRoll) {
                    powerRoll.add(t, wattsStream[i], a);
                    const cloneOpts = {inlineNP: false, inlineXP: false};
                    for (let i = 0; i < powerPeriods.length; i++) {
                        const x = powerPeriods[i];
                        if (t < x.roll.period) {
                            // continue; // XXX
                        }
                        const wr = x.weightedRoll;
                        let np;
                        if (wr) {
                            wr.resize();
                            if (wr.full()) {
                                np = wr.hasNP && wr.period >= sauce.power.npMinTime && wr.np();
                                if (np && (!x.npLeader || np >= x.npLeader.value)) {
                                    x.npLeader = {roll: wr.clone(cloneOpts), value: np};
                                }
                                const xp = wr.hasXP && wr.period >= sauce.power.xpMinTime && wr.xp();
                                if (xp && (!x.xpLeader || xp >= x.xpLeader.value)) {
                                    x.xpLeader = {roll: wr.clone(cloneOpts), value: xp};
                                }
                            }
                        }
                        x.roll.resize();
                        if (x.roll.full()) {
                            const power = x.roll.avg();
                            if (power && (!x.leader || power >= x.leader.value)) {
                                x.leader = {roll: x.roll.clone(cloneOpts), value: power, np};
                            }
                        }
                    }
                }
                if (paceRoll) {
                    paceRoll.add(t, streams.distance[i]);
                    for (let i = 0; i < pacePeriods.length; i++) {
                        const x = pacePeriods[i];
                        if (streams.distance[i] < x.roll.period) {
                            // continue; // XXX
                        }
                        x.roll.resize();
                        if (x.roll.full()) {
                            const value = x.roll.avg();
                            if (value && (!x.leader || value >= x.leader.value)) {
                                x.leader = {roll: x.roll.clone(), value};
                            }
                        }
                    }
                    if (gapRoll) {
                        gapRoll.add(t, streams.grade_adjusted_distance[i]);
                        for (let i = 0; i < gapPeriods.length; i++) {
                            const x = gapPeriods[i];
                            if (streams.grade_adjusted_distance[i] < x.roll.period) {
                                // continue; // XXX
                            }
                            x.roll.resize();
                            if (x.roll.full()) {
                                const value = x.roll.avg();
                                if (value && (!x.leader || value >= x.leader.value)) {
                                    x.leader = {roll: x.roll.clone(), value};
                                }
                            }
                        }
                    }
                }
            }

            // Queue the final leaders for save...
            for (const x of hrPeriods) {
                if (x.leader) {
                    addPeak('hr', x.roll.period, x.leader.value, x.leader.roll);
                }
            }
            for (const x of powerPeriods) {
                if (x.leader) {
                    const l = x.leader;
                    const rankLevel = isRide ?
                        this.getRankLevel(l.roll.active(), l.value, l.np, weight) :
                        undefined;
                    addPeak('power', x.roll.period, l.value, l.roll,
                        {wp: l.np, estimate: estPower, rankLevel});
                }
                if (x.npLeader) {
                    const l = x.npLeader;
                    const power = l.roll.avg({active: false});
                    const rankLevel = isRide ?
                        this.getRankLevel(l.roll.active(), power, l.value, weight) :
                        undefined;
                    addPeak('np', x.roll.period, l.value, l.roll,
                        {power, estimate: estPower, rankLevel});
                }
                if (x.xpLeader) {
                    const l = x.xpLeader;
                    // XP is more sensitive to leading data variance, so use external for consistency
                    // with other UI that doesn't have leading context and must use external method.
                    const xp = l.roll.xp({external: true});
                    const power = l.roll.avg({active: false});
                    const rankLevel = isRide ?
                        this.getRankLevel(l.roll.active(), power, xp, weight) :
                        undefined;
                    addPeak('xp', x.roll.period, xp, l.roll, {power, estimate: estPower, rankLevel});
                }
            }
            for (const x of pacePeriods) {
                if (x.leader) {
                    addPeak('pace', x.roll.period, x.leader.value, x.leader.roll);
                }
            }
            for (const x of gapPeriods) {
                if (x.leader) {
                    addPeak('gap', x.roll.period, x.leader.value, x.leader.roll);
                }
            }
        }
        await peaksStore.putMany(upPeaks);
    }
}


export class TrainingLoadProcessor extends OffloadProcessor {
    constructor(...args) {
        super(...args);
        this.completedWith = new Map();
    }

    async processor() {
        const minWait = 1 * 1000; // Throttles high ingest rate.
        const maxSize = 50; // Controls max batching during high ingest rate.
        const maxWait = 30 * 1000; // Controls latency
        while (!this.stopping) {
            const activities = await this.getAllIncoming({minWait, maxWait, maxSize});
            if (activities) {
                activities.sort((a, b) => a.get('ts') - b.get('ts'));  // oldest -> newest
                await this._process(activities);
                this.putFinished(activities);
            }
        }
    }

    async _process(batch) {
        let oldest = batch[0];
        const activities = new Map();
        const external = new Set();
        let unseen = 0;
        for (const a of batch) {
            activities.set(a.pk, a);
            if (!this.completedWith.has(a.pk)) {
                unseen++;
            } else {
                const priorTSS = this.completedWith.get(a.pk);
                if (a.getTSS() !== priorTSS) {
                    unseen++;
                }
            }
        }
        if (!unseen) {
            return;
        }
        const orderedIds = await actsStore.getAllKeysForAthlete(this.athlete.pk,
            {start: oldest.get('ts')});
        const need = orderedIds.filter(x => !activities.has(x));
        for (const a of await actsStore.getMany(need, {models: true})) {
            activities.set(a.pk, a);
            external.add(a);
        }
        const ordered = orderedIds.map(x => activities.get(x)).filter(x => x);
        let atl = 0;
        let ctl = 0;
        let seed;
        // Rewind until we find a valid seed record from a prior day...
        for await (const a of actsStore.siblings(oldest, {models: true, direction: 'prev'})) {
            if (a.getLocaleDay().getTime() !== oldest.getLocaleDay().getTime()) {
                const tl = a.get('training');
                if (!tl) {
                    oldest = a;
                    ordered.unshift(a);
                    activities.set(a.pk, a);
                    external.add(a);
                    continue;  // Keep searching backwards until we find a valid activity.
                } else {
                    seed = a;
                    atl = tl.atl || 0;
                    ctl = tl.ctl || 0;
                    break;
                }
            } else if (a.pk !== oldest.pk) {
                // Prior activity is same day as oldest in this set, we must lump it in.
                oldest = a;
                ordered.unshift(a);
                activities.set(a.pk, a);
                external.add(a);
            } else {
                throw new TypeError("Internal Error: sibling search produced non sensical result");
            }
        }
        console.debug("Processing training load for", activities.size, 'activities');
        if (seed) {
            // Drain the current training loads based on gap to our first entry
            const zeros = Array.from(sauce.date.dayRange(seed.getLocaleDay(),
                oldest.getLocaleDay())).map(x => 0);
            zeros.pop();  // Exclude seed day.
            if (zeros.length) {
                atl = sauce.perf.calcATL(zeros, atl);
                ctl = sauce.perf.calcCTL(zeros, ctl);
            }
        }
        let i = 0;
        // dayRange is end-exclusive so to handle activities starting at midnight add 1 ms.
        const beyondNewestTS = ordered[ordered.length - 1].get('ts') + 1;
        for (const day of sauce.date.dayRange(oldest.getLocaleDay(), beyondNewestTS)) {
            if (i >= ordered.length) {
                break;
            }
            const daily = [];
            let tss = 0;
            while (i < ordered.length && ordered[i].getLocaleDay().getTime() === day.getTime()) {
                const act = ordered[i++];
                daily.push(act);
                const actTSS = act.getTSS();
                tss += actTSS || 0;
                this.completedWith.set(act.pk, actTSS);
            }
            atl = sauce.perf.calcATL([tss], atl);
            ctl = sauce.perf.calcCTL([tss], ctl);
            for (const x of daily) {
                x.set('training', {atl, ctl});
            }
        }
        if (i < ordered.length) {
            console.error(`Training day bucket error: ${i}, ${ordered.length}, ` +
                `${beyondNewestTS} ${oldest.get('ts')}`);
        }
        await actsStore.saveModels(external);
    }
}
