
sauce.ns('data', function(ns) {

    function RollingAvg(period) {
        this._times = [];
        this._values = [];
        this.offt = 0;
        this.period = period;
        this.sum = 0;
    }

    RollingAvg.prototype.add = function(ts, value, is_pad) {
        this._times.push(ts);
        this._values.push(value);
        this.sum += value;
        if (!is_pad) {
            this.offt++;
        }
        while (ts - this._times[0] >= this.period) {
            this.sum -= this._values[0];
            this.shift();
        }
    };

    var Pad = function() {};
    Pad.prototype.valueOf = function() { return 0; };
    var pad = new Pad();

    RollingAvg.prototype.pad = function(size) {
        var last_ts = this._times[this._times.length-1];
        for (var i = 1; i <= size; i++) {
            this.add(++last_ts, pad, true);
        }
    };

    RollingAvg.prototype.padCount = function() {
        var count = 0;
        for (var i = 0; i < this._values.length; i++) {
            if (this._values[i] instanceof Pad) {
                count++;
            }
        }
        return count;
    };

    RollingAvg.prototype.avg = function() {
        return this.sum / this._values.length;
    };

    RollingAvg.prototype.full = function() {
        var t = this._times;
        return t[t.length-1] - t[0] == (this.period - 1);
    };

    RollingAvg.prototype.shift = function() {
        this._times.shift();
        this._values.shift();
    };

    RollingAvg.prototype.copy = function() {
        var copy = new RollingAvg(this.period);
        copy.sum = this.sum;
        copy.offt = this.offt;
        copy._times = this._times.slice(0);
        copy._values = this._values.slice(0);
        return copy;
    };

    return {
        RollingAvg: RollingAvg
    };
});


sauce.ns('func', function(ns) {

    var _adjunct = function(runAfter, obj, orig_func_name, interceptor) {
        var save_fn = obj.prototype[orig_func_name];
        function wrap() {
            if (runAfter) {
                var ret = save_fn.apply(this, arguments);
                var args = Array.prototype.slice.call(arguments);
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

    var runAfter = function(obj, orig_func_name, interceptor) {
        _adjunct(true, obj, orig_func_name, interceptor);
    };

    var runBefore = function(obj, orig_func_name, interceptor) {
        _adjunct(false, obj, orig_func_name, interceptor);
    };


    var IfDone = function(callback) {
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
        var _this = this;
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


sauce.ns('power', function(ns) {
    /* Max gap-seconds to permit without zero-padding. */
    var max_data_gap = 5;

    /* Based on Andy Coggan's power profile. */
    var ranking_consts = {
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

    var rank_cats = [
        'Recreational',
        'Cat 5',
        'Cat 4',
        'Cat 3',
        'Cat 2',
        'Cat 1',
        'Pro',
        'World Class'
    ];

    var _rankScaler = function(duration, c) {
        var t = (c.slope_period / duration) * c.slope_adjust;
        var slope = Math.log10(t + c.slope_offset);
        var w_kg = Math.pow(slope, c.slope_factor);
        return w_kg + c.base_offset;
    };

    var rank = function(duration, w_kg, sex) {
        var high_consts = ranking_consts[sex].high;
        var low_consts = ranking_consts[sex].low;
        var high = _rankScaler(duration, high_consts);
        var low = _rankScaler(duration, low_consts);
        return (w_kg - low) / (high - low);
    };

    var rankCat = function(rank) {
        if (rank >= 1) {
            return rank_cats[rank_cats.length-1] + '++';
        } else if (rank <= 0) {
            return rank_cats[0] + '--';
        }
        var index = rank / (1 / rank_cats.length);
        var mod = index % 1;
        if (mod >= 0.8) {
            mod = '+';
        } else if (mod < 0.2) {
            mod = '-';
        } else {
            mod = '';
        }
        return rank_cats[Math.floor(index)] + mod;
    };

    var critpowerSmart = function(ts_stream, watts_stream, period) {
        var ring = new sauce.data.RollingAvg(period);
        var max;
        var range = 0;
        var ts_size = ts_stream.length;
        for (var i = 0; i < ts_size; i++) {
            var watts = watts_stream[i];
            var ts = ts_stream[i];
            var gap = i > 0 && ts - ts_stream[i-1];
            if (gap > max_data_gap) {
                ring.pad(gap-2);
            }
            ring.add(ts, watts);
            if (ring.full() && (!max || ring.avg() > max.avg())) {
                max = ring.copy();
            }
        }
        return max;
    };

    var calcNP = function(watts_stream) {
        var ret = {
            value: 0,
            count: 0
        };
        var rolling_size = 30;
        /* Coggan doesn't recommend NP for less than 20 mins.  Allow a margin
         * of error for dropouts. */
        if (watts_stream.length < 1000) {
            return ret;
        }
        var total = 0;
        var count = 0;
        var index = 0;
        var sum = 0;
        var rolling = new Uint16Array(rolling_size);
        for (var i = 0; i < watts_stream.length; i++) {
            var watts = watts_stream[i];
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

    var calcTSS = function(np, if_, ftp) {
        var norm_work = np.value * np.count;
        var ftp_work_hour = ftp * 3600;
        var raw_tss = norm_work * if_;
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


sauce.ns('comm', function(ns) {

    var _sendMessage = function(msg, callback) {
        chrome.runtime.sendMessage(sauce.extID, msg, function(resp) {
            if (!resp.success) {
                console.error("RPC sender:", resp.error);
            } else if (callback) {
                callback.apply(this, resp.data);
            } else {
                console.debug("RPC done:", msg);
            }
        });
    };

    var syncSet = function(key, value, callback) {
        console.debug('RPC - sync SET: ' + key + ' = ' + value);
        var data = {};
        data[key] = value;
        _sendMessage({
            system: 'sync',
            op: 'set',
            data: data
        }, callback);
    };

    var syncGet = function(key, callback) {
        console.debug('RPC - sync GET - KEY: ' + key);
        _sendMessage({
            system: 'sync',
            op: 'get',
            data: key
        }, function(d) {
            console.log('RPC - sync_get - VALUE: ' + d[key]);
            callback(d[key]);
        });
    };

    var setFTP = function(athlete_id, ftp, callback) {
        syncSet('athlete_ftp_' + athlete_id, ftp, callback);
    };

    var getFTP = function(athlete_id, callback) {
        syncGet('athlete_ftp_' + athlete_id, callback);
    };

    return {
        getFTP: getFTP,
        setFTP: setFTP
    };
});


sauce.ns('time', function(ns) {

    ns.MIN = 60;
    ns.HOUR = ns.MIN * 60;
    ns.DAY = ns.HOUR * 24;
    ns.MONTH = ns.HOUR * 730;
    ns.YEAR = ns.DAY * 365;

    var ago = function(dateobj, precision) {
        var now = new Date();
        var span = (now - dateobj) / 1000;
        var stack = [];
        precision = precision || ns.MIN;
        span = Math.round(span / precision);
        span *= precision;

        [
            ['year', ns.YEAR],
            ['month', ns.MONTH],
            ['day', ns.DAY],
            ['hour', ns.HOUR],
            ['min', ns.MIN],
            ['sec', 1]
        ].forEach(function(x) {
            var suf = x[0], period = x[1];
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
        });

        return stack.join(', ') || 'just now';
    };

    return {
        ago: ago
    };
});
