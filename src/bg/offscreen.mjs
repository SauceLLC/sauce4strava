/* global browser */

import '../ext/webext.js';


const idleWorkers = [];


async function peaksProcessor(athlete, activities, options) {
    const worker = idleWorkers.length ?
        idleWorkers.shift() :
        new Worker('/src/bg/hist/peaks_processor_worker.js');
    if (worker.idleTimeout) {
        clearTimeout(worker.idleTimeout);
    }
    const ch = new MessageChannel();
    const ourPort = ch.port1;
    const theirPort = ch.port2;
    const p = new Promise((resolve, reject) => {
        const onError = ev => reject(new Error('generic worker error'));
        worker.addEventListener('error', onError, {once: true});
        ourPort.addEventListener('message', ev => {
            worker.removeEventListener('error', onError);
            if (ev.data.success) {
                console.info("WE GOT IT!!", ev);
                resolve(ev.data.value);
            } else {
                console.error("peaks processor worker error:", ev.data.error);
                const e = new Error(ev.data.error.message);
                e.stack = ev.data.error.stack;
                reject(e);
            }
        });
    });
    ourPort.start();
    worker.postMessage({athlete, activities, options, port: theirPort}, [theirPort]);
    try {
        const ret = await p;
        worker.idleTimeout = setTimeout(() => {
            const idx = idleWorkers.indexOf(worker);
            if (idx !== -1) {
                idleWorkers.splice(idx, 1);
            }
            worker.terminate();
        }, 5000);
        idleWorkers.push(worker);
        return ret;
    } catch(e) {
        worker.terminate();
        throw e;
    } finally {
        ourPort.close();
    }
}


function parseRawReactProps(raw) {
    const frag = document.createElement('div');
    // Unescapes html entities, ie. "&quot;"
    const htmlEntitiesKey = String.fromCharCode(...[33, 39, 36, 30, 46, 5, 10, 2, 12]
        .map((x, i) => (x ^ i) + 72));
    frag[htmlEntitiesKey] = raw;
    return JSON.parse(frag[htmlEntitiesKey]
        .replace(/\\\\/g, '\\')
        .replace(/\\\$/g, '$')
        .replace(/\\`/g, '`'));
}


const calls = {
    parseRawReactProps,
    peaksProcessor,
};

browser.runtime.onConnect.addListener(port => {
    if (port.name !== 'sauce-offscreen-proxy-port') {
        return;
    }
    port.onMessage.addListener(async ({name, id, args}) => {
        const call = Object.prototype.hasOwnProperty.call(calls, name) && calls[name];
        try {
            if (call) {
                port.postMessage({id, success: true, value: await call(...args)});
            } else {
                throw new TypeError('invalid call');
            }
        } catch(e) {
            port.postMessage({id, success: false,
                error: {name: e.name, message: e.message, stack: e.stack}});
        }
    });
    port.onDisconnect.addListener((...args) => {
        // WARNING: We must close when the SW dies to prevent bugs with other runtime
        // based message happening betweeen the SW and the content scripts.
        console.info("Service worker connection terminated: Closing...");
        close();
    });
});
