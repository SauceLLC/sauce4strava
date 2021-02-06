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


async function findPeaks(athleteId, activities) {
    const metersPerMile = 1609.344;
    const s = Date.now();
    let t = Date.now();
    const actStreams = await getActivitiesStreams(activities,
        ['time', 'watts', 'watts_calc', 'distance', 'grade_adjusted_distance', 'heartrate']);
    console.warn('streamget', athleteId, Date.now() - s);
    const periods = [5, 15, 30, 60, 120, 300, 600, 900, 1200, 1800, 3600, 10800];
    const distances = [100, 200, 400, 1000, Math.round(metersPerMile), 3000, 5000, 10000,
        Math.round(metersPerMile * 13.1), Math.round(metersPerMile * 26.2), 50000, 100000,
        Math.round(metersPerMile * 100), 200000];
    const peaks = [];
    const errors = [];
    for (const activity of activities) {
        const addPeak = (type, value) => peaks.push({
            type,
            value,
            athlete: athleteId,
            activity: activity.id,
            ts: activity.ts
        });
        const streams = actStreams.get(activity.id);
        const isRun = activity.basetype === 'run';
        if (streams.watts || isRun && streams.watts_calc) {
            try {
                let roll;
                const watts = streams.watts || streams.watts_calc;
                for (const period of periods) {
                    if (watts && !isRun || period >= 300) {
                        roll = sauce.power.peakPower(period, streams.time, watts);
                        if (roll) {
                            addPeak('power', roll.avg());
                        }
                    }
                    if (watts && period >= 300) {
                        roll = sauce.power.peakNP(period, streams.time, watts);
                        if (roll) {
                            addPeak('np', roll.np({external: true}));
                        }
                        roll = sauce.power.peakXP(period, streams.time, watts);
                        if (roll) {
                            addPeak('xp', roll.xp({external: true}));
                        }
                    }
                    if (streams.heartrate) {
                        roll = sauce.data.peakAverage(period, streams.time, streams.heartrate, {active: true});
                        if (roll) {
                            addPeak('hr', roll.avg({active: true}));
                        }
                    }
                }
                for (const distance of distances) {
                    if (streams.distance) {
                        roll = sauce.pace.bestPace(distance, streams.time, streams.distance);
                        if (roll) {
                            addPeak('pace', roll.avg());
                        }
                        if (isRun && streams.grade_adjusted_distance) {
                            roll = sauce.pace.bestPace(distance, streams.time, streams.grade_adjusted_distance);
                            if (roll) {
                                addPeak('gap', roll.avg());
                            }
                        }
                    }
                }
            } catch(e) {
                console.warn("Failed to create peaks for: " + activity.id, e);
                errors.push({activity: activity.id, error: e.message});
            }
        }
    }
    console.warn('proc', athleteId, Date.now() - t);
    t = Date.now();
    await peaksStore.putMany(peaks);
    console.warn('peaksput', athleteId, Date.now() - t, Date.now() - s);
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
