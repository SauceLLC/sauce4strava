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


    async function updateAthleteInfo(id, updates) {
        const athlete_info = (await storageGet('athlete_info')) || {};
        if (!athlete_info[id]) {
            athlete_info[id] = {};
        }
        Object.assign(athlete_info[id], updates);
        await storageSet({athlete_info});
    }


    async function setFTPOverride(id, ftp_override) {
        await updateAthleteInfo(id, {ftp_override});
    }


    async function getFTPOverride(id) {
        const info = await getAthleteInfo(id);
        return info && info.ftp_override;
    }



    async function setWeightOverride(id, weight_override) {
        await updateAthleteInfo(id, {weight_override});
    }


    async function getWeightOverride(id) {
        const info = await getAthleteInfo(id);
        return info && info.weight_override;
    }


    async function setWeightLastKnown(id, weight_lastknown) {
        await updateAthleteInfo(id, {weight_lastknown});
    }


    async function getWeightLastKnown(id) {
        const info = await getAthleteInfo(id);
        return info && info.weight_lastknown;
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


    async function localeGetMessage() {
        const data = Array.from(arguments);
        return await _sendMessage({system: 'locale', op: 'getMessage', data});
    }

    async function localeGetMessages() {
        const data = Array.from(arguments);
        return await _sendMessage({system: 'locale', op: 'getMessages', data});
    }


    return {
        getAthleteInfo,
        updateAthleteInfo,
        getFTPOverride,
        setFTPOverride,
        getWeightOverride,
        setWeightOverride,
        getWeightLastKnown,
        setWeightLastKnown,
        storageSet,
        storageGet,
        ga,
        reportEvent,
        reportError,
        localeGetMessage,
        localeGetMessages,
    };
});
