/* global sauce */
/**
*
* Sauce sparkline: Hard fork of jquery.sparkline.js v2.1.2
*
* (c) Splunk, Inc
* Contact: Gareth Watts (gareth@splunk.com)
* http://omnipotent.net/jquery.sparkline/
*
* Generates inline sparkline charts from data supplied either to the method
* or inline in HTML
*
* Compatible with Internet Explorer 6.0+ and modern browsers equipped with the canvas tag
* (Firefox 2.0+, Safari, Opera, etc)
*
* License: New BSD License
*
* Copyright (c) 2012, Splunk Inc.
* All rights reserved.
*
* Redistribution and use in source and binary forms, with or without modification,
* are permitted provided that the following conditions are met:
*
*     * Redistributions of source code must retain the above copyright notice,
*       this list of conditions and the following disclaimer.
*     * Redistributions in binary form must reproduce the above copyright notice,
*       this list of conditions and the following disclaimer in the documentation
*       and/or other materials provided with the distribution.
*     * Neither the name of Splunk Inc nor the names of its contributors may
*       be used to endorse or promote products derived from this software without
*       specific prior written permission.
*
* THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY
* EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES
* OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT
* SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
* SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT
* OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
* HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
* OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
* SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*
*/

sauce.propDefined('jQuery', function($) {
    'use strict';

    const UNSET_OPTION = {};
    let SPFormat, RangeMap, line, bar, colorline, tristate, discrete, bullet, pie, box, shapeCount = 0;

    function getDefaults() {
        return {
            common: {
                type: 'line',
                lineColor: '#00f',
                fillColor: '#cdf',
                defaultPixelsPerValue: 3,
                width: 'auto',
                height: 'auto',
                composite: false,
                tagValuesAttribute: 'values',
                tagOptionsPrefix: 'spark',
                enableTagOptions: false,
                enableHighlight: true,
                highlightLighten: 1.4,
                tooltipSkipNull: true,
                tooltipPrefix: '',
                tooltipSuffix: '',
                disableHiddenCheck: false,
                numberFormatter: false,
                numberDigitGroupCount: 3,
                numberDigitGroupSep: ',',
                numberDecimalMark: '.',
                disableTooltips: false,
                disableInteraction: false
            },
            line: {
                spotColor: '#f80',
                highlightSpotColor: '#5f5',
                highlightLineColor: '#f22',
                spotRadius: 1.5,
                minSpotColor: '#f80',
                maxSpotColor: '#f80',
                lineWidth: 1,
                normalRangeMin: undefined,
                normalRangeMax: undefined,
                normalRangeColor: '#ccc',
                drawNormalOnTop: false,
                chartRangeMin: undefined,
                chartRangeMax: undefined,
                chartRangeMinX: undefined,
                chartRangeMaxX: undefined,
                tooltipFormat: new SPFormat(
                    '<span style="color: {{color}}">&#9679;</span> {{prefix}}{{y}}{{suffix}}')
            },
            bar: {
                barColor: '#3366cc',
                negBarColor: '#f44',
                stackedBarColor: ['#3366cc', '#dc3912', '#ff9900', '#109618', '#66aa00',
                    '#dd4477', '#0099c6', '#990099'],
                zeroColor: undefined,
                nullColor: undefined,
                zeroAxis: true,
                barWidth: 4,
                barSpacing: 1,
                chartRangeMax: undefined,
                chartRangeMin: undefined,
                chartRangeClip: false,
                colorMap: undefined,
                tooltipFormat: new SPFormat(
                    '<span style="color: {{color}}">&#9679;</span> {{prefix}}{{value}}{{suffix}}')
            },
            colorline: {
                barColor: '#3366cc',
                negBarColor: '#f44',
                stackedBarColor: ['#3366cc', '#dc3912', '#ff9900', '#109618', '#66aa00',
                    '#dd4477', '#0099c6', '#990099'],
                zeroColor: undefined,
                nullColor: undefined,
                zeroAxis: true,
                chartRangeMax: undefined,
                chartRangeMin: undefined,
                chartRangeClip: false,
                colorMap: undefined,
                tooltipFormat: new SPFormat(
                    '<span style="color: {{color}}">&#9679;</span> {{prefix}}{{value}}{{suffix}}')
            },
            tristate: {
                barWidth: 4,
                barSpacing: 1,
                posBarColor: '#6f6',
                negBarColor: '#f44',
                zeroBarColor: '#999',
                colorMap: {},
                tooltipFormat: new SPFormat('<span style="color: {{color}}">&#9679;</span> {{value:map}}'),
                tooltipValueLookups: { map: { '-1': 'Loss', '0': 'Draw', '1': 'Win' } }
            },
            discrete: {
                lineHeight: 'auto',
                thresholdColor: undefined,
                thresholdValue: 0,
                chartRangeMax: undefined,
                chartRangeMin: undefined,
                chartRangeClip: false,
                tooltipFormat: new SPFormat('{{prefix}}{{value}}{{suffix}}')
            },
            bullet: {
                targetColor: '#f33',
                targetWidth: 3, // width of the target bar in pixels
                performanceColor: '#33f',
                rangeColors: ['#d3dafe', '#a8b6ff', '#7f94ff'],
                base: undefined, // set this to a number to change the base start number
                tooltipFormat: new SPFormat('{{fieldkey:fields}} - {{value}}'),
                tooltipValueLookups: { fields: {r: 'Range', p: 'Performance', t: 'Target'} }
            },
            pie: {
                offset: 0,
                sliceColors: ['#3366cc', '#dc3912', '#ff9900', '#109618', '#66aa00',
                    '#dd4477', '#0099c6', '#990099'],
                borderWidth: 0,
                borderColor: '#000',
                tooltipFormat: new SPFormat(
                    '<span style="color: {{color}}">&#9679;</span> {{value}} ({{percent.1}}%)')
            },
            box: {
                raw: false,
                boxLineColor: '#000',
                boxFillColor: '#cdf',
                whiskerColor: '#000',
                outlierLineColor: '#333',
                outlierFillColor: '#fff',
                medianColor: '#f00',
                showOutliers: true,
                outlierIQR: 1.5,
                spotRadius: 1.5,
                target: undefined,
                targetColor: '#4a2',
                chartRangeMax: undefined,
                chartRangeMin: undefined,
                tooltipFormat: new SPFormat('{{field:fields}}: {{value}}'),
                tooltipFormatFieldlistKey: 'field',
                tooltipValueLookups: {
                    fields: {
                        lq: 'Lower Quartile',
                        med: 'Median',
                        uq: 'Upper Quartile',
                        lo: 'Left Outlier',
                        ro: 'Right Outlier',
                        lw: 'Left Whisker',
                        rw: 'Right Whisker'
                    }
                }
            }
        };
    }

    // You can have tooltips use a css class other than jqstooltip by specifying tooltipClassname
    const defaultStyles = `
        .jqstooltip {
            position: absolute;
            left: 0;
            top: 0;
            visibility: hidden;
            background-color: #000c;
            color: white;
            text-align: left;
            white-space: nowrap;
            padding: 0.3em 0.5em;
            border: 1px solid #eee;
            border-radius: 0.25em;
            z-index: 10000;
        }
        .jqsfield {
            color: white;
            font-size: 0.85em;
            text-align: left;
        }
    `;

    /**
     * Utilities
     */

    function createClass(/* [baseclass, [mixin, ...]], definition */) {
        const Class = function() {
            this.init.apply(this, arguments);
        };
        if (arguments.length > 1) {
            if (arguments[0]) {
                Class.prototype = $.extend(new arguments[0](), arguments[arguments.length - 1]);
                Class._super = arguments[0].prototype;
            } else {
                Class.prototype = arguments[arguments.length - 1];
            }
            if (arguments.length > 2) {
                const args = Array.prototype.slice.call(arguments, 1, -1);
                args.unshift(Class.prototype);
                $.extend.apply($, args);
            }
        } else {
            Class.prototype = arguments[0];
        }
        Class.prototype.cls = Class;
        return Class;
    }


    // Setup a very simple "virtual canvas" to make drawing the few shapes we need easier
    // This is accessible as $(foo).simpledraw()
    const VShape = createClass({
        init: function(target, id, type, args) {
            this.target = target;
            this.id = id;
            this.type = type;
            this.args = args;
        },

        append: function() {
            this.target.appendShape(this);
            return this;
        }
    });


    const VCanvas_base = createClass({
        _pxregex: /(\d+)(px)?\s*$/i,

        init: function(width, height, target) {
            if (!width) {
                return;
            }
            this.width = width;
            this.height = height;
            this.target = target;
            this.lastShapeId = null;
            if (target[0]) {
                target = target[0];
            }
            $.data(target, '_jqs_vcanvas', this);
        },

        drawLine: function(x1, y1, x2, y2, lineColor, lineWidth) {
            return this.drawShape([[x1, y1], [x2, y2]], lineColor, lineWidth);
        },

        drawShape: function(path, lineColor, fillColor, lineWidth) {
            return this._genShape('Shape', [path, lineColor, fillColor, lineWidth]);
        },

        drawCircle: function(x, y, radius, lineColor, fillColor, lineWidth) {
            return this._genShape('Circle', [x, y, radius, lineColor, fillColor, lineWidth]);
        },

        drawPieSlice: function(x, y, radius, startAngle, endAngle, lineColor, fillColor) {
            return this._genShape('PieSlice', [x, y, radius, startAngle, endAngle, lineColor, fillColor]);
        },

        drawRect: function(x, y, width, height, lineColor, fillColor) {
            return this._genShape('Rect', [x, y, width, height, lineColor, fillColor]);
        },

        getElement: function() {
            return this.canvas;
        },

        getLastShapeId: function() {
            return this.lastShapeId;
        },

        reset: function() {
            throw new Error('reset not implemented');
        },

        _insert: function(el, target) {
            $(target).html(el);
        },

        _calculatePixelDims: function(width, height, canvas) {
            const heightMatch = this._pxregex.exec(height);
            const pixelHeight = heightMatch ?  Number(heightMatch[1]) : $(canvas).height();
            const widthMatch = this._pxregex.exec(width);
            const pixelWidth = widthMatch ?  Number(widthMatch[1]) : $(canvas).width();
            const dpr = window.devicePixelRatio || 1;
            this.pixelHeight = Math.round(pixelHeight * dpr);
            this.pixelWidth = Math.round(pixelWidth * dpr);
        },

        _genShape: function(shapetype, shapeargs) {
            const id = shapeCount++;
            shapeargs.unshift(id);
            return new VShape(this, id, shapetype, shapeargs);
        },

        appendShape: function(shape) {
            throw new Error('appendShape not implemented');
        },

        replaceWithShape: function(shapeid, shape) {
            throw new Error('replaceWithShape not implemented');
        },

        insertAfterShape: function(shapeid, shape) {
            throw new Error('insertAfterShape not implemented');
        },

        removeShapeId: function(shapeid) {
            throw new Error('removeShapeId not implemented');
        },

        getShapeAt: function(el, x, y) {
            throw new Error('getShapeAt not implemented');
        },

        render: function() {
            throw new Error('render not implemented');
        }
    });


    const VCanvas_canvas = createClass(VCanvas_base, {
        init: function(width, height, target, interact) {
            VCanvas_canvas._super.init.call(this, width, height, target);
            this.canvas = document.createElement('canvas');
            if (target[0]) {
                target = target[0];
            }
            $.data(target, '_jqs_vcanvas', this);
            $(this.canvas).css({
                display: 'inline-block',
                width,
                height,
                verticalAlign: 'top'
            });
            this._insert(this.canvas, target);
            this._calculatePixelDims(width, height, this.canvas);
            this.canvas.width = this.pixelWidth;
            this.canvas.height = this.pixelHeight;
            this.interact = interact;
            this.shapes = {};
            this.shapeseq = [];
            this.currentTargetShapeId = undefined;
            this._fillGradients = new Map();
        },

        _buildFillGradient: function(context, spec) {
            // Render gradient into detached context first, then use that for ref.
            // We need to rebuild a gradient using the subset of ranges.
            const stepCount = spec.steps.length;
            const size = stepCount * 100;
            const refCanvas = document.createElement('canvas');
            refCanvas.width = size;
            refCanvas.height = 2;
            const refContext = refCanvas.getContext('2d', {willReadFrequently: true});
            const refGradient = refContext.createLinearGradient(0, 0, size, 0);
            const refMin = sauce.data.min(spec.steps.map(x => x.value));
            const refMax = sauce.data.max(spec.steps.map(x => x.value));
            const refRange = refMax - refMin;
            for (const step of spec.steps) {
                const pct = Math.min(1, Math.max(0, (step.value - refMin) / refRange));
                refGradient.addColorStop(pct, step.color);
            }
            refContext.fillStyle = refGradient;
            refContext.fillRect(0, 0, size, 2); // make 1
            const gradient = context.createLinearGradient(0, this.pixelHeight, 0, 0);
            const range = this._maxValue - this._minValue;
            const samples = stepCount * 5;  // Slightly more bands than the orig.
            const alphaMax = spec.opacity || 1;
            let over;
            for (let i = 0; i < samples && !over; i++) {
                const pct = i / samples;
                const valOfft = (pct * range) + this._minValue;
                const refPct = (valOfft - refMin) / refRange;
                if (refPct > 1) {
                    over = true;
                }
                const alpha = refPct < 0 ? Math.max(0, alphaMax - ((-refPct) ** 0.5 * alphaMax)) : alphaMax;
                const refOffset = Math.max(0, Math.min(size - 1, Math.round(refPct * size)));
                const [r, g, b] = refContext.getImageData(refOffset, 0, refOffset + 1, 1).data;
                gradient.addColorStop(pct, `rgba(${r}, ${g}, ${b}, ${alpha})`);
            }
            return gradient;
        },

        _getContext: function(lineColor, fillColor, lineWidth) {
            const context = this.canvas.getContext('2d');
            if (lineColor !== undefined) {
                context.strokeStyle = lineColor;
            }
            context.lineWidth = lineWidth === undefined ? 1 : lineWidth;
            if (fillColor !== undefined) {
                if (fillColor.type === 'gradient') {
                    let fillGradient;
                    if (this._fillGradients.has(fillColor)) {
                        fillGradient = this._fillGradients.get(fillColor);
                    } else {
                        fillGradient = this._buildFillGradient(context, fillColor);
                        this._fillGradients.set(fillColor, fillGradient);
                    }
                    context.fillStyle = fillGradient;
                } else {
                    context.fillStyle = fillColor;
                }
            }
            return context;
        },

        reset: function() {
            const context = this._getContext();
            context.clearRect(0, 0, this.pixelWidth, this.pixelHeight);
            this.shapes = {};
            this.shapeseq = [];
            this.currentTargetShapeId = undefined;
        },

        _drawShape: function(shapeid, path, lineColor, fillColor, lineWidth) {
            const context = this._getContext(lineColor, fillColor, lineWidth);
            context.beginPath();
            context.moveTo(path[0][0], path[0][1]);
            for (let i = 1; i < path.length; i++) {
                context.lineTo(path[i][0], path[i][1]);
            }
            if (lineColor !== undefined) {
                context.stroke();
            }
            if (fillColor !== undefined) {
                context.fill();
            }
            if (this.targetX !== undefined && this.targetY !== undefined &&
                context.isPointInPath(this.targetX, this.targetY)) {
                this.currentTargetShapeId = shapeid;
            }
        },

        _drawCircle: function(shapeid, x, y, radius, lineColor, fillColor, lineWidth) {
            const context = this._getContext(lineColor, fillColor, lineWidth);
            context.beginPath();
            context.arc(x, y, radius, 0, 2 * Math.PI, false);
            if (this.targetX !== undefined && this.targetY !== undefined &&
                context.isPointInPath(this.targetX, this.targetY)) {
                this.currentTargetShapeId = shapeid;
            }
            if (lineColor !== undefined) {
                context.stroke();
            }
            if (fillColor !== undefined) {
                context.fill();
            }
        },

        _drawPieSlice: function(shapeid, x, y, radius, startAngle, endAngle, lineColor, fillColor) {
            const context = this._getContext(lineColor, fillColor);
            context.beginPath();
            context.moveTo(x, y);
            context.arc(x, y, radius, startAngle, endAngle, false);
            context.lineTo(x, y);
            context.closePath();
            if (lineColor !== undefined) {
                context.stroke();
            }
            if (fillColor) {
                context.fill();
            }
            if (this.targetX !== undefined && this.targetY !== undefined &&
                context.isPointInPath(this.targetX, this.targetY)) {
                this.currentTargetShapeId = shapeid;
            }
        },

        _drawRect: function(shapeid, x, y, width, height, lineColor, fillColor) {
            return this._drawShape(
                shapeid,
                [[x, y], [x + width, y], [x + width, y + height], [x, y + height], [x, y]],
                lineColor, fillColor);
        },

        appendShape: function(shape) {
            this.shapes[shape.id] = shape;
            this.shapeseq.push(shape.id);
            this.lastShapeId = shape.id;
            return shape.id;
        },

        replaceWithShape: function(shapeid, shape) {
            this.shapes[shape.id] = shape;
            for (let i = this.shapeseq.length; i--;) {
                if (this.shapeseq[i] === shapeid) {
                    this.shapeseq[i] = shape.id;
                }
            }
            delete this.shapes[shapeid];
        },

        replaceWithShapes: function(shapeids, shapes) {
            const shapemap = {};
            for (let i = shapeids.length; i--;) {
                shapemap[shapeids[i]] = true;
            }
            let first;
            for (let i = this.shapeseq.length; i--;) {
                const sid = this.shapeseq[i];
                if (shapemap[sid]) {
                    this.shapeseq.splice(i, 1);
                    delete this.shapes[sid];
                    first = i;
                }
            }
            for (let i = shapes.length; i--;) {
                this.shapeseq.splice(first, 0, shapes[i].id);
                this.shapes[shapes[i].id] = shapes[i];
            }
        },

        insertAfterShape: function(shapeid, shape) {
            for (let i = this.shapeseq.length; i--;) {
                if (this.shapeseq[i] === shapeid) {
                    this.shapeseq.splice(i + 1, 0, shape.id);
                    this.shapes[shape.id] = shape;
                    return;
                }
            }
        },

        removeShapeId: function(shapeid) {
            for (let i = this.shapeseq.length; i--;) {
                if (this.shapeseq[i] === shapeid) {
                    this.shapeseq.splice(i, 1);
                    break;
                }
            }
            delete this.shapes[shapeid];
        },

        getShapeAt: function(el, x, y) {
            this.targetX = x;
            this.targetY = y;
            this.render();
            return this.currentTargetShapeId;
        },

        render: function() {
            const context = this._getContext();
            context.clearRect(0, 0, this.pixelWidth, this.pixelHeight);
            for (const shapeid of this.shapeseq) {
                const shape = this.shapes[shapeid];
                this['_draw' + shape.type].apply(this, shape.args);
            }
            if (!this.interact) {
                // not interactive so no need to keep the shapes array
                this.shapes = {};
                this.shapeseq = [];
            }
        },

        setMinMax: function(min, max) {
            this._minValue = min;
            this._maxValue = max;
        }
    });


    /**
     * Wraps a format string for tooltips
     * {{x}}
     * {{x.2}
     * {{x:months}}
     */
    $.SPFormatClass = SPFormat = createClass({
        fre: /\{\{([\w.]+?)(:(.+?))?\}\}/g,
        precre: /(\w+)\.(\d+)/,

        init: function(format, fclass) {
            this.format = format;
            this.fclass = fclass;
        },

        render: function(fieldset, lookups, options) {
            const self = this;
            const fields = fieldset;
            let match, token, lookupkey, fieldvalue, prec;
            return this.format.replace(this.fre, function() {
                let lookup;
                token = arguments[1];
                lookupkey = arguments[3];
                match = self.precre.exec(token);
                if (match) {
                    prec = match[2];
                    token = match[1];
                } else {
                    prec = false;
                }
                fieldvalue = fields[token];
                if (fieldvalue === undefined) {
                    return '';
                }
                if (lookupkey && lookups && lookups[lookupkey]) {
                    lookup = lookups[lookupkey];
                    if (lookup.get) { // RangeMap
                        return lookups[lookupkey].get(fieldvalue) || fieldvalue;
                    } else {
                        return lookups[lookupkey][fieldvalue] || fieldvalue;
                    }
                }
                if (isNumber(fieldvalue)) {
                    if (options.get('numberFormatter')) {
                        fieldvalue = options.get('numberFormatter')(fieldvalue);
                    } else {
                        fieldvalue = formatNumber(fieldvalue, prec,
                                                  options.get('numberDigitGroupCount'),
                                                  options.get('numberDigitGroupSep'),
                                                  options.get('numberDecimalMark'));
                    }
                }
                return fieldvalue;
            });
        }
    });


    // convience method to avoid needing the new operator
    $.spformat = function(format, fclass) {
        return new SPFormat(format, fclass);
    };


    function clipval(val, min, max) {
        if (val < min) {
            return min;
        }
        if (val > max) {
            return max;
        }
        return val;
    }


    function quartile(values, q) {
        let vl;
        if (q === 2) {
            vl = Math.floor(values.length / 2);
            return values.length % 2 ? values[vl] : (values[vl-1] + values[vl]) / 2;
        } else {
            if (values.length % 2 ) { // odd
                vl = (values.length * q + q) / 4;
                return vl % 1 ? (values[Math.floor(vl)] + values[Math.floor(vl) - 1]) / 2 : values[vl-1];
            } else { //even
                vl = (values.length * q + 2) / 4;
                return vl % 1 ? (values[Math.floor(vl)] + values[Math.floor(vl) - 1]) / 2 :  values[vl-1];

            }
        }
    }


    function normalizeValue(val) {
        let nf;
        switch (val) {
            case 'undefined':
                val = undefined;
                break;
            case 'null':
                val = null;
                break;
            case 'true':
                val = true;
                break;
            case 'false':
                val = false;
                break;
            default:
                nf = parseFloat(val);
                if (val.toString() === nf.toString()) {
                    val = nf;
                }
        }
        return val;
    }


    function normalizeValues(vals) {
        const result = [];
        for (let i = vals.length; i--;) {
            result[i] = normalizeValue(vals[i]);
        }
        return result;
    }


    function remove(vals, filter) {
        const result = [];
        for (let i = 0; i < vals.length; i++) {
            if (vals[i] !== filter) {
                result.push(vals[i]);
            }
        }
        return result;
    }


    function isNumber(num) {
        return !isNaN(parseFloat(num)) && isFinite(num);
    }


    function formatNumber(num, prec, groupsize, groupsep, decsep) {
        let p;
        num = (prec === false ? parseFloat(num).toString() : num.toFixed(prec)).split('');
        p = (p = $.inArray('.', num)) < 0 ? num.length : p;
        if (p < num.length) {
            num[p] = decsep;
        }
        for (let i = p - groupsize; i > 0; i -= groupsize) {
            num.splice(i, 0, groupsep);
        }
        return num.join('');
    }


    // determine if all values of an array match a value
    // returns true if the array is empty
    function all(val, arr, ignoreNull) {
        for (let i = arr.length; i--; ) {
            if (ignoreNull && arr[i] === null) {
                continue;
            }
            if (arr[i] !== val) {
                return false;
            }
        }
        return true;
    }


    function ensureArray(val) {
        return $.isArray(val) ? val : [val];
    }


    // http://paulirish.com/2008/bookmarklet-inject-new-css-rules/
    function addCSS(css) {
        let tag;
        //if ('\v' == 'v') /* ie only */ {
        if (document.createStyleSheet) {
            document.createStyleSheet().cssText = css;
        } else {
            tag = document.createElement('style');
            tag.type = 'text/css';
            document.getElementsByTagName('head')[0].appendChild(tag);
            tag[(typeof document.body.style.WebkitAppearance === 'string') /* webkit only */ ?
                'innerText' : 'innerHTML'] = css;
        }
    }


    // Provide a cross-browser interface to a few simple drawing primitives
    $.fn.simpledraw = function(width, height, useExisting, interact) {
        let target;
        if (useExisting && (target = this.data('_jqs_vcanvas'))) {
            return target;
        }
        if ($.fn.sparkline.canvas === false) {
            return false;
        } else if ($.fn.sparkline.canvas === undefined) {
            // No function defined yet -- need to see if we support Canvas
            const el = document.createElement('canvas');
            if (el.getContext && el.getContext('2d')) {
                // Canvas is available
                $.fn.sparkline.canvas = (width, height, target, interact) =>
                    new VCanvas_canvas(width, height, target, interact);
            } else {
                $.fn.sparkline.canvas = false;
                return false;
            }
        }
        if (width === undefined) {
            width = $(this).innerWidth();
        }
        if (height === undefined) {
            height = $(this).innerHeight();
        }
        target = $.fn.sparkline.canvas(width, height, this, interact);
        const mhandler = $(this).data('_jqs_mhandler');
        if (mhandler) {
            mhandler.registerCanvas(target);
        }
        return target;
    };


    $.fn.cleardraw = function() {
        const target = this.data('_jqs_vcanvas');
        if (target) {
            target.reset();
        }
    };


    $.RangeMapClass = RangeMap = createClass({
        init: function(map) {
            const rangelist = [];
            for (const key of Object.keys(map)) {
                if (typeof key === 'string' && key.indexOf(':') !== -1) {
                    const range = key.split(':');
                    range[0] = range[0].length === 0 ? -Infinity : parseFloat(range[0]);
                    range[1] = range[1].length === 0 ? Infinity : parseFloat(range[1]);
                    range[2] = map[key];
                    rangelist.push(range);
                }
            }
            this.map = map;
            this.rangelist = rangelist || false;
        },

        get: function(value) {
            if (this.map[value] !== undefined) {
                return this.map[value];
            }
            if (this.rangelist) {
                for (const range of this.rangelist) {
                    if (range[0] <= value && range[1] >= value) {
                        return range[2];
                    }
                }
            }
        }
    });


    // Convenience function
    $.range_map = function(map) {
        return new RangeMap(map);
    };


    const Tooltip = createClass({
        sizeStyle: 'position: static !important;' +
            'display: block !important;' +
            'visibility: hidden !important;' +
            'float: left !important;',

        init: function(options) {
            const tooltipClassname = options.get('tooltipClassname', 'jqstooltip');
            const sizetipStyle = this.sizeStyle;
            this.container = options.get('tooltipContainer') || document.body;
            this.tooltipOffsetX = options.get('tooltipOffsetX', 10);
            this.tooltipOffsetY = options.get('tooltipOffsetY', 12);
            // remove any previous lingering tooltip
            $('#jqssizetip').remove();
            $('#jqstooltip').remove();
            this.sizetip = $('<div/>', {
                id: 'jqssizetip',
                style: sizetipStyle,
                'class': tooltipClassname
            });
            this.tooltip = $('<div/>', {
                id: 'jqstooltip',
                'class': tooltipClassname
            }).appendTo(this.container);
            // account for the container's location
            const offset = this.tooltip.offset();
            // NOTE: Chrome returns floats for these, but mousemove events are seemingly floored.
            // This will lead to occasional mouse events outside our region.
            this.offsetLeft = offset.left;
            this.offsetTop = offset.top;
            this.hidden = true;
            $(window).unbind('resize.jqs scroll.jqs');
            $(window).bind('resize.jqs scroll.jqs', $.proxy(this.updateWindowDims, this));
            this.updateWindowDims();
        },

        updateWindowDims: function() {
            this.scrollTop = $(window).scrollTop();
            this.scrollLeft = $(window).scrollLeft();
            this.scrollRight = this.scrollLeft + $(window).width();
            this.updatePosition();
        },

        getSize: function(content) {
            this.sizetip.html(content).appendTo(this.container);
            this.width = this.sizetip.width() + 1;
            this.height = this.sizetip.height();
            this.sizetip.remove();
        },

        setContent: function(content) {
            if (!content) {
                this.tooltip.css('visibility', 'hidden');
                this.hidden = true;
                return;
            }
            this.getSize(content);
            this.tooltip.html(content)
                .css({
                    'width': this.width,
                    'height': this.height,
                    'visibility': 'visible'
                });
            if (this.hidden) {
                this.hidden = false;
                this.updatePosition();
            }
        },

        updatePosition: function(x, y) {
            if (x === undefined) {
                if (this.mousex === undefined) {
                    return;
                }
                x = this.mousex - this.offsetLeft;
                y = this.mousey - this.offsetTop;

            } else {
                this.mousex = x = x - this.offsetLeft;
                this.mousey = y = y - this.offsetTop;
            }
            if (!this.height || !this.width || this.hidden) {
                return;
            }

            y -= this.height + this.tooltipOffsetY;
            x += this.tooltipOffsetX;

            if (y < this.scrollTop) {
                y = this.scrollTop;
            }
            if (x < this.scrollLeft) {
                x = this.scrollLeft;
            } else if (x + this.width > this.scrollRight) {
                x = this.scrollRight - this.width;
            }

            this.tooltip.css({
                'left': x,
                'top': y
            });
        },

        remove: function() {
            this.tooltip.remove();
            this.sizetip.remove();
            this.sizetip = this.tooltip = undefined;
            $(window).unbind('resize.jqs scroll.jqs');
        }
    });


    const MouseHandler = createClass({
        init: function(el, options) {
            const $el = $(el);
            this.$el = $el;
            this.options = options;
            this.currentPageX = 0;
            this.currentPageY = 0;
            this.el = el;
            this.splist = [];
            this.tooltip = null;
            this.over = false;
            this.displayTooltips = !options.get('disableTooltips');
            this.highlightEnabled = !options.get('disableHighlight');
        },

        registerSparkline: function(sp) {
            this.splist.push(sp);
            if (this.over) {
                this.updateDisplay();
            }
        },

        registerCanvas: function(canvas) {
            const $canvas = $(canvas.canvas);
            this.canvas = canvas;
            this.$canvas = $canvas;
            $canvas.mouseenter($.proxy(this.mouseenter, this));
            $canvas.mouseleave($.proxy(this.mouseleave, this));
            $canvas.click($.proxy(this.mouseclick, this));
        },

        reset: function(removeTooltip) {
            this.splist = [];
            if (this.tooltip && removeTooltip) {
                this.tooltip.remove();
                this.tooltip = undefined;
            }
        },

        mouseclick: function(e) {
            const clickEvent = $.Event('sparklineClick');
            clickEvent.originalEvent = e;
            clickEvent.sparklines = this.splist;
            this.$el.trigger(clickEvent);
        },

        mouseenter: function(e) {
            $(document.body).unbind('mousemove.jqs');
            $(document.body).bind('mousemove.jqs', $.proxy(this.mousemove, this));
            this.over = true;
            this.currentPageX = e.pageX;
            this.currentPageY = e.pageY;
            this.currentEl = e.target;
            if (!this.tooltip && this.displayTooltips) {
                this.tooltip = new Tooltip(this.options);
                this.tooltip.updatePosition(e.pageX, e.pageY);
            }
            this.updateDisplay();
        },

        mouseleave: function() {
            $(document.body).unbind('mousemove.jqs');
            const splist = this.splist;
            const spcount = splist.length;
            let needsRefresh = false;
            this.over = false;
            this.currentEl = null;
            if (this.tooltip) {
                this.tooltip.remove();
                this.tooltip = null;
            }
            for (let i = 0; i < spcount; i++) {
                const sp = splist[i];
                if (sp.clearRegionHighlight()) {
                    needsRefresh = true;
                }
            }
            if (needsRefresh) {
                this.canvas.render();
            }
        },

        mousemove: function(e) {
            this.currentPageX = e.pageX;
            this.currentPageY = e.pageY;
            this.currentEl = e.target;
            if (this.tooltip) {
                this.tooltip.updatePosition(e.pageX, e.pageY);
            }
            this.updateDisplay();
        },

        updateDisplay: function() {
            const splist = this.splist;
            const offset = this.$canvas.offset();
            const localX = this.currentPageX - offset.left;
            const localY = this.currentPageY - offset.top;
            let needsRefresh = false;
            if (!this.over) {
                return;
            }
            for (const sp of splist) {
                needsRefresh |= sp.setRegionHighlight(this.currentEl, localX, localY);
            }
            if (needsRefresh) {
                const changeEvent = $.Event('sparklineRegionChange');
                changeEvent.sparklines = this.splist;
                this.$el.trigger(changeEvent);
                if (this.tooltip) {
                    let tooltiphtml = '';
                    for (const sp of splist) {
                        tooltiphtml += sp.getCurrentRegionTooltip();
                    }
                    this.tooltip.setContent(tooltiphtml);
                }
                if (!this.disableHighlight) {
                    this.canvas.render();
                }
            }
        }
    });


    function initStyles() {
        addCSS(defaultStyles);
    }

    $(initStyles);


    const pending = [];
    $.fn.sparkline = function(userValues, userOptions) {
        return this.each(function() {
            const options = new $.fn.sparkline.options(this, userOptions);
            const $this = $(this);
            const render = function() {
                let values, mhandler;
                if (userValues === 'html' || userValues === undefined) {
                    let vals = this.getAttribute(options.get('tagValuesAttribute'));
                    if (vals === undefined || vals === null) {
                        vals = $this.html();
                    }
                    values = vals.replace(/(^\s*<!--)|(-->\s*$)|\s+/g, '').split(',');
                } else {
                    values = userValues;
                }
                const width = options.get('width') === 'auto' ?
                    values.length * options.get('defaultPixelsPerValue') :
                    options.get('width');
                let height;
                if (options.get('height') === 'auto') {
                    if (!options.get('composite') || !$.data(this, '_jqs_vcanvas')) {
                        // must be a better way to get the line height
                        const tmp = document.createElement('span');
                        tmp.innerText = 'a';
                        $this.html(tmp);
                        height = $(tmp).innerHeight() || $(tmp).height();
                        $(tmp).remove();
                    }
                } else {
                    height = options.get('height');
                }
                if (!options.get('disableInteraction')) {
                    mhandler = $.data(this, '_jqs_mhandler');
                    if (!mhandler) {
                        mhandler = new MouseHandler(this, options);
                        $.data(this, '_jqs_mhandler', mhandler);
                    } else if (!options.get('composite')) {
                        mhandler.reset();
                    }
                } else {
                    mhandler = false;
                }
                if (options.get('composite') && !$.data(this, '_jqs_vcanvas')) {
                    throw new Error(
                        'Attempted to attach a composite sparkline to an element with no existing sparkline');
                }
                const sp = new $.fn.sparkline[options.get('type')](this, values, options, width, height);
                sp.render();
                if (mhandler) {
                    mhandler.registerSparkline(sp);
                }
            };
            if (($(this).html() && !options.get('disableHiddenCheck') && $(this).is(':hidden')) ||
                !$(this).parents('body').length) {
                if (!options.get('composite') && $.data(this, '_jqs_pending')) {
                    // remove any existing references to the element
                    for (let i = pending.length; i; i--) {
                        debugger;
                        if (pending[i - 1][0] == this) {
                            pending.splice(i - 1, 1);
                        }
                    }
                }
                pending.push([this, render]);
                $.data(this, '_jqs_pending', true);
            } else {
                render.call(this);
            }
        });
    };

    $.fn.sparkline.defaults = getDefaults();


    $.sparkline_display_visible = function() {
        const done = [];
        for (let i = 0; i < pending.length; i++) {
            const el = pending[i][0];
            if ($(el).is(':visible') && !$(el).parents().is(':hidden')) {
                pending[i][1].call(el);
                $.data(pending[i][0], '_jqs_pending', false);
                done.push(i);
            } else if (!$(el).closest('html').length && !$.data(el, '_jqs_pending')) {
                // element has been inserted and removed from the DOM
                // If it was not yet inserted into the dom then the .data request
                // will return true.
                // removing from the dom causes the data to be removed.
                $.data(pending[i][0], '_jqs_pending', false);
                done.push(i);
            }
        }
        for (let i = done.length; i; i--) {
            pending.splice(done[i - 1], 1);
        }
    };


    /**
     * User option handler
     */
    $.fn.sparkline.options = createClass({
        init: function(tag, userOptions) {
            this.userOptions = userOptions = userOptions || {};
            this.tag = tag;
            this.tagValCache = {};
            const defaults = $.fn.sparkline.defaults;
            const base = defaults.common;
            this.tagOptionsPrefix = userOptions.enableTagOptions &&
                (userOptions.tagOptionsPrefix || base.tagOptionsPrefix);
            const tagOptionType = this.getTagSetting('type');
            let extendedOptions;
            if (tagOptionType === UNSET_OPTION) {
                extendedOptions = defaults[userOptions.type || base.type];
            } else {
                extendedOptions = defaults[tagOptionType];
            }
            this.mergedOptions = $.extend({}, base, extendedOptions, userOptions);
        },

        getTagSetting: function(key) {
            const prefix = this.tagOptionsPrefix;
            if (prefix === false || prefix === undefined) {
                return UNSET_OPTION;
            }
            let val;
            if (Object.prototype.hasOwnProperty.call(this.tagValCache, key)) {
                val = this.tagValCache.key;
            } else {
                val = this.tag.getAttribute(prefix + key);
                if (val === undefined || val === null) {
                    val = UNSET_OPTION;
                } else if (val.substr(0, 1) === '[') {
                    val = val.substr(1, val.length - 2).split(',');
                    for (let i = val.length; i--;) {
                        val[i] = normalizeValue(val[i].replace(/(^\s*)|(\s*$)/g, ''));
                    }
                } else if (val.substr(0, 1) === '{') {
                    const pairs = val.substr(1, val.length - 2).split(',');
                    val = {};
                    for (let i = pairs.length; i--;) {
                        const keyval = pairs[i].split(':', 2);
                        val[keyval[0].replace(/(^\s*)|(\s*$)/g, '')] =
                            normalizeValue(keyval[1].replace(/(^\s*)|(\s*$)/g, ''));
                    }
                } else {
                    val = normalizeValue(val);
                }
                this.tagValCache.key = val;
            }
            return val;
        },

        get: function(key, defaultval) {
            const tagOption = this.getTagSetting(key);
            let result;
            if (tagOption !== UNSET_OPTION) {
                return tagOption;
            }
            return (result = this.mergedOptions[key]) === undefined ? defaultval : result;
        }
    });


    $.fn.sparkline._base = createClass({
        disabled: false,

        init: function(el, values, options, width, height) {
            this.el = el;
            this.$el = $(el);
            this.values = values;
            this.options = options;
            this.width = width;
            this.height = height;
            this.currentRegion = undefined;
        },

        /**
         * Setup the canvas
         */
        initTarget: function() {
            const interactive = !this.options.get('disableInteraction');
            if (!(this.target = this.$el.simpledraw(this.width, this.height,
                                                    this.options.get('composite'), interactive))) {
                this.disabled = true;
            } else {
                this.canvasWidth = this.target.pixelWidth;
                this.canvasHeight = this.target.pixelHeight;
            }
        },

        /**
         * Actually render the chart to the canvas
         */
        render: function() {
            if (this.disabled) {
                this.el.innerHTML = '';
                return false;
            }
            return true;
        },

        /**
         * Return a region id for a given x/y co-ordinate
         */
        getRegion: function(x, y) {
        },

        /**
         * Highlight an item based on the moused-over x,y co-ordinate
         */
        setRegionHighlight: function(el, x, y) {
            const $canvas = $(this.target.canvas);
            x *= (this.canvasWidth / $canvas.width());
            y *= (this.canvasHeight / $canvas.height());
            const highlightEnabled = !this.options.get('disableHighlight');
            // NOTE: Chrome returns floats for element offsets but on my device (linux with dpr of 1.39)
            // mouse events are always floored (not rounded).  This leads to mouse events that can be off by
            // up to 1.  So sadly some mouse events (typically coming in from the top down) will be out of
            // bounds.  We assume the pointer will continue to move and recover from this...
            if (x > this.canvasWidth || y > this.canvasHeight || x < 0 || y < 0) {
                return false;
            }
            const newRegion = this.getRegion(el, x, y);
            if (this.currentRegion !== newRegion) {
                if (this.currentRegion !== undefined && highlightEnabled) {
                    this.removeHighlight();
                }
                this.currentRegion = newRegion;
                if (newRegion !== undefined && highlightEnabled) {
                    this.renderHighlight();
                }
                return true;
            }
            return false;
        },

        clearRegionHighlight: function() {
            if (this.currentRegion !== undefined) {
                this.removeHighlight();
                this.currentRegion = undefined;
                return true;
            }
            return false;
        },

        renderHighlight: function() {
            this.changeHighlight(true);
        },

        removeHighlight: function() {
            this.changeHighlight(false);
        },

        changeHighlight: function(highlight) {},

        getCurrentRegionTooltip: function() {
            let header = '';
            const entries = [];
            if (this.currentRegion === undefined) {
                return '';
            }
            let fields = this.getCurrentRegionFields();
            const formatter = this.options.get('tooltipFormatter');
            if (formatter) {
                const tooltip = formatter(this, this.options, fields);
                if (!(formatter instanceof SPFormat)) {
                    return `<div class="jqsfield">${tooltip}</div>`;
                } else {
                    return tooltip;
                }
            }
            if (this.options.get('tooltipChartTitle')) {
                header += '<div class="jqs jqstitle">' + this.options.get('tooltipChartTitle') + '</div>\n';
            }
            let formats = this.options.get('tooltipFormat');
            if (!formats) {
                return '';
            }
            if (!$.isArray(formats)) {
                formats = [formats];
            }
            if (!$.isArray(fields)) {
                fields = [fields];
            }
            const showFields = this.options.get('tooltipFormatFieldlist');
            const showFieldsKey = this.options.get('tooltipFormatFieldlistKey');
            if (showFields && showFieldsKey) {
                // user-selected ordering of fields
                const newFields = [];
                for (let i = fields.length; i--;) {
                    const fv = fields[i][showFieldsKey];
                    const j = $.inArray(fv, showFields);
                    debugger;
                    if (j !== -1) {
                        newFields[j] = fields[i];
                    }
                }
                fields = newFields;
            }
            for (let i = 0; i < formats.length; i++) {
                let format = formats[i];
                if (typeof format === 'string') {
                    format = new SPFormat(format);
                }
                const fclass = format.fclass || 'jqsfield';
                for (let j = 0; j < fields.length; j++) {
                    if (!fields[j].isNull || !this.options.get('tooltipSkipNull')) {
                        $.extend(fields[j], {
                            prefix: this.options.get('tooltipPrefix'),
                            suffix: this.options.get('tooltipSuffix')
                        });
                        const text = format.render(
                            fields[j],
                            this.options.get('tooltipValueLookups'), this.options);
                        entries.push('<div class="' + fclass + '">' + text + '</div>');
                    }
                }
            }
            if (entries.length) {
                return header + entries.join('\n');
            }
            return '';
        },

        getCurrentRegionFields: function() {},

        calcHighlightColor: function(color, options) {
            const highlightColor = options.get('highlightColor');
            if (highlightColor) {
                return highlightColor;
            }
            const lighten = options.get('highlightLighten');
            if (lighten) {
                // extract RGB values
                const parse = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(color) ||
                    /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
                if (parse) {
                    const rgbnew = [];
                    const mult = color.length === 4 ? 16 : 1;
                    for (let i = 0; i < 3; i++) {
                        rgbnew[i] = clipval(Math.round(parseInt(parse[i + 1], 16) * mult * lighten), 0, 255);
                    }
                    return 'rgb(' + rgbnew.join(',') + ')';
                }

            }
            return color;
        }
    });


    const barHighlightMixin = {
        changeHighlight: function(highlight) {
            const shapeids = this.regionShapes[this.currentRegion];
            // will be null if the region value was null
            if (shapeids) {
                const newShapes = this.renderRegion(this.currentRegion, highlight);
                if ($.isArray(newShapes) || $.isArray(shapeids)) {
                    this.target.replaceWithShapes(shapeids, newShapes);
                    this.regionShapes[this.currentRegion] = $.map(newShapes, x => x.id);
                } else {
                    this.target.replaceWithShape(shapeids, newShapes);
                    this.regionShapes[this.currentRegion] = newShapes.id;
                }
            }
        },

        render: function() {
            if (!this.cls._super.render.call(this)) {
                return;
            }
            for (let i = this.values.length; i--;) {
                const shapes = this.renderRegion(i);
                if (shapes) {
                    if ($.isArray(shapes)) {
                        const ids = [];
                        for (let j = shapes.length; j--;) {
                            shapes[j].append();
                            ids.push(shapes[j].id);
                        }
                        this.regionShapes[i] = ids;
                    } else {
                        shapes.append();
                        this.regionShapes[i] = shapes.id;
                    }
                } else {
                    this.regionShapes[i] = null;
                }
            }
            this.target.render();
        }
    };


    $.fn.sparkline.line = line = createClass($.fn.sparkline._base, {
        type: 'line',

        init: function(el, values, options, width, height) {
            line._super.init.call(this, el, values, options, width, height);
            this.vertices = [];
            this.regionMap = [];
            this.xvalues = [];
            this.yvalues = [];
            this.yminmax = [];
            this.hightlightSpotId = null;
            this.lastShapeId = null;
            this.initTarget();
        },

        getRegion: function(el, x, y) {
            for (let i = this.regionMap.length; i--;) {
                if (this.regionMap[i] !== null &&
                    x >= this.regionMap[i][0] &&
                    x <= this.regionMap[i][1]) {
                    return this.regionMap[i][2];
                }
            }
            return undefined;
        },

        getCurrentRegionFields: function() {
            return {
                isNull: this.yvalues[this.currentRegion] === null,
                x: this.xvalues[this.currentRegion],
                y: this.yvalues[this.currentRegion],
                color: this.options.get('lineColor'),
                fillColor: this.options.get('fillColor'),
                offset: this.currentRegion
            };
        },

        renderHighlight: function() {
            const vertex = this.vertices[this.currentRegion];
            if (!vertex) {
                return;
            }
            const spotRadius = this.options.get('spotRadius');
            const highlightSpotColor = this.options.get('highlightSpotColor');
            if (spotRadius && highlightSpotColor) {
                const highlightSpot = this.target.drawCircle(
                    vertex[0], vertex[1], spotRadius, undefined, highlightSpotColor);
                this.highlightSpotId = highlightSpot.id;
                this.target.insertAfterShape(this.lastShapeId, highlightSpot);
            }
            const highlightLineColor = this.options.get('highlightLineColor');
            if (highlightLineColor) {
                const highlightLine = this.target.drawLine(
                    vertex[0], this.canvasTop, vertex[0],
                    this.canvasTop + this.canvasHeight, highlightLineColor);
                this.highlightLineId = highlightLine.id;
                this.target.insertAfterShape(this.lastShapeId, highlightLine);
            }
        },

        removeHighlight: function() {
            if (this.highlightSpotId) {
                this.target.removeShapeId(this.highlightSpotId);
                this.highlightSpotId = null;
            }
            if (this.highlightLineId) {
                this.target.removeShapeId(this.highlightLineId);
                this.highlightLineId = null;
            }
        },

        scanValues: function() {
            for (let i = 0; i < this.values.length; i++) {
                const val = this.values[i];
                const isStr = typeof(this.values[i]) === 'string';
                const isArray = typeof(this.values[i]) === 'object' && this.values[i] instanceof Array;
                const sp = isStr && this.values[i].split(':');
                if (isStr && sp.length === 2) { // x:y
                    this.xvalues.push(Number(sp[0]));
                    this.yvalues.push(Number(sp[1]));
                    this.yminmax.push(Number(sp[1]));
                } else if (isArray) {
                    this.xvalues.push(val[0]);
                    this.yvalues.push(val[1]);
                    this.yminmax.push(val[1]);
                } else {
                    this.xvalues.push(i);
                    if (this.values[i] === null || this.values[i] === 'null') {
                        this.yvalues.push(null);
                    } else {
                        this.yvalues.push(Number(val));
                        this.yminmax.push(Number(val));
                    }
                }
            }
            if (this.options.get('xvalues')) {
                this.xvalues = this.options.get('xvalues');
            }
            this.maxy = this.maxyorg = sauce.data.max(this.yminmax);
            this.miny = this.minyorg = sauce.data.min(this.yminmax);
            this.maxx = sauce.data.max(this.xvalues);
            this.minx = sauce.data.min(this.xvalues);
        },

        processRangeOptions: function() {
            const normalRangeMin = this.options.get('normalRangeMin');
            if (normalRangeMin !== undefined) {
                if (normalRangeMin < this.miny) {
                    this.miny = normalRangeMin;
                }
                const normalRangeMax = this.options.get('normalRangeMax');
                if (normalRangeMax > this.maxy) {
                    this.maxy = normalRangeMax;
                }
            }
            if (this.options.get('chartRangeMin') !== undefined &&
                (this.options.get('chartRangeClip') || this.options.get('chartRangeMin') < this.miny)) {
                this.miny = this.options.get('chartRangeMin');
            }
            if (this.options.get('chartRangeMax') !== undefined &&
                (this.options.get('chartRangeClip') || this.options.get('chartRangeMax') > this.maxy)) {
                this.maxy = this.options.get('chartRangeMax');
            }
            if (this.options.get('chartRangeMinX') !== undefined &&
                (this.options.get('chartRangeClipX') || this.options.get('chartRangeMinX') < this.minx)) {
                this.minx = this.options.get('chartRangeMinX');
            }
            if (this.options.get('chartRangeMaxX') !== undefined &&
                (this.options.get('chartRangeClipX') || this.options.get('chartRangeMaxX') > this.maxx)) {
                this.maxx = this.options.get('chartRangeMaxX');
            }
        },

        drawNormalRange: function(canvasLeft, canvasTop, canvasHeight, canvasWidth, rangey) {
            const normalRangeMin = this.options.get('normalRangeMin');
            const normalRangeMax = this.options.get('normalRangeMax');
            const ytop = canvasTop + Math.round(canvasHeight -
                (canvasHeight * ((normalRangeMax - this.miny) / rangey)));
            const height = Math.round((canvasHeight * (normalRangeMax - normalRangeMin)) / rangey);
            this.target.drawRect(canvasLeft, ytop, canvasWidth, height, undefined,
                                 this.options.get('normalRangeColor')).append();
        },

        render: function() {
            let canvasWidth = this.canvasWidth;
            let canvasHeight = this.canvasHeight;
            let spotRadius = this.options.get('spotRadius');
            if (!line._super.render.call(this)) {
                return;
            }
            this.scanValues();
            this.processRangeOptions();
            this.target.setMinMax(this.miny, this.maxy);
            if (!this.yminmax.length || this.yvalues.length < 2) {
                // empty or all null valuess
                return;
            }
            let canvasTop = 0;
            let canvasLeft = 0;
            const rangex = this.maxx - this.minx === 0 ? 1 : this.maxx - this.minx;
            const rangey = this.maxy - this.miny === 0 ? 1 : this.maxy - this.miny;
            const yvallast = this.yvalues.length - 1;
            if (spotRadius && (canvasWidth < (spotRadius * 4) || canvasHeight < (spotRadius * 4))) {
                spotRadius = 0;
            }
            if (spotRadius) {
                // adjust the canvas size as required so that spots will fit
                const hlSpotsEnabled = this.options.get('highlightSpotColor') &&
                    !this.options.get('disableInteraction');
                if (hlSpotsEnabled || this.options.get('minSpotColor') ||
                    (this.options.get('spotColor') && this.yvalues[yvallast] === this.miny)) {
                    canvasHeight -= Math.ceil(spotRadius);
                }
                if (hlSpotsEnabled || this.options.get('maxSpotColor') ||
                    (this.options.get('spotColor') && this.yvalues[yvallast] === this.maxy)) {
                    canvasHeight -= Math.ceil(spotRadius);
                    canvasTop += Math.ceil(spotRadius);
                }
                if (hlSpotsEnabled ||
                     ((this.options.get('minSpotColor') || this.options.get('maxSpotColor')) &&
                      (this.yvalues[0] === this.miny || this.yvalues[0] === this.maxy))) {
                    canvasLeft += Math.ceil(spotRadius);
                    canvasWidth -= Math.ceil(spotRadius);
                }
                if (hlSpotsEnabled || this.options.get('spotColor') ||
                    (this.options.get('minSpotColor') || this.options.get('maxSpotColor') &&
                        (this.yvalues[yvallast] === this.miny || this.yvalues[yvallast] === this.maxy))) {
                    canvasWidth -= Math.ceil(spotRadius);
                }
            }
            canvasHeight--;
            if (this.options.get('normalRangeMin') !== undefined && !this.options.get('drawNormalOnTop')) {
                this.drawNormalRange(canvasLeft, canvasTop, canvasHeight, canvasWidth, rangey);
            }
            let path = [];
            const paths = [path];
            let last = null;
            for (let i = 0; i < this.yvalues.length; i++) {
                const x = this.xvalues[i];
                const xnext = this.xvalues[i + 1];
                let y = this.yvalues[i];
                const xpos = canvasLeft + Math.round((x - this.minx) * (canvasWidth / rangex));
                const xposnext = i < this.yvalues.length - 1 ?
                    canvasLeft + Math.round((xnext - this.minx) * (canvasWidth / rangex)) :
                    canvasWidth;
                const next = xpos + ((xposnext - xpos) / 2);
                this.regionMap[i] = [last || 0, next, i];
                last = next;
                if (y === null) {
                    if (i) {
                        if (this.yvalues[i - 1] !== null) {
                            path = [];
                            paths.push(path);
                        }
                        this.vertices.push(null);
                    }
                } else {
                    if (y < this.miny) {
                        y = this.miny;
                    }
                    if (y > this.maxy) {
                        y = this.maxy;
                    }
                    if (!path.length) {
                        // previous value was null
                        path.push([xpos, canvasTop + canvasHeight]);
                    }
                    const vertex = [
                        xpos,
                        canvasTop + Math.round(canvasHeight - (canvasHeight * ((y - this.miny) / rangey)))
                    ];
                    path.push(vertex);
                    this.vertices.push(vertex);
                }
            }
            const lineShapes = [];
            const fillShapes = [];
            for (let i = 0; i < paths.length; i++) {
                const path = paths[i];
                if (path.length) {
                    if (this.options.get('fillColor')) {
                        path.push([path[path.length - 1][0], (canvasTop + canvasHeight)]);
                        fillShapes.push(path.slice(0));
                        path.pop();
                    }
                    // if there's only a single point in this path, then we want to display it
                    // as a vertical line which means we keep path[0]  as is
                    if (path.length > 2) {
                        // else we want the first value
                        path[0] = [path[0][0], path[1][1]];
                    }
                    lineShapes.push(path);
                }
            }
            // draw the fill first, then optionally the normal range, then the line on top of that
            for (let i = 0; i < fillShapes.length; i++) {
                this.target.drawShape(fillShapes[i], undefined, this.options.get('fillColor')).append();
            }
            if (this.options.get('normalRangeMin') !== undefined && this.options.get('drawNormalOnTop')) {
                this.drawNormalRange(canvasLeft, canvasTop, canvasHeight, canvasWidth, rangey);
            }
            for (let i = 0; i < lineShapes.length; i++) {
                this.target.drawShape(lineShapes[i], this.options.get('lineColor'), undefined,
                                      this.options.get('lineWidth')).append();
            }
            if (spotRadius && this.options.get('valueSpots')) {
                let valueSpots = this.options.get('valueSpots');
                if (valueSpots.get === undefined) {
                    valueSpots = new RangeMap(valueSpots);
                }
                for (let i = 0; i < this.yvalues.length; i++) {
                    const color = valueSpots.get(this.yvalues[i]);
                    if (color) {
                        this.target.drawCircle(
                            canvasLeft + Math.round((this.xvalues[i] - this.minx) * (canvasWidth / rangex)),
                            canvasTop + Math.round(canvasHeight -
                                (canvasHeight * ((this.yvalues[i] - this.miny) / rangey))),
                            spotRadius, undefined,
                            color).append();
                    }
                }
            }
            if (spotRadius && this.options.get('spotColor') && this.yvalues[yvallast] !== null) {
                this.target.drawCircle(
                    canvasLeft + Math.round((this.xvalues[this.xvalues.length - 1] - this.minx) *
                        (canvasWidth / rangex)),
                    canvasTop + Math.round(canvasHeight -
                        (canvasHeight * ((this.yvalues[yvallast] - this.miny) / rangey))),
                    spotRadius, undefined,
                    this.options.get('spotColor')).append();
            }
            if (this.maxy !== this.minyorg) {
                if (spotRadius && this.options.get('minSpotColor')) {
                    const x = this.xvalues[$.inArray(this.minyorg, this.yvalues)];
                    this.target.drawCircle(
                        canvasLeft + Math.round((x - this.minx) * (canvasWidth / rangex)),
                        canvasTop + Math.round(canvasHeight -
                            (canvasHeight * ((this.minyorg - this.miny) / rangey))),
                        spotRadius, undefined,
                        this.options.get('minSpotColor')).append();
                }
                if (spotRadius && this.options.get('maxSpotColor')) {
                    const x = this.xvalues[$.inArray(this.maxyorg, this.yvalues)];
                    this.target.drawCircle(
                        canvasLeft + Math.round((x - this.minx) * (canvasWidth / rangex)),
                        canvasTop + Math.round(canvasHeight -
                            (canvasHeight * ((this.maxyorg - this.miny) / rangey))),
                        spotRadius, undefined,
                        this.options.get('maxSpotColor')).append();
                }
            }
            this.lastShapeId = this.target.getLastShapeId();
            this.canvasTop = canvasTop;
            this.target.render();
        }
    });


    $.fn.sparkline.bar = bar = createClass($.fn.sparkline._base, barHighlightMixin, {
        type: 'bar',

        init: function(el, values, options, width, height) {
            const barWidth = parseInt(options.get('barWidth'), 10),
                barSpacing = parseInt(options.get('barSpacing'), 10),
                chartRangeMin = options.get('chartRangeMin'),
                chartRangeMax = options.get('chartRangeMax'),
                chartRangeClip = options.get('chartRangeClip');
            let stackMin = Infinity,
                stackMax = -Infinity,
                isStackString, groupMin, groupMax,
                min, max, clipMin, clipMax,
                stacked, vlist, svals, val, yMaxCalc;
            bar._super.init.call(this, el, values, options, width, height);
            // scan values to determine whether to stack bars
            this.barWidths = [];
            for (let i = 0; i < values.length; i++) {
                val = values[i];
                this.barWidths.push(barWidth);
                isStackString = typeof(val) === 'string' && val.indexOf(':') > -1;
                if (isStackString || $.isArray(val)) {
                    stacked = true;
                    if (isStackString) {
                        val = values[i] = normalizeValues(val.split(':'));
                    }
                    val = remove(val, null); // min/max will treat null as zero
                    groupMin = sauce.data.min(val);
                    groupMax = sauce.data.max(val);
                    if (groupMin < stackMin) {
                        stackMin = groupMin;
                    }
                    if (groupMax > stackMax) {
                        stackMax = groupMax;
                    }
                } else if (typeof val === 'object') {
                    if (val.width != null) {
                        this.barWidths[i] = Math.round(val.width);
                    }
                    values[i] = val.value;
                }
            }
            this.stacked = stacked;
            this.regionShapes = {};
            this.barWidth = barWidth;
            this.barSpacing = barSpacing;
            this.width = width = this.barWidths.reduce((agg, x) => agg + x) +
                ((values.length - 1) * barSpacing);
            this.initTarget();
            if (chartRangeClip) {
                clipMin = chartRangeMin === undefined ? -Infinity : chartRangeMin;
                clipMax = chartRangeMax === undefined ? Infinity : chartRangeMax;
            }
            const numValues = [];
            const stackRanges = stacked ? [] : numValues;
            const stackTotals = [];
            const stackRangesNeg = [];
            for (let i = 0; i < values.length; i++) {
                if (stacked) {
                    vlist = values[i];
                    values[i] = svals = [];
                    stackTotals[i] = 0;
                    stackRanges[i] = stackRangesNeg[i] = 0;
                    for (let j = 0; j < vlist.length; j++) {
                        val = svals[j] = chartRangeClip ? clipval(vlist[j], clipMin, clipMax) : vlist[j];
                        if (val !== null) {
                            if (val > 0) {
                                stackTotals[i] += val;
                            }
                            if (stackMin < 0 && stackMax > 0) {
                                if (val < 0) {
                                    stackRangesNeg[i] += Math.abs(val);
                                } else {
                                    stackRanges[i] += val;
                                }
                            } else {
                                stackRanges[i] += Math.abs(val - (val < 0 ? stackMax : stackMin));
                            }
                            numValues.push(val);
                        }
                    }
                } else {
                    val = chartRangeClip ? clipval(values[i], clipMin, clipMax) : values[i];
                    val = values[i] = normalizeValue(val);
                    if (val !== null) {
                        numValues.push(val);
                    }
                }
            }
            this.max = max = sauce.data.max(numValues);
            this.min = min = sauce.data.min(numValues);
            this.stackMax = stackMax = stacked ? sauce.data.max(stackTotals) : max;
            this.stackMin = stackMin = min;
            if (options.get('chartRangeMin') !== undefined &&
                (options.get('chartRangeClip') || options.get('chartRangeMin') < min)) {
                min = options.get('chartRangeMin');
            }
            if (options.get('chartRangeMax') !== undefined &&
                (options.get('chartRangeClip') || options.get('chartRangeMax') > max)) {
                max = options.get('chartRangeMax');
            }
            const zeroAxis = options.get('zeroAxis', true);
            if (min <= 0 && max >= 0 && zeroAxis) {
                this.xaxisOffset = 0;
            } else if (zeroAxis == false) {
                debugger;
                this.xaxisOffset = min;
            } else if (min > 0) {
                this.xaxisOffset = min;
            } else {
                this.xaxisOffset = max;
            }
            const range = stacked ? sauce.data.max(stackRanges) + sauce.data.max(stackRangesNeg) : max - min;
            // as we plot zero/min values a single pixel line, we add a pixel to all other
            // values - Reduce the effective canvas size to suit
            this.canvasHeightEf = (zeroAxis && min < 0) ? this.canvasHeight - 2 : this.canvasHeight - 1;
            if (min < this.xaxisOffset) {
                yMaxCalc = (stacked && max >= 0) ? stackMax : max;
                this.yoffset = (yMaxCalc - this.xaxisOffset) / range * this.canvasHeight;
                if (this.yoffset !== Math.ceil(this.yoffset)) {
                    this.canvasHeightEf -= 2;
                    this.yoffset = Math.ceil(this.yoffset);
                }
            } else {
                this.yoffset = this.canvasHeight;
            }
            if ($.isArray(options.get('colorMap'))) {
                this.colorMapByIndex = options.get('colorMap');
                this.colorMapByValue = null;
            } else {
                this.colorMapByIndex = null;
                this.colorMapByValue = options.get('colorMap');
                if (this.colorMapByValue && this.colorMapByValue.get === undefined) {
                    this.colorMapByValue = new RangeMap(this.colorMapByValue);
                }
            }
            this.range = range;
        },

        getRegion: function(el, x, y) {
            let idx;
            let end = 0;
            for (idx = 0; idx < this.barWidths.length; idx++) {
                end += this.barWidths[idx] + (this.barSpacing / 2);
                if (x < end) {
                    break;
                }
                end += this.barSpacing / 2;
            }
            return idx;
        },

        getCurrentRegionFields: function() {
            const values = ensureArray(this.values[this.currentRegion]);
            const result = [];
            for (let i = values.length; i--;) {
                const value = values[i];
                result.push({
                    isNull: value === null,
                    value: value,
                    color: this.calcColor(i, value, this.currentRegion),
                    offset: this.currentRegion
                });
            }
            return result;
        },

        calcColor: function(stacknum, value, idx) {
            let color;
            if (this.stacked) {
                color = this.options.get('stackedBarColor');
            } else {
                color = (value < 0) ? this.options.get('negBarColor') : this.options.get('barColor');
            }
            if (value === 0 && this.options.get('zeroColor') !== undefined) {
                color = this.options.get('zeroColor');
            }
            let newColor;
            if (this.colorMapByValue && (newColor = this.colorMapByValue.get(value))) {
                color = newColor;
            } else if (this.colorMapByIndex && this.colorMapByIndex.length > idx) {
                color = this.colorMapByIndex[idx];
            }
            return $.isArray(color) ? color[stacknum % color.length] : color;
        },

        /**
         * Render bar(s) for a region
         */
        renderRegion: function(idx, highlight) {
            let vals = this.values[idx];
            vals = $.isArray(vals) ? vals : [vals];
            let val = vals[0];
            const result = [];
            let y;
            const x = this.barWidths.slice(0, idx).reduce((agg, x) => agg + x + this.barSpacing, 0);
            let yoffset = this.yoffset;
            const isNull = all(null, vals);
            const allMin = all(this.xaxisOffset, vals, true);
            if (isNull) {
                if (this.options.get('nullColor')) {
                    const color = highlight ?
                        this.options.get('nullColor') :
                        this.calcHighlightColor(this.options.get('nullColor'), this.options);
                    y = (yoffset > 0) ? yoffset - 1 : yoffset;
                    return this.target.drawRect(x, y, this.barWidths[idx] - 1, 0, color, color);
                } else {
                    return undefined;
                }
            }
            let yoffsetNeg = yoffset;
            let minPlotted;
            for (let i = 0; i < vals.length; i++) {
                val = vals[i];
                if (this.stacked && val === this.xaxisOffset) {
                    if (!allMin || minPlotted) {
                        continue;
                    }
                    minPlotted = true;
                }
                let height;
                if (this.range > 0) {
                    height = Math.floor(this.canvasHeightEf *
                        ((Math.abs(val - this.xaxisOffset) / this.range))) + 1;
                } else {
                    height = 1;
                }
                if (val < this.xaxisOffset || (val === this.xaxisOffset && yoffset === 0)) {
                    y = yoffsetNeg;
                    yoffsetNeg += height;
                } else {
                    y = yoffset - height;
                    yoffset -= height;
                }
                let color = this.calcColor(i, val, idx);
                if (highlight) {
                    color = this.calcHighlightColor(color, this.options);
                }
                result.push(this.target.drawRect(x, y, this.barWidths[idx] - 1, height - 1, color, color));
            }
            if (result.length === 1) {
                return result[0];
            }
            return result;
        }
    });


    /**
     * WIP color filled line based on value.
     */
    $.fn.sparkline.colorline = colorline = createClass($.fn.sparkline._base, barHighlightMixin, {
        type: 'colorline',

        init: function(el, values, options, width, height) {
            colorline._super.init.call(this, el, values, options, width, height);
            this.initTarget();
            this.barWidth = this.canvasWidth / values.length;
            const chartRangeMin = options.get('chartRangeMin');
            const chartRangeMax = options.get('chartRangeMax');
            const chartRangeClip = options.get('chartRangeClip');
            if (values && values.length) {
                const isStackString = typeof(values[0]) === 'string' && values[0].indexOf(':') > -1;
                if (isStackString || Array.isArray(values[0])) {
                    throw new TypeError("Stacked data not supported");
                }
            }
            this.regionShapes = {};
            let clipMin;
            let clipMax;
            if (chartRangeClip) {
                clipMin = chartRangeMin === undefined ? -Infinity : chartRangeMin;
                clipMax = chartRangeMax === undefined ? Infinity : chartRangeMax;
            }
            let min = Infinity;
            let max = -Infinity;
            for (let i = 0; i < values.length; i++) {
                const normValue = values[i] = normalizeValue(chartRangeClip ?
                    clipval(values[i], clipMin, clipMax) : values[i]);
                if (normValue !== null) {
                    if (normValue > max) {
                        max = normValue;
                    }
                    if (normValue < min) {
                        min = normValue;
                    }
                }
            }
            if (chartRangeMin !== undefined && (chartRangeClip || chartRangeMin < min)) {
                min = chartRangeMin;
            }
            if (chartRangeMax !== undefined && (chartRangeClip || chartRangeMax > max)) {
                max = chartRangeMax;
            }
            const zeroAxis = options.get('zeroAxis', true);
            if (min <= 0 && max >= 0 && zeroAxis) {
                this.xaxisOffset = 0;
            } else if (zeroAxis == false) {
                debugger;
                this.xaxisOffset = min;
            } else if (min > 0) {
                this.xaxisOffset = min;
            } else {
                this.xaxisOffset = max;
            }
            const range = max - min;
            // as we plot zero/min values a single pixel line, we add a pixel to all other
            // values - Reduce the effective canvas size to suit
            this.canvasHeightEf = (zeroAxis && min < 0) ? this.canvasHeight - 2 : this.canvasHeight - 1;
            if (min < this.xaxisOffset) {
                this.yoffset = (max - this.xaxisOffset) / range * this.canvasHeight;
                if (this.yoffset !== Math.ceil(this.yoffset)) {
                    this.canvasHeightEf -= 2;
                    this.yoffset = Math.ceil(this.yoffset);
                }
            } else {
                this.yoffset = this.canvasHeight;
            }
            if ($.isArray(options.get('colorMap'))) {
                this.colorMapByIndex = options.get('colorMap');
                this.colorMapByValue = null;
            } else {
                this.colorMapByIndex = null;
                this.colorMapByValue = options.get('colorMap');
                if (this.colorMapByValue && this.colorMapByValue.get === undefined) {
                    this.colorMapByValue = new RangeMap(this.colorMapByValue);
                }
            }
            this.range = range;
        },

        getRegion: function(el, x, y) {
            const result = Math.floor(x / this.barWidth);
            return (result < 0 || result >= this.values.length) ? undefined : result;
        },

        getCurrentRegionFields: function() {
            const values = ensureArray(this.values[this.currentRegion]);
            const result = [];
            for (let i = values.length; i--;) {
                const value = values[i];
                result.push({
                    isNull: value === null,
                    value,
                    color: this.calcColor(i, value, this.currentRegion),
                    offset: this.currentRegion
                });
            }
            return result;
        },

        calcColor: function(stacknum, value, idx) {
            let color = (value < 0) ? this.options.get('negBarColor') : this.options.get('barColor');
            if (value === 0 && this.options.get('zeroColor') !== undefined) {
                color = this.options.get('zeroColor');
            }
            let newColor;
            if (this.colorMapByValue && (newColor = this.colorMapByValue.get(value))) {
                color = newColor;
            } else if (this.colorMapByIndex && this.colorMapByIndex.length > idx) {
                color = this.colorMapByIndex[idx];
            }
            return $.isArray(color) ? color[stacknum % color.length] : color;
        },

        renderRegion: function(idx, highlight) {
            let vals = this.values[idx];
            vals = $.isArray(vals) ? vals : [vals];
            const result = [];
            const x = idx * this.barWidth;
            let yoffset = this.yoffset;
            if (all(null, vals)) {
                if (this.options.get('nullColor')) {
                    const color = highlight ? this.options.get('nullColor') :
                        this.calcHighlightColor(this.options.get('nullColor'), this.options);
                    const y = (yoffset > 0) ? yoffset - 1 : yoffset;
                    return this.target.drawRect(x, y, this.barWidth, 0, color, color);
                } else {
                    return;
                }
            }
            let yoffsetNeg = yoffset;
            for (let i = 0; i < vals.length; i++) {
                const val = vals[i];
                let height;
                if (this.range > 0) {
                    height = Math.floor(this.canvasHeightEf *
                        ((Math.abs(val - this.xaxisOffset) / this.range))) + 1;
                } else {
                    height = 1;
                }
                let y;
                if (val < this.xaxisOffset || (val === this.xaxisOffset && yoffset === 0)) {
                    y = yoffsetNeg;
                    yoffsetNeg += height;
                } else {
                    y = yoffset - height;
                    yoffset -= height;
                }
                let color = this.calcColor(i, val, idx);
                if (highlight) {
                    color = this.calcHighlightColor(color, this.options);
                }
                result.push(this.target.drawRect(x, y, this.barWidth, height - 1, undefined, color));
            }
            if (result.length === 1) {
                return result[0];
            }
            return result;
        }
    });


    $.fn.sparkline.tristate = tristate = createClass($.fn.sparkline._base, barHighlightMixin, {
        type: 'tristate',

        init: function(el, values, options, width, height) {
            const barWidth = parseInt(options.get('barWidth'), 10);
            const barSpacing = parseInt(options.get('barSpacing'), 10);
            tristate._super.init.call(this, el, values, options, width, height);

            this.regionShapes = {};
            this.barWidth = barWidth;
            this.barSpacing = barSpacing;
            this.totalBarWidth = barWidth + barSpacing;
            this.values = $.map(values, Number);
            this.width = width = (values.length * barWidth) + ((values.length - 1) * barSpacing);

            if ($.isArray(options.get('colorMap'))) {
                this.colorMapByIndex = options.get('colorMap');
                this.colorMapByValue = null;
            } else {
                this.colorMapByIndex = null;
                this.colorMapByValue = options.get('colorMap');
                if (this.colorMapByValue && this.colorMapByValue.get === undefined) {
                    this.colorMapByValue = new RangeMap(this.colorMapByValue);
                }
            }
            this.initTarget();
        },

        getRegion: function(el, x, y) {
            return Math.floor(x / this.totalBarWidth);
        },

        getCurrentRegionFields: function() {
            return {
                isNull: this.values[this.currentRegion] === undefined,
                value: this.values[this.currentRegion],
                color: this.calcColor(this.values[this.currentRegion], this.currentRegion),
                offset: this.currentRegion
            };
        },

        calcColor: function(value, idx) {
            let color, newColor;
            if (this.colorMapByValue && (newColor = this.colorMapByValue.get(value))) {
                color = newColor;
            } else if (this.colorMapByIndex && this.colorMapByIndex.length > idx) {
                color = this.colorMapByIndex[idx];
            } else if (this.values[idx] < 0) {
                color = this.options.get('negBarColor');
            } else if (this.values[idx] > 0) {
                color = this.options.get('posBarColor');
            } else {
                color = this.options.get('zeroBarColor');
            }
            return color;
        },

        renderRegion: function(idx, highlight) {
            let height, y;
            const halfHeight = Math.round(this.target.pixelHeight / 2);
            const x = idx * this.totalBarWidth;
            if (this.values[idx] < 0) {
                y = halfHeight;
                height = halfHeight - 1;
            } else if (this.values[idx] > 0) {
                y = 0;
                height = halfHeight - 1;
            } else {
                y = halfHeight - 1;
                height = 2;
            }
            let color = this.calcColor(this.values[idx], idx);
            if (color === null) {
                return;
            }
            if (highlight) {
                color = this.calcHighlightColor(color, this.options);
            }
            return this.target.drawRect(x, y, this.barWidth - 1, height - 1, color, color);
        }
    });


    $.fn.sparkline.discrete = discrete = createClass($.fn.sparkline._base, barHighlightMixin, {
        type: 'discrete',

        init: function(el, values, options, width, height) {
            discrete._super.init.call(this, el, values, options, width, height);

            this.regionShapes = {};
            this.values = values = $.map(values, Number);
            this.min = sauce.data.min(values);
            this.max = sauce.data.max(values);
            this.range = this.max - this.min;
            this.width = width = options.get('width') === 'auto' ? values.length * 2 : this.width;
            this.interval = Math.floor(width / values.length);
            this.itemWidth = width / values.length;
            if (options.get('chartRangeMin') !== undefined &&
                (options.get('chartRangeClip') || options.get('chartRangeMin') < this.min)) {
                this.min = options.get('chartRangeMin');
            }
            if (options.get('chartRangeMax') !== undefined &&
                (options.get('chartRangeClip') || options.get('chartRangeMax') > this.max)) {
                this.max = options.get('chartRangeMax');
            }
            this.initTarget();
            if (this.target) {
                this.lineHeight = options.get('lineHeight') === 'auto' ?
                    Math.round(this.canvasHeight * 0.3) : options.get('lineHeight');
            }
        },

        getRegion: function(el, x, y) {
            return Math.floor(x / this.itemWidth);
        },

        getCurrentRegionFields: function() {
            return {
                isNull: this.values[this.currentRegion] === undefined,
                value: this.values[this.currentRegion],
                offset: this.currentRegion
            };
        },

        renderRegion: function(idx, highlight) {
            const pHeight = this.canvasHeight - this.lineHeight;
            const val = clipval(this.values[idx], this.min, this.max);
            const x = idx * this.interval;
            const ytop = Math.round(pHeight - pHeight * ((val - this.min) / this.range));
            let color = (this.options.get('thresholdColor') && val < this.options.get('thresholdValue')) ?
                this.options.get('thresholdColor') : this.options.get('lineColor');
            if (highlight) {
                color = this.calcHighlightColor(color, this.options);
            }
            return this.target.drawLine(x, ytop, x, ytop + this.lineHeight, color);
        }
    });


    $.fn.sparkline.bullet = bullet = createClass($.fn.sparkline._base, {
        type: 'bullet',

        init: function(el, values, options, width, height) {
            bullet._super.init.call(this, el, values, options, width, height);
            // values: target, performance, range1, range2, range3
            this.values = values = normalizeValues(values);
            // target or performance could be null
            const vals = values.slice();
            vals[0] = vals[0] === null ? vals[2] : vals[0];
            vals[1] = values[1] === null ? vals[2] : vals[1];
            let min = sauce.data.min(values);
            const max = sauce.data.max(values);
            if (options.get('base') === undefined) {
                min = min < 0 ? min : 0;
            } else {
                min = options.get('base');
            }
            this.min = min;
            this.max = max;
            this.range = max - min;
            this.shapes = {};
            this.valueShapes = {};
            this.regiondata = {};
            this.width = width = options.get('width') === 'auto' ? '4.0em' : width;
            this.target = this.$el.simpledraw(width, height, options.get('composite'));
            if (!values.length) {
                this.disabled = true;
            }
            this.initTarget();
        },

        getRegion: function(el, x, y) {
            const shapeid = this.target.getShapeAt(el, x, y);
            return (shapeid !== undefined && this.shapes[shapeid] !== undefined) ?
                this.shapes[shapeid] : undefined;
        },

        getCurrentRegionFields: function() {
            return {
                fieldkey: this.currentRegion.substr(0, 1),
                value: this.values[this.currentRegion.substr(1)],
                region: this.currentRegion
            };
        },

        changeHighlight: function(highlight) {
            const shapeid = this.valueShapes[this.currentRegion];
            let shape;
            delete this.shapes[shapeid];
            switch (this.currentRegion.substr(0, 1)) {
                case 'r':
                    shape = this.renderRange(this.currentRegion.substr(1), highlight);
                    break;
                case 'p':
                    shape = this.renderPerformance(highlight);
                    break;
                case 't':
                    shape = this.renderTarget(highlight);
                    break;
            }
            this.valueShapes[this.currentRegion] = shape.id;
            this.shapes[shape.id] = this.currentRegion;
            this.target.replaceWithShape(shapeid, shape);
        },

        renderRange: function(rn, highlight) {
            const rangeval = this.values[rn];
            const rangewidth = Math.round(this.canvasWidth * ((rangeval - this.min) / this.range));
            let color = this.options.get('rangeColors')[rn - 2];
            if (highlight) {
                color = this.calcHighlightColor(color, this.options);
            }
            return this.target.drawRect(0, 0, rangewidth - 1, this.canvasHeight - 1, color, color);
        },

        renderPerformance: function(highlight) {
            const perfval = this.values[1];
            const perfwidth = Math.round(this.canvasWidth * ((perfval - this.min) / this.range));
            let color = this.options.get('performanceColor');
            if (highlight) {
                color = this.calcHighlightColor(color, this.options);
            }
            return this.target.drawRect(0, Math.round(this.canvasHeight * 0.3), perfwidth - 1,
                                        Math.round(this.canvasHeight * 0.4) - 1, color, color);
        },

        renderTarget: function(highlight) {
            const targetval = this.values[0];
            const x = Math.round(this.canvasWidth *
                ((targetval - this.min) / this.range) - (this.options.get('targetWidth') / 2));
            const targettop = Math.round(this.canvasHeight * 0.10);
            const targetheight = this.canvasHeight - (targettop * 2);
            let color = this.options.get('targetColor');
            if (highlight) {
                color = this.calcHighlightColor(color, this.options);
            }
            return this.target.drawRect(x, targettop, this.options.get('targetWidth') - 1, targetheight - 1,
                                        color, color);
        },

        render: function() {
            let shape;
            if (!bullet._super.render.call(this)) {
                return;
            }
            for (let i = 2; i < this.values.length; i++) {
                shape = this.renderRange(i).append();
                this.shapes[shape.id] = 'r' + i;
                this.valueShapes['r' + i] = shape.id;
            }
            if (this.values[1] !== null) {
                shape = this.renderPerformance().append();
                this.shapes[shape.id] = 'p1';
                this.valueShapes.p1 = shape.id;
            }
            if (this.values[0] !== null) {
                shape = this.renderTarget().append();
                this.shapes[shape.id] = 't0';
                this.valueShapes.t0 = shape.id;
            }
            this.target.render();
        }
    });


    $.fn.sparkline.pie = pie = createClass($.fn.sparkline._base, {
        type: 'pie',

        init: function(el, values, options, width, height) {
            let total = 0;
            pie._super.init.call(this, el, values, options, width, height);
            this.shapes = {}; // map shape ids to value offsets
            this.valueShapes = {}; // maps value offsets to shape ids
            this.values = values = $.map(values, Number);
            if (options.get('width') === 'auto') {
                this.width = this.height;
            }
            if (values.length > 0) {
                for (let i = values.length; i--;) {
                    total += values[i];
                }
            }
            this.total = total;
            this.initTarget();
            this.radius = Math.floor(Math.min(this.canvasWidth, this.canvasHeight) / 2);
        },

        getRegion: function(el, x, y) {
            const shapeid = this.target.getShapeAt(el, x, y);
            return (shapeid !== undefined && this.shapes[shapeid] !== undefined) ?
                this.shapes[shapeid] : undefined;
        },

        getCurrentRegionFields: function() {
            const sliceColors = this.options.get('sliceColors');
            return {
                isNull: this.values[this.currentRegion] === undefined,
                value: this.values[this.currentRegion],
                percent: this.values[this.currentRegion] / this.total * 100,
                color: sliceColors[this.currentRegion % sliceColors.length],
                offset: this.currentRegion
            };
        },

        changeHighlight: function(highlight) {
            const newslice = this.renderSlice(this.currentRegion, highlight);
            const shapeid = this.valueShapes[this.currentRegion];
            delete this.shapes[shapeid];
            this.target.replaceWithShape(shapeid, newslice);
            this.valueShapes[this.currentRegion] = newslice.id;
            this.shapes[newslice.id] = this.currentRegion;
        },

        renderSlice: function(idx, highlight) {
            const offset = this.options.get('offset');
            let next = offset ? (2 * Math.PI) * (offset / 360) : 0;
            for (let i = 0; i < this.values.length; i++) {
                const start = next;
                let end = next;
                if (this.total > 0) {  // avoid divide by zero
                    end = next + ((2 * Math.PI) * (this.values[i] / this.total));
                }
                if (idx === i) {
                    let color = this.options.get('sliceColors')[i % this.options.get('sliceColors').length];
                    if (highlight) {
                        color = this.calcHighlightColor(color, this.options);
                    }
                    const borderWidth = this.options.get('borderWidth');
                    return this.target.drawPieSlice(this.radius, this.radius, this.radius - borderWidth,
                                                    start, end, undefined, color);
                }
                next = end;
            }
        },

        render: function() {
            if (!pie._super.render.call(this)) {
                return;
            }
            const borderWidth = this.options.get('borderWidth');
            if (borderWidth) {
                this.target.drawCircle(this.radius, this.radius, Math.floor(this.radius - (borderWidth / 2)),
                                       this.options.get('borderColor'), undefined, borderWidth).append();
            }
            for (let i = this.values.length; i--;) {
                if (this.values[i]) { // don't render zero values
                    const shape = this.renderSlice(i).append();
                    this.valueShapes[i] = shape.id; // store just the shapeid
                    this.shapes[shape.id] = i;
                }
            }
            this.target.render();
        }
    });


    $.fn.sparkline.box = box = createClass($.fn.sparkline._base, {
        type: 'box',

        init: function(el, values, options, width, height) {
            box._super.init.call(this, el, values, options, width, height);
            this.values = $.map(values, Number);
            this.width = options.get('width') === 'auto' ? '4.0em' : width;
            this.initTarget();
            if (!this.values.length) {
                this.disabled = 1;
            }
        },

        getRegion: function() {
            return 1;  // Simulate a single region
        },

        getCurrentRegionFields: function() {
            const result = [
                { field: 'lq', value: this.quartiles[0] },
                { field: 'med', value: this.quartiles[1] },
                { field: 'uq', value: this.quartiles[2] }
            ];
            if (this.loutlier !== undefined) {
                result.push({ field: 'lo', value: this.loutlier});
            }
            if (this.routlier !== undefined) {
                result.push({ field: 'ro', value: this.routlier});
            }
            if (this.lwhisker !== undefined) {
                result.push({ field: 'lw', value: this.lwhisker});
            }
            if (this.rwhisker !== undefined) {
                result.push({ field: 'rw', value: this.rwhisker});
            }
            return result;
        },

        render: function() {
            const minValue = this.options.get('chartRangeMin') === undefined ?
                sauce.data.min(this.values) : this.options.get('chartRangeMin');
            const maxValue = this.options.get('chartRangeMax') === undefined ?
                sauce.data.max(this.values) : this.options.get('chartRangeMax');
            let canvasLeft = 0;
            let lwhisker, loutlier, iqr, q1, q2, q3, rwhisker, routlier, size, unitSize;
            if (!box._super.render.call(this)) {
                return;
            }
            if (this.options.get('raw')) {
                if (this.options.get('showOutliers') && this.values.length > 5) {
                    loutlier = this.values[0];
                    lwhisker = this.values[1];
                    q1 = this.values[2];
                    q2 = this.values[3];
                    q3 = this.values[4];
                    rwhisker = this.values[5];
                    routlier = this.values[6];
                } else {
                    lwhisker = this.values[0];
                    q1 = this.values[1];
                    q2 = this.values[2];
                    q3 = this.values[3];
                    rwhisker = this.values[4];
                }
            } else {
                this.values.sort((a, b) => a - b);
                q1 = quartile(this.values, 1);
                q2 = quartile(this.values, 2);
                q3 = quartile(this.values, 3);
                iqr = q3 - q1;
                if (this.options.get('showOutliers')) {
                    lwhisker = rwhisker = undefined;
                    for (let i = 0; i < this.values.length; i++) {
                        if (lwhisker === undefined &&
                            this.values[i] > q1 - (iqr * this.options.get('outlierIQR'))) {
                            lwhisker = this.values[i];
                        }
                        if (this.values[i] < q3 + (iqr * this.options.get('outlierIQR'))) {
                            rwhisker = this.values[i];
                        }
                    }
                    loutlier = this.values[0];
                    routlier = this.values[this.values.length - 1];
                } else {
                    lwhisker = this.values[0];
                    rwhisker = this.values[this.values.length - 1];
                }
            }
            this.quartiles = [q1, q2, q3];
            this.lwhisker = lwhisker;
            this.rwhisker = rwhisker;
            this.loutlier = loutlier;
            this.routlier = routlier;
            unitSize = this.canvasWidth / (maxValue - minValue + 1);
            if (this.options.get('showOutliers')) {
                canvasLeft = Math.ceil(this.options.get('spotRadius'));
                this.canvasWidth -= 2 * Math.ceil(this.options.get('spotRadius'));
                unitSize = this.canvasWidth / (maxValue - minValue + 1);
                if (loutlier < lwhisker) {
                    this.target.drawCircle(
                        (loutlier - minValue) * unitSize + canvasLeft,
                        this.canvasHeight / 2,
                        this.options.get('spotRadius'),
                        this.options.get('outlierLineColor'),
                        this.options.get('outlierFillColor')).append();
                }
                if (routlier > rwhisker) {
                    this.target.drawCircle(
                        (routlier - minValue) * unitSize + canvasLeft,
                        this.canvasHeight / 2,
                        this.options.get('spotRadius'),
                        this.options.get('outlierLineColor'),
                        this.options.get('outlierFillColor')).append();
                }
            }
            // box
            this.target.drawRect(
                Math.round((q1 - minValue) * unitSize + canvasLeft),
                Math.round(this.canvasHeight * 0.1),
                Math.round((q3 - q1) * unitSize),
                Math.round(this.canvasHeight * 0.8),
                this.options.get('boxLineColor'),
                this.options.get('boxFillColor')).append();
            // left whisker
            this.target.drawLine(
                Math.round((lwhisker - minValue) * unitSize + canvasLeft),
                Math.round(this.canvasHeight / 2),
                Math.round((q1 - minValue) * unitSize + canvasLeft),
                Math.round(this.canvasHeight / 2),
                this.options.get('lineColor')).append();
            this.target.drawLine(
                Math.round((lwhisker - minValue) * unitSize + canvasLeft),
                Math.round(this.canvasHeight / 4),
                Math.round((lwhisker - minValue) * unitSize + canvasLeft),
                Math.round(this.canvasHeight - this.canvasHeight / 4),
                this.options.get('whiskerColor')).append();
            // right whisker
            this.target.drawLine(
                Math.round((rwhisker - minValue) * unitSize + canvasLeft),
                Math.round(this.canvasHeight / 2),
                Math.round((q3 - minValue) * unitSize + canvasLeft),
                Math.round(this.canvasHeight / 2),
                this.options.get('lineColor')).append();
            this.target.drawLine(
                Math.round((rwhisker - minValue) * unitSize + canvasLeft),
                Math.round(this.canvasHeight / 4),
                Math.round((rwhisker - minValue) * unitSize + canvasLeft),
                Math.round(this.canvasHeight - this.canvasHeight / 4),
                this.options.get('whiskerColor')).append();
            // median line
            this.target.drawLine(
                Math.round((q2 - minValue) * unitSize + canvasLeft),
                Math.round(this.canvasHeight * 0.1),
                Math.round((q2 - minValue) * unitSize + canvasLeft),
                Math.round(this.canvasHeight * 0.9),
                this.options.get('medianColor')).append();
            if (this.options.get('target')) {
                size = Math.ceil(this.options.get('spotRadius'));
                this.target.drawLine(
                    Math.round((this.options.get('target') - minValue) * unitSize + canvasLeft),
                    Math.round((this.canvasHeight / 2) - size),
                    Math.round((this.options.get('target') - minValue) * unitSize + canvasLeft),
                    Math.round((this.canvasHeight / 2) + size),
                    this.options.get('targetColor')).append();
                this.target.drawLine(
                    Math.round((this.options.get('target') - minValue) * unitSize + canvasLeft - size),
                    Math.round(this.canvasHeight / 2),
                    Math.round((this.options.get('target') - minValue) * unitSize + canvasLeft + size),
                    Math.round(this.canvasHeight / 2),
                    this.options.get('targetColor')).append();
            }
            this.target.render();
        }
    });
});
