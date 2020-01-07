/* global sauce */

sauce.ns('data', function() {
    'use strict';


    function avg(data) {
        if (!data || !data.length) {
            return;
        }
        return data.reduce((tot, x) => tot + x, 0) / data.length;
    }


    function max(data) {
        // Avoid stack overflow by only use Math.max on small arrays
        if (!data || data.length < 65535) {
            return Math.max.apply(null, data);
        } else {
            let m = -Infinity;
            for (const x of data) {
                if (x > m) {
                    m = x;
                }
            }
            return m;
        }
    }


    function min(data) {
        // Avoid stack overflow by only use Math.min on small arrays
        if (!data || data.length < 65535) {
            return Math.min.apply(null, data);
        } else {
            let m = Infinity;
            for (const x of data) {
                if (x < m) {
                    m = x;
                }
            }
            return m;
        }
    }


    function mode(data) {
        // Calc math mode for a data array.
        if (!data || !data.length) {
            return;
        }
        const countMap = {};
        let mostFreq;
        for (const value of data) {
            const count = value in countMap ? countMap[value] + 1 : 1;
            countMap[value] = count;
            if (!mostFreq || mostFreq.count < count) {
                mostFreq = {count, value};
                if (count > data.length / 2) {
                    break;  // Nobody can possibly overtake now.
                }
            }
        }
        return mostFreq && mostFreq.value;
    }

    function median(data) {
        // Calc math median for a data array.
        if (!data || !data.length) {
            return;
        }
        const sorted = Array.from(data).sort();
        const midPoint = sorted.length / 2;
        if (sorted.length % 2) {
            return sorted[Math.floor(midPoint)];
        } else {
            // even length calls for avg of middle pair.
            return (sorted[midPoint - 1] + sorted[midPoint]) / 2;
        }
    }


    class Pad extends Number {}
    class Zero extends Pad {}


    class RollingBase {

        constructor(period, options) {
            options = options || {};
            this.period = period;
            this._accumulatedValues = !!options.accumulatedValues;
            if (this._accumulatedValues) {
                this._times = [0];
                this._values = [null];
                this._offt = null;
                this._headOfft = 1;
            } else {
                this._times = [];
                this._values = [];
                this._offt = 0;
                this._headOfft = 0;
            }
        }

        copy() {
            const instance = new this.constructor(this.period, this._accumulatedValues);
            instance._times = this._times.slice(this._offt - this._headOfft);
            instance._values = this._values.slice(this._offt - this._headOfft);
            instance._offt = this._headOfft;
            return instance;
        }

        importReduce(times, values, comparator) {
            if (times.length !== values.length) {
                throw new TypeError("times and values not same length");
            }
            let leader;
            for (let i = 0; i < times.length; i++) {
                if (this.add(times[i], values[i]) instanceof Pad) {
                    // Our value wasn't added, instead padding was added.  rewind
                    // incrementer and check if ring is our new leader, then try again..
                    // This ensures we find leader values when padding was required.
                    i--;
                }
                if (this.full() && (!leader || comparator(this, leader))) {
                    leader = this.copy();
                }
            }
            return leader;
        }

        elapsed(options) {
            options = options || {};
            const len = this._times.length;
            const offt = (options.offt || 0) + this._offt;
            if (len - offt < 1) {
                return 0;
            }
            const start = this._times[offt - this._headOfft];
            return this._times[len - 1] - start;
        }

        add(ts, value) {
            if (this._offt === null) {
                this._times[0] = this.preTimestamp(ts);
                this._offt = this._headOfft;
            }
            this._values.push(this.formatValue(value, ts));
            this._times.push(ts);
            while (this.full({offt: 1})) {
                this.shift();
            }
            return value;
        }

        preTimestamp(ts) {
            return ts;
        }

        formatValue(value, ts, gap) {
            return value;
        }

        firstTimestamp(options) {
            options = options || {};
            if (options.noPad) {
                for (let i = this._offt; i < this._values.length; i++) {
                    if (!(this._values[i] instanceof Pad)) {
                        return this._times[i];
                    }
                }
            } else {
                return this._times[this._offt];
            }
        }

        lastTimestamp(options) {
            options = options || {};
            if (options.noPad) {
                for (let i = this._values.length - 1; i >= this._offt; i--) {
                    if (!(this._values[i] instanceof Pad)) {
                        return this._times[i];
                    }
                }
            } else {
                return this._times[this._times.length - 1];
            }
        }

        size() {
            return this._times.length - this._offt;
        }

        values() {
            return this._values.slice(this._offt);
        }

        shift() {
            this.shiftValue(this._offt);
            this._offt++;
        }

        shiftValue(idx) {
        }
    }


    class RollingAvg extends RollingBase {

        constructor(period, idealGap, maxGap) {
            super(period, {accumulatedValues: true});
            this._joules = 0;
            this._idealGap = idealGap;
            this._maxGap = maxGap;
        }

        add(ts, value) {
            if (this._offt !== null) {
                const gap = ts - this._times[this._times.length - 1];
                if (gap > this._maxGap || (gap > this._idealGap && this._values[this._values.length - 1] instanceof Pad)) {
                    const padTS = this._times[this._times.length - 1] + this._idealGap;
                    return this.add(padTS, new Zero());
                }
            }
            return super.add(ts, value);
        }

        preTimestamp(ts) {
            return ts - this._idealGap;
        }

        formatValue(value, ts) {
            const gap = ts - this._times[this._times.length - 1];
            this._joules += value * gap;
            return value;
        }

        avg() {
            return this._joules / this.elapsed();
        }

        full(options) {
            options = options || {};
            const offt = options.offt;
            return this.elapsed({offt}) >= this.period;
        }

        shiftValue(idx) {
            this._joules -= this._values[idx] * (this._times[idx] - this._times[idx - 1]);
        }

        copy() {
            const instance = super.copy();
            instance._idealGap = this._idealGap;
            instance._maxGap = this._maxGap;
            instance._joules = this._joules;
            return instance;
        }
    }


    class RollingWindow extends RollingBase {

        distance(options) {
            options = options || {};
            const offt = (options.offt || 0) + this._offt;
            const start = this._values[offt];
            const end = this._values[this._values.length - 1];
            if (start != null && end != null) {
                return end - start;
            }
        }

        avg() {
            const dist = this.distance();
            const elapsed = this.elapsed();
            if (!dist || !elapsed) {
                return;
            }
            return elapsed / dist;
        }

        full(options) {
            options = options || {};
            const offt = options.offt;
            return this.distance({offt}) >= this.period;
        }
    }

    return {
        RollingAvg,
        RollingWindow,
        Zero,
        Pad,
        avg,
        min,
        max,
        mode,
        median
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

    return {
        runAfter: runAfter,
        runBefore: runBefore
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


    function _rankScaler(duration, c) {
        const t = (c.slope_period / duration) * c.slope_adjust;
        const slope = Math.log10(t + c.slope_offset);
        const w_kg = Math.pow(slope, c.slope_factor);
        return w_kg + c.base_offset;
    }


    function rank(duration, w_kg, sex) {
        const high_consts = ranking_consts[sex].high;
        const low_consts = ranking_consts[sex].low;
        const high = _rankScaler(duration, high_consts);
        const low = _rankScaler(duration, low_consts);
        return (w_kg - low) / (high - low);
    }


    function rankCat(rank) {
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
    }


    function critpower(period, timeStream, wattsStream) {
        if (timeStream.length < 2) {
            return;
        }
        const gaps = timeStream.map((x, i) => timeStream[i + 1] - x);
        gaps.pop();  // last entry is not a number (NaN)
        const idealGap = sauce.data.mode(gaps);
        const maxGap = sauce.data.median(gaps) * 4; // Zero pad samples over this gap size.
        const ring = new sauce.data.RollingAvg(period, idealGap, maxGap);
        return ring.importReduce(timeStream, wattsStream, (cur, lead) => cur.avg() >= lead.avg());
    }


    function calcNP(watts_stream) {
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
    }


    function calcTSS(np, if_, ftp) {
        const norm_work = np.value * np.count;
        const ftp_work_hour = ftp * 3600;
        const raw_tss = norm_work * if_;
        return raw_tss / ftp_work_hour * 100;
    }

    return {
        critpower,
        calcNP,
        calcTSS,
        rank,
        rankCat,
    };
});


sauce.ns('pace', function() {
    'use strict';

    function bestpace(distance, timeStream, distStream) {
        if (timeStream.length < 2) {
            return;
        }
        const ring = new sauce.data.RollingWindow(distance);
        return ring.importReduce(timeStream, distStream, (cur, lead) => cur.avg() <= lead.avg());
    }

    return {
        bestpace,
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


    function ago(dateobj, precision) {
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
    }

    return {
        ago,
    };
});
