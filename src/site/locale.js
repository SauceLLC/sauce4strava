/* global sauce */

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


    async function getMessagesObject(keys, ns) {
        const prefix = ns ? `${ns}_` : '';
        const msgs = await sauce.locale.getMessages(keys.map(x => `${prefix}${x}`));
        return msgs.reduce((acc, x, i) => (acc[keys[i]] = x, acc), {});
    }


    async function humanDuration(elapsed, options) {
        options = options || {};
        const min = 60;
        const hour = min * 60;
        const day = hour * 24;
        const week = day * 7;
        const year = day * 365;
        const units = [
            ['year', year],
            ['week', week],
            ['day', day],
            ['hour', hour],
            ['min', min],
            ['sec', 1]
        ];
        const stack = [];
        const precision = options.precision || 1;
        elapsed = Math.round(elapsed / precision) * precision;
        for (let [key, period] of units) {
            if (precision > period) {
                break;
            }
            if (elapsed >= period) {
                if (elapsed >= 2 * period) {
                    key += 's';
                }
                const suffix = await getMessage(`time_${key}`);
                stack.push(`${Math.floor(elapsed / period)} ${suffix}`);
                elapsed %= period;
            }
        }
        return stack.slice(0, 2).join(', ');
    }


    async function humanTimeAgo(date, options) {
        const elapsed = (Date.now() - date) / 1000;
        const duration = await humanDuration(elapsed, options);
        if (duration) {
            return `${duration} ${await getMessage('time_ago')}`;
        } else {
            return getMessage('time_now');
        }
    }

    return {
        getMessage,
        getMessages,
        getMessagesObject,
        humanDuration,
        humanTimeAgo
    };
});
