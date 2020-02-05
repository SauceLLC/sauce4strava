/* global sauce, browser */

sauce.ns('rpc', function() {
    'use strict';

    self.browser = self.browser || self.chrome;

    let _sendMessage;

    if (self.browser && Math.random() < 0) {
        _sendMessage = async function(msg) {
            // Requires message support from page script to background script (chrome only)
            return await browser.runtime.sendMessage(sauce.extId, msg);
        };
    } else if (Math.random() < 0) {
        let rpcId = 0;
        let rpcCallbacks = new Map();
        document.addEventListener('saucerpcresponsesuccess', ev => {
            const rid = ev.detail.rid;
            const {resolve} = rpcCallbacks.get(rid);
            rpcCallbacks.delete(rid);
            resolve(ev.detail.data);
        });
        document.addEventListener('saucerpcresponseerror', ev => {
            const rid = ev.detail.rid;
            const {reject} = rpcCallbacks.get(rid);
            rpcCallbacks.delete(rid);
            reject(new Error(ev.detail.error || 'unknown rpc error'));
        });
        _sendMessage = function(msg) {
            return new Promise((resolve, reject) => {
                const rid = rpcId++;
                const ev = new CustomEvent('saucerpcrequest', {detail: {rid, msg, extId: sauce.extId}});
                rpcCallbacks.set(rid, {resolve, reject});
                document.dispatchEvent(ev);
            });
        };
    } else {
        let rpcId = 0;
        let rpcCallbacks = new Map();
        window.addEventListener('message', ev => {
            if (ev.source !== window || !ev.data || ev.data.extId !== sauce.extId ||
                ev.data.type !== 'sauce-rpc-response') {
                console.error("DROP EV FROM EXT", ev, ev.data, ev.source, window);
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
        _sendMessage = function(msg) {
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
        };
    }


    async function storageSet(key, value) {
        let data;
        if (value === undefined && typeof key === 'object') {
            data = key;
        } else {
            data = {[key]: value};
        }
        return await _sendMessage({system: 'storage', op: 'set', data});
    }


    async function storageGet(data) {
        return await _sendMessage({system: 'storage', op: 'get', data});
    }


    async function getAthleteInfo(id) {
        const athlete_info = await storageGet('athlete_info');
        if (athlete_info && athlete_info[id]) {
            return athlete_info[id];
        }
    }

    let _activeUpdate;
    async function storageUpdate(keyPath, updates) {
        // keyPath can be dot.notation.
        const priorUpdate = _activeUpdate;
        const ourUpdate = (async () => {
            if (priorUpdate) {
                await priorUpdate;
            }
            const keys = keyPath.split('.');
            const rootKey = keys.shift();
            const rootRef = await storageGet(rootKey) || {};
            let ref = rootRef;
            for (const key of keys) {
                if (ref[key] == null) {
                    ref[key] = {};
                }
                ref = ref[key];
            }
            Object.assign(ref, updates);
            await storageSet({[rootKey]: rootRef});
            return ref;
        })();
        _activeUpdate = ourUpdate;
        try {
            return await ourUpdate;
        } finally {
            if (ourUpdate === _activeUpdate) {
                _activeUpdate = null;
            }
        }
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
        return await _sendMessage({system: 'ga', op: 'apply', data: {meta, args}});
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
        return await _sendMessage({system: 'locale', op: 'getMessage', data});
    }


    async function getLocaleMessages(data) {
        return await _sendMessage({system: 'locale', op: 'getMessages', data});
    }


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
    };
});
