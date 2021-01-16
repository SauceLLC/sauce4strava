! function (t) {
    var e = {};

    function n(r) {
        if (e[r]) return e[r].exports;
        var i = e[r] = {
            i: r,
            l: !1,
            exports: {}
        };
        return t[r].call(i.exports, i, i.exports, n), i.l = !0, i.exports
    }
    n.m = t, n.c = e, n.d = function (t, e, r) {
        n.o(t, e) || Object.defineProperty(t, e, {
            enumerable: !0,
            get: r
        })
    }, n.r = function (t) {
        "undefined" != typeof Symbol && Symbol.toStringTag && Object.defineProperty(t, Symbol
        .toStringTag, {
            value: "Module"
        }), Object.defineProperty(t, "__esModule", {
            value: !0
        })
    }, n.t = function (t, e) {
        if (1 & e && (t = n(t)), 8 & e) return t;
        if (4 & e && "object" == typeof t && t && t.__esModule) return t;
        var r = Object.create(null);
        if (n.r(r), Object.defineProperty(r, "default", {
                enumerable: !0,
                value: t
            }), 2 & e && "string" != typeof t)
            for (var i in t) n.d(r, i, function (e) {
                return t[e]
            }.bind(null, i));
        return r
    }, n.n = function (t) {
        var e = t && t.__esModule ? function () {
            return t.default
        } : function () {
            return t
        };
        return n.d(e, "a", e), e
    }, n.o = function (t, e) {
        return Object.prototype.hasOwnProperty.call(t, e)
    }, n.p = "", n(n.s = 2)
}([function (t, e, n) {
    "use strict";
    Object.defineProperty(e, "__esModule", {
        value: !0
    }), e.MetaDataSet = void 0;
    var r = n(1),
        i = function () {
            function t(t, e) {
                this.getXY = void 0, this.isXY = !1;
                var n = e.regressions;
                this.chart = t, this.dataset = e, this.normalizedData = this._normalizeData(e.data),
                    this.sections = this._createMetaSections(n), this._calculate()
            }
            return t.prototype._normalizeData = function (t) {
                var e = this;
                return t.map((function (t, n) {
                    var r;
                    return "number" == typeof t || null == t || void 0 === t ? r = [n,
                        t
                    ] : (e.isXY = !0, r = [t.x, t.y]), r
                }))
            }, t.prototype._createMetaSections = function (t) {
                var e = this;
                return (t.sections || [{
                    startIndex: 0,
                    endIndex: this.dataset.data.length - 1
                }]).map((function (t) {
                    return new r.MetaSection(t, e)
                }))
            }, t.prototype._calculate = function () {
                this.sections.forEach((function (t) {
                    return t.calculate()
                }))
            }, t.prototype.adjustScales = function () {
                if (void 0 === this.topY) {
                    var t, e, n = this.chart.scales;
                    Object.keys(n).forEach((function (r) {
                        return "x" == r[0] && (t = n[r]) || (e = n[r])
                    })), this.topY = e.top, this.bottomY = e.bottom, this.getXY = function (n,
                        r) {
                        return {
                            x: t.getPixelForValue(n, void 0, void 0, !0),
                            y: e.getPixelForValue(r)
                        }
                    }
                }
            }, t.prototype.drawRegressions = function () {
                var t = this.chart.chart.ctx;
                t.save();
                try {
                    this.sections.forEach((function (e) {
                        return e.drawRegressions(t)
                    }))
                } finally {
                    t.restore()
                }
            }, t.prototype.drawRightBorders = function () {
                var t = this.chart.chart.ctx;
                t.save();
                try {
                    for (var e = 0; e < this.sections.length - 1; e++) this.sections[e]
                        .drawRightBorder(t)
                } finally {
                    t.restore()
                }
            }, t
        }();
    e.MetaDataSet = i
}, function (t, e, n) {
    "use strict";
    Object.defineProperty(e, "__esModule", {
        value: !0
    }), e.MetaSection = void 0;
    var r = n(4),
        i = {
            type: "linear",
            calculation: {
                precision: 2,
                order: 2
            },
            line: {
                width: 2,
                color: "#000",
                dash: []
            },
            extendPredictions: !1,
            copy: {
                overwriteData: "none"
            }
        },
        o = function () {
            function t(t, e) {
                this._meta = e;
                var n, r, o, a, s = e.chart,
                    c = e.dataset,
                    u = (n = ["type", "calculation", "line", "extendPredictions", "copy"], a = (r = s
                        .config.options) && (o = r.plugins) && o.regressions || {}, function t(
                    e) {
                        for (var n = [], r = 1; r < arguments.length; r++) n[r - 1] = arguments[
                        r];
                        var i = {};
                        return e.forEach((function (e) {
                            n.forEach((function (n) {
                                var r = n[e],
                                    o = typeof r;
                                "undefined" != o && (Array.isArray(r) ||
                                    "object" != o || null == r ? i[
                                    e] = r : i[e] = Object.assign({},
                                        i[e], t(Object.keys(r), r)))
                            }))
                        })), i
                    }(n, i, a, c.regressions, t));
                this.startIndex = t.startIndex || 0, this.endIndex = t.endIndex || c.data.length - 1,
                    this.type = Array.isArray(u.type) ? u.type : [u.type], this.line = u.line, this
                    .calculation = u.calculation, this.extendPredictions = u.extendPredictions, this
                    .copy = u.copy, this.label = t.label || this._meta.chart.data.labels[this
                        .endIndex], this._validateType()
            }
            return t.prototype._validateType = function () {
                if (this.type.length > 1 && this.type.includes("copy")) throw Error(
                    "Invalid regression type:" + this.type +
                    '. "none" cannot be combined with other type!')
            }, t.prototype.calculate = function () {
                var t = this._meta.normalizedData.slice(this.startIndex, this.endIndex + 1);
                "copy" == this.type[0] ? this._calculateCopySection(t) : this._calculateBestR2(t)
            }, t.prototype._calculateBestR2 = function (t) {
                var e = this;
                this.result = this.type.reduce((function (n, i) {
                    var o = Object.assign({}, e.calculation),
                        a = i;
                    /polynomial[34]$/.test(i) && (o.order = parseInt(i.substr(10)),
                        a = i.substr(0, 10));
                    var s = r[a](t, o);
                    return s.type = i, !n || n.r2 < s.r2 ? s : n
                }), null)
            }, t.prototype._calculateCopySection = function (t) {
                var e = this,
                    n = this._meta.sections[this.copy.fromSectionIndex],
                    r = this.result = Object.assign({}, n.result),
                    i = this.copy.overwriteData,
                    o = this._meta.normalizedData;
                if (r.points = t.map((function (t) {
                        return r.predict(t[0])
                    })), delete r.r2, "none" != i) {
                    var a = this._meta.dataset.data,
                        s = this._meta.isXY;
                    r.points.forEach((function (t, r) {
                        var c = t[0],
                            u = t[1],
                            l = r + e.startIndex;
                        (l < n.startIndex || l > n.endIndex) && ("all" == i ||
                            "last" == i && l == e.endIndex || "empty" == i && !o[l]
                            ) && (e.copy.maxValue && (u = Math.min(e.copy.maxValue,
                            u)), void 0 !== e.copy.minValue && (u = Math.max(e
                            .copy.minValue, u)), a[l] = s ? {
                            x: c,
                            y: u
                        } : u)
                    }))
                }
            }, t.prototype.drawRightBorder = function (t) {
                t.beginPath(), this._setLineAttrs(t), t.setLineDash([10, 2]), t.lineWidth = 2;
                var e = this._meta.getXY(this.endIndex, 0);
                t.moveTo(e.x, this._meta.topY), t.lineTo(e.x, this._meta.bottomY), t.fillStyle =
                    this.line.color, t.fillText(this.label, e.x, this._meta.topY), t.stroke()
            }, t.prototype.drawRegressions = function (t) {
                for (var e = 0, n = this._meta.sections.length; e < n; e++) {
                    var r = this._meta.sections[e],
                        i = r == this;
                    if ((i && "copy" != this.type[0] || !i && this.extendPredictions) && r
                        .drawRange(t, this.startIndex, this.endIndex, !i), i) break
                }
            }, t.prototype.drawRange = function (t, e, n, r) {
                var i = this;
                t.beginPath(), this._setLineAttrs(t), r && t.setLineDash([5, 5]);
                var o = this.result.predict,
                    a = function (t) {
                        return i._meta.getXY(t, o(t)[1])
                    },
                    s = a(e);
                t.moveTo(s.x, s.y);
                for (var c = e + 1; c <= n; c++) s = a(c), t.lineTo(s.x, s.y);
                t.stroke()
            }, t.prototype._setLineAttrs = function (t) {
                this.line.width && (t.lineWidth = this.line.width), this.line.color && (t
                    .strokeStyle = this.line.color), this.line.dash && t.setLineDash(this.line
                    .dash)
            }, t
        }();
    e.MetaSection = o
}, function (t, e, n) {
    "use strict";
    var r = this && this.__createBinding || (Object.create ? function (t, e, n, r) {
            void 0 === r && (r = n), Object.defineProperty(t, r, {
                enumerable: !0,
                get: function () {
                    return e[n]
                }
            })
        } : function (t, e, n, r) {
            void 0 === r && (r = n), t[r] = e[n]
        }),
        i = this && this.__exportStar || function (t, e) {
            for (var n in t) "default" === n || e.hasOwnProperty(n) || r(e, t, n)
        };
    Object.defineProperty(e, "__esModule", {
        value: !0
    }), i(n(3), e), i(n(0), e), i(n(1), e), i(n(5), e)
}, function (t, e, n) {
    "use strict";
    Object.defineProperty(e, "__esModule", {
        value: !0
    })
}, function (t, e, n) {
    var r, i, o;
    i = [t], void 0 === (o = "function" == typeof (r = function (t) {
        "use strict";
        var e = Object.assign || function (t) {
            for (var e = 1; e < arguments.length; e++) {
                var n = arguments[e];
                for (var r in n) Object.prototype.hasOwnProperty.call(n, r) && (t[r] =
                    n[r])
            }
            return t
        };

        function n(t) {
            if (Array.isArray(t)) {
                for (var e = 0, n = Array(t.length); e < t.length; e++) n[e] = t[e];
                return n
            }
            return Array.from(t)
        }
        var r = {
            order: 2,
            precision: 2,
            period: null
        };

        function i(t, e) {
            var n = [],
                r = [];
            t.forEach((function (t, i) {
                null !== t[1] && (r.push(t), n.push(e[i]))
            }));
            var i = r.reduce((function (t, e) {
                    return t + e[1]
                }), 0) / r.length,
                o = r.reduce((function (t, e) {
                    var n = e[1] - i;
                    return t + n * n
                }), 0);
            return 1 - r.reduce((function (t, e, r) {
                var i = n[r],
                    o = e[1] - i[1];
                return t + o * o
            }), 0) / o
        }

        function o(t, e) {
            var n = Math.pow(10, e);
            return Math.round(t * n) / n
        }
        var a = {
            linear: function (t, e) {
                for (var n = [0, 0, 0, 0, 0], r = 0, a = 0; a < t.length; a++)
                    null !== t[a][1] && (r++, n[0] += t[a][0], n[1] += t[a][1], n[
                        2] += t[a][0] * t[a][0], n[3] += t[a][0] * t[a][1], n[
                        4] += t[a][1] * t[a][1]);
                var s = r * n[2] - n[0] * n[0],
                    c = r * n[3] - n[0] * n[1],
                    u = 0 === s ? 0 : o(c / s, e.precision),
                    l = o(n[1] / r - u * n[0] / r, e.precision),
                    p = function (t) {
                        return [o(t, e.precision), o(u * t + l, e.precision)]
                    },
                    h = t.map((function (t) {
                        return p(t[0])
                    }));
                return {
                    points: h,
                    predict: p,
                    equation: [u, l],
                    r2: o(i(t, h), e.precision),
                    string: 0 === l ? "y = " + u + "x" : "y = " + u + "x + " + l
                }
            },
            exponential: function (t, e) {
                for (var n = [0, 0, 0, 0, 0, 0], r = 0; r < t.length; r++)
                    null !== t[r][1] && (n[0] += t[r][0], n[1] += t[r][1], n[2] +=
                        t[r][0] * t[r][0] * t[r][1], n[3] += t[r][1] * Math.log(t[
                            r][1]), n[4] += t[r][0] * t[r][1] * Math.log(t[r][1]),
                        n[5] += t[r][0] * t[r][1]);
                var a = n[1] * n[2] - n[5] * n[5],
                    s = Math.exp((n[2] * n[3] - n[5] * n[4]) / a),
                    c = (n[1] * n[4] - n[5] * n[3]) / a,
                    u = o(s, e.precision),
                    l = o(c, e.precision),
                    p = function (t) {
                        return [o(t, e.precision), o(u * Math.exp(l * t), e
                            .precision)]
                    },
                    h = t.map((function (t) {
                        return p(t[0])
                    }));
                return {
                    points: h,
                    predict: p,
                    equation: [u, l],
                    string: "y = " + u + "e^(" + l + "x)",
                    r2: o(i(t, h), e.precision)
                }
            },
            logarithmic: function (t, e) {
                for (var n = [0, 0, 0, 0], r = t.length, a = 0; a < r; a++)
                    null !== t[a][1] && (n[0] += Math.log(t[a][0]), n[1] += t[a][
                        1
                    ] * Math.log(t[a][0]), n[2] += t[a][1], n[3] += Math.pow(
                        Math.log(t[a][0]), 2));
                var s = o((r * n[1] - n[2] * n[0]) / (r * n[3] - n[0] * n[0]), e
                        .precision),
                    c = o((n[2] - s * n[0]) / r, e.precision),
                    u = function (t) {
                        return [o(t, e.precision), o(o(c + s * Math.log(t), e
                            .precision), e.precision)]
                    },
                    l = t.map((function (t) {
                        return u(t[0])
                    }));
                return {
                    points: l,
                    predict: u,
                    equation: [c, s],
                    string: "y = " + c + " + " + s + " ln(x)",
                    r2: o(i(t, l), e.precision)
                }
            },
            power: function (t, e) {
                for (var n = [0, 0, 0, 0, 0], r = t.length, a = 0; a < r; a++)
                    null !== t[a][1] && (n[0] += Math.log(t[a][0]), n[1] += Math
                        .log(t[a][1]) * Math.log(t[a][0]), n[2] += Math.log(t[a][
                            1
                        ]), n[3] += Math.pow(Math.log(t[a][0]), 2));
                var s = (r * n[1] - n[0] * n[2]) / (r * n[3] - Math.pow(n[0], 2)),
                    c = (n[2] - s * n[0]) / r,
                    u = o(Math.exp(c), e.precision),
                    l = o(s, e.precision),
                    p = function (t) {
                        return [o(t, e.precision), o(o(u * Math.pow(t, l), e
                            .precision), e.precision)]
                    },
                    h = t.map((function (t) {
                        return p(t[0])
                    }));
                return {
                    points: h,
                    predict: p,
                    equation: [u, l],
                    string: "y = " + u + "x^" + l,
                    r2: o(i(t, h), e.precision)
                }
            },
            polynomial: function (t, e) {
                for (var r = [], a = [], s = 0, c = 0, u = t.length, l = e.order +
                        1, p = 0; p < l; p++) {
                    for (var h = 0; h < u; h++) null !== t[h][1] && (s += Math
                        .pow(t[h][0], p) * t[h][1]);
                    r.push(s), s = 0;
                    for (var f = [], d = 0; d < l; d++) {
                        for (var y = 0; y < u; y++) null !== t[y][1] && (c += Math
                            .pow(t[y][0], p + d));
                        f.push(c), c = 0
                    }
                    a.push(f)
                }
                a.push(r);
                for (var v = function (t, e) {
                        for (var n = t, r = t.length - 1, i = [e], o = 0; o <
                            r; o++) {
                            for (var a = o, s = o + 1; s < r; s++) Math.abs(n[
                                o][s]) > Math.abs(n[o][a]) && (a = s);
                            for (var c = o; c < r + 1; c++) {
                                var u = n[c][o];
                                n[c][o] = n[c][a], n[c][a] = u
                            }
                            for (var l = o + 1; l < r; l++)
                                for (var p = r; p >= o; p--) n[p][l] -= n[p][
                                    o
                                ] * n[o][l] / n[o][o]
                        }
                        for (var h = r - 1; h >= 0; h--) {
                            for (var f = 0, d = h + 1; d < r; d++) f += n[d][
                                h
                            ] * i[d];
                            i[h] = (n[r][h] - f) / n[h][h]
                        }
                        return i
                    }(a, l).map((function (t) {
                        return o(t, e.precision)
                    })), g = function (t) {
                        return [o(t, e.precision), o(v.reduce((function (e, n,
                            r) {
                            return e + n * Math.pow(t, r)
                        }), 0), e.precision)]
                    }, x = t.map((function (t) {
                        return g(t[0])
                    })), b = "y = ", m = v.length - 1; m >= 0; m--) b += m > 1 ?
                    v[m] + "x^" + m + " + " : 1 === m ? v[m] + "x + " : v[m];
                return {
                    string: b,
                    points: x,
                    predict: g,
                    equation: [].concat(n(v)).reverse(),
                    r2: o(i(t, x), e.precision)
                }
            }
        };
        t.exports = Object.keys(a).reduce((function (t, n) {
            return e({
                _round: o
            }, t, (c = function (t, i) {
                return a[n](t, e({}, r, i))
            }, (s = n) in (i = {}) ? Object.defineProperty(i, s, {
                value: c,
                enumerable: !0,
                configurable: !0,
                writable: !0
            }) : i[s] = c, i));
            var i, s, c
        }), {})
    }) ? r.apply(e, i) : r) || (t.exports = o)
}, function (t, e, n) {
    "use strict";
    Object.defineProperty(e, "__esModule", {
        value: !0
    }), e.ChartRegressions = void 0;
    var r = n(0),
        i = {},
        o = 0,
        a = function () {
            function t() {
                this.id = "regressions"
            }
            return t.prototype.beforeInit = function (t) {
                t.$$id = ++o
            }, t.prototype.beforeUpdate = function (t, e) {
                var n, o, a, c = (n = t.config.options) && (o = n.plugins) && (a = o
                    .regressions) && a.onCompleteCalculation;
                s(t, (function (e, n, o) {
                    n = new r.MetaDataSet(t, e);
                    var a = 1e3 * t.$$id + o;
                    i[a] = n
                })), c && c(t)
            }, t.prototype.beforeRender = function (t, e) {
                s(t, (function (t, e) {
                    return e.adjustScales()
                }))
            }, t.prototype.beforeDatasetsDraw = function (t, e, n) {
                s(t, (function (t, e) {
                    return e.drawRightBorders()
                }))
            }, t.prototype.afterDatasetsDraw = function (t, e, n) {
                s(t, (function (t, e) {
                    return e.drawRegressions()
                }))
            }, t.prototype.destroy = function (t) {
                Object.keys(i).filter((function (e) {
                    return e / 1e3 >> 0 == t.$$id
                })).forEach((function (t) {
                    return delete i[t]
                }))
            }, t.prototype.getDataset = function (t, e) {
                var n = 1e3 * t.$$id + e;
                return i[n]
            }, t.prototype.getSections = function (t, e) {
                var n = this.getDataset(t, e);
                return n && n.sections
            }, t
        }();

    function s(t, n) {
        t.data.datasets.forEach((function (r, i) {
            if (r.regressions && t.isDatasetVisible(i)) {
                var o = e.ChartRegressions.getDataset(t, i);
                n(r, o, i)
            }
        }))
    }
    e.ChartRegressions = new a, window.ChartRegressions = e.ChartRegressions
}]);
