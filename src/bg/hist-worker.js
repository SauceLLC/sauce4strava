/* global importScripts, sauce */

importScripts('/src/common/base.js');
self.sauceBaseInit();
importScripts('/src/bg/db.js');
importScripts('/src/common/lib.js');


//const actsStore = new sauce.hist.db.ActivitiesStore();
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


async function findPeaks(athleteId, activities) {
    const metersPerMile = 1609.344;
    const actStreams = await getActivitiesStreams(activities, {
        run: ['time', 'watts_calc', 'distance', 'grade_adjusted_distance', 'heartrate'],
        ride: ['time', 'watts', 'distance', 'heartrate'],
        other: ['time', 'watts', 'watts_calc', 'distance', 'heartrate'],
    });
    const periods = [5, 15, 30, 60, 120, 300, 600, 900, 1200, 1800, 3600, 10800];
    const distances = [100, 200, 400, 1000, Math.round(metersPerMile), 3000, 5000, 10000,
        Math.round(metersPerMile * 13.1), Math.round(metersPerMile * 26.2), 50000, 100000,
        Math.round(metersPerMile * 100), 200000];
    const peaks = [];
    const errors = [];
    for (const activity of activities) {
        const addPeak = (type, period, value) => peaks.push({
            type,
            period,
            value,
            athlete: athleteId,
            activity: activity.id,
            ts: activity.ts
        });
        const streams = actStreams.get(activity.id);
        const isRun = activity.basetype === 'run';
        const isRide = activity.basetype === 'ride';
        if (streams.watts || isRun && streams.watts_calc) {
            try {
                let roll;
                const watts = streams.watts || streams.watts_calc;
                // Instead of using peakPower, peakNP, we do our own reduction to save
                // repeative iterations on the same dataset.  it's about 50% faster.
                for (const period of periods) {
                    if (watts && isRide || period >= 300) {
                        const inlineCalcs = period >= 300;
                        const rp = sauce.power.correctedRollingPower(streams.time, period, {
                            inlineNP: inlineCalcs, inlineXP: inlineCalcs});
                        if (rp) {
                            const leaderRolls = {};
                            const leaderValues = {};
                            for (let i = 0; i < streams.time.length; i++) {
                                rp.add(streams.time[i], watts[i]);
                                if (rp.full()) {
                                    const power = rp.avg();
                                    if (!leaderValues.power || power >= leaderValues.power) {
                                        leaderRolls.power = rp.clone();
                                        leaderValues.power = power;
                                    }
                                    if (inlineCalcs) {
                                        const np = rp.np();
                                        if (!leaderValues.np || np >= leaderValues.np) {
                                            leaderRolls.np = rp.clone();
                                            leaderValues.np = np;
                                        }
                                        const xp = rp.xp();
                                        if (!leaderValues.xp || xp >= leaderValues.xp) {
                                            leaderRolls.xp = rp.clone();
                                            leaderValues.xp = xp;
                                        }
                                    }
                                }
                            }
                            if (leaderRolls.power) {
                                addPeak('power', period, leaderRolls.power.avg());
                            }
                            if (leaderRolls.np) {
                                addPeak('np', period, leaderRolls.np.np({external: true}));
                            }
                            if (leaderRolls.xp) {
                                addPeak('xp', period, leaderRolls.xp.xp({external: true}));
                            }
                        }
                    }
                    if (streams.heartrate) {
                        roll = sauce.data.peakAverage(period, streams.time, streams.heartrate, {active: true});
                        if (roll) {
                            addPeak('hr', period, roll.avg({active: true}));
                        }
                    }
                }
                if (isRun && streams.distance) {
                    for (const distance of distances) {
                        roll = sauce.pace.bestPace(distance, streams.time, streams.distance);
                        if (roll) {
                            addPeak('pace', distance, roll.avg());
                        }
                        if (streams.grade_adjusted_distance) {
                            roll = sauce.pace.bestPace(distance, streams.time, streams.grade_adjusted_distance);
                            if (roll) {
                                addPeak('gap', distance, roll.avg());
                            }
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
