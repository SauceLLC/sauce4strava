/* global sauce */

const D = sauce.date;

export function activitiesByDay(acts, start, end, atl=0, ctl=0) {
    // NOTE: Activities should be in chronological order
    if (!acts.length && !(start && end)) {
        return [];
    }
    const slots = [];
    start = start || acts[0].ts;
    // Acts starting at exactly midnight will be excluded by dayRange() without this..
    end = end || D.dayAfter(acts[acts.length - 1].ts);
    const startDay = D.toLocaleDayDate(start);
    let i = 0;
    for (const date of D.dayRange(startDay, end)) {
        let tss = 0;
        let duration = 0;
        let intensityTime = 0;
        let altGain = 0;
        let distance = 0;
        let kj = 0;
        let powerZonesTime = [];
        let hrZonesTime = [];
        const ts = date.getTime();
        const daily = [];
        if (i < acts.length - 1 && acts[i].ts < ts) {
            debugger;
            throw new Error('Internal Error');
        }
        while (i < acts.length && +D.toLocaleDayDate(acts[i].ts) === ts) {
            const a = acts[i++];
            daily.push(a);
            tss += sauce.model.getActivityTSS(a) || 0;
            if (a.stats) {
                duration += a.stats.activeTime || 0;
                intensityTime += a.stats.intensity * duration;
                altGain += a.stats.altitudeGain || 0;
                distance += a.stats.distance || 0;
                kj += a.stats.kj || 0;
                if (a.stats.powerZonesTime) {
                    if (!powerZonesTime.length) {
                        powerZonesTime = Array.from(a.stats.powerZonesTime);
                    } else {
                        for (let j = 0; j < a.stats.powerZonesTime.length; j++) {
                            powerZonesTime[j] += a.stats.powerZonesTime[j];
                        }
                    }
                }
                if (a.stats.hrZonesTime) {
                    if (!hrZonesTime.length) {
                        hrZonesTime = Array.from(a.stats.hrZonesTime);
                    } else {
                        for (let j = 0; j < a.stats.hrZonesTime.length; j++) {
                            hrZonesTime[j] += a.stats.hrZonesTime[j];
                        }
                    }
                }
            }
        }
        atl = sauce.perf.calcATL([tss], atl);
        ctl = sauce.perf.calcCTL([tss], ctl);
        slots.push({
            date,
            days: 1,
            activities: daily,
            tss,
            duration,
            atl,
            ctl,
            intensityTime,
            altGain,
            distance,
            kj,
            powerZonesTime,
            hrZonesTime,
        });
    }
    return slots;
}


export function aggregateActivitiesByFn(daily, indexFn) {
    const metricData = [];
    for (let i = 0; i < daily.length; i++) {
        const slot = daily[i];
        const index = indexFn(slot, i);
        if (!metricData[index]) {
            metricData[index] = {
                date: slot.date,
                tss: slot.tss,
                duration: slot.duration,
                intensityTime: slot.intensityTime,
                altGain: slot.altGain,
                distance: slot.distance,
                kj: slot.kj,
                days: 1,
                powerZonesTime: Array.from(slot.powerZonesTime),
                hrZonesTime: Array.from(slot.hrZonesTime),
                activities: [...slot.activities],
            };
        } else {
            const entry = metricData[index];
            entry.tss += slot.tss;
            entry.intensitySum += slot.intensitySum;
            entry.duration += slot.duration;
            entry.intensityTime += slot.intensityTime;
            entry.altGain += slot.altGain;
            entry.distance += slot.distance;
            entry.kj += slot.kj;
            entry.days++;
            entry.activities.push(...slot.activities);
            if (slot.powerZonesTime.length) {
                if (!entry.powerZonesTime.length) {
                    entry.powerZonesTime = Array.from(slot.powerZonesTime);
                } else {
                    for (let j = 0; j < slot.powerZonesTime.length; j++) {
                        entry.powerZonesTime[j] += slot.powerZonesTime[j];
                    }
                }
            }
            if (slot.hrZonesTime.length) {
                if (!entry.hrZonesTime.length) {
                    entry.hrZonesTime = Array.from(slot.hrZonesTime);
                } else {
                    for (let j = 0; j < slot.hrZonesTime.length; j++) {
                        entry.hrZonesTime[j] += slot.hrZonesTime[j];
                    }
                }
            }
        }
    }
    return metricData;
}


export function aggregateActivitiesByWeek(daily, options={}) {
    let idx = null;
    return aggregateActivitiesByFn(daily, (x, i) => {
        if (options.isoWeekStart) {
            if (idx === null) {
                idx = 0;
            } else if (x.date.getDay() === /*monday*/ 1) {
                idx++;
            }
            return idx;
        } else {
            return Math.floor(i / 7);
        }
    });
}


export function aggregateActivitiesByMonth(daily, options={}) {
    let idx = null;
    let curMonth;
    return aggregateActivitiesByFn(daily, x => {
        const m = x.date.getMonth();
        if (idx === null) {
            idx = 0;
        } else if (m !== curMonth) {
            idx++;
        }
        curMonth = m;
        return idx;
    });
}


export function aggregateActivitiesByYear(daily, options={}) {
    let idx = null;
    let curYear;
    return aggregateActivitiesByFn(daily, x => {
        const y = x.date.getFullYear();
        if (idx === null) {
            idx = 0;
        } else if (y !== curYear) {
            idx++;
        }
        curYear = y;
        return idx;
    });
}
