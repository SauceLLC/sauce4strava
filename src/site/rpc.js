/* global sauce */

sauce.ns('rpc', function() {
    'use strict';

    function invoke(msg) {
        return new Promise((resolve, reject) => {
            const rid = rpcId++;
            rpcCallbacks.set(rid, {resolve, reject});
            window.postMessage({
                type: 'sauce-rpc-request',
                rid,
                msg,
                extId: sauce.extId
            }, /* sauce.extUrl */);
        });
    }


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
        console.warn('Reporting error:', e.message);
        await sauce.rpc.ga('send', 'exception', {
            exDescription: e.message,
            exFatal: true,
            page
        });
        await reportEvent('Error', 'exception', e.message, {nonInteraction: true, page});
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


    let rpcId = 0;
    let rpcCallbacks = new Map();
    window.addEventListener('message', ev => {
        if (ev.source !== window || !ev.data || ev.data.extId !== sauce.extId ||
            ev.data.type !== 'sauce-rpc-response') {
            //console.error("DROP EV FROM EXT", ev, ev.data, ev.source, window);
            return;
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
            throw new TypeError("RPC protocol violation");
        }
    });

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
    };
});
