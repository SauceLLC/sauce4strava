const FORMATS = {
	datetime: 'MMM d, yyyy, h:mm:ss aaaa',
	millisecond: 'h:mm:ss.SSS aaaa',
	second: 'h:mm:ss aaaa',
	minute: 'h:mm aaaa',
	hour: 'ha',
	day: 'MMM d',
	week: 'PP',
	month: 'MMM yyyy',
	quarter: 'qqq - yyyy',
	year: 'yyyy'
};

Chart._adapters._date.override({
	formats: function() {
        return {};
        throw new TypeError('UNIMPLEMENTED');
		return FORMATS;
	},

	parse: function(value, fmt) {
		if (value == null) {
			return null;
		}
		const type = typeof value;
		if (type === 'number') {
			value = new Date(value);
		} else if (type === 'string') {
            throw new TypeError('UNIMPLEMENTED');
			if (typeof fmt === 'string') {
                throw new TypeError('UNIMPLEMENTED');
				value = parse(value, fmt, new Date(), this.options);
			} else {
                throw new TypeError('UNIMPLEMENTED');
				value = parseISO(value, this.options);
			}
		}
        const ts = value.getTime();
        return isNaN(ts) ? null : ts;
	},

	format: function(time, fmt) {
        return new Date(time).toLocaleString();
	},

	add: function(time, amount, unit) {
        if (unit === 'second') {
            amount *= 1000;
        } else if (unit === 'minute') {
            amount *= 60 * 1000;
        } else if (unit === 'hour') {
            amount *= 3600 * 1000;
        } else if (unit === 'day') {
            amount *= 86400 * 1000;
        } else if (unit === 'week') {
            amount *= 7 * 86400 * 1000;
        } else if (unit === 'month') {
            const d = new Date(time);
            d.setMonth(d.getMonth() + amount);
            return d.getTime();
        } else if (unit === 'quarter') {
            const d = new Date(time);
            d.setMonth(d.getMonth() + amount * 3);
            return d.getTime();
        } else if (unit === 'year') {
            const d = new Date(time);
            d.setFullYear(d.getFullYear() + amount);
            return d.getTime();
        } else {
            throw new TypeError('UNIMPLEMENTED');
        }
	},

	diff: function(max, min, unit) {
        const elapsed = max - min;
        const times = {
            year: 365 * 86400 * 1000,
            quarter: 90 * 86400 * 1000,
            month: (365 / 12) * 86400 * 1000,
            week: 7 * 86400 * 1000,
            day: 86400 * 1000,
            hour: 3600 * 1000,
            minute: 60 * 1000,
            second: 1000,
            millisecond: 1,
        };
        const divisor = times[unit];
        if (!divisor) {
            throw new TypeError('UNIMPLEMENTED');
        }
        return elapsed / divisor;
	},

	startOf: function(time, unit, weekday) {
        const d = new Date(time);
		switch (unit) {
            case 'second':
                d.setMilliseconds(0);
            case 'minute':
                d.setSeconds(0);
            case 'hour':
                d.setMinutes(0);
            case 'day':
                d.setHours(0);
            case 'week':
            case 'isoWeek':
            case 'month':
            case 'quarter':
            case 'year': {
                if (unit === 'week') {
                    d.setDay(0);
                } else if (unit === 'isoWeek') {
                    throw new TypeError('UNIMPLEMENTED');
                    d.setDay(+weekday);
                } else if (unit === 'month') {
                    d.setDate(0);
                } else if (unit === 'quarter') {
                    throw new TypeError('UNIMPLEMENTED');
                } else if (unit === 'year') {
                    d.setDate(0);
                    d.setMonth(0);
                }
            }
            return d.getTime();
		}
	},

	endOf: function(time, unit) {
        const d = new Date(time);
        if (unit === 'day') {
            d.setHours(23);
            d.setMinutes(59);
            d.setSeconds(59);
            d.setMilliseconds(999);
            return d.getTime();
        }

        throw new TypeError('UNIMPLEMENTED');
		switch (unit) {
		case 'second': return endOfSecond(time);
		case 'minute': return endOfMinute(time);
		case 'hour': return endOfHour(time);
		case 'day': return endOfDay(time);
		case 'week': return endOfWeek(time);
		case 'month': return endOfMonth(time);
		case 'quarter': return endOfQuarter(time);
		case 'year': return endOfYear(time);
		default: return time;
		}
	}
});
