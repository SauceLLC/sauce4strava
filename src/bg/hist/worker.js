/* global importScripts, sauce */

importScripts('/src/common/base.js');
self.sauceBaseInit();
importScripts('/src/bg/hist/db.js');
importScripts('/src/common/lib.js');


const streamsStore = sauce.hist.db.StreamsStore.singleton();
const peaksStore = sauce.hist.db.PeaksStore.singleton();


async function getActivitiesStreams(activities, streamsDesc) {
    const streamKeys = [];
    const actStreams = new Map();
    for (const a of activities) {
        const streams = Array.isArray(streamsDesc) ?
            streamsDesc :
            streamsDesc[a.basetype === 'run' ? 'run' : a.basetype === 'ride' ? 'ride' : 'other'];
        for (const stream of streams) {
            streamKeys.push([a.id, stream]);
        }
        actStreams.set(a.id, {});
    }
    for (const x of await streamsStore.getMany(streamKeys)) {
        if (x) {
            actStreams.get(x.activity)[x.stream] = x.data;
        }
    }
    return actStreams;
}


async function findPeaks(athlete, activities, periods, distances) {
    const actStreams = await getActivitiesStreams(activities, {
        run: ['time', 'active', 'heartrate', 'distance', 'grade_adjusted_distance'],
        ride: ['time', 'active', 'heartrate', 'watts'],
        other: ['time', 'active', 'heartrate', 'watts'],
    });
    const upPeaks = [];
    const errors = [];
    for (const activity of activities) {
        const isRun = activity.basetype === 'run';
        if (activity.peaksExclude) {
            const count = await peaksStore.deleteForActivity(activity.id);
            if (count) {
                console.warn(`Deleted ${count} peaks for activity: ${activity.id}`);
            }
            continue;
        }
        const streams = actStreams.get(activity.id);
        const addPeak = (a1, a2, a3, a4, extra) => {
            const entry = sauce.peaks.createStoreEntry(a1, a2, a3, a4, streams.time, activity, extra);
            if (entry) {
                upPeaks.push(entry);
            }
        };
        if (streams.heartrate) {
            try {
                for (const period of periods) {
                    const roll = sauce.data.peakAverage(period, streams.time,
                        streams.heartrate, {active: true, ignoreZeros: true, activeStream: streams.active});
                    if (roll) {
                        addPeak('hr', period, roll.avg(), roll);
                    }
                }
            } catch(e) {
                // XXX make this better than a big try/catch
                debugger;
                console.error("Failed to create peaks for: " + activity.id, e);
                errors.push({activity: activity.id, error: e.message});
            }
        }
        if (streams.watts && !isRun) { // Runs have their own processor for this.
            try {
                for (const period of periods) {
                    // Instead of using peakPower, peakNP, we do our own reduction to save
                    // repeative iterations on the same dataset; it's about 50% faster.
                    const rp = sauce.power.correctedRollingPower(streams.time, period);
                    const leadCloneOpts = {inlineXP: false, inlineNP: false};
                    if (rp) {
                        const wrp = period >= 300 && rp.clone({active: true, inlineNP: true, inlineXP: true});
                        const leaders = {};
                        for (let i = 0; i < streams.time.length; i++) {
                            const t = streams.time[i];
                            const w = streams.watts[i];
                            const a = streams.active[i];
                            rp.add(t, w, a);
                            if (wrp) {
                                wrp.resize();
                            }
                            if (rp.full()) {
                                const power = rp.avg();
                                if (power && (!leaders.power || power >= leaders.power.value)) {
                                    leaders.power = {roll: rp.clone(), value: power, np: wrp && wrp.np()};
                                }
                            }
                            if (wrp && wrp.full()) {
                                const np = wrp.np();
                                if (np && (!leaders.np || np >= leaders.np.value)) {
                                    leaders.np = {roll: wrp.clone(leadCloneOpts), value: np};
                                }
                                const xp = wrp.xp();
                                if (xp && (!leaders.xp || xp >= leaders.xp.value)) {
                                    leaders.xp = {roll: wrp.clone(leadCloneOpts), value: xp};
                                }
                            }
                        }
                        if (leaders.power) {
                            const l = leaders.power;
                            addPeak('power', period, l.value, l.roll, {wp: l.np});
                        }
                        if (leaders.np) {
                            const l = leaders.np;
                            const np = l.roll.np({external: true});
                            const power = l.roll.avg({active: false});
                            addPeak('np', period, np, l.roll, {power});
                        }
                        if (leaders.xp) {
                            const l = leaders.xp;
                            const xp = l.roll.xp({external: true});
                            const power = l.roll.avg({active: false});
                            addPeak('xp', period, xp, l.roll, {power});
                        }
                    }
                }
            } catch(e) {
                // XXX make this better than a big try/catch
                debugger;
                console.error("Failed to create peaks for: " + activity.id, e);
                errors.push({activity: activity.id, error: e.message});
            }
        }
        if (isRun && streams.distance) {
            try {
                for (const distance of distances) {
                    let roll = sauce.pace.bestPace(distance, streams.time, streams.distance);
                    if (roll) {
                        addPeak('pace', distance, roll.avg(), roll);
                    }
                    if (streams.grade_adjusted_distance) {
                        roll = sauce.pace.bestPace(distance, streams.time, streams.grade_adjusted_distance);
                        if (roll) {
                            addPeak('gap', distance, roll.avg(), roll);
                        }
                    }
                }
            } catch(e) {
                // XXX make this better than a big try/catch
                debugger;
                console.error("Failed to create peaks for: " + activity.id, e);
                errors.push({activity: activity.id, error: e.message});
            }
        }
    }
    await peaksStore.putMany(upPeaks);
    return errors;
}

const calls = {
    findPeaks,
};

self.addEventListener('message', async ev => {
    try {
        if (!ev.data || !ev.data.call || ev.data.id == null) {
            throw new Error("Invalid Message");
        }
        const call = ev.data.call;
        if (!calls[call]) {
            throw new Error("Invalid Call");
        }
        const value = await calls[call](...ev.data.args);
        self.postMessage({success: true, value, id: ev.data.id});
    } catch(e) {
        self.postMessage({success: false, value: {
            name: e.name,
            message: e.message,
            stack: e.stack
        }, id: ev.data.id});
    }
});
