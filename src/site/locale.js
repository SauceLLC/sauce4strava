/* global Strava sauce jQuery pageView _ */

sauce.ns('locale', ns => {
    'use strict';

    const cache = new Map();

    const _warned = new Set();
    function warnOnce(msg) {
        if (!_warned.has(msg)) {
            _warned.add(msg);
            console.warn(msg);
        }
    }

    function _getCacheEntry(args) {
        const hashKey = JSON.stringify(args);
        const entry = {
            hashKey,
            args
        };
        if (!cache.has(hashKey)) {
            entry.miss = true;
        } else {
            entry.hit = true;
            entry.value = cache.get(hashKey);
        }
        return entry;
    }

    function _formatArgs(args) {
        if (typeof args === 'string') {
            return [args];
        } else {
            return Array.from(args);
        }
    }


    async function getMessage() {
        const entry = _getCacheEntry(_formatArgs(arguments));
        if (entry.hit) {
            return entry.value;
        } else {
            const value = await sauce.rpc.getLocaleMessage.apply(null, arguments);
            if (!value) {
                warnOnce(`Locale message not found: ${entry.hashKey}`);
            }
            cache.set(entry.hashKey, value);
            return value;
        }
    }


    async function getMessages(batch) {
        const missing = [];
        const hashKeys = [];
        for (const args of batch.map(_formatArgs)) {
            const entry = _getCacheEntry(args);
            if (entry.miss) {
                missing.push(entry);
            }
            hashKeys.push(entry.hashKey);
        }
        if (missing.length) {
            const values = await sauce.rpc.getLocaleMessages(missing.map(x => x.args));
            for (let i = 0; i < missing.length; i++) {
                const value = values[i];
                if (!value) {
                    warnOnce(`Locale message not found: ${missing[i].hashKey}`);
                }
                cache.set(missing[i].hashKey, value);
            }
        }
        return hashKeys.map(x => cache.get(x));
    }


    return {
        getMessage,
        getMessages,
    };
});
