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

    async function setFTP(athlete, ftp) {
        const data = await storageGet(['athlete_info', 'ftp_overrides']);
        if (!data.athlete_info) {
            data.athlete_info = {};
        }
        if (!data.ftp_overrides) {
            data.ftp_overrides = {};
        }
        data.athlete_info[athlete.id] = {
            name: athlete.get('display_name')
        };
        data.ftp_overrides[athlete.id] = ftp;
        await storageSet(data);
    }

    async function getFTP(athlete_id) {
        const ftps = await storageGet('ftp_overrides');
        return ftps ? ftps[athlete_id] : undefined;
    }

    async function ga() {
        const data = Array.from(arguments);
        return await _sendMessage({system: 'ga', op: 'apply', data});
    }

    return {
        getFTP,
        setFTP,
        storageSet,
        storageGet,
        ga
    };
});
