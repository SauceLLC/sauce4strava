/* global sauce chrome */

sauce.ns('rpc', function() {
    'use strict';


    function _sendMessage(msg) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(sauce.extID, msg, resp => {
                if (resp === undefined || !resp.success) {
                    const err = resp ? resp.error : 'general error';
                    reject(new Error(err));
                } else {
                    resolve(resp.data);
                }
            });
        });
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


    let _activeAthleteUpdate;
    async function updateAthleteInfo(id, updates) {
        const priorUpdate = _activeAthleteUpdate;
        const ourUpdate = (async () => {
            if (priorUpdate) {
                await priorUpdate;
            }
            const athlete_info = (await storageGet('athlete_info')) || {};
            if (!athlete_info[id]) {
                athlete_info[id] = {};
            }
            Object.assign(athlete_info[id], updates);
            await storageSet({athlete_info});
            return athlete_info[id];
        })();
        _activeAthleteUpdate = ourUpdate;
        try {
            return await ourUpdate;
        } finally {
            if (ourUpdate === _activeAthleteUpdate) {
                _activeAthleteUpdate = null;
            }
        }
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
        ga,
        reportEvent,
        reportError,
        getLocaleMessage,
        getLocaleMessages,
    };
});
