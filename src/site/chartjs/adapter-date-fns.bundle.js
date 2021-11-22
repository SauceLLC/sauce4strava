(function(global, factory) {
	typeof exports === "object" && typeof module !== "undefined" ? factory(require("chart.js")) : typeof define === "function" && define.amd ? define([ "chart.js" ], factory) : (global = typeof globalThis !== "undefined" ? globalThis : global || self, 
	factory(global.Chart));
})(this, (function(chart_js) {
	"use strict";
	function toInteger(dirtyNumber) {
		if (dirtyNumber === null || dirtyNumber === true || dirtyNumber === false) {
			return NaN;
		}
		var number = Number(dirtyNumber);
		if (isNaN(number)) {
			return number;
		}
		return number < 0 ? Math.ceil(number) : Math.floor(number);
	}
	function requiredArgs(required, args) {
		if (args.length < required) {
			throw new TypeError(required + " argument" + (required > 1 ? "s" : "") + " required, but only " + args.length + " present");
		}
	}
	function toDate(argument) {
		requiredArgs(1, arguments);
		var argStr = Object.prototype.toString.call(argument);
		if (argument instanceof Date || typeof argument === "object" && argStr === "[object Date]") {
			return new Date(argument.getTime());
		} else if (typeof argument === "number" || argStr === "[object Number]") {
			return new Date(argument);
		} else {
			if ((typeof argument === "string" || argStr === "[object String]") && typeof console !== "undefined") {
				console.warn("Starting with v2.0.0-beta.1 date-fns doesn't accept strings as date arguments. Please use `parseISO` to parse strings. See: https://git.io/fjule");
				console.warn((new Error).stack);
			}
			return new Date(NaN);
		}
	}
	function addDays(dirtyDate, dirtyAmount) {
		requiredArgs(2, arguments);
		var date = toDate(dirtyDate);
		var amount = toInteger(dirtyAmount);
		if (isNaN(amount)) {
			return new Date(NaN);
		}
		if (!amount) {
			return date;
		}
		date.setDate(date.getDate() + amount);
		return date;
	}
	function addMonths(dirtyDate, dirtyAmount) {
		requiredArgs(2, arguments);
		var date = toDate(dirtyDate);
		var amount = toInteger(dirtyAmount);
		if (isNaN(amount)) {
			return new Date(NaN);
		}
		if (!amount) {
			return date;
		}
		var dayOfMonth = date.getDate();
		var endOfDesiredMonth = new Date(date.getTime());
		endOfDesiredMonth.setMonth(date.getMonth() + amount + 1, 0);
		var daysInMonth = endOfDesiredMonth.getDate();
		if (dayOfMonth >= daysInMonth) {
			return endOfDesiredMonth;
		} else {
			date.setFullYear(endOfDesiredMonth.getFullYear(), endOfDesiredMonth.getMonth(), dayOfMonth);
			return date;
		}
	}
	function addMilliseconds(dirtyDate, dirtyAmount) {
		requiredArgs(2, arguments);
		var timestamp = toDate(dirtyDate).getTime();
		var amount = toInteger(dirtyAmount);
		return new Date(timestamp + amount);
	}
	var MILLISECONDS_IN_HOUR$3 = 36e5;
	function addHours(dirtyDate, dirtyAmount) {
		requiredArgs(2, arguments);
		var amount = toInteger(dirtyAmount);
		return addMilliseconds(dirtyDate, amount * MILLISECONDS_IN_HOUR$3);
	}
	function startOfWeek(dirtyDate, dirtyOptions) {
		requiredArgs(1, arguments);
		var options = dirtyOptions || {};
		var locale = options.locale;
		var localeWeekStartsOn = locale && locale.options && locale.options.weekStartsOn;
		var defaultWeekStartsOn = localeWeekStartsOn == null ? 0 : toInteger(localeWeekStartsOn);
		var weekStartsOn = options.weekStartsOn == null ? defaultWeekStartsOn : toInteger(options.weekStartsOn);
		if (!(weekStartsOn >= 0 && weekStartsOn <= 6)) {
			throw new RangeError("weekStartsOn must be between 0 and 6 inclusively");
		}
		var date = toDate(dirtyDate);
		var day = date.getDay();
		var diff = (day < weekStartsOn ? 7 : 0) + day - weekStartsOn;
		date.setDate(date.getDate() - diff);
		date.setHours(0, 0, 0, 0);
		return date;
	}
	function getTimezoneOffsetInMilliseconds(date) {
		var utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds()));
		utcDate.setUTCFullYear(date.getFullYear());
		return date.getTime() - utcDate.getTime();
	}
	function startOfDay(dirtyDate) {
		requiredArgs(1, arguments);
		var date = toDate(dirtyDate);
		date.setHours(0, 0, 0, 0);
		return date;
	}
	var MILLISECONDS_IN_DAY$1 = 864e5;
	function differenceInCalendarDays(dirtyDateLeft, dirtyDateRight) {
		requiredArgs(2, arguments);
		var startOfDayLeft = startOfDay(dirtyDateLeft);
		var startOfDayRight = startOfDay(dirtyDateRight);
		var timestampLeft = startOfDayLeft.getTime() - getTimezoneOffsetInMilliseconds(startOfDayLeft);
		var timestampRight = startOfDayRight.getTime() - getTimezoneOffsetInMilliseconds(startOfDayRight);
		return Math.round((timestampLeft - timestampRight) / MILLISECONDS_IN_DAY$1);
	}
	var MILLISECONDS_IN_MINUTE$3 = 6e4;
	function addMinutes(dirtyDate, dirtyAmount) {
		requiredArgs(2, arguments);
		var amount = toInteger(dirtyAmount);
		return addMilliseconds(dirtyDate, amount * MILLISECONDS_IN_MINUTE$3);
	}
	function addQuarters(dirtyDate, dirtyAmount) {
		requiredArgs(2, arguments);
		var amount = toInteger(dirtyAmount);
		var months = amount * 3;
		return addMonths(dirtyDate, months);
	}
	function addSeconds(dirtyDate, dirtyAmount) {
		requiredArgs(2, arguments);
		var amount = toInteger(dirtyAmount);
		return addMilliseconds(dirtyDate, amount * 1e3);
	}
	function addWeeks(dirtyDate, dirtyAmount) {
		requiredArgs(2, arguments);
		var amount = toInteger(dirtyAmount);
		var days = amount * 7;
		return addDays(dirtyDate, days);
	}
	function addYears(dirtyDate, dirtyAmount) {
		requiredArgs(2, arguments);
		var amount = toInteger(dirtyAmount);
		return addMonths(dirtyDate, amount * 12);
	}
	function compareAsc(dirtyDateLeft, dirtyDateRight) {
		requiredArgs(2, arguments);
		var dateLeft = toDate(dirtyDateLeft);
		var dateRight = toDate(dirtyDateRight);
		var diff = dateLeft.getTime() - dateRight.getTime();
		if (diff < 0) {
			return -1;
		} else if (diff > 0) {
			return 1;
		} else {
			return diff;
		}
	}
	function isValid(dirtyDate) {
		requiredArgs(1, arguments);
		var date = toDate(dirtyDate);
		return !isNaN(date);
	}
	function differenceInCalendarMonths(dirtyDateLeft, dirtyDateRight) {
		requiredArgs(2, arguments);
		var dateLeft = toDate(dirtyDateLeft);
		var dateRight = toDate(dirtyDateRight);
		var yearDiff = dateLeft.getFullYear() - dateRight.getFullYear();
		var monthDiff = dateLeft.getMonth() - dateRight.getMonth();
		return yearDiff * 12 + monthDiff;
	}
	function differenceInCalendarYears(dirtyDateLeft, dirtyDateRight) {
		requiredArgs(2, arguments);
		var dateLeft = toDate(dirtyDateLeft);
		var dateRight = toDate(dirtyDateRight);
		return dateLeft.getFullYear() - dateRight.getFullYear();
	}
	function compareLocalAsc(dateLeft, dateRight) {
		var diff = dateLeft.getFullYear() - dateRight.getFullYear() || dateLeft.getMonth() - dateRight.getMonth() || dateLeft.getDate() - dateRight.getDate() || dateLeft.getHours() - dateRight.getHours() || dateLeft.getMinutes() - dateRight.getMinutes() || dateLeft.getSeconds() - dateRight.getSeconds() || dateLeft.getMilliseconds() - dateRight.getMilliseconds();
		if (diff < 0) {
			return -1;
		} else if (diff > 0) {
			return 1;
		} else {
			return diff;
		}
	}
	function differenceInDays(dirtyDateLeft, dirtyDateRight) {
		requiredArgs(2, arguments);
		var dateLeft = toDate(dirtyDateLeft);
		var dateRight = toDate(dirtyDateRight);
		var sign = compareLocalAsc(dateLeft, dateRight);
		var difference = Math.abs(differenceInCalendarDays(dateLeft, dateRight));
		dateLeft.setDate(dateLeft.getDate() - sign * difference);
		var isLastDayNotFull = compareLocalAsc(dateLeft, dateRight) === -sign;
		var result = sign * (difference - isLastDayNotFull);
		return result === 0 ? 0 : result;
	}
	function differenceInMilliseconds(dirtyDateLeft, dirtyDateRight) {
		requiredArgs(2, arguments);
		var dateLeft = toDate(dirtyDateLeft);
		var dateRight = toDate(dirtyDateRight);
		return dateLeft.getTime() - dateRight.getTime();
	}
	var MILLISECONDS_IN_HOUR$2 = 36e5;
	function differenceInHours(dirtyDateLeft, dirtyDateRight) {
		requiredArgs(2, arguments);
		var diff = differenceInMilliseconds(dirtyDateLeft, dirtyDateRight) / MILLISECONDS_IN_HOUR$2;
		return diff > 0 ? Math.floor(diff) : Math.ceil(diff);
	}
	var MILLISECONDS_IN_MINUTE$2 = 6e4;
	function differenceInMinutes(dirtyDateLeft, dirtyDateRight) {
		requiredArgs(2, arguments);
		var diff = differenceInMilliseconds(dirtyDateLeft, dirtyDateRight) / MILLISECONDS_IN_MINUTE$2;
		return diff > 0 ? Math.floor(diff) : Math.ceil(diff);
	}
	function endOfDay(dirtyDate) {
		requiredArgs(1, arguments);
		var date = toDate(dirtyDate);
		date.setHours(23, 59, 59, 999);
		return date;
	}
	function endOfMonth(dirtyDate) {
		requiredArgs(1, arguments);
		var date = toDate(dirtyDate);
		var month = date.getMonth();
		date.setFullYear(date.getFullYear(), month + 1, 0);
		date.setHours(23, 59, 59, 999);
		return date;
	}
	function isLastDayOfMonth(dirtyDate) {
		requiredArgs(1, arguments);
		var date = toDate(dirtyDate);
		return endOfDay(date).getTime() === endOfMonth(date).getTime();
	}
	function differenceInMonths(dirtyDateLeft, dirtyDateRight) {
		requiredArgs(2, arguments);
		var dateLeft = toDate(dirtyDateLeft);
		var dateRight = toDate(dirtyDateRight);
		var sign = compareAsc(dateLeft, dateRight);
		var difference = Math.abs(differenceInCalendarMonths(dateLeft, dateRight));
		var result;
		if (difference < 1) {
			result = 0;
		} else {
			if (dateLeft.getMonth() === 1 && dateLeft.getDate() > 27) {
				dateLeft.setDate(30);
			}
			dateLeft.setMonth(dateLeft.getMonth() - sign * difference);
			var isLastMonthNotFull = compareAsc(dateLeft, dateRight) === -sign;
			if (isLastDayOfMonth(toDate(dirtyDateLeft)) && difference === 1 && compareAsc(dirtyDateLeft, dateRight) === 1) {
				isLastMonthNotFull = false;
			}
			result = sign * (difference - isLastMonthNotFull);
		}
		return result === 0 ? 0 : result;
	}
	function differenceInQuarters(dirtyDateLeft, dirtyDateRight) {
		requiredArgs(2, arguments);
		var diff = differenceInMonths(dirtyDateLeft, dirtyDateRight) / 3;
		return diff > 0 ? Math.floor(diff) : Math.ceil(diff);
	}
	function differenceInSeconds(dirtyDateLeft, dirtyDateRight) {
		requiredArgs(2, arguments);
		var diff = differenceInMilliseconds(dirtyDateLeft, dirtyDateRight) / 1e3;
		return diff > 0 ? Math.floor(diff) : Math.ceil(diff);
	}
	function differenceInWeeks(dirtyDateLeft, dirtyDateRight) {
		requiredArgs(2, arguments);
		var diff = differenceInDays(dirtyDateLeft, dirtyDateRight) / 7;
		return diff > 0 ? Math.floor(diff) : Math.ceil(diff);
	}
	function differenceInYears(dirtyDateLeft, dirtyDateRight) {
		requiredArgs(2, arguments);
		var dateLeft = toDate(dirtyDateLeft);
		var dateRight = toDate(dirtyDateRight);
		var sign = compareAsc(dateLeft, dateRight);
		var difference = Math.abs(differenceInCalendarYears(dateLeft, dateRight));
		dateLeft.setFullYear("1584");
		dateRight.setFullYear("1584");
		var isLastYearNotFull = compareAsc(dateLeft, dateRight) === -sign;
		var result = sign * (difference - isLastYearNotFull);
		return result === 0 ? 0 : result;
	}
	function startOfQuarter(dirtyDate) {
		requiredArgs(1, arguments);
		var date = toDate(dirtyDate);
		var currentMonth = date.getMonth();
		var month = currentMonth - currentMonth % 3;
		date.setMonth(month, 1);
		date.setHours(0, 0, 0, 0);
		return date;
	}
	function startOfMonth(dirtyDate) {
		requiredArgs(1, arguments);
		var date = toDate(dirtyDate);
		date.setDate(1);
		date.setHours(0, 0, 0, 0);
		return date;
	}
	function startOfYear(dirtyDate) {
		requiredArgs(1, arguments);
		var cleanDate = toDate(dirtyDate);
		var date = new Date(0);
		date.setFullYear(cleanDate.getFullYear(), 0, 1);
		date.setHours(0, 0, 0, 0);
		return date;
	}
	function endOfYear(dirtyDate) {
		requiredArgs(1, arguments);
		var date = toDate(dirtyDate);
		var year = date.getFullYear();
		date.setFullYear(year + 1, 0, 0);
		date.setHours(23, 59, 59, 999);
		return date;
	}
	function endOfHour(dirtyDate) {
		requiredArgs(1, arguments);
		var date = toDate(dirtyDate);
		date.setMinutes(59, 59, 999);
		return date;
	}
	function endOfWeek(dirtyDate, dirtyOptions) {
		requiredArgs(1, arguments);
		var options = dirtyOptions || {};
		var locale = options.locale;
		var localeWeekStartsOn = locale && locale.options && locale.options.weekStartsOn;
		var defaultWeekStartsOn = localeWeekStartsOn == null ? 0 : toInteger(localeWeekStartsOn);
		var weekStartsOn = options.weekStartsOn == null ? defaultWeekStartsOn : toInteger(options.weekStartsOn);
		if (!(weekStartsOn >= 0 && weekStartsOn <= 6)) {
			throw new RangeError("weekStartsOn must be between 0 and 6 inclusively");
		}
		var date = toDate(dirtyDate);
		var day = date.getDay();
		var diff = (day < weekStartsOn ? -7 : 0) + 6 - (day - weekStartsOn);
		date.setDate(date.getDate() + diff);
		date.setHours(23, 59, 59, 999);
		return date;
	}
	function endOfMinute(dirtyDate) {
		requiredArgs(1, arguments);
		var date = toDate(dirtyDate);
		date.setSeconds(59, 999);
		return date;
	}
	function endOfQuarter(dirtyDate) {
		requiredArgs(1, arguments);
		var date = toDate(dirtyDate);
		var currentMonth = date.getMonth();
		var month = currentMonth - currentMonth % 3 + 3;
		date.setMonth(month, 0);
		date.setHours(23, 59, 59, 999);
		return date;
	}
	function endOfSecond(dirtyDate) {
		requiredArgs(1, arguments);
		var date = toDate(dirtyDate);
		date.setMilliseconds(999);
		return date;
	}
	var formatDistanceLocale = {
		lessThanXSeconds: {
			one: "less than a second",
			other: "less than {{count}} seconds"
		},
		xSeconds: {
			one: "1 second",
			other: "{{count}} seconds"
		},
		halfAMinute: "half a minute",
		lessThanXMinutes: {
			one: "less than a minute",
			other: "less than {{count}} minutes"
		},
		xMinutes: {
			one: "1 minute",
			other: "{{count}} minutes"
		},
		aboutXHours: {
			one: "about 1 hour",
			other: "about {{count}} hours"
		},
		xHours: {
			one: "1 hour",
			other: "{{count}} hours"
		},
		xDays: {
			one: "1 day",
			other: "{{count}} days"
		},
		aboutXWeeks: {
			one: "about 1 week",
			other: "about {{count}} weeks"
		},
		xWeeks: {
			one: "1 week",
			other: "{{count}} weeks"
		},
		aboutXMonths: {
			one: "about 1 month",
			other: "about {{count}} months"
		},
		xMonths: {
			one: "1 month",
			other: "{{count}} months"
		},
		aboutXYears: {
			one: "about 1 year",
			other: "about {{count}} years"
		},
		xYears: {
			one: "1 year",
			other: "{{count}} years"
		},
		overXYears: {
			one: "over 1 year",
			other: "over {{count}} years"
		},
		almostXYears: {
			one: "almost 1 year",
			other: "almost {{count}} years"
		}
	};
	function formatDistance(token, count, options) {
		options = options || {};
		var result;
		if (typeof formatDistanceLocale[token] === "string") {
			result = formatDistanceLocale[token];
		} else if (count === 1) {
			result = formatDistanceLocale[token].one;
		} else {
			result = formatDistanceLocale[token].other.replace("{{count}}", count);
		}
		if (options.addSuffix) {
			if (options.comparison > 0) {
				return "in " + result;
			} else {
				return result + " ago";
			}
		}
		return result;
	}
	function buildFormatLongFn(args) {
		return function(dirtyOptions) {
			var options = dirtyOptions || {};
			var width = options.width ? String(options.width) : args.defaultWidth;
			var format = args.formats[width] || args.formats[args.defaultWidth];
			return format;
		};
	}
	var dateFormats = {
		full: "EEEE, MMMM do, y",
		long: "MMMM do, y",
		medium: "MMM d, y",
		short: "MM/dd/yyyy"
	};
	var timeFormats = {
		full: "h:mm:ss a zzzz",
		long: "h:mm:ss a z",
		medium: "h:mm:ss a",
		short: "h:mm a"
	};
	var dateTimeFormats = {
		full: "{{date}} 'at' {{time}}",
		long: "{{date}} 'at' {{time}}",
		medium: "{{date}}, {{time}}",
		short: "{{date}}, {{time}}"
	};
	var formatLong = {
		date: buildFormatLongFn({
			formats: dateFormats,
			defaultWidth: "full"
		}),
		time: buildFormatLongFn({
			formats: timeFormats,
			defaultWidth: "full"
		}),
		dateTime: buildFormatLongFn({
			formats: dateTimeFormats,
			defaultWidth: "full"
		})
	};
	var formatRelativeLocale = {
		lastWeek: "'last' eeee 'at' p",
		yesterday: "'yesterday at' p",
		today: "'today at' p",
		tomorrow: "'tomorrow at' p",
		nextWeek: "eeee 'at' p",
		other: "P"
	};
	function formatRelative(token, _date, _baseDate, _options) {
		return formatRelativeLocale[token];
	}
	function buildLocalizeFn(args) {
		return function(dirtyIndex, dirtyOptions) {
			var options = dirtyOptions || {};
			var context = options.context ? String(options.context) : "standalone";
			var valuesArray;
			if (context === "formatting" && args.formattingValues) {
				var defaultWidth = args.defaultFormattingWidth || args.defaultWidth;
				var width = options.width ? String(options.width) : defaultWidth;
				valuesArray = args.formattingValues[width] || args.formattingValues[defaultWidth];
			} else {
				var _defaultWidth = args.defaultWidth;
				var _width = options.width ? String(options.width) : args.defaultWidth;
				valuesArray = args.values[_width] || args.values[_defaultWidth];
			}
			var index = args.argumentCallback ? args.argumentCallback(dirtyIndex) : dirtyIndex;
			return valuesArray[index];
		};
	}
	var eraValues = {
		narrow: [ "B", "A" ],
		abbreviated: [ "BC", "AD" ],
		wide: [ "Before Christ", "Anno Domini" ]
	};
	var quarterValues = {
		narrow: [ "1", "2", "3", "4" ],
		abbreviated: [ "Q1", "Q2", "Q3", "Q4" ],
		wide: [ "1st quarter", "2nd quarter", "3rd quarter", "4th quarter" ]
	};
	var monthValues = {
		narrow: [ "J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D" ],
		abbreviated: [ "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec" ],
		wide: [ "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December" ]
	};
	var dayValues = {
		narrow: [ "S", "M", "T", "W", "T", "F", "S" ],
		short: [ "Su", "Mo", "Tu", "We", "Th", "Fr", "Sa" ],
		abbreviated: [ "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat" ],
		wide: [ "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday" ]
	};
	var dayPeriodValues = {
		narrow: {
			am: "a",
			pm: "p",
			midnight: "mi",
			noon: "n",
			morning: "morning",
			afternoon: "afternoon",
			evening: "evening",
			night: "night"
		},
		abbreviated: {
			am: "AM",
			pm: "PM",
			midnight: "midnight",
			noon: "noon",
			morning: "morning",
			afternoon: "afternoon",
			evening: "evening",
			night: "night"
		},
		wide: {
			am: "a.m.",
			pm: "p.m.",
			midnight: "midnight",
			noon: "noon",
			morning: "morning",
			afternoon: "afternoon",
			evening: "evening",
			night: "night"
		}
	};
	var formattingDayPeriodValues = {
		narrow: {
			am: "a",
			pm: "p",
			midnight: "mi",
			noon: "n",
			morning: "in the morning",
			afternoon: "in the afternoon",
			evening: "in the evening",
			night: "at night"
		},
		abbreviated: {
			am: "AM",
			pm: "PM",
			midnight: "midnight",
			noon: "noon",
			morning: "in the morning",
			afternoon: "in the afternoon",
			evening: "in the evening",
			night: "at night"
		},
		wide: {
			am: "a.m.",
			pm: "p.m.",
			midnight: "midnight",
			noon: "noon",
			morning: "in the morning",
			afternoon: "in the afternoon",
			evening: "in the evening",
			night: "at night"
		}
	};
	function ordinalNumber(dirtyNumber, _dirtyOptions) {
		var number = Number(dirtyNumber);
		var rem100 = number % 100;
		if (rem100 > 20 || rem100 < 10) {
			switch (rem100 % 10) {
			case 1:
				return number + "st";

			case 2:
				return number + "nd";

			case 3:
				return number + "rd";
			}
		}
		return number + "th";
	}
	var localize = {
		ordinalNumber: ordinalNumber,
		era: buildLocalizeFn({
			values: eraValues,
			defaultWidth: "wide"
		}),
		quarter: buildLocalizeFn({
			values: quarterValues,
			defaultWidth: "wide",
			argumentCallback: function(quarter) {
				return Number(quarter) - 1;
			}
		}),
		month: buildLocalizeFn({
			values: monthValues,
			defaultWidth: "wide"
		}),
		day: buildLocalizeFn({
			values: dayValues,
			defaultWidth: "wide"
		}),
		dayPeriod: buildLocalizeFn({
			values: dayPeriodValues,
			defaultWidth: "wide",
			formattingValues: formattingDayPeriodValues,
			defaultFormattingWidth: "wide"
		})
	};
	function buildMatchPatternFn(args) {
		return function(dirtyString, dirtyOptions) {
			var string = String(dirtyString);
			var options = dirtyOptions || {};
			var matchResult = string.match(args.matchPattern);
			if (!matchResult) {
				return null;
			}
			var matchedString = matchResult[0];
			var parseResult = string.match(args.parsePattern);
			if (!parseResult) {
				return null;
			}
			var value = args.valueCallback ? args.valueCallback(parseResult[0]) : parseResult[0];
			value = options.valueCallback ? options.valueCallback(value) : value;
			return {
				value: value,
				rest: string.slice(matchedString.length)
			};
		};
	}
	function buildMatchFn(args) {
		return function(dirtyString, dirtyOptions) {
			var string = String(dirtyString);
			var options = dirtyOptions || {};
			var width = options.width;
			var matchPattern = width && args.matchPatterns[width] || args.matchPatterns[args.defaultMatchWidth];
			var matchResult = string.match(matchPattern);
			if (!matchResult) {
				return null;
			}
			var matchedString = matchResult[0];
			var parsePatterns = width && args.parsePatterns[width] || args.parsePatterns[args.defaultParseWidth];
			var value;
			if (Object.prototype.toString.call(parsePatterns) === "[object Array]") {
				value = findIndex(parsePatterns, (function(pattern) {
					return pattern.test(matchedString);
				}));
			} else {
				value = findKey(parsePatterns, (function(pattern) {
					return pattern.test(matchedString);
				}));
			}
			value = args.valueCallback ? args.valueCallback(value) : value;
			value = options.valueCallback ? options.valueCallback(value) : value;
			return {
				value: value,
				rest: string.slice(matchedString.length)
			};
		};
	}
	function findKey(object, predicate) {
		for (var key in object) {
			if (object.hasOwnProperty(key) && predicate(object[key])) {
				return key;
			}
		}
	}
	function findIndex(array, predicate) {
		for (var key = 0; key < array.length; key++) {
			if (predicate(array[key])) {
				return key;
			}
		}
	}
	var matchOrdinalNumberPattern = /^(\d+)(th|st|nd|rd)?/i;
	var parseOrdinalNumberPattern = /\d+/i;
	var matchEraPatterns = {
		narrow: /^(b|a)/i,
		abbreviated: /^(b\.?\s?c\.?|b\.?\s?c\.?\s?e\.?|a\.?\s?d\.?|c\.?\s?e\.?)/i,
		wide: /^(before christ|before common era|anno domini|common era)/i
	};
	var parseEraPatterns = {
		any: [ /^b/i, /^(a|c)/i ]
	};
	var matchQuarterPatterns = {
		narrow: /^[1234]/i,
		abbreviated: /^q[1234]/i,
		wide: /^[1234](th|st|nd|rd)? quarter/i
	};
	var parseQuarterPatterns = {
		any: [ /1/i, /2/i, /3/i, /4/i ]
	};
	var matchMonthPatterns = {
		narrow: /^[jfmasond]/i,
		abbreviated: /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i,
		wide: /^(january|february|march|april|may|june|july|august|september|october|november|december)/i
	};
	var parseMonthPatterns = {
		narrow: [ /^j/i, /^f/i, /^m/i, /^a/i, /^m/i, /^j/i, /^j/i, /^a/i, /^s/i, /^o/i, /^n/i, /^d/i ],
		any: [ /^ja/i, /^f/i, /^mar/i, /^ap/i, /^may/i, /^jun/i, /^jul/i, /^au/i, /^s/i, /^o/i, /^n/i, /^d/i ]
	};
	var matchDayPatterns = {
		narrow: /^[smtwf]/i,
		short: /^(su|mo|tu|we|th|fr|sa)/i,
		abbreviated: /^(sun|mon|tue|wed|thu|fri|sat)/i,
		wide: /^(sunday|monday|tuesday|wednesday|thursday|friday|saturday)/i
	};
	var parseDayPatterns = {
		narrow: [ /^s/i, /^m/i, /^t/i, /^w/i, /^t/i, /^f/i, /^s/i ],
		any: [ /^su/i, /^m/i, /^tu/i, /^w/i, /^th/i, /^f/i, /^sa/i ]
	};
	var matchDayPeriodPatterns = {
		narrow: /^(a|p|mi|n|(in the|at) (morning|afternoon|evening|night))/i,
		any: /^([ap]\.?\s?m\.?|midnight|noon|(in the|at) (morning|afternoon|evening|night))/i
	};
	var parseDayPeriodPatterns = {
		any: {
			am: /^a/i,
			pm: /^p/i,
			midnight: /^mi/i,
			noon: /^no/i,
			morning: /morning/i,
			afternoon: /afternoon/i,
			evening: /evening/i,
			night: /night/i
		}
	};
	var match = {
		ordinalNumber: buildMatchPatternFn({
			matchPattern: matchOrdinalNumberPattern,
			parsePattern: parseOrdinalNumberPattern,
			valueCallback: function(value) {
				return parseInt(value, 10);
			}
		}),
		era: buildMatchFn({
			matchPatterns: matchEraPatterns,
			defaultMatchWidth: "wide",
			parsePatterns: parseEraPatterns,
			defaultParseWidth: "any"
		}),
		quarter: buildMatchFn({
			matchPatterns: matchQuarterPatterns,
			defaultMatchWidth: "wide",
			parsePatterns: parseQuarterPatterns,
			defaultParseWidth: "any",
			valueCallback: function(index) {
				return index + 1;
			}
		}),
		month: buildMatchFn({
			matchPatterns: matchMonthPatterns,
			defaultMatchWidth: "wide",
			parsePatterns: parseMonthPatterns,
			defaultParseWidth: "any"
		}),
		day: buildMatchFn({
			matchPatterns: matchDayPatterns,
			defaultMatchWidth: "wide",
			parsePatterns: parseDayPatterns,
			defaultParseWidth: "any"
		}),
		dayPeriod: buildMatchFn({
			matchPatterns: matchDayPeriodPatterns,
			defaultMatchWidth: "any",
			parsePatterns: parseDayPeriodPatterns,
			defaultParseWidth: "any"
		})
	};
	var locale = {
		code: "en-US",
		formatDistance: formatDistance,
		formatLong: formatLong,
		formatRelative: formatRelative,
		localize: localize,
		match: match,
		options: {
			weekStartsOn: 0,
			firstWeekContainsDate: 1
		}
	};
	function subMilliseconds(dirtyDate, dirtyAmount) {
		requiredArgs(2, arguments);
		var amount = toInteger(dirtyAmount);
		return addMilliseconds(dirtyDate, -amount);
	}
	function addLeadingZeros(number, targetLength) {
		var sign = number < 0 ? "-" : "";
		var output = Math.abs(number).toString();
		while (output.length < targetLength) {
			output = "0" + output;
		}
		return sign + output;
	}
	var formatters$1 = {
		y: function(date, token) {
			var signedYear = date.getUTCFullYear();
			var year = signedYear > 0 ? signedYear : 1 - signedYear;
			return addLeadingZeros(token === "yy" ? year % 100 : year, token.length);
		},
		M: function(date, token) {
			var month = date.getUTCMonth();
			return token === "M" ? String(month + 1) : addLeadingZeros(month + 1, 2);
		},
		d: function(date, token) {
			return addLeadingZeros(date.getUTCDate(), token.length);
		},
		a: function(date, token) {
			var dayPeriodEnumValue = date.getUTCHours() / 12 >= 1 ? "pm" : "am";
			switch (token) {
			case "a":
			case "aa":
				return dayPeriodEnumValue.toUpperCase();

			case "aaa":
				return dayPeriodEnumValue;

			case "aaaaa":
				return dayPeriodEnumValue[0];

			case "aaaa":
			default:
				return dayPeriodEnumValue === "am" ? "a.m." : "p.m.";
			}
		},
		h: function(date, token) {
			return addLeadingZeros(date.getUTCHours() % 12 || 12, token.length);
		},
		H: function(date, token) {
			return addLeadingZeros(date.getUTCHours(), token.length);
		},
		m: function(date, token) {
			return addLeadingZeros(date.getUTCMinutes(), token.length);
		},
		s: function(date, token) {
			return addLeadingZeros(date.getUTCSeconds(), token.length);
		},
		S: function(date, token) {
			var numberOfDigits = token.length;
			var milliseconds = date.getUTCMilliseconds();
			var fractionalSeconds = Math.floor(milliseconds * Math.pow(10, numberOfDigits - 3));
			return addLeadingZeros(fractionalSeconds, token.length);
		}
	};
	var MILLISECONDS_IN_DAY = 864e5;
	function getUTCDayOfYear(dirtyDate) {
		requiredArgs(1, arguments);
		var date = toDate(dirtyDate);
		var timestamp = date.getTime();
		date.setUTCMonth(0, 1);
		date.setUTCHours(0, 0, 0, 0);
		var startOfYearTimestamp = date.getTime();
		var difference = timestamp - startOfYearTimestamp;
		return Math.floor(difference / MILLISECONDS_IN_DAY) + 1;
	}
	function startOfUTCISOWeek(dirtyDate) {
		requiredArgs(1, arguments);
		var weekStartsOn = 1;
		var date = toDate(dirtyDate);
		var day = date.getUTCDay();
		var diff = (day < weekStartsOn ? 7 : 0) + day - weekStartsOn;
		date.setUTCDate(date.getUTCDate() - diff);
		date.setUTCHours(0, 0, 0, 0);
		return date;
	}
	function getUTCISOWeekYear(dirtyDate) {
		requiredArgs(1, arguments);
		var date = toDate(dirtyDate);
		var year = date.getUTCFullYear();
		var fourthOfJanuaryOfNextYear = new Date(0);
		fourthOfJanuaryOfNextYear.setUTCFullYear(year + 1, 0, 4);
		fourthOfJanuaryOfNextYear.setUTCHours(0, 0, 0, 0);
		var startOfNextYear = startOfUTCISOWeek(fourthOfJanuaryOfNextYear);
		var fourthOfJanuaryOfThisYear = new Date(0);
		fourthOfJanuaryOfThisYear.setUTCFullYear(year, 0, 4);
		fourthOfJanuaryOfThisYear.setUTCHours(0, 0, 0, 0);
		var startOfThisYear = startOfUTCISOWeek(fourthOfJanuaryOfThisYear);
		if (date.getTime() >= startOfNextYear.getTime()) {
			return year + 1;
		} else if (date.getTime() >= startOfThisYear.getTime()) {
			return year;
		} else {
			return year - 1;
		}
	}
	function startOfUTCISOWeekYear(dirtyDate) {
		requiredArgs(1, arguments);
		var year = getUTCISOWeekYear(dirtyDate);
		var fourthOfJanuary = new Date(0);
		fourthOfJanuary.setUTCFullYear(year, 0, 4);
		fourthOfJanuary.setUTCHours(0, 0, 0, 0);
		var date = startOfUTCISOWeek(fourthOfJanuary);
		return date;
	}
	var MILLISECONDS_IN_WEEK$1 = 6048e5;
	function getUTCISOWeek(dirtyDate) {
		requiredArgs(1, arguments);
		var date = toDate(dirtyDate);
		var diff = startOfUTCISOWeek(date).getTime() - startOfUTCISOWeekYear(date).getTime();
		return Math.round(diff / MILLISECONDS_IN_WEEK$1) + 1;
	}
	function startOfUTCWeek(dirtyDate, dirtyOptions) {
		requiredArgs(1, arguments);
		var options = dirtyOptions || {};
		var locale = options.locale;
		var localeWeekStartsOn = locale && locale.options && locale.options.weekStartsOn;
		var defaultWeekStartsOn = localeWeekStartsOn == null ? 0 : toInteger(localeWeekStartsOn);
		var weekStartsOn = options.weekStartsOn == null ? defaultWeekStartsOn : toInteger(options.weekStartsOn);
		if (!(weekStartsOn >= 0 && weekStartsOn <= 6)) {
			throw new RangeError("weekStartsOn must be between 0 and 6 inclusively");
		}
		var date = toDate(dirtyDate);
		var day = date.getUTCDay();
		var diff = (day < weekStartsOn ? 7 : 0) + day - weekStartsOn;
		date.setUTCDate(date.getUTCDate() - diff);
		date.setUTCHours(0, 0, 0, 0);
		return date;
	}
	function getUTCWeekYear(dirtyDate, dirtyOptions) {
		requiredArgs(1, arguments);
		var date = toDate(dirtyDate, dirtyOptions);
		var year = date.getUTCFullYear();
		var options = dirtyOptions || {};
		var locale = options.locale;
		var localeFirstWeekContainsDate = locale && locale.options && locale.options.firstWeekContainsDate;
		var defaultFirstWeekContainsDate = localeFirstWeekContainsDate == null ? 1 : toInteger(localeFirstWeekContainsDate);
		var firstWeekContainsDate = options.firstWeekContainsDate == null ? defaultFirstWeekContainsDate : toInteger(options.firstWeekContainsDate);
		if (!(firstWeekContainsDate >= 1 && firstWeekContainsDate <= 7)) {
			throw new RangeError("firstWeekContainsDate must be between 1 and 7 inclusively");
		}
		var firstWeekOfNextYear = new Date(0);
		firstWeekOfNextYear.setUTCFullYear(year + 1, 0, firstWeekContainsDate);
		firstWeekOfNextYear.setUTCHours(0, 0, 0, 0);
		var startOfNextYear = startOfUTCWeek(firstWeekOfNextYear, dirtyOptions);
		var firstWeekOfThisYear = new Date(0);
		firstWeekOfThisYear.setUTCFullYear(year, 0, firstWeekContainsDate);
		firstWeekOfThisYear.setUTCHours(0, 0, 0, 0);
		var startOfThisYear = startOfUTCWeek(firstWeekOfThisYear, dirtyOptions);
		if (date.getTime() >= startOfNextYear.getTime()) {
			return year + 1;
		} else if (date.getTime() >= startOfThisYear.getTime()) {
			return year;
		} else {
			return year - 1;
		}
	}
	function startOfUTCWeekYear(dirtyDate, dirtyOptions) {
		requiredArgs(1, arguments);
		var options = dirtyOptions || {};
		var locale = options.locale;
		var localeFirstWeekContainsDate = locale && locale.options && locale.options.firstWeekContainsDate;
		var defaultFirstWeekContainsDate = localeFirstWeekContainsDate == null ? 1 : toInteger(localeFirstWeekContainsDate);
		var firstWeekContainsDate = options.firstWeekContainsDate == null ? defaultFirstWeekContainsDate : toInteger(options.firstWeekContainsDate);
		var year = getUTCWeekYear(dirtyDate, dirtyOptions);
		var firstWeek = new Date(0);
		firstWeek.setUTCFullYear(year, 0, firstWeekContainsDate);
		firstWeek.setUTCHours(0, 0, 0, 0);
		var date = startOfUTCWeek(firstWeek, dirtyOptions);
		return date;
	}
	var MILLISECONDS_IN_WEEK = 6048e5;
	function getUTCWeek(dirtyDate, options) {
		requiredArgs(1, arguments);
		var date = toDate(dirtyDate);
		var diff = startOfUTCWeek(date, options).getTime() - startOfUTCWeekYear(date, options).getTime();
		return Math.round(diff / MILLISECONDS_IN_WEEK) + 1;
	}
	var dayPeriodEnum = {
		am: "am",
		pm: "pm",
		midnight: "midnight",
		noon: "noon",
		morning: "morning",
		afternoon: "afternoon",
		evening: "evening",
		night: "night"
	};
	var formatters = {
		G: function(date, token, localize) {
			var era = date.getUTCFullYear() > 0 ? 1 : 0;
			switch (token) {
			case "G":
			case "GG":
			case "GGG":
				return localize.era(era, {
					width: "abbreviated"
				});

			case "GGGGG":
				return localize.era(era, {
					width: "narrow"
				});

			case "GGGG":
			default:
				return localize.era(era, {
					width: "wide"
				});
			}
		},
		y: function(date, token, localize) {
			if (token === "yo") {
				var signedYear = date.getUTCFullYear();
				var year = signedYear > 0 ? signedYear : 1 - signedYear;
				return localize.ordinalNumber(year, {
					unit: "year"
				});
			}
			return formatters$1.y(date, token);
		},
		Y: function(date, token, localize, options) {
			var signedWeekYear = getUTCWeekYear(date, options);
			var weekYear = signedWeekYear > 0 ? signedWeekYear : 1 - signedWeekYear;
			if (token === "YY") {
				var twoDigitYear = weekYear % 100;
				return addLeadingZeros(twoDigitYear, 2);
			}
			if (token === "Yo") {
				return localize.ordinalNumber(weekYear, {
					unit: "year"
				});
			}
			return addLeadingZeros(weekYear, token.length);
		},
		R: function(date, token) {
			var isoWeekYear = getUTCISOWeekYear(date);
			return addLeadingZeros(isoWeekYear, token.length);
		},
		u: function(date, token) {
			var year = date.getUTCFullYear();
			return addLeadingZeros(year, token.length);
		},
		Q: function(date, token, localize) {
			var quarter = Math.ceil((date.getUTCMonth() + 1) / 3);
			switch (token) {
			case "Q":
				return String(quarter);

			case "QQ":
				return addLeadingZeros(quarter, 2);

			case "Qo":
				return localize.ordinalNumber(quarter, {
					unit: "quarter"
				});

			case "QQQ":
				return localize.quarter(quarter, {
					width: "abbreviated",
					context: "formatting"
				});

			case "QQQQQ":
				return localize.quarter(quarter, {
					width: "narrow",
					context: "formatting"
				});

			case "QQQQ":
			default:
				return localize.quarter(quarter, {
					width: "wide",
					context: "formatting"
				});
			}
		},
		q: function(date, token, localize) {
			var quarter = Math.ceil((date.getUTCMonth() + 1) / 3);
			switch (token) {
			case "q":
				return String(quarter);

			case "qq":
				return addLeadingZeros(quarter, 2);

			case "qo":
				return localize.ordinalNumber(quarter, {
					unit: "quarter"
				});

			case "qqq":
				return localize.quarter(quarter, {
					width: "abbreviated",
					context: "standalone"
				});

			case "qqqqq":
				return localize.quarter(quarter, {
					width: "narrow",
					context: "standalone"
				});

			case "qqqq":
			default:
				return localize.quarter(quarter, {
					width: "wide",
					context: "standalone"
				});
			}
		},
		M: function(date, token, localize) {
			var month = date.getUTCMonth();
			switch (token) {
			case "M":
			case "MM":
				return formatters$1.M(date, token);

			case "Mo":
				return localize.ordinalNumber(month + 1, {
					unit: "month"
				});

			case "MMM":
				return localize.month(month, {
					width: "abbreviated",
					context: "formatting"
				});

			case "MMMMM":
				return localize.month(month, {
					width: "narrow",
					context: "formatting"
				});

			case "MMMM":
			default:
				return localize.month(month, {
					width: "wide",
					context: "formatting"
				});
			}
		},
		L: function(date, token, localize) {
			var month = date.getUTCMonth();
			switch (token) {
			case "L":
				return String(month + 1);

			case "LL":
				return addLeadingZeros(month + 1, 2);

			case "Lo":
				return localize.ordinalNumber(month + 1, {
					unit: "month"
				});

			case "LLL":
				return localize.month(month, {
					width: "abbreviated",
					context: "standalone"
				});

			case "LLLLL":
				return localize.month(month, {
					width: "narrow",
					context: "standalone"
				});

			case "LLLL":
			default:
				return localize.month(month, {
					width: "wide",
					context: "standalone"
				});
			}
		},
		w: function(date, token, localize, options) {
			var week = getUTCWeek(date, options);
			if (token === "wo") {
				return localize.ordinalNumber(week, {
					unit: "week"
				});
			}
			return addLeadingZeros(week, token.length);
		},
		I: function(date, token, localize) {
			var isoWeek = getUTCISOWeek(date);
			if (token === "Io") {
				return localize.ordinalNumber(isoWeek, {
					unit: "week"
				});
			}
			return addLeadingZeros(isoWeek, token.length);
		},
		d: function(date, token, localize) {
			if (token === "do") {
				return localize.ordinalNumber(date.getUTCDate(), {
					unit: "date"
				});
			}
			return formatters$1.d(date, token);
		},
		D: function(date, token, localize) {
			var dayOfYear = getUTCDayOfYear(date);
			if (token === "Do") {
				return localize.ordinalNumber(dayOfYear, {
					unit: "dayOfYear"
				});
			}
			return addLeadingZeros(dayOfYear, token.length);
		},
		E: function(date, token, localize) {
			var dayOfWeek = date.getUTCDay();
			switch (token) {
			case "E":
			case "EE":
			case "EEE":
				return localize.day(dayOfWeek, {
					width: "abbreviated",
					context: "formatting"
				});

			case "EEEEE":
				return localize.day(dayOfWeek, {
					width: "narrow",
					context: "formatting"
				});

			case "EEEEEE":
				return localize.day(dayOfWeek, {
					width: "short",
					context: "formatting"
				});

			case "EEEE":
			default:
				return localize.day(dayOfWeek, {
					width: "wide",
					context: "formatting"
				});
			}
		},
		e: function(date, token, localize, options) {
			var dayOfWeek = date.getUTCDay();
			var localDayOfWeek = (dayOfWeek - options.weekStartsOn + 8) % 7 || 7;
			switch (token) {
			case "e":
				return String(localDayOfWeek);

			case "ee":
				return addLeadingZeros(localDayOfWeek, 2);

			case "eo":
				return localize.ordinalNumber(localDayOfWeek, {
					unit: "day"
				});

			case "eee":
				return localize.day(dayOfWeek, {
					width: "abbreviated",
					context: "formatting"
				});

			case "eeeee":
				return localize.day(dayOfWeek, {
					width: "narrow",
					context: "formatting"
				});

			case "eeeeee":
				return localize.day(dayOfWeek, {
					width: "short",
					context: "formatting"
				});

			case "eeee":
			default:
				return localize.day(dayOfWeek, {
					width: "wide",
					context: "formatting"
				});
			}
		},
		c: function(date, token, localize, options) {
			var dayOfWeek = date.getUTCDay();
			var localDayOfWeek = (dayOfWeek - options.weekStartsOn + 8) % 7 || 7;
			switch (token) {
			case "c":
				return String(localDayOfWeek);

			case "cc":
				return addLeadingZeros(localDayOfWeek, token.length);

			case "co":
				return localize.ordinalNumber(localDayOfWeek, {
					unit: "day"
				});

			case "ccc":
				return localize.day(dayOfWeek, {
					width: "abbreviated",
					context: "standalone"
				});

			case "ccccc":
				return localize.day(dayOfWeek, {
					width: "narrow",
					context: "standalone"
				});

			case "cccccc":
				return localize.day(dayOfWeek, {
					width: "short",
					context: "standalone"
				});

			case "cccc":
			default:
				return localize.day(dayOfWeek, {
					width: "wide",
					context: "standalone"
				});
			}
		},
		i: function(date, token, localize) {
			var dayOfWeek = date.getUTCDay();
			var isoDayOfWeek = dayOfWeek === 0 ? 7 : dayOfWeek;
			switch (token) {
			case "i":
				return String(isoDayOfWeek);

			case "ii":
				return addLeadingZeros(isoDayOfWeek, token.length);

			case "io":
				return localize.ordinalNumber(isoDayOfWeek, {
					unit: "day"
				});

			case "iii":
				return localize.day(dayOfWeek, {
					width: "abbreviated",
					context: "formatting"
				});

			case "iiiii":
				return localize.day(dayOfWeek, {
					width: "narrow",
					context: "formatting"
				});

			case "iiiiii":
				return localize.day(dayOfWeek, {
					width: "short",
					context: "formatting"
				});

			case "iiii":
			default:
				return localize.day(dayOfWeek, {
					width: "wide",
					context: "formatting"
				});
			}
		},
		a: function(date, token, localize) {
			var hours = date.getUTCHours();
			var dayPeriodEnumValue = hours / 12 >= 1 ? "pm" : "am";
			switch (token) {
			case "a":
			case "aa":
				return localize.dayPeriod(dayPeriodEnumValue, {
					width: "abbreviated",
					context: "formatting"
				});

			case "aaa":
				return localize.dayPeriod(dayPeriodEnumValue, {
					width: "abbreviated",
					context: "formatting"
				}).toLowerCase();

			case "aaaaa":
				return localize.dayPeriod(dayPeriodEnumValue, {
					width: "narrow",
					context: "formatting"
				});

			case "aaaa":
			default:
				return localize.dayPeriod(dayPeriodEnumValue, {
					width: "wide",
					context: "formatting"
				});
			}
		},
		b: function(date, token, localize) {
			var hours = date.getUTCHours();
			var dayPeriodEnumValue;
			if (hours === 12) {
				dayPeriodEnumValue = dayPeriodEnum.noon;
			} else if (hours === 0) {
				dayPeriodEnumValue = dayPeriodEnum.midnight;
			} else {
				dayPeriodEnumValue = hours / 12 >= 1 ? "pm" : "am";
			}
			switch (token) {
			case "b":
			case "bb":
				return localize.dayPeriod(dayPeriodEnumValue, {
					width: "abbreviated",
					context: "formatting"
				});

			case "bbb":
				return localize.dayPeriod(dayPeriodEnumValue, {
					width: "abbreviated",
					context: "formatting"
				}).toLowerCase();

			case "bbbbb":
				return localize.dayPeriod(dayPeriodEnumValue, {
					width: "narrow",
					context: "formatting"
				});

			case "bbbb":
			default:
				return localize.dayPeriod(dayPeriodEnumValue, {
					width: "wide",
					context: "formatting"
				});
			}
		},
		B: function(date, token, localize) {
			var hours = date.getUTCHours();
			var dayPeriodEnumValue;
			if (hours >= 17) {
				dayPeriodEnumValue = dayPeriodEnum.evening;
			} else if (hours >= 12) {
				dayPeriodEnumValue = dayPeriodEnum.afternoon;
			} else if (hours >= 4) {
				dayPeriodEnumValue = dayPeriodEnum.morning;
			} else {
				dayPeriodEnumValue = dayPeriodEnum.night;
			}
			switch (token) {
			case "B":
			case "BB":
			case "BBB":
				return localize.dayPeriod(dayPeriodEnumValue, {
					width: "abbreviated",
					context: "formatting"
				});

			case "BBBBB":
				return localize.dayPeriod(dayPeriodEnumValue, {
					width: "narrow",
					context: "formatting"
				});

			case "BBBB":
			default:
				return localize.dayPeriod(dayPeriodEnumValue, {
					width: "wide",
					context: "formatting"
				});
			}
		},
		h: function(date, token, localize) {
			if (token === "ho") {
				var hours = date.getUTCHours() % 12;
				if (hours === 0) hours = 12;
				return localize.ordinalNumber(hours, {
					unit: "hour"
				});
			}
			return formatters$1.h(date, token);
		},
		H: function(date, token, localize) {
			if (token === "Ho") {
				return localize.ordinalNumber(date.getUTCHours(), {
					unit: "hour"
				});
			}
			return formatters$1.H(date, token);
		},
		K: function(date, token, localize) {
			var hours = date.getUTCHours() % 12;
			if (token === "Ko") {
				return localize.ordinalNumber(hours, {
					unit: "hour"
				});
			}
			return addLeadingZeros(hours, token.length);
		},
		k: function(date, token, localize) {
			var hours = date.getUTCHours();
			if (hours === 0) hours = 24;
			if (token === "ko") {
				return localize.ordinalNumber(hours, {
					unit: "hour"
				});
			}
			return addLeadingZeros(hours, token.length);
		},
		m: function(date, token, localize) {
			if (token === "mo") {
				return localize.ordinalNumber(date.getUTCMinutes(), {
					unit: "minute"
				});
			}
			return formatters$1.m(date, token);
		},
		s: function(date, token, localize) {
			if (token === "so") {
				return localize.ordinalNumber(date.getUTCSeconds(), {
					unit: "second"
				});
			}
			return formatters$1.s(date, token);
		},
		S: function(date, token) {
			return formatters$1.S(date, token);
		},
		X: function(date, token, _localize, options) {
			var originalDate = options._originalDate || date;
			var timezoneOffset = originalDate.getTimezoneOffset();
			if (timezoneOffset === 0) {
				return "Z";
			}
			switch (token) {
			case "X":
				return formatTimezoneWithOptionalMinutes(timezoneOffset);

			case "XXXX":
			case "XX":
				return formatTimezone(timezoneOffset);

			case "XXXXX":
			case "XXX":
			default:
				return formatTimezone(timezoneOffset, ":");
			}
		},
		x: function(date, token, _localize, options) {
			var originalDate = options._originalDate || date;
			var timezoneOffset = originalDate.getTimezoneOffset();
			switch (token) {
			case "x":
				return formatTimezoneWithOptionalMinutes(timezoneOffset);

			case "xxxx":
			case "xx":
				return formatTimezone(timezoneOffset);

			case "xxxxx":
			case "xxx":
			default:
				return formatTimezone(timezoneOffset, ":");
			}
		},
		O: function(date, token, _localize, options) {
			var originalDate = options._originalDate || date;
			var timezoneOffset = originalDate.getTimezoneOffset();
			switch (token) {
			case "O":
			case "OO":
			case "OOO":
				return "GMT" + formatTimezoneShort(timezoneOffset, ":");

			case "OOOO":
			default:
				return "GMT" + formatTimezone(timezoneOffset, ":");
			}
		},
		z: function(date, token, _localize, options) {
			var originalDate = options._originalDate || date;
			var timezoneOffset = originalDate.getTimezoneOffset();
			switch (token) {
			case "z":
			case "zz":
			case "zzz":
				return "GMT" + formatTimezoneShort(timezoneOffset, ":");

			case "zzzz":
			default:
				return "GMT" + formatTimezone(timezoneOffset, ":");
			}
		},
		t: function(date, token, _localize, options) {
			var originalDate = options._originalDate || date;
			var timestamp = Math.floor(originalDate.getTime() / 1e3);
			return addLeadingZeros(timestamp, token.length);
		},
		T: function(date, token, _localize, options) {
			var originalDate = options._originalDate || date;
			var timestamp = originalDate.getTime();
			return addLeadingZeros(timestamp, token.length);
		}
	};
	function formatTimezoneShort(offset, dirtyDelimiter) {
		var sign = offset > 0 ? "-" : "+";
		var absOffset = Math.abs(offset);
		var hours = Math.floor(absOffset / 60);
		var minutes = absOffset % 60;
		if (minutes === 0) {
			return sign + String(hours);
		}
		var delimiter = dirtyDelimiter || "";
		return sign + String(hours) + delimiter + addLeadingZeros(minutes, 2);
	}
	function formatTimezoneWithOptionalMinutes(offset, dirtyDelimiter) {
		if (offset % 60 === 0) {
			var sign = offset > 0 ? "-" : "+";
			return sign + addLeadingZeros(Math.abs(offset) / 60, 2);
		}
		return formatTimezone(offset, dirtyDelimiter);
	}
	function formatTimezone(offset, dirtyDelimiter) {
		var delimiter = dirtyDelimiter || "";
		var sign = offset > 0 ? "-" : "+";
		var absOffset = Math.abs(offset);
		var hours = addLeadingZeros(Math.floor(absOffset / 60), 2);
		var minutes = addLeadingZeros(absOffset % 60, 2);
		return sign + hours + delimiter + minutes;
	}
	function dateLongFormatter(pattern, formatLong) {
		switch (pattern) {
		case "P":
			return formatLong.date({
				width: "short"
			});

		case "PP":
			return formatLong.date({
				width: "medium"
			});

		case "PPP":
			return formatLong.date({
				width: "long"
			});

		case "PPPP":
		default:
			return formatLong.date({
				width: "full"
			});
		}
	}
	function timeLongFormatter(pattern, formatLong) {
		switch (pattern) {
		case "p":
			return formatLong.time({
				width: "short"
			});

		case "pp":
			return formatLong.time({
				width: "medium"
			});

		case "ppp":
			return formatLong.time({
				width: "long"
			});

		case "pppp":
		default:
			return formatLong.time({
				width: "full"
			});
		}
	}
	function dateTimeLongFormatter(pattern, formatLong) {
		var matchResult = pattern.match(/(P+)(p+)?/);
		var datePattern = matchResult[1];
		var timePattern = matchResult[2];
		if (!timePattern) {
			return dateLongFormatter(pattern, formatLong);
		}
		var dateTimeFormat;
		switch (datePattern) {
		case "P":
			dateTimeFormat = formatLong.dateTime({
				width: "short"
			});
			break;

		case "PP":
			dateTimeFormat = formatLong.dateTime({
				width: "medium"
			});
			break;

		case "PPP":
			dateTimeFormat = formatLong.dateTime({
				width: "long"
			});
			break;

		case "PPPP":
		default:
			dateTimeFormat = formatLong.dateTime({
				width: "full"
			});
			break;
		}
		return dateTimeFormat.replace("{{date}}", dateLongFormatter(datePattern, formatLong)).replace("{{time}}", timeLongFormatter(timePattern, formatLong));
	}
	var longFormatters = {
		p: timeLongFormatter,
		P: dateTimeLongFormatter
	};
	var protectedDayOfYearTokens = [ "D", "DD" ];
	var protectedWeekYearTokens = [ "YY", "YYYY" ];
	function isProtectedDayOfYearToken(token) {
		return protectedDayOfYearTokens.indexOf(token) !== -1;
	}
	function isProtectedWeekYearToken(token) {
		return protectedWeekYearTokens.indexOf(token) !== -1;
	}
	function throwProtectedError(token, format, input) {
		if (token === "YYYY") {
			throw new RangeError("Use `yyyy` instead of `YYYY` (in `".concat(format, "`) for formatting years to the input `").concat(input, "`; see: https://git.io/fxCyr"));
		} else if (token === "YY") {
			throw new RangeError("Use `yy` instead of `YY` (in `".concat(format, "`) for formatting years to the input `").concat(input, "`; see: https://git.io/fxCyr"));
		} else if (token === "D") {
			throw new RangeError("Use `d` instead of `D` (in `".concat(format, "`) for formatting days of the month to the input `").concat(input, "`; see: https://git.io/fxCyr"));
		} else if (token === "DD") {
			throw new RangeError("Use `dd` instead of `DD` (in `".concat(format, "`) for formatting days of the month to the input `").concat(input, "`; see: https://git.io/fxCyr"));
		}
	}
	var formattingTokensRegExp$1 = /[yYQqMLwIdDecihHKkms]o|(\w)\1*|''|'(''|[^'])+('|$)|./g;
	var longFormattingTokensRegExp$1 = /P+p+|P+|p+|''|'(''|[^'])+('|$)|./g;
	var escapedStringRegExp$1 = /^'([^]*?)'?$/;
	var doubleQuoteRegExp$1 = /''/g;
	var unescapedLatinCharacterRegExp$1 = /[a-zA-Z]/;
	function format(dirtyDate, dirtyFormatStr, dirtyOptions) {
		requiredArgs(2, arguments);
		var formatStr = String(dirtyFormatStr);
		var options = dirtyOptions || {};
		var locale$1 = options.locale || locale;
		var localeFirstWeekContainsDate = locale$1.options && locale$1.options.firstWeekContainsDate;
		var defaultFirstWeekContainsDate = localeFirstWeekContainsDate == null ? 1 : toInteger(localeFirstWeekContainsDate);
		var firstWeekContainsDate = options.firstWeekContainsDate == null ? defaultFirstWeekContainsDate : toInteger(options.firstWeekContainsDate);
		if (!(firstWeekContainsDate >= 1 && firstWeekContainsDate <= 7)) {
			throw new RangeError("firstWeekContainsDate must be between 1 and 7 inclusively");
		}
		var localeWeekStartsOn = locale$1.options && locale$1.options.weekStartsOn;
		var defaultWeekStartsOn = localeWeekStartsOn == null ? 0 : toInteger(localeWeekStartsOn);
		var weekStartsOn = options.weekStartsOn == null ? defaultWeekStartsOn : toInteger(options.weekStartsOn);
		if (!(weekStartsOn >= 0 && weekStartsOn <= 6)) {
			throw new RangeError("weekStartsOn must be between 0 and 6 inclusively");
		}
		if (!locale$1.localize) {
			throw new RangeError("locale must contain localize property");
		}
		if (!locale$1.formatLong) {
			throw new RangeError("locale must contain formatLong property");
		}
		var originalDate = toDate(dirtyDate);
		if (!isValid(originalDate)) {
			throw new RangeError("Invalid time value");
		}
		var timezoneOffset = getTimezoneOffsetInMilliseconds(originalDate);
		var utcDate = subMilliseconds(originalDate, timezoneOffset);
		var formatterOptions = {
			firstWeekContainsDate: firstWeekContainsDate,
			weekStartsOn: weekStartsOn,
			locale: locale$1,
			_originalDate: originalDate
		};
		var result = formatStr.match(longFormattingTokensRegExp$1).map((function(substring) {
			var firstCharacter = substring[0];
			if (firstCharacter === "p" || firstCharacter === "P") {
				var longFormatter = longFormatters[firstCharacter];
				return longFormatter(substring, locale$1.formatLong, formatterOptions);
			}
			return substring;
		})).join("").match(formattingTokensRegExp$1).map((function(substring) {
			if (substring === "''") {
				return "'";
			}
			var firstCharacter = substring[0];
			if (firstCharacter === "'") {
				return cleanEscapedString$1(substring);
			}
			var formatter = formatters[firstCharacter];
			if (formatter) {
				if (!options.useAdditionalWeekYearTokens && isProtectedWeekYearToken(substring)) {
					throwProtectedError(substring, dirtyFormatStr, dirtyDate);
				}
				if (!options.useAdditionalDayOfYearTokens && isProtectedDayOfYearToken(substring)) {
					throwProtectedError(substring, dirtyFormatStr, dirtyDate);
				}
				return formatter(utcDate, substring, locale$1.localize, formatterOptions);
			}
			if (firstCharacter.match(unescapedLatinCharacterRegExp$1)) {
				throw new RangeError("Format string contains an unescaped latin alphabet character `" + firstCharacter + "`");
			}
			return substring;
		})).join("");
		return result;
	}
	function cleanEscapedString$1(input) {
		return input.match(escapedStringRegExp$1)[1].replace(doubleQuoteRegExp$1, "'");
	}
	function assign(target, dirtyObject) {
		if (target == null) {
			throw new TypeError("assign requires that input parameter not be null or undefined");
		}
		dirtyObject = dirtyObject || {};
		for (var property in dirtyObject) {
			if (dirtyObject.hasOwnProperty(property)) {
				target[property] = dirtyObject[property];
			}
		}
		return target;
	}
	function setUTCDay(dirtyDate, dirtyDay, dirtyOptions) {
		requiredArgs(2, arguments);
		var options = dirtyOptions || {};
		var locale = options.locale;
		var localeWeekStartsOn = locale && locale.options && locale.options.weekStartsOn;
		var defaultWeekStartsOn = localeWeekStartsOn == null ? 0 : toInteger(localeWeekStartsOn);
		var weekStartsOn = options.weekStartsOn == null ? defaultWeekStartsOn : toInteger(options.weekStartsOn);
		if (!(weekStartsOn >= 0 && weekStartsOn <= 6)) {
			throw new RangeError("weekStartsOn must be between 0 and 6 inclusively");
		}
		var date = toDate(dirtyDate);
		var day = toInteger(dirtyDay);
		var currentDay = date.getUTCDay();
		var remainder = day % 7;
		var dayIndex = (remainder + 7) % 7;
		var diff = (dayIndex < weekStartsOn ? 7 : 0) + day - currentDay;
		date.setUTCDate(date.getUTCDate() + diff);
		return date;
	}
	function setUTCISODay(dirtyDate, dirtyDay) {
		requiredArgs(2, arguments);
		var day = toInteger(dirtyDay);
		if (day % 7 === 0) {
			day = day - 7;
		}
		var weekStartsOn = 1;
		var date = toDate(dirtyDate);
		var currentDay = date.getUTCDay();
		var remainder = day % 7;
		var dayIndex = (remainder + 7) % 7;
		var diff = (dayIndex < weekStartsOn ? 7 : 0) + day - currentDay;
		date.setUTCDate(date.getUTCDate() + diff);
		return date;
	}
	function setUTCISOWeek(dirtyDate, dirtyISOWeek) {
		requiredArgs(2, arguments);
		var date = toDate(dirtyDate);
		var isoWeek = toInteger(dirtyISOWeek);
		var diff = getUTCISOWeek(date) - isoWeek;
		date.setUTCDate(date.getUTCDate() - diff * 7);
		return date;
	}
	function setUTCWeek(dirtyDate, dirtyWeek, options) {
		requiredArgs(2, arguments);
		var date = toDate(dirtyDate);
		var week = toInteger(dirtyWeek);
		var diff = getUTCWeek(date, options) - week;
		date.setUTCDate(date.getUTCDate() - diff * 7);
		return date;
	}
	var MILLISECONDS_IN_HOUR$1 = 36e5;
	var MILLISECONDS_IN_MINUTE$1 = 6e4;
	var MILLISECONDS_IN_SECOND = 1e3;
	var numericPatterns = {
		month: /^(1[0-2]|0?\d)/,
		date: /^(3[0-1]|[0-2]?\d)/,
		dayOfYear: /^(36[0-6]|3[0-5]\d|[0-2]?\d?\d)/,
		week: /^(5[0-3]|[0-4]?\d)/,
		hour23h: /^(2[0-3]|[0-1]?\d)/,
		hour24h: /^(2[0-4]|[0-1]?\d)/,
		hour11h: /^(1[0-1]|0?\d)/,
		hour12h: /^(1[0-2]|0?\d)/,
		minute: /^[0-5]?\d/,
		second: /^[0-5]?\d/,
		singleDigit: /^\d/,
		twoDigits: /^\d{1,2}/,
		threeDigits: /^\d{1,3}/,
		fourDigits: /^\d{1,4}/,
		anyDigitsSigned: /^-?\d+/,
		singleDigitSigned: /^-?\d/,
		twoDigitsSigned: /^-?\d{1,2}/,
		threeDigitsSigned: /^-?\d{1,3}/,
		fourDigitsSigned: /^-?\d{1,4}/
	};
	var timezonePatterns = {
		basicOptionalMinutes: /^([+-])(\d{2})(\d{2})?|Z/,
		basic: /^([+-])(\d{2})(\d{2})|Z/,
		basicOptionalSeconds: /^([+-])(\d{2})(\d{2})((\d{2}))?|Z/,
		extended: /^([+-])(\d{2}):(\d{2})|Z/,
		extendedOptionalSeconds: /^([+-])(\d{2}):(\d{2})(:(\d{2}))?|Z/
	};
	function parseNumericPattern(pattern, string, valueCallback) {
		var matchResult = string.match(pattern);
		if (!matchResult) {
			return null;
		}
		var value = parseInt(matchResult[0], 10);
		return {
			value: valueCallback ? valueCallback(value) : value,
			rest: string.slice(matchResult[0].length)
		};
	}
	function parseTimezonePattern(pattern, string) {
		var matchResult = string.match(pattern);
		if (!matchResult) {
			return null;
		}
		if (matchResult[0] === "Z") {
			return {
				value: 0,
				rest: string.slice(1)
			};
		}
		var sign = matchResult[1] === "+" ? 1 : -1;
		var hours = matchResult[2] ? parseInt(matchResult[2], 10) : 0;
		var minutes = matchResult[3] ? parseInt(matchResult[3], 10) : 0;
		var seconds = matchResult[5] ? parseInt(matchResult[5], 10) : 0;
		return {
			value: sign * (hours * MILLISECONDS_IN_HOUR$1 + minutes * MILLISECONDS_IN_MINUTE$1 + seconds * MILLISECONDS_IN_SECOND),
			rest: string.slice(matchResult[0].length)
		};
	}
	function parseAnyDigitsSigned(string, valueCallback) {
		return parseNumericPattern(numericPatterns.anyDigitsSigned, string, valueCallback);
	}
	function parseNDigits(n, string, valueCallback) {
		switch (n) {
		case 1:
			return parseNumericPattern(numericPatterns.singleDigit, string, valueCallback);

		case 2:
			return parseNumericPattern(numericPatterns.twoDigits, string, valueCallback);

		case 3:
			return parseNumericPattern(numericPatterns.threeDigits, string, valueCallback);

		case 4:
			return parseNumericPattern(numericPatterns.fourDigits, string, valueCallback);

		default:
			return parseNumericPattern(new RegExp("^\\d{1," + n + "}"), string, valueCallback);
		}
	}
	function parseNDigitsSigned(n, string, valueCallback) {
		switch (n) {
		case 1:
			return parseNumericPattern(numericPatterns.singleDigitSigned, string, valueCallback);

		case 2:
			return parseNumericPattern(numericPatterns.twoDigitsSigned, string, valueCallback);

		case 3:
			return parseNumericPattern(numericPatterns.threeDigitsSigned, string, valueCallback);

		case 4:
			return parseNumericPattern(numericPatterns.fourDigitsSigned, string, valueCallback);

		default:
			return parseNumericPattern(new RegExp("^-?\\d{1," + n + "}"), string, valueCallback);
		}
	}
	function dayPeriodEnumToHours(enumValue) {
		switch (enumValue) {
		case "morning":
			return 4;

		case "evening":
			return 17;

		case "pm":
		case "noon":
		case "afternoon":
			return 12;

		case "am":
		case "midnight":
		case "night":
		default:
			return 0;
		}
	}
	function normalizeTwoDigitYear(twoDigitYear, currentYear) {
		var isCommonEra = currentYear > 0;
		var absCurrentYear = isCommonEra ? currentYear : 1 - currentYear;
		var result;
		if (absCurrentYear <= 50) {
			result = twoDigitYear || 100;
		} else {
			var rangeEnd = absCurrentYear + 50;
			var rangeEndCentury = Math.floor(rangeEnd / 100) * 100;
			var isPreviousCentury = twoDigitYear >= rangeEnd % 100;
			result = twoDigitYear + rangeEndCentury - (isPreviousCentury ? 100 : 0);
		}
		return isCommonEra ? result : 1 - result;
	}
	var DAYS_IN_MONTH = [ 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31 ];
	var DAYS_IN_MONTH_LEAP_YEAR = [ 31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31 ];
	function isLeapYearIndex$1(year) {
		return year % 400 === 0 || year % 4 === 0 && year % 100 !== 0;
	}
	var parsers = {
		G: {
			priority: 140,
			parse: function(string, token, match, _options) {
				switch (token) {
				case "G":
				case "GG":
				case "GGG":
					return match.era(string, {
						width: "abbreviated"
					}) || match.era(string, {
						width: "narrow"
					});

				case "GGGGG":
					return match.era(string, {
						width: "narrow"
					});

				case "GGGG":
				default:
					return match.era(string, {
						width: "wide"
					}) || match.era(string, {
						width: "abbreviated"
					}) || match.era(string, {
						width: "narrow"
					});
				}
			},
			set: function(date, flags, value, _options) {
				flags.era = value;
				date.setUTCFullYear(value, 0, 1);
				date.setUTCHours(0, 0, 0, 0);
				return date;
			},
			incompatibleTokens: [ "R", "u", "t", "T" ]
		},
		y: {
			priority: 130,
			parse: function(string, token, match, _options) {
				var valueCallback = function(year) {
					return {
						year: year,
						isTwoDigitYear: token === "yy"
					};
				};
				switch (token) {
				case "y":
					return parseNDigits(4, string, valueCallback);

				case "yo":
					return match.ordinalNumber(string, {
						unit: "year",
						valueCallback: valueCallback
					});

				default:
					return parseNDigits(token.length, string, valueCallback);
				}
			},
			validate: function(_date, value, _options) {
				return value.isTwoDigitYear || value.year > 0;
			},
			set: function(date, flags, value, _options) {
				var currentYear = date.getUTCFullYear();
				if (value.isTwoDigitYear) {
					var normalizedTwoDigitYear = normalizeTwoDigitYear(value.year, currentYear);
					date.setUTCFullYear(normalizedTwoDigitYear, 0, 1);
					date.setUTCHours(0, 0, 0, 0);
					return date;
				}
				var year = !("era" in flags) || flags.era === 1 ? value.year : 1 - value.year;
				date.setUTCFullYear(year, 0, 1);
				date.setUTCHours(0, 0, 0, 0);
				return date;
			},
			incompatibleTokens: [ "Y", "R", "u", "w", "I", "i", "e", "c", "t", "T" ]
		},
		Y: {
			priority: 130,
			parse: function(string, token, match, _options) {
				var valueCallback = function(year) {
					return {
						year: year,
						isTwoDigitYear: token === "YY"
					};
				};
				switch (token) {
				case "Y":
					return parseNDigits(4, string, valueCallback);

				case "Yo":
					return match.ordinalNumber(string, {
						unit: "year",
						valueCallback: valueCallback
					});

				default:
					return parseNDigits(token.length, string, valueCallback);
				}
			},
			validate: function(_date, value, _options) {
				return value.isTwoDigitYear || value.year > 0;
			},
			set: function(date, flags, value, options) {
				var currentYear = getUTCWeekYear(date, options);
				if (value.isTwoDigitYear) {
					var normalizedTwoDigitYear = normalizeTwoDigitYear(value.year, currentYear);
					date.setUTCFullYear(normalizedTwoDigitYear, 0, options.firstWeekContainsDate);
					date.setUTCHours(0, 0, 0, 0);
					return startOfUTCWeek(date, options);
				}
				var year = !("era" in flags) || flags.era === 1 ? value.year : 1 - value.year;
				date.setUTCFullYear(year, 0, options.firstWeekContainsDate);
				date.setUTCHours(0, 0, 0, 0);
				return startOfUTCWeek(date, options);
			},
			incompatibleTokens: [ "y", "R", "u", "Q", "q", "M", "L", "I", "d", "D", "i", "t", "T" ]
		},
		R: {
			priority: 130,
			parse: function(string, token, _match, _options) {
				if (token === "R") {
					return parseNDigitsSigned(4, string);
				}
				return parseNDigitsSigned(token.length, string);
			},
			set: function(_date, _flags, value, _options) {
				var firstWeekOfYear = new Date(0);
				firstWeekOfYear.setUTCFullYear(value, 0, 4);
				firstWeekOfYear.setUTCHours(0, 0, 0, 0);
				return startOfUTCISOWeek(firstWeekOfYear);
			},
			incompatibleTokens: [ "G", "y", "Y", "u", "Q", "q", "M", "L", "w", "d", "D", "e", "c", "t", "T" ]
		},
		u: {
			priority: 130,
			parse: function(string, token, _match, _options) {
				if (token === "u") {
					return parseNDigitsSigned(4, string);
				}
				return parseNDigitsSigned(token.length, string);
			},
			set: function(date, _flags, value, _options) {
				date.setUTCFullYear(value, 0, 1);
				date.setUTCHours(0, 0, 0, 0);
				return date;
			},
			incompatibleTokens: [ "G", "y", "Y", "R", "w", "I", "i", "e", "c", "t", "T" ]
		},
		Q: {
			priority: 120,
			parse: function(string, token, match, _options) {
				switch (token) {
				case "Q":
				case "QQ":
					return parseNDigits(token.length, string);

				case "Qo":
					return match.ordinalNumber(string, {
						unit: "quarter"
					});

				case "QQQ":
					return match.quarter(string, {
						width: "abbreviated",
						context: "formatting"
					}) || match.quarter(string, {
						width: "narrow",
						context: "formatting"
					});

				case "QQQQQ":
					return match.quarter(string, {
						width: "narrow",
						context: "formatting"
					});

				case "QQQQ":
				default:
					return match.quarter(string, {
						width: "wide",
						context: "formatting"
					}) || match.quarter(string, {
						width: "abbreviated",
						context: "formatting"
					}) || match.quarter(string, {
						width: "narrow",
						context: "formatting"
					});
				}
			},
			validate: function(_date, value, _options) {
				return value >= 1 && value <= 4;
			},
			set: function(date, _flags, value, _options) {
				date.setUTCMonth((value - 1) * 3, 1);
				date.setUTCHours(0, 0, 0, 0);
				return date;
			},
			incompatibleTokens: [ "Y", "R", "q", "M", "L", "w", "I", "d", "D", "i", "e", "c", "t", "T" ]
		},
		q: {
			priority: 120,
			parse: function(string, token, match, _options) {
				switch (token) {
				case "q":
				case "qq":
					return parseNDigits(token.length, string);

				case "qo":
					return match.ordinalNumber(string, {
						unit: "quarter"
					});

				case "qqq":
					return match.quarter(string, {
						width: "abbreviated",
						context: "standalone"
					}) || match.quarter(string, {
						width: "narrow",
						context: "standalone"
					});

				case "qqqqq":
					return match.quarter(string, {
						width: "narrow",
						context: "standalone"
					});

				case "qqqq":
				default:
					return match.quarter(string, {
						width: "wide",
						context: "standalone"
					}) || match.quarter(string, {
						width: "abbreviated",
						context: "standalone"
					}) || match.quarter(string, {
						width: "narrow",
						context: "standalone"
					});
				}
			},
			validate: function(_date, value, _options) {
				return value >= 1 && value <= 4;
			},
			set: function(date, _flags, value, _options) {
				date.setUTCMonth((value - 1) * 3, 1);
				date.setUTCHours(0, 0, 0, 0);
				return date;
			},
			incompatibleTokens: [ "Y", "R", "Q", "M", "L", "w", "I", "d", "D", "i", "e", "c", "t", "T" ]
		},
		M: {
			priority: 110,
			parse: function(string, token, match, _options) {
				var valueCallback = function(value) {
					return value - 1;
				};
				switch (token) {
				case "M":
					return parseNumericPattern(numericPatterns.month, string, valueCallback);

				case "MM":
					return parseNDigits(2, string, valueCallback);

				case "Mo":
					return match.ordinalNumber(string, {
						unit: "month",
						valueCallback: valueCallback
					});

				case "MMM":
					return match.month(string, {
						width: "abbreviated",
						context: "formatting"
					}) || match.month(string, {
						width: "narrow",
						context: "formatting"
					});

				case "MMMMM":
					return match.month(string, {
						width: "narrow",
						context: "formatting"
					});

				case "MMMM":
				default:
					return match.month(string, {
						width: "wide",
						context: "formatting"
					}) || match.month(string, {
						width: "abbreviated",
						context: "formatting"
					}) || match.month(string, {
						width: "narrow",
						context: "formatting"
					});
				}
			},
			validate: function(_date, value, _options) {
				return value >= 0 && value <= 11;
			},
			set: function(date, _flags, value, _options) {
				date.setUTCMonth(value, 1);
				date.setUTCHours(0, 0, 0, 0);
				return date;
			},
			incompatibleTokens: [ "Y", "R", "q", "Q", "L", "w", "I", "D", "i", "e", "c", "t", "T" ]
		},
		L: {
			priority: 110,
			parse: function(string, token, match, _options) {
				var valueCallback = function(value) {
					return value - 1;
				};
				switch (token) {
				case "L":
					return parseNumericPattern(numericPatterns.month, string, valueCallback);

				case "LL":
					return parseNDigits(2, string, valueCallback);

				case "Lo":
					return match.ordinalNumber(string, {
						unit: "month",
						valueCallback: valueCallback
					});

				case "LLL":
					return match.month(string, {
						width: "abbreviated",
						context: "standalone"
					}) || match.month(string, {
						width: "narrow",
						context: "standalone"
					});

				case "LLLLL":
					return match.month(string, {
						width: "narrow",
						context: "standalone"
					});

				case "LLLL":
				default:
					return match.month(string, {
						width: "wide",
						context: "standalone"
					}) || match.month(string, {
						width: "abbreviated",
						context: "standalone"
					}) || match.month(string, {
						width: "narrow",
						context: "standalone"
					});
				}
			},
			validate: function(_date, value, _options) {
				return value >= 0 && value <= 11;
			},
			set: function(date, _flags, value, _options) {
				date.setUTCMonth(value, 1);
				date.setUTCHours(0, 0, 0, 0);
				return date;
			},
			incompatibleTokens: [ "Y", "R", "q", "Q", "M", "w", "I", "D", "i", "e", "c", "t", "T" ]
		},
		w: {
			priority: 100,
			parse: function(string, token, match, _options) {
				switch (token) {
				case "w":
					return parseNumericPattern(numericPatterns.week, string);

				case "wo":
					return match.ordinalNumber(string, {
						unit: "week"
					});

				default:
					return parseNDigits(token.length, string);
				}
			},
			validate: function(_date, value, _options) {
				return value >= 1 && value <= 53;
			},
			set: function(date, _flags, value, options) {
				return startOfUTCWeek(setUTCWeek(date, value, options), options);
			},
			incompatibleTokens: [ "y", "R", "u", "q", "Q", "M", "L", "I", "d", "D", "i", "t", "T" ]
		},
		I: {
			priority: 100,
			parse: function(string, token, match, _options) {
				switch (token) {
				case "I":
					return parseNumericPattern(numericPatterns.week, string);

				case "Io":
					return match.ordinalNumber(string, {
						unit: "week"
					});

				default:
					return parseNDigits(token.length, string);
				}
			},
			validate: function(_date, value, _options) {
				return value >= 1 && value <= 53;
			},
			set: function(date, _flags, value, options) {
				return startOfUTCISOWeek(setUTCISOWeek(date, value, options), options);
			},
			incompatibleTokens: [ "y", "Y", "u", "q", "Q", "M", "L", "w", "d", "D", "e", "c", "t", "T" ]
		},
		d: {
			priority: 90,
			subPriority: 1,
			parse: function(string, token, match, _options) {
				switch (token) {
				case "d":
					return parseNumericPattern(numericPatterns.date, string);

				case "do":
					return match.ordinalNumber(string, {
						unit: "date"
					});

				default:
					return parseNDigits(token.length, string);
				}
			},
			validate: function(date, value, _options) {
				var year = date.getUTCFullYear();
				var isLeapYear = isLeapYearIndex$1(year);
				var month = date.getUTCMonth();
				if (isLeapYear) {
					return value >= 1 && value <= DAYS_IN_MONTH_LEAP_YEAR[month];
				} else {
					return value >= 1 && value <= DAYS_IN_MONTH[month];
				}
			},
			set: function(date, _flags, value, _options) {
				date.setUTCDate(value);
				date.setUTCHours(0, 0, 0, 0);
				return date;
			},
			incompatibleTokens: [ "Y", "R", "q", "Q", "w", "I", "D", "i", "e", "c", "t", "T" ]
		},
		D: {
			priority: 90,
			subPriority: 1,
			parse: function(string, token, match, _options) {
				switch (token) {
				case "D":
				case "DD":
					return parseNumericPattern(numericPatterns.dayOfYear, string);

				case "Do":
					return match.ordinalNumber(string, {
						unit: "date"
					});

				default:
					return parseNDigits(token.length, string);
				}
			},
			validate: function(date, value, _options) {
				var year = date.getUTCFullYear();
				var isLeapYear = isLeapYearIndex$1(year);
				if (isLeapYear) {
					return value >= 1 && value <= 366;
				} else {
					return value >= 1 && value <= 365;
				}
			},
			set: function(date, _flags, value, _options) {
				date.setUTCMonth(0, value);
				date.setUTCHours(0, 0, 0, 0);
				return date;
			},
			incompatibleTokens: [ "Y", "R", "q", "Q", "M", "L", "w", "I", "d", "E", "i", "e", "c", "t", "T" ]
		},
		E: {
			priority: 90,
			parse: function(string, token, match, _options) {
				switch (token) {
				case "E":
				case "EE":
				case "EEE":
					return match.day(string, {
						width: "abbreviated",
						context: "formatting"
					}) || match.day(string, {
						width: "short",
						context: "formatting"
					}) || match.day(string, {
						width: "narrow",
						context: "formatting"
					});

				case "EEEEE":
					return match.day(string, {
						width: "narrow",
						context: "formatting"
					});

				case "EEEEEE":
					return match.day(string, {
						width: "short",
						context: "formatting"
					}) || match.day(string, {
						width: "narrow",
						context: "formatting"
					});

				case "EEEE":
				default:
					return match.day(string, {
						width: "wide",
						context: "formatting"
					}) || match.day(string, {
						width: "abbreviated",
						context: "formatting"
					}) || match.day(string, {
						width: "short",
						context: "formatting"
					}) || match.day(string, {
						width: "narrow",
						context: "formatting"
					});
				}
			},
			validate: function(_date, value, _options) {
				return value >= 0 && value <= 6;
			},
			set: function(date, _flags, value, options) {
				date = setUTCDay(date, value, options);
				date.setUTCHours(0, 0, 0, 0);
				return date;
			},
			incompatibleTokens: [ "D", "i", "e", "c", "t", "T" ]
		},
		e: {
			priority: 90,
			parse: function(string, token, match, options) {
				var valueCallback = function(value) {
					var wholeWeekDays = Math.floor((value - 1) / 7) * 7;
					return (value + options.weekStartsOn + 6) % 7 + wholeWeekDays;
				};
				switch (token) {
				case "e":
				case "ee":
					return parseNDigits(token.length, string, valueCallback);

				case "eo":
					return match.ordinalNumber(string, {
						unit: "day",
						valueCallback: valueCallback
					});

				case "eee":
					return match.day(string, {
						width: "abbreviated",
						context: "formatting"
					}) || match.day(string, {
						width: "short",
						context: "formatting"
					}) || match.day(string, {
						width: "narrow",
						context: "formatting"
					});

				case "eeeee":
					return match.day(string, {
						width: "narrow",
						context: "formatting"
					});

				case "eeeeee":
					return match.day(string, {
						width: "short",
						context: "formatting"
					}) || match.day(string, {
						width: "narrow",
						context: "formatting"
					});

				case "eeee":
				default:
					return match.day(string, {
						width: "wide",
						context: "formatting"
					}) || match.day(string, {
						width: "abbreviated",
						context: "formatting"
					}) || match.day(string, {
						width: "short",
						context: "formatting"
					}) || match.day(string, {
						width: "narrow",
						context: "formatting"
					});
				}
			},
			validate: function(_date, value, _options) {
				return value >= 0 && value <= 6;
			},
			set: function(date, _flags, value, options) {
				date = setUTCDay(date, value, options);
				date.setUTCHours(0, 0, 0, 0);
				return date;
			},
			incompatibleTokens: [ "y", "R", "u", "q", "Q", "M", "L", "I", "d", "D", "E", "i", "c", "t", "T" ]
		},
		c: {
			priority: 90,
			parse: function(string, token, match, options) {
				var valueCallback = function(value) {
					var wholeWeekDays = Math.floor((value - 1) / 7) * 7;
					return (value + options.weekStartsOn + 6) % 7 + wholeWeekDays;
				};
				switch (token) {
				case "c":
				case "cc":
					return parseNDigits(token.length, string, valueCallback);

				case "co":
					return match.ordinalNumber(string, {
						unit: "day",
						valueCallback: valueCallback
					});

				case "ccc":
					return match.day(string, {
						width: "abbreviated",
						context: "standalone"
					}) || match.day(string, {
						width: "short",
						context: "standalone"
					}) || match.day(string, {
						width: "narrow",
						context: "standalone"
					});

				case "ccccc":
					return match.day(string, {
						width: "narrow",
						context: "standalone"
					});

				case "cccccc":
					return match.day(string, {
						width: "short",
						context: "standalone"
					}) || match.day(string, {
						width: "narrow",
						context: "standalone"
					});

				case "cccc":
				default:
					return match.day(string, {
						width: "wide",
						context: "standalone"
					}) || match.day(string, {
						width: "abbreviated",
						context: "standalone"
					}) || match.day(string, {
						width: "short",
						context: "standalone"
					}) || match.day(string, {
						width: "narrow",
						context: "standalone"
					});
				}
			},
			validate: function(_date, value, _options) {
				return value >= 0 && value <= 6;
			},
			set: function(date, _flags, value, options) {
				date = setUTCDay(date, value, options);
				date.setUTCHours(0, 0, 0, 0);
				return date;
			},
			incompatibleTokens: [ "y", "R", "u", "q", "Q", "M", "L", "I", "d", "D", "E", "i", "e", "t", "T" ]
		},
		i: {
			priority: 90,
			parse: function(string, token, match, _options) {
				var valueCallback = function(value) {
					if (value === 0) {
						return 7;
					}
					return value;
				};
				switch (token) {
				case "i":
				case "ii":
					return parseNDigits(token.length, string);

				case "io":
					return match.ordinalNumber(string, {
						unit: "day"
					});

				case "iii":
					return match.day(string, {
						width: "abbreviated",
						context: "formatting",
						valueCallback: valueCallback
					}) || match.day(string, {
						width: "short",
						context: "formatting",
						valueCallback: valueCallback
					}) || match.day(string, {
						width: "narrow",
						context: "formatting",
						valueCallback: valueCallback
					});

				case "iiiii":
					return match.day(string, {
						width: "narrow",
						context: "formatting",
						valueCallback: valueCallback
					});

				case "iiiiii":
					return match.day(string, {
						width: "short",
						context: "formatting",
						valueCallback: valueCallback
					}) || match.day(string, {
						width: "narrow",
						context: "formatting",
						valueCallback: valueCallback
					});

				case "iiii":
				default:
					return match.day(string, {
						width: "wide",
						context: "formatting",
						valueCallback: valueCallback
					}) || match.day(string, {
						width: "abbreviated",
						context: "formatting",
						valueCallback: valueCallback
					}) || match.day(string, {
						width: "short",
						context: "formatting",
						valueCallback: valueCallback
					}) || match.day(string, {
						width: "narrow",
						context: "formatting",
						valueCallback: valueCallback
					});
				}
			},
			validate: function(_date, value, _options) {
				return value >= 1 && value <= 7;
			},
			set: function(date, _flags, value, options) {
				date = setUTCISODay(date, value, options);
				date.setUTCHours(0, 0, 0, 0);
				return date;
			},
			incompatibleTokens: [ "y", "Y", "u", "q", "Q", "M", "L", "w", "d", "D", "E", "e", "c", "t", "T" ]
		},
		a: {
			priority: 80,
			parse: function(string, token, match, _options) {
				switch (token) {
				case "a":
				case "aa":
				case "aaa":
					return match.dayPeriod(string, {
						width: "abbreviated",
						context: "formatting"
					}) || match.dayPeriod(string, {
						width: "narrow",
						context: "formatting"
					});

				case "aaaaa":
					return match.dayPeriod(string, {
						width: "narrow",
						context: "formatting"
					});

				case "aaaa":
				default:
					return match.dayPeriod(string, {
						width: "wide",
						context: "formatting"
					}) || match.dayPeriod(string, {
						width: "abbreviated",
						context: "formatting"
					}) || match.dayPeriod(string, {
						width: "narrow",
						context: "formatting"
					});
				}
			},
			set: function(date, _flags, value, _options) {
				date.setUTCHours(dayPeriodEnumToHours(value), 0, 0, 0);
				return date;
			},
			incompatibleTokens: [ "b", "B", "H", "K", "k", "t", "T" ]
		},
		b: {
			priority: 80,
			parse: function(string, token, match, _options) {
				switch (token) {
				case "b":
				case "bb":
				case "bbb":
					return match.dayPeriod(string, {
						width: "abbreviated",
						context: "formatting"
					}) || match.dayPeriod(string, {
						width: "narrow",
						context: "formatting"
					});

				case "bbbbb":
					return match.dayPeriod(string, {
						width: "narrow",
						context: "formatting"
					});

				case "bbbb":
				default:
					return match.dayPeriod(string, {
						width: "wide",
						context: "formatting"
					}) || match.dayPeriod(string, {
						width: "abbreviated",
						context: "formatting"
					}) || match.dayPeriod(string, {
						width: "narrow",
						context: "formatting"
					});
				}
			},
			set: function(date, _flags, value, _options) {
				date.setUTCHours(dayPeriodEnumToHours(value), 0, 0, 0);
				return date;
			},
			incompatibleTokens: [ "a", "B", "H", "K", "k", "t", "T" ]
		},
		B: {
			priority: 80,
			parse: function(string, token, match, _options) {
				switch (token) {
				case "B":
				case "BB":
				case "BBB":
					return match.dayPeriod(string, {
						width: "abbreviated",
						context: "formatting"
					}) || match.dayPeriod(string, {
						width: "narrow",
						context: "formatting"
					});

				case "BBBBB":
					return match.dayPeriod(string, {
						width: "narrow",
						context: "formatting"
					});

				case "BBBB":
				default:
					return match.dayPeriod(string, {
						width: "wide",
						context: "formatting"
					}) || match.dayPeriod(string, {
						width: "abbreviated",
						context: "formatting"
					}) || match.dayPeriod(string, {
						width: "narrow",
						context: "formatting"
					});
				}
			},
			set: function(date, _flags, value, _options) {
				date.setUTCHours(dayPeriodEnumToHours(value), 0, 0, 0);
				return date;
			},
			incompatibleTokens: [ "a", "b", "t", "T" ]
		},
		h: {
			priority: 70,
			parse: function(string, token, match, _options) {
				switch (token) {
				case "h":
					return parseNumericPattern(numericPatterns.hour12h, string);

				case "ho":
					return match.ordinalNumber(string, {
						unit: "hour"
					});

				default:
					return parseNDigits(token.length, string);
				}
			},
			validate: function(_date, value, _options) {
				return value >= 1 && value <= 12;
			},
			set: function(date, _flags, value, _options) {
				var isPM = date.getUTCHours() >= 12;
				if (isPM && value < 12) {
					date.setUTCHours(value + 12, 0, 0, 0);
				} else if (!isPM && value === 12) {
					date.setUTCHours(0, 0, 0, 0);
				} else {
					date.setUTCHours(value, 0, 0, 0);
				}
				return date;
			},
			incompatibleTokens: [ "H", "K", "k", "t", "T" ]
		},
		H: {
			priority: 70,
			parse: function(string, token, match, _options) {
				switch (token) {
				case "H":
					return parseNumericPattern(numericPatterns.hour23h, string);

				case "Ho":
					return match.ordinalNumber(string, {
						unit: "hour"
					});

				default:
					return parseNDigits(token.length, string);
				}
			},
			validate: function(_date, value, _options) {
				return value >= 0 && value <= 23;
			},
			set: function(date, _flags, value, _options) {
				date.setUTCHours(value, 0, 0, 0);
				return date;
			},
			incompatibleTokens: [ "a", "b", "h", "K", "k", "t", "T" ]
		},
		K: {
			priority: 70,
			parse: function(string, token, match, _options) {
				switch (token) {
				case "K":
					return parseNumericPattern(numericPatterns.hour11h, string);

				case "Ko":
					return match.ordinalNumber(string, {
						unit: "hour"
					});

				default:
					return parseNDigits(token.length, string);
				}
			},
			validate: function(_date, value, _options) {
				return value >= 0 && value <= 11;
			},
			set: function(date, _flags, value, _options) {
				var isPM = date.getUTCHours() >= 12;
				if (isPM && value < 12) {
					date.setUTCHours(value + 12, 0, 0, 0);
				} else {
					date.setUTCHours(value, 0, 0, 0);
				}
				return date;
			},
			incompatibleTokens: [ "a", "b", "h", "H", "k", "t", "T" ]
		},
		k: {
			priority: 70,
			parse: function(string, token, match, _options) {
				switch (token) {
				case "k":
					return parseNumericPattern(numericPatterns.hour24h, string);

				case "ko":
					return match.ordinalNumber(string, {
						unit: "hour"
					});

				default:
					return parseNDigits(token.length, string);
				}
			},
			validate: function(_date, value, _options) {
				return value >= 1 && value <= 24;
			},
			set: function(date, _flags, value, _options) {
				var hours = value <= 24 ? value % 24 : value;
				date.setUTCHours(hours, 0, 0, 0);
				return date;
			},
			incompatibleTokens: [ "a", "b", "h", "H", "K", "t", "T" ]
		},
		m: {
			priority: 60,
			parse: function(string, token, match, _options) {
				switch (token) {
				case "m":
					return parseNumericPattern(numericPatterns.minute, string);

				case "mo":
					return match.ordinalNumber(string, {
						unit: "minute"
					});

				default:
					return parseNDigits(token.length, string);
				}
			},
			validate: function(_date, value, _options) {
				return value >= 0 && value <= 59;
			},
			set: function(date, _flags, value, _options) {
				date.setUTCMinutes(value, 0, 0);
				return date;
			},
			incompatibleTokens: [ "t", "T" ]
		},
		s: {
			priority: 50,
			parse: function(string, token, match, _options) {
				switch (token) {
				case "s":
					return parseNumericPattern(numericPatterns.second, string);

				case "so":
					return match.ordinalNumber(string, {
						unit: "second"
					});

				default:
					return parseNDigits(token.length, string);
				}
			},
			validate: function(_date, value, _options) {
				return value >= 0 && value <= 59;
			},
			set: function(date, _flags, value, _options) {
				date.setUTCSeconds(value, 0);
				return date;
			},
			incompatibleTokens: [ "t", "T" ]
		},
		S: {
			priority: 30,
			parse: function(string, token, _match, _options) {
				var valueCallback = function(value) {
					return Math.floor(value * Math.pow(10, -token.length + 3));
				};
				return parseNDigits(token.length, string, valueCallback);
			},
			set: function(date, _flags, value, _options) {
				date.setUTCMilliseconds(value);
				return date;
			},
			incompatibleTokens: [ "t", "T" ]
		},
		X: {
			priority: 10,
			parse: function(string, token, _match, _options) {
				switch (token) {
				case "X":
					return parseTimezonePattern(timezonePatterns.basicOptionalMinutes, string);

				case "XX":
					return parseTimezonePattern(timezonePatterns.basic, string);

				case "XXXX":
					return parseTimezonePattern(timezonePatterns.basicOptionalSeconds, string);

				case "XXXXX":
					return parseTimezonePattern(timezonePatterns.extendedOptionalSeconds, string);

				case "XXX":
				default:
					return parseTimezonePattern(timezonePatterns.extended, string);
				}
			},
			set: function(date, flags, value, _options) {
				if (flags.timestampIsSet) {
					return date;
				}
				return new Date(date.getTime() - value);
			},
			incompatibleTokens: [ "t", "T", "x" ]
		},
		x: {
			priority: 10,
			parse: function(string, token, _match, _options) {
				switch (token) {
				case "x":
					return parseTimezonePattern(timezonePatterns.basicOptionalMinutes, string);

				case "xx":
					return parseTimezonePattern(timezonePatterns.basic, string);

				case "xxxx":
					return parseTimezonePattern(timezonePatterns.basicOptionalSeconds, string);

				case "xxxxx":
					return parseTimezonePattern(timezonePatterns.extendedOptionalSeconds, string);

				case "xxx":
				default:
					return parseTimezonePattern(timezonePatterns.extended, string);
				}
			},
			set: function(date, flags, value, _options) {
				if (flags.timestampIsSet) {
					return date;
				}
				return new Date(date.getTime() - value);
			},
			incompatibleTokens: [ "t", "T", "X" ]
		},
		t: {
			priority: 40,
			parse: function(string, _token, _match, _options) {
				return parseAnyDigitsSigned(string);
			},
			set: function(_date, _flags, value, _options) {
				return [ new Date(value * 1e3), {
					timestampIsSet: true
				} ];
			},
			incompatibleTokens: "*"
		},
		T: {
			priority: 20,
			parse: function(string, _token, _match, _options) {
				return parseAnyDigitsSigned(string);
			},
			set: function(_date, _flags, value, _options) {
				return [ new Date(value), {
					timestampIsSet: true
				} ];
			},
			incompatibleTokens: "*"
		}
	};
	var TIMEZONE_UNIT_PRIORITY = 10;
	var formattingTokensRegExp = /[yYQqMLwIdDecihHKkms]o|(\w)\1*|''|'(''|[^'])+('|$)|./g;
	var longFormattingTokensRegExp = /P+p+|P+|p+|''|'(''|[^'])+('|$)|./g;
	var escapedStringRegExp = /^'([^]*?)'?$/;
	var doubleQuoteRegExp = /''/g;
	var notWhitespaceRegExp = /\S/;
	var unescapedLatinCharacterRegExp = /[a-zA-Z]/;
	function parse(dirtyDateString, dirtyFormatString, dirtyReferenceDate, dirtyOptions) {
		requiredArgs(3, arguments);
		var dateString = String(dirtyDateString);
		var formatString = String(dirtyFormatString);
		var options = dirtyOptions || {};
		var locale$1 = options.locale || locale;
		if (!locale$1.match) {
			throw new RangeError("locale must contain match property");
		}
		var localeFirstWeekContainsDate = locale$1.options && locale$1.options.firstWeekContainsDate;
		var defaultFirstWeekContainsDate = localeFirstWeekContainsDate == null ? 1 : toInteger(localeFirstWeekContainsDate);
		var firstWeekContainsDate = options.firstWeekContainsDate == null ? defaultFirstWeekContainsDate : toInteger(options.firstWeekContainsDate);
		if (!(firstWeekContainsDate >= 1 && firstWeekContainsDate <= 7)) {
			throw new RangeError("firstWeekContainsDate must be between 1 and 7 inclusively");
		}
		var localeWeekStartsOn = locale$1.options && locale$1.options.weekStartsOn;
		var defaultWeekStartsOn = localeWeekStartsOn == null ? 0 : toInteger(localeWeekStartsOn);
		var weekStartsOn = options.weekStartsOn == null ? defaultWeekStartsOn : toInteger(options.weekStartsOn);
		if (!(weekStartsOn >= 0 && weekStartsOn <= 6)) {
			throw new RangeError("weekStartsOn must be between 0 and 6 inclusively");
		}
		if (formatString === "") {
			if (dateString === "") {
				return toDate(dirtyReferenceDate);
			} else {
				return new Date(NaN);
			}
		}
		var subFnOptions = {
			firstWeekContainsDate: firstWeekContainsDate,
			weekStartsOn: weekStartsOn,
			locale: locale$1
		};
		var setters = [ {
			priority: TIMEZONE_UNIT_PRIORITY,
			subPriority: -1,
			set: dateToSystemTimezone,
			index: 0
		} ];
		var i;
		var tokens = formatString.match(longFormattingTokensRegExp).map((function(substring) {
			var firstCharacter = substring[0];
			if (firstCharacter === "p" || firstCharacter === "P") {
				var longFormatter = longFormatters[firstCharacter];
				return longFormatter(substring, locale$1.formatLong, subFnOptions);
			}
			return substring;
		})).join("").match(formattingTokensRegExp);
		var usedTokens = [];
		for (i = 0; i < tokens.length; i++) {
			var token = tokens[i];
			if (!options.useAdditionalWeekYearTokens && isProtectedWeekYearToken(token)) {
				throwProtectedError(token, formatString, dirtyDateString);
			}
			if (!options.useAdditionalDayOfYearTokens && isProtectedDayOfYearToken(token)) {
				throwProtectedError(token, formatString, dirtyDateString);
			}
			var firstCharacter = token[0];
			var parser = parsers[firstCharacter];
			if (parser) {
				var incompatibleTokens = parser.incompatibleTokens;
				if (Array.isArray(incompatibleTokens)) {
					var incompatibleToken = void 0;
					for (var _i = 0; _i < usedTokens.length; _i++) {
						var usedToken = usedTokens[_i].token;
						if (incompatibleTokens.indexOf(usedToken) !== -1 || usedToken === firstCharacter) {
							incompatibleToken = usedTokens[_i];
							break;
						}
					}
					if (incompatibleToken) {
						throw new RangeError("The format string mustn't contain `".concat(incompatibleToken.fullToken, "` and `").concat(token, "` at the same time"));
					}
				} else if (parser.incompatibleTokens === "*" && usedTokens.length) {
					throw new RangeError("The format string mustn't contain `".concat(token, "` and any other token at the same time"));
				}
				usedTokens.push({
					token: firstCharacter,
					fullToken: token
				});
				var parseResult = parser.parse(dateString, token, locale$1.match, subFnOptions);
				if (!parseResult) {
					return new Date(NaN);
				}
				setters.push({
					priority: parser.priority,
					subPriority: parser.subPriority || 0,
					set: parser.set,
					validate: parser.validate,
					value: parseResult.value,
					index: setters.length
				});
				dateString = parseResult.rest;
			} else {
				if (firstCharacter.match(unescapedLatinCharacterRegExp)) {
					throw new RangeError("Format string contains an unescaped latin alphabet character `" + firstCharacter + "`");
				}
				if (token === "''") {
					token = "'";
				} else if (firstCharacter === "'") {
					token = cleanEscapedString(token);
				}
				if (dateString.indexOf(token) === 0) {
					dateString = dateString.slice(token.length);
				} else {
					return new Date(NaN);
				}
			}
		}
		if (dateString.length > 0 && notWhitespaceRegExp.test(dateString)) {
			return new Date(NaN);
		}
		var uniquePrioritySetters = setters.map((function(setter) {
			return setter.priority;
		})).sort((function(a, b) {
			return b - a;
		})).filter((function(priority, index, array) {
			return array.indexOf(priority) === index;
		})).map((function(priority) {
			return setters.filter((function(setter) {
				return setter.priority === priority;
			})).sort((function(a, b) {
				return b.subPriority - a.subPriority;
			}));
		})).map((function(setterArray) {
			return setterArray[0];
		}));
		var date = toDate(dirtyReferenceDate);
		if (isNaN(date)) {
			return new Date(NaN);
		}
		var utcDate = subMilliseconds(date, getTimezoneOffsetInMilliseconds(date));
		var flags = {};
		for (i = 0; i < uniquePrioritySetters.length; i++) {
			var setter = uniquePrioritySetters[i];
			if (setter.validate && !setter.validate(utcDate, setter.value, subFnOptions)) {
				return new Date(NaN);
			}
			var result = setter.set(utcDate, flags, setter.value, subFnOptions);
			if (result[0]) {
				utcDate = result[0];
				assign(flags, result[1]);
			} else {
				utcDate = result;
			}
		}
		return utcDate;
	}
	function dateToSystemTimezone(date, flags) {
		if (flags.timestampIsSet) {
			return date;
		}
		var convertedDate = new Date(0);
		convertedDate.setFullYear(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
		convertedDate.setHours(date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds());
		return convertedDate;
	}
	function cleanEscapedString(input) {
		return input.match(escapedStringRegExp)[1].replace(doubleQuoteRegExp, "'");
	}
	function startOfHour(dirtyDate) {
		requiredArgs(1, arguments);
		var date = toDate(dirtyDate);
		date.setMinutes(0, 0, 0);
		return date;
	}
	function startOfMinute(dirtyDate) {
		requiredArgs(1, arguments);
		var date = toDate(dirtyDate);
		date.setSeconds(0, 0);
		return date;
	}
	function startOfSecond(dirtyDate) {
		requiredArgs(1, arguments);
		var date = toDate(dirtyDate);
		date.setMilliseconds(0);
		return date;
	}
	var MILLISECONDS_IN_HOUR = 36e5;
	var MILLISECONDS_IN_MINUTE = 6e4;
	var DEFAULT_ADDITIONAL_DIGITS = 2;
	var patterns = {
		dateTimeDelimiter: /[T ]/,
		timeZoneDelimiter: /[Z ]/i,
		timezone: /([Z+-].*)$/
	};
	var dateRegex = /^-?(?:(\d{3})|(\d{2})(?:-?(\d{2}))?|W(\d{2})(?:-?(\d{1}))?|)$/;
	var timeRegex = /^(\d{2}(?:[.,]\d*)?)(?::?(\d{2}(?:[.,]\d*)?))?(?::?(\d{2}(?:[.,]\d*)?))?$/;
	var timezoneRegex = /^([+-])(\d{2})(?::?(\d{2}))?$/;
	function parseISO(argument, dirtyOptions) {
		requiredArgs(1, arguments);
		var options = dirtyOptions || {};
		var additionalDigits = options.additionalDigits == null ? DEFAULT_ADDITIONAL_DIGITS : toInteger(options.additionalDigits);
		if (additionalDigits !== 2 && additionalDigits !== 1 && additionalDigits !== 0) {
			throw new RangeError("additionalDigits must be 0, 1 or 2");
		}
		if (!(typeof argument === "string" || Object.prototype.toString.call(argument) === "[object String]")) {
			return new Date(NaN);
		}
		var dateStrings = splitDateString(argument);
		var date;
		if (dateStrings.date) {
			var parseYearResult = parseYear(dateStrings.date, additionalDigits);
			date = parseDate(parseYearResult.restDateString, parseYearResult.year);
		}
		if (isNaN(date) || !date) {
			return new Date(NaN);
		}
		var timestamp = date.getTime();
		var time = 0;
		var offset;
		if (dateStrings.time) {
			time = parseTime(dateStrings.time);
			if (isNaN(time) || time === null) {
				return new Date(NaN);
			}
		}
		if (dateStrings.timezone) {
			offset = parseTimezone(dateStrings.timezone);
			if (isNaN(offset)) {
				return new Date(NaN);
			}
		} else {
			var dirtyDate = new Date(timestamp + time);
			var result = new Date(0);
			result.setFullYear(dirtyDate.getUTCFullYear(), dirtyDate.getUTCMonth(), dirtyDate.getUTCDate());
			result.setHours(dirtyDate.getUTCHours(), dirtyDate.getUTCMinutes(), dirtyDate.getUTCSeconds(), dirtyDate.getUTCMilliseconds());
			return result;
		}
		return new Date(timestamp + time + offset);
	}
	function splitDateString(dateString) {
		var dateStrings = {};
		var array = dateString.split(patterns.dateTimeDelimiter);
		var timeString;
		if (array.length > 2) {
			return dateStrings;
		}
		if (/:/.test(array[0])) {
			dateStrings.date = null;
			timeString = array[0];
		} else {
			dateStrings.date = array[0];
			timeString = array[1];
			if (patterns.timeZoneDelimiter.test(dateStrings.date)) {
				dateStrings.date = dateString.split(patterns.timeZoneDelimiter)[0];
				timeString = dateString.substr(dateStrings.date.length, dateString.length);
			}
		}
		if (timeString) {
			var token = patterns.timezone.exec(timeString);
			if (token) {
				dateStrings.time = timeString.replace(token[1], "");
				dateStrings.timezone = token[1];
			} else {
				dateStrings.time = timeString;
			}
		}
		return dateStrings;
	}
	function parseYear(dateString, additionalDigits) {
		var regex = new RegExp("^(?:(\\d{4}|[+-]\\d{" + (4 + additionalDigits) + "})|(\\d{2}|[+-]\\d{" + (2 + additionalDigits) + "})$)");
		var captures = dateString.match(regex);
		if (!captures) return {
			year: null
		};
		var year = captures[1] && parseInt(captures[1]);
		var century = captures[2] && parseInt(captures[2]);
		return {
			year: century == null ? year : century * 100,
			restDateString: dateString.slice((captures[1] || captures[2]).length)
		};
	}
	function parseDate(dateString, year) {
		if (year === null) return null;
		var captures = dateString.match(dateRegex);
		if (!captures) return null;
		var isWeekDate = !!captures[4];
		var dayOfYear = parseDateUnit(captures[1]);
		var month = parseDateUnit(captures[2]) - 1;
		var day = parseDateUnit(captures[3]);
		var week = parseDateUnit(captures[4]);
		var dayOfWeek = parseDateUnit(captures[5]) - 1;
		if (isWeekDate) {
			if (!validateWeekDate(year, week, dayOfWeek)) {
				return new Date(NaN);
			}
			return dayOfISOWeekYear(year, week, dayOfWeek);
		} else {
			var date = new Date(0);
			if (!validateDate(year, month, day) || !validateDayOfYearDate(year, dayOfYear)) {
				return new Date(NaN);
			}
			date.setUTCFullYear(year, month, Math.max(dayOfYear, day));
			return date;
		}
	}
	function parseDateUnit(value) {
		return value ? parseInt(value) : 1;
	}
	function parseTime(timeString) {
		var captures = timeString.match(timeRegex);
		if (!captures) return null;
		var hours = parseTimeUnit(captures[1]);
		var minutes = parseTimeUnit(captures[2]);
		var seconds = parseTimeUnit(captures[3]);
		if (!validateTime(hours, minutes, seconds)) {
			return NaN;
		}
		return hours * MILLISECONDS_IN_HOUR + minutes * MILLISECONDS_IN_MINUTE + seconds * 1e3;
	}
	function parseTimeUnit(value) {
		return value && parseFloat(value.replace(",", ".")) || 0;
	}
	function parseTimezone(timezoneString) {
		if (timezoneString === "Z") return 0;
		var captures = timezoneString.match(timezoneRegex);
		if (!captures) return 0;
		var sign = captures[1] === "+" ? -1 : 1;
		var hours = parseInt(captures[2]);
		var minutes = captures[3] && parseInt(captures[3]) || 0;
		if (!validateTimezone(hours, minutes)) {
			return NaN;
		}
		return sign * (hours * MILLISECONDS_IN_HOUR + minutes * MILLISECONDS_IN_MINUTE);
	}
	function dayOfISOWeekYear(isoWeekYear, week, day) {
		var date = new Date(0);
		date.setUTCFullYear(isoWeekYear, 0, 4);
		var fourthOfJanuaryDay = date.getUTCDay() || 7;
		var diff = (week - 1) * 7 + day + 1 - fourthOfJanuaryDay;
		date.setUTCDate(date.getUTCDate() + diff);
		return date;
	}
	var daysInMonths = [ 31, null, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31 ];
	function isLeapYearIndex(year) {
		return year % 400 === 0 || year % 4 === 0 && year % 100;
	}
	function validateDate(year, month, date) {
		return month >= 0 && month <= 11 && date >= 1 && date <= (daysInMonths[month] || (isLeapYearIndex(year) ? 29 : 28));
	}
	function validateDayOfYearDate(year, dayOfYear) {
		return dayOfYear >= 1 && dayOfYear <= (isLeapYearIndex(year) ? 366 : 365);
	}
	function validateWeekDate(_year, week, day) {
		return week >= 1 && week <= 53 && day >= 0 && day <= 6;
	}
	function validateTime(hours, minutes, seconds) {
		if (hours === 24) {
			return minutes === 0 && seconds === 0;
		}
		return seconds >= 0 && seconds < 60 && minutes >= 0 && minutes < 60 && hours >= 0 && hours < 25;
	}
	function validateTimezone(_hours, minutes) {
		return minutes >= 0 && minutes <= 59;
	}
	const FORMATS = {
		datetime: "MMM d, yyyy, h:mm:ss aaaa",
		millisecond: "h:mm:ss.SSS aaaa",
		second: "h:mm:ss aaaa",
		minute: "h:mm aaaa",
		hour: "ha",
		day: "MMM d",
		week: "PP",
		month: "MMM yyyy",
		quarter: "qqq - yyyy",
		year: "yyyy"
	};
	chart_js._adapters._date.override({
		_id: "date-fns",
		formats: function() {
			return FORMATS;
		},
		parse: function(value, fmt) {
			if (value === null || typeof value === "undefined") {
				return null;
			}
			const type = typeof value;
			if (type === "number" || value instanceof Date) {
				value = toDate(value);
			} else if (type === "string") {
				if (typeof fmt === "string") {
					value = parse(value, fmt, new Date, this.options);
				} else {
					value = parseISO(value, this.options);
				}
			}
			return isValid(value) ? value.getTime() : null;
		},
		format: function(time, fmt) {
			return format(time, fmt, this.options);
		},
		add: function(time, amount, unit) {
			switch (unit) {
			case "millisecond":
				return addMilliseconds(time, amount);

			case "second":
				return addSeconds(time, amount);

			case "minute":
				return addMinutes(time, amount);

			case "hour":
				return addHours(time, amount);

			case "day":
				return addDays(time, amount);

			case "week":
				return addWeeks(time, amount);

			case "month":
				return addMonths(time, amount);

			case "quarter":
				return addQuarters(time, amount);

			case "year":
				return addYears(time, amount);

			default:
				return time;
			}
		},
		diff: function(max, min, unit) {
			switch (unit) {
			case "millisecond":
				return differenceInMilliseconds(max, min);

			case "second":
				return differenceInSeconds(max, min);

			case "minute":
				return differenceInMinutes(max, min);

			case "hour":
				return differenceInHours(max, min);

			case "day":
				return differenceInDays(max, min);

			case "week":
				return differenceInWeeks(max, min);

			case "month":
				return differenceInMonths(max, min);

			case "quarter":
				return differenceInQuarters(max, min);

			case "year":
				return differenceInYears(max, min);

			default:
				return 0;
			}
		},
		startOf: function(time, unit, weekday) {
			switch (unit) {
			case "second":
				return startOfSecond(time);

			case "minute":
				return startOfMinute(time);

			case "hour":
				return startOfHour(time);

			case "day":
				return startOfDay(time);

			case "week":
				return startOfWeek(time);

			case "isoWeek":
				return startOfWeek(time, {
					weekStartsOn: +weekday
				});

			case "month":
				return startOfMonth(time);

			case "quarter":
				return startOfQuarter(time);

			case "year":
				return startOfYear(time);

			default:
				return time;
			}
		},
		endOf: function(time, unit) {
			switch (unit) {
			case "second":
				return endOfSecond(time);

			case "minute":
				return endOfMinute(time);

			case "hour":
				return endOfHour(time);

			case "day":
				return endOfDay(time);

			case "week":
				return endOfWeek(time);

			case "month":
				return endOfMonth(time);

			case "quarter":
				return endOfQuarter(time);

			case "year":
				return endOfYear(time);

			default:
				return time;
			}
		}
	});
}));
