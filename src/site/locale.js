/* global sauce, Strava */

sauce.ns('locale', ns => {
    'use strict';

    const metersPerMile = 1609.344;
    const msgCache = new Map();
    const warned = new Set();

    let initialized;
    let hdUnits;


    function warnOnce(msg) {
        if (!warned.has(msg)) {
            warned.add(msg);
            console.warn(msg);
        }
    }


    function isRoughlyEqual(a, b, sameness) {
        sameness = sameness || 0.01;
        const delta = Math.abs(a - b);
        return delta < sameness;
    }


    function _getCacheEntry(key, args) {
        const hashKey = args.length ? JSON.stringify([key, args]) : key;
        const entry = {
            hashKey,
            key,
            args
        };
        if (!msgCache.has(hashKey)) {
            entry.miss = true;
        } else {
            entry.hit = true;
            entry.value = msgCache.get(hashKey);
        }
        return entry;
    }


    async function _fillMessagesCache(missing) {
        if (!sauce.proxy.isConnected) {
            await sauce.proxy.connected;
        }
        const values = await sauce.locale._getMessages(missing.map(x => [x.key, ...x.args]));
        for (const [i, x] of missing.entries()) {
            let value = values[i];
            if (!value) {
                warnOnce(`Locale message not found: ${x.key}`);
                value = `L!:${x.key}`;
            }
            msgCache.set(x.hashKey, value);
        }
    }


    function fastGetMessage(key, ...args) {
        const entry = _getCacheEntry(key, args);
        return entry.hit ?
            entry.value :
            _fillMessagesCache([entry]).then(() => msgCache.get(entry.hashKey));
    }


    async function getMessage(...args) {
        const r = fastGetMessage(...args);
        return (r instanceof Promise) ? await r : r;
    }


    function fastGetMessages(keys, ...args) {
        const missing = [];
        const hashKeys = [];
        for (const k of keys) {
            const entry = _getCacheEntry(k, args);
            if (entry.miss) {
                missing.push(entry);
            }
            hashKeys.push(entry.hashKey);
        }
        return missing.length ?
            _fillMessagesCache(missing).then(() => hashKeys.map(x => msgCache.get(x))) :
            hashKeys.map(x => msgCache.get(x));
    }


    async function getMessages(...args) {
        const r = fastGetMessages(...args);
        return (r instanceof Promise) ? await r : r;
    }


    function fastGetMessagesObject(keys, defaultNamespace) {
        const result = getMessages(keys.map(x =>
            x[0] === '/' ? x.substr(1) : (defaultNamespace ? `${defaultNamespace}_${x}` : x)));
        const reducer = msgs => msgs.reduce((acc, x, i) =>
            (acc[keys[i].replace(/^\//, '')] = x, acc), {});
        return result instanceof Promise ? result.then(reducer) : reducer(result);
    }


    async function getMessagesObject(...args) {
        const r = fastGetMessagesObject(...args);
        return (r instanceof Promise) ? await r : r;
    }


    let _initing;
    async function init(options) {
        if (initialized) {
            return;
        }
        if (!_initing) {
            _initing = _init(options);
        }
        await _initing;
    }


    function triggerReady() {
        const ev = new Event('sauceLocaleReady');
        document.dispatchEvent(ev);
    }


    async function _init(options={}) {
        const units = ['year', 'week', 'day', 'hour', 'min', 'sec',
                       'years', 'weeks', 'days', 'hours', 'mins', 'secs',
                       'ago', 'in', 'now', 'today'];
        hdUnits = await fastGetMessagesObject(units, 'time');
        if (options.skipFormatters) {
            initialized = true;
            triggerReady();
            return;
        }
        await Promise.all([
            sauce.propDefined('Strava.I18n.ElevationFormatter'),
            sauce.propDefined('Strava.I18n.DoubledStepCadenceFormatter'),
        ]); // XXX find something just after all the locale stuff.
        ns.elevationFormatter = new Strava.I18n.ElevationFormatter();
        ns.hrFormatter = new Strava.I18n.HeartRateFormatter();
        ns.tempFormatter = new Strava.I18n.TemperatureFormatter();
        Strava.I18n.FormatterTranslations.swim_cadence = {
            abbr: "%{value} <abbr class='unit short' title='strokes per minute'>spm</abbr>",
            "long": {
                one: "%{count} strokes per minute",
                other: "%{count} strokes per minute"
            },
            "short": "%{value} spm",
            name_long: "strokes per minute",
            name_short: "spm"
        };
        ns.cadenceFormatter = new Strava.I18n.CadenceFormatter();
        ns.cadenceFormatterRun = new Strava.I18n.DoubledStepCadenceFormatter();
        ns.cadenceFormatterSwim = new Strava.I18n.CadenceFormatter();
        ns.cadenceFormatterSwim.key = 'swim_cadence';
        ns.timeFormatter = new Strava.I18n.TimespanFormatter();
        ns.weightFormatter = new Strava.I18n.WeightFormatter();
        ns.distanceFormatter = new Strava.I18n.DistanceFormatter();
        ns.paceFormatter = new Strava.I18n.PaceFormatter();
        ns.speedFormatter = new Strava.I18n.DistancePerTimeFormatter();
        ns.swimPaceFormatter = new Strava.I18n.SwimPaceFormatter;
        ns.imperialDistanceFormatter = new Strava.I18n.DistanceFormatter(
            Strava.I18n.UnitSystemSource.IMPERIAL);
        ns.metricDistanceFormatter = new Strava.I18n.DistanceFormatter(
            Strava.I18n.UnitSystemSource.METRIC);
        triggerReady();
        initialized = true;
    }


    function assertInit() {
        if (!initialized) {
            throw new TypeError('init() must be called first');
        }
    }


    function getPaceFormatter(options) {
        let f;
        if (options.type) {
            f = {
                speed: ns.speedFormatter,
                pace: ns.paceFormatter,
                swim: ns.swimPaceFormatter,
            }[options.type];
        } else if (options.activityType) {
            f = {
                ride: ns.speedFormatter,
                workout: ns.speedFormatter,
                ski: ns.speedFormatter,
                run: ns.paceFormatter,
                swim: ns.swimPaceFormatter,
            }[options.activityType];
        } else {
            if (self.pageView && self.pageView.activity) {
                const activity = self.pageView.activity();
                if (activity) {
                    const su = activity.get('speedUnit');
                    if (su === 'mph') {
                        f = ns.speedFormatter;
                    } else if (su === 'mpm') {
                        f = ns.paceFormatter;
                    } else if (su === 'mp100m') {
                        f = ns.swimPaceFormatter;
                    } else {
                        // Unlikely...
                        if (activity.isRide()) {
                            f = ns.speedFormatter;
                        } else if (activity.isRun()) {
                            f = ns.paceFormatter;
                        } else if (activity.isSwim()) {
                            f = ns.swimPaceFormatter;
                        }
                    }
                }
            }
        }
        if (!f) {
            console.warn("pace formatter defaulting to speed");
        }
        return f || ns.speedFormatter;
    }


    function humanDuration(elapsed, options={}) {
        assertInit();
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
        ].filter(([, period]) =>
            (options.maxPeriod ? period <= options.maxPeriod : true) &&
            (options.minPeriod ? period >= options.minPeriod : true));
        const stack = [];
        const round = options.round || 1;
        elapsed = Math.round(elapsed / round) * round;
        let i = 0;
        for (let [key, period] of units) {
            i++;
            if (round > period) {
                break;
            }
            if (elapsed >= period || (!stack.length && i === units.length)) {
                let val;
                if (options.precision && units[units.length - 1][1] === period) {
                    val = humanNumber(elapsed / period, {precision: options.precision});
                } else {
                    val = humanNumber(Math.floor(elapsed / period));
                }
                if (val !== '1') {
                    key += 's';
                }
                const unit = options.short ? hdUnits[key][0] : hdUnits[key];
                const suffix = options.html ? `<abbr class="unit">${unit}</abbr>` : unit;
                stack.push(`${val}${options.short || options.html ? '' : ' '}${suffix}`);
                elapsed %= period;
            }
        }
        return stack.slice(0, 2).join(options.short ? ' ' : ', ');
    }


    function humanPeakPeriod(time, options={}) {
        const minPeriod = time > 3600 && (time % 300 === 0) ? 3600 : undefined;
        const maxPeriod = time < 120 && (time % 60) ? 1 : undefined;
        const precision = minPeriod ? 1 : undefined;
        const localOpts = {minPeriod, maxPeriod, precision};
        if (options.short === undefined) {
            const test = humanDuration(time, {...localOpts, ...options, html: false});
            const short = !!(test && test.length >= 12);
            if (!short && !options.html) {
                return test;
            } else {
                return humanDuration(time, {...localOpts, ...options, short});
            }
        } else {
            return humanDuration(time, {...localOpts, ...options});
        }
    }


    function humanRaceDistance(value, options={}) {
        if (value < 1000) {
            return humanNumber(value, {...options, suffix: 'm', separator: options.html ? '' : ' '});
        }
        let formatter;
        const miles = value / metersPerMile;
        if (isRoughlyEqual(miles, 13.1) ||
            isRoughlyEqual(miles, 26.2) ||
            isRoughlyEqual(miles, Math.round(miles))) {
            formatter = ns.imperialDistanceFormatter;
        } else {
            formatter = ns.metricDistanceFormatter;
        }
        const savedPrecision = formatter.precision;
        formatter.precision = 0;
        try {
            if (options.html) {
                return formatter.abbreviatedNoWhitespace(value);
            } else {
                return formatter.formatShort(value);
            }
        } finally {
            formatter.precision = savedPrecision;
        }
    }


    function humanRelTime(date, options={}) {
        assertInit();
        if (!(date instanceof Date)) {
            date = new Date(date);
        }
        const elapsed = (Date.now() - date.getTime()) / 1000;
        const duration = humanDuration(Math.abs(elapsed), options);
        if (duration) {
            if (elapsed > 0) {
                return `${duration} ${hdUnits.ago}`;
            } else {
                return `${hdUnits.in} ${duration}`;
            }
        } else {
            if (options.round && options.round >= 86400) {
                return hdUnits.today;
            } else {
                return hdUnits.now;
            }
        }
    }


    function humanWeight(kg, options={}) {
        assertInit();
        if (kg == null || kg === '' || Number.isNaN(kg)) {
            return '';
        }
        const precision = options.precision != null ? options.precision : 1;
        if (options.html) {
            const save = ns.weightFormatter.precision;
            ns.weightFormatter.precision = precision;
            try {
                return ns.weightFormatter.abbreviatedNoWhitespace(kg);
            } finally {
                ns.weightFormatter.precision = save;
            }
        } else if (options.suffix) {
            if (options.longSuffix) {
                return ns.weightFormatter.formatLong(kg, precision);
            } else {
                return ns.weightFormatter.formatShort(kg, precision);
            }
        } else {
            return ns.weightFormatter.format(kg, precision);
        }
    }


    function humanTimer(seconds) {
        assertInit();
        return ns.timeFormatter.display(seconds);
    }


    const _intlDateFormats = {
        'long': new Intl.DateTimeFormat([], {year: 'numeric', month: 'long', day: 'numeric'}),
        'default': new Intl.DateTimeFormat([], {year: 'numeric', month: 'short', day: 'numeric'}),
        'short': new Intl.DateTimeFormat([], {year: 'numeric', month: 'numeric', day: 'numeric'}),
        'shortDay': new Intl.DateTimeFormat([], {month: 'numeric', day: 'numeric'}),
        'monthYear': new Intl.DateTimeFormat([], {year: 'numeric', month: 'short'}),
        'month': new Intl.DateTimeFormat([], {month: 'short'}),
        'monthDay': new Intl.DateTimeFormat([], {month: 'short', day: 'numeric'}),
        'weekday': new Intl.DateTimeFormat([], {weekday: 'short', month: 'short', day: 'numeric'}),
        'weekdayYear': new Intl.DateTimeFormat([], {
            year: 'numeric', weekday: 'short', month: 'short', day: 'numeric'
        }),
        'year': new Intl.DateTimeFormat([], {year: 'numeric'}),
    };
    function humanDate(date, options={}) {
        if (!(date instanceof Date)) {
            date = new Date(date);
        }
        const style = options.style || 'default';
        return _intlDateFormats[style].format(date);
    }


    const _intlTimeFormats = {
        'default': new Intl.DateTimeFormat([], {hour: 'numeric', minute: 'numeric', second: 'numeric'}),
    };
    function humanTime(date, options={}) {
        if (!(date instanceof Date)) {
            date = new Date(date);
        }
        const style = options.style || 'default';
        return _intlTimeFormats[style].format(date);
    }


    const _intlDateTimeFormats = {
        'long': new Intl.DateTimeFormat([], {
            year: 'numeric', month: 'long', day: 'numeric',
            hour: 'numeric', minute: 'numeric'
        }),
        'default': new Intl.DateTimeFormat([], {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: 'numeric', minute: 'numeric'
        }),
        'short': new Intl.DateTimeFormat([], {
            year: 'numeric', month: 'numeric', day: 'numeric',
            hour: 'numeric', minute: 'numeric'
        }),
        'weekday': new Intl.DateTimeFormat([], {
            weekday: 'short',
            year: 'numeric', month: 'short', day: 'numeric',
            hour: 'numeric', minute: 'numeric'
        }),
    };
    function humanDateTime(date, options={}) {
        assertInit();
        if (!(date instanceof Date)) {
            date = new Date(date);
        }
        const now = new Date();
        if (now.getDate() === date.getDate() &&
            now.getMonth() === date.getMonth() &&
            now.getFullYear() === date.getFullYear()) {
            const time = humanTime(date, {...options, style: 'default'});
            if (options.concise) {
                return time;
            }
            const today = hdUnits.today;
            const Today = today.substr(0, 1).toLocaleUpperCase() + today.substr(1);
            return [Today, time].join(', ');
        }
        const style = options.style || 'default';
        return _intlDateTimeFormats[style].format(date);
    }


    const _utcSundayRef = new Date(1638700000000);
    function humanDayOfWeek(sunOfft, options={}) {
        const weekday = options.long ? 'long' : 'short';
        const d = new Date(_utcSundayRef);
        d.setDate(d.getDate() + sunOfft);
        return d.toLocaleString(undefined, {timezone: 'UTC', weekday});
    }


    function humanDistance(meters, options={}) {
        assertInit();
        if (meters == null || meters === '') {
            return '';
        }
        const precision = options.precision != null ? options.precision : 1;
        if (options.html) {
            const save = ns.distanceFormatter.precision;
            ns.distanceFormatter.precision = precision;
            try {
                return ns.distanceFormatter.abbreviatedNoWhitespace(meters);
            } finally {
                ns.distanceFormatter.precision = save;
            }
        } else if (options.suffix) {
            return ns.distanceFormatter.formatShort(meters, precision);
        } else {
            return ns.distanceFormatter.format(meters, precision);
        }
    }


    function humanPace(raw, options={}) {
        assertInit();
        if (raw == null || raw === '') {
            return '';
        }
        const mps = options.velocity ? raw : 1 / raw;
        const formatter = getPaceFormatter(options);
        const minPace = 0.1;  // About 4.5 hours / mile
        const precision = options.precision;
        if (options.suffix) {
            if (options.html) {
                if (mps < minPace) {
                    return '<abbr class="unit short" title="Stopped">-</abbr>';
                }
                return formatter.abbreviatedNoWhitespace(mps);
            } else {
                if (mps < minPace) {
                    return '-';
                }
                return formatter.formatShort(mps, precision);
            }
        } else {
            if (mps < minPace) {
                return '-';
            }
            return formatter.format(mps, precision);
        }
    }


    function humanTemp(temp, options={}) {
        assertInit();
        const precision = options.precision != null ? options.precision :
            ns.tempFormatter.unitSystem === 'metric' ? 1 : 0;
        if (options.html) {
            const save = ns.tempFormatter.precision;
            ns.tempFormatter.precision = precision;
            try {
                return ns.tempFormatter.abbreviatedNoWhitespace(temp);
            } finally {
                ns.tempFormatter.precision = save;
            }
        } else if (options.suffix) {
            return ns.tempFormatter.formatShort(temp, precision);
        } else {
            return ns.tempFormatter.format(temp, precision);
        }
    }


    function humanCadence(hz, options={}) {
        assertInit();
        let formatter = ns.cadenceFormatter;
        if (!options.type) {
            if (self.pageView && self.pageView.activity) {
                const activity = self.pageView.activity();
                if (activity && activity.isRun()) {
                    formatter = ns.cadenceFormatterRun;
                } else if (activity && activity.isSwim()) {
                    formatter = ns.cadenceFormatterSwim;
                }
            }
        }
        const precision = options.precision != null ? options.precision : 0;
        if (options.html) {
            const save = formatter.precision;
            formatter.precision = precision;
            try {
                return formatter.abbreviatedNoWhitespace(hz);
            } finally {
                formatter.precision = save;
            }
        } else if (options.suffix) {
            return formatter.formatShort(hz, precision);
        } else {
            return formatter.format(hz, precision);
        }
    }


    function humanNumber(value, options={}) {
        assertInit();
        if (value == null || value === '') {
            return '';
        }
        const n = Number(value);
        if (Number.isNaN(n)) {
            return '';
        }
        const p = options.precision || 0;
        const v = n.toLocaleString(undefined, {
            useGrouping: n >= 10000 || n <= -10000,
            maximumFractionDigits: p,
            minimumFractionDigits: options.fixed ? p : undefined,
        });
        const sep = options.suffix && options.separator || '';
        const suffix = options.suffix ?
            options.html ? `<abbr class="unit">${options.suffix}</abbr>` : options.suffix :
            '';
        return (v === '-0' ? '0' : v) + sep + suffix;
    }


    function humanElevation(meters, options={}) {
        assertInit();
        if (meters == null || meters === '') {
            return '';
        }
        if (options.html) {
            return ns.elevationFormatter.abbreviatedNoWhitespace(meters);
        } else if (options.suffix) {
            if (options.longSuffix) {
                return ns.elevationFormatter.formatLong(meters);
            } else {
                return ns.elevationFormatter.formatShort(meters);
            }
        } else {
            return ns.elevationFormatter.format(meters);
        }
    }


    function humanStride(meters, options={}) {
        assertInit();
        const metric = ns.distanceFormatter.unitSystem === 'metric';
        const suffix = options.suffix && metric ? 'm' : 'ft';
        if (metric) {
            return humanNumber(meters, {precision: 2, ...options, suffix});
        } else {
            const feet = meters / metersPerMile * 5280;
            return humanNumber(feet, {precision: 1, ...options, suffix});
        }
    }


    function weightUnconvert(localeWeight) {
        assertInit();
        return ns.weightFormatter.unitSystem === 'metric' ? localeWeight : localeWeight / 2.20462;
    }


    function elevationUnconvert(localeEl) {
        assertInit();
        return ns.elevationFormatter.unitSystem === 'metric' ? localeEl : localeEl * 0.3048;
    }


    function velocityUnconvert(localeV, options={}) {
        assertInit();
        const f = getPaceFormatter(options);
        return (f.unitSystem === 'metric' ? localeV * 1000 : localeV * metersPerMile) / 3600;
    }


    function distanceUnconvert(localeDist) {
        assertInit();
        return ns.distanceFormatter.unitSystem === 'metric' ? localeDist * 1000 : localeDist * metersPerMile;
    }


    return {
        init,
        getMessage,
        getMessages,
        getMessagesObject,
        fastGetMessage,
        fastGetMessages,
        fastGetMessagesObject,
        getPaceFormatter,
        weightUnconvert,
        elevationUnconvert,
        velocityUnconvert,
        distanceUnconvert,
        human: {
            duration: humanDuration,
            peakPeriod: humanPeakPeriod,
            relTime: humanRelTime,
            weight: humanWeight,
            elevation: humanElevation,
            temp: humanTemp,
            cadence: humanCadence,
            number: humanNumber,
            pace: humanPace,
            dayOfWeek: humanDayOfWeek,
            distance: humanDistance,
            raceDistance: humanRaceDistance,
            timer: humanTimer,
            date: humanDate,
            datetime: humanDateTime,
            time: humanTime,
            stride: humanStride,
        },
        templateHelpers: {
            humanDuration,
            humanPeakPeriod,
            humanRelTime,
            humanWeight,
            humanElevation,
            humanTemp,
            humanCadence,
            humanNumber,
            humanPace,
            humanDayOfWeek,
            humanDistance,
            humanRaceDistance,
            humanTimer,
            humanDate,
            humanDateTime,
            humanTime,
            humanStride,
        },
    };
});
