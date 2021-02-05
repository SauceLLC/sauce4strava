/* global sauce */

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


export async function activeStreamProcessor({manifest, activities, athlete}) {
    const actStreams = await getActivitiesStreams(activities,
        ['time', 'moving', 'cadence', 'watts', 'distance']);
    const activeStreams = [];
    for (const activity of activities) {
        const streams = actStreams.get(activity.pk);
        if (!streams.moving) {
            continue;
        }
        const isTrainer = activity.get('trainer');
        try {
            const activeStream = sauce.data.createActiveStream(streams, {isTrainer});
            activeStreams.push({
                activity: activity.pk,
                athlete: athlete.pk,
                stream: 'active',
                data: activeStream
            });
        } catch(e) {
            console.warn("Failed to create active stream for: " + activity, e);
            activity.setSyncError(manifest, e);
            continue;
        }
    }
    await streamsStore.putMany(activeStreams);
}


export async function runningWattsProcessor({manifest, activities, athlete}) {
    const runs = activities.filter(x => x.get('basetype') === 'run');
    const actStreams = await getActivitiesStreams(runs, ['time', 'grade_adjusted_distance']);
    const wattsStreams = [];
    for (const activity of runs) {
        const streams = actStreams.get(activity.pk);
        const gap = streams.grade_adjusted_distance;
        if (!gap) {
            continue;
        }
        const weight = athlete.getWeightAt(activity.get('ts'));
        if (!weight) {
            activity.setSyncError(manifest, new Error("no-weight"));
            continue;
        }
        try {
            const wattsStream = [0];
            for (let i = 1; i < gap.length; i++) {
                const dist = gap[i] - gap[i - 1];
                const time = streams.time[i] - streams.time[i - 1];
                const kj = sauce.pace.work(weight, dist);
                wattsStream.push(kj * 1000 / time);
            }
            wattsStreams.push({
                activity: activity.pk,
                athlete: athlete.pk,
                stream: 'watts_calc',
                data: wattsStream
            });
        } catch(e) {
            console.warn("Failed to create active stream for: " + activity);
            activity.setSyncError(manifest, e);
            continue;
        }
    }
    await streamsStore.putMany(wattsStreams);
}


export async function activityStatsProcessor({manifest, activities, athlete}) {
    const actStreams = await getActivitiesStreams(activities,
        ['time', 'heartrate', 'active', 'watts', 'watts_calc', 'altitude']);
    const hrZones = athlete.get('hrZones');
    const ltHR = hrZones && (hrZones.z4 + hrZones.z3) / 2;
    const maxHR = hrZones && sauce.perf.estimateMaxHR(hrZones);
    for (const activity of activities) {
        const streams = actStreams.get(activity.pk);
        if (!streams.time || !streams.active) {
            continue;
        }
        const ftp = athlete.getFTPAt(activity.get('ts'));
        const stats = {
            activeTime: sauce.data.activeTime(streams.time, streams.active)
        };
        activity.set({stats});
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
        if (streams.altitude) {
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
        activity.set({stats});
    }
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

    getAll() {
        const activities = this._finished.getAllNoWait();
        for (const a of activities) {
            this.pending.delete(a);
        }
        return activities;
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
        let deadline = Date.now() + maxWait;
        let lastSize;
        while (true) {
            await Promise.race([
                this._cancelEvent.wait(),
                this._flushEvent.wait(),
                this._incoming.wait({size: maxSize}),
                sleep(Math.min(minWait, deadline - Date.now())),
            ]);
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
            deadline = Date.now() + maxWait;
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


export class TrainingLoadProcessor extends OffloadProcessor {
    constructor(...args) {
        super(...args);
        this.updated = new Set();
    }

    async processor() {
        const minWait = 10 * 1000;
        const maxWait = 90 * 1000;
        const maxSize = 100;
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
            if (!this.updated.has(a.pk)) {
                unseen++;
            } else {
                this.updated.add(a.pk);
            }
        }
        if (!unseen) {
            console.debug("No training load updates required");
            return batch;
        }
        console.info("Processing ATL and CTL for", batch.length, 'activities');
        const orderedIds = await actsStore.getAllKeysForAthlete(this.athlete.pk,
            {start: oldest.get('ts')});
        const need = orderedIds.filter(x => !activities.has(x));
        for (const a of await actsStore.getMany(need, {models: true})) {
            if (!a.hasAnySyncErrors('streams') && !a.hasAnySyncErrors('local')) {
                activities.set(a.pk, a);
                this.updated.add(a.pk);
                external.add(a);
            }
        }
        const ordered = orderedIds.map(x => activities.get(x)).filter(x => x);
        let atl = 0;
        let ctl = 0;
        let seed;
        // Rewind until we find a seed record from a prior day...
        for await (const a of actsStore.siblings(oldest.pk, {models: true, direction: 'prev'})) {
            if (a.getLocaleDay().getTime() !== oldest.getLocaleDay().getTime()) {
                seed = a;
                const tl = seed.get('training');
                atl = tl && tl.atl || 0;
                ctl = tl && tl.ctl || 0;
                break;
            } else if (a.pk !== oldest.pk) {
                // Prior activity is same day as oldest in this set, we must lump it in.
                oldest = a;
                ordered.unshift(a);
                activities.set(a.pk, a);
                this.updated.add(a.pk);
                external.add(a);
            } else {
                throw new TypeError("Internal Error: sibling search produced non sensical result");
            }
        }
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
                const m = ordered[i++];
                daily.push(m);
                tss += m.getTSS() || 0;
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
