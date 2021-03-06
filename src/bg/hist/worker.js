/* global importScripts, sauce */

importScripts('/src/common/base.js');
self.sauceBaseInit();
importScripts('/src/bg/hist/db.js');
importScripts('/src/common/lib.js');


const streamsStore = new sauce.hist.db.StreamsStore();
const peaksStore = new sauce.hist.db.PeaksStore();


async function getActivitiesStreams(activities, streams) {
    const streamKeys = [];
    const actStreams = new Map();
    for (const a of activities) {
        const type = a.basetype === 'run' ? 'run' : a.basetype === 'ride' ? 'ride' : 'other';
        for (const stream of streams[type]) {
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
        run: ['time', 'watts_calc', 'distance', 'grade_adjusted_distance', 'heartrate'],
        ride: ['time', 'watts', 'distance', 'heartrate'],
        other: ['time', 'watts', 'watts_calc', 'distance', 'heartrate'],
    });
    const peaks = [];
    const errors = [];
    for (const activity of activities) {
        if (activity.peaksExclude) {
            const count = await peaksStore.deleteForActivity(activity.id);
            if (count) {
                console.warn(`Deleted ${count} peaks for activity: ${activity.id}`);
            }
            continue;
        }
        let weight;
        const streams = actStreams.get(activity.id);
        const isRun = activity.basetype === 'run';
        const isRide = activity.basetype === 'ride';
        const addPeak = (type, period, value, roll) => value && peaks.push({
            type,
            period,
            value,
            timeOffset: roll.firstTime(),
            start: streams.time.indexOf(roll.firstTime({noPad: true})),
            end: streams.time.indexOf(roll.lastTime({noPad: true})),
            athlete: athlete.id,
            activity: activity.id,
            activityType: activity.basetype,
            ts: activity.ts
        });
        if (streams.heartrate) {
            try {
                for (const period of periods) {
                    const roll = sauce.data.peakAverage(period, streams.time,
                        streams.heartrate, {active: true});
                    if (roll) {
                        addPeak('hr', period, roll.avg({active: true}), roll);
                    }
                }
            } catch(e) {
                // XXX make this better than a big try/catch
                console.error("Failed to create peaks for: " + activity.id, e);
                errors.push({activity: activity.id, error: e.message});
            }
        }
        if (streams.watts || isRun && streams.watts_calc) {
            try {
                const watts = streams.watts || streams.watts_calc;
                // Instead of using peakPower, peakNP, we do our own reduction to save
                // repeative iterations on the same dataset.  it's about 50% faster.
                for (const period of periods) {
                    if (watts && isRide || period >= 300) {
                        const rp = sauce.power.correctedRollingPower(streams.time, period);
                        const wrp = period >= 300 && sauce.power.correctedRollingPower(
                            streams.time, period, {active: true, inlineNP: true, inlineXP: true});
                        if (rp || wrp) {
                            const leaderRolls = {};
                            const leaderValues = {};
                            for (let i = 0; i < streams.time.length; i++) {
                                const t = streams.time[i];
                                const w = watts[i];
                                rp.add(t, w);
                                if (rp.full()) {
                                    const power = rp.avg();
                                    if (power && (!leaderValues.power || power >= leaderValues.power)) {
                                        leaderRolls.power = rp.clone();
                                        leaderValues.power = power;
                                    }
                                }
                                if (wrp) {
                                    wrp.add(t, w);
                                    if (wrp.full({active: true})) {
                                        const np = wrp.np();
                                        if (np && (!leaderValues.np || np >= leaderValues.np)) {
                                            leaderRolls.np = wrp.clone();
                                            leaderValues.np = np;
                                        }
                                        const xp = wrp.xp();
                                        if (xp && (!leaderValues.xp || xp >= leaderValues.xp)) {
                                            leaderRolls.xp = wrp.clone();
                                            leaderValues.xp = xp;
                                        }
                                    }
                                }
                            }
                            if (leaderRolls.power) {
                                const watts = leaderRolls.power.avg();
                                addPeak('power', period, watts, leaderRolls.power);
                                if (weight === undefined) {
                                    weight = sauce.model.getAthleteHistoryValueAt(athlete.weightHistory, activity.ts);
                                }
                                if (weight) {
                                    addPeak('power_wkg', period, watts / weight, leaderRolls.power);
                                }
                            }
                            if (leaderRolls.np) {
                                addPeak('np', period, leaderRolls.np.np({external: true}), leaderRolls.np);
                            }
                            if (leaderRolls.xp) {
                                addPeak('xp', period, leaderRolls.xp.xp({external: true}), leaderRolls.xp);
                            }
                        }
                    }
                }
            } catch(e) {
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
                console.error("Failed to create peaks for: " + activity.id, e);
                errors.push({activity: activity.id, error: e.message});
            }
        }
    }
    await peaksStore.putMany(peaks);
    return errors;
}


const calls = {
    findPeaks,
};


self.addEventListener('message', async ev => {
    function resolve(value) {
        self.postMessage({success: true, value, id: ev.data.id});
    }
    function reject(error) {
        self.postMessage({success: false, value: error, id: ev.data.id});
    }
    if (!ev.data || !ev.data.call || ev.data.id == null) {
        reject('invalid-message');
        throw new Error("Invalid Message");
    }
    const call = ev.data.call;
    if (!calls[call]) {
        reject('invalid-call');
        throw new Error("Invalid Call");
    }
    try {
        resolve(await calls[call](...ev.data.args));
    } catch(e) {
        reject(e);
        throw e;
    }
});
