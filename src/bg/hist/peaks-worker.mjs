/* global sauce */

import "../../common/base.js";
import "../worker_base_init.js";
import "../../common/lib.js";
import "./db.js";
import {peaksProcessor} from '/src/bg/hist/peaks.mjs';


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
    const getStreams = streamsStore.getMany(streamKeys);
    for (const x of await withTimeout(getStreams, 120000)) {
        if (x) {
            actStreams.get(x.activity)[x.stream] = x.data;
        }
    }
    return actStreams;
}


async function processor(athlete, activities, options) {
    const actStreams = await getActivitiesStreams(activities, {
        run: ['time', 'active', 'heartrate', 'distance', 'grade_adjusted_distance'],
        ride: ['time', 'active', 'heartrate', 'watts', 'watts_calc'].filter(x =>
            x !== 'watts_calc' || options.useEstWatts),
        other: ['time', 'active', 'heartrate', 'watts'],
    });
    return peaksProcessor(actStreams, athlete, activities, options);
}


addEventListener('message', async ev => {
    if (!sauce.options) {
        sauce.options = ev.data.sauceConfig.options;
    }
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
    } finally {
        port.close();
    }
});
