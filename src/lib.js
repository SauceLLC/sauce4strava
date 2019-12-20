/* global sauce chrome */

sauce.ns('data', function() {
    'use strict';

    class Pad {
        constructor(value) {
            this.value = value;
        }

        valueOf() {
            return this.value;
        }
    }

    const maxTimeGap = 4;  // Any gaps over this will result in zero padding to deflate bad high readings.


    class RollingBase {
        elapsed(options) {
            options = options || {};
            const len = this._times.length;
            const offt = options.offt || 0;
            if (len - offt < 2) {
                return 0;
            }
            const start = offt ? this._times[offt - 1] : this._head;
            return this._times[len - 1] - start;
        }

        firstTimestamp(options) {
            options = options || {};
            if (options.noPad) {
                for (let i = 0; i < this._values.length; i++) {
                    if (!(this._values[i] instanceof Pad)) {
                        return this._times[i];
                    }
                }
            } else {
                return this._times[0];
            }
        }

        lastTimestamp(options) {
            options = options || {};
            if (options.noPad) {
                for (let i = this._values.length - 1; i >= 0; i--) {
                    if (!(this._values[i] instanceof Pad)) {
                        return this._times[i];
                    }
                }
            } else {
                return this._times[this._times.length - 1];
            }
        }

        size() {
            return this._times.length;
        }
    }


    class RollingAvg extends RollingBase {
        constructor(period) {
            super();
            this._times = [];
            this._values = [];
            this._head = null;
            this.period = period;
        }

        add(ts, value) {
            if (this._head === null) {
                this._head = ts;
            } else {
                const last = this._times[this._times.length - 1];
                const gap = ts - last;
                if (gap > maxTimeGap) {
                    const zero = new Pad(0);
                    //console.warn(`Zero padding big gap: last=${last}, gap=${gap}`);
                    for (let i = 1; i < gap; i++) {
                        this.add(last + i, zero);
                    }
                } else if (gap > 1) {
                    const lastValue = this._values[this._values.length - 1];
                    const avgValue = Math.round((lastValue + value) / 2);
                    //console.warn(`Interpolation padding: last=${last}, gap=${gap} avg=${avgValue}`);
                    for (let i = 1; i < gap; i++) {
                        this.add(last + i, new Pad(avgValue));
                    }
                }
            }
            this._times.push(ts);
            this._values.push(value);
            while (this.elapsed({offt: 1}) >= this.period) {
                this.shift();
            }
        }

        avg() {
            const sum = this._values.reduce((a, b) => a + b);
            return sum / this._values.length;
        }

        full() {
            return this.elapsed() >= this.period;
        }

        shift() {
            this._head = this._times[0];
            this._times.shift();
            this._values.shift();
        }

        copy() {
            const copy = new this.constructor(this.period);
            copy._head = this._head;
            copy._times = this._times.slice(0);
            copy._values = this._values.slice(0);
            return copy;
        }
    }


    class RollingWindow extends RollingBase {
        constructor(distance) {
            super();
            this._times = [];
            this._distances = [];
            this._head = null;
            this._paces = [];
            this._distance = distance;
        }

        add(ts, distance, pace) {
            if (this._head === null) {
                this._head = ts;
            }
            this._times.push(ts);
            this._distances.push(distance);
            this._paces.push(pace);
            while (this._distances.length > 2 && distance - this._distances[1] >= this._distance) {
                this.shift();
            }
        }

        distance() {
            return this._distances[this._distances.length - 1] - this._distances[0];
        }

        avg() {
            const dist = this.distance();
            const elapsed = this.elapsed();
            if (!dist || !elapsed) {
                return;
            }
            return elapsed / dist;
        }

        full() {
            return this.distance() >= this._distance;
        }

        shift() {
            this._head = this._times[0];
            this._times.shift();
            this._distances.shift();
            this._paces.shift();
        }

        copy() {
            const copy = new this.constructor(this._distance);
            copy._head = this._head;
            copy._times = this._times.slice(0);
            copy._distances = this._distances.slice(0);
            copy._paces = this._paces.slice(0);
            return copy;
        }
    }

    return {
        RollingAvg,
        RollingWindow
    };
});


sauce.ns('func', function() {
    'use strict';

    const _adjunct = function(runAfter, obj, orig_func_name, interceptor) {
        const save_fn = obj.prototype[orig_func_name];
        function wrap() {
            if (runAfter) {
                const ret = save_fn.apply(this, arguments);
                const args = Array.prototype.slice.call(arguments);
                args.unshift(ret);
                interceptor.apply(this, args);
                return ret;
            } else {
                interceptor.apply(this, arguments);
                return save_fn.apply(this, arguments);
            }
        }
        obj.prototype[orig_func_name] = wrap;
    };

    const runAfter = function(obj, orig_func_name, interceptor) {
        _adjunct(true, obj, orig_func_name, interceptor);
    };

    const runBefore = function(obj, orig_func_name, interceptor) {
        _adjunct(false, obj, orig_func_name, interceptor);
    };


    const IfDone = function(callback) {
        this.callback = callback;
        this.refcnt = 0;
    };

    IfDone.prototype.inc = function() {
        this.refcnt++;
    };

    IfDone.prototype.dec = function() {
        this.refcnt--;
        if (this.refcnt === 0) {
            this.callback();
        }
    };

    IfDone.prototype.before = function(fn) {
        const _this = this;
        _this.inc();
        return function() {
            try {
                fn.apply(this, arguments);
            } catch(e) {
                _this.dec();
                throw e;
            }
            _this.dec();
        };
    };

    return {
        runAfter: runAfter,
        runBefore: runBefore,
        IfDone: IfDone
    };
});


sauce.ns('power', function() {
    'use strict';

    /* Based on Andy Coggan's power profile. */
    const ranking_consts = {
        male: {
            high: {
                slope_factor: 2.82,
                slope_period: 2500,
                slope_adjust: 1.4,
                slope_offset: 3.6,
                base_offset: 6.08
            },
            low: {
                slope_factor: 2,
                slope_period: 3000,
                slope_adjust: 1.3,
                slope_offset: 1,
                base_offset: 1.74
            }
        },
        female: {
            high: {
                slope_factor: 2.65,
                slope_period: 2500,
                slope_adjust: 1,
                slope_offset: 3.6,
                base_offset: 5.39
            },
            low: {
                slope_factor: 2.15,
                slope_period: 300,
                slope_adjust: 6,
                slope_offset: 1.5,
                base_offset: 1.4
            }
        }
    };

    const rank_cats = [
        'Recreational',
        'Cat 5',
        'Cat 4',
        'Cat 3',
        'Cat 2',
        'Cat 1',
        'Pro',
        'World Class'
    ];

    const _rankScaler = function(duration, c) {
        const t = (c.slope_period / duration) * c.slope_adjust;
        const slope = Math.log10(t + c.slope_offset);
        const w_kg = Math.pow(slope, c.slope_factor);
        return w_kg + c.base_offset;
    };

    const rank = function(duration, w_kg, sex) {
        const high_consts = ranking_consts[sex].high;
        const low_consts = ranking_consts[sex].low;
        const high = _rankScaler(duration, high_consts);
        const low = _rankScaler(duration, low_consts);
        return (w_kg - low) / (high - low);
    };

    const rankCat = function(rank) {
        if (rank >= 1) {
            return rank_cats[rank_cats.length-1] + '++';
        } else if (rank <= 0) {
            return rank_cats[0] + '--';
        }
        const index = rank / (1 / rank_cats.length);
        let mod = index % 1;
        if (mod >= 0.8) {
            mod = '+';
        } else if (mod < 0.2) {
            mod = '-';
        } else {
            mod = '';
        }
        return rank_cats[Math.floor(index)] + mod;
    };

    const critpowerSmart = function(period, ts_stream, watts_stream) {
        const ring = new sauce.data.RollingAvg(period);
        let max;
        const ts_size = ts_stream.length;
        for (let i = 0; i < ts_size; i++) {
            ring.add(ts_stream[i], watts_stream[i]);
            if (ring.full() && (!max || ring.avg() > max.avg())) {
                max = ring.copy();
            }
        }
        return max;
    };

    const calcNP = function(watts_stream) {
        const ret = {
            value: 0,
            count: 0
        };
        const rolling_size = 30;
        /* Coggan doesn't recommend NP for less than 20 mins.  Allow a margin
         * of error for dropouts. */
        if (watts_stream.length < 1000) {
            return ret;
        }
        let total = 0;
        let count = 0;
        let index = 0;
        let sum = 0;
        const rolling = new Uint16Array(rolling_size);
        for (let i = 0; i < watts_stream.length; i++) {
            const watts = watts_stream[i];
            sum += watts;
            sum -= rolling[index];
            rolling[index] = watts;
            total += Math.pow(sum / rolling_size, 4);
            count++;
            index = (index >= rolling_size - 1) ? 0 : index + 1;
        }
        if (count) {
            ret.value = Math.pow(total / count, 0.25);
            ret.count = count;
        }
        return ret;
    };

    const calcTSS = function(np, if_, ftp) {
        const norm_work = np.value * np.count;
        const ftp_work_hour = ftp * 3600;
        const raw_tss = norm_work * if_;
        return raw_tss / ftp_work_hour * 100;
    };

    return {
        critpower: critpowerSmart,
        calcNP: calcNP,
        calcTSS: calcTSS,
        rank: rank,
        rankCat: rankCat
    };
});


sauce.ns('pace', function() {
    'use strict';

    const bestpace = function(distance, ts_stream, dist_stream, pace_stream) {
        const ring = new sauce.data.RollingWindow(distance);
        let min;
        const ts_size = ts_stream.length;
        for (let i = 0; i < ts_size; i++) {
            const dist = dist_stream[i];
            const ts = ts_stream[i];
            const pace = pace_stream[i];
            ring.add(ts, dist, pace);
            if (ring.full() && (!min || ring.avg() <= min.avg())) {
                min = ring.copy();
            }
        }
        return min;
    };

    return {
        bestpace: bestpace
    };
});


sauce.ns('comm', function() {
    'use strict';

    const _sendMessage = function(msg, callback) {
        chrome.runtime.sendMessage(sauce.extID, msg, function(resp) {
            if (resp === undefined || !resp.success) {
                const err = resp ? resp.error : 'general error';
                console.error("RPC sender:", err);
            } else if (callback) {
                callback.apply(this, resp.data);
            }
        });
    };

    const syncSet = function(key, value, callback) {
        const data = {};
        data[key] = value;
        _sendMessage({
            system: 'sync',
            op: 'set',
            data: data
        }, callback);
    };

    const syncGet = function(key, callback) {
        _sendMessage({
            system: 'sync',
            op: 'get',
            data: key
        }, function(d) {
            callback(d[key]);
        });
    };

    const setFTP = function(athlete_id, ftp, callback) {
        syncSet('athlete_ftp_' + athlete_id, ftp, callback);
    };

    const getFTP = function(athlete_id, callback) {
        syncGet('athlete_ftp_' + athlete_id, callback);
    };

    async function get(key) {
        return await new Promise(resolve => syncGet(key, resolve));
    }

    async function set(key, value) {
        return await new Promise(resolve => syncSet(key, value, resolve));
    }

    return {
        getFTP,
        setFTP,
        get,
        set,
    };
});


sauce.ns('time', function(ns) {
    'use strict';

    ns.MIN = 60;
    ns.HOUR = ns.MIN * 60;
    ns.DAY = ns.HOUR * 24;
    ns.MONTH = ns.HOUR * 730;
    ns.YEAR = ns.DAY * 365;

    const agoUnits = [
        ['year', ns.YEAR],
        ['month', ns.MONTH],
        ['day', ns.DAY],
        ['hour', ns.HOUR],
        ['min', ns.MIN],
        ['sec', 1]
    ];

    const ago = function(dateobj, precision) {
        const now = new Date();
        let span = (now - dateobj) / 1000;
        const stack = [];
        precision = precision || ns.MIN;
        span = Math.round(span / precision);
        span *= precision;
        for (let [suf, period] of agoUnits) {
            if (precision > period) {
                return;
            }
            if (span >= period) {
                if (span >= 2 * period) {
                    suf += 's';
                }
                stack.push(Math.floor(span / period) + ' ' + suf);
                span %= period;
            }
        }
        return stack.slice(0, 2).join(', ') || 'just now';
    };

    return {
        ago
    };
});
