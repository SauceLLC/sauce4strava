/* global sauce */

import * as queues from '/src/common/jscoop/queues.mjs';
import * as locks from '/src/common/jscoop/locks.mjs';
import * as db from './db.mjs';
import {specialProxy, invalidateAthleteSyncState} from '../hist.mjs';
import {peaksProcessor} from './peaks.mjs';

const actsStore = db.ActivitiesStore.singleton();
const peaksStore = db.PeaksStore.singleton();
const streamsStore = db.StreamsStore.singleton();

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
    const getStreams = streamsStore.getMany(streamKeys);
    for (const x of await withTimeout(getStreams, 180000)) {
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
            await Promise.race([stop, dataWait, this._flushEvent.wait(), ...timeouts]);
            const moreData = dataWait.done();
            if (!moreData) {
                dataWait.cancel();
            }
            if (this._stopEvent.isSet()) {
                return;
            }
            const size = this._incoming.size;
            const flush = this._flushEvent.isSet();
            if (flush) {
                this._flushEvent.clear();
                if (!size) {
                    // We're just waiting for out-of-band work to finish.
                    continue;
                }
            } else if (moreData && size < maxSize && Date.now() < deadline) {
                // We are still within the constraints and have a positive ingest rate.
                // Continue waiting for stagnation or other events.
                continue;
            }
            deadline = maxWait && Date.now() + maxWait;
            if (!size) {
                continue;
            }
            const items = this._incoming.getAllNoWait();
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
        throw new TypeError("Pure virtual method");
    }
}


export async function athleteSettingsProcessor({manifest, activities, athlete}) {
    let invalidate;
    // The HR zones API is based on activities, so technically it is historical but
    // this leads to a lot of complications so we simply look for the latest values.
    // If the zones are updated we need to trigger an invalidation of all activities.
    const hrTS = athlete.get('hrZonesTS');
    const hrZones = athlete.get('hrZones');
    const hrHash = hrZones ? JSON.stringify(hrZones) : null;
    // Ignore argument based activities for HR zones.  We only care about latest and
    // want to avoid spurious invalidations if processing from oldest to newest i.e. a recompute.
    // We'll mark activities as we go and only attempt a few fetches to spread out the work
    // in case the athlete has thousands of activities without HR.
    let remainingFetches = 10;
    let activity = await actsStore.getNewestForAthlete(athlete.pk, {model: true});
    while (remainingFetches && activity) {
        if (hrTS && activity.get('ts') <= hrTS) {
            break;
        }
        let zones = activity.get('hrZones');
        if (zones === undefined) {
            remainingFetches--;
            zones = await sauce.perf.fetchHRZones(activity.pk);
            await activity.save({hrZones: zones || null});
        }
        if (zones) {
            if (JSON.stringify(zones) !== hrHash) {
                athlete.set('hrZones', zones);
                invalidate = true;
            }
            athlete.set('hrZonesTS', activity.get('ts'));
            await athlete.save();
            break;
        }
        activity = await actsStore.getPrevSibling(activity, {model: true});
    }

    const gender = athlete.get('gender');
    if (!gender) {
        let remainingFetches = 5;
        for (const activity of activities) {
            const gender = await sauce.perf.fetchPeerGender(activity.pk);
            if (gender) {
                await athlete.save({gender});
                invalidate = true;
                break;
            }
            if (!--remainingFetches) {
                console.warn("Unable to to learn gender");
                break;
            }
        }
    }

    if (invalidate) {
        console.info("Athlete settings updated for:", athlete.pk, athlete.get('name'));
        invalidateAthleteSyncState(athlete.pk, manifest.processor, manifest.name).catch(e =>
            console.error("Failed to force resync during athlete settings update:", e));
    }
}


export async function extraStreamsProcessor({manifest, activities, athlete}) {
    const actStreams = await getActivitiesStreams(activities, [
        'time', 'moving', 'active', 'cadence', 'watts', 'watts_calc', 'distance', 'grade_adjusted_distance']);
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
                        activity.setManifestSyncError(manifest, e);
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
            activity.setManifestSyncError(manifest, e);
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
    const actStreams = await getActivitiesStreams(activities, [
        'time', 'active', 'watts', 'watts_calc', 'grade_adjusted_distance']);
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
                activity.setManifestSyncError(manifest, e);
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
                activity.setManifestSyncError(manifest, e);
            }
        }
    }
    await Promise.all([
        streamsStore.putMany(upStreams),
        peaksStore.putMany(upPeaks),
    ]);
}


export async function activityStatsProcessor({manifest, activities, athlete}) {
    const actStreams = await getActivitiesStreams(activities, [
        'time', 'heartrate', 'active', 'watts', 'watts_calc', 'altitude', 'distance']);
    const hrZones = athlete.get('hrZones');
    const ltHR = hrZones && (hrZones.z4 + hrZones.z3) / 2;
    const maxHR = hrZones && sauce.perf.estimateMaxHR(hrZones);
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
        if (streams.time && streams.active) {
            stats.activeTime = sauce.data.activeTime(streams.time, streams.active);
            if (streams.distance && stats.distance == null && streams.distance.length > 1) {
                stats.distance = streams.distance[streams.distance.length - 1] - streams.distance[0];
            }
            const ftp = athlete.getFTPAt(activity.get('ts'), activity.get('basetype'));
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
                    activity.setManifestSyncError(manifest, e);
                    continue;
                }
            }
            stats.activeTime = sauce.data.activeTime(streams.time, streams.active);
            if (streams.altitude && stats.altitudeGain == null) {
                // Be consistent with analysis stats...
                const smoothing = 12;
                let altStream;
                if (streams.altitude.length > smoothing * 2) {
                    altStream = sauce.data.smooth(smoothing, streams.altitude);
                } else {
                    altStream = streams.altitude;
                }
                stats.altitudeGain = sauce.geo.altitudeChanges(altStream).gain;
            }
            let estimate = false;
            let watts = streams.watts;
            if (watts && activity.data.basetype === 'run' && disableRunWatts) {
                watts = undefined;
            }
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
                            const w = +corrected._values[i];
                            const gap = t - prevT;
                            prevT = t;
                            if (gap && gap > 0 && w) {
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
                    activity.setManifestSyncError(manifest, e);
                    continue;
                }
            }
        } else if (activity.get('statsFallback')) {
            Object.assign(stats, activity.get('statsFallback'));
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
        peaksStore.getForActivities(ids, {type: 'power_wkg'}),
        peaksStore.getForActivities(ids, {type: 'power'}),
        peaksStore.getForActivities(ids, {type: 'np'}),
        peaksStore.getForActivities(ids, {type: 'xp'}),
        peaksStore.getForActivities(ids, {type: 'pace'}),
        peaksStore.getForActivities(ids, {type: 'gap'}),
        peaksStore.getForActivities(ids, {type: 'hr'}),
    ]);
    const disableNP = !!sauce.options['analysis-disable-np'];
    const disableXP = !!sauce.options['analysis-disable-xp'];
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
    async processor() {
        this.options = {
            periods: (await sauce.peaks.getRanges('periods')).map(x => x.value),
            distances: (await sauce.peaks.getRanges('distances')).map(x => x.value),
            disableNP: !!sauce.options['analysis-disable-np'],
            disableXP: !!sauce.options['analysis-disable-xp'],
            useEstWatts: this.athlete.get('estCyclingWatts') && this.athlete.get('estCyclingPeaks'),
        };
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
            }
            await Promise.all(jobs);
        }
    }

    async _process(activities) {
        const peaks = await specialProxy.peaksProcessor(this.athlete.data, activities, this.options);
        await peaksStore.putMany(peaks);
    }
}


export class PeaksProcessorNoWorkerSupport extends OffloadProcessor {
    async processor() {
        this.useEstWatts = this.athlete.get('estCyclingWatts') && this.athlete.get('estCyclingPeaks');
        this.options = {
            periods: (await sauce.peaks.getRanges('periods')).map(x => x.value),
            distances: (await sauce.peaks.getRanges('distances')).map(x => x.value),
            disableNP: !!sauce.options['analysis-disable-np'],
            disableXP: !!sauce.options['analysis-disable-xp'],
        };
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

    async _process(activities) {
        const streams = await getActivitiesStreams(activities, {
            run: ['time', 'active', 'heartrate', 'distance', 'grade_adjusted_distance'],
            ride: ['time', 'active', 'heartrate', 'watts', 'watts_calc'].filter(x =>
                x !== 'watts_calc' || this.useEstWatts),
            other: ['time', 'active', 'heartrate', 'watts'],
        });
        const upPeaks = peaksProcessor(streams, this.athlete.data, activities.map(x => x.data), this.options);
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
