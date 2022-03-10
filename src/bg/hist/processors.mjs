/* global sauce, browser */

import * as queues from '/src/common/jscoop/queues.mjs';
import * as futures from '/src/common/jscoop/futures.mjs';
import * as locks from '/src/common/jscoop/locks.mjs';

const actsStore = sauce.hist.db.ActivitiesStore.singleton();
const peaksStore = sauce.hist.db.PeaksStore.singleton();
const streamsStore = sauce.hist.db.StreamsStore.singleton();


async function getActivitiesStreams(activities, streams) {
    const streamKeys = [];
    const actStreams = new Map();
    for (const a of activities) {
        for (const stream of streams) {
            streamKeys.push([a.pk, stream]);
        }
        actStreams.set(a.pk, {});
    }
    for (const x of await streamsStore.getMany(streamKeys, {_skipClone: true, _skipCache: true})) {
        if (x) {
            actStreams.get(x.activity)[x.stream] = x.data;
        }
    }
    return actStreams;
}


class WorkerInterface {
    constructor({id, worker, executor}) {
        this.id = id;
        const sendCh = new MessageChannel();
        const recvCh = new MessageChannel();
        [this._outgoingPort, this._theirIncomingPort] = [sendCh.port1, sendCh.port2];
        [this._incomingPort, this._theirOutgoingPort] = [recvCh.port1, recvCh.port2];
        this._worker = worker;
        this._executor = executor;
        this._seq = 1;
        this._sending = new Map();
        this.doneQueue = new queues.Queue();
        this._outgoingPort.addEventListener('message', ev => this._onSendAck(ev.data));
        this._incomingPort.addEventListener('message', ev => this.doneQueue.put(ev.data));
    }

    start(processor, options={}) {
        this._worker.postMessage({
            id: this.id,
            processor,
            op: 'start',
            incomingPort: this._theirIncomingPort,
            outgoingPort: this._theirOutgoingPort,
            ...options,
        }, [this._theirIncomingPort, this._theirOutgoingPort]);
        this._outgoingPort.start();
        this._incomingPort.start();
    }

    _onSendAck({seq, success, error}) {
        const {resolve, reject} = this._sending.get(seq);
        this._sending.delete(seq);
        if (success) {
            resolve();
        } else {
            reject(error);
        }
    }

    async _send(op, {data, timeout}) {
        const seq = this._seq++;
        let resolve, reject;
        const p = new Promise((_res, _rej) => (resolve = _res, reject = _rej));
        this._sending.set(seq, {resolve, reject});
        this._outgoingPort.postMessage({
            seq,
            op,
            data,
            ts: Date.now()
        });
        const TIMEOUT = new Object();
        if (timeout) {
            const r = await Promise.race([p, sauce.sleep(timeout).then(() => TIMEOUT)]);
            if (Object.is(r, TIMEOUT)) {
                throw new Error("timeout");
            }
            return r;
        } else {
            return await p;
        }
    }

    async sendData(data, timeout=300000) {
        return await this._send('data', {data, timeout});
    }

    detach() {
        this._outgoingPort.close();
        this._incomingPort.close();
        this._executor = null;
        this._worker = null;
    }

    async stop() {
        try {
            await this._send('stop', {timeout: 600000});
        } finally {
            if (this._executor) {
                this._executor.free(this);
            }
        }
    }
}


class WorkerExecutor {
    constructor(url, options={}) {
        this.url = url;
        this.maxWorkers = options.maxWorkers || (navigator.hardwareConcurrency * 2 || 8);
        this._sem = new locks.Semaphore(this.maxWorkers);
        this._id = 0;
        this._idle = new Set();
    }

    _make() {
        const worker = new Worker(this.url);
        worker.addEventListener('error', ev => {
            sauce.report.error(new Error(`Generic worker error: ${ev.message}`));
            // Being pretty paranoid here, just cover all the states as if
            // we had programming errors for now.
            if (worker._wi) {
                worker._wi.detach();
                worker._wi = null;
                this._sem.release();
            }
            if (this._idle.has(worker)) {
                this._idle.delete(worker);
            }
            if (worker._gc) {
                clearTimeout(worker._gc);
            }
            worker.terminate();
        });
        return worker;
    }

    available() {
        return !this._sem.locked();
    }

    get() {
        const f = new futures.Future();
        const acquire = this._sem.acquire();
        f.addImmediateCallback(() => {
            if (f.cancelled()) {
                acquire.cancel();
            }
        });
        acquire.addImmediateCallback(() => {
            if (acquire.cancelled()) {
                return;
            }
            const id = this._id++;
            let worker;
            try {
                if (this._idle.size) {
                    worker = this._idle.values().next().value;
                    this._idle.delete(worker);
                    clearTimeout(worker._gc);
                } else {
                    worker = this._make();
                }
                worker._wi = new WorkerInterface({id, worker, executor: this});
                f.setResult(worker._wi);
            } catch(e) {
                this._sem.release();
                if (worker) {
                    worker.terminate();
                }
                f.setError(e);
            }
        });
        return f;
    }

    free(wi) {
        const worker = wi._worker;
        if (!worker) {
            return;  // already detached, probably by our error handler.
        }
        wi.detach();
        worker._gc = setTimeout(() => {
            this._idle.delete(worker);
            worker.terminate();
        }, 15000);
        worker._wi = null;
        this._idle.add(worker);
        this._sem.release();
    }
}

const workerExec = new WorkerExecutor(browser.runtime.getURL(`src/bg/hist/worker.js?version=${sauce.version}`));


export class OffloadProcessor extends futures.Future {
    constructor({manifest, athlete, cancelEvent}) {
        super();
        this.manifest = manifest;
        this.athlete = athlete;
        this._inflight = new Set();
        this._stopping = false;
        this._incoming = new queues.PriorityQueue();
        this._finished = new queues.Queue();
        this._flushEvent = new locks.Event();
        this._stopEvent = new locks.Event();
        cancelEvent.wait().then(() => this._stop());
    }

    start() {
        this._runProcessor();
    }

    flush() {
        this._flushEvent.set();
    }

    stop() {
        if (this._inflight.size || this._incoming.size || this._finished.size) {
            console.error("Premature stop of offload proc", this);
            debugger;
        }
        this._stop();
    }

    _stop() {
        this._stopping = true;
        this._stopEvent.set();
    }

    get pending() {
        return this._incoming.size + this._incoming._unfinishedTasks;
    }

    get available() {
        return this._finished.size;
    }

    drainAll() {
        if (!this._stopping) {
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
        if (this._stopping) {
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
        while (!this._stopping) {
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

    async _runProcessor() {
        try {
            await this.processor().finally(() => this._stopping = true);
            await this._incoming.join();
            this.setResult();
        } catch(e) {
            this.setError(e);
        }
    }

    async processor() {
        throw new TypeError("Pure virutal method");
        /* Subclass should keep this alive for the duration of their execution.
         * It is also their job to monitor flushEvent and stopEvent. */
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
                    sauce.report.error(new Error("Unable to to learn gender"));
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
            {noStreamsFetch: false}).catch(e => {
            console.error("Failed to force resync during athlete settings update:", e);
            sauce.report.error(e);
        });
    }
}


export async function extraStreamsProcessor({manifest, activities, athlete}) {
    const actStreams = await getActivitiesStreams(activities,
        ['time', 'moving', 'active', 'cadence', 'watts', 'watts_calc', 'distance',
         'grade_adjusted_distance']);
    const upStreams = [];
    const createRunWatts = athlete.get('estRunWatts');
    for (const activity of activities) {
        const streams = actStreams.get(activity.pk);
        if (!streams.moving) {
            continue;
        }
        const isTrainer = activity.get('trainer');
        const basetype = activity.get('basetype');
        const isSwim = basetype === 'swim';
        const isRun = basetype === 'run';
        if (isRun && createRunWatts) {
            const gad = streams.grade_adjusted_distance;
            const weight = athlete.getWeightAt(activity.get('ts'));
            if (gad && weight && streams.time.length > 25) {
                try {
                    const data = sauce.pace.createWattsStream(streams.time, gad, weight);
                    if (!sauce.data.isArrayEqual(data, streams.watts_calc)) {
                        streams.watts_calc = data;
                        upStreams.push({activity: activity.pk, athlete: athlete.pk, stream: 'watts_calc', data});
                    }
                } catch(e) {
                    debugger;
                    console.warn("Failed to create running watts stream for: " + activity, e);
                    activity.setSyncError(manifest, e);
                }
            }
        }
        try {
            const watts = streams.watts || (basetype === 'run' && streams.watts_calc) || undefined;
            const data = sauce.data.createActiveStream({...streams, watts}, {isTrainer, isSwim});
            if (!sauce.data.isArrayEqual(data, streams.active)) {
                upStreams.push({activity: activity.pk, athlete: athlete.pk, stream: 'active', data});
            }
        } catch(e) {
            debugger;
            console.warn("Failed to create active stream for: " + activity, e);
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
                debugger;
                console.warn("Failed to create running watts stream for: " + activity, e);
                activity.setSyncError(manifest, e);
            }
        }
        if ((streams.watts || (createEstPeaks && streams.watts_calc)) && !activity.get('peaksExclude')) {
            try {
                const watts = streams.watts || streams.watts_calc;
                for (const period of periods.filter(x => !!streams.watts || x >= 300)) {
                    const rp = sauce.power.peakPower(period, streams.time, watts,
                        {activeStream: streams.active});
                    if (rp) {
                        const entry = sauce.peaks.createStoreEntry('power', period, rp.avg(),
                            rp, streams.time, activity, {estimate: !streams.watts});
                        if (entry) {
                            upPeaks.push(entry);
                        }
                    }
                }
            } catch(e) {
                debugger;
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
                    const zones = {...hrZones, z5: Infinity}; // XXX Z5 was always just implied.
                    stats.hrZonesTime = Object.keys(zones).map(() => 0);
                    let prevT;
                    for (const [i, hr] of streams.heartrate.entries()) {
                        const active = streams.active[i];
                        const t = streams.time[i];
                        const gap = t - prevT;
                        prevT = t;
                        if (gap && gap > 0 && hr && active) {
                            // Unrolled for speed.
                            if (hr <= zones.z1) stats.hrZonesTime[0] += gap;
                            else if (hr <= zones.z2) stats.hrZonesTime[1] += gap;
                            else if (hr <= zones.z3) stats.hrZonesTime[2] += gap;
                            else if (hr <= zones.z4) stats.hrZonesTime[3] += gap;
                            else if (hr <= zones.z5) stats.hrZonesTime[4] += gap;
                            else throw new TypeError("Unexpected power zone");
                        }
                    }
                } catch(e) {
                    debugger;
                    activity.setSyncError(manifest, e);
                    continue;
                }
            }
            if (streams.altitude && stats.altitudeGain == null) {
                stats.altitudeGain = sauce.geo.altitudeChanges(streams.altitude).gain;
            }
            if (streams.watts || (streams.watts_calc && useEstWatts(activity))) {
                const watts = streams.watts || streams.watts_calc;
                try {
                    const corrected = sauce.power.correctedPower(streams.time, watts,
                        {activeStream: streams.active});
                    if (!corrected) {
                        continue;
                    }
                    stats.estimate = !streams.watts;
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
                                if (w <= powerZones.z1) stats.powerZonesTime[0] += gap;
                                else if (w <= powerZones.z2) stats.powerZonesTime[1] += gap;
                                else if (w <= powerZones.z3) stats.powerZonesTime[2] += gap;
                                else if (w <= powerZones.z4) stats.powerZonesTime[3] += gap;
                                else if (w <= powerZones.z5) stats.powerZonesTime[4] += gap;
                                else if (w <= powerZones.z6) stats.powerZonesTime[5] += gap;
                                else if (w <= powerZones.z7) stats.powerZonesTime[6] += gap;
                                else throw new TypeError("Unexpected power zone");
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
    const allowEstPowerPeaks = actData =>
        (actData.basetype === 'run' && useEstPowerRunPeaks) ||
        (actData.basetype === 'ride' && useEstPowerCyclingPeaks);
    const peaks = [];
    const deleting = new Set();
    for (const [index, activity] of activities.entries()) {
        const actData = activity.data;
        const deleteEstimates = !allowEstPowerPeaks(actData);
        const deleteAll = actData.peaksExclude;

        // Cleanup: Remove estimated powers and/or obsolete periods/distances...
        for (const peaks of [powers, nps, xps, wkgs]) {
            for (const x of peaks[index]) {
                // Handle legacy wkg entries via boolean requirement.
                if (deleteAll || (deleteEstimates && x.estimate !== false) || !validPeriods.has(x.period)) {
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
                peaks.push({...x, rankLevel}, wkgPeak);
            } else {
                // Even if rank didn't change we could have a wkg change..
                const existing = wkgs[index].find(xx => xx.period === x.period);
                if (!existing ||
                    (existing.value !== wkgPeak.value ||
                     rankUpdated(rankLevel, existing.rankLevel))) {
                    if (deleting.has(existing)) {
                        deleting.delete(existing);  // legacy value, but we're overwriting it.
                    }
                    peaks.push(wkgPeak);
                }
            }
        }
        for (const x of [...nps[index], ...xps[index]]) {
            if (deleting.has(x)) {
                continue;
            }
            const rankLevel = isRide ? getRankLevel(x.activeTime, x.power, x.value, weight) : undefined;
            if (rankUpdated(rankLevel, x.rankLevel)) {
                peaks.push({...x, rankLevel});
            }
        }
    }
    if (deleting.size) {
        console.warn("Cleaning up obsolete peaks:", deleting.size);
        await peaksStore.deleteMany(Array.from(deleting).map(x => [x.activity, x.type, x.period]));
    }
    if (peaks.length) {
        console.info("Adding/updating peaks:", peaks.length);
        await peaksStore.putMany(peaks);
    }
}


export class PeaksProcessor extends OffloadProcessor {
    constructor(...args) {
        super(...args);
        this.workers = new Set();
        this.workerAddedEvent = new locks.Event();
        this.maxWorkers = Math.min(navigator.hardwareConcurrency || 4);
    }

    drainWorkerResults() {
        for (const worker of this.workers) {
            for (const {done, errors} of worker.doneQueue.getAllNoWait()) {
                for (const x of errors) {
                    const act = worker.pending.get(x.activity);
                    act.setSyncError(this.manifest, new Error(x.error));
                }
                this.putFinished(done.map(x => {
                    const act = worker.pending.get(x);
                    worker.pending.delete(x);
                    return act;
                }));
            }
        }
    }

    async processor() {
        this.periods = (await sauce.peaks.getRanges('periods')).map(x => x.value);
        this.distances = (await sauce.peaks.getRanges('distances')).map(x => x.value);
        await this._consumer(this._producer());
    }

    async _producer() {
        while (!this._stopping) {
            const activities = await this.getAllIncoming();
            if (!activities) {
                continue;
            }
            const sending = [];
            for (let i = 0; i < activities.length;) {
                const worker = await this.getWorker();
                if (!worker) {
                    break; // stopping
                }
                const batch = activities.slice(i, (i += 50));
                for (const x of batch) {
                    worker.pending.set(x.pk, x);
                }
                sending.push(worker.sendData(batch.map(x => x.data)));
            }
            await Promise.all(sending);
        }
    }

    async _consumer(producer) {
        const stop = this._stopEvent.wait();
        while (!this._stopping) {
            const workers = Array.from(this.workers);
            if (!workers.some(x => x.doneQueue.size)) {
                const dataWaits = workers.map(x => x.doneQueue.wait());
                await Promise.race([...dataWaits, this.workerAddedEvent.wait(), stop]);
                this.workerAddedEvent.clear();
                for (const f of dataWaits) {
                    f.cancel();
                }
            }
            this.drainWorkerResults();
        }
        console.info("Stopping peaks processor...");
        await producer;
        await Promise.all(Array.from(this.workers).map(x => x.stop()));
        this.workers.clear();
        console.info("Stopped peaks processor");
    }

    async getWorker() {
        const workers = Array.from(this.workers).sort((a, b) => a.pending.size - b.pending.size);
        const count = workers.length;
        const stop = this._stopEvent.wait();
        if (!count || (workers[0].pending.size > 50 &&
            count < this.maxWorkers && workerExec.available())) {
            const getting = workerExec.get();
            await Promise.race([getting, stop]);
            if (!getting.done()) {
                getting.cancel();
                return null;
            }
            const worker = getting.result();
            worker.start('find-peaks', {
                periods: this.periods,
                distances: this.distances,
                athlete: this.athlete.data
            });
            worker.pending = new Map();
            this.workers.add(worker);
            this.workerAddedEvent.set();
            return worker;
        } else {
            // least busy worker...
            return workers[0];
        }
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
        while (!this._stopping) {
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
            debugger;
            sauce.report.error(new Error(`Training day bucket error: ${i}, ${ordered.length}, ` +
                `${beyondNewestTS} ${oldest.get('ts')}`));
        }
        await actsStore.saveModels(external);
    }
}
