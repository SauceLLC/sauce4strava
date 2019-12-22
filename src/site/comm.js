/* global sauce chrome */

sauce.ns('comm', function() {
    'use strict';

    function _sendMessage(msg) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(sauce.extID, msg, resp => {
                if (resp === undefined || !resp.success) {
                    const err = resp ? resp.error : 'general error';
                    reject(new Error(err));
                } else {
                    resolve.apply(null, resp.data);
                }
            });
        });
    }

    async function set(key, value) {
        let data;
        if (value === undefined && typeof key === 'object') {
            data = key;
        } else {
            data = {[key]: value};
        }
        return await _sendMessage({system: 'sync', op: 'set', data});
    }

    async function get(key) {
        const o = await _sendMessage({system: 'sync', op: 'get', data: key});
        if (typeof key === 'string') {
            return o[key];
        } else {
            return o;
        }
    }

    async function setFTP(athlete, ftp) {
        const data = await get(['athlete_info', 'ftp_overrides']);
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
        await set(data);
    }

    async function getFTP(athlete_id) {
        const ftps = await get('ftp_overrides');
        return ftps ? ftps[athlete_id] : undefined;
    }

    return {
        getFTP,
        setFTP,
        set,
        get,
    };
});
