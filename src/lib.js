

sauce.ns('data', function(ns) {

    function RollingAvg(period) {
        this._times = [];
        this._values = [];
        this.period = period;
        this.sum = 0;
    }

    RollingAvg.prototype.add = function(ts, value) {
        this._times.push(ts);
        this._values.push(value);
        this.sum += value;
        while (ts - this._times[0] >= this.period) {
            this.sum -= this._values[0];
            this.shift();
        }
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
        copy._times = this._times.slice(0);
        copy._values = this._values.slice(0);
        return copy;
    };

    return {
        RollingAvg: RollingAvg
    };
});


sauce.ns('func', function(ns) {
    var _adjunct = function(run_after, obj, orig_func_name, interceptor) {
        var save_fn = obj.prototype[orig_func_name];
        function wrap() {
            if (run_after) {
                var ret = save_fn.apply(this, arguments);
                var args = Array.prototype.slice.call(arguments)
                args.unshift(ret);
                interceptor.apply(this, args);
                return ret;
            } else {
                interceptor.apply(this, arguments);
                return save_fn.apply(this, arguments);
            }
        }
        obj.prototype[orig_func_name] = wrap;
    }

    var run_after = function(obj, orig_func_name, interceptor) {
        _adjunct(true, obj, orig_func_name, interceptor);
    }

    var run_before = function(obj, orig_func_name, interceptor) {
        _adjunct(false, obj, orig_func_name, interceptor);
    }

    return {
        run_after: run_after,
        run_before: run_after
    };
});


sauce.ns('power', function(ns) {
    /* Max gap-seconds to permit without zero-padding. */
    var max_data_gap = 5;

    var critpower_smart = function(ts_stream, watts_stream, period) {
        var ring = new sauce.data.RollingAvg(period);
        var max = undefined;
        var range = 0;
        var ts_size = ts_stream.length;
        for (var i = 0; i < ts_size; i++) {
            var watts = watts_stream[i];
            var ts = ts_stream[i];
            var gap = i > 0 && ts - ts_stream[i-1];
            if (gap > max_data_gap) {
                for (var ii = 1; ii < gap; ii++) {
                    ring.add(ts_stream[i-1]+ii, 0);
                }
            }
            ring.add(ts, watts);
            if (ring.full() && (!max || ring.avg() > max.avg())) {
                max = ring.copy();
            }
        }
        return max;
    };

    var calc_np = function(watts_stream) {
        var ret = {
            value: 0,
            count: 0
        };
        var rolling_size = 30;
        if (watts_stream.length < 120) {
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

    /* NOTES:
     * zones: pageView.power().
     */
    var calc_tss = function(np, if_, ftp) {
        var norm_work = np.value * np.count;
        var ftp_work_hour = ftp * 3600;
        var raw_tss = norm_work * if_;
        return raw_tss / ftp_work_hour * 100;
    };

    return {
        critpower: critpower_smart,
        calc_np: calc_np,
        calc_tss: calc_tss
    };
});

