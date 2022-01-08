/* global importScripts, sauce */

importScripts('/src/common/base.js');
self.sauceBaseInit();
importScripts('/src/bg/hist/db.js');
importScripts('/src/common/lib.js');


const streamsStore = new sauce.hist.db.StreamsStore();
const peaksStore = new sauce.hist.db.PeaksStore();
const sleep = sauce.sleep;


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
        run: ['time', 'active', 'watts', 'watts_calc', 'distance', 'grade_adjusted_distance', 'heartrate'],
        ride: ['time', 'active', 'watts', 'distance', 'heartrate'],
        other: ['time', 'active', 'watts', 'watts_calc', 'distance', 'heartrate'],
    });
    await sleep(1);  // Workaround for Safari IDB transaction performance bug.
    const gender = athlete.gender || 'male';
    const getRankLevel = (period, p, wp, weight) => {
        const rank = sauce.power.rankLevel(period, p, wp, weight, gender);
        if (rank.level > 0) {
            return rank;
        }
    };
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
        const activeStream = streams.active;
        const isRun = activity.basetype === 'run';
        const isRide = activity.basetype === 'ride';
        const addPeak = (type, period, value, roll, extra) => value && peaks.push({
            type,
            period,
            value,
            timeOffset: roll.firstTime(),
            start: streams.time.indexOf(roll.firstTime({noPad: true})),
            end: streams.time.indexOf(roll.lastTime({noPad: true})),
            athlete: athlete.id,
            activity: activity.id,
            activityType: activity.basetype,
            ts: activity.ts,
            ...extra,
        });
        if (streams.heartrate) {
            try {
                for (const period of periods) {
                    const roll = sauce.data.peakAverage(period, streams.time,
                        streams.heartrate, {active: true, ignoreZeros: true, activeStream});
                    if (roll) {
                        addPeak('hr', period, roll.avg(), roll);
                    }
                }
            } catch(e) {
                // XXX make this better than a big try/catch
                console.error("Failed to create peaks for: " + activity.id, e);
                errors.push({activity: activity.id, error: e.message});
            }
        }
        if (streams.watts || (isRun && streams.watts_calc)) {
            try {
                const watts = streams.watts || streams.watts_calc;
                for (const period of periods.filter(x => !!streams.watts || x >= 300)) {
                    // Instead of using peakPower, peakNP, we do our own reduction to save
                    // repeative iterations on the same dataset; it's about 50% faster.
                    const rp = sauce.power.correctedRollingPower(streams.time, period);
                    if (rp) {
                        const wrp = period >= 300 && isRide &&
                            rp.clone({active: true, inlineNP: true, inlineXP: true});
                        const leaders = {};
                        for (let i = 0; i < streams.time.length; i++) {
                            const t = streams.time[i];
                            const w = watts[i];
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
                                    leaders.np = {roll: wrp.clone(), value: np};
                                }
                                const xp = wrp.xp();
                                if (xp && (!leaders.xp || xp >= leaders.xp.value)) {
                                    leaders.xp = {roll: wrp.clone(), value: xp};
                                }
                            }
                        }
                        if (weight === undefined) {
                            weight = sauce.model.getAthleteHistoryValueAt(athlete.weightHistory, activity.ts);
                        }
                        if (leaders.power) {
                            const l = leaders.power;
                            let rankLevel;
                            if (weight) {
                                rankLevel = isRide ? getRankLevel(l.roll.active(), l.value, l.np, weight) : undefined;
                                addPeak('power_wkg', period, l.value / weight, l.roll, {rankLevel});
                            }
                            addPeak('power', period, l.value, l.roll, {rankLevel});
                        }
                        if (leaders.np) {
                            const l = leaders.np;
                            const np = l.roll.np({external: true});
                            const rankLevel = (weight && isRide) ?
                                getRankLevel(l.roll.active(), l.roll.avg({active: false}), np, weight) : undefined;
                            addPeak('np', period, np, l.roll, {rankLevel});
                        }
                        if (leaders.xp) {
                            const l = leaders.xp;
                            const xp = l.roll.xp({external: true});
                            const rankLevel = (weight && isRide) ?
                                getRankLevel(l.roll.active(), l.roll.avg({active: false}), xp, weight) : undefined;
                            addPeak('xp', period, xp, l.roll, {rankLevel});
                        }
                    }
                }
            } catch(e) {
                // XXX make this better than a big try/catch
                console.error("Failed to create peaks for: " + activity.id, e);
                errors.push({activity: activity.id, error: e.message});
            }
        }
        if (isRun && streams.distance) {
            try {
                for (const distance of distances) {
                    let roll = sauce.pace.bestPace(distance, streams.time, streams.distance, {activeStream});
                    if (roll) {
                        addPeak('pace', distance, roll.avg(), roll);
                    }
                    if (streams.grade_adjusted_distance) {
                        roll = sauce.pace.bestPace(distance, streams.time, streams.grade_adjusted_distance,
                            {activeStream});
                        if (roll) {
                            addPeak('gap', distance, roll.avg(), roll);
                        }
                    }
                }
            } catch(e) {
                // XXX make this better than a big try/catch
                console.error("Failed to create peaks for: " + activity.id, e);
                errors.push({activity: activity.id, error: e.message});
            }
        }
    }
    const priors = await peaksStore.getMany(peaks.map(x => ([x.activity, x.type, x.period])));
    for (const [i, x] of peaks.entries()) {
        const prior = priors[i];
        if (prior && Math.abs(1 - (x.value / prior.value)) > 0.02) {
            console.info(x, `https://www.strava.com/activities/${x.activity}/analysis/${x.start}/${x.end}`);
            console.info(prior, `https://www.strava.com/activities/${prior.activity}/analysis/${prior.start}/${prior.end}`);
        }
    }
    //await peaksStore.putMany(peaks);
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
