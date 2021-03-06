/* global sauce, browser */

import * as queues from '/src/common/jscoop/queues.js';
import * as futures from '/src/common/jscoop/futures.js';
import * as locks from '/src/common/jscoop/locks.js';

const actsStore = new sauce.hist.db.ActivitiesStore();
const streamsStore = new sauce.hist.db.StreamsStore();


async function sleep(ms) {
    await new Promise(resolve => setTimeout(resolve, ms));
}


async function getActivitiesStreams(activities, streams) {
    const streamKeys = [];
    const actStreams = new Map();
    for (const a of activities) {
        for (const stream of streams) {
            streamKeys.push([a.pk, stream]);
        }
        actStreams.set(a.pk, {});
    }
    for (const x of await streamsStore.getMany(streamKeys)) {
        if (x) {
            actStreams.get(x.activity)[x.stream] = x.data;
        }
    }
    return actStreams;
}


class WorkerPoolExecutor {
    constructor(url, options={}) {
        this.url = url;
        this.maxWorkers = options.maxWorkers || (navigator.hardwareConcurrency || 4);
        this._idle = new Set();
        this._sem = new locks.Semaphore(this.maxWorkers);
        this._id = 0;
    }

    _getWorker() {
        if (this._idle.size) {
            const worker = this._idle.values().next().value;
            clearTimeout(worker.gcTimeout);
            this._idle.delete(worker);
            return worker;
        } else {
            return new Worker(this.url);
        }
    }

    async exec(call, ...args) {
        const id = this._id++;
        const f = new futures.Future();
        const onMessage = ev => {
            if (!ev.data || ev.data.id == null) {
                f.setError(new Error("Invalid Worker Message"));
            } else if (ev.data.id !== id) {
                console.error('Ignoring worker message from other job');
                return;
            } else {
                if (ev.data.success) {
                    f.setResult(ev.data.value);
                } else {
                    f.setError(new Error(ev.data.value));
                }
            }
        };
        await this._sem.acquire();
        try {
            const worker = this._getWorker();
            worker.addEventListener('message', onMessage);
            try {
                worker.postMessage({call, args, id});
                return await f;
            } finally {
                worker.removeEventListener('message', onMessage);
                worker.gcTimeout = setTimeout(() => {
                    this._idle.delete(worker);
                    worker.terminate();
                }, 30000);
                this._idle.add(worker);
            }
        } finally {
            this._sem.release();
        }
    }
}


let _workerPool;
function getWorkerPool() {
    if (!_workerPool) {
        const extUrl = browser.runtime.getURL('');
        _workerPool = new WorkerPoolExecutor(extUrl + 'src/bg/hist/worker.js');
    }
    return _workerPool;
}


export class OffloadProcessor extends futures.Future {
    constructor({manifest, athlete, cancelEvent}) {
        super();
        this.manifest = manifest;
        this.athlete = athlete;
        this.pending = new Set();
        this._incoming = new queues.PriorityQueue();
        this._finished = new queues.Queue();
        this._flushEvent = new locks.Event();
        this._cancelEvent = cancelEvent;
        this._runProcessor();
    }

    flush() {
        this._flushEvent.set();
    }

    putIncoming(activities) {
        for (const a of activities) {
            this.pending.add(a);
            this._incoming.putNoWait(a, a.get('ts'));
        }
    }

    getBatch(count) {
        const batch = [];
        while (this._finished.size && batch.length < count) {
            const a = this._finished.getNoWait();
            this.pending.delete(a);
            batch.push(a);
        }
        return batch;
    }

    get size() {
        return this._finished.size;
    }

    async wait() {
        return await this._finished.wait();
    }

    putFinished(activities) {
        for (const a of activities) {
            this._finished.putNoWait(a);
        }
    }

    async getIncomingDebounced(options={}) {
        const minWait = options.minWait;
        const maxWait = options.maxWait;
        const maxSize = options.maxSize;
        let deadline = maxWait && Date.now() + maxWait;
        let lastSize;
        while (true) {
            const waiters = [
                this._cancelEvent.wait(),
                this._flushEvent.wait(),
            ];
            if (maxSize) {
                waiters.push(this._incoming.wait({size: maxSize}));
            }
            if (minWait && maxWait) {
                waiters.push(sleep(Math.min(minWait, deadline - Date.now())));
            } else if (minWait) {
                waiters.push(sleep(minWait));
            } else if (maxWait) {
                waiters.push(sleep(maxWait));
            }
            await Promise.race(waiters);
            if (this._cancelEvent.isSet()) {
                return null;
            }
            const size = this._incoming.size;
            if (this._flushEvent.isSet()) {
                if (!size) {
                    return null;
                }
            } else if (size != lastSize && size < maxSize && Date.now() < deadline) {
                lastSize = size;
                continue;
            }
            deadline = maxWait && Date.now() + maxWait;
            if (!size) {
                continue;
            }
            this._flushEvent.clear();
            return this._incoming.getAllNoWait();
        }
    }

    async processor() {
        throw new TypeError("Pure virutal method");
        /* Subclass should keep this alive for the duration of their execution.
         * It is also their job to monitor flushEvent and cancelEvent
         */
    }

    async _runProcessor() {
        try {
            this.setResult(await this.processor());
        } catch(e) {
            this.setError(e);
        }
    }
}


export async function AthleteSettingsProcessor({manifest, activities, athlete}) {
    let invalidate;
    const hrTS = athlete.get('hrZonesTS');
    if (hrTS == null || Date.now() - hrTS > 86400 * 1000) {
        // The HR zones API is based on activities, so we just look for an activity in this
        // batch with HR and ask for updated zones.  The trick is that if the zones are
        // updated we need to trigger an invalidation of all activities. E.g. we force a
        // resync.
        const actStreams = await getActivitiesStreams(activities, ['heartrate']);
        let remainingAttempts = 10;
        const origZones = athlete.get('hrZones');
        const origHash = origZones ? JSON.stringify(origZones) : null;
        for (const activity of activities) {
            const streams = actStreams.get(activity.pk);
            if (streams.heartrate) {
                const zones = await sauce.perf.fetchHRZones(activity.pk);
                if (!zones) {
                    if (--remainingAttempts) {
                        sauce.report.error(new Error("Unable to to learn HR zones"));
                        break;
                    }
                    continue;
                }
                invalidate = !origHash || JSON.stringify(zones) !== origHash;
                athlete.set('hrZones', zones);
                athlete.set('hrZonesTS', Date.now());
                await athlete.save();
                break;
            }
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
        ['time', 'moving', 'cadence', 'watts', 'distance', 'grade_adjusted_distance']);
    const extraStreams = [];
    for (const activity of activities) {
        const streams = actStreams.get(activity.pk);
        if (streams.moving) {
            const isTrainer = activity.get('trainer');
            try {
                const activeStream = sauce.data.createActiveStream(streams, {isTrainer});
                extraStreams.push({
                    activity: activity.pk,
                    athlete: athlete.pk,
                    stream: 'active',
                    data: activeStream
                });
            } catch(e) {
                console.warn("Failed to create active stream for: " + activity, e);
                activity.setSyncError(manifest, e);
            }
        }
        if (activity.get('basetype') === 'run') {
            const gap = streams.grade_adjusted_distance;
            const weight = athlete.getWeightAt(activity.get('ts'));
            if (gap && weight) {
                try {
                    const wattsStream = [0];
                    for (let i = 1; i < gap.length; i++) {
                        const dist = gap[i] - gap[i - 1];
                        const time = streams.time[i] - streams.time[i - 1];
                        const kj = sauce.pace.work(weight, dist);
                        wattsStream.push(kj * 1000 / time);
                    }
                    extraStreams.push({
                        activity: activity.pk,
                        athlete: athlete.pk,
                        stream: 'watts_calc',
                        data: wattsStream
                    });
                } catch(e) {
                    console.warn("Failed to create running watts stream for: " + activity, e);
                    activity.setSyncError(manifest, e);
                }
            }
        }
    }
    await streamsStore.putMany(extraStreams);
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
    for (const activity of activities) {
        const streams = actStreams.get(activity.pk);
        const stats = {};
        activity.set({stats});
        for (const [statKey, rawKey] of Object.entries(rawAttrMap)) {
            const rawVal = activity.get(rawKey);
            if (rawVal != null) {
                stats[statKey] = rawVal;
            }
        }
        if (!streams.time || !streams.active) {
            continue;
        }
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
            } catch(e) {
                activity.setSyncError(manifest, e);
                continue;
            }
        }
        if (streams.altitude && stats.altitudeGain == null) {
            stats.altitudeGain = sauce.geo.altitudeChanges(streams.altitude).gain;
        }
        if (streams.watts || (streams.watts_calc && activity.get('basetype') === 'run')) {
            const watts = streams.watts || streams.watts_calc;
            try {
                const corrected = sauce.power.correctedPower(streams.time, watts);
                if (!corrected) {
                    continue;
                }
                stats.kj = corrected.kj();
                stats.power = stats.kj * 1000 / stats.activeTime;
                stats.np = corrected.np();
                stats.xp = corrected.xp();
                if (ftp) {
                    stats.tss = sauce.power.calcTSS(stats.np || stats.power, stats.activeTime, ftp);
                    stats.intensity = (stats.np || stats.power) / ftp;
                }
            } catch(e) {
                activity.setSyncError(manifest, e);
                continue;
            }
        }
    }
}


export async function peaksProcessor({manifest, activities, athlete}) {
    const wp = getWorkerPool();
    const activityMap = new Map(activities.map(x => [x.pk, x]));
    const work = [];
    const len = activities.length;
    const maxWorkers = Math.ceil(len / 30);
    const concurrency = Math.min(maxWorkers, navigator.hardwareConcurrency || 6);
    const step = Math.ceil(len / concurrency);
    const periods = (await sauce.peaks.getRanges('periods')).map(x => x.value);
    const distances = (await sauce.peaks.getRanges('distances')).map(x => x.value);
    for (let i = 0; i < len; i += step) {
        const chunk = activities.slice(i, i + step);
        work.push(wp.exec('findPeaks', athlete.data, chunk.map(x => x.data), periods, distances));
    }
    for (const errors of await Promise.all(work)) {
        for (const x of errors) {
            const activity = activityMap.get(x.activity);
            activity.setSyncError(manifest, new Error(x.error));
        }
    }
    await Promise.all(work);
}


export class TrainingLoadProcessor extends OffloadProcessor {
    constructor(...args) {
        super(...args);
        this.completedWith = new Map();
    }

    async processor() {
        const minWait = 10 * 1000;
        const maxWait = 90 * 1000;
        const maxSize = 50;
        while (true) {
            const batch = await this.getIncomingDebounced({minWait, maxWait, maxSize});
            if (batch === null) {
                return;
            }
            batch.sort((a, b) => a.get('ts') - b.get('ts'));  // oldest -> newest
            await this._process(batch);
            this.putFinished(batch);
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
            return batch;
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
        for await (const a of actsStore.siblings(oldest.pk, {models: true, direction: 'prev'})) {
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
        const future = new Date(Date.now() + 7 * 86400 * 1000);
        let i = 0;
        for (const day of sauce.date.dayRange(oldest.getLocaleDay(), future)) {
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
            throw new Error("Internal Error");
        }
        await actsStore.saveModels(external);
    }
}
