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


    async function getMessage(...args) {
        const entry = _getCacheEntry(_formatArgs(args));
        if (entry.hit) {
            return entry.value;
        } else {
            await sauce.proxy.connected;
            const value = await sauce.locale._getMessage(...args);
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
            await sauce.proxy.connected;
            const values = await sauce.locale._getMessages(missing.map(x => x.args[0]));
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
        const msgs = await getMessages(keys.map(x => `${prefix}${x}`));
        return msgs.reduce((acc, x, i) => (acc[keys[i]] = x, acc), {});
    }


    let _hdUnits;
    async function humanInit() {
        if (_hdUnits) {
            return;
        }
        const units = ['year', 'week', 'day', 'hour', 'min', 'sec',
                       'years', 'weeks', 'days', 'hours', 'mins', 'secs',
                       'ago', 'now'];
        _hdUnits = await getMessagesObject(units, 'time');
    }


    function humanDuration(elapsed, options) {
        if (!_hdUnits) {
            throw new TypeError('humanInit() must be called first');
        }
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
                const suffix = _hdUnits[key];
                stack.push(`${Math.floor(elapsed / period)} ${suffix}`);
                elapsed %= period;
            }
        }
        return stack.slice(0, 2).join(', ');
    }


    function humanTimeAgo(date, options) {
        if (!_hdUnits) {
            throw new TypeError('humanInit() must be called first');
        }
        const elapsed = (Date.now() - date) / 1000;
        const duration = humanDuration(elapsed, options);
        if (duration) {
            return `${duration} ${_hdUnits.ago}`;
        } else {
            return _hdUnits.now;
        }
    }

    return {
        getMessage,
        getMessages,
        getMessagesObject,
        humanInit,
        humanDuration,
        humanTimeAgo
    };
});
