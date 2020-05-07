/* global sauce */

sauce.ns('rpc', function() {
    'use strict';


    async function storageSet(key, value) {
        let data;
        if (value === undefined && typeof key === 'object') {
            data = key;
        } else {
            data = {[key]: value};
        }
        return await invoke({system: 'storage', op: 'set', data});
    }


    async function storageGet(data) {
        return await invoke({system: 'storage', op: 'get', data});
    }


    async function getAthleteInfo(id) {
        const athlete_info = await storageGet('athlete_info');
        if (athlete_info && athlete_info[id]) {
            return athlete_info[id];
        }
    }


    async function storageUpdate(keyPath, updates) {
        return await invoke({system: 'storage', op: 'update', data: {keyPath, updates}});
    }


    async function updateAthleteInfo(id, updates) {
        return await storageUpdate(`athlete_info.${id}`, updates);
    }


    async function setAthleteProp(id, key, value) {
        await updateAthleteInfo(id, {[key]: value});
    }


    async function getAthleteProp(id, key) {
        const info = await getAthleteInfo(id);
        return info && info[key];
    }


    async function ga() {
        const args = Array.from(arguments);
        const meta = {referrer: document.referrer};
        return await invoke({system: 'ga', op: 'apply', data: {meta, args}});
    }


    async function reportEvent(eventCategory, eventAction, eventLabel, options) {
        await sauce.rpc.ga('send', 'event', Object.assign({
            eventCategory,
            eventAction,
            eventLabel,
        }, options));
    }


    async function reportError(e) {
        const page = location.pathname;
        let desc;
        try {
            desc = e instanceof Error ? e.stack : (new Error(JSON.stringify(e))).stack;
        } catch(e) {
            desc = new Error("Internal error during report error: "  + e);
        }
        console.error('Reporting error:', desc);
        await sauce.rpc.ga('send', 'exception', {
            exDescription: desc,
            exFatal: true,
            page
        });
        await reportEvent('Error', 'exception', desc, {nonInteraction: true, page});
    }


    async function getLocaleMessage() {
        const data = Array.from(arguments);
        return await invoke({system: 'locale', op: 'getMessage', data});
    }


    async function getLocaleMessages(data) {
        return await invoke({system: 'locale', op: 'getMessages', data});
    }


    async function ping(...data) {
        return await invoke({system: 'util', op: 'ping', data});
    }


    async function bgping(...data) {
        return await invoke({system: 'util', op: 'bgping', data});
    }


    const _invokePromise = (async () => {
        // Instead of just broadcasting all RPC over generic 'message' events, create a channel
        // which is like a unix pipe pair and transfer one of the ports to the ext for us
        // to securely and performantly talk over.
        const rpcCallbacks = new Map();
        const reqChannel = new MessageChannel();
        const reqPort = reqChannel.port1;
        await new Promise((resolve, reject) => {
            function onMessageEstablishChannelAck(ev) {
                reqPort.removeEventListener('message', onMessageEstablishChannelAck);
                if (!ev.data || ev.data.extId !== sauce.extId ||
                    ev.data.type !== 'sauce-rpc-establish-channel-ack') {
                    reject(new Error('RPC Protocol Violation [CONTENT] [ACK]!'));
                    return;
                }
                const respPort = ev.ports[0];
                respPort.addEventListener('message', ev => {
                    // DEBUG checks; remove at some point.
                    if (!ev.data || ev.data.extId !== sauce.extId || ev.data.type !== 'sauce-rpc-response') {
                        throw new Error('RPC Protocol Vilation [CONTENT] [RESP]!');
                    }
                    if (ev.data.success === true) {
                        const rid = ev.data.rid;
                        const {resolve} = rpcCallbacks.get(rid);
                        rpcCallbacks.delete(rid);
                        resolve(ev.data.result);
                    } else if (ev.data.success === false) {
                        const rid = ev.data.rid;
                        const {reject} = rpcCallbacks.get(rid);
                        rpcCallbacks.delete(rid);
                        reject(new Error(ev.data.result || 'unknown rpc error'));
                    } else {
                        throw new TypeError("RPC Protocol Violation [DATA]");
                    }
                });
                respPort.start();
                console.info("Established secure RPC channel");
                resolve();
            }
            reqPort.addEventListener('message', onMessageEstablishChannelAck);
            reqPort.addEventListener('messageerror', ev => console.error('Message Error:', ev));
            reqPort.start();
            window.postMessage({
                type: 'sauce-rpc-establish-channel',
                extId: sauce.extId,
            }, self.origin, [reqChannel.port2]);
        });
        let rpcId = 0;
        return msg => {
            return new Promise((resolve, reject) => {
                const rid = rpcId++;
                rpcCallbacks.set(rid, {resolve, reject});
                reqPort.postMessage({
                    rid,
                    msg,
                    type: 'sauce-rpc-request',  // DEBUG only; remove later
                    extId: sauce.extId  // DEBUG only; remove later
                });
            });
        };
    })();

    let invoke = async msg => {
        invoke = await _invokePromise;
        return await invoke(msg);
    };

    return {
        getAthleteInfo,
        updateAthleteInfo,
        getAthleteProp,
        setAthleteProp,
        storageSet,
        storageGet,
        storageUpdate,
        ga,
        reportEvent,
        reportError,
        getLocaleMessage,
        getLocaleMessages,
        ping,
        bgping,
    };
});
