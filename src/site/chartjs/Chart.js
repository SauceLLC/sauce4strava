/*!
 * Chart.js v2.9.4
 * https://www.chartjs.org
 * (c) 2021 Chart.js Contributors
 * Released under the MIT License
 */
(function(e, t) {
	"object" === typeof exports && "undefined" !== typeof module ? module.exports = t() : "function" === typeof define && define.amd ? define(t) : (e = "undefined" !== typeof globalThis ? globalThis : e || self, 
	e.Chart = t());
})(this, (function() {
	"use strict";
	function getAugmentedNamespace(e) {
		if (e.__esModule) {
			return e;
		}
		var t = Object.defineProperty({}, "__esModule", {
			value: true
		});
		Object.keys(e).forEach((function(r) {
			var a = Object.getOwnPropertyDescriptor(e, r);
			Object.defineProperty(t, r, a.get ? a : {
				enumerable: true,
				get: function() {
					return e[r];
				}
			});
		}));
		return t;
	}
	var e = {
		exports: {}
	};
	var t = {
		aliceblue: [ 240, 248, 255 ],
		antiquewhite: [ 250, 235, 215 ],
		aqua: [ 0, 255, 255 ],
		aquamarine: [ 127, 255, 212 ],
		azure: [ 240, 255, 255 ],
		beige: [ 245, 245, 220 ],
		bisque: [ 255, 228, 196 ],
		black: [ 0, 0, 0 ],
		blanchedalmond: [ 255, 235, 205 ],
		blue: [ 0, 0, 255 ],
		blueviolet: [ 138, 43, 226 ],
		brown: [ 165, 42, 42 ],
		burlywood: [ 222, 184, 135 ],
		cadetblue: [ 95, 158, 160 ],
		chartreuse: [ 127, 255, 0 ],
		chocolate: [ 210, 105, 30 ],
		coral: [ 255, 127, 80 ],
		cornflowerblue: [ 100, 149, 237 ],
		cornsilk: [ 255, 248, 220 ],
		crimson: [ 220, 20, 60 ],
		cyan: [ 0, 255, 255 ],
		darkblue: [ 0, 0, 139 ],
		darkcyan: [ 0, 139, 139 ],
		darkgoldenrod: [ 184, 134, 11 ],
		darkgray: [ 169, 169, 169 ],
		darkgreen: [ 0, 100, 0 ],
		darkgrey: [ 169, 169, 169 ],
		darkkhaki: [ 189, 183, 107 ],
		darkmagenta: [ 139, 0, 139 ],
		darkolivegreen: [ 85, 107, 47 ],
		darkorange: [ 255, 140, 0 ],
		darkorchid: [ 153, 50, 204 ],
		darkred: [ 139, 0, 0 ],
		darksalmon: [ 233, 150, 122 ],
		darkseagreen: [ 143, 188, 143 ],
		darkslateblue: [ 72, 61, 139 ],
		darkslategray: [ 47, 79, 79 ],
		darkslategrey: [ 47, 79, 79 ],
		darkturquoise: [ 0, 206, 209 ],
		darkviolet: [ 148, 0, 211 ],
		deeppink: [ 255, 20, 147 ],
		deepskyblue: [ 0, 191, 255 ],
		dimgray: [ 105, 105, 105 ],
		dimgrey: [ 105, 105, 105 ],
		dodgerblue: [ 30, 144, 255 ],
		firebrick: [ 178, 34, 34 ],
		floralwhite: [ 255, 250, 240 ],
		forestgreen: [ 34, 139, 34 ],
		fuchsia: [ 255, 0, 255 ],
		gainsboro: [ 220, 220, 220 ],
		ghostwhite: [ 248, 248, 255 ],
		gold: [ 255, 215, 0 ],
		goldenrod: [ 218, 165, 32 ],
		gray: [ 128, 128, 128 ],
		green: [ 0, 128, 0 ],
		greenyellow: [ 173, 255, 47 ],
		grey: [ 128, 128, 128 ],
		honeydew: [ 240, 255, 240 ],
		hotpink: [ 255, 105, 180 ],
		indianred: [ 205, 92, 92 ],
		indigo: [ 75, 0, 130 ],
		ivory: [ 255, 255, 240 ],
		khaki: [ 240, 230, 140 ],
		lavender: [ 230, 230, 250 ],
		lavenderblush: [ 255, 240, 245 ],
		lawngreen: [ 124, 252, 0 ],
		lemonchiffon: [ 255, 250, 205 ],
		lightblue: [ 173, 216, 230 ],
		lightcoral: [ 240, 128, 128 ],
		lightcyan: [ 224, 255, 255 ],
		lightgoldenrodyellow: [ 250, 250, 210 ],
		lightgray: [ 211, 211, 211 ],
		lightgreen: [ 144, 238, 144 ],
		lightgrey: [ 211, 211, 211 ],
		lightpink: [ 255, 182, 193 ],
		lightsalmon: [ 255, 160, 122 ],
		lightseagreen: [ 32, 178, 170 ],
		lightskyblue: [ 135, 206, 250 ],
		lightslategray: [ 119, 136, 153 ],
		lightslategrey: [ 119, 136, 153 ],
		lightsteelblue: [ 176, 196, 222 ],
		lightyellow: [ 255, 255, 224 ],
		lime: [ 0, 255, 0 ],
		limegreen: [ 50, 205, 50 ],
		linen: [ 250, 240, 230 ],
		magenta: [ 255, 0, 255 ],
		maroon: [ 128, 0, 0 ],
		mediumaquamarine: [ 102, 205, 170 ],
		mediumblue: [ 0, 0, 205 ],
		mediumorchid: [ 186, 85, 211 ],
		mediumpurple: [ 147, 112, 219 ],
		mediumseagreen: [ 60, 179, 113 ],
		mediumslateblue: [ 123, 104, 238 ],
		mediumspringgreen: [ 0, 250, 154 ],
		mediumturquoise: [ 72, 209, 204 ],
		mediumvioletred: [ 199, 21, 133 ],
		midnightblue: [ 25, 25, 112 ],
		mintcream: [ 245, 255, 250 ],
		mistyrose: [ 255, 228, 225 ],
		moccasin: [ 255, 228, 181 ],
		navajowhite: [ 255, 222, 173 ],
		navy: [ 0, 0, 128 ],
		oldlace: [ 253, 245, 230 ],
		olive: [ 128, 128, 0 ],
		olivedrab: [ 107, 142, 35 ],
		orange: [ 255, 165, 0 ],
		orangered: [ 255, 69, 0 ],
		orchid: [ 218, 112, 214 ],
		palegoldenrod: [ 238, 232, 170 ],
		palegreen: [ 152, 251, 152 ],
		paleturquoise: [ 175, 238, 238 ],
		palevioletred: [ 219, 112, 147 ],
		papayawhip: [ 255, 239, 213 ],
		peachpuff: [ 255, 218, 185 ],
		peru: [ 205, 133, 63 ],
		pink: [ 255, 192, 203 ],
		plum: [ 221, 160, 221 ],
		powderblue: [ 176, 224, 230 ],
		purple: [ 128, 0, 128 ],
		rebeccapurple: [ 102, 51, 153 ],
		red: [ 255, 0, 0 ],
		rosybrown: [ 188, 143, 143 ],
		royalblue: [ 65, 105, 225 ],
		saddlebrown: [ 139, 69, 19 ],
		salmon: [ 250, 128, 114 ],
		sandybrown: [ 244, 164, 96 ],
		seagreen: [ 46, 139, 87 ],
		seashell: [ 255, 245, 238 ],
		sienna: [ 160, 82, 45 ],
		silver: [ 192, 192, 192 ],
		skyblue: [ 135, 206, 235 ],
		slateblue: [ 106, 90, 205 ],
		slategray: [ 112, 128, 144 ],
		slategrey: [ 112, 128, 144 ],
		snow: [ 255, 250, 250 ],
		springgreen: [ 0, 255, 127 ],
		steelblue: [ 70, 130, 180 ],
		tan: [ 210, 180, 140 ],
		teal: [ 0, 128, 128 ],
		thistle: [ 216, 191, 216 ],
		tomato: [ 255, 99, 71 ],
		turquoise: [ 64, 224, 208 ],
		violet: [ 238, 130, 238 ],
		wheat: [ 245, 222, 179 ],
		white: [ 255, 255, 255 ],
		whitesmoke: [ 245, 245, 245 ],
		yellow: [ 255, 255, 0 ],
		yellowgreen: [ 154, 205, 50 ]
	};
	var r = t;
	var a = {};
	for (var n in r) {
		if (r.hasOwnProperty(n)) {
			a[r[n]] = n;
		}
	}
	var i = e.exports = {
		rgb: {
			channels: 3,
			labels: "rgb"
		},
		hsl: {
			channels: 3,
			labels: "hsl"
		},
		hsv: {
			channels: 3,
			labels: "hsv"
		},
		hwb: {
			channels: 3,
			labels: "hwb"
		},
		cmyk: {
			channels: 4,
			labels: "cmyk"
		},
		xyz: {
			channels: 3,
			labels: "xyz"
		},
		lab: {
			channels: 3,
			labels: "lab"
		},
		lch: {
			channels: 3,
			labels: "lch"
		},
		hex: {
			channels: 1,
			labels: [ "hex" ]
		},
		keyword: {
			channels: 1,
			labels: [ "keyword" ]
		},
		ansi16: {
			channels: 1,
			labels: [ "ansi16" ]
		},
		ansi256: {
			channels: 1,
			labels: [ "ansi256" ]
		},
		hcg: {
			channels: 3,
			labels: [ "h", "c", "g" ]
		},
		apple: {
			channels: 3,
			labels: [ "r16", "g16", "b16" ]
		},
		gray: {
			channels: 1,
			labels: [ "gray" ]
		}
	};
	for (var o in i) {
		if (i.hasOwnProperty(o)) {
			if (!("channels" in i[o])) {
				throw new Error("missing channels property: " + o);
			}
			if (!("labels" in i[o])) {
				throw new Error("missing channel labels property: " + o);
			}
			if (i[o].labels.length !== i[o].channels) {
				throw new Error("channel and label counts mismatch: " + o);
			}
			var s = i[o].channels;
			var l = i[o].labels;
			delete i[o].channels;
			delete i[o].labels;
			Object.defineProperty(i[o], "channels", {
				value: s
			});
			Object.defineProperty(i[o], "labels", {
				value: l
			});
		}
	}
	i.rgb.hsl = function(e) {
		var t = e[0] / 255;
		var r = e[1] / 255;
		var a = e[2] / 255;
		var n = Math.min(t, r, a);
		var i = Math.max(t, r, a);
		var o = i - n;
		var s;
		var l;
		var u;
		if (i === n) {
			s = 0;
		} else if (t === i) {
			s = (r - a) / o;
		} else if (r === i) {
			s = 2 + (a - t) / o;
		} else if (a === i) {
			s = 4 + (t - r) / o;
		}
		s = Math.min(60 * s, 360);
		if (s < 0) {
			s += 360;
		}
		u = (n + i) / 2;
		if (i === n) {
			l = 0;
		} else if (u <= .5) {
			l = o / (i + n);
		} else {
			l = o / (2 - i - n);
		}
		return [ s, 100 * l, 100 * u ];
	};
	i.rgb.hsv = function(e) {
		var t;
		var r;
		var a;
		var n;
		var i;
		var o = e[0] / 255;
		var s = e[1] / 255;
		var l = e[2] / 255;
		var u = Math.max(o, s, l);
		var c = u - Math.min(o, s, l);
		var diffc = function(e) {
			return (u - e) / 6 / c + .5;
		};
		if (0 === c) {
			n = i = 0;
		} else {
			i = c / u;
			t = diffc(o);
			r = diffc(s);
			a = diffc(l);
			if (o === u) {
				n = a - r;
			} else if (s === u) {
				n = 1 / 3 + t - a;
			} else if (l === u) {
				n = 2 / 3 + r - t;
			}
			if (n < 0) {
				n += 1;
			} else if (n > 1) {
				n -= 1;
			}
		}
		return [ 360 * n, 100 * i, 100 * u ];
	};
	i.rgb.hwb = function(e) {
		var t = e[0];
		var r = e[1];
		var a = e[2];
		var n = i.rgb.hsl(e)[0];
		var o = 1 / 255 * Math.min(t, Math.min(r, a));
		a = 1 - 1 / 255 * Math.max(t, Math.max(r, a));
		return [ n, 100 * o, 100 * a ];
	};
	i.rgb.cmyk = function(e) {
		var t = e[0] / 255;
		var r = e[1] / 255;
		var a = e[2] / 255;
		var n;
		var i;
		var o;
		var s;
		s = Math.min(1 - t, 1 - r, 1 - a);
		n = (1 - t - s) / (1 - s) || 0;
		i = (1 - r - s) / (1 - s) || 0;
		o = (1 - a - s) / (1 - s) || 0;
		return [ 100 * n, 100 * i, 100 * o, 100 * s ];
	};
	function comparativeDistance(e, t) {
		return Math.pow(e[0] - t[0], 2) + Math.pow(e[1] - t[1], 2) + Math.pow(e[2] - t[2], 2);
	}
	i.rgb.keyword = function(e) {
		var t = a[e];
		if (t) {
			return t;
		}
		var n = 1 / 0;
		var i;
		for (var o in r) {
			if (r.hasOwnProperty(o)) {
				var s = r[o];
				var l = comparativeDistance(e, s);
				if (l < n) {
					n = l;
					i = o;
				}
			}
		}
		return i;
	};
	i.keyword.rgb = function(e) {
		return r[e];
	};
	i.rgb.xyz = function(e) {
		var t = e[0] / 255;
		var r = e[1] / 255;
		var a = e[2] / 255;
		t = t > .04045 ? Math.pow((t + .055) / 1.055, 2.4) : t / 12.92;
		r = r > .04045 ? Math.pow((r + .055) / 1.055, 2.4) : r / 12.92;
		a = a > .04045 ? Math.pow((a + .055) / 1.055, 2.4) : a / 12.92;
		var n = .4124 * t + .3576 * r + .1805 * a;
		var i = .2126 * t + .7152 * r + .0722 * a;
		var o = .0193 * t + .1192 * r + .9505 * a;
		return [ 100 * n, 100 * i, 100 * o ];
	};
	i.rgb.lab = function(e) {
		var t = i.rgb.xyz(e);
		var r = t[0];
		var a = t[1];
		var n = t[2];
		var o;
		var s;
		var l;
		r /= 95.047;
		a /= 100;
		n /= 108.883;
		r = r > .008856 ? Math.pow(r, 1 / 3) : 7.787 * r + 16 / 116;
		a = a > .008856 ? Math.pow(a, 1 / 3) : 7.787 * a + 16 / 116;
		n = n > .008856 ? Math.pow(n, 1 / 3) : 7.787 * n + 16 / 116;
		o = 116 * a - 16;
		s = 500 * (r - a);
		l = 200 * (a - n);
		return [ o, s, l ];
	};
	i.hsl.rgb = function(e) {
		var t = e[0] / 360;
		var r = e[1] / 100;
		var a = e[2] / 100;
		var n;
		var i;
		var o;
		var s;
		var l;
		if (0 === r) {
			l = 255 * a;
			return [ l, l, l ];
		}
		if (a < .5) {
			i = a * (1 + r);
		} else {
			i = a + r - a * r;
		}
		n = 2 * a - i;
		s = [ 0, 0, 0 ];
		for (var u = 0; u < 3; u++) {
			o = t + 1 / 3 * -(u - 1);
			if (o < 0) {
				o++;
			}
			if (o > 1) {
				o--;
			}
			if (6 * o < 1) {
				l = n + 6 * (i - n) * o;
			} else if (2 * o < 1) {
				l = i;
			} else if (3 * o < 2) {
				l = n + (i - n) * (2 / 3 - o) * 6;
			} else {
				l = n;
			}
			s[u] = 255 * l;
		}
		return s;
	};
	i.hsl.hsv = function(e) {
		var t = e[0];
		var r = e[1] / 100;
		var a = e[2] / 100;
		var n = r;
		var i = Math.max(a, .01);
		var o;
		var s;
		a *= 2;
		r *= a <= 1 ? a : 2 - a;
		n *= i <= 1 ? i : 2 - i;
		s = (a + r) / 2;
		o = 0 === a ? 2 * n / (i + n) : 2 * r / (a + r);
		return [ t, 100 * o, 100 * s ];
	};
	i.hsv.rgb = function(e) {
		var t = e[0] / 60;
		var r = e[1] / 100;
		var a = e[2] / 100;
		var n = Math.floor(t) % 6;
		var i = t - Math.floor(t);
		var o = 255 * a * (1 - r);
		var s = 255 * a * (1 - r * i);
		var l = 255 * a * (1 - r * (1 - i));
		a *= 255;
		switch (n) {
		case 0:
			return [ a, l, o ];

		case 1:
			return [ s, a, o ];

		case 2:
			return [ o, a, l ];

		case 3:
			return [ o, s, a ];

		case 4:
			return [ l, o, a ];

		case 5:
			return [ a, o, s ];
		}
	};
	i.hsv.hsl = function(e) {
		var t = e[0];
		var r = e[1] / 100;
		var a = e[2] / 100;
		var n = Math.max(a, .01);
		var i;
		var o;
		var s;
		s = (2 - r) * a;
		i = (2 - r) * n;
		o = r * n;
		o /= i <= 1 ? i : 2 - i;
		o = o || 0;
		s /= 2;
		return [ t, 100 * o, 100 * s ];
	};
	i.hwb.rgb = function(e) {
		var t = e[0] / 360;
		var r = e[1] / 100;
		var a = e[2] / 100;
		var n = r + a;
		var i;
		var o;
		var s;
		var l;
		if (n > 1) {
			r /= n;
			a /= n;
		}
		i = Math.floor(6 * t);
		o = 1 - a;
		s = 6 * t - i;
		if (0 !== (1 & i)) {
			s = 1 - s;
		}
		l = r + s * (o - r);
		var u;
		var c;
		var f;
		switch (i) {
		default:
		case 6:
		case 0:
			u = o;
			c = l;
			f = r;
			break;

		case 1:
			u = l;
			c = o;
			f = r;
			break;

		case 2:
			u = r;
			c = o;
			f = l;
			break;

		case 3:
			u = r;
			c = l;
			f = o;
			break;

		case 4:
			u = l;
			c = r;
			f = o;
			break;

		case 5:
			u = o;
			c = r;
			f = l;
			break;
		}
		return [ 255 * u, 255 * c, 255 * f ];
	};
	i.cmyk.rgb = function(e) {
		var t = e[0] / 100;
		var r = e[1] / 100;
		var a = e[2] / 100;
		var n = e[3] / 100;
		var i;
		var o;
		var s;
		i = 1 - Math.min(1, t * (1 - n) + n);
		o = 1 - Math.min(1, r * (1 - n) + n);
		s = 1 - Math.min(1, a * (1 - n) + n);
		return [ 255 * i, 255 * o, 255 * s ];
	};
	i.xyz.rgb = function(e) {
		var t = e[0] / 100;
		var r = e[1] / 100;
		var a = e[2] / 100;
		var n;
		var i;
		var o;
		n = 3.2406 * t + -1.5372 * r + -.4986 * a;
		i = -.9689 * t + 1.8758 * r + .0415 * a;
		o = .0557 * t + -.204 * r + 1.057 * a;
		n = n > .0031308 ? 1.055 * Math.pow(n, 1 / 2.4) - .055 : 12.92 * n;
		i = i > .0031308 ? 1.055 * Math.pow(i, 1 / 2.4) - .055 : 12.92 * i;
		o = o > .0031308 ? 1.055 * Math.pow(o, 1 / 2.4) - .055 : 12.92 * o;
		n = Math.min(Math.max(0, n), 1);
		i = Math.min(Math.max(0, i), 1);
		o = Math.min(Math.max(0, o), 1);
		return [ 255 * n, 255 * i, 255 * o ];
	};
	i.xyz.lab = function(e) {
		var t = e[0];
		var r = e[1];
		var a = e[2];
		var n;
		var i;
		var o;
		t /= 95.047;
		r /= 100;
		a /= 108.883;
		t = t > .008856 ? Math.pow(t, 1 / 3) : 7.787 * t + 16 / 116;
		r = r > .008856 ? Math.pow(r, 1 / 3) : 7.787 * r + 16 / 116;
		a = a > .008856 ? Math.pow(a, 1 / 3) : 7.787 * a + 16 / 116;
		n = 116 * r - 16;
		i = 500 * (t - r);
		o = 200 * (r - a);
		return [ n, i, o ];
	};
	i.lab.xyz = function(e) {
		var t = e[0];
		var r = e[1];
		var a = e[2];
		var n;
		var i;
		var o;
		i = (t + 16) / 116;
		n = r / 500 + i;
		o = i - a / 200;
		var s = Math.pow(i, 3);
		var l = Math.pow(n, 3);
		var u = Math.pow(o, 3);
		i = s > .008856 ? s : (i - 16 / 116) / 7.787;
		n = l > .008856 ? l : (n - 16 / 116) / 7.787;
		o = u > .008856 ? u : (o - 16 / 116) / 7.787;
		n *= 95.047;
		i *= 100;
		o *= 108.883;
		return [ n, i, o ];
	};
	i.lab.lch = function(e) {
		var t = e[0];
		var r = e[1];
		var a = e[2];
		var n;
		var i;
		var o;
		n = Math.atan2(a, r);
		i = 360 * n / 2 / Math.PI;
		if (i < 0) {
			i += 360;
		}
		o = Math.sqrt(r * r + a * a);
		return [ t, o, i ];
	};
	i.lch.lab = function(e) {
		var t = e[0];
		var r = e[1];
		var a = e[2];
		var n;
		var i;
		var o;
		o = a / 360 * 2 * Math.PI;
		n = r * Math.cos(o);
		i = r * Math.sin(o);
		return [ t, n, i ];
	};
	i.rgb.ansi16 = function(e) {
		var t = e[0];
		var r = e[1];
		var a = e[2];
		var n = 1 in arguments ? arguments[1] : i.rgb.hsv(e)[2];
		n = Math.round(n / 50);
		if (0 === n) {
			return 30;
		}
		var o = 30 + (Math.round(a / 255) << 2 | Math.round(r / 255) << 1 | Math.round(t / 255));
		if (2 === n) {
			o += 60;
		}
		return o;
	};
	i.hsv.ansi16 = function(e) {
		return i.rgb.ansi16(i.hsv.rgb(e), e[2]);
	};
	i.rgb.ansi256 = function(e) {
		var t = e[0];
		var r = e[1];
		var a = e[2];
		if (t === r && r === a) {
			if (t < 8) {
				return 16;
			}
			if (t > 248) {
				return 231;
			}
			return Math.round((t - 8) / 247 * 24) + 232;
		}
		var n = 16 + 36 * Math.round(t / 255 * 5) + 6 * Math.round(r / 255 * 5) + Math.round(a / 255 * 5);
		return n;
	};
	i.ansi16.rgb = function(e) {
		var t = e % 10;
		if (0 === t || 7 === t) {
			if (e > 50) {
				t += 3.5;
			}
			t = t / 10.5 * 255;
			return [ t, t, t ];
		}
		var r = .5 * (1 + ~~(e > 50));
		var a = (1 & t) * r * 255;
		var n = (t >> 1 & 1) * r * 255;
		var i = (t >> 2 & 1) * r * 255;
		return [ a, n, i ];
	};
	i.ansi256.rgb = function(e) {
		if (e >= 232) {
			var t = 10 * (e - 232) + 8;
			return [ t, t, t ];
		}
		e -= 16;
		var r;
		var a = Math.floor(e / 36) / 5 * 255;
		var n = Math.floor((r = e % 36) / 6) / 5 * 255;
		var i = r % 6 / 5 * 255;
		return [ a, n, i ];
	};
	i.rgb.hex = function(e) {
		var t = ((255 & Math.round(e[0])) << 16) + ((255 & Math.round(e[1])) << 8) + (255 & Math.round(e[2]));
		var r = t.toString(16).toUpperCase();
		return "000000".substring(r.length) + r;
	};
	i.hex.rgb = function(e) {
		var t = e.toString(16).match(/[a-f0-9]{6}|[a-f0-9]{3}/i);
		if (!t) {
			return [ 0, 0, 0 ];
		}
		var r = t[0];
		if (3 === t[0].length) {
			r = r.split("").map((function(e) {
				return e + e;
			})).join("");
		}
		var a = parseInt(r, 16);
		var n = a >> 16 & 255;
		var i = a >> 8 & 255;
		var o = 255 & a;
		return [ n, i, o ];
	};
	i.rgb.hcg = function(e) {
		var t = e[0] / 255;
		var r = e[1] / 255;
		var a = e[2] / 255;
		var n = Math.max(Math.max(t, r), a);
		var i = Math.min(Math.min(t, r), a);
		var o = n - i;
		var s;
		var l;
		if (o < 1) {
			s = i / (1 - o);
		} else {
			s = 0;
		}
		if (o <= 0) {
			l = 0;
		} else if (n === t) {
			l = (r - a) / o % 6;
		} else if (n === r) {
			l = 2 + (a - t) / o;
		} else {
			l = 4 + (t - r) / o + 4;
		}
		l /= 6;
		l %= 1;
		return [ 360 * l, 100 * o, 100 * s ];
	};
	i.hsl.hcg = function(e) {
		var t = e[1] / 100;
		var r = e[2] / 100;
		var a = 1;
		var n = 0;
		if (r < .5) {
			a = 2 * t * r;
		} else {
			a = 2 * t * (1 - r);
		}
		if (a < 1) {
			n = (r - .5 * a) / (1 - a);
		}
		return [ e[0], 100 * a, 100 * n ];
	};
	i.hsv.hcg = function(e) {
		var t = e[1] / 100;
		var r = e[2] / 100;
		var a = t * r;
		var n = 0;
		if (a < 1) {
			n = (r - a) / (1 - a);
		}
		return [ e[0], 100 * a, 100 * n ];
	};
	i.hcg.rgb = function(e) {
		var t = e[0] / 360;
		var r = e[1] / 100;
		var a = e[2] / 100;
		if (0 === r) {
			return [ 255 * a, 255 * a, 255 * a ];
		}
		var n = [ 0, 0, 0 ];
		var i = t % 1 * 6;
		var o = i % 1;
		var s = 1 - o;
		var l = 0;
		switch (Math.floor(i)) {
		case 0:
			n[0] = 1;
			n[1] = o;
			n[2] = 0;
			break;

		case 1:
			n[0] = s;
			n[1] = 1;
			n[2] = 0;
			break;

		case 2:
			n[0] = 0;
			n[1] = 1;
			n[2] = o;
			break;

		case 3:
			n[0] = 0;
			n[1] = s;
			n[2] = 1;
			break;

		case 4:
			n[0] = o;
			n[1] = 0;
			n[2] = 1;
			break;

		default:
			n[0] = 1;
			n[1] = 0;
			n[2] = s;
		}
		l = (1 - r) * a;
		return [ 255 * (r * n[0] + l), 255 * (r * n[1] + l), 255 * (r * n[2] + l) ];
	};
	i.hcg.hsv = function(e) {
		var t = e[1] / 100;
		var r = e[2] / 100;
		var a = t + r * (1 - t);
		var n = 0;
		if (a > 0) {
			n = t / a;
		}
		return [ e[0], 100 * n, 100 * a ];
	};
	i.hcg.hsl = function(e) {
		var t = e[1] / 100;
		var r = e[2] / 100;
		var a = r * (1 - t) + .5 * t;
		var n = 0;
		if (a > 0 && a < .5) {
			n = t / (2 * a);
		} else if (a >= .5 && a < 1) {
			n = t / (2 * (1 - a));
		}
		return [ e[0], 100 * n, 100 * a ];
	};
	i.hcg.hwb = function(e) {
		var t = e[1] / 100;
		var r = e[2] / 100;
		var a = t + r * (1 - t);
		return [ e[0], 100 * (a - t), 100 * (1 - a) ];
	};
	i.hwb.hcg = function(e) {
		var t = e[1] / 100;
		var r = e[2] / 100;
		var a = 1 - r;
		var n = a - t;
		var i = 0;
		if (n < 1) {
			i = (a - n) / (1 - n);
		}
		return [ e[0], 100 * n, 100 * i ];
	};
	i.apple.rgb = function(e) {
		return [ e[0] / 65535 * 255, e[1] / 65535 * 255, e[2] / 65535 * 255 ];
	};
	i.rgb.apple = function(e) {
		return [ e[0] / 255 * 65535, e[1] / 255 * 65535, e[2] / 255 * 65535 ];
	};
	i.gray.rgb = function(e) {
		return [ e[0] / 100 * 255, e[0] / 100 * 255, e[0] / 100 * 255 ];
	};
	i.gray.hsl = i.gray.hsv = function(e) {
		return [ 0, 0, e[0] ];
	};
	i.gray.hwb = function(e) {
		return [ 0, 100, e[0] ];
	};
	i.gray.cmyk = function(e) {
		return [ 0, 0, 0, e[0] ];
	};
	i.gray.lab = function(e) {
		return [ e[0], 0, 0 ];
	};
	i.gray.hex = function(e) {
		var t = 255 & Math.round(e[0] / 100 * 255);
		var r = (t << 16) + (t << 8) + t;
		var a = r.toString(16).toUpperCase();
		return "000000".substring(a.length) + a;
	};
	i.rgb.gray = function(e) {
		var t = (e[0] + e[1] + e[2]) / 3;
		return [ t / 255 * 100 ];
	};
	var u = e.exports;
	function buildGraph() {
		var e = {};
		var t = Object.keys(u);
		for (var r = t.length, a = 0; a < r; a++) {
			e[t[a]] = {
				distance: -1,
				parent: null
			};
		}
		return e;
	}
	function deriveBFS(e) {
		var t = buildGraph();
		var r = [ e ];
		t[e].distance = 0;
		while (r.length) {
			var a = r.pop();
			var n = Object.keys(u[a]);
			for (var i = n.length, o = 0; o < i; o++) {
				var s = n[o];
				var l = t[s];
				if (-1 === l.distance) {
					l.distance = t[a].distance + 1;
					l.parent = a;
					r.unshift(s);
				}
			}
		}
		return t;
	}
	function link(e, t) {
		return function(r) {
			return t(e(r));
		};
	}
	function wrapConversion(e, t) {
		var r = [ t[e].parent, e ];
		var a = u[t[e].parent][e];
		var n = t[e].parent;
		while (t[n].parent) {
			r.unshift(t[n].parent);
			a = link(u[t[n].parent][n], a);
			n = t[n].parent;
		}
		a.conversion = r;
		return a;
	}
	var route$1 = function(e) {
		var t = deriveBFS(e);
		var r = {};
		var a = Object.keys(t);
		for (var n = a.length, i = 0; i < n; i++) {
			var o = a[i];
			var s = t[o];
			if (null === s.parent) {
				continue;
			}
			r[o] = wrapConversion(o, t);
		}
		return r;
	};
	var c = e.exports;
	var f = route$1;
	var d = {};
	var h = Object.keys(c);
	function wrapRaw(e) {
		var wrappedFn = function(t) {
			if (void 0 === t || null === t) {
				return t;
			}
			if (arguments.length > 1) {
				t = Array.prototype.slice.call(arguments);
			}
			return e(t);
		};
		if ("conversion" in e) {
			wrappedFn.conversion = e.conversion;
		}
		return wrappedFn;
	}
	function wrapRounded(e) {
		var wrappedFn = function(t) {
			if (void 0 === t || null === t) {
				return t;
			}
			if (arguments.length > 1) {
				t = Array.prototype.slice.call(arguments);
			}
			var r = e(t);
			if ("object" === typeof r) {
				for (var a = r.length, n = 0; n < a; n++) {
					r[n] = Math.round(r[n]);
				}
			}
			return r;
		};
		if ("conversion" in e) {
			wrappedFn.conversion = e.conversion;
		}
		return wrappedFn;
	}
	h.forEach((function(e) {
		d[e] = {};
		Object.defineProperty(d[e], "channels", {
			value: c[e].channels
		});
		Object.defineProperty(d[e], "labels", {
			value: c[e].labels
		});
		var t = f(e);
		var r = Object.keys(t);
		r.forEach((function(r) {
			var a = t[r];
			d[e][r] = wrapRounded(a);
			d[e][r].raw = wrapRaw(a);
		}));
	}));
	var v = d;
	var g = {
		aliceblue: [ 240, 248, 255 ],
		antiquewhite: [ 250, 235, 215 ],
		aqua: [ 0, 255, 255 ],
		aquamarine: [ 127, 255, 212 ],
		azure: [ 240, 255, 255 ],
		beige: [ 245, 245, 220 ],
		bisque: [ 255, 228, 196 ],
		black: [ 0, 0, 0 ],
		blanchedalmond: [ 255, 235, 205 ],
		blue: [ 0, 0, 255 ],
		blueviolet: [ 138, 43, 226 ],
		brown: [ 165, 42, 42 ],
		burlywood: [ 222, 184, 135 ],
		cadetblue: [ 95, 158, 160 ],
		chartreuse: [ 127, 255, 0 ],
		chocolate: [ 210, 105, 30 ],
		coral: [ 255, 127, 80 ],
		cornflowerblue: [ 100, 149, 237 ],
		cornsilk: [ 255, 248, 220 ],
		crimson: [ 220, 20, 60 ],
		cyan: [ 0, 255, 255 ],
		darkblue: [ 0, 0, 139 ],
		darkcyan: [ 0, 139, 139 ],
		darkgoldenrod: [ 184, 134, 11 ],
		darkgray: [ 169, 169, 169 ],
		darkgreen: [ 0, 100, 0 ],
		darkgrey: [ 169, 169, 169 ],
		darkkhaki: [ 189, 183, 107 ],
		darkmagenta: [ 139, 0, 139 ],
		darkolivegreen: [ 85, 107, 47 ],
		darkorange: [ 255, 140, 0 ],
		darkorchid: [ 153, 50, 204 ],
		darkred: [ 139, 0, 0 ],
		darksalmon: [ 233, 150, 122 ],
		darkseagreen: [ 143, 188, 143 ],
		darkslateblue: [ 72, 61, 139 ],
		darkslategray: [ 47, 79, 79 ],
		darkslategrey: [ 47, 79, 79 ],
		darkturquoise: [ 0, 206, 209 ],
		darkviolet: [ 148, 0, 211 ],
		deeppink: [ 255, 20, 147 ],
		deepskyblue: [ 0, 191, 255 ],
		dimgray: [ 105, 105, 105 ],
		dimgrey: [ 105, 105, 105 ],
		dodgerblue: [ 30, 144, 255 ],
		firebrick: [ 178, 34, 34 ],
		floralwhite: [ 255, 250, 240 ],
		forestgreen: [ 34, 139, 34 ],
		fuchsia: [ 255, 0, 255 ],
		gainsboro: [ 220, 220, 220 ],
		ghostwhite: [ 248, 248, 255 ],
		gold: [ 255, 215, 0 ],
		goldenrod: [ 218, 165, 32 ],
		gray: [ 128, 128, 128 ],
		green: [ 0, 128, 0 ],
		greenyellow: [ 173, 255, 47 ],
		grey: [ 128, 128, 128 ],
		honeydew: [ 240, 255, 240 ],
		hotpink: [ 255, 105, 180 ],
		indianred: [ 205, 92, 92 ],
		indigo: [ 75, 0, 130 ],
		ivory: [ 255, 255, 240 ],
		khaki: [ 240, 230, 140 ],
		lavender: [ 230, 230, 250 ],
		lavenderblush: [ 255, 240, 245 ],
		lawngreen: [ 124, 252, 0 ],
		lemonchiffon: [ 255, 250, 205 ],
		lightblue: [ 173, 216, 230 ],
		lightcoral: [ 240, 128, 128 ],
		lightcyan: [ 224, 255, 255 ],
		lightgoldenrodyellow: [ 250, 250, 210 ],
		lightgray: [ 211, 211, 211 ],
		lightgreen: [ 144, 238, 144 ],
		lightgrey: [ 211, 211, 211 ],
		lightpink: [ 255, 182, 193 ],
		lightsalmon: [ 255, 160, 122 ],
		lightseagreen: [ 32, 178, 170 ],
		lightskyblue: [ 135, 206, 250 ],
		lightslategray: [ 119, 136, 153 ],
		lightslategrey: [ 119, 136, 153 ],
		lightsteelblue: [ 176, 196, 222 ],
		lightyellow: [ 255, 255, 224 ],
		lime: [ 0, 255, 0 ],
		limegreen: [ 50, 205, 50 ],
		linen: [ 250, 240, 230 ],
		magenta: [ 255, 0, 255 ],
		maroon: [ 128, 0, 0 ],
		mediumaquamarine: [ 102, 205, 170 ],
		mediumblue: [ 0, 0, 205 ],
		mediumorchid: [ 186, 85, 211 ],
		mediumpurple: [ 147, 112, 219 ],
		mediumseagreen: [ 60, 179, 113 ],
		mediumslateblue: [ 123, 104, 238 ],
		mediumspringgreen: [ 0, 250, 154 ],
		mediumturquoise: [ 72, 209, 204 ],
		mediumvioletred: [ 199, 21, 133 ],
		midnightblue: [ 25, 25, 112 ],
		mintcream: [ 245, 255, 250 ],
		mistyrose: [ 255, 228, 225 ],
		moccasin: [ 255, 228, 181 ],
		navajowhite: [ 255, 222, 173 ],
		navy: [ 0, 0, 128 ],
		oldlace: [ 253, 245, 230 ],
		olive: [ 128, 128, 0 ],
		olivedrab: [ 107, 142, 35 ],
		orange: [ 255, 165, 0 ],
		orangered: [ 255, 69, 0 ],
		orchid: [ 218, 112, 214 ],
		palegoldenrod: [ 238, 232, 170 ],
		palegreen: [ 152, 251, 152 ],
		paleturquoise: [ 175, 238, 238 ],
		palevioletred: [ 219, 112, 147 ],
		papayawhip: [ 255, 239, 213 ],
		peachpuff: [ 255, 218, 185 ],
		peru: [ 205, 133, 63 ],
		pink: [ 255, 192, 203 ],
		plum: [ 221, 160, 221 ],
		powderblue: [ 176, 224, 230 ],
		purple: [ 128, 0, 128 ],
		rebeccapurple: [ 102, 51, 153 ],
		red: [ 255, 0, 0 ],
		rosybrown: [ 188, 143, 143 ],
		royalblue: [ 65, 105, 225 ],
		saddlebrown: [ 139, 69, 19 ],
		salmon: [ 250, 128, 114 ],
		sandybrown: [ 244, 164, 96 ],
		seagreen: [ 46, 139, 87 ],
		seashell: [ 255, 245, 238 ],
		sienna: [ 160, 82, 45 ],
		silver: [ 192, 192, 192 ],
		skyblue: [ 135, 206, 235 ],
		slateblue: [ 106, 90, 205 ],
		slategray: [ 112, 128, 144 ],
		slategrey: [ 112, 128, 144 ],
		snow: [ 255, 250, 250 ],
		springgreen: [ 0, 255, 127 ],
		steelblue: [ 70, 130, 180 ],
		tan: [ 210, 180, 140 ],
		teal: [ 0, 128, 128 ],
		thistle: [ 216, 191, 216 ],
		tomato: [ 255, 99, 71 ],
		turquoise: [ 64, 224, 208 ],
		violet: [ 238, 130, 238 ],
		wheat: [ 245, 222, 179 ],
		white: [ 255, 255, 255 ],
		whitesmoke: [ 245, 245, 245 ],
		yellow: [ 255, 255, 0 ],
		yellowgreen: [ 154, 205, 50 ]
	};
	var p = g;
	var m = {
		getRgba: getRgba,
		getHsla: getHsla,
		getRgb: getRgb,
		getHsl: getHsl,
		getHwb: getHwb,
		getAlpha: getAlpha,
		hexString: hexString,
		rgbString: rgbString,
		rgbaString: rgbaString,
		percentString: percentString,
		percentaString: percentaString,
		hslString: hslString,
		hslaString: hslaString,
		hwbString: hwbString,
		keyword: keyword
	};
	function getRgba(e) {
		if (!e) {
			return;
		}
		var t = /^#([a-fA-F0-9]{3,4})$/i, r = /^#([a-fA-F0-9]{6}([a-fA-F0-9]{2})?)$/i, a = /^rgba?\(\s*([+-]?\d+)\s*,\s*([+-]?\d+)\s*,\s*([+-]?\d+)\s*(?:,\s*([+-]?[\d\.]+)\s*)?\)$/i, n = /^rgba?\(\s*([+-]?[\d\.]+)\%\s*,\s*([+-]?[\d\.]+)\%\s*,\s*([+-]?[\d\.]+)\%\s*(?:,\s*([+-]?[\d\.]+)\s*)?\)$/i, i = /(\w+)/;
		var o = [ 0, 0, 0 ], s = 1, l = e.match(t), u = "";
		if (l) {
			l = l[1];
			u = l[3];
			for (var c = 0; c < o.length; c++) {
				o[c] = parseInt(l[c] + l[c], 16);
			}
			if (u) {
				s = Math.round(parseInt(u + u, 16) / 255 * 100) / 100;
			}
		} else if (l = e.match(r)) {
			u = l[2];
			l = l[1];
			for (c = 0; c < o.length; c++) {
				o[c] = parseInt(l.slice(2 * c, 2 * c + 2), 16);
			}
			if (u) {
				s = Math.round(parseInt(u, 16) / 255 * 100) / 100;
			}
		} else if (l = e.match(a)) {
			for (c = 0; c < o.length; c++) {
				o[c] = parseInt(l[c + 1]);
			}
			s = parseFloat(l[4]);
		} else if (l = e.match(n)) {
			for (c = 0; c < o.length; c++) {
				o[c] = Math.round(2.55 * parseFloat(l[c + 1]));
			}
			s = parseFloat(l[4]);
		} else if (l = e.match(i)) {
			if ("transparent" == l[1]) {
				return [ 0, 0, 0, 0 ];
			}
			o = p[l[1]];
			if (!o) {
				return;
			}
		}
		for (c = 0; c < o.length; c++) {
			o[c] = scale(o[c], 0, 255);
		}
		if (!s && 0 != s) {
			s = 1;
		} else {
			s = scale(s, 0, 1);
		}
		o[3] = s;
		return o;
	}
	function getHsla(e) {
		if (!e) {
			return;
		}
		var t = /^hsla?\(\s*([+-]?\d+)(?:deg)?\s*,\s*([+-]?[\d\.]+)%\s*,\s*([+-]?[\d\.]+)%\s*(?:,\s*([+-]?[\d\.]+)\s*)?\)/;
		var r = e.match(t);
		if (r) {
			var a = parseFloat(r[4]);
			var n = scale(parseInt(r[1]), 0, 360), i = scale(parseFloat(r[2]), 0, 100), o = scale(parseFloat(r[3]), 0, 100), s = scale(isNaN(a) ? 1 : a, 0, 1);
			return [ n, i, o, s ];
		}
	}
	function getHwb(e) {
		if (!e) {
			return;
		}
		var t = /^hwb\(\s*([+-]?\d+)(?:deg)?\s*,\s*([+-]?[\d\.]+)%\s*,\s*([+-]?[\d\.]+)%\s*(?:,\s*([+-]?[\d\.]+)\s*)?\)/;
		var r = e.match(t);
		if (r) {
			var a = parseFloat(r[4]);
			var n = scale(parseInt(r[1]), 0, 360), i = scale(parseFloat(r[2]), 0, 100), o = scale(parseFloat(r[3]), 0, 100), s = scale(isNaN(a) ? 1 : a, 0, 1);
			return [ n, i, o, s ];
		}
	}
	function getRgb(e) {
		var t = getRgba(e);
		return t && t.slice(0, 3);
	}
	function getHsl(e) {
		var t = getHsla(e);
		return t && t.slice(0, 3);
	}
	function getAlpha(e) {
		var t = getRgba(e);
		if (t) {
			return t[3];
		} else if (t = getHsla(e)) {
			return t[3];
		} else if (t = getHwb(e)) {
			return t[3];
		}
	}
	function hexString(e, t) {
		t = void 0 !== t && 3 === e.length ? t : e[3];
		return "#" + hexDouble(e[0]) + hexDouble(e[1]) + hexDouble(e[2]) + (t >= 0 && t < 1 ? hexDouble(Math.round(255 * t)) : "");
	}
	function rgbString(e, t) {
		if (t < 1 || e[3] && e[3] < 1) {
			return rgbaString(e, t);
		}
		return "rgb(" + e[0] + ", " + e[1] + ", " + e[2] + ")";
	}
	function rgbaString(e, t) {
		if (void 0 === t) {
			t = void 0 !== e[3] ? e[3] : 1;
		}
		return "rgba(" + e[0] + ", " + e[1] + ", " + e[2] + ", " + t + ")";
	}
	function percentString(e, t) {
		if (t < 1 || e[3] && e[3] < 1) {
			return percentaString(e, t);
		}
		var r = Math.round(e[0] / 255 * 100), a = Math.round(e[1] / 255 * 100), n = Math.round(e[2] / 255 * 100);
		return "rgb(" + r + "%, " + a + "%, " + n + "%)";
	}
	function percentaString(e, t) {
		var r = Math.round(e[0] / 255 * 100), a = Math.round(e[1] / 255 * 100), n = Math.round(e[2] / 255 * 100);
		return "rgba(" + r + "%, " + a + "%, " + n + "%, " + (t || e[3] || 1) + ")";
	}
	function hslString(e, t) {
		if (t < 1 || e[3] && e[3] < 1) {
			return hslaString(e, t);
		}
		return "hsl(" + e[0] + ", " + e[1] + "%, " + e[2] + "%)";
	}
	function hslaString(e, t) {
		if (void 0 === t) {
			t = void 0 !== e[3] ? e[3] : 1;
		}
		return "hsla(" + e[0] + ", " + e[1] + "%, " + e[2] + "%, " + t + ")";
	}
	function hwbString(e, t) {
		if (void 0 === t) {
			t = void 0 !== e[3] ? e[3] : 1;
		}
		return "hwb(" + e[0] + ", " + e[1] + "%, " + e[2] + "%" + (void 0 !== t && 1 !== t ? ", " + t : "") + ")";
	}
	function keyword(e) {
		return b[e.slice(0, 3)];
	}
	function scale(e, t, r) {
		return Math.min(Math.max(t, e), r);
	}
	function hexDouble(e) {
		var t = e.toString(16).toUpperCase();
		return t.length < 2 ? "0" + t : t;
	}
	var b = {};
	for (var x in p) {
		b[p[x]] = x;
	}
	var y = v;
	var _ = m;
	var Color = function(e) {
		if (e instanceof Color) {
			return e;
		}
		if (!(this instanceof Color)) {
			return new Color(e);
		}
		this.valid = false;
		this.values = {
			rgb: [ 0, 0, 0 ],
			hsl: [ 0, 0, 0 ],
			hsv: [ 0, 0, 0 ],
			hwb: [ 0, 0, 0 ],
			cmyk: [ 0, 0, 0, 0 ],
			alpha: 1
		};
		var t;
		if ("string" === typeof e) {
			t = _.getRgba(e);
			if (t) {
				this.setValues("rgb", t);
			} else if (t = _.getHsla(e)) {
				this.setValues("hsl", t);
			} else if (t = _.getHwb(e)) {
				this.setValues("hwb", t);
			}
		} else if ("object" === typeof e) {
			t = e;
			if (void 0 !== t.r || void 0 !== t.red) {
				this.setValues("rgb", t);
			} else if (void 0 !== t.l || void 0 !== t.lightness) {
				this.setValues("hsl", t);
			} else if (void 0 !== t.v || void 0 !== t.value) {
				this.setValues("hsv", t);
			} else if (void 0 !== t.w || void 0 !== t.whiteness) {
				this.setValues("hwb", t);
			} else if (void 0 !== t.c || void 0 !== t.cyan) {
				this.setValues("cmyk", t);
			}
		}
	};
	Color.prototype = {
		isValid: function() {
			return this.valid;
		},
		rgb: function() {
			return this.setSpace("rgb", arguments);
		},
		hsl: function() {
			return this.setSpace("hsl", arguments);
		},
		hsv: function() {
			return this.setSpace("hsv", arguments);
		},
		hwb: function() {
			return this.setSpace("hwb", arguments);
		},
		cmyk: function() {
			return this.setSpace("cmyk", arguments);
		},
		rgbArray: function() {
			return this.values.rgb;
		},
		hslArray: function() {
			return this.values.hsl;
		},
		hsvArray: function() {
			return this.values.hsv;
		},
		hwbArray: function() {
			var e = this.values;
			if (1 !== e.alpha) {
				return e.hwb.concat([ e.alpha ]);
			}
			return e.hwb;
		},
		cmykArray: function() {
			return this.values.cmyk;
		},
		rgbaArray: function() {
			var e = this.values;
			return e.rgb.concat([ e.alpha ]);
		},
		hslaArray: function() {
			var e = this.values;
			return e.hsl.concat([ e.alpha ]);
		},
		alpha: function(e) {
			if (void 0 === e) {
				return this.values.alpha;
			}
			this.setValues("alpha", e);
			return this;
		},
		red: function(e) {
			return this.setChannel("rgb", 0, e);
		},
		green: function(e) {
			return this.setChannel("rgb", 1, e);
		},
		blue: function(e) {
			return this.setChannel("rgb", 2, e);
		},
		hue: function(e) {
			if (e) {
				e %= 360;
				e = e < 0 ? 360 + e : e;
			}
			return this.setChannel("hsl", 0, e);
		},
		saturation: function(e) {
			return this.setChannel("hsl", 1, e);
		},
		lightness: function(e) {
			return this.setChannel("hsl", 2, e);
		},
		saturationv: function(e) {
			return this.setChannel("hsv", 1, e);
		},
		whiteness: function(e) {
			return this.setChannel("hwb", 1, e);
		},
		blackness: function(e) {
			return this.setChannel("hwb", 2, e);
		},
		value: function(e) {
			return this.setChannel("hsv", 2, e);
		},
		cyan: function(e) {
			return this.setChannel("cmyk", 0, e);
		},
		magenta: function(e) {
			return this.setChannel("cmyk", 1, e);
		},
		yellow: function(e) {
			return this.setChannel("cmyk", 2, e);
		},
		black: function(e) {
			return this.setChannel("cmyk", 3, e);
		},
		hexString: function() {
			return _.hexString(this.values.rgb);
		},
		rgbString: function() {
			return _.rgbString(this.values.rgb, this.values.alpha);
		},
		rgbaString: function() {
			return _.rgbaString(this.values.rgb, this.values.alpha);
		},
		percentString: function() {
			return _.percentString(this.values.rgb, this.values.alpha);
		},
		hslString: function() {
			return _.hslString(this.values.hsl, this.values.alpha);
		},
		hslaString: function() {
			return _.hslaString(this.values.hsl, this.values.alpha);
		},
		hwbString: function() {
			return _.hwbString(this.values.hwb, this.values.alpha);
		},
		keyword: function() {
			return _.keyword(this.values.rgb, this.values.alpha);
		},
		rgbNumber: function() {
			var e = this.values.rgb;
			return e[0] << 16 | e[1] << 8 | e[2];
		},
		luminosity: function() {
			var e = this.values.rgb;
			var t = [];
			for (var r = 0; r < e.length; r++) {
				var a = e[r] / 255;
				t[r] = a <= .03928 ? a / 12.92 : Math.pow((a + .055) / 1.055, 2.4);
			}
			return .2126 * t[0] + .7152 * t[1] + .0722 * t[2];
		},
		contrast: function(e) {
			var t = this.luminosity();
			var r = e.luminosity();
			if (t > r) {
				return (t + .05) / (r + .05);
			}
			return (r + .05) / (t + .05);
		},
		level: function(e) {
			var t = this.contrast(e);
			if (t >= 7.1) {
				return "AAA";
			}
			return t >= 4.5 ? "AA" : "";
		},
		dark: function() {
			var e = this.values.rgb;
			var t = (299 * e[0] + 587 * e[1] + 114 * e[2]) / 1e3;
			return t < 128;
		},
		light: function() {
			return !this.dark();
		},
		negate: function() {
			var e = [];
			for (var t = 0; t < 3; t++) {
				e[t] = 255 - this.values.rgb[t];
			}
			this.setValues("rgb", e);
			return this;
		},
		lighten: function(e) {
			var t = this.values.hsl;
			t[2] += t[2] * e;
			this.setValues("hsl", t);
			return this;
		},
		darken: function(e) {
			var t = this.values.hsl;
			t[2] -= t[2] * e;
			this.setValues("hsl", t);
			return this;
		},
		saturate: function(e) {
			var t = this.values.hsl;
			t[1] += t[1] * e;
			this.setValues("hsl", t);
			return this;
		},
		desaturate: function(e) {
			var t = this.values.hsl;
			t[1] -= t[1] * e;
			this.setValues("hsl", t);
			return this;
		},
		whiten: function(e) {
			var t = this.values.hwb;
			t[1] += t[1] * e;
			this.setValues("hwb", t);
			return this;
		},
		blacken: function(e) {
			var t = this.values.hwb;
			t[2] += t[2] * e;
			this.setValues("hwb", t);
			return this;
		},
		greyscale: function() {
			var e = this.values.rgb;
			var t = .3 * e[0] + .59 * e[1] + .11 * e[2];
			this.setValues("rgb", [ t, t, t ]);
			return this;
		},
		clearer: function(e) {
			var t = this.values.alpha;
			this.setValues("alpha", t - t * e);
			return this;
		},
		opaquer: function(e) {
			var t = this.values.alpha;
			this.setValues("alpha", t + t * e);
			return this;
		},
		rotate: function(e) {
			var t = this.values.hsl;
			var r = (t[0] + e) % 360;
			t[0] = r < 0 ? 360 + r : r;
			this.setValues("hsl", t);
			return this;
		},
		mix: function(e, t) {
			var r = this;
			var a = e;
			var n = void 0 === t ? .5 : t;
			var i = 2 * n - 1;
			var o = r.alpha() - a.alpha();
			var s = ((i * o === -1 ? i : (i + o) / (1 + i * o)) + 1) / 2;
			var l = 1 - s;
			return this.rgb(s * r.red() + l * a.red(), s * r.green() + l * a.green(), s * r.blue() + l * a.blue()).alpha(r.alpha() * n + a.alpha() * (1 - n));
		},
		toJSON: function() {
			return this.rgb();
		},
		clone: function() {
			var e = new Color;
			var t = this.values;
			var r = e.values;
			var a, n;
			for (var i in t) {
				if (t.hasOwnProperty(i)) {
					a = t[i];
					n = {}.toString.call(a);
					if ("[object Array]" === n) {
						r[i] = a.slice(0);
					} else if ("[object Number]" === n) {
						r[i] = a;
					} else {
						console.error("unexpected color value:", a);
					}
				}
			}
			return e;
		}
	};
	Color.prototype.spaces = {
		rgb: [ "red", "green", "blue" ],
		hsl: [ "hue", "saturation", "lightness" ],
		hsv: [ "hue", "saturation", "value" ],
		hwb: [ "hue", "whiteness", "blackness" ],
		cmyk: [ "cyan", "magenta", "yellow", "black" ]
	};
	Color.prototype.maxes = {
		rgb: [ 255, 255, 255 ],
		hsl: [ 360, 100, 100 ],
		hsv: [ 360, 100, 100 ],
		hwb: [ 360, 100, 100 ],
		cmyk: [ 100, 100, 100, 100 ]
	};
	Color.prototype.getValues = function(e) {
		var t = this.values;
		var r = {};
		for (var a = 0; a < e.length; a++) {
			r[e.charAt(a)] = t[e][a];
		}
		if (1 !== t.alpha) {
			r.a = t.alpha;
		}
		return r;
	};
	Color.prototype.setValues = function(e, t) {
		var r = this.values;
		var a = this.spaces;
		var n = this.maxes;
		var i = 1;
		var o;
		this.valid = true;
		if ("alpha" === e) {
			i = t;
		} else if (t.length) {
			r[e] = t.slice(0, e.length);
			i = t[e.length];
		} else if (void 0 !== t[e.charAt(0)]) {
			for (o = 0; o < e.length; o++) {
				r[e][o] = t[e.charAt(o)];
			}
			i = t.a;
		} else if (void 0 !== t[a[e][0]]) {
			var s = a[e];
			for (o = 0; o < e.length; o++) {
				r[e][o] = t[s[o]];
			}
			i = t.alpha;
		}
		r.alpha = Math.max(0, Math.min(1, void 0 === i ? r.alpha : i));
		if ("alpha" === e) {
			return false;
		}
		var l;
		for (o = 0; o < e.length; o++) {
			l = Math.max(0, Math.min(n[e][o], r[e][o]));
			r[e][o] = Math.round(l);
		}
		for (var u in a) {
			if (u !== e) {
				r[u] = y[e][u](r[e]);
			}
		}
		return true;
	};
	Color.prototype.setSpace = function(e, t) {
		var r = t[0];
		if (void 0 === r) {
			return this.getValues(e);
		}
		if ("number" === typeof r) {
			r = Array.prototype.slice.call(t);
		}
		this.setValues(e, r);
		return this;
	};
	Color.prototype.setChannel = function(e, t, r) {
		var a = this.values[e];
		if (void 0 === r) {
			return a[t];
		} else if (r === a[t]) {
			return this;
		}
		a[t] = r;
		this.setValues(e, a);
		return this;
	};
	if ("undefined" !== typeof window) {
		window.Color = Color;
	}
	var w = Color;
	var k = {
		exports: {}
	};
	function isValidKey(e) {
		return -1 === [ "__proto__", "prototype", "constructor" ].indexOf(e);
	}
	var M = {
		noop: function() {},
		uid: function() {
			var e = 0;
			return function() {
				return e++;
			};
		}(),
		isNullOrUndef: function(e) {
			return null === e || "undefined" === typeof e;
		},
		isArray: function(e) {
			if (Array.isArray && Array.isArray(e)) {
				return true;
			}
			var t = Object.prototype.toString.call(e);
			if ("[object" === t.substr(0, 7) && "Array]" === t.substr(-6)) {
				return true;
			}
			return false;
		},
		isObject: function(e) {
			return null !== e && "[object Object]" === Object.prototype.toString.call(e);
		},
		isFinite: function(e) {
			return ("number" === typeof e || e instanceof Number) && isFinite(e);
		},
		valueOrDefault: function(e, t) {
			return "undefined" === typeof e ? t : e;
		},
		valueAtIndexOrDefault: function(e, t, r) {
			return M.valueOrDefault(M.isArray(e) ? e[t] : e, r);
		},
		callback: function(e, t, r) {
			if (e && "function" === typeof e.call) {
				return e.apply(r, t);
			}
		},
		each: function(e, t, r, a) {
			var n, i, o;
			if (M.isArray(e)) {
				i = e.length;
				if (a) {
					for (n = i - 1; n >= 0; n--) {
						t.call(r, e[n], n);
					}
				} else {
					for (n = 0; n < i; n++) {
						t.call(r, e[n], n);
					}
				}
			} else if (M.isObject(e)) {
				o = Object.keys(e);
				i = o.length;
				for (n = 0; n < i; n++) {
					t.call(r, e[o[n]], o[n]);
				}
			}
		},
		arrayEquals: function(e, t) {
			var r, a, n, i;
			if (!e || !t || e.length !== t.length) {
				return false;
			}
			for (r = 0, a = e.length; r < a; ++r) {
				n = e[r];
				i = t[r];
				if (n instanceof Array && i instanceof Array) {
					if (!M.arrayEquals(n, i)) {
						return false;
					}
				} else if (n !== i) {
					return false;
				}
			}
			return true;
		},
		clone: function(e) {
			if (M.isArray(e)) {
				return e.map(M.clone);
			}
			if (M.isObject(e)) {
				var t = Object.create(e);
				var r = Object.keys(e);
				var a = r.length;
				var n = 0;
				for (;n < a; ++n) {
					t[r[n]] = M.clone(e[r[n]]);
				}
				return t;
			}
			return e;
		},
		_merger: function(e, t, r, a) {
			if (!isValidKey(e)) {
				return;
			}
			var n = t[e];
			var i = r[e];
			if (M.isObject(n) && M.isObject(i)) {
				M.merge(n, i, a);
			} else {
				t[e] = M.clone(i);
			}
		},
		_mergerIf: function(e, t, r) {
			if (!isValidKey(e)) {
				return;
			}
			var a = t[e];
			var n = r[e];
			if (M.isObject(a) && M.isObject(n)) {
				M.mergeIf(a, n);
			} else if (!Object.prototype.hasOwnProperty.call(t, e)) {
				t[e] = M.clone(n);
			}
		},
		merge: function(e, t, r) {
			var a = M.isArray(t) ? t : [ t ];
			var n = a.length;
			var i, o, s, l, u;
			if (!M.isObject(e)) {
				return e;
			}
			r = r || {};
			i = r.merger || M._merger;
			for (o = 0; o < n; ++o) {
				t = a[o];
				if (!M.isObject(t)) {
					continue;
				}
				s = Object.keys(t);
				for (u = 0, l = s.length; u < l; ++u) {
					i(s[u], e, t, r);
				}
			}
			return e;
		},
		mergeIf: function(e, t) {
			return M.merge(e, t, {
				merger: M._mergerIf
			});
		},
		extend: Object.assign || function(e) {
			return M.merge(e, [].slice.call(arguments, 1), {
				merger: function(e, t, r) {
					t[e] = r[e];
				}
			});
		},
		inherits: function(e) {
			var t = this;
			var r = e && Object.prototype.hasOwnProperty.call(e, "constructor") ? e.constructor : function() {
				return t.apply(this, arguments);
			};
			var Surrogate = function() {
				this.constructor = r;
			};
			Surrogate.prototype = t.prototype;
			r.prototype = new Surrogate;
			r.extend = M.inherits;
			if (e) {
				M.extend(r.prototype, e);
			}
			r.__super__ = t.prototype;
			return r;
		},
		_deprecated: function(e, t, r, a) {
			if (void 0 !== t) {
				console.warn(e + ': "' + r + '" is deprecated. Please use "' + a + '" instead');
			}
		}
	};
	var S = M;
	M.callCallback = M.callback;
	M.indexOf = function(e, t, r) {
		return Array.prototype.indexOf.call(e, t, r);
	};
	M.getValueOrDefault = M.valueOrDefault;
	M.getValueAtIndexOrDefault = M.valueAtIndexOrDefault;
	var P = {
		linear: function(e) {
			return e;
		},
		easeInQuad: function(e) {
			return e * e;
		},
		easeOutQuad: function(e) {
			return -e * (e - 2);
		},
		easeInOutQuad: function(e) {
			if ((e /= .5) < 1) {
				return .5 * e * e;
			}
			return -.5 * (--e * (e - 2) - 1);
		},
		easeInCubic: function(e) {
			return e * e * e;
		},
		easeOutCubic: function(e) {
			return (e -= 1) * e * e + 1;
		},
		easeInOutCubic: function(e) {
			if ((e /= .5) < 1) {
				return .5 * e * e * e;
			}
			return .5 * ((e -= 2) * e * e + 2);
		},
		easeInQuart: function(e) {
			return e * e * e * e;
		},
		easeOutQuart: function(e) {
			return -((e -= 1) * e * e * e - 1);
		},
		easeInOutQuart: function(e) {
			if ((e /= .5) < 1) {
				return .5 * e * e * e * e;
			}
			return -.5 * ((e -= 2) * e * e * e - 2);
		},
		easeInQuint: function(e) {
			return e * e * e * e * e;
		},
		easeOutQuint: function(e) {
			return (e -= 1) * e * e * e * e + 1;
		},
		easeInOutQuint: function(e) {
			if ((e /= .5) < 1) {
				return .5 * e * e * e * e * e;
			}
			return .5 * ((e -= 2) * e * e * e * e + 2);
		},
		easeInSine: function(e) {
			return 1 - Math.cos(e * (Math.PI / 2));
		},
		easeOutSine: function(e) {
			return Math.sin(e * (Math.PI / 2));
		},
		easeInOutSine: function(e) {
			return -.5 * (Math.cos(Math.PI * e) - 1);
		},
		easeInExpo: function(e) {
			return 0 === e ? 0 : Math.pow(2, 10 * (e - 1));
		},
		easeOutExpo: function(e) {
			return 1 === e ? 1 : 1 - Math.pow(2, -10 * e);
		},
		easeInOutExpo: function(e) {
			if (0 === e) {
				return 0;
			}
			if (1 === e) {
				return 1;
			}
			if ((e /= .5) < 1) {
				return .5 * Math.pow(2, 10 * (e - 1));
			}
			return .5 * (2 - Math.pow(2, -10 * --e));
		},
		easeInCirc: function(e) {
			if (e >= 1) {
				return e;
			}
			return -(Math.sqrt(1 - e * e) - 1);
		},
		easeOutCirc: function(e) {
			return Math.sqrt(1 - (e -= 1) * e);
		},
		easeInOutCirc: function(e) {
			if ((e /= .5) < 1) {
				return -.5 * (Math.sqrt(1 - e * e) - 1);
			}
			return .5 * (Math.sqrt(1 - (e -= 2) * e) + 1);
		},
		easeInElastic: function(e) {
			var t = 1.70158;
			var r = 0;
			var a = 1;
			if (0 === e) {
				return 0;
			}
			if (1 === e) {
				return 1;
			}
			if (!r) {
				r = .3;
			}
			t = r / (2 * Math.PI) * Math.asin(1 / a);
			return -a * Math.pow(2, 10 * (e -= 1)) * Math.sin((e - t) * (2 * Math.PI) / r);
		},
		easeOutElastic: function(e) {
			var t = 1.70158;
			var r = 0;
			var a = 1;
			if (0 === e) {
				return 0;
			}
			if (1 === e) {
				return 1;
			}
			if (!r) {
				r = .3;
			}
			t = r / (2 * Math.PI) * Math.asin(1 / a);
			return a * Math.pow(2, -10 * e) * Math.sin((e - t) * (2 * Math.PI) / r) + 1;
		},
		easeInOutElastic: function(e) {
			var t = 1.70158;
			var r = 0;
			var a = 1;
			if (0 === e) {
				return 0;
			}
			if (2 === (e /= .5)) {
				return 1;
			}
			if (!r) {
				r = .45;
			}
			t = r / (2 * Math.PI) * Math.asin(1 / a);
			if (e < 1) {
				return a * Math.pow(2, 10 * (e -= 1)) * Math.sin((e - t) * (2 * Math.PI) / r) * -.5;
			}
			return a * Math.pow(2, -10 * (e -= 1)) * Math.sin((e - t) * (2 * Math.PI) / r) * .5 + 1;
		},
		easeInBack: function(e) {
			var t = 1.70158;
			return e * e * ((t + 1) * e - t);
		},
		easeOutBack: function(e) {
			var t = 1.70158;
			return (e -= 1) * e * ((t + 1) * e + t) + 1;
		},
		easeInOutBack: function(e) {
			var t = 1.70158;
			if ((e /= .5) < 1) {
				return e * e * ((1 + (t *= 1.525)) * e - t) * .5;
			}
			return .5 * ((e -= 2) * e * ((1 + (t *= 1.525)) * e + t) + 2);
		},
		easeInBounce: function(e) {
			return 1 - P.easeOutBounce(1 - e);
		},
		easeOutBounce: function(e) {
			if (e < 1 / 2.75) {
				return 7.5625 * e * e;
			}
			if (e < 2 / 2.75) {
				return 7.5625 * (e -= 1.5 / 2.75) * e + .75;
			}
			if (e < 2.5 / 2.75) {
				return 7.5625 * (e -= 2.25 / 2.75) * e + .9375;
			}
			return 7.5625 * (e -= 2.625 / 2.75) * e + .984375;
		},
		easeInOutBounce: function(e) {
			if (e < .5) {
				return .5 * P.easeInBounce(2 * e);
			}
			return .5 * P.easeOutBounce(2 * e - 1) + .5;
		}
	};
	var A = {
		effects: P
	};
	var C = S;
	var T = Math.PI;
	var D = T / 180;
	var F = 2 * T;
	var I = T / 2;
	var L = T / 4;
	var O = 2 * T / 3;
	var z = {
		clear: function(e) {
			e.ctx.clearRect(0, 0, e.width, e.height);
		},
		roundedRect: function(e, t, r, a, n, i) {
			if (i) {
				var o = Math.min(i, n / 2, a / 2);
				var s = t + o;
				var l = r + o;
				var u = t + a - o;
				var c = r + n - o;
				e.moveTo(t, l);
				if (s < u && l < c) {
					e.arc(s, l, o, -T, -I);
					e.arc(u, l, o, -I, 0);
					e.arc(u, c, o, 0, I);
					e.arc(s, c, o, I, T);
				} else if (s < u) {
					e.moveTo(s, r);
					e.arc(u, l, o, -I, I);
					e.arc(s, l, o, I, T + I);
				} else if (l < c) {
					e.arc(s, l, o, -T, 0);
					e.arc(s, c, o, 0, T);
				} else {
					e.arc(s, l, o, -T, T);
				}
				e.closePath();
				e.moveTo(t, r);
			} else {
				e.rect(t, r, a, n);
			}
		},
		drawPoint: function(e, t, r, a, n, i) {
			var o, s, l, u, c;
			var f = (i || 0) * D;
			if (t && "object" === typeof t) {
				o = t.toString();
				if ("[object HTMLImageElement]" === o || "[object HTMLCanvasElement]" === o) {
					e.save();
					e.translate(a, n);
					e.rotate(f);
					e.drawImage(t, -t.width / 2, -t.height / 2, t.width, t.height);
					e.restore();
					return;
				}
			}
			if (isNaN(r) || r <= 0) {
				return;
			}
			e.beginPath();
			switch (t) {
			default:
				e.arc(a, n, r, 0, F);
				e.closePath();
				break;

			case "triangle":
				e.moveTo(a + Math.sin(f) * r, n - Math.cos(f) * r);
				f += O;
				e.lineTo(a + Math.sin(f) * r, n - Math.cos(f) * r);
				f += O;
				e.lineTo(a + Math.sin(f) * r, n - Math.cos(f) * r);
				e.closePath();
				break;

			case "rectRounded":
				c = .516 * r;
				u = r - c;
				s = Math.cos(f + L) * u;
				l = Math.sin(f + L) * u;
				e.arc(a - s, n - l, c, f - T, f - I);
				e.arc(a + l, n - s, c, f - I, f);
				e.arc(a + s, n + l, c, f, f + I);
				e.arc(a - l, n + s, c, f + I, f + T);
				e.closePath();
				break;

			case "rect":
				if (!i) {
					u = Math.SQRT1_2 * r;
					e.rect(a - u, n - u, 2 * u, 2 * u);
					break;
				}
				f += L;

			case "rectRot":
				s = Math.cos(f) * r;
				l = Math.sin(f) * r;
				e.moveTo(a - s, n - l);
				e.lineTo(a + l, n - s);
				e.lineTo(a + s, n + l);
				e.lineTo(a - l, n + s);
				e.closePath();
				break;

			case "crossRot":
				f += L;

			case "cross":
				s = Math.cos(f) * r;
				l = Math.sin(f) * r;
				e.moveTo(a - s, n - l);
				e.lineTo(a + s, n + l);
				e.moveTo(a + l, n - s);
				e.lineTo(a - l, n + s);
				break;

			case "star":
				s = Math.cos(f) * r;
				l = Math.sin(f) * r;
				e.moveTo(a - s, n - l);
				e.lineTo(a + s, n + l);
				e.moveTo(a + l, n - s);
				e.lineTo(a - l, n + s);
				f += L;
				s = Math.cos(f) * r;
				l = Math.sin(f) * r;
				e.moveTo(a - s, n - l);
				e.lineTo(a + s, n + l);
				e.moveTo(a + l, n - s);
				e.lineTo(a - l, n + s);
				break;

			case "line":
				s = Math.cos(f) * r;
				l = Math.sin(f) * r;
				e.moveTo(a - s, n - l);
				e.lineTo(a + s, n + l);
				break;

			case "dash":
				e.moveTo(a, n);
				e.lineTo(a + Math.cos(f) * r, n + Math.sin(f) * r);
				break;
			}
			e.fill();
			e.stroke();
		},
		_isPointInArea: function(e, t) {
			var r = 1e-6;
			return e.x > t.left - r && e.x < t.right + r && e.y > t.top - r && e.y < t.bottom + r;
		},
		clipArea: function(e, t) {
			e.save();
			e.beginPath();
			e.rect(t.left, t.top, t.right - t.left, t.bottom - t.top);
			e.clip();
		},
		unclipArea: function(e) {
			e.restore();
		},
		lineTo: function(e, t, r, a) {
			var n = r.steppedLine;
			if (n) {
				if ("middle" === n) {
					var i = (t.x + r.x) / 2;
					e.lineTo(i, a ? r.y : t.y);
					e.lineTo(i, a ? t.y : r.y);
				} else if ("after" === n && !a || "after" !== n && a) {
					e.lineTo(t.x, r.y);
				} else {
					e.lineTo(r.x, t.y);
				}
				e.lineTo(r.x, r.y);
				return;
			}
			if (!r.tension) {
				e.lineTo(r.x, r.y);
				return;
			}
			e.bezierCurveTo(a ? t.controlPointPreviousX : t.controlPointNextX, a ? t.controlPointPreviousY : t.controlPointNextY, a ? r.controlPointNextX : r.controlPointPreviousX, a ? r.controlPointNextY : r.controlPointPreviousY, r.x, r.y);
		},
		_bezierCurveTo: function(e, t, r, a) {
			if (!t) {
				return e.lineTo(r._model.x, r._model.y);
			}
			e.bezierCurveTo(a ? t.cp1x : t.cp2x, a ? t.cp1y : t.cp2y, a ? r.cp2x : r.cp1x, a ? r.cp2y : r.cp1y, r._model.x, r._model.y);
		}
	};
	var B = z;
	C.clear = z.clear;
	C.drawRoundedRectangle = function(e) {
		e.beginPath();
		z.roundedRect.apply(z, arguments);
	};
	const R = Math.PI;
	const N = 2 * R;
	const E = N + R;
	var V = {
		PI: R,
		TAU: N,
		_factorize: function(e) {
			var t = [];
			var r = Math.sqrt(e);
			var a;
			for (a = 1; a < r; a++) {
				if (e % a === 0) {
					t.push(a);
					t.push(e / a);
				}
			}
			if (r === (0 | r)) {
				t.push(r);
			}
			t.sort((function(e, t) {
				return e - t;
			})).pop();
			return t;
		},
		log10: Math.log10 || function(e) {
			var t = Math.log(e) * Math.LOG10E;
			var r = Math.round(t);
			var a = e === Math.pow(10, r);
			return a ? r : t;
		},
		distanceBetweenPoints: (e, t) => {
			const r = t._model.x - e._model.x;
			const a = t._model.y - e._model.y;
			return Math.sqrt(r * r + a * a);
		},
		_angleDiff: (e, t) => (e - t + E) % N - R,
		_normalizeAngle: e => (e % N + N) % N,
		_angleBetween: (e, t, r, a) => {
			const n = V._normalizeAngle(e);
			const i = V._normalizeAngle(t);
			const o = V._normalizeAngle(r);
			const s = V._normalizeAngle(i - n);
			const l = V._normalizeAngle(o - n);
			const u = V._normalizeAngle(n - i);
			const c = V._normalizeAngle(n - o);
			return n === i || n === o || a && i === o || s > l && u < c;
		},
		almostEquals: (e, t, r) => Math.abs(e - t) < r
	};
	var j = V;
	S.log10 = V.log10;
	const {almostEquals: W, distanceBetweenPoints: H} = j;
	const {_isPointInArea: U} = B;
	const q = Number.EPSILON || 1e-14;
	const getPoint = (e, t) => t < e.length && !e[t]._model.skip && e[t];
	const getValueAxis = e => "x" === e ? "y" : "x";
	function splineCurve(e, t, r, a) {
		const n = e._model.skip ? t : e;
		const i = t;
		const o = r._model.skip ? t : r;
		const s = H(i, n);
		const l = H(o, i);
		let u = s / (s + l);
		let c = l / (s + l);
		u = isNaN(u) ? 0 : u;
		c = isNaN(c) ? 0 : c;
		const f = a * u;
		const d = a * c;
		return {
			previous: {
				x: i._model.x - f * (o._model.x - n._model.x),
				y: i._model.y - f * (o._model.y - n._model.y)
			},
			next: {
				x: i._model.x + d * (o._model.x - n._model.x),
				y: i._model.y + d * (o._model.y - n._model.y)
			}
		};
	}
	function monotoneAdjust(e, t, r) {
		const a = e.length;
		let n, i, o, s, l;
		let u = getPoint(e, 0);
		for (let c = 0; c < a - 1; ++c) {
			l = u;
			u = getPoint(e, c + 1);
			if (!l || !u) {
				continue;
			}
			if (W(t[c], 0, q)) {
				r[c] = r[c + 1] = 0;
				continue;
			}
			n = r[c] / t[c];
			i = r[c + 1] / t[c];
			s = n * n + i * i;
			if (s <= 9) {
				continue;
			}
			o = 3 / Math.sqrt(s);
			r[c] = n * o * t[c];
			r[c + 1] = i * o * t[c];
		}
	}
	function monotoneCompute(e, t, r = "x", a = .4) {
		const n = getValueAxis(r);
		const i = e.length;
		let o, s, l;
		let u = getPoint(e, 0);
		for (let c = 0; c < i; ++c) {
			s = l;
			l = u;
			u = getPoint(e, c + 1);
			if (!l) {
				continue;
			}
			const i = l._model[r];
			const f = l._model[n];
			if (s) {
				o = (i - s._model[r]) / (1 / a);
				l[`cp1${r}`] = i - o;
				l[`cp1${n}`] = f - o * t[c];
			}
			if (u) {
				o = (u._model[r] - i) / (1 / a);
				l[`cp2${r}`] = i + o;
				l[`cp2${n}`] = f + o * t[c];
			}
		}
	}
	function splineCurveMonotone(e, t = "x", r) {
		const a = getValueAxis(t);
		const n = e.length;
		const i = Array(n).fill(0);
		const o = Array(n);
		let s, l, u;
		let c = getPoint(e, 0);
		for (s = 0; s < n; ++s) {
			l = u;
			u = c;
			c = getPoint(e, s + 1);
			if (!u) {
				continue;
			}
			if (c) {
				const e = c._model[t] - u._model[t];
				i[s] = 0 !== e ? (c._model[a] - u._model[a]) / e : 0;
			}
			o[s] = !l ? i[s] : !c ? i[s - 1] : Math.sign(i[s - 1]) !== Math.sign(i[s]) ? 0 : (i[s - 1] + i[s]) / 2;
		}
		monotoneAdjust(e, i, o);
		monotoneCompute(e, o, t, r);
	}
	function capControlPoint(e, t, r) {
		return Math.max(Math.min(e, r), t);
	}
	function capBezierPoints(e, t) {
		let r, a, n, i, o;
		let s = U(e[0], t);
		for (r = 0, a = e.length; r < a; ++r) {
			o = i;
			i = s;
			s = r < a - 1 && U(e[r + 1], t);
			if (!i) {
				continue;
			}
			n = e[r];
			if (o) {
				n.cp1x = capControlPoint(n.cp1x, t.left, t.right);
				n.cp1y = capControlPoint(n.cp1y, t.top, t.bottom);
			}
			if (s) {
				n.cp2x = capControlPoint(n.cp2x, t.left, t.right);
				n.cp2y = capControlPoint(n.cp2y, t.top, t.bottom);
			}
		}
	}
	function _updateBezierControlPoints$1(e, t, r, a, n) {
		if (t.spanGaps) {
			e = e.filter((e => !e._model.skip));
		}
		if ("monotone" === t.cubicInterpolationMode) {
			splineCurveMonotone(e, n, t.tension);
		} else {
			let r = a ? e[e.length - 1] : e[0];
			for (let n = 0, i = e.length; n < i; n++) {
				const o = e[n];
				const s = e[Math.min(n + 1, i - (a ? 0 : 1)) % i];
				const l = splineCurve(r, o, s, t.tension);
				o.cp1x = l.previous.x;
				o.cp1y = l.previous.y;
				o.cp2x = l.next.x;
				o.cp2y = l.next.y;
				r = o;
			}
		}
		if (t.capBezierPoints) {
			capBezierPoints(e, r);
		}
	}
	var $ = {
		splineCurve: splineCurve,
		splineCurveMonotone: splineCurveMonotone,
		_updateBezierControlPoints: _updateBezierControlPoints$1
	};
	var G = S;
	var K = {
		_set: function(e, t) {
			return G.merge(this[e] || (this[e] = {}), t);
		}
	};
	K._set("global", {
		defaultColor: "rgba(0,0,0,0.1)",
		defaultFontColor: "#666",
		defaultFontFamily: "'Helvetica Neue', 'Helvetica', 'Arial', sans-serif",
		defaultFontSize: 12,
		defaultFontStyle: "normal",
		defaultLineHeight: 1.2,
		showLines: true
	});
	var Y = K;
	var X = Y;
	var J = S;
	var Q = J.valueOrDefault;
	function toFontString(e) {
		if (!e || J.isNullOrUndef(e.size) || J.isNullOrUndef(e.family)) {
			return null;
		}
		return (e.style ? e.style + " " : "") + (e.weight ? e.weight + " " : "") + e.size + "px " + e.family;
	}
	var Z = {
		toLineHeight: function(e, t) {
			var r = ("" + e).match(/^(normal|(\d+(?:\.\d+)?)(px|em|%)?)$/);
			if (!r || "normal" === r[1]) {
				return 1.2 * t;
			}
			e = +r[2];
			switch (r[3]) {
			case "px":
				return e;

			case "%":
				e /= 100;
				break;
			}
			return t * e;
		},
		toPadding: function(e) {
			var t, r, a, n;
			if (J.isObject(e)) {
				t = +e.top || 0;
				r = +e.right || 0;
				a = +e.bottom || 0;
				n = +e.left || 0;
			} else {
				t = r = a = n = +e || 0;
			}
			return {
				top: t,
				right: r,
				bottom: a,
				left: n,
				height: t + a,
				width: n + r
			};
		},
		_parseFont: function(e) {
			var t = X.global;
			var r = Q(e.fontSize, t.defaultFontSize);
			var a = {
				family: Q(e.fontFamily, t.defaultFontFamily),
				lineHeight: J.options.toLineHeight(Q(e.lineHeight, t.defaultLineHeight), r),
				size: r,
				style: Q(e.fontStyle, t.defaultFontStyle),
				weight: null,
				string: ""
			};
			a.string = toFontString(a);
			return a;
		},
		resolve: function(e, t, r, a) {
			var n = true;
			var i, o, s;
			for (i = 0, o = e.length; i < o; ++i) {
				s = e[i];
				if (void 0 === s) {
					continue;
				}
				if (void 0 !== t && "function" === typeof s) {
					s = s(t);
					n = false;
				}
				if (void 0 !== r && J.isArray(s)) {
					s = s[r];
					n = false;
				}
				if (void 0 !== s) {
					if (a && !n) {
						a.cacheable = false;
					}
					return s;
				}
			}
		}
	};
	var getRtlAdapter = function(e, t) {
		return {
			x: function(r) {
				return e + e + t - r;
			},
			setWidth: function(e) {
				t = e;
			},
			textAlign: function(e) {
				if ("center" === e) {
					return e;
				}
				return "right" === e ? "left" : "right";
			},
			xPlus: function(e, t) {
				return e - t;
			},
			leftForLtr: function(e, t) {
				return e - t;
			}
		};
	};
	var getLtrAdapter = function() {
		return {
			x: function(e) {
				return e;
			},
			setWidth: function(e) {},
			textAlign: function(e) {
				return e;
			},
			xPlus: function(e, t) {
				return e + t;
			},
			leftForLtr: function(e, t) {
				return e;
			}
		};
	};
	var getAdapter = function(e, t, r) {
		return e ? getRtlAdapter(t, r) : getLtrAdapter();
	};
	var overrideTextDirection = function(e, t) {
		var r, a;
		if ("ltr" === t || "rtl" === t) {
			r = e.canvas.style;
			a = [ r.getPropertyValue("direction"), r.getPropertyPriority("direction") ];
			r.setProperty("direction", t, "important");
			e.prevTextDirection = a;
		}
	};
	var restoreTextDirection = function(e) {
		var t = e.prevTextDirection;
		if (void 0 !== t) {
			delete e.prevTextDirection;
			e.canvas.style.setProperty("direction", t[0], t[1]);
		}
	};
	var ee = {
		getRtlAdapter: getAdapter,
		overrideTextDirection: overrideTextDirection,
		restoreTextDirection: restoreTextDirection
	};
	function _pointInLine$1(e, t, r, a) {
		return {
			x: e.x + r * (t._model.x - e._model.x),
			y: e.y + r * (t._model.y - e._model.y)
		};
	}
	function _steppedInterpolation$1(e, t, r, a) {
		return {
			x: e._model.x + r * (t._model.x - e._model.x),
			y: "middle" === a ? r < .5 ? e._model.y : t._model.y : "after" === a ? r < 1 ? e.y : t._model.y : r > 0 ? t._model.y : e._model.y
		};
	}
	function _bezierInterpolation$1(e, t, r, a) {
		const n = {
			x: e.cp2x,
			y: e.cp2y
		};
		const i = {
			x: t.cp1x,
			y: t.cp1y
		};
		const o = _pointInLine$1(e, n, r);
		const s = _pointInLine$1(n, i, r);
		const l = _pointInLine$1(i, t, r);
		const u = _pointInLine$1(o, s, r);
		const c = _pointInLine$1(s, l, r);
		return _pointInLine$1(u, c, r);
	}
	var te = {
		_pointInLine: _pointInLine$1,
		_steppedInterpolation: _steppedInterpolation$1,
		_bezierInterpolation: _bezierInterpolation$1
	};
	const {_angleBetween: re, _angleDiff: ae, _normalizeAngle: ne} = j;
	function propertyFn(e) {
		if ("angle" === e) {
			return {
				between: re,
				compare: ae,
				normalize: ne
			};
		}
		return {
			between: (e, t, r) => e >= Math.min(t, r) && e <= Math.max(r, t),
			compare: (e, t) => e - t,
			normalize: e => e
		};
	}
	function normalizeSegment({start: e, end: t, count: r, loop: a, style: n}) {
		return {
			start: e % r,
			end: t % r,
			loop: a && (t - e + 1) % r === 0,
			style: n
		};
	}
	function getSegment(e, t, r) {
		const {property: a, start: n, end: i} = r;
		const {between: o, normalize: s} = propertyFn(a);
		const l = t.length;
		let {start: u, end: c, loop: f} = e;
		let d, h;
		if (f) {
			u += l;
			c += l;
			for (d = 0, h = l; d < h; ++d) {
				if (!o(s(t[u % l]._model[a]), n, i)) {
					break;
				}
				u--;
				c--;
			}
			u %= l;
			c %= l;
		}
		if (c < u) {
			c += l;
		}
		return {
			start: u,
			end: c,
			loop: f,
			style: e.style
		};
	}
	function _boundSegment$1(e, t, r) {
		if (!r) {
			return [ e ];
		}
		const {property: a, start: n, end: i} = r;
		const o = t.length;
		const {compare: s, between: l, normalize: u} = propertyFn(a);
		const {start: c, end: f, loop: d, style: h} = getSegment(e, t, r);
		const v = [];
		let g = false;
		let p = null;
		let m, b, x;
		const startIsBefore = () => l(n, x, m) && 0 !== s(n, x);
		const endIsBefore = () => 0 === s(i, m) || l(i, x, m);
		const shouldStart = () => g || startIsBefore();
		const shouldStop = () => !g || endIsBefore();
		for (let e = c, r = c; e <= f; ++e) {
			b = t[e % o];
			if (b._model.skip) {
				continue;
			}
			m = u(b._model[a]);
			if (m === x) {
				continue;
			}
			g = l(m, n, i);
			if (null === p && shouldStart()) {
				p = 0 === s(m, n) ? e : r;
			}
			if (null !== p && shouldStop()) {
				v.push(normalizeSegment({
					start: p,
					end: e,
					loop: d,
					count: o,
					style: h
				}));
				p = null;
			}
			r = e;
			x = m;
		}
		if (null !== p) {
			v.push(normalizeSegment({
				start: p,
				end: f,
				loop: d,
				count: o,
				style: h
			}));
		}
		return v;
	}
	function _boundSegments$2(e, t) {
		const r = [];
		const a = e.getSegments();
		for (let n = 0; n < a.length; n++) {
			const i = _boundSegment$1(a[n], e.getPoints(), t);
			if (i.length) {
				r.push(...i);
			}
		}
		return r;
	}
	function findStartAndEnd(e, t, r, a) {
		let n = 0;
		let i = t - 1;
		if (r && !a) {
			while (n < t && !e[n]._model.skip) {
				n++;
			}
		}
		while (n < t && e[n]._model.skip) {
			n++;
		}
		n %= t;
		if (r) {
			i += n;
		}
		while (i > n && e[i % t]._model.skip) {
			i--;
		}
		i %= t;
		return {
			start: n,
			end: i
		};
	}
	function solidSegments(e, t, r, a) {
		const n = e.length;
		const i = [];
		let o = t;
		let s = e[t];
		let l;
		for (l = t + 1; l <= r; ++l) {
			const r = e[l % n];
			if (r._model.skip || r.stop) {
				if (!s._model.skip) {
					a = false;
					i.push({
						start: t % n,
						end: (l - 1) % n,
						loop: a
					});
					t = o = r.stop ? l : null;
				}
			} else {
				o = l;
				if (s._model.skip) {
					t = l;
				}
			}
			s = r;
		}
		if (null !== o) {
			i.push({
				start: t % n,
				end: o % n,
				loop: a
			});
		}
		return i;
	}
	function _computeSegments$1(e, t) {
		const r = e.getPoints();
		const a = e._model ? e._model.spanGaps : void 0;
		const n = r.length;
		if (!n) {
			return [];
		}
		const i = !!e._loop;
		const {start: o, end: s} = findStartAndEnd(r, n, i, a);
		if (true === a) {
			return splitByStyles(e, [ {
				start: o,
				end: s,
				loop: i
			} ], r, t);
		}
		const l = s < o ? s + n : s;
		const u = !!e._fullLoop && 0 === o && s === n - 1;
		return splitByStyles(e, solidSegments(r, o, l, u), r, t);
	}
	function splitByStyles(e, t, r, a) {
		if (!a || !r) {
			return t;
		}
		return doSplitByStyles(e, t, r, a);
	}
	function doSplitByStyles(e, t, r, a) {
		const n = readStyle(e._model);
		const i = e._datasetIndex;
		const o = e._model.spanGaps;
		const s = r.length;
		const l = [];
		let u = n;
		let c = t[0].start;
		let f = c;
		function addStyle(e, t, a, n) {
			const i = o ? -1 : 1;
			if (e === t) {
				return;
			}
			e += s;
			while (r[e % s]._model.skip) {
				e -= i;
			}
			while (r[t % s]._model.skip) {
				t += i;
			}
			if (e % s !== t % s) {
				l.push({
					start: e % s,
					end: t % s,
					loop: a,
					style: n
				});
				u = n;
				c = t % s;
			}
		}
		for (const n of t) {
			c = o ? c : n.start;
			let t = r[c % s];
			let l;
			for (f = c + 1; f <= n.end; f++) {
				const o = r[f % s];
				l = readSegmentStyle(e, a, {
					type: "segment",
					p0: t,
					p1: o,
					p0DataIndex: (f - 1) % s,
					p1DataIndex: f % s,
					datasetIndex: i
				});
				if (styleChanged(l, u)) {
					addStyle(c, f - 1, n.loop, u);
				}
				t = o;
				u = l;
			}
			if (c < f - 1) {
				addStyle(c, f - 1, n.loop, u);
			}
		}
		return l;
	}
	function readSegmentStyle(e, t, r) {
		const a = {};
		for (const [e, n] of Object.entries(t)) {
			a[e] = n(r);
		}
		return a;
	}
	function readStyle(e) {
		return {
			backgroundColor: e.backgroundColor,
			borderCapStyle: e.borderCapStyle,
			borderDash: e.borderDash,
			borderDashOffset: e.borderDashOffset,
			borderJoinStyle: e.borderJoinStyle,
			borderWidth: e.borderWidth,
			borderColor: e.borderColor
		};
	}
	function styleChanged(e, t) {
		return t && JSON.stringify(e) !== JSON.stringify(t);
	}
	var ie = {
		_boundSegment: _boundSegment$1,
		_boundSegments: _boundSegments$2,
		_computeSegments: _computeSegments$1
	};
	k.exports = S;
	k.exports.easing = A;
	k.exports.canvas = B;
	k.exports.curve = $;
	k.exports.options = Z;
	k.exports.math = j;
	k.exports.rtl = ee;
	k.exports.interpolation = te;
	k.exports.segment = ie;
	var oe = w;
	var se = k.exports;
	function interpolate$1(e, t, r, a) {
		var n = Object.keys(r);
		var i, o, s, l, u, c, f, d, h;
		for (i = 0, o = n.length; i < o; ++i) {
			s = n[i];
			c = r[s];
			if (!Object.prototype.hasOwnProperty.call(t, s)) {
				t[s] = c;
			}
			l = t[s];
			if (l === c || "_" === s[0]) {
				continue;
			}
			if (!Object.prototype.hasOwnProperty.call(e, s)) {
				e[s] = l;
			}
			u = e[s];
			f = typeof c;
			if (f === typeof u) {
				if ("string" === f) {
					d = oe(u);
					if (d.valid) {
						h = oe(c);
						if (h.valid) {
							t[s] = h.mix(d, a).rgbString();
							continue;
						}
					}
				} else if (se.isFinite(u) && se.isFinite(c)) {
					t[s] = u + (c - u) * a;
					continue;
				}
			}
			t[s] = c;
		}
	}
	var Element$9 = function(e) {
		se.extend(this, e);
		this.initialize.apply(this, arguments);
	};
	se.extend(Element$9.prototype, {
		_type: void 0,
		initialize: function() {
			this.hidden = false;
		},
		pivot: function() {
			var e = this;
			if (!e._view) {
				e._view = se.extend({}, e._model);
			}
			e._start = {};
			return e;
		},
		transition: function(e) {
			var t = this;
			var r = t._model;
			var a = t._start;
			var n = t._view;
			if (!r || 1 === e) {
				t._view = se.extend({}, r);
				t._start = null;
				return t;
			}
			if (!n) {
				n = t._view = {};
			}
			if (!a) {
				a = t._start = {};
			}
			interpolate$1(a, n, r, e);
			return t;
		},
		tooltipPosition: function() {
			return {
				x: this._model.x,
				y: this._model.y
			};
		},
		hasValue: function() {
			return se.isNumber(this._model.x) && se.isNumber(this._model.y);
		}
	});
	Element$9.extend = se.inherits;
	var le = Element$9;
	var ue = le;
	var ce = ue.extend({
		chart: null,
		currentStep: 0,
		numSteps: 60,
		easing: "",
		render: null,
		onAnimationProgress: null,
		onAnimationComplete: null
	});
	var fe = ce;
	Object.defineProperty(ce.prototype, "animationObject", {
		get: function() {
			return this;
		}
	});
	Object.defineProperty(ce.prototype, "chartInstance", {
		get: function() {
			return this.chart;
		},
		set: function(e) {
			this.chart = e;
		}
	});
	var de = Y;
	var he = k.exports;
	de._set("global", {
		animation: {
			duration: 1e3,
			easing: "easeOutQuart",
			onProgress: he.noop,
			onComplete: he.noop
		}
	});
	var ve = {
		animations: [],
		request: null,
		addAnimation: function(e, t, r, a) {
			var n = this.animations;
			var i, o;
			t.chart = e;
			t.startTime = Date.now();
			t.duration = r;
			if (!a) {
				e.animating = true;
			}
			for (i = 0, o = n.length; i < o; ++i) {
				if (n[i].chart === e) {
					n[i] = t;
					return;
				}
			}
			n.push(t);
			if (1 === n.length) {
				this.requestAnimationFrame();
			}
		},
		cancelAnimation: function(e) {
			var t = he.findIndex(this.animations, (function(t) {
				return t.chart === e;
			}));
			if (-1 !== t) {
				this.animations.splice(t, 1);
				e.animating = false;
			}
		},
		requestAnimationFrame: function() {
			var e = this;
			if (null === e.request) {
				e.request = he.requestAnimFrame.call(window, (function() {
					e.request = null;
					e.startDigest();
				}));
			}
		},
		startDigest: function() {
			var e = this;
			e.advance();
			if (e.animations.length > 0) {
				e.requestAnimationFrame();
			}
		},
		advance: function() {
			var e = this.animations;
			var t, r, a, n;
			var i = 0;
			while (i < e.length) {
				t = e[i];
				r = t.chart;
				a = t.numSteps;
				n = Math.floor((Date.now() - t.startTime) / t.duration * a) + 1;
				t.currentStep = Math.min(n, a);
				he.callback(t.render, [ r, t ], r);
				he.callback(t.onAnimationProgress, [ t ], r);
				if (t.currentStep >= a) {
					he.callback(t.onAnimationComplete, [ t ], r);
					r.animating = false;
					e.splice(i, 1);
				} else {
					++i;
				}
			}
		}
	};
	var ge = k.exports;
	var pe = ge.options.resolve;
	var me = [ "push", "pop", "shift", "splice", "unshift" ];
	function listenArrayEvents(e, t) {
		if (e._chartjs) {
			e._chartjs.listeners.push(t);
			return;
		}
		Object.defineProperty(e, "_chartjs", {
			configurable: true,
			enumerable: false,
			value: {
				listeners: [ t ]
			}
		});
		me.forEach((function(t) {
			var r = "onData" + t.charAt(0).toUpperCase() + t.slice(1);
			var a = e[t];
			Object.defineProperty(e, t, {
				configurable: true,
				enumerable: false,
				value: function() {
					var t = Array.prototype.slice.call(arguments);
					var n = a.apply(this, t);
					ge.each(e._chartjs.listeners, (function(e) {
						if ("function" === typeof e[r]) {
							e[r].apply(e, t);
						}
					}));
					return n;
				}
			});
		}));
	}
	function unlistenArrayEvents(e, t) {
		var r = e._chartjs;
		if (!r) {
			return;
		}
		var a = r.listeners;
		var n = a.indexOf(t);
		if (-1 !== n) {
			a.splice(n, 1);
		}
		if (a.length > 0) {
			return;
		}
		me.forEach((function(t) {
			delete e[t];
		}));
		delete e._chartjs;
	}
	var DatasetController$2 = function(e, t) {
		this.initialize(e, t);
	};
	ge.extend(DatasetController$2.prototype, {
		datasetElementType: null,
		dataElementType: null,
		_datasetElementOptions: [ "backgroundColor", "borderCapStyle", "borderColor", "borderDash", "borderDashOffset", "borderJoinStyle", "borderWidth" ],
		_dataElementOptions: [ "backgroundColor", "borderColor", "borderWidth", "pointStyle" ],
		initialize: function(e, t) {
			var r = this;
			r.chart = e;
			r.index = t;
			r.linkScales();
			r.addElements();
			r._type = r.getMeta().type;
		},
		updateIndex: function(e) {
			this.index = e;
		},
		linkScales: function() {
			var e = this;
			var t = e.getMeta();
			var r = e.chart;
			var a = r.scales;
			var n = e.getDataset();
			var i = r.options.scales;
			if (null === t.xAxisID || !(t.xAxisID in a) || n.xAxisID) {
				t.xAxisID = n.xAxisID || i.xAxes[0].id;
			}
			if (null === t.yAxisID || !(t.yAxisID in a) || n.yAxisID) {
				t.yAxisID = n.yAxisID || i.yAxes[0].id;
			}
		},
		getDataset: function() {
			return this.chart.data.datasets[this.index];
		},
		getMeta: function() {
			return this.chart.getDatasetMeta(this.index);
		},
		getScaleForId: function(e) {
			return this.chart.scales[e];
		},
		_getValueScaleId: function() {
			return this.getMeta().yAxisID;
		},
		_getIndexScaleId: function() {
			return this.getMeta().xAxisID;
		},
		_getValueScale: function() {
			return this.getScaleForId(this._getValueScaleId());
		},
		_getIndexScale: function() {
			return this.getScaleForId(this._getIndexScaleId());
		},
		reset: function() {
			this._update(true);
		},
		destroy: function() {
			if (this._data) {
				unlistenArrayEvents(this._data, this);
			}
		},
		createMetaDataset: function() {
			var e = this;
			var t = e.datasetElementType;
			return t && new t({
				_chart: e.chart,
				_datasetIndex: e.index
			});
		},
		createMetaData: function(e) {
			var t = this;
			var r = t.dataElementType;
			return r && new r({
				_chart: t.chart,
				_datasetIndex: t.index,
				_index: e
			});
		},
		addElements: function() {
			var e = this;
			var t = e.getMeta();
			var r = e.getDataset().data || [];
			var a = t.data;
			var n, i;
			for (n = 0, i = r.length; n < i; ++n) {
				a[n] = a[n] || e.createMetaData(n);
			}
			t.dataset = t.dataset || e.createMetaDataset();
		},
		addElementAndReset: function(e) {
			var t = this.createMetaData(e);
			this.getMeta().data.splice(e, 0, t);
			this.updateElement(t, e, true);
		},
		buildOrUpdateElements: function() {
			var e = this;
			var t = e.getDataset();
			var r = t.data || (t.data = []);
			if (e._data !== r) {
				if (e._data) {
					unlistenArrayEvents(e._data, e);
				}
				if (r && Object.isExtensible(r)) {
					listenArrayEvents(r, e);
				}
				e._data = r;
			}
			e.resyncElements();
		},
		_configure: function() {
			var e = this;
			e._config = ge.merge(Object.create(null), [ e.chart.options.datasets[e._type], e.getDataset() ], {
				merger: function(e, t, r) {
					if ("_meta" !== e && "data" !== e) {
						ge._merger(e, t, r);
					}
				}
			});
		},
		_update: function(e) {
			var t = this;
			t._configure();
			t._cachedDataOpts = null;
			t.update(e);
		},
		update: ge.noop,
		transition: function(e) {
			var t = this.getMeta();
			var r = t.data || [];
			var a = r.length;
			var n = 0;
			for (;n < a; ++n) {
				r[n].transition(e);
			}
			if (t.dataset) {
				t.dataset.transition(e);
			}
		},
		draw: function() {
			var e = this.getMeta();
			var t = e.data || [];
			var r = t.length;
			var a = 0;
			if (e.dataset) {
				e.dataset.draw();
			}
			for (;a < r; ++a) {
				t[a].draw();
			}
		},
		getStyle: function(e) {
			var t = this;
			var r = t.getMeta();
			var a = r.dataset;
			var n;
			t._configure();
			if (a && void 0 === e) {
				n = t._resolveDatasetElementOptions(a || {});
			} else {
				e = e || 0;
				n = t._resolveDataElementOptions(r.data[e] || {}, e);
			}
			if (false === n.fill || null === n.fill) {
				n.backgroundColor = n.borderColor;
			}
			return n;
		},
		_resolveDatasetElementOptions: function(e, t) {
			var r = this;
			var a = r.chart;
			var n = r._config;
			var i = e.custom || {};
			var o = a.options.elements[r.datasetElementType.prototype._type] || {};
			var s = r._datasetElementOptions;
			var l = {};
			var u, c, f, d;
			var h = {
				chart: a,
				dataset: r.getDataset(),
				datasetIndex: r.index,
				hover: t
			};
			for (u = 0, c = s.length; u < c; ++u) {
				f = s[u];
				d = t ? "hover" + f.charAt(0).toUpperCase() + f.slice(1) : f;
				l[f] = pe([ i[d], n[d], o[d] ], h);
			}
			return l;
		},
		_resolveDataElementOptions: function(e, t) {
			var r = this;
			var a = e && e.custom;
			var n = r._cachedDataOpts;
			if (n && !a) {
				return n;
			}
			var i = r.chart;
			var o = r._config;
			var s = i.options.elements[r.dataElementType.prototype._type] || {};
			var l = r._dataElementOptions;
			var u = {};
			var c = {
				chart: i,
				dataIndex: t,
				dataset: r.getDataset(),
				datasetIndex: r.index
			};
			var f = {
				cacheable: !a
			};
			var d, h, v, g;
			a = a || {};
			if (ge.isArray(l)) {
				for (h = 0, v = l.length; h < v; ++h) {
					g = l[h];
					u[g] = pe([ a[g], o[g], s[g] ], c, t, f);
				}
			} else {
				d = Object.keys(l);
				for (h = 0, v = d.length; h < v; ++h) {
					g = d[h];
					u[g] = pe([ a[g], o[l[g]], o[g], s[g] ], c, t, f);
				}
			}
			if (f.cacheable) {
				r._cachedDataOpts = Object.freeze(u);
			}
			return u;
		},
		removeHoverStyle: function(e) {
			ge.merge(e._model, e.$previousStyle || {});
			delete e.$previousStyle;
		},
		setHoverStyle: function(e) {
			var t = this.chart.data.datasets[e._datasetIndex];
			var r = e._index;
			var a = e.custom || {};
			var n = e._model;
			var i = ge.getHoverColor;
			e.$previousStyle = {
				backgroundColor: n.backgroundColor,
				borderColor: n.borderColor,
				borderWidth: n.borderWidth
			};
			n.backgroundColor = pe([ a.hoverBackgroundColor, t.hoverBackgroundColor, i(n.backgroundColor) ], void 0, r);
			n.borderColor = pe([ a.hoverBorderColor, t.hoverBorderColor, i(n.borderColor) ], void 0, r);
			n.borderWidth = pe([ a.hoverBorderWidth, t.hoverBorderWidth, n.borderWidth ], void 0, r);
		},
		_removeDatasetHoverStyle: function() {
			var e = this.getMeta().dataset;
			if (e) {
				this.removeHoverStyle(e);
			}
		},
		_setDatasetHoverStyle: function() {
			var e = this.getMeta().dataset;
			var t = {};
			var r, a, n, i, o, s;
			if (!e) {
				return;
			}
			s = e._model;
			o = this._resolveDatasetElementOptions(e, true);
			i = Object.keys(o);
			for (r = 0, a = i.length; r < a; ++r) {
				n = i[r];
				t[n] = s[n];
				s[n] = o[n];
			}
			e.$previousStyle = t;
		},
		resyncElements: function() {
			var e = this;
			var t = e.getMeta();
			var r = e.getDataset().data;
			var a = t.data.length;
			var n = r.length;
			if (n < a) {
				t.data.splice(n, a - n);
			} else if (n > a) {
				e.insertElements(a, n - a);
			}
		},
		insertElements: function(e, t) {
			for (var r = 0; r < t; ++r) {
				this.addElementAndReset(e + r);
			}
		},
		onDataPush: function() {
			var e = arguments.length;
			this.insertElements(this.getDataset().data.length - e, e);
		},
		onDataPop: function() {
			this.getMeta().data.pop();
		},
		onDataShift: function() {
			this.getMeta().data.shift();
		},
		onDataSplice: function(e, t) {
			this.getMeta().data.splice(e, t);
			this.insertElements(e, arguments.length - 2);
		},
		onDataUnshift: function() {
			this.insertElements(0, arguments.length);
		}
	});
	DatasetController$2.extend = ge.inherits;
	var be = DatasetController$2;
	var xe = {
		exports: {}
	};
	var ye = Y;
	var _e = le;
	var we = k.exports;
	var ke = 2 * Math.PI;
	ye._set("global", {
		elements: {
			arc: {
				backgroundColor: ye.global.defaultColor,
				borderColor: "#fff",
				borderWidth: 2,
				borderAlign: "center"
			}
		}
	});
	function clipArc(e, t) {
		var r = t.startAngle;
		var a = t.endAngle;
		var n = t.pixelMargin;
		var i = n / t.outerRadius;
		var o = t.x;
		var s = t.y;
		e.beginPath();
		e.arc(o, s, t.outerRadius, r - i, a + i);
		if (t.innerRadius > n) {
			i = n / t.innerRadius;
			e.arc(o, s, t.innerRadius - n, a + i, r - i, true);
		} else {
			e.arc(o, s, n, a + Math.PI / 2, r - Math.PI / 2);
		}
		e.closePath();
		e.clip();
	}
	function drawFullCircleBorders(e, t, r, a) {
		var n = r.endAngle;
		var i;
		if (a) {
			r.endAngle = r.startAngle + ke;
			clipArc(e, r);
			r.endAngle = n;
			if (r.endAngle === r.startAngle && r.fullCircles) {
				r.endAngle += ke;
				r.fullCircles--;
			}
		}
		e.beginPath();
		e.arc(r.x, r.y, r.innerRadius, r.startAngle + ke, r.startAngle, true);
		for (i = 0; i < r.fullCircles; ++i) {
			e.stroke();
		}
		e.beginPath();
		e.arc(r.x, r.y, t.outerRadius, r.startAngle, r.startAngle + ke);
		for (i = 0; i < r.fullCircles; ++i) {
			e.stroke();
		}
	}
	function drawBorder(e, t, r) {
		var a = "inner" === t.borderAlign;
		if (a) {
			e.lineWidth = 2 * t.borderWidth;
			e.lineJoin = "round";
		} else {
			e.lineWidth = t.borderWidth;
			e.lineJoin = "bevel";
		}
		if (r.fullCircles) {
			drawFullCircleBorders(e, t, r, a);
		}
		if (a) {
			clipArc(e, r);
		}
		e.beginPath();
		e.arc(r.x, r.y, t.outerRadius, r.startAngle, r.endAngle);
		e.arc(r.x, r.y, r.innerRadius, r.endAngle, r.startAngle, true);
		e.closePath();
		e.stroke();
	}
	var Me = _e.extend({
		_type: "arc",
		inLabelRange: function(e) {
			var t = this._view;
			if (t) {
				return Math.pow(e - t.x, 2) < Math.pow(t.radius + t.hoverRadius, 2);
			}
			return false;
		},
		inRange: function(e, t) {
			var r = this._view;
			if (r) {
				var a = we.getAngleFromPoint(r, {
					x: e,
					y: t
				});
				var n = a.angle;
				var i = a.distance;
				var o = r.startAngle;
				var s = r.endAngle;
				while (s < o) {
					s += ke;
				}
				while (n > s) {
					n -= ke;
				}
				while (n < o) {
					n += ke;
				}
				var l = n >= o && n <= s;
				var u = i >= r.innerRadius && i <= r.outerRadius;
				return l && u;
			}
			return false;
		},
		getCenterPoint: function() {
			var e = this._view;
			var t = (e.startAngle + e.endAngle) / 2;
			var r = (e.innerRadius + e.outerRadius) / 2;
			return {
				x: e.x + Math.cos(t) * r,
				y: e.y + Math.sin(t) * r
			};
		},
		getArea: function() {
			var e = this._view;
			return Math.PI * ((e.endAngle - e.startAngle) / (2 * Math.PI)) * (Math.pow(e.outerRadius, 2) - Math.pow(e.innerRadius, 2));
		},
		tooltipPosition: function() {
			var e = this._view;
			var t = e.startAngle + (e.endAngle - e.startAngle) / 2;
			var r = (e.outerRadius - e.innerRadius) / 2 + e.innerRadius;
			return {
				x: e.x + Math.cos(t) * r,
				y: e.y + Math.sin(t) * r
			};
		},
		draw: function() {
			var e = this._chart.ctx;
			var t = this._view;
			var r = "inner" === t.borderAlign ? .33 : 0;
			var a = {
				x: t.x,
				y: t.y,
				innerRadius: t.innerRadius,
				outerRadius: Math.max(t.outerRadius - r, 0),
				pixelMargin: r,
				startAngle: t.startAngle,
				endAngle: t.endAngle,
				fullCircles: Math.floor(t.circumference / ke)
			};
			var n;
			e.save();
			e.fillStyle = t.backgroundColor;
			e.strokeStyle = t.borderColor;
			if (a.fullCircles) {
				a.endAngle = a.startAngle + ke;
				e.beginPath();
				e.arc(a.x, a.y, a.outerRadius, a.startAngle, a.endAngle);
				e.arc(a.x, a.y, a.innerRadius, a.endAngle, a.startAngle, true);
				e.closePath();
				for (n = 0; n < a.fullCircles; ++n) {
					e.fill();
				}
				a.endAngle = a.startAngle + t.circumference % ke;
			}
			e.beginPath();
			e.arc(a.x, a.y, a.outerRadius, a.startAngle, a.endAngle);
			e.arc(a.x, a.y, a.innerRadius, a.endAngle, a.startAngle, true);
			e.closePath();
			e.fill();
			if (t.borderWidth) {
				drawBorder(e, t, a);
			}
			e.restore();
		}
	});
	const Se = Y;
	const Pe = le;
	const Ae = k.exports;
	const {_bezierInterpolation: Ce, _pointInLine: Te, _steppedInterpolation: De} = Ae.interpolation;
	const {_computeSegments: Fe, _boundSegments: Ie} = Ae.segment;
	const {_steppedLineTo: Le, _bezierCurveTo: Oe} = Ae.canvas;
	const {_updateBezierControlPoints: ze} = Ae.curve;
	const Be = Ae.valueOrDefault;
	const Re = Se.global.defaultColor;
	Se._set("global", {
		elements: {
			line: {
				tension: .4,
				backgroundColor: Re,
				borderWidth: 3,
				borderColor: Re,
				borderCapStyle: "butt",
				borderDash: [],
				borderDashOffset: 0,
				borderJoinStyle: "miter",
				capBezierPoints: true,
				cubicInterpolationMode: "default",
				fill: false,
				spanGaps: false,
				stepped: false
			}
		}
	});
	function setStyle(e, t, r = t) {
		e.lineCap = Be(r.borderCapStyle, t.borderCapStyle);
		e.setLineDash(Be(r.borderDash, t.borderDash));
		e.lineDashOffset = Be(r.borderDashOffset, t.borderDashOffset);
		e.lineJoin = Be(r.borderJoinStyle, t.borderJoinStyle);
		e.lineWidth = Be(r.borderWidth, t.borderWidth);
		e.strokeStyle = Be(r.borderColor, t.borderColor);
	}
	function lineTo(e, t, r) {
		debugger;
		e.lineTo(r._model.x, r._model.y);
	}
	function getLineMethod(e) {
		if (e.stepped) {
			return Le;
		}
		if (e.tension || "monotone" === e.cubicInterpolationMode) {
			return Oe;
		}
		return lineTo;
	}
	function pathVars(e, t, r = {}) {
		const a = e.length;
		const {start: n = 0, end: i = a - 1} = r;
		const {start: o, end: s} = t;
		const l = Math.max(n, o);
		const u = Math.min(i, s);
		const c = n < o && i < o || n > s && i > s;
		return {
			count: a,
			start: l,
			loop: t.loop,
			ilen: u < l && !c ? a + u - l : u - l
		};
	}
	function pathSegment(e, t, r, a) {
		const n = t.getPoints();
		const i = t._model || {};
		const {count: o, start: s, loop: l, ilen: u} = pathVars(n, r, a);
		const c = getLineMethod(i);
		let {move: f = true, reverse: d} = a || {};
		let h, v, g;
		for (h = 0; h <= u; ++h) {
			v = n[(s + (d ? u - h : h)) % o];
			if (v._model.skip) {
				continue;
			} else if (f) {
				e.moveTo(v._model.x, v._model.y);
				f = false;
			} else {
				c(e, g, v, d, i.stepped);
			}
			g = v;
		}
		if (l) {
			v = n[(s + (d ? u : 0)) % o];
			c(e, g, v, d, i.stepped);
		}
		return !!l;
	}
	function fastPathSegment(e, t, r, a) {
		const n = t.getPoints();
		const {count: i, start: o, ilen: s} = pathVars(n, r, a);
		const {move: l = true, reverse: u} = a || {};
		let c = 0;
		let f = 0;
		let d, h, v, g, p, m;
		const pointIndex = e => (o + (u ? s - e : e)) % i;
		const drawX = () => {
			if (g !== p) {
				e.lineTo(c, p);
				e.lineTo(c, g);
				e.lineTo(c, m);
			}
		};
		if (l) {
			h = n[pointIndex(0)];
			e.moveTo(h._model.x, h._model.y);
		}
		for (d = 0; d <= s; ++d) {
			h = n[pointIndex(d)];
			if (h._model.skip) {
				continue;
			}
			const t = h._model.x;
			const r = h._model.y;
			const a = 0 | t;
			if (a === v) {
				if (r < g) {
					g = r;
				} else if (r > p) {
					p = r;
				}
				c = (f * c + t) / ++f;
			} else {
				drawX();
				e.lineTo(t, r);
				v = a;
				f = 0;
				g = p = r;
			}
			m = r;
		}
		drawX();
	}
	function _getSegmentMethod(e) {
		const t = e._model || {};
		const r = t.borderDash && t.borderDash.length;
		const a = !e._decimated && !e._loop && !t.tension && "monotone" !== t.cubicInterpolationMode && !t.stepped && !r;
		return a ? fastPathSegment : pathSegment;
	}
	function _getInterpolationMethod(e) {
		if (e.stepped) {
			return De;
		}
		if (e.tension || "monotone" === e.cubicInterpolationMode) {
			return Ce;
		}
		return Te;
	}
	function strokePathWithCache(e, t, r, a) {
		let n = t._path;
		if (!n) {
			n = t._path = new Path2D;
			if (t.path(n, r, a)) {
				n.closePath();
			}
		}
		setStyle(e, t._model);
		e.stroke(n);
	}
	function strokePathDirect(e, t, r, a) {
		const n = t.getSegments();
		const i = _getSegmentMethod(t);
		for (const o of n) {
			setStyle(e, t._model, o.style);
			e.beginPath();
			if (i(e, t, o, {
				start: r,
				end: r + a - 1
			})) {
				e.closePath();
			}
			e.stroke();
		}
	}
	const Ne = "function" === typeof Path2D;
	function draw(e, t, r, a) {
		if (Ne && !t._model.segment) {
			strokePathWithCache(e, t, r, a);
		} else {
			strokePathDirect(e, t, r, a);
		}
	}
	var Ee = Pe.extend({
		_type: "line",
		constructor: function(e) {
			Pe.prototype.constructor();
			this._decimated = false;
			this._pointsUpdated = false;
			const t = Object.assign({}, e);
			if (t.points) {
				this._points = t.points;
				delete t.points;
			}
			if (t.options) {
				this._preModelOptions = t.options;
				delete t.options;
			}
			if (Object.keys(t).length) {
				Object.assign(this, t);
			}
		},
		updateControlPoints: function(e, t) {
			const r = this._model;
			if ((r.tension || "monotone" === r.cubicInterpolationMode) && !r.stepped && !this._pointsUpdated) {
				const a = r.spanGaps ? this._loop : this._fullLoop;
				ze(this._points, r, e, a, t);
				this._pointsUpdated = true;
			}
		},
		setPoints: function(e) {
			this._points = e;
			delete this._segments;
			delete this._path;
			this._pointsUpdated = false;
		},
		getPoints: function() {
			return this._points.slice();
		},
		getSegments: function() {
			return this._segments || (this._segments = Fe(this, this._model ? this._model.segment : void 0));
		},
		first: function() {
			const e = this.getSegments();
			const t = this.getPoints();
			return e.length && t[e[0].start];
		},
		last: function() {
			const e = this.getSegments();
			const t = this.getPoints();
			const r = e.length;
			return r && t[e[r - 1].end];
		},
		interpolate: function(e, t) {
			const r = this._model || {};
			const a = e[t];
			const n = this.getPoints();
			const i = Ie(this, {
				property: t,
				start: a,
				end: a
			});
			if (!i.length) {
				return;
			}
			const o = [];
			const s = _getInterpolationMethod(r);
			let l, u;
			for (l = 0, u = i.length; l < u; ++l) {
				const {start: u, end: c} = i[l];
				const f = n[u];
				const d = n[c];
				if (f === d) {
					o.push(f);
					continue;
				}
				const h = Math.abs((a - f[t]) / (d[t] - f[t]));
				const v = s(f, d, h, r.stepped);
				v[t] = e[t];
				o.push(v);
			}
			return 1 === o.length ? o[0] : o;
		},
		pathSegment: function(e, t, r) {
			const a = _getSegmentMethod(this);
			return a(e, this, t, r);
		},
		path: function(e, t, r) {
			const a = this.getSegments();
			const n = _getSegmentMethod(this);
			let i = this._loop;
			t = t || 0;
			r = r || this.getPoints().length - t;
			for (const o of a) {
				i &= n(e, this, o, {
					start: t,
					end: t + r - 1
				});
			}
			return !!i;
		},
		draw: function() {
			const e = this._chart.ctx;
			const t = this.getPoints() || [];
			if (t.length && this._model.borderWidth) {
				e.save();
				draw(e, this, 0, t.length);
				e.restore();
			}
			if (this.animated) {
				this._pointsUpdated = false;
				this._path = void 0;
			}
		}
	});
	var Ve = Y;
	var je = le;
	var We = k.exports;
	var He = We.valueOrDefault;
	var Ue = Ve.global.defaultColor;
	Ve._set("global", {
		elements: {
			point: {
				radius: 3,
				pointStyle: "circle",
				backgroundColor: Ue,
				borderColor: Ue,
				borderWidth: 1,
				hitRadius: 1,
				hoverRadius: 4,
				hoverBorderWidth: 1
			}
		}
	});
	function xRange(e) {
		var t = this._view;
		return t ? Math.abs(e - t.x) < t.radius + t.hitRadius : false;
	}
	function yRange(e) {
		var t = this._view;
		return t ? Math.abs(e - t.y) < t.radius + t.hitRadius : false;
	}
	var qe = je.extend({
		_type: "point",
		inRange: function(e, t) {
			var r = this._view;
			return r ? Math.pow(e - r.x, 2) + Math.pow(t - r.y, 2) < Math.pow(r.hitRadius + r.radius, 2) : false;
		},
		inLabelRange: xRange,
		inXRange: xRange,
		inYRange: yRange,
		getCenterPoint: function() {
			var e = this._view;
			return {
				x: e.x,
				y: e.y
			};
		},
		getArea: function() {
			return Math.PI * Math.pow(this._view.radius, 2);
		},
		tooltipPosition: function() {
			var e = this._view;
			return {
				x: e.x,
				y: e.y,
				padding: e.radius + e.borderWidth
			};
		},
		draw: function(e) {
			var t = this._view;
			var r = this._chart.ctx;
			var a = t.pointStyle;
			if (false === a) {
				return;
			}
			var n = t.rotation;
			var i = t.radius;
			var o = t.x;
			var s = t.y;
			var l = Ve.global;
			var u = l.defaultColor;
			if (t.skip) {
				return;
			}
			if (void 0 === e || We.canvas._isPointInArea(t, e)) {
				r.strokeStyle = t.borderColor || u;
				r.lineWidth = He(t.borderWidth, l.elements.point.borderWidth);
				r.fillStyle = t.backgroundColor || u;
				We.canvas.drawPoint(r, a, i, o, s, n);
			}
		}
	});
	var $e = Y;
	var Ge = le;
	var Ke = k.exports;
	var Ye = $e.global.defaultColor;
	$e._set("global", {
		elements: {
			rectangle: {
				backgroundColor: Ye,
				borderColor: Ye,
				borderSkipped: "bottom",
				borderWidth: 0
			}
		}
	});
	function isVertical(e) {
		return e && void 0 !== e.width;
	}
	function getBarBounds(e) {
		var t, r, a, n, i;
		if (isVertical(e)) {
			i = e.width / 2;
			t = e.x - i;
			r = e.x + i;
			a = Math.min(e.y, e.base);
			n = Math.max(e.y, e.base);
		} else {
			i = e.height / 2;
			t = Math.min(e.x, e.base);
			r = Math.max(e.x, e.base);
			a = e.y - i;
			n = e.y + i;
		}
		return {
			left: t,
			top: a,
			right: r,
			bottom: n
		};
	}
	function swap(e, t, r) {
		return e === t ? r : e === r ? t : e;
	}
	function parseBorderSkipped(e) {
		var t = e.borderSkipped;
		var r = {};
		if (!t) {
			return r;
		}
		if (e.horizontal) {
			if (e.base > e.x) {
				t = swap(t, "left", "right");
			}
		} else if (e.base < e.y) {
			t = swap(t, "bottom", "top");
		}
		r[t] = true;
		return r;
	}
	function parseBorderWidth(e, t, r) {
		var a = e.borderWidth;
		var n = parseBorderSkipped(e);
		var i, o, s, l;
		if (Ke.isObject(a)) {
			i = +a.top || 0;
			o = +a.right || 0;
			s = +a.bottom || 0;
			l = +a.left || 0;
		} else {
			i = o = s = l = +a || 0;
		}
		return {
			t: n.top || i < 0 ? 0 : i > r ? r : i,
			r: n.right || o < 0 ? 0 : o > t ? t : o,
			b: n.bottom || s < 0 ? 0 : s > r ? r : s,
			l: n.left || l < 0 ? 0 : l > t ? t : l
		};
	}
	function boundingRects(e) {
		var t = getBarBounds(e);
		var r = t.right - t.left;
		var a = t.bottom - t.top;
		var n = parseBorderWidth(e, r / 2, a / 2);
		return {
			outer: {
				x: t.left,
				y: t.top,
				w: r,
				h: a
			},
			inner: {
				x: t.left + n.l,
				y: t.top + n.t,
				w: r - n.l - n.r,
				h: a - n.t - n.b
			}
		};
	}
	function inRange(e, t, r) {
		var a = null === t;
		var n = null === r;
		var i = !e || a && n ? false : getBarBounds(e);
		return i && (a || t >= i.left && t <= i.right) && (n || r >= i.top && r <= i.bottom);
	}
	var Xe = Ge.extend({
		_type: "rectangle",
		draw: function() {
			var e = this._chart.ctx;
			var t = this._view;
			var r = boundingRects(t);
			var a = r.outer;
			var n = r.inner;
			e.fillStyle = t.backgroundColor;
			e.fillRect(a.x, a.y, a.w, a.h);
			if (a.w === n.w && a.h === n.h) {
				return;
			}
			e.save();
			e.beginPath();
			e.rect(a.x, a.y, a.w, a.h);
			e.clip();
			e.fillStyle = t.borderColor;
			e.rect(n.x, n.y, n.w, n.h);
			e.fill("evenodd");
			e.restore();
		},
		height: function() {
			var e = this._view;
			return e.base - e.y;
		},
		inRange: function(e, t) {
			return inRange(this._view, e, t);
		},
		inLabelRange: function(e, t) {
			var r = this._view;
			return isVertical(r) ? inRange(r, e, null) : inRange(r, null, t);
		},
		inXRange: function(e) {
			return inRange(this._view, e, null);
		},
		inYRange: function(e) {
			return inRange(this._view, null, e);
		},
		getCenterPoint: function() {
			var e = this._view;
			var t, r;
			if (isVertical(e)) {
				t = e.x;
				r = (e.y + e.base) / 2;
			} else {
				t = (e.x + e.base) / 2;
				r = e.y;
			}
			return {
				x: t,
				y: r
			};
		},
		getArea: function() {
			var e = this._view;
			return isVertical(e) ? e.width * Math.abs(e.y - e.base) : e.height * Math.abs(e.x - e.base);
		},
		tooltipPosition: function() {
			var e = this._view;
			return {
				x: e.x,
				y: e.y
			};
		}
	});
	xe.exports = {};
	xe.exports.Arc = Me;
	xe.exports.Line = Ee;
	xe.exports.Point = qe;
	xe.exports.Rectangle = Xe;
	var Je = be;
	var Qe = Y;
	var Ze = xe.exports;
	var et = k.exports;
	var tt = et._deprecated;
	var rt = et.valueOrDefault;
	Qe._set("bar", {
		hover: {
			mode: "label"
		},
		scales: {
			xAxes: [ {
				type: "category",
				offset: true,
				gridLines: {
					offsetGridLines: true
				}
			} ],
			yAxes: [ {
				type: "linear"
			} ]
		}
	});
	Qe._set("global", {
		datasets: {
			bar: {
				categoryPad: null,
				categoryPercentage: .8,
				barPercentage: .9
			}
		}
	});
	function computeMinSampleSize(e, t) {
		var r = e._length;
		var a, n, i, o;
		for (i = 1, o = t.length; i < o; ++i) {
			r = Math.min(r, Math.abs(t[i] - t[i - 1]));
		}
		for (i = 0, o = e.getTicks().length; i < o; ++i) {
			n = e.getPixelForTick(i);
			r = i > 0 ? Math.min(r, Math.abs(n - a)) : r;
			a = n;
		}
		return r;
	}
	function computeFitCategoryTraits(e, t, r) {
		var a = r.barThickness;
		var n = t.stackCount;
		var i = t.pixels[e];
		var o = r.categoryPad || 0;
		var s = null == r.categoryPad ? r.categoryPercentage : 1;
		var l = et.isNullOrUndef(a) ? computeMinSampleSize(t.scale, t.pixels) : -1;
		var u, c;
		if (et.isNullOrUndef(a)) {
			u = l * s - o;
			c = r.barPercentage;
		} else {
			u = a * n;
			c = 1;
		}
		return {
			chunk: u / n,
			ratio: c,
			start: i - u / 2
		};
	}
	function computeFlexCategoryTraits(e, t, r) {
		var a = t.pixels;
		var n = a[e];
		var i = e > 0 ? a[e - 1] : null;
		var o = e < a.length - 1 ? a[e + 1] : null;
		var s = r.categoryPad || 0;
		var l = null == r.categoryPad ? r.categoryPercentage : 1;
		var u, c;
		if (null === i) {
			i = n - (null === o ? t.end - t.start : o - n);
		}
		if (null === o) {
			o = n + n - i;
		}
		u = n - (n - Math.min(i, o)) / 2 * l + s;
		c = Math.abs(o - i) / 2 * l - s;
		return {
			chunk: c / t.stackCount,
			ratio: r.barPercentage,
			start: u
		};
	}
	var at = Je.extend({
		dataElementType: Ze.Rectangle,
		_dataElementOptions: [ "backgroundColor", "borderColor", "borderSkipped", "borderWidth", "barPercentage", "barThickness", "categoryPercentage", "categoryPad", "maxBarThickness", "minBarLength" ],
		initialize: function() {
			var e = this;
			var t, r;
			Je.prototype.initialize.apply(e, arguments);
			t = e.getMeta();
			t.stack = e.getDataset().stack;
			t.bar = true;
			r = e._getIndexScale().options;
			tt("bar chart", r.barPercentage, "scales.[x/y]Axes.barPercentage", "dataset.barPercentage");
			tt("bar chart", r.barThickness, "scales.[x/y]Axes.barThickness", "dataset.barThickness");
			tt("bar chart", r.categoryPercentage, "scales.[x/y]Axes.categoryPercentage", "dataset.categoryPercentage");
			tt("bar chart", e._getValueScale().options.minBarLength, "scales.[x/y]Axes.minBarLength", "dataset.minBarLength");
			tt("bar chart", r.maxBarThickness, "scales.[x/y]Axes.maxBarThickness", "dataset.maxBarThickness");
		},
		update: function(e) {
			var t = this;
			var r = t.getMeta().data;
			var a, n;
			t._ruler = t.getRuler();
			for (a = 0, n = r.length; a < n; ++a) {
				t.updateElement(r[a], a, e);
			}
		},
		updateElement: function(e, t, r) {
			var a = this;
			var n = a.getMeta();
			var i = a.getDataset();
			var o = a._resolveDataElementOptions(e, t);
			e._xScale = a.getScaleForId(n.xAxisID);
			e._yScale = a.getScaleForId(n.yAxisID);
			e._datasetIndex = a.index;
			e._index = t;
			e._model = {
				backgroundColor: o.backgroundColor,
				borderColor: o.borderColor,
				borderSkipped: o.borderSkipped,
				borderWidth: o.borderWidth,
				datasetLabel: i.label,
				label: a.chart.data.labels[t]
			};
			if (et.isArray(i.data[t])) {
				e._model.borderSkipped = null;
			}
			a._updateElementGeometry(e, t, r, o);
			e.pivot();
		},
		_updateElementGeometry: function(e, t, r, a) {
			var n = this;
			var i = e._model;
			var o = n._getValueScale();
			var s = o.getBasePixel();
			var l = o.isHorizontal();
			var u = n._ruler || n.getRuler();
			var c = n.calculateBarValuePixels(n.index, t, a);
			var f = n.calculateBarIndexPixels(n.index, t, u, a);
			i.horizontal = l;
			i.base = r ? s : c.base;
			i.x = l ? r ? s : c.head : f.center;
			i.y = l ? f.center : r ? s : c.head;
			i.height = l ? f.size : void 0;
			i.width = l ? void 0 : f.size;
		},
		_getStacks: function(e) {
			var t = this;
			var r = t._getIndexScale();
			var a = r._getMatchingVisibleMetas(t._type);
			var n = r.options.stacked;
			var i = a.length;
			var o = [];
			var s, l;
			for (s = 0; s < i; ++s) {
				l = a[s];
				if (false === n || -1 === o.indexOf(l.stack) || void 0 === n && void 0 === l.stack) {
					o.push(l.stack);
				}
				if (l.index === e) {
					break;
				}
			}
			return o;
		},
		getStackCount: function() {
			return this._getStacks().length;
		},
		getStackIndex: function(e, t) {
			var r = this._getStacks(e);
			var a = void 0 !== t ? r.indexOf(t) : -1;
			return -1 === a ? r.length - 1 : a;
		},
		getRuler: function() {
			var e = this;
			var t = e._getIndexScale();
			var r = [];
			var a, n;
			for (a = 0, n = e.getMeta().data.length; a < n; ++a) {
				r.push(t.getPixelForValue(null, a, e.index));
			}
			return {
				pixels: r,
				start: t._startPixel,
				end: t._endPixel,
				stackCount: e.getStackCount(),
				scale: t
			};
		},
		calculateBarValuePixels: function(e, t, r) {
			var a = this;
			var n = a.chart;
			var i = a._getValueScale();
			var o = i.isHorizontal();
			var s = n.data.datasets;
			var l = i._getMatchingVisibleMetas(a._type);
			var u = i._parseValue(s[e].data[t]);
			var c = r.minBarLength;
			var f = i.options.stacked;
			var d = a.getMeta().stack;
			var h = void 0 === u.start ? 0 : u.max >= 0 && u.min >= 0 ? u.min : u.max;
			var v = void 0 === u.start ? u.end : u.max >= 0 && u.min >= 0 ? u.max - u.min : u.min - u.max;
			var g = l.length;
			var p, m, b, x, y, _, w;
			if (f || void 0 === f && void 0 !== d) {
				for (p = 0; p < g; ++p) {
					m = l[p];
					if (m.index === e) {
						break;
					}
					if (m.stack === d) {
						w = i._parseValue(s[m.index].data[t]);
						b = void 0 === w.start ? w.end : w.min >= 0 && w.max >= 0 ? w.max : w.min;
						if (u.min < 0 && b < 0 || u.max >= 0 && b > 0) {
							h += b;
						}
					}
				}
			}
			const k = (f && i.options.barStackPadding || 0) / 2;
			x = i.getPixelForValue(h) - k;
			y = i.getPixelForValue(h + v) + k;
			_ = y - x;
			if (void 0 !== c && Math.abs(_) < c) {
				_ = c;
				if (v >= 0 && !o || v < 0 && o) {
					y = x - c;
				} else {
					y = x + c;
				}
			}
			return {
				size: _,
				base: x,
				head: y,
				center: y + _ / 2
			};
		},
		calculateBarIndexPixels: function(e, t, r, a) {
			var n = this;
			var i = "flex" === a.barThickness ? computeFlexCategoryTraits(t, r, a) : computeFitCategoryTraits(t, r, a);
			var o = n.getStackIndex(e, n.getMeta().stack);
			var s = i.start + i.chunk * o + i.chunk / 2;
			var l = Math.min(rt(a.maxBarThickness, 1 / 0), i.chunk * i.ratio);
			return {
				base: s - l / 2,
				head: s + l / 2,
				center: s,
				size: l
			};
		},
		draw: function() {
			var e = this;
			var t = e.chart;
			var r = e._getValueScale();
			var a = e.getMeta().data;
			var n = e.getDataset();
			var i = a.length;
			var o = 0;
			et.canvas.clipArea(t.ctx, t.chartArea);
			for (;o < i; ++o) {
				var s = r._parseValue(n.data[o]);
				if (!isNaN(s.min) && !isNaN(s.max)) {
					a[o].draw();
				}
			}
			et.canvas.unclipArea(t.ctx);
		},
		_resolveDataElementOptions: function() {
			var e = this;
			var t = et.extend({}, Je.prototype._resolveDataElementOptions.apply(e, arguments));
			var r = e._getIndexScale().options;
			var a = e._getValueScale().options;
			t.barPercentage = rt(r.barPercentage, t.barPercentage);
			t.barThickness = rt(r.barThickness, t.barThickness);
			t.categoryPercentage = rt(r.categoryPercentage, t.categoryPercentage);
			t.categoryPad = rt(r.categoryPad, t.categoryPad);
			t.maxBarThickness = rt(r.maxBarThickness, t.maxBarThickness);
			t.minBarLength = rt(a.minBarLength, t.minBarLength);
			return t;
		}
	});
	var nt = be;
	var it = Y;
	var ot = xe.exports;
	var st = k.exports;
	var lt = st.valueOrDefault;
	var ut = st.options.resolve;
	var ct = st.canvas._isPointInArea;
	it._set("line", {
		showLines: true,
		spanGaps: false,
		hover: {
			mode: "label"
		},
		scales: {
			xAxes: [ {
				type: "category",
				id: "x-axis-0"
			} ],
			yAxes: [ {
				type: "linear",
				id: "y-axis-0"
			} ]
		}
	});
	function scaleClip(e, t) {
		var r = e && e.options.ticks || {};
		var a = r.reverse;
		var n = void 0 === r.min ? t : 0;
		var i = void 0 === r.max ? t : 0;
		return {
			start: a ? i : n,
			end: a ? n : i
		};
	}
	function defaultClip(e, t, r) {
		var a = r / 2;
		var n = scaleClip(e, a);
		var i = scaleClip(t, a);
		return {
			top: i.end,
			right: n.end,
			bottom: i.start,
			left: n.start
		};
	}
	function toClip(e) {
		var t, r, a, n;
		if (st.isObject(e)) {
			t = e.top;
			r = e.right;
			a = e.bottom;
			n = e.left;
		} else {
			t = r = a = n = e;
		}
		return {
			top: t,
			right: r,
			bottom: a,
			left: n
		};
	}
	var ft = nt.extend({
		datasetElementType: ot.Line,
		dataElementType: ot.Point,
		_datasetElementOptions: [ "backgroundColor", "borderCapStyle", "borderColor", "borderDash", "borderDashOffset", "borderJoinStyle", "borderWidth", "cubicInterpolationMode", "fill" ],
		_dataElementOptions: {
			backgroundColor: "pointBackgroundColor",
			borderColor: "pointBorderColor",
			borderWidth: "pointBorderWidth",
			hitRadius: "pointHitRadius",
			hoverBackgroundColor: "pointHoverBackgroundColor",
			hoverBorderColor: "pointHoverBorderColor",
			hoverBorderWidth: "pointHoverBorderWidth",
			hoverRadius: "pointHoverRadius",
			pointStyle: "pointStyle",
			radius: "pointRadius",
			rotation: "pointRotation"
		},
		update: function(e) {
			var t = this;
			var r = t.getMeta();
			var a = r.dataset;
			var n = r.data || [];
			var i = t.chart.options;
			var o = t._config;
			var s = t._showLine = lt(o.showLine, i.showLines);
			var l, u;
			t._xScale = t.getScaleForId(r.xAxisID);
			t._yScale = t.getScaleForId(r.yAxisID);
			if (s) {
				if (void 0 !== o.tension && void 0 === o.lineTension) {
					o.lineTension = o.tension;
				}
				a._datasetIndex = t.index;
				a.setPoints(n);
				a._model = t._resolveDatasetElementOptions(a);
				a.pivot();
			}
			for (l = 0, u = n.length; l < u; ++l) {
				t.updateElement(n[l], l, e);
			}
			if (s && 0 !== a._model.tension) {
				t.updateBezierControlPoints();
			}
			for (l = 0, u = n.length; l < u; ++l) {
				n[l].pivot();
			}
		},
		updateElement: function(e, t, r) {
			var a = this;
			var n = a.getMeta();
			var i = e.custom || {};
			var o = a.getDataset();
			var s = a.index;
			var l = o.data[t];
			var u = a._xScale;
			var c = a._yScale;
			var f = n.dataset._model;
			var d, h;
			var v = a._resolveDataElementOptions(e, t);
			d = u.getPixelForValue("object" === typeof l ? l : NaN, t, s);
			h = r ? c.getBasePixel() : a.calculatePointY(l, t, s);
			e._xScale = u;
			e._yScale = c;
			e._options = v;
			e._datasetIndex = s;
			e._index = t;
			e._model = {
				x: d,
				y: h,
				skip: i.skip || isNaN(d) || isNaN(h),
				radius: v.radius,
				pointStyle: v.pointStyle,
				rotation: v.rotation,
				backgroundColor: v.backgroundColor,
				borderColor: v.borderColor,
				borderWidth: v.borderWidth,
				tension: lt(i.tension, f ? f.tension : 0),
				steppedLine: f ? f.steppedLine : false,
				hitRadius: v.hitRadius,
				...e._preModelOptions
			};
			delete e._preModelOptions;
		},
		_resolveDatasetElementOptions: function(e) {
			var t = this;
			var r = t._config;
			var a = e.custom || {};
			var n = t.chart.options;
			var i = n.elements.line;
			var o = nt.prototype._resolveDatasetElementOptions.apply(t, arguments);
			o.spanGaps = lt(r.spanGaps, n.spanGaps);
			o.tension = lt(r.lineTension, i.tension);
			o.steppedLine = ut([ a.steppedLine, r.steppedLine, i.stepped ]);
			o.clip = toClip(lt(r.clip, defaultClip(t._xScale, t._yScale, o.borderWidth)));
			o.segment = lt(r.segment, i.segment);
			if (e._preModelOptions) {
				Object.assign(o, e._preModelOptions);
				delete e._preModelOptions;
			}
			return o;
		},
		calculatePointY: function(e, t, r) {
			var a = this;
			var n = a.chart;
			var i = a._yScale;
			var o = 0;
			var s = 0;
			var l, u, c, f, d, h, v;
			if (i.options.stacked) {
				d = +i.getRightValue(e);
				h = n._getSortedVisibleDatasetMetas();
				v = h.length;
				for (l = 0; l < v; ++l) {
					c = h[l];
					if (c.index === r) {
						break;
					}
					u = n.data.datasets[c.index];
					if ("line" === c.type && c.yAxisID === i.id) {
						f = +i.getRightValue(u.data[t]);
						if (f < 0) {
							s += f || 0;
						} else {
							o += f || 0;
						}
					}
				}
				if (d < 0) {
					return i.getPixelForValue(s + d);
				}
				return i.getPixelForValue(o + d);
			}
			return i.getPixelForValue(e);
		},
		updateBezierControlPoints: function() {
			var e = this;
			var t = e.chart;
			var r = e.getMeta();
			var a = r.dataset._model;
			var n = t.chartArea;
			var i = r.data || [];
			var o, s, l, u;
			if (a.spanGaps) {
				i = i.filter((function(e) {
					return !e._model.skip;
				}));
			}
			function capControlPoint(e, t, r) {
				return Math.max(Math.min(e, r), t);
			}
			if ("monotone" === a.cubicInterpolationMode) {
				st.splineCurveMonotone(i);
			} else {
				for (o = 0, s = i.length; o < s; ++o) {
					l = i[o]._model;
					u = st.splineCurve(st.previousItem(i, o)._model, l, st.nextItem(i, o)._model, a.tension);
					l.controlPointPreviousX = u.previous.x;
					l.controlPointPreviousY = u.previous.y;
					l.controlPointNextX = u.next.x;
					l.controlPointNextY = u.next.y;
				}
			}
			if (t.options.elements.line.capBezierPoints) {
				for (o = 0, s = i.length; o < s; ++o) {
					l = i[o]._model;
					if (ct(l, n)) {
						if (o > 0 && ct(i[o - 1]._model, n)) {
							l.controlPointPreviousX = capControlPoint(l.controlPointPreviousX, n.left, n.right);
							l.controlPointPreviousY = capControlPoint(l.controlPointPreviousY, n.top, n.bottom);
						}
						if (o < i.length - 1 && ct(i[o + 1]._model, n)) {
							l.controlPointNextX = capControlPoint(l.controlPointNextX, n.left, n.right);
							l.controlPointNextY = capControlPoint(l.controlPointNextY, n.top, n.bottom);
						}
					}
				}
			}
		},
		draw: function() {
			var e = this;
			var t = e.chart;
			var r = e.getMeta();
			var a = r.data || [];
			var n = t.chartArea;
			var i = t.canvas;
			var o = 0;
			var s = a.length;
			var l;
			if (e._showLine) {
				l = r.dataset._model.clip;
				st.canvas.clipArea(t.ctx, {
					left: false === l.left ? 0 : n.left - l.left,
					right: false === l.right ? i.width : n.right + l.right,
					top: false === l.top ? 0 : n.top - l.top,
					bottom: false === l.bottom ? i.height : n.bottom + l.bottom
				});
				r.dataset.draw();
				st.canvas.unclipArea(t.ctx);
			}
			for (;o < s; ++o) {
				a[o].draw(n);
			}
		},
		setHoverStyle: function(e) {
			var t = e._model;
			var r = e._options;
			var a = st.getHoverColor;
			e.$previousStyle = {
				backgroundColor: t.backgroundColor,
				borderColor: t.borderColor,
				borderWidth: t.borderWidth,
				radius: t.radius
			};
			t.backgroundColor = lt(r.hoverBackgroundColor, a(r.backgroundColor));
			t.borderColor = lt(r.hoverBorderColor, a(r.borderColor));
			t.borderWidth = lt(r.hoverBorderWidth, r.borderWidth);
			t.radius = lt(r.hoverRadius, r.radius);
		}
	});
	var dt = ft;
	var ht = Y;
	ht._set("scatter", {
		hover: {
			mode: "single"
		},
		scales: {
			xAxes: [ {
				id: "x-axis-1",
				type: "linear",
				position: "bottom"
			} ],
			yAxes: [ {
				id: "y-axis-1",
				type: "linear",
				position: "left"
			} ]
		},
		tooltips: {
			callbacks: {
				title: function() {
					return "";
				},
				label: function(e) {
					return "(" + e.xLabel + ", " + e.yLabel + ")";
				}
			}
		}
	});
	ht._set("global", {
		datasets: {
			scatter: {
				showLine: false
			}
		}
	});
	var vt = dt;
	var gt = at;
	var pt = ft;
	var mt = vt;
	var bt = {
		bar: gt,
		line: pt,
		scatter: mt
	};
	var xt = k.exports;
	function getRelativePosition(e, t) {
		if (e.native) {
			return {
				x: e.x,
				y: e.y
			};
		}
		return xt.getRelativePosition(e, t);
	}
	function parseVisibleItems(e, t) {
		var r = e._getSortedVisibleDatasetMetas();
		var a, n, i, o, s, l;
		for (n = 0, o = r.length; n < o; ++n) {
			a = r[n].data;
			for (i = 0, s = a.length; i < s; ++i) {
				l = a[i];
				if (!l._view.skip) {
					t(l);
				}
			}
		}
	}
	function getIntersectItems(e, t) {
		var r = [];
		parseVisibleItems(e, (function(e) {
			if (e.inRange(t.x, t.y)) {
				r.push(e);
			}
		}));
		return r;
	}
	function getNearestItems(e, t, r, a) {
		var n = Number.POSITIVE_INFINITY;
		var i = [];
		parseVisibleItems(e, (function(e) {
			if (r && !e.inRange(t.x, t.y)) {
				return;
			}
			var o = e.getCenterPoint();
			var s = a(t, o);
			if (s < n) {
				i = [ e ];
				n = s;
			} else if (s === n) {
				i.push(e);
			}
		}));
		return i;
	}
	function getDistanceMetricForAxis(e) {
		var t = -1 !== e.indexOf("x");
		var r = -1 !== e.indexOf("y");
		return function(e, a) {
			var n = t ? Math.abs(e.x - a.x) : 0;
			var i = r ? Math.abs(e.y - a.y) : 0;
			return Math.sqrt(Math.pow(n, 2) + Math.pow(i, 2));
		};
	}
	function indexMode(e, t, r) {
		var a = getRelativePosition(t, e);
		r.axis = r.axis || "x";
		var n = getDistanceMetricForAxis(r.axis);
		var i = r.intersect ? getIntersectItems(e, a) : getNearestItems(e, a, false, n);
		var o = [];
		if (!i.length) {
			return [];
		}
		e._getSortedVisibleDatasetMetas().forEach((function(e) {
			var t = e.data[i[0]._index];
			if (t && !t._view.skip) {
				o.push(t);
			}
		}));
		return o;
	}
	var yt = {
		modes: {
			single: function(e, t) {
				var r = getRelativePosition(t, e);
				var a = [];
				parseVisibleItems(e, (function(e) {
					if (e.inRange(r.x, r.y)) {
						a.push(e);
						return a;
					}
				}));
				return a.slice(0, 1);
			},
			label: indexMode,
			index: indexMode,
			dataset: function(e, t, r) {
				var a = getRelativePosition(t, e);
				r.axis = r.axis || "xy";
				var n = getDistanceMetricForAxis(r.axis);
				var i = r.intersect ? getIntersectItems(e, a) : getNearestItems(e, a, false, n);
				if (i.length > 0) {
					i = e.getDatasetMeta(i[0]._datasetIndex).data;
				}
				return i;
			},
			"x-axis": function(e, t) {
				return indexMode(e, t, {
					intersect: false
				});
			},
			point: function(e, t) {
				var r = getRelativePosition(t, e);
				return getIntersectItems(e, r);
			},
			nearest: function(e, t, r) {
				var a = getRelativePosition(t, e);
				r.axis = r.axis || "xy";
				var n = getDistanceMetricForAxis(r.axis);
				return getNearestItems(e, a, r.intersect, n);
			},
			x: function(e, t, r) {
				var a = getRelativePosition(t, e);
				var n = [];
				var i = false;
				parseVisibleItems(e, (function(e) {
					if (e.inXRange(a.x)) {
						n.push(e);
					}
					if (e.inRange(a.x, a.y)) {
						i = true;
					}
				}));
				if (r.intersect && !i) {
					n = [];
				}
				return n;
			},
			y: function(e, t, r) {
				var a = getRelativePosition(t, e);
				var n = [];
				var i = false;
				parseVisibleItems(e, (function(e) {
					if (e.inYRange(a.y)) {
						n.push(e);
					}
					if (e.inRange(a.x, a.y)) {
						i = true;
					}
				}));
				if (r.intersect && !i) {
					n = [];
				}
				return n;
			}
		}
	};
	var _t = Y;
	var wt = k.exports;
	var kt = wt.extend;
	function filterByPosition(e, t) {
		return wt.where(e, (function(e) {
			return e.pos === t;
		}));
	}
	function sortByWeight(e, t) {
		return e.sort((function(e, r) {
			var a = t ? r : e;
			var n = t ? e : r;
			return a.weight === n.weight ? a.index - n.index : a.weight - n.weight;
		}));
	}
	function wrapBoxes(e) {
		var t = [];
		var r, a, n;
		for (r = 0, a = (e || []).length; r < a; ++r) {
			n = e[r];
			t.push({
				index: r,
				box: n,
				pos: n.position,
				horizontal: n.isHorizontal(),
				weight: n.weight
			});
		}
		return t;
	}
	function setLayoutDims(e, t) {
		var r, a, n;
		for (r = 0, a = e.length; r < a; ++r) {
			n = e[r];
			n.width = n.horizontal ? n.box.fullWidth && t.availableWidth : t.vBoxMaxWidth;
			n.height = n.horizontal && t.hBoxMaxHeight;
		}
	}
	function buildLayoutBoxes(e) {
		var t = wrapBoxes(e);
		var r = sortByWeight(filterByPosition(t, "left"), true);
		var a = sortByWeight(filterByPosition(t, "right"));
		var n = sortByWeight(filterByPosition(t, "top"), true);
		var i = sortByWeight(filterByPosition(t, "bottom"));
		return {
			leftAndTop: r.concat(n),
			rightAndBottom: a.concat(i),
			chartArea: filterByPosition(t, "chartArea"),
			vertical: r.concat(a),
			horizontal: n.concat(i)
		};
	}
	function getCombinedMax(e, t, r, a) {
		return Math.max(e[r], t[r]) + Math.max(e[a], t[a]);
	}
	function updateDims(e, t, r) {
		var a = r.box;
		var n = e.maxPadding;
		var i, o;
		if (r.size) {
			e[r.pos] -= r.size;
		}
		r.size = r.horizontal ? a.height : a.width;
		e[r.pos] += r.size;
		if (a.getPadding) {
			var s = a.getPadding();
			n.top = Math.max(n.top, s.top);
			n.left = Math.max(n.left, s.left);
			n.bottom = Math.max(n.bottom, s.bottom);
			n.right = Math.max(n.right, s.right);
		}
		i = t.outerWidth - getCombinedMax(n, e, "left", "right");
		o = t.outerHeight - getCombinedMax(n, e, "top", "bottom");
		if (i !== e.w || o !== e.h) {
			e.w = i;
			e.h = o;
			var l = r.horizontal ? [ i, e.w ] : [ o, e.h ];
			return l[0] !== l[1] && (!isNaN(l[0]) || !isNaN(l[1]));
		}
	}
	function handleMaxPadding(e) {
		var t = e.maxPadding;
		function updatePos(r) {
			var a = Math.max(t[r] - e[r], 0);
			e[r] += a;
			return a;
		}
		e.y += updatePos("top");
		e.x += updatePos("left");
		updatePos("right");
		updatePos("bottom");
	}
	function getMargins(e, t) {
		var r = t.maxPadding;
		function marginForPositions(e) {
			var a = {
				left: 0,
				top: 0,
				right: 0,
				bottom: 0
			};
			e.forEach((function(e) {
				a[e] = Math.max(t[e], r[e]);
			}));
			return a;
		}
		return e ? marginForPositions([ "left", "right" ]) : marginForPositions([ "top", "bottom" ]);
	}
	function fitBoxes(e, t, r) {
		var a = [];
		var n, i, o, s, l, u;
		for (n = 0, i = e.length; n < i; ++n) {
			o = e[n];
			s = o.box;
			s.update(o.width || t.w, o.height || t.h, getMargins(o.horizontal, t));
			if (updateDims(t, r, o)) {
				u = true;
				if (a.length) {
					l = true;
				}
			}
			if (!s.fullWidth) {
				a.push(o);
			}
		}
		return l ? fitBoxes(a, t, r) || u : u;
	}
	function placeBoxes(e, t, r) {
		var a = r.padding;
		var n = t.x;
		var i = t.y;
		var o, s, l, u;
		for (o = 0, s = e.length; o < s; ++o) {
			l = e[o];
			u = l.box;
			if (l.horizontal) {
				u.left = u.fullWidth ? a.left : t.left;
				u.right = u.fullWidth ? r.outerWidth - a.right : t.left + t.w;
				u.top = i;
				u.bottom = i + u.height;
				u.width = u.right - u.left;
				i = u.bottom;
			} else {
				u.left = n;
				u.right = n + u.width;
				u.top = t.top;
				u.bottom = t.top + t.h;
				u.height = u.bottom - u.top;
				n = u.right;
			}
		}
		t.x = n;
		t.y = i;
	}
	_t._set("global", {
		layout: {
			padding: {
				top: 0,
				right: 0,
				bottom: 0,
				left: 0
			}
		}
	});
	var Mt = {
		defaults: {},
		addBox: function(e, t) {
			if (!e.boxes) {
				e.boxes = [];
			}
			t.fullWidth = t.fullWidth || false;
			t.position = t.position || "top";
			t.weight = t.weight || 0;
			t._layers = t._layers || function() {
				return [ {
					z: 0,
					draw: function() {
						t.draw.apply(t, arguments);
					}
				} ];
			};
			e.boxes.push(t);
		},
		removeBox: function(e, t) {
			var r = e.boxes ? e.boxes.indexOf(t) : -1;
			if (-1 !== r) {
				e.boxes.splice(r, 1);
			}
		},
		configure: function(e, t, r) {
			var a = [ "fullWidth", "position", "weight" ];
			var n = a.length;
			var i = 0;
			var o;
			for (;i < n; ++i) {
				o = a[i];
				if (Object.prototype.hasOwnProperty.call(r, o)) {
					t[o] = r[o];
				}
			}
		},
		update: function(e, t, r) {
			if (!e) {
				return;
			}
			var a = e.options.layout || {};
			var n = wt.options.toPadding(a.padding);
			var i = t - n.width;
			var o = r - n.height;
			var s = buildLayoutBoxes(e.boxes);
			var l = s.vertical;
			var u = s.horizontal;
			var c = Object.freeze({
				outerWidth: t,
				outerHeight: r,
				padding: n,
				availableWidth: i,
				vBoxMaxWidth: i / 2 / l.length,
				hBoxMaxHeight: o / 2
			});
			var f = kt({
				maxPadding: kt({}, n),
				w: i,
				h: o,
				x: n.left,
				y: n.top
			}, n);
			setLayoutDims(l.concat(u), c);
			fitBoxes(l, f, c);
			if (fitBoxes(u, f, c)) {
				fitBoxes(l, f, c);
			}
			handleMaxPadding(f);
			placeBoxes(s.leftAndTop, f, c);
			f.x += f.w;
			f.y += f.h;
			placeBoxes(s.rightAndBottom, f, c);
			e.chartArea = {
				left: f.left,
				top: f.top,
				right: f.left + f.w,
				bottom: f.top + f.h
			};
			wt.each(s.chartArea, (function(t) {
				var r = t.box;
				kt(r, e.chartArea);
				r.update(f.w, f.h);
			}));
		}
	};
	var St = {
		acquireContext: function(e) {
			if (e && e.canvas) {
				e = e.canvas;
			}
			return e && e.getContext("2d") || null;
		}
	};
	var Pt = "/*\n * DOM element rendering detection\n * https://davidwalsh.name/detect-node-insertion\n */\n@keyframes chartjs-render-animation {\n\tfrom { opacity: 0.99; }\n\tto { opacity: 1; }\n}\n\n.chartjs-render-monitor {\n\tanimation: chartjs-render-animation 0.001s;\n}\n\n/*\n * DOM element resizing detection\n * https://github.com/marcj/css-element-queries\n */\n.chartjs-size-monitor,\n.chartjs-size-monitor-expand,\n.chartjs-size-monitor-shrink {\n\tposition: absolute;\n\tdirection: ltr;\n\tleft: 0;\n\ttop: 0;\n\tright: 0;\n\tbottom: 0;\n\toverflow: hidden;\n\tpointer-events: none;\n\tvisibility: hidden;\n\tz-index: -1;\n}\n\n.chartjs-size-monitor-expand > div {\n\tposition: absolute;\n\twidth: 1000000px;\n\theight: 1000000px;\n\tleft: 0;\n\ttop: 0;\n}\n\n.chartjs-size-monitor-shrink > div {\n\tposition: absolute;\n\twidth: 200%;\n\theight: 200%;\n\tleft: 0;\n\ttop: 0;\n}\n";
	var At = Object.freeze({
		__proto__: null,
		default: Pt
	});
	var Ct = getAugmentedNamespace(At);
	var Tt = k.exports;
	var Dt = Ct;
	var Ft = "$chartjs";
	var It = "chartjs-";
	var Lt = It + "size-monitor";
	var Ot = It + "render-monitor";
	var zt = It + "render-animation";
	var Bt = [ "animationstart", "webkitAnimationStart" ];
	var Rt = {
		touchstart: "mousedown",
		touchmove: "mousemove",
		touchend: "mouseup",
		pointerenter: "mouseenter",
		pointerdown: "mousedown",
		pointermove: "mousemove",
		pointerup: "mouseup",
		pointerleave: "mouseout",
		pointerout: "mouseout"
	};
	function readUsedSize(e, t) {
		var r = Tt.getStyle(e, t);
		var a = r && r.match(/^(\d+)(\.\d+)?px$/);
		return a ? Number(a[1]) : void 0;
	}
	function initCanvas(e, t) {
		var r = e.style;
		var a = e.getAttribute("height");
		var n = e.getAttribute("width");
		e[Ft] = {
			initial: {
				height: a,
				width: n,
				style: {
					display: r.display,
					height: r.height,
					width: r.width
				}
			}
		};
		r.display = r.display || "block";
		if (null === n || "" === n) {
			var i = readUsedSize(e, "width");
			if (void 0 !== i) {
				e.width = i;
			}
		}
		if (null === a || "" === a) {
			if ("" === e.style.height) {
				e.height = e.width / (t.options.aspectRatio || 2);
			} else {
				var o = readUsedSize(e, "height");
				if (void 0 !== i) {
					e.height = o;
				}
			}
		}
		return e;
	}
	var Nt = function() {
		var e = false;
		try {
			var t = Object.defineProperty({}, "passive", {
				get: function() {
					e = true;
				}
			});
			window.addEventListener("e", null, t);
		} catch (e) {}
		return e;
	}();
	var Et = Nt ? {
		passive: true
	} : false;
	function addListener(e, t, r) {
		e.addEventListener(t, r, Et);
	}
	function removeListener(e, t, r) {
		e.removeEventListener(t, r, Et);
	}
	function createEvent(e, t, r, a, n) {
		return {
			type: e,
			chart: t,
			native: n || null,
			x: void 0 !== r ? r : null,
			y: void 0 !== a ? a : null
		};
	}
	function fromNativeEvent(e, t) {
		var r = Rt[e.type] || e.type;
		var a = Tt.getRelativePosition(e, t);
		return createEvent(r, t, a.x, a.y, e);
	}
	function throttled(e, t) {
		var r = false;
		var a = [];
		return function() {
			a = Array.prototype.slice.call(arguments);
			t = t || this;
			if (!r) {
				r = true;
				Tt.requestAnimFrame.call(window, (function() {
					r = false;
					e.apply(t, a);
				}));
			}
		};
	}
	function createDiv(e) {
		var t = document.createElement("div");
		t.className = e || "";
		return t;
	}
	function createResizer(e) {
		var t = 1e6;
		var r = createDiv(Lt);
		var a = createDiv(Lt + "-expand");
		var n = createDiv(Lt + "-shrink");
		a.appendChild(createDiv());
		n.appendChild(createDiv());
		r.appendChild(a);
		r.appendChild(n);
		r._reset = function() {
			a.scrollLeft = t;
			a.scrollTop = t;
			n.scrollLeft = t;
			n.scrollTop = t;
		};
		var onScroll = function() {
			r._reset();
			e();
		};
		addListener(a, "scroll", onScroll.bind(a, "expand"));
		addListener(n, "scroll", onScroll.bind(n, "shrink"));
		return r;
	}
	function watchForRender(e, t) {
		var r = e[Ft] || (e[Ft] = {});
		var a = r.renderProxy = function(e) {
			if (e.animationName === zt) {
				t();
			}
		};
		Tt.each(Bt, (function(t) {
			addListener(e, t, a);
		}));
		r.reflow = !!e.offsetParent;
		e.classList.add(Ot);
	}
	function unwatchForRender(e) {
		var t = e[Ft] || {};
		var r = t.renderProxy;
		if (r) {
			Tt.each(Bt, (function(t) {
				removeListener(e, t, r);
			}));
			delete t.renderProxy;
		}
		e.classList.remove(Ot);
	}
	function addResizeListener(e, t, r) {
		var a = e[Ft] || (e[Ft] = {});
		var n = a.resizer = createResizer(throttled((function() {
			if (a.resizer) {
				var n = r.options.maintainAspectRatio && e.parentNode;
				var i = n ? n.clientWidth : 0;
				t(createEvent("resize", r));
				if (n && n.clientWidth < i && r.canvas) {
					t(createEvent("resize", r));
				}
			}
		})));
		watchForRender(e, (function() {
			if (a.resizer) {
				var t = e.parentNode;
				if (t && t !== n.parentNode) {
					t.insertBefore(n, t.firstChild);
				}
				n._reset();
			}
		}));
	}
	function removeResizeListener(e) {
		var t = e[Ft] || {};
		var r = t.resizer;
		delete t.resizer;
		unwatchForRender(e);
		if (r && r.parentNode) {
			r.parentNode.removeChild(r);
		}
	}
	function injectCSS(e, t) {
		var r = e[Ft] || (e[Ft] = {});
		if (!r.containsStyles) {
			r.containsStyles = true;
			t = "/* Chart.js */\n" + t;
			var a = document.createElement("style");
			a.setAttribute("type", "text/css");
			a.appendChild(document.createTextNode(t));
			e.appendChild(a);
		}
	}
	var Vt = {
		disableCSSInjection: false,
		_enabled: "undefined" !== typeof window && "undefined" !== typeof document,
		_ensureLoaded: function(e) {
			if (!this.disableCSSInjection) {
				var t = e.getRootNode ? e.getRootNode() : document;
				var r = t.host ? t : document.head;
				injectCSS(r, Dt);
			}
		},
		acquireContext: function(e, t) {
			if ("string" === typeof e) {
				e = document.getElementById(e);
			} else if (e.length) {
				e = e[0];
			}
			if (e && e.canvas) {
				e = e.canvas;
			}
			var r = e && e.getContext && e.getContext("2d");
			if (r && r.canvas === e) {
				this._ensureLoaded(e);
				initCanvas(e, t);
				return r;
			}
			return null;
		},
		releaseContext: function(e) {
			var t = e.canvas;
			if (!t[Ft]) {
				return;
			}
			var r = t[Ft].initial;
			[ "height", "width" ].forEach((function(e) {
				var a = r[e];
				if (Tt.isNullOrUndef(a)) {
					t.removeAttribute(e);
				} else {
					t.setAttribute(e, a);
				}
			}));
			Tt.each(r.style || {}, (function(e, r) {
				t.style[r] = e;
			}));
			t.width = t.width;
			delete t[Ft];
		},
		addEventListener: function(e, t, r) {
			var a = e.canvas;
			if ("resize" === t) {
				addResizeListener(a, r, e);
				return;
			}
			var n = r[Ft] || (r[Ft] = {});
			var i = n.proxies || (n.proxies = {});
			var o = i[e.id + "_" + t] = function(t) {
				r(fromNativeEvent(t, e));
			};
			addListener(a, t, o);
		},
		removeEventListener: function(e, t, r) {
			var a = e.canvas;
			if ("resize" === t) {
				removeResizeListener(a);
				return;
			}
			var n = r[Ft] || {};
			var i = n.proxies || {};
			var o = i[e.id + "_" + t];
			if (!o) {
				return;
			}
			removeListener(a, t, o);
		}
	};
	Tt.addEvent = addListener;
	Tt.removeEvent = removeListener;
	var jt = k.exports;
	var Wt = St;
	var Ht = Vt;
	var Ut = Ht._enabled ? Ht : Wt;
	var qt = jt.extend({
		initialize: function() {},
		acquireContext: function() {},
		releaseContext: function() {},
		addEventListener: function() {},
		removeEventListener: function() {}
	}, Ut);
	var $t = Y;
	var Gt = k.exports;
	$t._set("global", {
		plugins: {}
	});
	var Kt = {
		_plugins: [],
		_cacheId: 0,
		register: function(e) {
			var t = this._plugins;
			[].concat(e).forEach((function(e) {
				if (-1 === t.indexOf(e)) {
					t.push(e);
				}
			}));
			this._cacheId++;
		},
		unregister: function(e) {
			var t = this._plugins;
			[].concat(e).forEach((function(e) {
				var r = t.indexOf(e);
				if (-1 !== r) {
					t.splice(r, 1);
				}
			}));
			this._cacheId++;
		},
		clear: function() {
			this._plugins = [];
			this._cacheId++;
		},
		count: function() {
			return this._plugins.length;
		},
		getAll: function() {
			return this._plugins;
		},
		notify: function(e, t, r) {
			var a = this.descriptors(e);
			var n = a.length;
			var i, o, s, l, u;
			for (i = 0; i < n; ++i) {
				o = a[i];
				s = o.plugin;
				u = s[t];
				if ("function" === typeof u) {
					l = [ e ].concat(r || []);
					l.push(o.options);
					if (false === u.apply(s, l)) {
						return false;
					}
				}
			}
			return true;
		},
		descriptors: function(e) {
			var t = e.$plugins || (e.$plugins = {});
			if (t.id === this._cacheId) {
				return t.descriptors;
			}
			var r = [];
			var a = [];
			var n = e && e.config || {};
			var i = n.options && n.options.plugins || {};
			this._plugins.concat(n.plugins || []).forEach((function(e) {
				var t = r.indexOf(e);
				if (-1 !== t) {
					return;
				}
				var n = e.id;
				var o = i[n];
				if (false === o) {
					return;
				}
				if (true === o) {
					o = Gt.clone($t.global.plugins[n]);
				}
				r.push(e);
				a.push({
					plugin: e,
					options: o || {}
				});
			}));
			t.descriptors = a;
			t.id = this._cacheId;
			return a;
		},
		_invalidate: function(e) {
			delete e.$plugins;
		}
	};
	var Yt = Y;
	var Xt = k.exports;
	var Jt = Mt;
	var Qt = {
		constructors: {},
		defaults: {},
		registerScaleType: function(e, t, r) {
			this.constructors[e] = t;
			this.defaults[e] = Xt.clone(r);
		},
		getScaleConstructor: function(e) {
			return Object.prototype.hasOwnProperty.call(this.constructors, e) ? this.constructors[e] : void 0;
		},
		getScaleDefaults: function(e) {
			return Object.prototype.hasOwnProperty.call(this.defaults, e) ? Xt.merge(Object.create(null), [ Yt.scale, this.defaults[e] ]) : {};
		},
		updateScaleDefaults: function(e, t) {
			var r = this;
			if (Object.prototype.hasOwnProperty.call(r.defaults, e)) {
				r.defaults[e] = Xt.extend(r.defaults[e], t);
			}
		},
		addScalesToLayout: function(e) {
			Xt.each(e.scales, (function(t) {
				t.fullWidth = t.options.fullWidth;
				t.position = t.options.position;
				t.weight = t.options.weight;
				Jt.addBox(e, t);
			}));
		}
	};
	var Zt = Y;
	var er = le;
	var tr = k.exports;
	var rr = tr.valueOrDefault;
	var ar = tr.rtl.getRtlAdapter;
	Zt._set("global", {
		tooltips: {
			enabled: true,
			custom: null,
			mode: "nearest",
			position: "average",
			intersect: true,
			backgroundColor: "rgba(0,0,0,0.8)",
			titleFontStyle: "bold",
			titleSpacing: 2,
			titleMarginBottom: 6,
			titleFontColor: "#fff",
			titleAlign: "left",
			bodySpacing: 2,
			bodyFontColor: "#fff",
			bodyAlign: "left",
			footerFontStyle: "bold",
			footerSpacing: 2,
			footerMarginTop: 6,
			footerFontColor: "#fff",
			footerAlign: "left",
			yPadding: 6,
			xPadding: 6,
			caretPadding: 2,
			caretSize: 5,
			cornerRadius: 6,
			multiKeyBackground: "#fff",
			displayColors: true,
			borderColor: "rgba(0,0,0,0)",
			borderWidth: 0,
			callbacks: {
				beforeTitle: tr.noop,
				title: function(e, t) {
					var r = "";
					var a = t.labels;
					var n = a ? a.length : 0;
					if (e.length > 0) {
						var i = e[0];
						if (i.label) {
							r = i.label;
						} else if (i.xLabel) {
							r = i.xLabel;
						} else if (n > 0 && i.index < n) {
							r = a[i.index];
						}
					}
					return r;
				},
				afterTitle: tr.noop,
				beforeBody: tr.noop,
				beforeLabel: tr.noop,
				label: function(e, t) {
					var r = t.datasets[e.datasetIndex].label || "";
					if (r) {
						r += ": ";
					}
					if (!tr.isNullOrUndef(e.value)) {
						r += e.value;
					} else {
						r += e.yLabel;
					}
					return r;
				},
				labelColor: function(e, t) {
					var r = t.getDatasetMeta(e.datasetIndex);
					var a = r.data[e.index];
					var n = a._view;
					return {
						borderColor: n.borderColor,
						backgroundColor: n.backgroundColor
					};
				},
				labelTextColor: function() {
					return this._options.bodyFontColor;
				},
				afterLabel: tr.noop,
				afterBody: tr.noop,
				beforeFooter: tr.noop,
				footer: tr.noop,
				afterFooter: tr.noop
			}
		}
	});
	var nr = {
		average: function(e) {
			if (!e.length) {
				return false;
			}
			var t, r;
			var a = 0;
			var n = 0;
			var i = 0;
			for (t = 0, r = e.length; t < r; ++t) {
				var o = e[t];
				if (o && o.hasValue()) {
					var s = o.tooltipPosition();
					a += s.x;
					n += s.y;
					++i;
				}
			}
			return {
				x: a / i,
				y: n / i
			};
		},
		nearest: function(e, t) {
			var r = t.x;
			var a = t.y;
			var n = Number.POSITIVE_INFINITY;
			var i, o, s;
			for (i = 0, o = e.length; i < o; ++i) {
				var l = e[i];
				if (l && l.hasValue()) {
					var u = l.getCenterPoint();
					var c = tr.distanceBetweenPoints(t, u);
					if (c < n) {
						n = c;
						s = l;
					}
				}
			}
			if (s) {
				var f = s.tooltipPosition();
				r = f.x;
				a = f.y;
			}
			return {
				x: r,
				y: a
			};
		}
	};
	function pushOrConcat(e, t) {
		if (t) {
			if (tr.isArray(t)) {
				Array.prototype.push.apply(e, t);
			} else {
				e.push(t);
			}
		}
		return e;
	}
	function splitNewlines(e) {
		if (("string" === typeof e || e instanceof String) && e.indexOf("\n") > -1) {
			return e.split("\n");
		}
		return e;
	}
	function createTooltipItem(e) {
		var t = e._xScale;
		var r = e._yScale || e._scale;
		var a = e._index;
		var n = e._datasetIndex;
		var i = e._chart.getDatasetMeta(n).controller;
		var o = i._getIndexScale();
		var s = i._getValueScale();
		return {
			xLabel: t ? t.getLabelForIndex(a, n) : "",
			yLabel: r ? r.getLabelForIndex(a, n) : "",
			label: o ? "" + o.getLabelForIndex(a, n) : "",
			value: s ? "" + s.getLabelForIndex(a, n) : "",
			index: a,
			datasetIndex: n,
			x: e._model.x,
			y: e._model.y
		};
	}
	function getBaseModel(e) {
		var t = Zt.global;
		return {
			xPadding: e.xPadding,
			yPadding: e.yPadding,
			xAlign: e.xAlign,
			yAlign: e.yAlign,
			rtl: e.rtl,
			textDirection: e.textDirection,
			bodyFontColor: e.bodyFontColor,
			_bodyFontFamily: rr(e.bodyFontFamily, t.defaultFontFamily),
			_bodyFontStyle: rr(e.bodyFontStyle, t.defaultFontStyle),
			_bodyAlign: e.bodyAlign,
			bodyFontSize: rr(e.bodyFontSize, t.defaultFontSize),
			bodySpacing: e.bodySpacing,
			titleFontColor: e.titleFontColor,
			_titleFontFamily: rr(e.titleFontFamily, t.defaultFontFamily),
			_titleFontStyle: rr(e.titleFontStyle, t.defaultFontStyle),
			titleFontSize: rr(e.titleFontSize, t.defaultFontSize),
			_titleAlign: e.titleAlign,
			titleSpacing: e.titleSpacing,
			titleMarginBottom: e.titleMarginBottom,
			footerFontColor: e.footerFontColor,
			_footerFontFamily: rr(e.footerFontFamily, t.defaultFontFamily),
			_footerFontStyle: rr(e.footerFontStyle, t.defaultFontStyle),
			footerFontSize: rr(e.footerFontSize, t.defaultFontSize),
			_footerAlign: e.footerAlign,
			footerSpacing: e.footerSpacing,
			footerMarginTop: e.footerMarginTop,
			caretSize: e.caretSize,
			cornerRadius: e.cornerRadius,
			backgroundColor: e.backgroundColor,
			opacity: 0,
			legendColorBackground: e.multiKeyBackground,
			displayColors: e.displayColors,
			borderColor: e.borderColor,
			borderWidth: e.borderWidth
		};
	}
	function getTooltipSize(e, t) {
		var r = e._chart.ctx;
		var a = 2 * t.yPadding;
		var n = 0;
		var i = t.body;
		var o = i.reduce((function(e, t) {
			return e + t.before.length + t.lines.length + t.after.length;
		}), 0);
		o += t.beforeBody.length + t.afterBody.length;
		var s = t.title.length;
		var l = t.footer.length;
		var u = t.titleFontSize;
		var c = t.bodyFontSize;
		var f = t.footerFontSize;
		a += s * u;
		a += s ? (s - 1) * t.titleSpacing : 0;
		a += s ? t.titleMarginBottom : 0;
		a += o * c;
		a += o ? (o - 1) * t.bodySpacing : 0;
		a += l ? t.footerMarginTop : 0;
		a += l * f;
		a += l ? (l - 1) * t.footerSpacing : 0;
		var d = 0;
		var maxLineWidth = function(e) {
			n = Math.max(n, r.measureText(e).width + d);
		};
		r.font = tr.fontString(u, t._titleFontStyle, t._titleFontFamily);
		tr.each(t.title, maxLineWidth);
		r.font = tr.fontString(c, t._bodyFontStyle, t._bodyFontFamily);
		tr.each(t.beforeBody.concat(t.afterBody), maxLineWidth);
		d = t.displayColors ? c + 2 : 0;
		tr.each(i, (function(e) {
			tr.each(e.before, maxLineWidth);
			tr.each(e.lines, maxLineWidth);
			tr.each(e.after, maxLineWidth);
		}));
		d = 0;
		r.font = tr.fontString(f, t._footerFontStyle, t._footerFontFamily);
		tr.each(t.footer, maxLineWidth);
		n += 2 * t.xPadding;
		return {
			width: n,
			height: a
		};
	}
	function determineAlignment(e, t) {
		var r = e._model;
		var a = e._chart;
		var n = e._chart.chartArea;
		var i = "center";
		var o = "center";
		if (r.y < t.height) {
			o = "top";
		} else if (r.y > a.height - t.height) {
			o = "bottom";
		}
		var s, l;
		var u, c;
		var f;
		var d = (n.left + n.right) / 2;
		var h = (n.top + n.bottom) / 2;
		if ("center" === o) {
			s = function(e) {
				return e <= d;
			};
			l = function(e) {
				return e > d;
			};
		} else {
			s = function(e) {
				return e <= t.width / 2;
			};
			l = function(e) {
				return e >= a.width - t.width / 2;
			};
		}
		u = function(e) {
			return e + t.width + r.caretSize + r.caretPadding > a.width;
		};
		c = function(e) {
			return e - t.width - r.caretSize - r.caretPadding < 0;
		};
		f = function(e) {
			return e <= h ? "top" : "bottom";
		};
		if (s(r.x)) {
			i = "left";
			if (u(r.x)) {
				i = "center";
				o = f(r.y);
			}
		} else if (l(r.x)) {
			i = "right";
			if (c(r.x)) {
				i = "center";
				o = f(r.y);
			}
		}
		var v = e._options;
		return {
			xAlign: v.xAlign ? v.xAlign : i,
			yAlign: v.yAlign ? v.yAlign : o
		};
	}
	function getBackgroundPoint(e, t, r, a) {
		var n = e.x;
		var i = e.y;
		var o = e.caretSize;
		var s = e.caretPadding;
		var l = e.cornerRadius;
		var u = r.xAlign;
		var c = r.yAlign;
		var f = o + s;
		var d = l + s;
		if ("right" === u) {
			n -= t.width;
		} else if ("center" === u) {
			n -= t.width / 2;
			if (n + t.width > a.width) {
				n = a.width - t.width;
			}
			if (n < 0) {
				n = 0;
			}
		}
		if ("top" === c) {
			i += f;
		} else if ("bottom" === c) {
			i -= t.height + f;
		} else {
			i -= t.height / 2;
		}
		if ("center" === c) {
			if ("left" === u) {
				n += f;
			} else if ("right" === u) {
				n -= f;
			}
		} else if ("left" === u) {
			n -= d;
		} else if ("right" === u) {
			n += d;
		}
		return {
			x: n,
			y: i
		};
	}
	function getAlignedX(e, t) {
		return "center" === t ? e.x + e.width / 2 : "right" === t ? e.x + e.width - e.xPadding : e.x + e.xPadding;
	}
	function getBeforeAfterBodyLines(e) {
		return pushOrConcat([], splitNewlines(e));
	}
	var ir = er.extend({
		initialize: function() {
			this._model = getBaseModel(this._options);
			this._lastActive = [];
		},
		getTitle: function() {
			var e = this;
			var t = e._options;
			var r = t.callbacks;
			var a = r.beforeTitle.apply(e, arguments);
			var n = r.title.apply(e, arguments);
			var i = r.afterTitle.apply(e, arguments);
			var o = [];
			o = pushOrConcat(o, splitNewlines(a));
			o = pushOrConcat(o, splitNewlines(n));
			o = pushOrConcat(o, splitNewlines(i));
			return o;
		},
		getBeforeBody: function() {
			return getBeforeAfterBodyLines(this._options.callbacks.beforeBody.apply(this, arguments));
		},
		getBody: function(e, t) {
			var r = this;
			var a = r._options.callbacks;
			var n = [];
			tr.each(e, (function(e) {
				var i = {
					before: [],
					lines: [],
					after: []
				};
				pushOrConcat(i.before, splitNewlines(a.beforeLabel.call(r, e, t)));
				pushOrConcat(i.lines, a.label.call(r, e, t));
				pushOrConcat(i.after, splitNewlines(a.afterLabel.call(r, e, t)));
				n.push(i);
			}));
			return n;
		},
		getAfterBody: function() {
			return getBeforeAfterBodyLines(this._options.callbacks.afterBody.apply(this, arguments));
		},
		getFooter: function() {
			var e = this;
			var t = e._options.callbacks;
			var r = t.beforeFooter.apply(e, arguments);
			var a = t.footer.apply(e, arguments);
			var n = t.afterFooter.apply(e, arguments);
			var i = [];
			i = pushOrConcat(i, splitNewlines(r));
			i = pushOrConcat(i, splitNewlines(a));
			i = pushOrConcat(i, splitNewlines(n));
			return i;
		},
		update: function(e) {
			var t = this;
			var r = t._options;
			var a = t._model;
			var n = t._model = getBaseModel(r);
			var i = t._active;
			var o = t._data;
			var s = {
				xAlign: a.xAlign,
				yAlign: a.yAlign
			};
			var l = {
				x: a.x,
				y: a.y
			};
			var u = {
				width: a.width,
				height: a.height
			};
			var c = {
				x: a.caretX,
				y: a.caretY
			};
			var f, d;
			if (i.length) {
				n.opacity = 1;
				var h = [];
				var v = [];
				c = nr[r.position].call(t, i, t._eventPosition);
				var g = [];
				for (f = 0, d = i.length; f < d; ++f) {
					g.push(createTooltipItem(i[f]));
				}
				if (r.filter) {
					g = g.filter((function(e) {
						return r.filter(e, o);
					}));
				}
				if (r.itemSort) {
					g = g.sort((function(e, t) {
						return r.itemSort(e, t, o);
					}));
				}
				tr.each(g, (function(e) {
					h.push(r.callbacks.labelColor.call(t, e, t._chart));
					v.push(r.callbacks.labelTextColor.call(t, e, t._chart));
				}));
				n.title = t.getTitle(g, o);
				n.beforeBody = t.getBeforeBody(g, o);
				n.body = t.getBody(g, o);
				n.afterBody = t.getAfterBody(g, o);
				n.footer = t.getFooter(g, o);
				n.x = c.x;
				n.y = c.y;
				n.caretPadding = r.caretPadding;
				n.labelColors = h;
				n.labelTextColors = v;
				n.dataPoints = g;
				u = getTooltipSize(this, n);
				s = determineAlignment(this, u);
				l = getBackgroundPoint(n, u, s, t._chart);
			} else {
				n.opacity = 0;
			}
			n.xAlign = s.xAlign;
			n.yAlign = s.yAlign;
			n.x = l.x;
			n.y = l.y;
			n.width = u.width;
			n.height = u.height;
			n.caretX = c.x;
			n.caretY = c.y;
			t._model = n;
			if (e && r.custom) {
				r.custom.call(t, n);
			}
			return t;
		},
		drawCaret: function(e, t) {
			var r = this._chart.ctx;
			var a = this._view;
			var n = this.getCaretPosition(e, t, a);
			r.lineTo(n.x1, n.y1);
			r.lineTo(n.x2, n.y2);
			r.lineTo(n.x3, n.y3);
		},
		getCaretPosition: function(e, t, r) {
			var a, n, i, o, s, l;
			var u = r.caretSize;
			var c = r.cornerRadius;
			var f = r.xAlign;
			var d = r.yAlign;
			var h = e.x;
			var v = e.y;
			var g = t.width;
			var p = t.height;
			if ("center" === d) {
				s = v + p / 2;
				if ("left" === f) {
					a = h;
					n = a - u;
					i = a;
					o = s + u;
					l = s - u;
				} else {
					a = h + g;
					n = a + u;
					i = a;
					o = s - u;
					l = s + u;
				}
			} else {
				if ("left" === f) {
					n = h + c + u;
					a = n - u;
					i = n + u;
				} else if ("right" === f) {
					n = h + g - c - u;
					a = n - u;
					i = n + u;
				} else {
					n = r.caretX;
					a = n - u;
					i = n + u;
				}
				if ("top" === d) {
					o = v;
					s = o - u;
					l = o;
				} else {
					o = v + p;
					s = o + u;
					l = o;
					var m = i;
					i = a;
					a = m;
				}
			}
			return {
				x1: a,
				x2: n,
				x3: i,
				y1: o,
				y2: s,
				y3: l
			};
		},
		drawTitle: function(e, t, r) {
			var a = t.title;
			var n = a.length;
			var i, o, s;
			if (n) {
				var l = ar(t.rtl, t.x, t.width);
				e.x = getAlignedX(t, t._titleAlign);
				r.textAlign = l.textAlign(t._titleAlign);
				r.textBaseline = "middle";
				i = t.titleFontSize;
				o = t.titleSpacing;
				r.fillStyle = t.titleFontColor;
				r.font = tr.fontString(i, t._titleFontStyle, t._titleFontFamily);
				for (s = 0; s < n; ++s) {
					r.fillText(a[s], l.x(e.x), e.y + i / 2);
					e.y += i + o;
					if (s + 1 === n) {
						e.y += t.titleMarginBottom - o;
					}
				}
			}
		},
		drawBody: function(e, t, r) {
			var a = t.bodyFontSize;
			var n = t.bodySpacing;
			var i = t._bodyAlign;
			var o = t.body;
			var s = t.displayColors;
			var l = 0;
			var u = s ? getAlignedX(t, "left") : 0;
			var c = ar(t.rtl, t.x, t.width);
			var fillLineOfText = function(t) {
				r.fillText(t, c.x(e.x + l), e.y + a / 2);
				e.y += a + n;
			};
			var f, d, h, v, g, p, m, b;
			var x = c.textAlign(i);
			r.textAlign = i;
			r.textBaseline = "middle";
			r.font = tr.fontString(a, t._bodyFontStyle, t._bodyFontFamily);
			e.x = getAlignedX(t, x);
			r.fillStyle = t.bodyFontColor;
			tr.each(t.beforeBody, fillLineOfText);
			l = s && "right" !== x ? "center" === i ? a / 2 + 1 : a + 2 : 0;
			for (g = 0, m = o.length; g < m; ++g) {
				f = o[g];
				d = t.labelTextColors[g];
				h = t.labelColors[g];
				r.fillStyle = d;
				tr.each(f.before, fillLineOfText);
				v = f.lines;
				for (p = 0, b = v.length; p < b; ++p) {
					if (s) {
						var y = c.x(u);
						r.fillStyle = t.legendColorBackground;
						r.fillRect(c.leftForLtr(y, a), e.y, a, a);
						r.lineWidth = 1;
						r.strokeStyle = h.borderColor;
						r.strokeRect(c.leftForLtr(y, a), e.y, a, a);
						r.fillStyle = h.backgroundColor;
						r.fillRect(c.leftForLtr(c.xPlus(y, 1), a - 2), e.y + 1, a - 2, a - 2);
						r.fillStyle = d;
					}
					fillLineOfText(v[p]);
				}
				tr.each(f.after, fillLineOfText);
			}
			l = 0;
			tr.each(t.afterBody, fillLineOfText);
			e.y -= n;
		},
		drawFooter: function(e, t, r) {
			var a = t.footer;
			var n = a.length;
			var i, o;
			if (n) {
				var s = ar(t.rtl, t.x, t.width);
				e.x = getAlignedX(t, t._footerAlign);
				e.y += t.footerMarginTop;
				r.textAlign = s.textAlign(t._footerAlign);
				r.textBaseline = "middle";
				i = t.footerFontSize;
				r.fillStyle = t.footerFontColor;
				r.font = tr.fontString(i, t._footerFontStyle, t._footerFontFamily);
				for (o = 0; o < n; ++o) {
					r.fillText(a[o], s.x(e.x), e.y + i / 2);
					e.y += i + t.footerSpacing;
				}
			}
		},
		drawBackground: function(e, t, r, a) {
			r.fillStyle = t.backgroundColor;
			r.strokeStyle = t.borderColor;
			r.lineWidth = t.borderWidth;
			var n = t.xAlign;
			var i = t.yAlign;
			var o = e.x;
			var s = e.y;
			var l = a.width;
			var u = a.height;
			var c = t.cornerRadius;
			r.beginPath();
			r.moveTo(o + c, s);
			if ("top" === i) {
				this.drawCaret(e, a);
			}
			r.lineTo(o + l - c, s);
			r.quadraticCurveTo(o + l, s, o + l, s + c);
			if ("center" === i && "right" === n) {
				this.drawCaret(e, a);
			}
			r.lineTo(o + l, s + u - c);
			r.quadraticCurveTo(o + l, s + u, o + l - c, s + u);
			if ("bottom" === i) {
				this.drawCaret(e, a);
			}
			r.lineTo(o + c, s + u);
			r.quadraticCurveTo(o, s + u, o, s + u - c);
			if ("center" === i && "left" === n) {
				this.drawCaret(e, a);
			}
			r.lineTo(o, s + c);
			r.quadraticCurveTo(o, s, o + c, s);
			r.closePath();
			r.fill();
			if (t.borderWidth > 0) {
				r.stroke();
			}
		},
		draw: function() {
			var e = this._chart.ctx;
			var t = this._view;
			if (0 === t.opacity) {
				return;
			}
			var r = {
				width: t.width,
				height: t.height
			};
			var a = {
				x: t.x,
				y: t.y
			};
			var n = Math.abs(t.opacity < .001) ? 0 : t.opacity;
			var i = t.title.length || t.beforeBody.length || t.body.length || t.afterBody.length || t.footer.length;
			if (this._options.enabled && i) {
				e.save();
				e.globalAlpha = n;
				this.drawBackground(a, t, e, r);
				a.y += t.yPadding;
				tr.rtl.overrideTextDirection(e, t.textDirection);
				this.drawTitle(a, t, e);
				this.drawBody(a, t, e);
				this.drawFooter(a, t, e);
				tr.rtl.restoreTextDirection(e, t.textDirection);
				e.restore();
			}
		},
		handleEvent: function(e) {
			var t = this;
			var r = t._options;
			var a = false;
			t._lastActive = t._lastActive || [];
			if ("mouseout" === e.type) {
				t._active = [];
			} else {
				t._active = t._chart.getElementsAtEventForMode(e, r.mode, r);
				if (r.reverse) {
					t._active.reverse();
				}
			}
			a = !tr.arrayEquals(t._active, t._lastActive);
			if (a) {
				t._lastActive = t._active;
				if (r.enabled || r.custom) {
					t._eventPosition = {
						x: e.x,
						y: e.y
					};
					t.update(true);
					t.pivot();
				}
			}
			return a;
		}
	});
	ir.positioners = nr;
	var or = ir;
	var sr = fe;
	var lr = ve;
	var ur = bt;
	var cr = Y;
	var fr = k.exports;
	var dr = yt;
	var hr = Mt;
	var vr = qt;
	var gr = Kt;
	var pr = Qt;
	var mr = or;
	var br = fr.valueOrDefault;
	cr._set("global", {
		elements: {},
		events: [ "mousemove", "mouseout", "click", "touchstart", "touchmove" ],
		hover: {
			onHover: null,
			mode: "nearest",
			intersect: true,
			animationDuration: 400
		},
		onClick: null,
		maintainAspectRatio: true,
		responsive: true,
		responsiveAnimationDuration: 0
	});
	function mergeScaleConfig() {
		return fr.merge(Object.create(null), [].slice.call(arguments), {
			merger: function(e, t, r, a) {
				if ("xAxes" === e || "yAxes" === e) {
					var n = r[e].length;
					var i, o, s;
					if (!t[e]) {
						t[e] = [];
					}
					for (i = 0; i < n; ++i) {
						s = r[e][i];
						o = br(s.type, "xAxes" === e ? "category" : "linear");
						if (i >= t[e].length) {
							t[e].push({});
						}
						if (!t[e][i].type || s.type && s.type !== t[e][i].type) {
							fr.merge(t[e][i], [ pr.getScaleDefaults(o), s ]);
						} else {
							fr.merge(t[e][i], s);
						}
					}
				} else {
					fr._merger(e, t, r, a);
				}
			}
		});
	}
	function mergeConfig() {
		return fr.merge(Object.create(null), [].slice.call(arguments), {
			merger: function(e, t, r, a) {
				var n = t[e] || Object.create(null);
				var i = r[e];
				if ("scales" === e) {
					t[e] = mergeScaleConfig(n, i);
				} else if ("scale" === e) {
					t[e] = fr.merge(n, [ pr.getScaleDefaults(i.type), i ]);
				} else {
					fr._merger(e, t, r, a);
				}
			}
		});
	}
	function initConfig(e) {
		e = e || Object.create(null);
		var t = e.data = e.data || {};
		t.datasets = t.datasets || [];
		t.labels = t.labels || [];
		e.options = mergeConfig(cr.global, cr[e.type], e.options || {});
		return e;
	}
	function updateConfig(e) {
		var t = e.options;
		fr.each(e.scales, (function(t) {
			hr.removeBox(e, t);
		}));
		t = mergeConfig(cr.global, cr[e.config.type], t);
		e.options = e.config.options = t;
		e.ensureScalesHaveIDs();
		e.buildOrUpdateScales();
		e.tooltip._options = t.tooltips;
		e.tooltip.initialize();
	}
	function nextAvailableScaleId(e, t, r) {
		var a;
		var hasId = function(e) {
			return e.id === a;
		};
		do {
			a = t + r++;
		} while (fr.findIndex(e, hasId) >= 0);
		return a;
	}
	function positionIsHorizontal(e) {
		return "top" === e || "bottom" === e;
	}
	function compare2Level(e, t) {
		return function(r, a) {
			return r[e] === a[e] ? r[t] - a[t] : r[e] - a[e];
		};
	}
	var Chart$1 = function(e, t) {
		this.construct(e, t);
		return this;
	};
	fr.extend(Chart$1.prototype, {
		construct: function(e, t) {
			var r = this;
			t = initConfig(t);
			var a = vr.acquireContext(e, t);
			var n = a && a.canvas;
			var i = n && n.height;
			var o = n && n.width;
			r.id = fr.uid();
			r.ctx = a;
			r.canvas = n;
			r.config = t;
			r.width = o;
			r.height = i;
			r.aspectRatio = i ? o / i : null;
			r.options = t.options;
			r._bufferedRender = false;
			r._layers = [];
			r.chart = r;
			r.controller = r;
			Chart$1.instances[r.id] = r;
			Object.defineProperty(r, "data", {
				get: function() {
					return r.config.data;
				},
				set: function(e) {
					r.config.data = e;
				}
			});
			if (!a || !n) {
				console.error("Failed to create chart: can't acquire context from the given item");
				return;
			}
			r.initialize();
			r.update();
		},
		initialize: function() {
			var e = this;
			gr.notify(e, "beforeInit");
			fr.retinaScale(e, e.options.devicePixelRatio);
			e.bindEvents();
			if (e.options.responsive) {
				e.resize(true);
			}
			e.initToolTip();
			gr.notify(e, "afterInit");
			return e;
		},
		clear: function() {
			fr.canvas.clear(this);
			return this;
		},
		stop: function() {
			lr.cancelAnimation(this);
			return this;
		},
		resize: function(e) {
			var t = this;
			var r = t.options;
			var a = t.canvas;
			var n = r.maintainAspectRatio && t.aspectRatio || null;
			var i = Math.max(0, Math.floor(fr.getMaximumWidth(a)));
			var o = Math.max(0, Math.floor(n ? i / n : fr.getMaximumHeight(a)));
			if (t.width === i && t.height === o) {
				return;
			}
			a.width = t.width = i;
			a.height = t.height = o;
			a.style.width = i + "px";
			a.style.height = o + "px";
			fr.retinaScale(t, r.devicePixelRatio);
			if (!e) {
				var s = {
					width: i,
					height: o
				};
				gr.notify(t, "resize", [ s ]);
				if (r.onResize) {
					r.onResize(t, s);
				}
				t.stop();
				t.update({
					duration: r.responsiveAnimationDuration
				});
			}
		},
		ensureScalesHaveIDs: function() {
			var e = this.options;
			var t = e.scales || {};
			var r = e.scale;
			fr.each(t.xAxes, (function(e, r) {
				if (!e.id) {
					e.id = nextAvailableScaleId(t.xAxes, "x-axis-", r);
				}
			}));
			fr.each(t.yAxes, (function(e, r) {
				if (!e.id) {
					e.id = nextAvailableScaleId(t.yAxes, "y-axis-", r);
				}
			}));
			if (r) {
				r.id = r.id || "scale";
			}
		},
		buildOrUpdateScales: function() {
			var e = this;
			var t = e.options;
			var r = e.scales || {};
			var a = [];
			var n = Object.keys(r).reduce((function(e, t) {
				e[t] = false;
				return e;
			}), {});
			if (t.scales) {
				a = a.concat((t.scales.xAxes || []).map((function(e) {
					return {
						options: e,
						dtype: "category",
						dposition: "bottom"
					};
				})), (t.scales.yAxes || []).map((function(e) {
					return {
						options: e,
						dtype: "linear",
						dposition: "left"
					};
				})));
			}
			if (t.scale) {
				a.push({
					options: t.scale,
					dtype: "radialLinear",
					isDefault: true,
					dposition: "chartArea"
				});
			}
			fr.each(a, (function(t) {
				var a = t.options;
				var i = a.id;
				var o = br(a.type, t.dtype);
				if (positionIsHorizontal(a.position) !== positionIsHorizontal(t.dposition)) {
					a.position = t.dposition;
				}
				n[i] = true;
				var s = null;
				if (i in r && r[i].type === o) {
					s = r[i];
					s.options = a;
					s.ctx = e.ctx;
					s.chart = e;
				} else {
					var l = pr.getScaleConstructor(o);
					if (!l) {
						return;
					}
					s = new l({
						id: i,
						type: o,
						options: a,
						ctx: e.ctx,
						chart: e
					});
					r[s.id] = s;
				}
				s.mergeTicksOptions();
				if (t.isDefault) {
					e.scale = s;
				}
			}));
			fr.each(n, (function(e, t) {
				if (!e) {
					delete r[t];
				}
			}));
			e.scales = r;
			pr.addScalesToLayout(this);
		},
		buildOrUpdateControllers: function() {
			var e = this;
			var t = [];
			var r = e.data.datasets;
			var a, n;
			for (a = 0, n = r.length; a < n; a++) {
				var i = r[a];
				var o = e.getDatasetMeta(a);
				var s = i.type || e.config.type;
				if (o.type && o.type !== s) {
					e.destroyDatasetMeta(a);
					o = e.getDatasetMeta(a);
				}
				o.type = s;
				o.order = i.order || 0;
				o.index = a;
				if (o.controller) {
					o.controller.updateIndex(a);
					o.controller.linkScales();
				} else {
					var l = ur[o.type];
					if (void 0 === l) {
						throw new Error('"' + o.type + '" is not a chart type.');
					}
					o.controller = new l(e, a);
					t.push(o.controller);
				}
			}
			return t;
		},
		resetElements: function() {
			var e = this;
			fr.each(e.data.datasets, (function(t, r) {
				e.getDatasetMeta(r).controller.reset();
			}), e);
		},
		reset: function() {
			this.resetElements();
			this.tooltip.initialize();
		},
		update: function(e) {
			var t = this;
			var r, a;
			if (!e || "object" !== typeof e) {
				e = {
					duration: e,
					lazy: arguments[1]
				};
			}
			updateConfig(t);
			gr._invalidate(t);
			if (false === gr.notify(t, "beforeUpdate")) {
				return;
			}
			t.tooltip._data = t.data;
			var n = t.buildOrUpdateControllers();
			for (r = 0, a = t.data.datasets.length; r < a; r++) {
				t.getDatasetMeta(r).controller.buildOrUpdateElements();
			}
			t.updateLayout();
			if (t.options.animation && t.options.animation.duration) {
				fr.each(n, (function(e) {
					e.reset();
				}));
			}
			t.updateDatasets();
			t.tooltip.initialize();
			t.lastActive = [];
			gr.notify(t, "afterUpdate");
			t._layers.sort(compare2Level("z", "_idx"));
			if (t._bufferedRender) {
				t._bufferedRequest = {
					duration: e.duration,
					easing: e.easing,
					lazy: e.lazy
				};
			} else {
				t.render(e);
			}
		},
		updateLayout: function() {
			var e = this;
			if (false === gr.notify(e, "beforeLayout")) {
				return;
			}
			hr.update(this, this.width, this.height);
			e._layers = [];
			fr.each(e.boxes, (function(t) {
				if (t._configure) {
					t._configure();
				}
				e._layers.push.apply(e._layers, t._layers());
			}), e);
			e._layers.forEach((function(e, t) {
				e._idx = t;
			}));
			gr.notify(e, "afterScaleUpdate");
			gr.notify(e, "afterLayout");
		},
		updateDatasets: function() {
			var e = this;
			if (false === gr.notify(e, "beforeDatasetsUpdate")) {
				return;
			}
			for (var t = 0, r = e.data.datasets.length; t < r; ++t) {
				e.updateDataset(t);
			}
			gr.notify(e, "afterDatasetsUpdate");
		},
		updateDataset: function(e) {
			var t = this;
			var r = t.getDatasetMeta(e);
			var a = {
				meta: r,
				index: e
			};
			if (false === gr.notify(t, "beforeDatasetUpdate", [ a ])) {
				return;
			}
			r.controller._update();
			gr.notify(t, "afterDatasetUpdate", [ a ]);
		},
		render: function(e) {
			var t = this;
			if (!e || "object" !== typeof e) {
				e = {
					duration: e,
					lazy: arguments[1]
				};
			}
			var r = t.options.animation;
			var a = br(e.duration, r && r.duration);
			var n = e.lazy;
			if (false === gr.notify(t, "beforeRender")) {
				return;
			}
			var onComplete = function(e) {
				gr.notify(t, "afterRender");
				fr.callback(r && r.onComplete, [ e ], t);
			};
			if (r && a) {
				var i = new sr({
					numSteps: a / 16.66,
					easing: e.easing || r.easing,
					render: function(e, t) {
						var r = fr.easing.effects[t.easing];
						var a = t.currentStep;
						var n = a / t.numSteps;
						e.draw(r(n), n, a);
					},
					onAnimationProgress: r.onProgress,
					onAnimationComplete: onComplete
				});
				lr.addAnimation(t, i, a, n);
			} else {
				t.draw();
				onComplete(new sr({
					numSteps: 0,
					chart: t
				}));
			}
			return t;
		},
		draw: function(e) {
			var t = this;
			var r, a;
			t.clear();
			if (fr.isNullOrUndef(e)) {
				e = 1;
			}
			t.transition(e);
			if (t.width <= 0 || t.height <= 0) {
				return;
			}
			if (false === gr.notify(t, "beforeDraw", [ e ])) {
				return;
			}
			a = t._layers;
			for (r = 0; r < a.length && a[r].z <= 0; ++r) {
				a[r].draw(t.chartArea);
			}
			t.drawDatasets(e);
			for (;r < a.length; ++r) {
				a[r].draw(t.chartArea);
			}
			t._drawTooltip(e);
			gr.notify(t, "afterDraw", [ e ]);
		},
		transition: function(e) {
			var t = this;
			for (var r = 0, a = (t.data.datasets || []).length; r < a; ++r) {
				if (t.isDatasetVisible(r)) {
					t.getDatasetMeta(r).controller.transition(e);
				}
			}
			t.tooltip.transition(e);
		},
		_getSortedDatasetMetas: function(e) {
			var t = this;
			var r = t.data.datasets || [];
			var a = [];
			var n, i;
			for (n = 0, i = r.length; n < i; ++n) {
				if (!e || t.isDatasetVisible(n)) {
					a.push(t.getDatasetMeta(n));
				}
			}
			a.sort(compare2Level("order", "index"));
			return a;
		},
		_getSortedVisibleDatasetMetas: function() {
			return this._getSortedDatasetMetas(true);
		},
		drawDatasets: function(e) {
			var t = this;
			var r, a;
			if (false === gr.notify(t, "beforeDatasetsDraw", [ e ])) {
				return;
			}
			r = t._getSortedVisibleDatasetMetas();
			for (a = r.length - 1; a >= 0; --a) {
				t.drawDataset(r[a], e);
			}
			gr.notify(t, "afterDatasetsDraw", [ e ]);
		},
		drawDataset: function(e, t) {
			var r = this;
			var a = {
				meta: e,
				index: e.index,
				easingValue: t
			};
			if (false === gr.notify(r, "beforeDatasetDraw", [ a ])) {
				return;
			}
			e.controller.draw(t);
			gr.notify(r, "afterDatasetDraw", [ a ]);
		},
		_drawTooltip: function(e) {
			var t = this;
			var r = t.tooltip;
			var a = {
				tooltip: r,
				easingValue: e
			};
			if (false === gr.notify(t, "beforeTooltipDraw", [ a ])) {
				return;
			}
			r.draw();
			gr.notify(t, "afterTooltipDraw", [ a ]);
		},
		getElementAtEvent: function(e) {
			return dr.modes.single(this, e);
		},
		getElementsAtEvent: function(e) {
			return dr.modes.label(this, e, {
				intersect: true
			});
		},
		getElementsAtXAxis: function(e) {
			return dr.modes["x-axis"](this, e, {
				intersect: true
			});
		},
		getElementsAtEventForMode: function(e, t, r) {
			var a = dr.modes[t];
			if ("function" === typeof a) {
				return a(this, e, r);
			}
			return [];
		},
		getDatasetAtEvent: function(e) {
			return dr.modes.dataset(this, e, {
				intersect: true
			});
		},
		getDatasetMeta: function(e) {
			var t = this;
			var r = t.data.datasets[e];
			if (!r._meta) {
				r._meta = {};
			}
			var a = r._meta[t.id];
			if (!a) {
				a = r._meta[t.id] = {
					type: null,
					data: [],
					dataset: null,
					controller: null,
					hidden: null,
					xAxisID: null,
					yAxisID: null,
					order: r.order || 0,
					index: e
				};
			}
			return a;
		},
		getVisibleDatasetCount: function() {
			var e = 0;
			for (var t = 0, r = this.data.datasets.length; t < r; ++t) {
				if (this.isDatasetVisible(t)) {
					e++;
				}
			}
			return e;
		},
		isDatasetVisible: function(e) {
			var t = this.getDatasetMeta(e);
			return "boolean" === typeof t.hidden ? !t.hidden : !this.data.datasets[e].hidden;
		},
		generateLegend: function() {
			return this.options.legendCallback(this);
		},
		destroyDatasetMeta: function(e) {
			var t = this.id;
			var r = this.data.datasets[e];
			var a = r._meta && r._meta[t];
			if (a) {
				a.controller.destroy();
				delete r._meta[t];
			}
		},
		destroy: function() {
			var e = this;
			var t = e.canvas;
			var r, a;
			e.stop();
			for (r = 0, a = e.data.datasets.length; r < a; ++r) {
				e.destroyDatasetMeta(r);
			}
			if (t) {
				e.unbindEvents();
				fr.canvas.clear(e);
				vr.releaseContext(e.ctx);
				e.canvas = null;
				e.ctx = null;
			}
			gr.notify(e, "destroy");
			delete Chart$1.instances[e.id];
		},
		toBase64Image: function() {
			return this.canvas.toDataURL.apply(this.canvas, arguments);
		},
		initToolTip: function() {
			var e = this;
			e.tooltip = new mr({
				_chart: e,
				_chartInstance: e,
				_data: e.data,
				_options: e.options.tooltips
			}, e);
		},
		bindEvents: function() {
			var e = this;
			var t = e._listeners = {};
			var listener = function() {
				e.eventHandler.apply(e, arguments);
			};
			fr.each(e.options.events, (function(r) {
				vr.addEventListener(e, r, listener);
				t[r] = listener;
			}));
			if (e.options.responsive) {
				listener = function() {
					e.resize();
				};
				vr.addEventListener(e, "resize", listener);
				t.resize = listener;
			}
		},
		unbindEvents: function() {
			var e = this;
			var t = e._listeners;
			if (!t) {
				return;
			}
			delete e._listeners;
			fr.each(t, (function(t, r) {
				vr.removeEventListener(e, r, t);
			}));
		},
		updateHoverStyle: function(e, t, r) {
			var a = r ? "set" : "remove";
			var n, i, o;
			for (i = 0, o = e.length; i < o; ++i) {
				n = e[i];
				if (n) {
					this.getDatasetMeta(n._datasetIndex).controller[a + "HoverStyle"](n);
				}
			}
			if ("dataset" === t) {
				this.getDatasetMeta(e[0]._datasetIndex).controller["_" + a + "DatasetHoverStyle"]();
			}
		},
		eventHandler: function(e) {
			var t = this;
			var r = t.tooltip;
			if (false === gr.notify(t, "beforeEvent", [ e ])) {
				return;
			}
			t._bufferedRender = true;
			t._bufferedRequest = null;
			var a = t.handleEvent(e);
			if (r) {
				a = r._start ? r.handleEvent(e) : a | r.handleEvent(e);
			}
			gr.notify(t, "afterEvent", [ e ]);
			var n = t._bufferedRequest;
			if (n) {
				t.render(n);
			} else if (a && !t.animating) {
				t.stop();
				t.render({
					duration: t.options.hover.animationDuration,
					lazy: true
				});
			}
			t._bufferedRender = false;
			t._bufferedRequest = null;
			return t;
		},
		handleEvent: function(e) {
			var t = this;
			var r = t.options || {};
			var a = r.hover;
			var n = false;
			t.lastActive = t.lastActive || [];
			if ("mouseout" === e.type) {
				t.active = [];
			} else {
				t.active = t.getElementsAtEventForMode(e, a.mode, a);
			}
			fr.callback(r.onHover || r.hover.onHover, [ e.native, t.active ], t);
			if ("mouseup" === e.type || "click" === e.type) {
				if (r.onClick) {
					r.onClick.call(t, e.native, t.active);
				}
			}
			if (t.lastActive.length) {
				t.updateHoverStyle(t.lastActive, a.mode, false);
			}
			if (t.active.length && a.mode) {
				t.updateHoverStyle(t.active, a.mode, true);
			}
			n = !fr.arrayEquals(t.active, t.lastActive);
			t.lastActive = t.active;
			return n;
		}
	});
	Chart$1.instances = {};
	var xr = Chart$1;
	Chart$1.Controller = Chart$1;
	Chart$1.types = {};
	fr.configMerge = mergeConfig;
	fr.scaleMerge = mergeScaleConfig;
	var yr = w;
	var _r = Y;
	var wr = k.exports;
	var core_helpers = function() {
		wr.where = function(e, t) {
			if (wr.isArray(e) && Array.prototype.filter) {
				return e.filter(t);
			}
			var r = [];
			wr.each(e, (function(e) {
				if (t(e)) {
					r.push(e);
				}
			}));
			return r;
		};
		wr.findIndex = Array.prototype.findIndex ? function(e, t, r) {
			return e.findIndex(t, r);
		} : function(e, t, r) {
			r = void 0 === r ? e : r;
			for (var a = 0, n = e.length; a < n; ++a) {
				if (t.call(r, e[a], a, e)) {
					return a;
				}
			}
			return -1;
		};
		wr.findNextWhere = function(e, t, r) {
			if (wr.isNullOrUndef(r)) {
				r = -1;
			}
			for (var a = r + 1; a < e.length; a++) {
				var n = e[a];
				if (t(n)) {
					return n;
				}
			}
		};
		wr.findPreviousWhere = function(e, t, r) {
			if (wr.isNullOrUndef(r)) {
				r = e.length;
			}
			for (var a = r - 1; a >= 0; a--) {
				var n = e[a];
				if (t(n)) {
					return n;
				}
			}
		};
		wr.isNumber = function(e) {
			return !isNaN(parseFloat(e)) && isFinite(e);
		};
		wr.almostEquals = function(e, t, r) {
			return Math.abs(e - t) < r;
		};
		wr.almostWhole = function(e, t) {
			var r = Math.round(e);
			return r - t <= e && r + t >= e;
		};
		wr.max = function(e) {
			return e.reduce((function(e, t) {
				if (!isNaN(t)) {
					return Math.max(e, t);
				}
				return e;
			}), Number.NEGATIVE_INFINITY);
		};
		wr.min = function(e) {
			return e.reduce((function(e, t) {
				if (!isNaN(t)) {
					return Math.min(e, t);
				}
				return e;
			}), Number.POSITIVE_INFINITY);
		};
		wr.sign = Math.sign ? function(e) {
			return Math.sign(e);
		} : function(e) {
			e = +e;
			if (0 === e || isNaN(e)) {
				return e;
			}
			return e > 0 ? 1 : -1;
		};
		wr.toRadians = function(e) {
			return e * (Math.PI / 180);
		};
		wr.toDegrees = function(e) {
			return e * (180 / Math.PI);
		};
		wr._decimalPlaces = function(e) {
			if (!wr.isFinite(e)) {
				return;
			}
			var t = 1;
			var r = 0;
			while (Math.round(e * t) / t !== e) {
				t *= 10;
				r++;
			}
			return r;
		};
		wr.getAngleFromPoint = function(e, t) {
			var r = t.x - e.x;
			var a = t.y - e.y;
			var n = Math.sqrt(r * r + a * a);
			var i = Math.atan2(a, r);
			if (i < -.5 * Math.PI) {
				i += 2 * Math.PI;
			}
			return {
				angle: i,
				distance: n
			};
		};
		wr.distanceBetweenPoints = function(e, t) {
			return Math.sqrt(Math.pow(t.x - e.x, 2) + Math.pow(t.y - e.y, 2));
		};
		wr.aliasPixel = function(e) {
			return e % 2 === 0 ? 0 : .5;
		};
		wr._alignPixel = function(e, t, r) {
			var a = e.currentDevicePixelRatio;
			var n = r / 2;
			return Math.round((t - n) * a) / a + n;
		};
		wr.splineCurve = function(e, t, r, a) {
			var n = e.skip ? t : e;
			var i = t;
			var o = r.skip ? t : r;
			var s = Math.sqrt(Math.pow(i.x - n.x, 2) + Math.pow(i.y - n.y, 2));
			var l = Math.sqrt(Math.pow(o.x - i.x, 2) + Math.pow(o.y - i.y, 2));
			var u = s / (s + l);
			var c = l / (s + l);
			u = isNaN(u) ? 0 : u;
			c = isNaN(c) ? 0 : c;
			var f = a * u;
			var d = a * c;
			return {
				previous: {
					x: i.x - f * (o.x - n.x),
					y: i.y - f * (o.y - n.y)
				},
				next: {
					x: i.x + d * (o.x - n.x),
					y: i.y + d * (o.y - n.y)
				}
			};
		};
		wr.EPSILON = Number.EPSILON || 1e-14;
		wr.splineCurveMonotone = function(e) {
			var t = (e || []).map((function(e) {
				return {
					model: e._model,
					deltaK: 0,
					mK: 0
				};
			}));
			var r = t.length;
			var a, n, i, o;
			for (a = 0; a < r; ++a) {
				i = t[a];
				if (i.model.skip) {
					continue;
				}
				n = a > 0 ? t[a - 1] : null;
				o = a < r - 1 ? t[a + 1] : null;
				if (o && !o.model.skip) {
					var s = o.model.x - i.model.x;
					i.deltaK = 0 !== s ? (o.model.y - i.model.y) / s : 0;
				}
				if (!n || n.model.skip) {
					i.mK = i.deltaK;
				} else if (!o || o.model.skip) {
					i.mK = n.deltaK;
				} else if (this.sign(n.deltaK) !== this.sign(i.deltaK)) {
					i.mK = 0;
				} else {
					i.mK = (n.deltaK + i.deltaK) / 2;
				}
			}
			var l, u, c, f;
			for (a = 0; a < r - 1; ++a) {
				i = t[a];
				o = t[a + 1];
				if (i.model.skip || o.model.skip) {
					continue;
				}
				if (wr.almostEquals(i.deltaK, 0, this.EPSILON)) {
					i.mK = o.mK = 0;
					continue;
				}
				l = i.mK / i.deltaK;
				u = o.mK / i.deltaK;
				f = Math.pow(l, 2) + Math.pow(u, 2);
				if (f <= 9) {
					continue;
				}
				c = 3 / Math.sqrt(f);
				i.mK = l * c * i.deltaK;
				o.mK = u * c * i.deltaK;
			}
			var d;
			for (a = 0; a < r; ++a) {
				i = t[a];
				if (i.model.skip) {
					continue;
				}
				n = a > 0 ? t[a - 1] : null;
				o = a < r - 1 ? t[a + 1] : null;
				if (n && !n.model.skip) {
					d = (i.model.x - n.model.x) / 3;
					i.model.controlPointPreviousX = i.model.x - d;
					i.model.controlPointPreviousY = i.model.y - d * i.mK;
				}
				if (o && !o.model.skip) {
					d = (o.model.x - i.model.x) / 3;
					i.model.controlPointNextX = i.model.x + d;
					i.model.controlPointNextY = i.model.y + d * i.mK;
				}
			}
		};
		wr.nextItem = function(e, t, r) {
			if (r) {
				return t >= e.length - 1 ? e[0] : e[t + 1];
			}
			return t >= e.length - 1 ? e[e.length - 1] : e[t + 1];
		};
		wr.previousItem = function(e, t, r) {
			if (r) {
				return t <= 0 ? e[e.length - 1] : e[t - 1];
			}
			return t <= 0 ? e[0] : e[t - 1];
		};
		wr.niceNum = function(e, t) {
			var r = Math.floor(wr.log10(e));
			var a = e / Math.pow(10, r);
			var n;
			if (t) {
				if (a < 1.5) {
					n = 1;
				} else if (a < 3) {
					n = 2;
				} else if (a < 7) {
					n = 5;
				} else {
					n = 10;
				}
			} else if (a <= 1) {
				n = 1;
			} else if (a <= 2) {
				n = 2;
			} else if (a <= 5) {
				n = 5;
			} else {
				n = 10;
			}
			return n * Math.pow(10, r);
		};
		wr.requestAnimFrame = function() {
			if ("undefined" === typeof window) {
				return function(e) {
					e();
				};
			}
			return window.requestAnimationFrame || window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame || window.oRequestAnimationFrame || window.msRequestAnimationFrame || function(e) {
				return window.setTimeout(e, 1e3 / 60);
			};
		}();
		wr.getRelativePosition = function(e, t) {
			var r, a;
			var n = e.originalEvent || e;
			var i = e.target || e.srcElement;
			var o = i.getBoundingClientRect();
			var s = n.touches;
			if (s && s.length > 0) {
				r = s[0].clientX;
				a = s[0].clientY;
			} else {
				r = n.clientX;
				a = n.clientY;
			}
			var l = parseFloat(wr.getStyle(i, "padding-left"));
			var u = parseFloat(wr.getStyle(i, "padding-top"));
			var c = parseFloat(wr.getStyle(i, "padding-right"));
			var f = parseFloat(wr.getStyle(i, "padding-bottom"));
			var d = o.right - o.left - l - c;
			var h = o.bottom - o.top - u - f;
			r = Math.round((r - o.left - l) / d * i.width / t.currentDevicePixelRatio);
			a = Math.round((a - o.top - u) / h * i.height / t.currentDevicePixelRatio);
			return {
				x: r,
				y: a
			};
		};
		function parseMaxStyle(e, t, r) {
			var a;
			if ("string" === typeof e) {
				a = parseInt(e, 10);
				if (-1 !== e.indexOf("%")) {
					a = a / 100 * t.parentNode[r];
				}
			} else {
				a = e;
			}
			return a;
		}
		function isConstrainedValue(e) {
			return void 0 !== e && null !== e && "none" !== e;
		}
		function getConstraintDimension(e, t, r) {
			var a = document.defaultView;
			var n = wr._getParentNode(e);
			var i = a.getComputedStyle(e)[t];
			var o = a.getComputedStyle(n)[t];
			var s = isConstrainedValue(i);
			var l = isConstrainedValue(o);
			var u = Number.POSITIVE_INFINITY;
			if (s || l) {
				return Math.min(s ? parseMaxStyle(i, e, r) : u, l ? parseMaxStyle(o, n, r) : u);
			}
			return "none";
		}
		wr.getConstraintWidth = function(e) {
			return getConstraintDimension(e, "max-width", "clientWidth");
		};
		wr.getConstraintHeight = function(e) {
			return getConstraintDimension(e, "max-height", "clientHeight");
		};
		wr._calculatePadding = function(e, t, r) {
			t = wr.getStyle(e, t);
			return t.indexOf("%") > -1 ? r * parseInt(t, 10) / 100 : parseInt(t, 10);
		};
		wr._getParentNode = function(e) {
			var t = e.parentNode;
			if (t && "[object ShadowRoot]" === t.toString()) {
				t = t.host;
			}
			return t;
		};
		wr.getMaximumWidth = function(e) {
			var t = wr._getParentNode(e);
			if (!t) {
				return e.clientWidth;
			}
			var r = t.clientWidth;
			var a = wr._calculatePadding(t, "padding-left", r);
			var n = wr._calculatePadding(t, "padding-right", r);
			var i = r - a - n;
			var o = wr.getConstraintWidth(e);
			return isNaN(o) ? i : Math.min(i, o);
		};
		wr.getMaximumHeight = function(e) {
			var t = wr._getParentNode(e);
			if (!t) {
				return e.clientHeight;
			}
			var r = t.clientHeight;
			var a = wr._calculatePadding(t, "padding-top", r);
			var n = wr._calculatePadding(t, "padding-bottom", r);
			var i = r - a - n;
			var o = wr.getConstraintHeight(e);
			return isNaN(o) ? i : Math.min(i, o);
		};
		wr.getStyle = function(e, t) {
			return e.currentStyle ? e.currentStyle[t] : document.defaultView.getComputedStyle(e, null).getPropertyValue(t);
		};
		wr.retinaScale = function(e, t) {
			var r = e.currentDevicePixelRatio = t || "undefined" !== typeof window && window.devicePixelRatio || 1;
			if (1 === r) {
				return;
			}
			var a = e.canvas;
			var n = e.height;
			var i = e.width;
			a.height = n * r;
			a.width = i * r;
			e.ctx.scale(r, r);
			if (!a.style.height && !a.style.width) {
				a.style.height = n + "px";
				a.style.width = i + "px";
			}
		};
		wr.fontString = function(e, t, r) {
			return t + " " + e + "px " + r;
		};
		wr.longestText = function(e, t, r, a) {
			a = a || {};
			var n = a.data = a.data || {};
			var i = a.garbageCollect = a.garbageCollect || [];
			if (a.font !== t) {
				n = a.data = {};
				i = a.garbageCollect = [];
				a.font = t;
			}
			e.font = t;
			var o = 0;
			var s = r.length;
			var l, u, c, f, d;
			for (l = 0; l < s; l++) {
				f = r[l];
				if (void 0 !== f && null !== f && true !== wr.isArray(f)) {
					o = wr.measureText(e, n, i, o, f);
				} else if (wr.isArray(f)) {
					for (u = 0, c = f.length; u < c; u++) {
						d = f[u];
						if (void 0 !== d && null !== d && !wr.isArray(d)) {
							o = wr.measureText(e, n, i, o, d);
						}
					}
				}
			}
			var h = i.length / 2;
			if (h > r.length) {
				for (l = 0; l < h; l++) {
					delete n[i[l]];
				}
				i.splice(0, h);
			}
			return o;
		};
		wr.measureText = function(e, t, r, a, n) {
			var i = t[n];
			if (!i) {
				i = t[n] = e.measureText(n).width;
				r.push(n);
			}
			if (i > a) {
				a = i;
			}
			return a;
		};
		wr.numberOfLabelLines = function(e) {
			var t = 1;
			wr.each(e, (function(e) {
				if (wr.isArray(e)) {
					if (e.length > t) {
						t = e.length;
					}
				}
			}));
			return t;
		};
		wr.color = !yr ? function(e) {
			console.error("Color.js not found!");
			return e;
		} : function(e) {
			if (e instanceof CanvasGradient) {
				e = _r.global.defaultColor;
			}
			return yr(e);
		};
		wr.getHoverColor = function(e) {
			return e instanceof CanvasPattern || e instanceof CanvasGradient ? e : wr.color(e).saturate(.5).darken(.1).rgbString();
		};
	};
	var kr = {};
	var Mr = k.exports;
	function abstract() {
		throw new Error("This method is not implemented: either no adapter can be found or an incomplete integration was provided.");
	}
	function DateAdapter(e) {
		this.options = e || {};
	}
	Mr.extend(DateAdapter.prototype, {
		formats: abstract,
		parse: abstract,
		format: abstract,
		add: abstract,
		diff: abstract,
		startOf: abstract,
		endOf: abstract,
		_create: function(e) {
			return e;
		}
	});
	DateAdapter.override = function(e) {
		Mr.extend(DateAdapter.prototype, e);
	};
	kr._date = DateAdapter;
	var Sr = k.exports;
	var Pr = {
		formatters: {
			values: function(e) {
				return Sr.isArray(e) ? e : "" + e;
			},
			linear: function(e, t, r) {
				var a = r.length > 3 ? r[2] - r[1] : r[1] - r[0];
				if (Math.abs(a) > 1) {
					if (e !== Math.floor(e)) {
						a = e - Math.floor(e);
					}
				}
				var n = Sr.log10(Math.abs(a));
				var i = "";
				if (0 !== e) {
					var o = Math.max(Math.abs(r[0]), Math.abs(r[r.length - 1]));
					if (o < 1e-4) {
						var s = Sr.log10(Math.abs(e));
						var l = Math.floor(s) - Math.floor(n);
						l = Math.max(Math.min(l, 20), 0);
						i = e.toExponential(l);
					} else {
						var u = -1 * Math.floor(n);
						u = Math.max(Math.min(u, 20), 0);
						i = e.toFixed(u);
					}
				} else {
					i = "0";
				}
				return i;
			},
			logarithmic: function(e, t, r) {
				var a = e / Math.pow(10, Math.floor(Sr.log10(e)));
				if (0 === e) {
					return "0";
				} else if (1 === a || 2 === a || 5 === a || 0 === t || t === r.length - 1) {
					return e.toExponential();
				}
				return "";
			}
		}
	};
	var Ar = Y;
	var Cr = le;
	var Tr = k.exports;
	var Dr = Pr;
	var Fr = Tr.isArray;
	var Ir = Tr.isNullOrUndef;
	var Lr = Tr.valueOrDefault;
	var Or = Tr.valueAtIndexOrDefault;
	Ar._set("scale", {
		display: true,
		position: "left",
		offset: false,
		gridLines: {
			display: true,
			color: "rgba(0,0,0,0.1)",
			lineWidth: 1,
			drawBorder: true,
			drawOnChartArea: true,
			drawTicks: true,
			tickMarkLength: 10,
			zeroLineWidth: 1,
			zeroLineColor: "rgba(0,0,0,0.25)",
			zeroLineBorderDash: [],
			zeroLineBorderDashOffset: 0,
			offsetGridLines: false,
			borderDash: [],
			borderDashOffset: 0
		},
		scaleLabel: {
			display: false,
			labelString: "",
			padding: {
				top: 4,
				bottom: 4
			}
		},
		ticks: {
			beginAtZero: false,
			minRotation: 0,
			maxRotation: 50,
			mirror: false,
			padding: 0,
			reverse: false,
			display: true,
			autoSkip: true,
			autoSkipPadding: 0,
			labelOffset: 0,
			callback: Dr.formatters.values,
			minor: {},
			major: {}
		}
	});
	function sample(e, t) {
		var r = [];
		var a = e.length / t;
		var n = 0;
		var i = e.length;
		for (;n < i; n += a) {
			r.push(e[Math.floor(n)]);
		}
		return r;
	}
	function getPixelForGridLine(e, t, r) {
		var a = e.getTicks().length;
		var n = Math.min(t, a - 1);
		var i = e.getPixelForTick(n);
		var o = e._startPixel;
		var s = e._endPixel;
		var l = 1e-6;
		var u;
		if (r) {
			if (1 === a) {
				u = Math.max(i - o, s - i);
			} else if (0 === t) {
				u = (e.getPixelForTick(1) - i) / 2;
			} else {
				u = (i - e.getPixelForTick(n - 1)) / 2;
			}
			i += n < t ? u : -u;
			if (i < o - l || i > s + l) {
				return;
			}
		}
		return i;
	}
	function garbageCollect(e, t) {
		Tr.each(e, (function(e) {
			var r = e.gc;
			var a = r.length / 2;
			var n;
			if (a > t) {
				for (n = 0; n < a; ++n) {
					delete e.data[r[n]];
				}
				r.splice(0, a);
			}
		}));
	}
	function computeLabelSizes(e, t, r, a) {
		var n = r.length;
		var i = [];
		var o = [];
		var s = [];
		var l = 0;
		var u = 0;
		var c, f, d, h, v, g, p, m, b, x, y, _, w;
		for (c = 0; c < n; ++c) {
			h = r[c].label;
			v = r[c].major ? t.major : t.minor;
			e.font = g = v.string;
			p = a[g] = a[g] || {
				data: {},
				gc: []
			};
			m = v.lineHeight;
			b = x = 0;
			if (!Ir(h) && !Fr(h)) {
				b = Tr.measureText(e, p.data, p.gc, b, h);
				x = m;
			} else if (Fr(h)) {
				for (f = 0, d = h.length; f < d; ++f) {
					y = h[f];
					if (!Ir(y) && !Fr(y)) {
						b = Tr.measureText(e, p.data, p.gc, b, y);
						x += m;
					}
				}
			}
			i.push(b);
			o.push(x);
			s.push(m / 2);
			l = Math.max(b, l);
			u = Math.max(x, u);
		}
		garbageCollect(a, n);
		_ = i.indexOf(l);
		w = o.indexOf(u);
		function valueAt(e) {
			return {
				width: i[e] || 0,
				height: o[e] || 0,
				offset: s[e] || 0
			};
		}
		return {
			first: valueAt(0),
			last: valueAt(n - 1),
			widest: valueAt(_),
			highest: valueAt(w)
		};
	}
	function getTickMarkLength(e) {
		return e.drawTicks ? e.tickMarkLength : 0;
	}
	function getScaleLabelHeight(e) {
		var t, r;
		if (!e.display) {
			return 0;
		}
		t = Tr.options._parseFont(e);
		r = Tr.options.toPadding(e.padding);
		return t.lineHeight + r.height;
	}
	function parseFontOptions(e, t) {
		return Tr.extend(Tr.options._parseFont({
			fontFamily: Lr(t.fontFamily, e.fontFamily),
			fontSize: Lr(t.fontSize, e.fontSize),
			fontStyle: Lr(t.fontStyle, e.fontStyle),
			lineHeight: Lr(t.lineHeight, e.lineHeight)
		}), {
			color: Tr.options.resolve([ t.fontColor, e.fontColor, Ar.global.defaultFontColor ])
		});
	}
	function parseTickFontOptions(e) {
		var t = parseFontOptions(e, e.minor);
		var r = e.major.enabled ? parseFontOptions(e, e.major) : t;
		return {
			minor: t,
			major: r
		};
	}
	function nonSkipped(e) {
		var t = [];
		var r, a, n;
		for (a = 0, n = e.length; a < n; ++a) {
			r = e[a];
			if ("undefined" !== typeof r._index) {
				t.push(r);
			}
		}
		return t;
	}
	function getEvenSpacing(e) {
		var t = e.length;
		var r, a;
		if (t < 2) {
			return false;
		}
		for (a = e[0], r = 1; r < t; ++r) {
			if (e[r] - e[r - 1] !== a) {
				return false;
			}
		}
		return a;
	}
	function calculateSpacing(e, t, r, a) {
		var n = getEvenSpacing(e);
		var i = (t.length - 1) / a;
		var o, s, l, u;
		if (!n) {
			return Math.max(i, 1);
		}
		o = Tr.math._factorize(n);
		for (l = 0, u = o.length - 1; l < u; l++) {
			s = o[l];
			if (s > i) {
				return s;
			}
		}
		return Math.max(i, 1);
	}
	function getMajorIndices(e) {
		var t = [];
		var r, a;
		for (r = 0, a = e.length; r < a; r++) {
			if (e[r].major) {
				t.push(r);
			}
		}
		return t;
	}
	function skipMajors(e, t, r) {
		var a = 0;
		var n = t[0];
		var i, o;
		r = Math.ceil(r);
		for (i = 0; i < e.length; i++) {
			o = e[i];
			if (i === n) {
				o._index = i;
				a++;
				n = t[a * r];
			} else {
				delete o.label;
			}
		}
	}
	function skip(e, t, r, a) {
		var n = Lr(r, 0);
		var i = Math.min(Lr(a, e.length), e.length);
		var o = 0;
		var s, l, u, c;
		t = Math.ceil(t);
		if (a) {
			s = a - r;
			t = s / Math.floor(s / t);
		}
		c = n;
		while (c < 0) {
			o++;
			c = Math.round(n + o * t);
		}
		for (l = Math.max(n, 0); l < i; l++) {
			u = e[l];
			if (l === c) {
				u._index = l;
				o++;
				c = Math.round(n + o * t);
			} else {
				delete u.label;
			}
		}
	}
	var zr = Cr.extend({
		zeroLineIndex: 0,
		getPadding: function() {
			var e = this;
			return {
				left: e.paddingLeft || 0,
				top: e.paddingTop || 0,
				right: e.paddingRight || 0,
				bottom: e.paddingBottom || 0
			};
		},
		getTicks: function() {
			return this._ticks;
		},
		_getLabels: function() {
			var e = this.chart.data;
			return this.options.labels || (this.isHorizontal() ? e.xLabels : e.yLabels) || e.labels || [];
		},
		mergeTicksOptions: function() {},
		beforeUpdate: function() {
			Tr.callback(this.options.beforeUpdate, [ this ]);
		},
		update: function(e, t, r) {
			var a = this;
			var n = a.options.ticks;
			var i = n.sampleSize;
			var o, s, l, u, c;
			a.beforeUpdate();
			a.maxWidth = e;
			a.maxHeight = t;
			a.margins = Tr.extend({
				left: 0,
				right: 0,
				top: 0,
				bottom: 0
			}, r);
			a._ticks = null;
			a.ticks = null;
			a._labelSizes = null;
			a._maxLabelLines = 0;
			a.longestLabelWidth = 0;
			a.longestTextCache = a.longestTextCache || {};
			a._gridLineItems = null;
			a._labelItems = null;
			a.beforeSetDimensions();
			a.setDimensions();
			a.afterSetDimensions();
			a.beforeDataLimits();
			a.determineDataLimits();
			a.afterDataLimits();
			a.beforeBuildTicks();
			u = a.buildTicks() || [];
			u = a.afterBuildTicks(u) || u;
			if ((!u || !u.length) && a.ticks) {
				u = [];
				for (o = 0, s = a.ticks.length; o < s; ++o) {
					u.push({
						value: a.ticks[o],
						major: false
					});
				}
			}
			a._ticks = u;
			c = i < u.length;
			l = a._convertTicksToLabels(c ? sample(u, i) : u);
			a._configure();
			a.beforeCalculateTickRotation();
			a.calculateTickRotation();
			a.afterCalculateTickRotation();
			a.beforeFit();
			a.fit();
			a.afterFit();
			a._ticksToDraw = n.display && (n.autoSkip || "auto" === n.source) ? a._autoSkip(u) : u;
			if (c) {
				l = a._convertTicksToLabels(a._ticksToDraw);
			}
			a.ticks = l;
			a.afterUpdate();
			return a.minSize;
		},
		_configure: function() {
			var e = this;
			var t = e.options.ticks.reverse;
			var r, a;
			if (e.isHorizontal()) {
				r = e.left;
				a = e.right;
			} else {
				r = e.top;
				a = e.bottom;
				t = !t;
			}
			e._startPixel = r;
			e._endPixel = a;
			e._reversePixels = t;
			e._length = a - r;
		},
		afterUpdate: function() {
			Tr.callback(this.options.afterUpdate, [ this ]);
		},
		beforeSetDimensions: function() {
			Tr.callback(this.options.beforeSetDimensions, [ this ]);
		},
		setDimensions: function() {
			var e = this;
			if (e.isHorizontal()) {
				e.width = e.maxWidth;
				e.left = 0;
				e.right = e.width;
			} else {
				e.height = e.maxHeight;
				e.top = 0;
				e.bottom = e.height;
			}
			e.paddingLeft = 0;
			e.paddingTop = 0;
			e.paddingRight = 0;
			e.paddingBottom = 0;
		},
		afterSetDimensions: function() {
			Tr.callback(this.options.afterSetDimensions, [ this ]);
		},
		beforeDataLimits: function() {
			Tr.callback(this.options.beforeDataLimits, [ this ]);
		},
		determineDataLimits: Tr.noop,
		afterDataLimits: function() {
			Tr.callback(this.options.afterDataLimits, [ this ]);
		},
		beforeBuildTicks: function() {
			Tr.callback(this.options.beforeBuildTicks, [ this ]);
		},
		buildTicks: Tr.noop,
		afterBuildTicks: function(e) {
			var t = this;
			if (Fr(e) && e.length) {
				return Tr.callback(t.options.afterBuildTicks, [ t, e ]);
			}
			t.ticks = Tr.callback(t.options.afterBuildTicks, [ t, t.ticks ]) || t.ticks;
			return e;
		},
		beforeTickToLabelConversion: function() {
			Tr.callback(this.options.beforeTickToLabelConversion, [ this ]);
		},
		convertTicksToLabels: function() {
			var e = this;
			var t = e.options.ticks;
			e.ticks = e.ticks.map(t.userCallback || t.callback, this);
		},
		afterTickToLabelConversion: function() {
			Tr.callback(this.options.afterTickToLabelConversion, [ this ]);
		},
		beforeCalculateTickRotation: function() {
			Tr.callback(this.options.beforeCalculateTickRotation, [ this ]);
		},
		calculateTickRotation: function() {
			var e = this;
			var t = e.options;
			var r = t.ticks;
			var a = e.getTicks().length;
			var n = r.minRotation || 0;
			var i = r.maxRotation;
			var o = n;
			var s, l, u, c, f, d, h;
			if (!e._isVisible() || !r.display || n >= i || a <= 1 || !e.isHorizontal()) {
				e.labelRotation = n;
				return;
			}
			s = e._getLabelSizes();
			l = s.widest.width;
			u = s.highest.height - s.highest.offset;
			c = Math.min(e.maxWidth, e.chart.width - l);
			f = t.offset ? e.maxWidth / a : c / (a - 1);
			if (l + 6 > f) {
				f = c / (a - (t.offset ? .5 : 1));
				d = e.maxHeight - getTickMarkLength(t.gridLines) - r.padding - getScaleLabelHeight(t.scaleLabel);
				h = Math.sqrt(l * l + u * u);
				o = Tr.toDegrees(Math.min(Math.asin(Math.min((s.highest.height + 6) / f, 1)), Math.asin(Math.min(d / h, 1)) - Math.asin(u / h)));
				o = Math.max(n, Math.min(i, o));
			}
			e.labelRotation = o;
		},
		afterCalculateTickRotation: function() {
			Tr.callback(this.options.afterCalculateTickRotation, [ this ]);
		},
		beforeFit: function() {
			Tr.callback(this.options.beforeFit, [ this ]);
		},
		fit: function() {
			var e = this;
			var t = e.minSize = {
				width: 0,
				height: 0
			};
			var r = e.chart;
			var a = e.options;
			var n = a.ticks;
			var i = a.scaleLabel;
			var o = a.gridLines;
			var s = e._isVisible();
			var l = "bottom" === a.position;
			var u = e.isHorizontal();
			if (u) {
				t.width = e.maxWidth;
			} else if (s) {
				t.width = getTickMarkLength(o) + getScaleLabelHeight(i);
			}
			if (!u) {
				t.height = e.maxHeight;
			} else if (s) {
				t.height = getTickMarkLength(o) + getScaleLabelHeight(i);
			}
			if (n.display && s) {
				var c = parseTickFontOptions(n);
				var f = e._getLabelSizes();
				var d = f.first;
				var h = f.last;
				var v = f.widest;
				var g = f.highest;
				var p = .4 * c.minor.lineHeight;
				var m = n.padding;
				if (u) {
					var b = 0 !== e.labelRotation;
					var x = Tr.toRadians(e.labelRotation);
					var y = Math.cos(x);
					var _ = Math.sin(x);
					var w = _ * v.width + y * (g.height - (b ? g.offset : 0)) + (b ? 0 : p);
					t.height = Math.min(e.maxHeight, t.height + w + m);
					var k = e.getPixelForTick(0) - e.left;
					var M = e.right - e.getPixelForTick(e.getTicks().length - 1);
					var S, P;
					if (b) {
						S = l ? y * d.width + _ * d.offset : _ * (d.height - d.offset);
						P = l ? _ * (h.height - h.offset) : y * h.width + _ * h.offset;
					} else {
						S = d.width / 2;
						P = h.width / 2;
					}
					e.paddingLeft = Math.max((S - k) * e.width / (e.width - k), 0) + 3;
					e.paddingRight = Math.max((P - M) * e.width / (e.width - M), 0) + 3;
				} else {
					var A = n.mirror ? 0 : v.width + m + p;
					t.width = Math.min(e.maxWidth, t.width + A);
					e.paddingTop = d.height / 2;
					e.paddingBottom = h.height / 2;
				}
			}
			e.handleMargins();
			if (u) {
				e.width = e._length = r.width - e.margins.left - e.margins.right;
				e.height = t.height;
			} else {
				e.width = t.width;
				e.height = e._length = r.height - e.margins.top - e.margins.bottom;
			}
		},
		handleMargins: function() {
			var e = this;
			if (e.margins) {
				e.margins.left = Math.max(e.paddingLeft, e.margins.left);
				e.margins.top = Math.max(e.paddingTop, e.margins.top);
				e.margins.right = Math.max(e.paddingRight, e.margins.right);
				e.margins.bottom = Math.max(e.paddingBottom, e.margins.bottom);
			}
		},
		afterFit: function() {
			Tr.callback(this.options.afterFit, [ this ]);
		},
		isHorizontal: function() {
			var e = this.options.position;
			return "top" === e || "bottom" === e;
		},
		isFullWidth: function() {
			return this.options.fullWidth;
		},
		getRightValue: function(e) {
			if (Ir(e)) {
				return NaN;
			}
			if (("number" === typeof e || e instanceof Number) && !isFinite(e)) {
				return NaN;
			}
			if (e) {
				if (this.isHorizontal()) {
					if (void 0 !== e.x) {
						return this.getRightValue(e.x);
					}
				} else if (void 0 !== e.y) {
					return this.getRightValue(e.y);
				}
			}
			return e;
		},
		_convertTicksToLabels: function(e) {
			var t = this;
			var r, a, n;
			t.ticks = e.map((function(e) {
				return e.value;
			}));
			t.beforeTickToLabelConversion();
			r = t.convertTicksToLabels(e) || t.ticks;
			t.afterTickToLabelConversion();
			for (a = 0, n = e.length; a < n; ++a) {
				e[a].label = r[a];
			}
			return r;
		},
		_getLabelSizes: function() {
			var e = this;
			var t = e._labelSizes;
			if (!t) {
				e._labelSizes = t = computeLabelSizes(e.ctx, parseTickFontOptions(e.options.ticks), e.getTicks(), e.longestTextCache);
				e.longestLabelWidth = t.widest.width;
			}
			return t;
		},
		_parseValue: function(e) {
			var t, r, a, n;
			if (Fr(e)) {
				t = +this.getRightValue(e[0]);
				r = +this.getRightValue(e[1]);
				a = Math.min(t, r);
				n = Math.max(t, r);
			} else {
				e = +this.getRightValue(e);
				t = void 0;
				r = e;
				a = e;
				n = e;
			}
			return {
				min: a,
				max: n,
				start: t,
				end: r
			};
		},
		_getScaleLabel: function(e) {
			var t = this._parseValue(e);
			if (void 0 !== t.start) {
				return "[" + t.start + ", " + t.end + "]";
			}
			return +this.getRightValue(e);
		},
		getLabelForIndex: Tr.noop,
		getPixelForValue: Tr.noop,
		getValueForPixel: Tr.noop,
		getPixelForTick: function(e) {
			var t = this;
			var r = t.options.offset;
			var a = t._ticks.length;
			var n = 1 / Math.max(a - (r ? 0 : 1), 1);
			return e < 0 || e > a - 1 ? null : t.getPixelForDecimal(e * n + (r ? n / 2 : 0));
		},
		getPixelForDecimal: function(e) {
			var t = this;
			if (t._reversePixels) {
				e = 1 - e;
			}
			return t._startPixel + e * t._length;
		},
		getDecimalForPixel: function(e) {
			var t = (e - this._startPixel) / this._length;
			return this._reversePixels ? 1 - t : t;
		},
		getBasePixel: function() {
			return this.getPixelForValue(this.getBaseValue());
		},
		getBaseValue: function() {
			var e = this;
			var t = e.min;
			var r = e.max;
			return e.beginAtZero ? 0 : t < 0 && r < 0 ? r : t > 0 && r > 0 ? t : 0;
		},
		_autoSkip: function(e) {
			var t = this;
			var r = t.options.ticks;
			var a = t._length;
			var n = r.maxTicksLimit || a / t._tickSize() + 1;
			var i = r.major.enabled ? getMajorIndices(e) : [];
			var o = i.length;
			var s = i[0];
			var l = i[o - 1];
			var u, c, f, d;
			if (o > n) {
				skipMajors(e, i, o / n);
				return nonSkipped(e);
			}
			f = calculateSpacing(i, e, a, n);
			if (o > 0) {
				for (u = 0, c = o - 1; u < c; u++) {
					skip(e, f, i[u], i[u + 1]);
				}
				d = o > 1 ? (l - s) / (o - 1) : null;
				skip(e, f, Tr.isNullOrUndef(d) ? 0 : s - d, s);
				skip(e, f, l, Tr.isNullOrUndef(d) ? e.length : l + d);
				return nonSkipped(e);
			}
			skip(e, f);
			return nonSkipped(e);
		},
		_tickSize: function() {
			var e = this;
			var t = e.options.ticks;
			var r = Tr.toRadians(e.labelRotation);
			var a = Math.abs(Math.cos(r));
			var n = Math.abs(Math.sin(r));
			var i = e._getLabelSizes();
			var o = t.autoSkipPadding || 0;
			var s = i ? i.widest.width + o : 0;
			var l = i ? i.highest.height + o : 0;
			return e.isHorizontal() ? l * a > s * n ? s / a : l / n : l * n < s * a ? l / a : s / n;
		},
		_isVisible: function() {
			var e = this;
			var t = e.chart;
			var r = e.options.display;
			var a, n, i;
			if ("auto" !== r) {
				return !!r;
			}
			for (a = 0, n = t.data.datasets.length; a < n; ++a) {
				if (t.isDatasetVisible(a)) {
					i = t.getDatasetMeta(a);
					if (i.xAxisID === e.id || i.yAxisID === e.id) {
						return true;
					}
				}
			}
			return false;
		},
		_computeGridLineItems: function(e) {
			var t = this;
			var r = t.chart;
			var a = t.options;
			var n = a.gridLines;
			var i = a.position;
			var o = n.offsetGridLines;
			var s = t.isHorizontal();
			var l = t._ticksToDraw;
			var u = l.length + (o ? 1 : 0);
			var c = getTickMarkLength(n);
			var f = [];
			var d = n.drawBorder ? Or(n.lineWidth, 0, 0) : 0;
			var h = d / 2;
			var v = Tr._alignPixel;
			var alignBorderValue = function(e) {
				return v(r, e, d);
			};
			var g, p, m, b, x;
			var y, _, w, k, M, S, P, A, C, T, D, F;
			if ("top" === i) {
				g = alignBorderValue(t.bottom);
				_ = t.bottom - c;
				k = g - h;
				S = alignBorderValue(e.top) + h;
				A = e.bottom;
			} else if ("bottom" === i) {
				g = alignBorderValue(t.top);
				S = e.top;
				A = alignBorderValue(e.bottom) - h;
				_ = g + h;
				k = t.top + c;
			} else if ("left" === i) {
				g = alignBorderValue(t.right);
				y = t.right - c;
				w = g - h;
				M = alignBorderValue(e.left) + h;
				P = e.right;
			} else {
				g = alignBorderValue(t.left);
				M = e.left;
				P = alignBorderValue(e.right) - h;
				y = g + h;
				w = t.left + c;
			}
			for (p = 0; p < u; ++p) {
				m = l[p] || {};
				if (Ir(m.label) && p < l.length) {
					continue;
				}
				if (p === t.zeroLineIndex && a.offset === o) {
					C = n.zeroLineWidth;
					T = n.zeroLineColor;
					D = n.zeroLineBorderDash || [];
					F = n.zeroLineBorderDashOffset || 0;
				} else {
					C = Or(n.lineWidth, p, 1);
					T = Or(n.color, p, "rgba(0,0,0,0.1)");
					D = n.borderDash || [];
					F = n.borderDashOffset || 0;
				}
				b = getPixelForGridLine(t, m._index || p, o);
				if (void 0 === b) {
					continue;
				}
				x = v(r, b, C);
				if (s) {
					y = w = M = P = x;
				} else {
					_ = k = S = A = x;
				}
				f.push({
					tx1: y,
					ty1: _,
					tx2: w,
					ty2: k,
					x1: M,
					y1: S,
					x2: P,
					y2: A,
					width: C,
					color: T,
					borderDash: D,
					borderDashOffset: F
				});
			}
			f.ticksLength = u;
			f.borderValue = g;
			return f;
		},
		_computeLabelItems: function() {
			var e = this;
			var t = e.options;
			var r = t.ticks;
			var a = t.position;
			var n = r.mirror;
			var i = e.isHorizontal();
			var o = e._ticksToDraw;
			var s = parseTickFontOptions(r);
			var l = r.padding;
			var u = getTickMarkLength(t.gridLines);
			var c = -Tr.toRadians(e.labelRotation);
			var f = [];
			var d, h, v, g, p, m, b, x, y, _, w, k;
			if ("top" === a) {
				m = e.bottom - u - l;
				b = !c ? "center" : "left";
			} else if ("bottom" === a) {
				m = e.top + u + l;
				b = !c ? "center" : "right";
			} else if ("left" === a) {
				p = e.right - (n ? 0 : u) - l;
				b = n ? "left" : "right";
			} else {
				p = e.left + (n ? 0 : u) + l;
				b = n ? "right" : "left";
			}
			for (d = 0, h = o.length; d < h; ++d) {
				v = o[d];
				g = v.label;
				if (Ir(g)) {
					continue;
				}
				x = e.getPixelForTick(v._index || d) + r.labelOffset;
				y = v.major ? s.major : s.minor;
				_ = y.lineHeight;
				w = Fr(g) ? g.length : 1;
				if (i) {
					p = x;
					k = "top" === a ? ((!c ? .5 : 1) - w) * _ : (!c ? .5 : 0) * _;
				} else {
					m = x;
					k = (1 - w) * _ / 2;
				}
				f.push({
					x: p,
					y: m,
					rotation: c,
					label: g,
					font: y,
					textOffset: k,
					textAlign: b
				});
			}
			return f;
		},
		_drawGrid: function(e) {
			var t = this;
			var r = t.options.gridLines;
			if (!r.display) {
				return;
			}
			var a = t.ctx;
			var n = t.chart;
			var i = Tr._alignPixel;
			var o = r.drawBorder ? Or(r.lineWidth, 0, 0) : 0;
			var s = t._gridLineItems || (t._gridLineItems = t._computeGridLineItems(e));
			var l, u, c, f, d;
			for (c = 0, f = s.length; c < f; ++c) {
				d = s[c];
				l = d.width;
				u = d.color;
				if (l && u) {
					a.save();
					a.lineWidth = l;
					a.strokeStyle = u;
					if (a.setLineDash) {
						a.setLineDash(d.borderDash);
						a.lineDashOffset = d.borderDashOffset;
					}
					a.beginPath();
					if (r.drawTicks) {
						a.moveTo(d.tx1, d.ty1);
						a.lineTo(d.tx2, d.ty2);
					}
					if (r.drawOnChartArea) {
						a.moveTo(d.x1, d.y1);
						a.lineTo(d.x2, d.y2);
					}
					a.stroke();
					a.restore();
				}
			}
			if (o) {
				var h = o;
				var v = Or(r.lineWidth, s.ticksLength - 1, 1);
				var g = s.borderValue;
				var p, m, b, x;
				if (t.isHorizontal()) {
					p = i(n, t.left, h) - h / 2;
					m = i(n, t.right, v) + v / 2;
					b = x = g;
				} else {
					b = i(n, t.top, h) - h / 2;
					x = i(n, t.bottom, v) + v / 2;
					p = m = g;
				}
				a.lineWidth = o;
				a.strokeStyle = Or(r.color, 0);
				a.beginPath();
				a.moveTo(p, b);
				a.lineTo(m, x);
				a.stroke();
			}
		},
		_drawLabels: function() {
			var e = this;
			var t = e.options.ticks;
			if (!t.display) {
				return;
			}
			var r = e.ctx;
			var a = e._labelItems || (e._labelItems = e._computeLabelItems());
			var n, i, o, s, l, u, c, f;
			for (n = 0, o = a.length; n < o; ++n) {
				l = a[n];
				u = l.font;
				r.save();
				r.translate(l.x, l.y);
				r.rotate(l.rotation);
				r.font = u.string;
				r.fillStyle = u.color;
				r.textBaseline = "middle";
				r.textAlign = l.textAlign;
				c = l.label;
				f = l.textOffset;
				if (Fr(c)) {
					for (i = 0, s = c.length; i < s; ++i) {
						r.fillText("" + c[i], 0, f);
						f += u.lineHeight;
					}
				} else {
					r.fillText(c, 0, f);
				}
				r.restore();
			}
		},
		_drawTitle: function() {
			var e = this;
			var t = e.ctx;
			var r = e.options;
			var a = r.scaleLabel;
			if (!a.display) {
				return;
			}
			var n = Lr(a.fontColor, Ar.global.defaultFontColor);
			var i = Tr.options._parseFont(a);
			var o = Tr.options.toPadding(a.padding);
			var s = i.lineHeight / 2;
			var l = r.position;
			var u = 0;
			var c, f;
			if (e.isHorizontal()) {
				c = e.left + e.width / 2;
				f = "bottom" === l ? e.bottom - s - o.bottom : e.top + s + o.top;
			} else {
				var d = "left" === l;
				c = d ? e.left + s + o.top : e.right - s - o.top;
				f = e.top + e.height / 2;
				u = d ? -.5 * Math.PI : .5 * Math.PI;
			}
			t.save();
			t.translate(c, f);
			t.rotate(u);
			t.textAlign = "center";
			t.textBaseline = "middle";
			t.fillStyle = n;
			t.font = i.string;
			t.fillText(a.labelString, 0, 0);
			t.restore();
		},
		draw: function(e) {
			var t = this;
			if (!t._isVisible()) {
				return;
			}
			t._drawGrid(e);
			t._drawTitle();
			t._drawLabels();
		},
		_layers: function() {
			var e = this;
			var t = e.options;
			var r = t.ticks && t.ticks.z || 0;
			var a = t.gridLines && t.gridLines.z || 0;
			if (!e._isVisible() || r === a || e.draw !== e._draw) {
				return [ {
					z: r,
					draw: function() {
						e.draw.apply(e, arguments);
					}
				} ];
			}
			return [ {
				z: a,
				draw: function() {
					e._drawGrid.apply(e, arguments);
					e._drawTitle.apply(e, arguments);
				}
			}, {
				z: r,
				draw: function() {
					e._drawLabels.apply(e, arguments);
				}
			} ];
		},
		_getMatchingVisibleMetas: function(e) {
			var t = this;
			var r = t.isHorizontal();
			return t.chart._getSortedVisibleDatasetMetas().filter((function(a) {
				return (!e || a.type === e) && (r ? a.xAxisID === t.id : a.yAxisID === t.id);
			}));
		}
	});
	zr.prototype._draw = zr.prototype.draw;
	var Br = zr;
	var Rr = {
		exports: {}
	};
	var Nr = k.exports;
	var Er = Br;
	var Vr = Nr.noop;
	var jr = Nr.isNullOrUndef;
	function generateTicks(e, t) {
		var r = [];
		var a = 1e-14;
		var n = e.stepSize;
		var i = n || 1;
		var o = e.maxTicks - 1;
		var s = e.min;
		var l = e.max;
		var u = e.precision;
		var c = t.min;
		var f = t.max;
		var d = Nr.niceNum((f - c) / o / i) * i;
		var h, v, g, p;
		if (d < a && jr(s) && jr(l)) {
			return [ c, f ];
		}
		p = Math.ceil(f / d) - Math.floor(c / d);
		if (p > o) {
			d = Nr.niceNum(p * d / o / i) * i;
		}
		if (n || jr(u)) {
			h = Math.pow(10, Nr._decimalPlaces(d));
		} else {
			h = Math.pow(10, u);
			d = Math.ceil(d * h) / h;
		}
		v = Math.floor(c / d) * d;
		g = Math.ceil(f / d) * d;
		if (n) {
			if (!jr(s) && Nr.almostWhole(s / d, d / 1e3)) {
				v = s;
			}
			if (!jr(l) && Nr.almostWhole(l / d, d / 1e3)) {
				g = l;
			}
		}
		p = (g - v) / d;
		if (Nr.almostEquals(p, Math.round(p), d / 1e3)) {
			p = Math.round(p);
		} else {
			p = Math.ceil(p);
		}
		v = Math.round(v * h) / h;
		g = Math.round(g * h) / h;
		r.push(jr(s) ? v : s);
		for (var m = 1; m < p; ++m) {
			r.push(Math.round((v + m * d) * h) / h);
		}
		r.push(jr(l) ? g : l);
		return r;
	}
	var Wr = Er.extend({
		getRightValue: function(e) {
			if ("string" === typeof e) {
				return +e;
			}
			return Er.prototype.getRightValue.call(this, e);
		},
		handleTickRangeOptions: function() {
			var e = this;
			var t = e.options;
			var r = t.ticks;
			if (r.beginAtZero) {
				var a = Nr.sign(e.min);
				var n = Nr.sign(e.max);
				if (a < 0 && n < 0) {
					e.max = 0;
				} else if (a > 0 && n > 0) {
					e.min = 0;
				}
			}
			var i = void 0 !== r.min || void 0 !== r.suggestedMin;
			var o = void 0 !== r.max || void 0 !== r.suggestedMax;
			if (void 0 !== r.min) {
				e.min = r.min;
			} else if (void 0 !== r.suggestedMin) {
				if (null === e.min) {
					e.min = r.suggestedMin;
				} else {
					e.min = Math.min(e.min, r.suggestedMin);
				}
			}
			if (void 0 !== r.max) {
				e.max = r.max;
			} else if (void 0 !== r.suggestedMax) {
				if (null === e.max) {
					e.max = r.suggestedMax;
				} else {
					e.max = Math.max(e.max, r.suggestedMax);
				}
			}
			if (i !== o) {
				if (e.min >= e.max) {
					if (i) {
						e.max = e.min + 1;
					} else {
						e.min = e.max - 1;
					}
				}
			}
			if (e.min === e.max) {
				e.max++;
				if (!r.beginAtZero) {
					e.min--;
				}
			}
		},
		getTickLimit: function() {
			var e = this;
			var t = e.options.ticks;
			var r = t.stepSize;
			var a = t.maxTicksLimit;
			var n;
			if (r) {
				n = Math.ceil(e.max / r) - Math.floor(e.min / r) + 1;
			} else {
				n = e._computeTickLimit();
				a = a || 11;
			}
			if (a) {
				n = Math.min(a, n);
			}
			return n;
		},
		_computeTickLimit: function() {
			return Number.POSITIVE_INFINITY;
		},
		handleDirectionalChanges: Vr,
		buildTicks: function() {
			var e = this;
			var t = e.options;
			var r = t.ticks;
			var a = e.getTickLimit();
			a = Math.max(2, a);
			var n = {
				maxTicks: a,
				min: r.min,
				max: r.max,
				precision: r.precision,
				stepSize: Nr.valueOrDefault(r.fixedStepSize, r.stepSize)
			};
			var i = e.ticks = generateTicks(n, e);
			e.handleDirectionalChanges();
			e.max = Nr.max(i);
			e.min = Nr.min(i);
			if (r.reverse) {
				i.reverse();
				e.start = e.max;
				e.end = e.min;
			} else {
				e.start = e.min;
				e.end = e.max;
			}
		},
		convertTicksToLabels: function() {
			var e = this;
			e.ticksAsNumbers = e.ticks.slice();
			e.zeroLineIndex = e.ticks.indexOf(0);
			Er.prototype.convertTicksToLabels.call(e);
		},
		_configure: function() {
			var e = this;
			var t = e.getTicks();
			var r = e.min;
			var a = e.max;
			var n;
			Er.prototype._configure.call(e);
			if (e.options.offset && t.length) {
				n = (a - r) / Math.max(t.length - 1, 1) / 2;
				r -= n;
				a += n;
			}
			e._startValue = r;
			e._endValue = a;
			e._valueRange = a - r;
		}
	});
	var Hr = k.exports;
	var Ur = Wr;
	var qr = Pr;
	var $r = {
		position: "left",
		ticks: {
			callback: qr.formatters.linear
		}
	};
	var Gr = 0;
	var Kr = 1;
	function getOrCreateStack(e, t, r) {
		var a = [ r.type, void 0 === t && void 0 === r.stack ? r.index : "", r.stack ].join(".");
		if (void 0 === e[a]) {
			e[a] = {
				pos: [],
				neg: []
			};
		}
		return e[a];
	}
	function stackData(e, t, r, a) {
		var n = e.options;
		var i = n.stacked;
		var o = getOrCreateStack(t, i, r);
		var s = o.pos;
		var l = o.neg;
		var u = a.length;
		var c, f;
		for (c = 0; c < u; ++c) {
			f = e._parseValue(a[c]);
			if (isNaN(f.min) || isNaN(f.max) || r.data[c].hidden) {
				continue;
			}
			s[c] = s[c] || 0;
			l[c] = l[c] || 0;
			if (n.relativePoints) {
				s[c] = 100;
			} else if (f.min < 0 || f.max < 0) {
				l[c] += f.min;
			} else {
				s[c] += f.max;
			}
		}
	}
	function updateMinMax(e, t, r) {
		var a = r.length;
		var n, i;
		for (n = 0; n < a; ++n) {
			i = e._parseValue(r[n]);
			if (isNaN(i.min) || isNaN(i.max) || t.data[n].hidden) {
				continue;
			}
			e.min = Math.min(e.min, i.min);
			e.max = Math.max(e.max, i.max);
		}
	}
	Rr.exports = Ur.extend({
		determineDataLimits: function() {
			var e = this;
			var t = e.options;
			var r = e.chart;
			var a = r.data.datasets;
			var n = e._getMatchingVisibleMetas();
			var i = t.stacked;
			var o = {};
			var s = n.length;
			var l, u, c, f;
			e.min = Number.POSITIVE_INFINITY;
			e.max = Number.NEGATIVE_INFINITY;
			if (void 0 === i) {
				for (l = 0; !i && l < s; ++l) {
					u = n[l];
					i = void 0 !== u.stack;
				}
			}
			for (l = 0; l < s; ++l) {
				u = n[l];
				c = a[u.index].data;
				if (i) {
					stackData(e, o, u, c);
				} else {
					updateMinMax(e, u, c);
				}
			}
			Hr.each(o, (function(t) {
				f = t.pos.concat(t.neg);
				e.min = Math.min(e.min, Hr.min(f));
				e.max = Math.max(e.max, Hr.max(f));
			}));
			e.min = Hr.isFinite(e.min) && !isNaN(e.min) ? e.min : Gr;
			e.max = Hr.isFinite(e.max) && !isNaN(e.max) ? e.max : Kr;
			e.handleTickRangeOptions();
		},
		_computeTickLimit: function() {
			var e = this;
			var t;
			if (e.isHorizontal()) {
				return Math.ceil(e.width / 40);
			}
			t = Hr.options._parseFont(e.options.ticks);
			return Math.ceil(e.height / t.lineHeight);
		},
		handleDirectionalChanges: function() {
			if (!this.isHorizontal()) {
				this.ticks.reverse();
			}
		},
		getLabelForIndex: function(e, t) {
			return this._getScaleLabel(this.chart.data.datasets[t].data[e]);
		},
		getPixelForValue: function(e) {
			var t = this;
			return t.getPixelForDecimal((+t.getRightValue(e) - t._startValue) / t._valueRange);
		},
		getValueForPixel: function(e) {
			return this._startValue + this.getDecimalForPixel(e) * this._valueRange;
		},
		getPixelForTick: function(e) {
			var t = this.ticksAsNumbers;
			if (e < 0 || e > t.length - 1) {
				return null;
			}
			return this.getPixelForValue(t[e]);
		}
	});
	Rr.exports._defaults = $r;
	var Yr = {
		exports: {}
	};
	var Xr = kr;
	var Jr = Y;
	var Qr = k.exports;
	var Zr = Br;
	var ea = Qr._deprecated;
	var ta = Qr.options.resolve;
	var ra = Qr.valueOrDefault;
	var aa = Number.MIN_SAFE_INTEGER || -9007199254740991;
	var na = Number.MAX_SAFE_INTEGER || 9007199254740991;
	var ia = {
		millisecond: {
			common: true,
			size: 1,
			steps: 1e3
		},
		second: {
			common: true,
			size: 1e3,
			steps: 60
		},
		minute: {
			common: true,
			size: 6e4,
			steps: 60
		},
		hour: {
			common: true,
			size: 36e5,
			steps: 24
		},
		day: {
			common: true,
			size: 864e5,
			steps: 30
		},
		week: {
			common: false,
			size: 6048e5,
			steps: 4
		},
		month: {
			common: true,
			size: 2628e6,
			steps: 12
		},
		quarter: {
			common: false,
			size: 7884e6,
			steps: 4
		},
		year: {
			common: true,
			size: 3154e7
		}
	};
	var oa = Object.keys(ia);
	function sorter(e, t) {
		return e - t;
	}
	function arrayUnique(e) {
		var t = {};
		var r = [];
		var a, n, i;
		for (a = 0, n = e.length; a < n; ++a) {
			i = e[a];
			if (!t[i]) {
				t[i] = true;
				r.push(i);
			}
		}
		return r;
	}
	function getMin(e) {
		return Qr.valueOrDefault(e.time.min, e.ticks.min);
	}
	function getMax(e) {
		return Qr.valueOrDefault(e.time.max, e.ticks.max);
	}
	function buildLookupTable(e, t, r, a) {
		if ("linear" === a || !e.length) {
			return [ {
				time: t,
				pos: 0
			}, {
				time: r,
				pos: 1
			} ];
		}
		var n = [];
		var i = [ t ];
		var o, s, l, u, c;
		for (o = 0, s = e.length; o < s; ++o) {
			u = e[o];
			if (u > t && u < r) {
				i.push(u);
			}
		}
		i.push(r);
		for (o = 0, s = i.length; o < s; ++o) {
			c = i[o + 1];
			l = i[o - 1];
			u = i[o];
			if (void 0 === l || void 0 === c || Math.round((c + l) / 2) !== u) {
				n.push({
					time: u,
					pos: o / (s - 1)
				});
			}
		}
		return n;
	}
	function lookup(e, t, r) {
		var a = 0;
		var n = e.length - 1;
		var i, o, s;
		while (a >= 0 && a <= n) {
			i = a + n >> 1;
			o = e[i - 1] || null;
			s = e[i];
			if (!o) {
				return {
					lo: null,
					hi: s
				};
			} else if (s[t] < r) {
				a = i + 1;
			} else if (o[t] > r) {
				n = i - 1;
			} else {
				return {
					lo: o,
					hi: s
				};
			}
		}
		return {
			lo: s,
			hi: null
		};
	}
	function interpolate(e, t, r, a) {
		var n = lookup(e, t, r);
		var i = !n.lo ? e[0] : !n.hi ? e[e.length - 2] : n.lo;
		var o = !n.lo ? e[1] : !n.hi ? e[e.length - 1] : n.hi;
		var s = o[t] - i[t];
		var l = s ? (r - i[t]) / s : 0;
		var u = (o[a] - i[a]) * l;
		return i[a] + u;
	}
	function toTimestamp(e, t) {
		var r = e._adapter;
		var a = e.options.time;
		var n = a.parser;
		var i = n || a.format;
		var o = t;
		if ("function" === typeof n) {
			o = n(o);
		}
		if (!Qr.isFinite(o)) {
			o = "string" === typeof i ? r.parse(o, i) : r.parse(o);
		}
		if (null !== o) {
			return +o;
		}
		if (!n && "function" === typeof i) {
			o = i(t);
			if (!Qr.isFinite(o)) {
				o = r.parse(o);
			}
		}
		return o;
	}
	function parse(e, t) {
		if (Qr.isNullOrUndef(t)) {
			return null;
		}
		var r = e.options.time;
		var a = toTimestamp(e, e.getRightValue(t));
		if (null === a) {
			return a;
		}
		if (r.round) {
			a = +e._adapter.startOf(a, r.round);
		}
		return a;
	}
	function determineUnitForAutoTicks(e, t, r, a) {
		var n = oa.length;
		var i, o, s;
		for (i = oa.indexOf(e); i < n - 1; ++i) {
			o = ia[oa[i]];
			s = o.steps ? o.steps : na;
			if (o.common && Math.ceil((r - t) / (s * o.size)) <= a) {
				return oa[i];
			}
		}
		return oa[n - 1];
	}
	function determineUnitForFormatting(e, t, r, a, n) {
		var i, o;
		for (i = oa.length - 1; i >= oa.indexOf(r); i--) {
			o = oa[i];
			if (ia[o].common && e._adapter.diff(n, a, o) >= t - 1) {
				return o;
			}
		}
		return oa[r ? oa.indexOf(r) : 0];
	}
	function determineMajorUnit(e) {
		for (var t = oa.indexOf(e) + 1, r = oa.length; t < r; ++t) {
			if (ia[oa[t]].common) {
				return oa[t];
			}
		}
	}
	function generate(e, t, r, a) {
		var n = e._adapter;
		var i = e.options;
		var o = i.time;
		var s = o.unit || determineUnitForAutoTicks(o.minUnit, t, r, a);
		var l = ta([ o.stepSize, o.unitStepSize, 1 ]);
		var u = "week" === s ? o.isoWeekday : false;
		var c = t;
		var f = [];
		var d;
		if (u) {
			c = +n.startOf(c, "isoWeek", u);
		}
		c = +n.startOf(c, u ? "day" : s);
		if (n.diff(r, t, s) > 1e5 * l) {
			throw t + " and " + r + " are too far apart with stepSize of " + l + " " + s;
		}
		for (d = c; d < r; d = +n.add(d, l, s)) {
			f.push(d);
		}
		if (d === r || "ticks" === i.bounds) {
			f.push(d);
		}
		return f;
	}
	function computeOffsets(e, t, r, a, n) {
		var i = 0;
		var o = 0;
		var s, l;
		if (n.offset && t.length) {
			s = interpolate(e, "time", t[0], "pos");
			if (1 === t.length) {
				i = 1 - s;
			} else {
				i = (interpolate(e, "time", t[1], "pos") - s) / 2;
			}
			l = interpolate(e, "time", t[t.length - 1], "pos");
			if (1 === t.length) {
				o = l;
			} else {
				o = (l - interpolate(e, "time", t[t.length - 2], "pos")) / 2;
			}
		}
		return {
			start: i,
			end: o,
			factor: 1 / (i + 1 + o)
		};
	}
	function setMajorTicks(e, t, r, a) {
		var n = e._adapter;
		var i = +n.startOf(t[0].value, a);
		var o = t[t.length - 1].value;
		var s, l;
		for (s = i; s <= o; s = +n.add(s, 1, a)) {
			l = r[s];
			if (l >= 0) {
				t[l].major = true;
			}
		}
		return t;
	}
	function ticksFromTimestamps(e, t, r) {
		var a = [];
		var n = {};
		var i = t.length;
		var o, s;
		for (o = 0; o < i; ++o) {
			s = t[o];
			n[s] = o;
			a.push({
				value: s,
				major: false
			});
		}
		return 0 === i || !r ? a : setMajorTicks(e, a, n, r);
	}
	var sa = {
		position: "bottom",
		distribution: "linear",
		bounds: "data",
		adapters: {},
		time: {
			parser: false,
			unit: false,
			round: false,
			displayFormat: false,
			isoWeekday: false,
			minUnit: "millisecond",
			displayFormats: {}
		},
		ticks: {
			autoSkip: false,
			source: "auto",
			major: {
				enabled: false
			}
		}
	};
	Yr.exports = Zr.extend({
		initialize: function() {
			this.mergeTicksOptions();
			Zr.prototype.initialize.call(this);
		},
		update: function() {
			var e = this;
			var t = e.options;
			var r = t.time || (t.time = {});
			var a = e._adapter = new Xr._date(t.adapters.date);
			ea("time scale", r.format, "time.format", "time.parser");
			ea("time scale", r.min, "time.min", "ticks.min");
			ea("time scale", r.max, "time.max", "ticks.max");
			Qr.mergeIf(r.displayFormats, a.formats());
			return Zr.prototype.update.apply(e, arguments);
		},
		getRightValue: function(e) {
			if (e && void 0 !== e.t) {
				e = e.t;
			}
			return Zr.prototype.getRightValue.call(this, e);
		},
		determineDataLimits: function() {
			var e = this;
			var t = e.chart;
			var r = e._adapter;
			var a = e.options;
			var n = a.time.unit || "day";
			var i = na;
			var o = aa;
			var s = [];
			var l = [];
			var u = [];
			var c, f, d, h, v, g, p;
			var m = e._getLabels();
			for (c = 0, d = m.length; c < d; ++c) {
				u.push(parse(e, m[c]));
			}
			for (c = 0, d = (t.data.datasets || []).length; c < d; ++c) {
				if (t.isDatasetVisible(c)) {
					v = t.data.datasets[c].data;
					if (Qr.isObject(v[0])) {
						l[c] = [];
						for (f = 0, h = v.length; f < h; ++f) {
							g = parse(e, v[f]);
							s.push(g);
							l[c][f] = g;
						}
					} else {
						l[c] = u.slice(0);
						if (!p) {
							s = s.concat(u);
							p = true;
						}
					}
				} else {
					l[c] = [];
				}
			}
			if (u.length) {
				i = Math.min(i, u[0]);
				o = Math.max(o, u[u.length - 1]);
			}
			if (s.length) {
				s = d > 1 ? arrayUnique(s).sort(sorter) : s.sort(sorter);
				i = Math.min(i, s[0]);
				o = Math.max(o, s[s.length - 1]);
			}
			i = parse(e, getMin(a)) || i;
			o = parse(e, getMax(a)) || o;
			i = i === na ? +r.startOf(Date.now(), n) : i;
			o = o === aa ? +r.endOf(Date.now(), n) + 1 : o;
			e.min = Math.min(i, o);
			e.max = Math.max(i + 1, o);
			e._table = [];
			e._timestamps = {
				data: s,
				datasets: l,
				labels: u
			};
		},
		buildTicks: function() {
			var e = this;
			var t = e.min;
			var r = e.max;
			var a = e.options;
			var n = a.ticks;
			var i = a.time;
			var o = e._timestamps;
			var s = [];
			var l = e.getLabelCapacity(t);
			var u = n.source;
			var c = a.distribution;
			var f, d, h;
			if ("data" === u || "auto" === u && "series" === c) {
				o = o.data;
			} else if ("labels" === u) {
				o = o.labels;
			} else {
				o = generate(e, t, r, l);
			}
			if ("ticks" === a.bounds && o.length) {
				t = o[0];
				r = o[o.length - 1];
			}
			t = parse(e, getMin(a)) || t;
			r = parse(e, getMax(a)) || r;
			for (f = 0, d = o.length; f < d; ++f) {
				h = o[f];
				if (h >= t && h <= r) {
					s.push(h);
				}
			}
			e.min = t;
			e.max = r;
			e._unit = i.unit || (n.autoSkip ? determineUnitForAutoTicks(i.minUnit, e.min, e.max, l) : determineUnitForFormatting(e, s.length, i.minUnit, e.min, e.max));
			e._majorUnit = !n.major.enabled || "year" === e._unit ? void 0 : determineMajorUnit(e._unit);
			e._table = buildLookupTable(e._timestamps.data, t, r, c);
			e._offsets = computeOffsets(e._table, s, t, r, a);
			if (n.reverse) {
				s.reverse();
			}
			return ticksFromTimestamps(e, s, e._majorUnit);
		},
		getLabelForIndex: function(e, t) {
			var r = this;
			var a = r._adapter;
			var n = r.chart.data;
			var i = r.options.time;
			var o = n.labels && e < n.labels.length ? n.labels[e] : "";
			var s = n.datasets[t].data[e];
			if (Qr.isObject(s)) {
				o = r.getRightValue(s);
			}
			if (i.tooltipFormat) {
				return a.format(toTimestamp(r, o), i.tooltipFormat);
			}
			if ("string" === typeof o) {
				return o;
			}
			return a.format(toTimestamp(r, o), i.displayFormats.datetime);
		},
		tickFormatFunction: function(e, t, r, a) {
			var n = this;
			var i = n._adapter;
			var o = n.options;
			var s = o.time.displayFormats;
			var l = s[n._unit];
			var u = n._majorUnit;
			var c = s[u];
			var f = r[t];
			var d = o.ticks;
			var h = u && c && f && f.major;
			var v = i.format(e, a ? a : h ? c : l);
			var g = h ? d.major : d.minor;
			var p = ta([ g.callback, g.userCallback, d.callback, d.userCallback ]);
			return p ? p(v, t, r) : v;
		},
		convertTicksToLabels: function(e) {
			var t = [];
			var r, a;
			for (r = 0, a = e.length; r < a; ++r) {
				t.push(this.tickFormatFunction(e[r].value, r, e));
			}
			return t;
		},
		getPixelForOffset: function(e) {
			var t = this;
			var r = t._offsets;
			var a = interpolate(t._table, "time", e, "pos");
			return t.getPixelForDecimal((r.start + a) * r.factor);
		},
		getPixelForValue: function(e, t, r) {
			var a = this;
			var n = null;
			if (void 0 !== t && void 0 !== r) {
				n = a._timestamps.datasets[r][t];
			}
			if (null === n) {
				n = parse(a, e);
			}
			if (null !== n) {
				return a.getPixelForOffset(n);
			}
		},
		getPixelForTick: function(e) {
			var t = this.getTicks();
			return e >= 0 && e < t.length ? this.getPixelForOffset(t[e].value) : null;
		},
		getValueForPixel: function(e) {
			var t = this;
			var r = t._offsets;
			var a = t.getDecimalForPixel(e) / r.factor - r.end;
			var n = interpolate(t._table, "pos", a, "time");
			return t._adapter._create(n);
		},
		_getLabelSize: function(e) {
			var t = this;
			var r = t.options.ticks;
			var a = t.ctx.measureText(e).width;
			var n = Qr.toRadians(t.isHorizontal() ? r.maxRotation : r.minRotation);
			var i = Math.cos(n);
			var o = Math.sin(n);
			var s = ra(r.fontSize, Jr.global.defaultFontSize);
			return {
				w: a * i + s * o,
				h: a * o + s * i
			};
		},
		getLabelWidth: function(e) {
			return this._getLabelSize(e).w;
		},
		getLabelCapacity: function(e) {
			var t = this;
			var r = t.options.time;
			var a = r.displayFormats;
			var n = a[r.unit] || a.millisecond;
			var i = t.tickFormatFunction(e, 0, ticksFromTimestamps(t, [ e ], t._majorUnit), n);
			var o = t._getLabelSize(i);
			var s = Math.floor(t.isHorizontal() ? t.width / o.w : t.height / o.h);
			if (t.options.offset) {
				s--;
			}
			return s > 0 ? s : 1;
		}
	});
	Yr.exports._defaults = sa;
	var la = Rr.exports;
	var ua = Yr.exports;
	var ca = {
		linear: la,
		time: ua
	};
	var fa = {
		exports: {}
	};
	const da = Y;
	const {_boundSegment: ha, _boundSegments: va} = ie;
	const {clipArea: ga, unclipArea: pa} = B;
	const {isArray: ma, isFinite: ba, isObject: xa, valueOrDefault: ya} = S;
	const {TAU: _a, _isBetween: wa, _normalizeAngle: ka} = j;
	const Ma = Ee;
	da._set("global", {
		plugins: {
			filler: {
				propagate: true,
				drawTime: "beforeDatasetDraw"
			}
		}
	});
	function getLineByIndex(e, t) {
		const r = e.getDatasetMeta(t);
		const a = r && e.isDatasetVisible(t);
		return a ? r.dataset : null;
	}
	function parseFillOption(e) {
		const t = e._model;
		const r = t.fill;
		let a = ya(r && r.target, r);
		if (void 0 === a) {
			debugger;
			a = !!t.backgroundColor;
		}
		if (false === a || null === a) {
			return false;
		}
		if (true === a) {
			return "origin";
		}
		return a;
	}
	function decodeFill(e, t, r) {
		const a = parseFillOption(e);
		if (xa(a)) {
			return isNaN(a.value) ? false : a;
		}
		let n = parseFloat(a);
		if (ba(n) && Math.floor(n) === n) {
			if ("-" === a[0] || "+" === a[0]) {
				n = t + n;
			}
			if (n === t || n < 0 || n >= r) {
				return false;
			}
			return n;
		}
		return [ "origin", "start", "end", "stack", "shape" ].indexOf(a) >= 0 && a;
	}
	function computeLinearBoundary(e) {
		const {scale: t = {}, fill: r} = e;
		let a = null;
		let n;
		if ("start" === r) {
			a = t.bottom;
		} else if ("end" === r) {
			a = t.top;
		} else if (xa(r)) {
			a = t.getPixelForValue(r.value);
		} else if (t.getBasePixel) {
			a = t.getBasePixel();
		}
		if (ba(a)) {
			n = t.isHorizontal();
			return {
				x: n ? a : null,
				y: n ? null : a
			};
		}
		return null;
	}
	class simpleArc {
		constructor(e) {
			this._model = e;
		}
		pathSegment(e, t, r) {
			const {x: a, y: n, radius: i} = this._model;
			t = t || {
				start: 0,
				end: _a
			};
			e.arc(a, n, i, t.end, t.start, true);
			return !r.bounds;
		}
		interpolate(e) {
			const {x: t, y: r, radius: a} = this._model;
			const n = e.angle;
			return {
				x: t + Math.cos(n) * a,
				y: r + Math.sin(n) * a,
				angle: n
			};
		}
	}
	function computeCircularBoundary(e) {
		const {scale: t, fill: r} = e;
		const a = t.options;
		const n = t.getLabels().length;
		const i = [];
		const o = a.reverse ? t.max : t.min;
		const s = a.reverse ? t.min : t.max;
		let l, u, c;
		if ("start" === r) {
			c = o;
		} else if ("end" === r) {
			c = s;
		} else if (xa(r)) {
			c = r.value;
		} else {
			c = t.getBaseValue();
		}
		if (a.grid.circular) {
			u = t.getPointPositionForValue(0, o);
			return new simpleArc({
				x: u._model.x,
				y: u._model.y,
				radius: t.getDistanceFromCenterForValue(c)
			});
		}
		for (l = 0; l < n; ++l) {
			i.push(t.getPointPositionForValue(l, c));
		}
		return i;
	}
	function computeBoundary(e) {
		const t = e.scale || {};
		if (t.getPointPositionForValue) {
			return computeCircularBoundary(e);
		}
		return computeLinearBoundary(e);
	}
	function findSegmentEnd(e, t, r) {
		for (;t > e; t--) {
			const e = r[t];
			if (!isNaN(e._model.x) && !isNaN(e._model.y)) {
				break;
			}
		}
		return t;
	}
	function pointsFromSegments(e, t) {
		const {x: r = null, y: a = null} = e || {};
		const n = t.getPoints();
		const i = [];
		t.getSegments().forEach((({start: e, end: t}) => {
			t = findSegmentEnd(e, t, n);
			const o = n[e];
			const s = n[t];
			if (null !== a) {
				i.push({
					x: o._model.x,
					y: a
				});
				i.push({
					x: s._model.x,
					y: a
				});
			} else if (null !== r) {
				i.push({
					x: r,
					y: o._model.y
				});
				i.push({
					x: r,
					y: s._model.y
				});
			}
		}));
		return i.map((e => ({
			_model: e
		})));
	}
	function buildStackLine(e) {
		const {scale: t, index: r, line: a} = e;
		const n = [];
		const i = a.getSegments();
		const o = a.getPoints();
		const s = getLinesBelow(t, r);
		s.push(createBoundaryLine({
			x: null,
			y: t.bottom
		}, a));
		for (let e = 0; e < i.length; e++) {
			const t = i[e];
			for (let e = t.start; e <= t.end; e++) {
				addPointsBelow(n, o[e], s);
			}
		}
		return new Ma({
			points: n,
			options: {}
		});
	}
	function getLinesBelow(e, t) {
		const r = [];
		const a = e.getMatchingVisibleMetas("line");
		for (let e = 0; e < a.length; e++) {
			const n = a[e];
			if (n.index === t) {
				break;
			}
			if (!n.hidden) {
				r.unshift(n.dataset);
			}
		}
		return r;
	}
	function addPointsBelow(e, t, r) {
		const a = [];
		for (let n = 0; n < r.length; n++) {
			const i = r[n];
			const {first: o, last: s, point: l} = findPoint(i, t, "x");
			if (!l || o && s) {
				continue;
			}
			if (o) {
				a.unshift(l);
			} else {
				e.push(l);
				if (!s) {
					break;
				}
			}
		}
		e.push(...a);
	}
	function findPoint(e, t, r) {
		const a = e.interpolate(t, r);
		if (!a) {
			return {};
		}
		const n = a[r];
		const i = e.getSegments();
		const o = e.getPoints();
		let s = false;
		let l = false;
		for (let e = 0; e < i.length; e++) {
			const t = i[e];
			const a = o[t.start][r];
			const u = o[t.end][r];
			if (wa(n, a, u)) {
				s = n === a;
				l = n === u;
				break;
			}
		}
		return {
			first: s,
			last: l,
			point: a
		};
	}
	function getTarget(e) {
		const {chart: t, fill: r, line: a} = e;
		if (ba(r)) {
			return getLineByIndex(t, r);
		}
		if ("stack" === r) {
			return buildStackLine(e);
		}
		if ("shape" === r) {
			return true;
		}
		const n = computeBoundary(e);
		if (n instanceof simpleArc) {
			return n;
		}
		return createBoundaryLine(n, a);
	}
	function createBoundaryLine(e, t) {
		let r = [];
		let a = false;
		if (ma(e)) {
			a = true;
			r = e;
		} else {
			r = pointsFromSegments(e, t);
		}
		return r.length ? new Ma({
			points: r,
			options: {
				tension: 0
			},
			_loop: a,
			_fullLoop: a
		}) : null;
	}
	function resolveTarget(e, t, r) {
		const a = e[t];
		let n = a.fill;
		const i = [ t ];
		let o;
		if (!r) {
			return n;
		}
		while (false !== n && -1 === i.indexOf(n)) {
			if (!ba(n)) {
				return n;
			}
			o = e[n];
			if (!o) {
				return false;
			}
			if (o.visible) {
				return n;
			}
			i.push(n);
			n = o.fill;
		}
		return false;
	}
	function _clip(e, t, r) {
		e.beginPath();
		t.path(e);
		e.lineTo(t.last()._model.x, r);
		e.lineTo(t.first()._model.x, r);
		e.closePath();
		e.clip();
	}
	function getBounds(e, t, r, a) {
		if (a) {
			return;
		}
		let n = t._model ? t._model[e] : t[e];
		let i = r._model ? r._model[e] : r[e];
		if ("angle" === e) {
			n = ka(n);
			i = ka(i);
		}
		return {
			property: e,
			start: n,
			end: i
		};
	}
	function _getEdge(e, t, r, a) {
		if (e && t) {
			return a(e[r], t[r]);
		}
		return e ? e[r] : t ? t[r] : 0;
	}
	function _segments(e, t, r) {
		const a = e.getSegments();
		const n = e.getPoints();
		const i = t.getPoints();
		const o = [];
		for (const e of a) {
			let {start: a, end: s} = e;
			s = findSegmentEnd(a, s, n);
			const l = getBounds(r, n[a], n[s], e.loop);
			if (!t.getSegments()) {
				o.push({
					source: e,
					target: l,
					start: n[a],
					end: n[s]
				});
				continue;
			}
			const u = va(t, l);
			for (const t of u) {
				const a = getBounds(r, i[t.start], i[t.end], t.loop);
				const s = ha(e, n, a);
				for (const e of s) {
					o.push({
						source: e,
						target: t,
						start: {
							[r]: _getEdge(l, a, "start", Math.max)
						},
						end: {
							[r]: _getEdge(l, a, "end", Math.min)
						}
					});
				}
			}
		}
		return o;
	}
	function clipBounds(e, t, r) {
		const {top: a, bottom: n} = t.chart.chartArea;
		const {property: i, start: o, end: s} = r || {};
		if ("x" === i) {
			e.beginPath();
			e.rect(o, a, s - o, n - a);
			e.clip();
		}
	}
	function interpolatedLineTo(e, t, r, a) {
		const n = t.interpolate(r, a);
		if (n) {
			e.lineTo(n._model.x, n._model.y);
		}
	}
	function _fill(e, t) {
		const {line: r, target: a, property: n, color: i, scale: o} = t;
		const s = _segments(r, a, n);
		for (const {source: t, target: l, start: u, end: c} of s) {
			const {style: {backgroundColor: s = i} = {}} = t;
			const f = true !== a;
			e.save();
			e.fillStyle = s;
			clipBounds(e, o, f && getBounds(n, u, c));
			e.beginPath();
			const d = !!r.pathSegment(e, t);
			let h;
			if (f) {
				if (d) {
					e.closePath();
				} else {
					interpolatedLineTo(e, a, c, n);
				}
				const t = !!a.pathSegment(e, l, {
					move: d,
					reverse: true
				});
				h = d && t;
				if (!h) {
					interpolatedLineTo(e, a, u, n);
				}
			}
			e.closePath();
			e.fill(h ? "evenodd" : "nonzero");
			e.restore();
		}
	}
	function doFill(e, t) {
		const {line: r, target: a, above: n, below: i, area: o, scale: s} = t;
		const l = r._loop ? "angle" : t.axis;
		e.save();
		if ("x" === l && i !== n) {
			_clip(e, a, o.top);
			_fill(e, {
				line: r,
				target: a,
				color: n,
				scale: s,
				property: l
			});
			e.restore();
			e.save();
			_clip(e, a, o.bottom);
		}
		_fill(e, {
			line: r,
			target: a,
			color: i,
			scale: s,
			property: l
		});
		e.restore();
	}
	function drawfill(e, t, r) {
		const a = getTarget(t);
		const {line: n, scale: i, axis: o} = t;
		const s = n._model;
		const l = s.fill;
		const u = s.backgroundColor;
		const {above: c = u, below: f = u} = l || {};
		if (a && n.getPoints().length) {
			ga(e, r);
			doFill(e, {
				line: n,
				target: a,
				above: c,
				below: f,
				area: r,
				scale: i,
				axis: o
			});
			pa(e);
		}
	}
	var Sa = {
		id: "filler",
		afterDatasetsUpdate(e, t) {
			const r = (e.data.datasets || []).length;
			const a = [];
			let n, i, o, s;
			for (i = 0; i < r; ++i) {
				n = e.getDatasetMeta(i);
				o = n.dataset;
				s = null;
				if (o && o._model && o instanceof Ma) {
					s = {
						visible: e.isDatasetVisible(i),
						index: i,
						fill: decodeFill(o, i, r),
						chart: e,
						axis: "x",
						scale: n.controller.getScaleForId(n.yAxisID),
						line: o
					};
				}
				n.$filler = s;
				a.push(s);
			}
			for (i = 0; i < r; ++i) {
				s = a[i];
				if (!s || false === s.fill) {
					continue;
				}
				s.fill = resolveTarget(a, i, t.propagate);
			}
		},
		beforeDraw(e, t, r) {
			const a = "beforeDraw" === r.drawTime;
			const n = e._getSortedVisibleDatasetMetas();
			const i = e.chartArea;
			for (let t = n.length - 1; t >= 0; --t) {
				const r = n[t].$filler;
				if (!r) {
					continue;
				}
				r.line.updateControlPoints(i, r.axis);
				if (a) {
					drawfill(e.ctx, r, i);
				}
			}
		},
		beforeDatasetsDraw(e, t, r) {
			if ("beforeDatasetsDraw" !== r.drawTime) {
				return;
			}
			debugger;
			const a = e.getSortedVisibleDatasetMetas();
			for (let t = a.length - 1; t >= 0; --t) {
				const r = a[t].$filler;
				if (r) {
					drawfill(e.ctx, r, e.chartArea);
				}
			}
		},
		beforeDatasetDraw(e, t, r) {
			const a = t.meta.$filler;
			if (!a || false === a.fill || "beforeDatasetDraw" !== r.drawTime) {
				return;
			}
			drawfill(e.ctx, a, e.chartArea);
		}
	};
	var Pa = Y;
	var Aa = le;
	var Ca = k.exports;
	var Ta = Mt;
	var Da = Ca.rtl.getRtlAdapter;
	var Fa = Ca.noop;
	var Ia = Ca.valueOrDefault;
	Pa._set("global", {
		legend: {
			display: true,
			position: "top",
			align: "center",
			fullWidth: true,
			reverse: false,
			weight: 1e3,
			onClick: function(e, t) {
				var r = t.datasetIndex;
				var a = this.chart;
				var n = a.getDatasetMeta(r);
				n.hidden = null === n.hidden ? !a.data.datasets[r].hidden : null;
				a.update();
			},
			onHover: null,
			onLeave: null,
			labels: {
				boxWidth: 40,
				padding: 10,
				generateLabels: function(e) {
					var t = e.data.datasets;
					var r = e.options.legend || {};
					var a = r.labels && r.labels.usePointStyle;
					return e._getSortedDatasetMetas().map((function(r) {
						var n = r.controller.getStyle(a ? 0 : void 0);
						return {
							text: t[r.index].label,
							fillStyle: n.backgroundColor,
							hidden: !e.isDatasetVisible(r.index),
							lineCap: n.borderCapStyle,
							lineDash: n.borderDash,
							lineDashOffset: n.borderDashOffset,
							lineJoin: n.borderJoinStyle,
							lineWidth: n.borderWidth,
							strokeStyle: n.borderColor,
							pointStyle: n.pointStyle,
							rotation: n.rotation,
							datasetIndex: r.index
						};
					}), this);
				}
			}
		},
		legendCallback: function(e) {
			var t = document.createElement("ul");
			var r = e.data.datasets;
			var a, n, i, o;
			t.setAttribute("class", e.id + "-legend");
			for (a = 0, n = r.length; a < n; a++) {
				i = t.appendChild(document.createElement("li"));
				o = i.appendChild(document.createElement("span"));
				o.style.backgroundColor = r[a].backgroundColor;
				if (r[a].label) {
					i.appendChild(document.createTextNode(r[a].label));
				}
			}
			return t.outerHTML;
		}
	});
	function getBoxWidth(e, t) {
		return e.usePointStyle && e.boxWidth > t ? t : e.boxWidth;
	}
	var La = Aa.extend({
		initialize: function(e) {
			var t = this;
			Ca.extend(t, e);
			t.legendHitBoxes = [];
			t._hoveredItem = null;
			t.doughnutMode = false;
		},
		beforeUpdate: Fa,
		update: function(e, t, r) {
			var a = this;
			a.beforeUpdate();
			a.maxWidth = e;
			a.maxHeight = t;
			a.margins = r;
			a.beforeSetDimensions();
			a.setDimensions();
			a.afterSetDimensions();
			a.beforeBuildLabels();
			a.buildLabels();
			a.afterBuildLabels();
			a.beforeFit();
			a.fit();
			a.afterFit();
			a.afterUpdate();
			return a.minSize;
		},
		afterUpdate: Fa,
		beforeSetDimensions: Fa,
		setDimensions: function() {
			var e = this;
			if (e.isHorizontal()) {
				e.width = e.maxWidth;
				e.left = 0;
				e.right = e.width;
			} else {
				e.height = e.maxHeight;
				e.top = 0;
				e.bottom = e.height;
			}
			e.paddingLeft = 0;
			e.paddingTop = 0;
			e.paddingRight = 0;
			e.paddingBottom = 0;
			e.minSize = {
				width: 0,
				height: 0
			};
		},
		afterSetDimensions: Fa,
		beforeBuildLabels: Fa,
		buildLabels: function() {
			var e = this;
			var t = e.options.labels || {};
			var r = Ca.callback(t.generateLabels, [ e.chart ], e) || [];
			if (t.filter) {
				r = r.filter((function(r) {
					return t.filter(r, e.chart.data);
				}));
			}
			if (e.options.reverse) {
				r.reverse();
			}
			e.legendItems = r;
		},
		afterBuildLabels: Fa,
		beforeFit: Fa,
		fit: function() {
			var e = this;
			var t = e.options;
			var r = t.labels;
			var a = t.display;
			var n = e.ctx;
			var i = Ca.options._parseFont(r);
			var o = i.size;
			var s = e.legendHitBoxes = [];
			var l = e.minSize;
			var u = e.isHorizontal();
			if (u) {
				l.width = e.maxWidth;
				l.height = a ? 10 : 0;
			} else {
				l.width = a ? 10 : 0;
				l.height = e.maxHeight;
			}
			if (!a) {
				e.width = l.width = e.height = l.height = 0;
				return;
			}
			n.font = i.string;
			if (u) {
				var c = e.lineWidths = [ 0 ];
				var f = 0;
				n.textAlign = "left";
				n.textBaseline = "middle";
				Ca.each(e.legendItems, (function(e, t) {
					var a = getBoxWidth(r, o);
					var i = a + o / 2 + n.measureText(e.text).width;
					if (0 === t || c[c.length - 1] + i + 2 * r.padding > l.width) {
						f += o + r.padding;
						c[c.length - (t > 0 ? 0 : 1)] = 0;
					}
					s[t] = {
						left: 0,
						top: 0,
						width: i,
						height: o
					};
					c[c.length - 1] += i + r.padding;
				}));
				l.height += f;
			} else {
				var d = r.padding;
				var h = e.columnWidths = [];
				var v = e.columnHeights = [];
				var g = r.padding;
				var p = 0;
				var m = 0;
				Ca.each(e.legendItems, (function(e, t) {
					var a = getBoxWidth(r, o);
					var i = a + o / 2 + n.measureText(e.text).width;
					if (t > 0 && m + o + 2 * d > l.height) {
						g += p + r.padding;
						h.push(p);
						v.push(m);
						p = 0;
						m = 0;
					}
					p = Math.max(p, i);
					m += o + d;
					s[t] = {
						left: 0,
						top: 0,
						width: i,
						height: o
					};
				}));
				g += p;
				h.push(p);
				v.push(m);
				l.width += g;
			}
			e.width = l.width;
			e.height = l.height;
		},
		afterFit: Fa,
		isHorizontal: function() {
			return "top" === this.options.position || "bottom" === this.options.position;
		},
		draw: function() {
			var e = this;
			var t = e.options;
			var r = t.labels;
			var a = Pa.global;
			var n = a.defaultColor;
			var i = a.elements.line;
			var o = e.height;
			var s = e.columnHeights;
			var l = e.width;
			var u = e.lineWidths;
			if (!t.display) {
				return;
			}
			var c = Da(t.rtl, e.left, e.minSize.width);
			var f = e.ctx;
			var d = Ia(r.fontColor, a.defaultFontColor);
			var h = Ca.options._parseFont(r);
			var v = h.size;
			var g;
			f.textAlign = c.textAlign("left");
			f.textBaseline = "middle";
			f.lineWidth = .5;
			f.strokeStyle = d;
			f.fillStyle = d;
			f.font = h.string;
			var p = getBoxWidth(r, v);
			var m = e.legendHitBoxes;
			var drawLegendBox = function(e, t, a) {
				if (isNaN(p) || p <= 0) {
					return;
				}
				f.save();
				var o = Ia(a.lineWidth, i.borderWidth);
				f.fillStyle = Ia(a.fillStyle, n);
				f.lineCap = Ia(a.lineCap, i.borderCapStyle);
				f.lineDashOffset = Ia(a.lineDashOffset, i.borderDashOffset);
				f.lineJoin = Ia(a.lineJoin, i.borderJoinStyle);
				f.lineWidth = o;
				f.strokeStyle = Ia(a.strokeStyle, n);
				if (f.setLineDash) {
					f.setLineDash(Ia(a.lineDash, i.borderDash));
				}
				if (r && r.usePointStyle) {
					var s = p * Math.SQRT2 / 2;
					var l = c.xPlus(e, p / 2);
					var u = t + v / 2;
					Ca.canvas.drawPoint(f, a.pointStyle, s, l, u, a.rotation);
				} else {
					f.fillRect(c.leftForLtr(e, p), t, p, v);
					if (0 !== o) {
						f.strokeRect(c.leftForLtr(e, p), t, p, v);
					}
				}
				f.restore();
			};
			var fillText = function(e, t, r, a) {
				var n = v / 2;
				var i = c.xPlus(e, p + n);
				var o = t + n;
				f.fillText(r.text, i, o);
				if (r.hidden) {
					f.beginPath();
					f.lineWidth = 2;
					f.moveTo(i, o);
					f.lineTo(c.xPlus(i, a), o);
					f.stroke();
				}
			};
			var alignmentOffset = function(e, a) {
				switch (t.align) {
				case "start":
					return r.padding;

				case "end":
					return e - a;

				default:
					return (e - a + r.padding) / 2;
				}
			};
			var b = e.isHorizontal();
			if (b) {
				g = {
					x: e.left + alignmentOffset(l, u[0]),
					y: e.top + r.padding,
					line: 0
				};
			} else {
				g = {
					x: e.left + r.padding,
					y: e.top + alignmentOffset(o, s[0]),
					line: 0
				};
			}
			Ca.rtl.overrideTextDirection(e.ctx, t.textDirection);
			var x = v + r.padding;
			Ca.each(e.legendItems, (function(t, a) {
				var n = f.measureText(t.text).width;
				var i = p + v / 2 + n;
				var d = g.x;
				var h = g.y;
				c.setWidth(e.minSize.width);
				if (b) {
					if (a > 0 && d + i + r.padding > e.left + e.minSize.width) {
						h = g.y += x;
						g.line++;
						d = g.x = e.left + alignmentOffset(l, u[g.line]);
					}
				} else if (a > 0 && h + x > e.top + e.minSize.height) {
					d = g.x = d + e.columnWidths[g.line] + r.padding;
					g.line++;
					h = g.y = e.top + alignmentOffset(o, s[g.line]);
				}
				var y = c.x(d);
				drawLegendBox(y, h, t);
				m[a].left = c.leftForLtr(y, m[a].width);
				m[a].top = h;
				fillText(y, h, t, n);
				if (b) {
					g.x += i + r.padding;
				} else {
					g.y += x;
				}
			}));
			Ca.rtl.restoreTextDirection(e.ctx, t.textDirection);
		},
		_getLegendItemAt: function(e, t) {
			var r = this;
			var a, n, i;
			if (e >= r.left && e <= r.right && t >= r.top && t <= r.bottom) {
				i = r.legendHitBoxes;
				for (a = 0; a < i.length; ++a) {
					n = i[a];
					if (e >= n.left && e <= n.left + n.width && t >= n.top && t <= n.top + n.height) {
						return r.legendItems[a];
					}
				}
			}
			return null;
		},
		handleEvent: function(e) {
			var t = this;
			var r = t.options;
			var a = "mouseup" === e.type ? "click" : e.type;
			var n;
			if ("mousemove" === a) {
				if (!r.onHover && !r.onLeave) {
					return;
				}
			} else if ("click" === a) {
				if (!r.onClick) {
					return;
				}
			} else {
				return;
			}
			n = t._getLegendItemAt(e.x, e.y);
			if ("click" === a) {
				if (n && r.onClick) {
					r.onClick.call(t, e.native, n);
				}
			} else {
				if (r.onLeave && n !== t._hoveredItem) {
					if (t._hoveredItem) {
						r.onLeave.call(t, e.native, t._hoveredItem);
					}
					t._hoveredItem = n;
				}
				if (r.onHover && n) {
					r.onHover.call(t, e.native, n);
				}
			}
		}
	});
	function createNewLegendAndAttach(e, t) {
		var r = new La({
			ctx: e.ctx,
			options: t,
			chart: e
		});
		Ta.configure(e, r, t);
		Ta.addBox(e, r);
		e.legend = r;
	}
	var Oa = {
		id: "legend",
		_element: La,
		beforeInit: function(e) {
			var t = e.options.legend;
			if (t) {
				createNewLegendAndAttach(e, t);
			}
		},
		beforeUpdate: function(e) {
			var t = e.options.legend;
			var r = e.legend;
			if (t) {
				Ca.mergeIf(t, Pa.global.legend);
				if (r) {
					Ta.configure(e, r, t);
					r.options = t;
				} else {
					createNewLegendAndAttach(e, t);
				}
			} else if (r) {
				Ta.removeBox(e, r);
				delete e.legend;
			}
		},
		afterEvent: function(e, t) {
			var r = e.legend;
			if (r) {
				r.handleEvent(t);
			}
		}
	};
	var za = Y;
	var Ba = le;
	var Ra = k.exports;
	var Na = Mt;
	var Ea = Ra.noop;
	za._set("global", {
		title: {
			display: false,
			fontStyle: "bold",
			fullWidth: true,
			padding: 10,
			position: "top",
			text: "",
			weight: 2e3
		}
	});
	var Va = Ba.extend({
		initialize: function(e) {
			var t = this;
			Ra.extend(t, e);
			t.legendHitBoxes = [];
		},
		beforeUpdate: Ea,
		update: function(e, t, r) {
			var a = this;
			a.beforeUpdate();
			a.maxWidth = e;
			a.maxHeight = t;
			a.margins = r;
			a.beforeSetDimensions();
			a.setDimensions();
			a.afterSetDimensions();
			a.beforeBuildLabels();
			a.buildLabels();
			a.afterBuildLabels();
			a.beforeFit();
			a.fit();
			a.afterFit();
			a.afterUpdate();
			return a.minSize;
		},
		afterUpdate: Ea,
		beforeSetDimensions: Ea,
		setDimensions: function() {
			var e = this;
			if (e.isHorizontal()) {
				e.width = e.maxWidth;
				e.left = 0;
				e.right = e.width;
			} else {
				e.height = e.maxHeight;
				e.top = 0;
				e.bottom = e.height;
			}
			e.paddingLeft = 0;
			e.paddingTop = 0;
			e.paddingRight = 0;
			e.paddingBottom = 0;
			e.minSize = {
				width: 0,
				height: 0
			};
		},
		afterSetDimensions: Ea,
		beforeBuildLabels: Ea,
		buildLabels: Ea,
		afterBuildLabels: Ea,
		beforeFit: Ea,
		fit: function() {
			var e = this;
			var t = e.options;
			var r = e.minSize = {};
			var a = e.isHorizontal();
			var n, i;
			if (!t.display) {
				e.width = r.width = e.height = r.height = 0;
				return;
			}
			n = Ra.isArray(t.text) ? t.text.length : 1;
			i = n * Ra.options._parseFont(t).lineHeight + 2 * t.padding;
			e.width = r.width = a ? e.maxWidth : i;
			e.height = r.height = a ? i : e.maxHeight;
		},
		afterFit: Ea,
		isHorizontal: function() {
			var e = this.options.position;
			return "top" === e || "bottom" === e;
		},
		draw: function() {
			var e = this;
			var t = e.ctx;
			var r = e.options;
			if (!r.display) {
				return;
			}
			var a = Ra.options._parseFont(r);
			var n = a.lineHeight;
			var i = n / 2 + r.padding;
			var o = 0;
			var s = e.top;
			var l = e.left;
			var u = e.bottom;
			var c = e.right;
			var f, d, h;
			t.fillStyle = Ra.valueOrDefault(r.fontColor, za.global.defaultFontColor);
			t.font = a.string;
			if (e.isHorizontal()) {
				d = l + (c - l) / 2;
				h = s + i;
				f = c - l;
			} else {
				d = "left" === r.position ? l + i : c - i;
				h = s + (u - s) / 2;
				f = u - s;
				o = Math.PI * ("left" === r.position ? -.5 : .5);
			}
			t.save();
			t.translate(d, h);
			t.rotate(o);
			t.textAlign = "center";
			t.textBaseline = "middle";
			var v = r.text;
			if (Ra.isArray(v)) {
				var g = 0;
				for (var p = 0; p < v.length; ++p) {
					t.fillText(v[p], 0, g, f);
					g += n;
				}
			} else {
				t.fillText(v, 0, 0, f);
			}
			t.restore();
		}
	});
	function createNewTitleBlockAndAttach(e, t) {
		var r = new Va({
			ctx: e.ctx,
			options: t,
			chart: e
		});
		Na.configure(e, r, t);
		Na.addBox(e, r);
		e.titleBlock = r;
	}
	var ja = {
		id: "title",
		_element: Va,
		beforeInit: function(e) {
			var t = e.options.title;
			if (t) {
				createNewTitleBlockAndAttach(e, t);
			}
		},
		beforeUpdate: function(e) {
			var t = e.options.title;
			var r = e.titleBlock;
			if (t) {
				Ra.mergeIf(t, za.global.title);
				if (r) {
					Na.configure(e, r, t);
					r.options = t;
				} else {
					createNewTitleBlockAndAttach(e, t);
				}
			} else if (r) {
				Na.removeBox(e, r);
				delete e.titleBlock;
			}
		}
	};
	fa.exports = {};
	fa.exports.filler = Sa;
	fa.exports.legend = Oa;
	fa.exports.title = ja;
	var Wa = xr;
	Wa.helpers = k.exports;
	core_helpers();
	Wa._adapters = kr;
	Wa.Animation = fe;
	Wa.animationService = ve;
	Wa.controllers = bt;
	Wa.DatasetController = be;
	Wa.defaults = Y;
	Wa.Element = le;
	Wa.elements = xe.exports;
	Wa.Interaction = yt;
	Wa.layouts = Mt;
	Wa.platform = qt;
	Wa.plugins = Kt;
	Wa.Scale = Br;
	Wa.scaleService = Qt;
	Wa.Ticks = Pr;
	Wa.Tooltip = or;
	var Ha = ca;
	Wa.helpers.each(Ha, (function(e, t) {
		Wa.scaleService.registerScaleType(t, e, e._defaults);
	}));
	const Ua = fa.exports;
	for (const e of Object.values(Ua)) {
		Wa.plugins.register(e);
	}
	Wa.platform.initialize();
	var qa = Wa;
	if ("undefined" !== typeof window) {
		window.Chart = Wa;
	}
	Wa.Chart = Wa;
	Wa.Legend = Ua.legend._element;
	Wa.Title = Ua.title._element;
	Wa.pluginService = Wa.plugins;
	Wa.PluginBase = Wa.Element.extend({});
	Wa.canvasHelpers = Wa.helpers.canvas;
	Wa.layoutService = Wa.layouts;
	Wa.LinearScaleBase = Wr;
	Wa.helpers.each([ "Bar", "Bubble", "Doughnut", "Line", "PolarArea", "Radar", "Scatter" ], (function(e) {
		Wa[e] = function(t, r) {
			return new Wa(t, Wa.helpers.merge(r || {}, {
				type: e.charAt(0).toLowerCase() + e.slice(1)
			}));
		};
	}));
	return qa;
}));
