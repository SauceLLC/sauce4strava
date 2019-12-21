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
        const data = {};
        data[key] = value;
        return await _sendMessage({system: 'sync', op: 'set', data});
    }

    async function get(key) {
        const o = await _sendMessage({system: 'sync', op: 'get', data: key});
        return o[key];
    }

    async function setFTP(athlete_id, ftp) {
        return await set(`athlete_ftp_${athlete_id}`, ftp);
    }

    async function getFTP(athlete_id) {
        return await get(`athlete_ftp_${athlete_id}`);
    }

    return {
        getFTP,
        setFTP,
        set,
        get,
    };
});
