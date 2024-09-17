/* global sauce, importScripts */

importScripts('/src/common/base.js');
self.sauceBaseInit('no-id', 'no-url', 'no-name', '0.0.0');
importScripts('/src/common/lib.js');
importScripts('/src/bg/hist/db.js');

const minEstPeakPowerPeriod = 300;
const streamsStore = sauce.hist.db.StreamsStore.singleton();


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
            const type = a.basetype;
            streams = streamsDesc[type === 'run' ? 'run' : type === 'ride' ? 'ride' : 'other'];
        }
        actStreams.set(a.id, {});
        for (const stream of streams) {
            streamKeys.push([a.id, stream]);
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


function getRankLevel(period, p, wp, weight, athlete) {
    const rank = sauce.power.rankLevel(period, p, wp, weight, athlete.gender || 'male');
    if (rank.level > 0) {
        return rank;
    }
}



async function processor(athlete, activities, {periods, distances, disableNP, disableXP, useEstWatts}) {
    console.error({disableNP, disableXP});
    const actStreams = await getActivitiesStreams(activities, {
        run: ['time', 'active', 'heartrate', 'distance', 'grade_adjusted_distance'],
        ride: ['time', 'active', 'heartrate', 'watts', 'watts_calc'].filter(x =>
            x !== 'watts_calc' || useEstWatts),
        other: ['time', 'active', 'heartrate', 'watts'],
    });
    const upPeaks = [];
    for (const activity of activities) {
        if (activity.peaksExclude) {
            continue;  // cleanup happens in finalizer proc.
        }
        const streams = actStreams.get(activity.id);
        if (!streams.time) {
            continue;
        }
        const basetype = activity.basetype;
        const isRun = basetype === 'run';
        const isRide = basetype === 'ride';
        const wattsStream = streams.watts || streams.watts_calc;
        const estPower = !streams.watts;
        const totalTime = streams.time[streams.time.length - 1] - streams.time[0];
        const weight = sauce.model.getAthleteHistoryValueAt(athlete.weightHistory, activity.ts);

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
                for (const period of periods) {
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
                for (const period of distances) {
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
                {inlineNP: !estPower && !disableNP, inlineXP: !estPower && !disableXP});
            if (powerRoll) {
                for (const period of periods) {
                    if (period > totalTime || (estPower && period < minEstPeakPowerPeriod)) {
                        continue;
                    }
                    const inlineNP = !estPower && !disableNP && period >= sauce.power.npMinTime;
                    const inlineXP = !estPower && !disableXP && period >= sauce.power.xpMinTime;
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
                        //continue; // XXX 
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
                        //continue; // XXX 
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
                        //continue; // XXX 
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
                            //continue; // XXX
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
                    getRankLevel(l.roll.active(), l.value, l.np, weight, athlete) :
                    undefined;
                addPeak('power', x.roll.period, l.value, l.roll,
                    {wp: l.np, estimate: estPower, rankLevel});
            }
            if (x.npLeader) {
                const l = x.npLeader;
                const npExt = l.roll.np({external: true}); // XXX remove after testing remove after testing remove after testing remove after testing
                if (Math.abs(l.value - npExt) > 1e-9) {
                    console.error("different np", l.value, npExt);
                    debugger;
                }
                const power = l.roll.avg({active: false});
                const rankLevel = isRide ?
                    getRankLevel(l.roll.active(), power, l.value, weight, athlete) :
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
                    getRankLevel(l.roll.active(), power, xp, weight, athlete) :
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
    return upPeaks;
}


addEventListener('message', async ev => {
    const port = ev.data.port;
    try {
        port.postMessage({
            success: true,
            value: await processor(ev.data.athlete, ev.data.activities, ev.data.options),
        });
    } catch(e) {
        console.error("peaks proc worker error:", e);
        port.postMessage({
            success: false,
            error: {
                name: e.name,
                message: e.message,
                stack: e.stack,
            }
        });
    }
});
