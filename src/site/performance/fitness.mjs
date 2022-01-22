/* global sauce, jQuery, Chart, Backbone */

import * as views from './views.mjs';
import * as data from './data.mjs';
import RangeRouter from './router.mjs';


sauce.ns('performance', async ns => {
    const DAY = 86400 * 1000;
    const urn = 'sauce/performance/fitness';
    const chartTopPad = 15;
    const L = sauce.locale;
    const H = L.human;
    const D = sauce.date;

    // Carefully optimized for low page load time...
    let enAthletes;
    const router = new RangeRouter(urn, 'Sauce Performance');
    await Promise.all([
        L.init(),
        L.getMessagesObject(['performance', 'menu_performance_fitness']).then(l =>
            router.pageTitle = `${l.menu_performance_fitness} | Sauce ${l.performance}`),
        sauce.proxy.connected.then(() => Promise.all([
            sauce.storage.fastPrefsReady(),
            sauce.hist.getEnabledAthletes().then(x => void (enAthletes = x)),
        ])),
    ]);


    // XXX maybe Chart.helpers has something like this..
    function setDefault(obj, path, value) {
        path = path.split('.');
        let offt = obj;
        let m;
        const arrayPushMatch = /(.*?)\[\]/;
        const arrayIndexMatch = /(.*?)\[([0-9]+)\]/;
        for (const x of path.slice(0, -1)) {
            if ((m = x.match(arrayPushMatch))) {
                offt = offt[m[1]] || (offt[m[1]] = []);
                offt = offt.push({});
            } else if ((m = x.match(arrayIndexMatch))) {
                offt = offt[m[1]] || (offt[m[1]] = []);
                const i = Number(m[2]);
                offt = offt[i] || (offt[i] = {});
            } else {
                offt = offt[x] || (offt[x] = {});
            }
        }
        const edge = path[path.length - 1];
        if (offt[edge] !== undefined) {
            return;
        }
        if ((m = edge.match(arrayPushMatch))) {
            offt = offt[m[1]] || (offt[m[1]] = []);
            offt.push(value);
        } else if ((m = edge.match(arrayIndexMatch))) {
            offt = offt[m[1]] || (offt[m[1]] = []);
            offt[Number(m[2])] = value;
        } else {
            offt[edge] = value;
        }
    }


    class ChartVisibilityPlugin {
        constructor(config, view) {
            const _this = this;
            setDefault(config, 'options.legend.onClick', function(...args) {
                _this.onLegendClick(this, ...args);
            });
            this.view = view;
        }

        onLegendClick(element, ev, item) {
            // WARNING: this code has been unused for a while.
            this.legendClicking = true;
            try {
                Chart.defaults.global.legend.onClick.call(element, ev, item);
            } finally {
                this.legendClicking = false;
            }
            const index = item.datasetIndex;
            this.view.toggleDataVisibility(element.chart.data.datasets[index].id);
        }

        beforeUpdate(chart) {
            // Skip setting the hidden state when the update is from the legend click.
            if (this.legendClicking) {
                return;
            }
            const displayStates = {};
            for (const ds of chart.data.datasets) {
                if (!ds.id) {
                    console.warn("Missing ID on dataset: visiblity state unmanaged");
                    continue;
                }
                ds.hidden = this.view.dataVisibility[ds.id] === false;
                displayStates[ds.yAxisID || 0] |= !ds.hidden;
            }
            for (const [id, display] of Object.entries(displayStates)) {
                if (typeof id === 'number') {
                    chart.options.scales.yAxes[id].display = display;
                } else {
                    for (const y of chart.options.scales.yAxes) {
                        if (y.id === id) {
                            y.display = !!display;
                            break;
                        }
                    }
                }
            }
        }
    }


    const betterTooltipPlugin = {
        beforeEvent: function(chart, event) {
            if (event.type !== 'mousemove' || chart.options.tooltips.intersect !== false) {
                return;
            }
            const box = chart.chartArea;
            if (event.x < box.left ||
                event.x > box.right ||
                event.y < box.top ||
                event.y > box.bottom) {
                return false;
            }
        }
    };


    const chartOverUnderFillPlugin = {
        _fillGradientSize: 100,

        _buildFillGradient: function(chart, startColor, endColor) {
            const size = this._fillGradientSize;
            const refCanvas = document.createElement('canvas');
            refCanvas.width = size;
            refCanvas.height = 2;
            const refContext = refCanvas.getContext('2d');
            const refGradient = refContext.createLinearGradient(0, 0, size, 0);
            refGradient.addColorStop(0, startColor);
            refGradient.addColorStop(1, endColor);
            refContext.fillStyle = refGradient;
            refContext.fillRect(0, 0, size, 2);
            return refContext;
        },

        _getFillGradientColor: function(ref, pct) {
            const size = this._fillGradientSize;
            pct = Math.max(0, Math.min(1, pct));
            const aPct = (Math.abs(ref.alphaMax - ref.alphaMin) * pct);
            const a = ref.alphaMax > ref.alphaMin ? aPct + ref.alphaMin : ref.alphaMin - aPct;
            const refOffset = Math.max(0, Math.min(size - 1, Math.round(pct * size)));
            const [r, g, b] = ref.gradient.getImageData(refOffset, 0, refOffset + 1, 1).data.slice(0, 3);
            return [r, g, b, a];
        },

        _safePct: function(pct) {
            // Return a value that won't blow up Canvas' addColorStop().
            return Math.min(1, Math.max(0, pct));
        },

        _getGradient: function(chart, ds, segment) {
            const scale = chart.scales[ds.yAxisID];
            const height = scale.maxHeight; // This is the canvas pixel value.
            if (height <= 0) {
                return;  // Ignore renders to nonvisible layouts (prob a transition)
            }
            const getStyle = x => segment.style[x] !== undefined ? segment.style[x] : ds[x];
            // We have to preserve the alpha components externally.
            const color = c => Chart.helpers.color(c);
            const overMax = color(getStyle('overBackgroundColorMax'));
            const overMin = color(getStyle('overBackgroundColorMin'));
            const underMin = color(getStyle('underBackgroundColorMin'));
            const underMax = color(getStyle('underBackgroundColorMax'));
            const overRef = {
                gradient: this._buildFillGradient(chart, overMin.rgbString(), overMax.rgbString()),
                alphaMin: overMin.alpha(),
                alphaMax: overMax.alpha(),
            };
            const underRef = {
                gradient: this._buildFillGradient(chart, underMin.rgbString(), underMax.rgbString()),
                alphaMin: underMin.alpha(),
                alphaMax: underMax.alpha(),
            };
            const zeroPct = this._safePct(scale.getPixelForValue(0) / height);
            const gFill = chart.ctx.createLinearGradient(0, 0, 0, height);
            const overMaxVal = getStyle('overBackgroundMax');
            const underMinVal = getStyle('underBackgroundMin');
            const max = overMaxVal != null ? overMaxVal : scale.max;
            const min = underMinVal != null ? underMinVal : scale.min;
            const midPointMarginPct = 0.001;
            if (scale.max > 0) {
                const overMaxColor = this._getFillGradientColor(overRef, scale.max / max);
                const overMinColor = this._getFillGradientColor(overRef, scale.min / max);
                const topPct = this._safePct(scale.getPixelForValue(max) / height);
                gFill.addColorStop(topPct, `rgba(${overMaxColor.join()}`);
                gFill.addColorStop(this._safePct(zeroPct - midPointMarginPct),
                    `rgba(${overMinColor.join()}`);
                gFill.addColorStop(zeroPct, `rgba(${overMinColor.slice(0, 3).join()}, 0)`);
            }
            if (scale.min < 0) {
                const underMinColor = this._getFillGradientColor(underRef, scale.max / min);
                const underMaxColor = this._getFillGradientColor(underRef, scale.min / min);
                const bottomPct = this._safePct(scale.getPixelForValue(min) / height);
                gFill.addColorStop(zeroPct, `rgba(${underMinColor.slice(0, 3).join()}, 0`);
                gFill.addColorStop(this._safePct(zeroPct + midPointMarginPct),
                    `rgba(${underMinColor.join()}`);
                gFill.addColorStop(bottomPct, `rgba(${underMaxColor.join()}`);
            }
            return gFill;
        },

        afterDatasetsUpdate: function(chart, options) {
            const metas = chart._getSortedVisibleDatasetMetas();
            for (const {dataset: element} of metas) {
                if (!element || !(element instanceof Chart.elements.Line)) {
                    continue;
                }
                const ds = chart.data.datasets[element._datasetIndex];
                if (!ds.overUnder) {
                    continue;
                }
                for (const segment of element.getSegments()) {
                    try {
                        segment.style.backgroundColor = this._getGradient(chart, ds, segment);
                    } catch(e) {/*no-pragma*/}
                }
            }
        },

    };


    const lineDrawSave = Chart.controllers.line.prototype.draw;
    Chart.controllers.line.prototype.draw = function(ease) {
        lineDrawSave.apply(this, arguments);
        if (!this.chart.options.tooltipLine) {
            return;
        }
        // TODO: support always show option.
        let active = this.chart.tooltip._active;
        if (!active && this.chart.options.tooltips.defaultIndex) {
            const idx = this.chart.options.tooltips.defaultIndex(this.chart);
            const metaData = this.chart.getDatasetMeta(0).data;
            if (idx != null && idx >= 0 && metaData && metaData[idx]) {
                active = [metaData[idx]];
            }
        }
        if (active && active.length) {
            const activePoint = active[0];
            const ctx = this.chart.ctx;
            const x = activePoint.tooltipPosition().x;
            const top = this.chart.chartArea.top - chartTopPad;
            const bottom = this.chart.chartArea.bottom;
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(x, top);
            ctx.lineTo(x, bottom);
            ctx.lineWidth = 1;
            ctx.strokeStyle = this.chart.options.tooltipLineColor || '#777';
            ctx.stroke();
            ctx.restore();
        }
    };


    class SauceChart extends Chart {
        constructor(ctx, view, config) {
            super(ctx, config);
            this.view = view;
        }

        destroy(...args) {
            super.destroy(...args);
            delete this.view;
        }

        getElementsAtEventForMode(ev, mode, options) {
            if (ev.chart && ev.chart.chartArea) {
                const box = ev.chart.chartArea;
                if (!box ||
                    ev.x < box.left ||
                    ev.x > box.right ||
                    ev.y < box.top ||
                    ev.y > box.bottom) {
                    return [];
                }
            }
            return super.getElementsAtEventForMode(ev, mode, options);
        }

        getBucketsAtIndexes(...tuples) {
            const datasets = this.data.datasets;
            if (!datasets || !datasets.length) {
                return [];
            }
            const buckets = new Set();
            for (const [dsIndex, index] of tuples) {
                const ds = datasets[dsIndex];
                if (ds && ds.data && ds.data[index]) {
                    if (ds.data[index].b == null) {
                        throw new Error("Missing bucket entry in dataset");
                    }
                    buckets.add(ds.data[index].b);
                }
            }
            return Array.from(buckets);
        }

        getActivitiesAtIndexes(...tuples) {
            const acts = new Set();
            for (const bucket of this.getBucketsAtIndexes(...tuples)) {
                for (const x of bucket.activities || []) {
                    acts.add(x);
                }
            }
            return Array.from(acts);
        }
    }


    class ActivityTimeRangeChart extends SauceChart {
        constructor(ctx, view, config) {
            let _this;
            config = config || {};
            setDefault(config, 'type', 'line');
            setDefault(config, 'plugins[]', new ChartVisibilityPlugin(config, view));
            setDefault(config, 'plugins[]', betterTooltipPlugin);
            setDefault(config, 'options.maintainAspectRatio', false);
            setDefault(config, 'options.elements.point.pointStyle', false);
            setDefault(config, 'options.layout.padding.top', chartTopPad);
            setDefault(config, 'options.tooltipLine', true);
            setDefault(config, 'options.tooltipLineColor', '#07c');
            setDefault(config, 'options.animation.duration', 200);
            setDefault(config, 'options.legend.display', false);
            setDefault(config, 'options.legend.position', 'bottom');
            setDefault(config, 'options.legend.labels.padding', 20);
            setDefault(config, 'options.legend.labels.usePointStyle', true);
            setDefault(config, 'options.scales.xAxes[0].id', 'days');
            setDefault(config, 'options.scales.xAxes[0].offset', true);
            setDefault(config, 'options.scales.xAxes[0].type', 'time');
            setDefault(config, 'options.scales.xAxes[0].distribution', 'series');
            setDefault(config, 'options.scales.xAxes[0].gridLines.display', true);
            setDefault(config, 'options.scales.xAxes[0].gridLines.drawOnChartArea', false);
            setDefault(config, 'options.scales.xAxes[0].afterUpdate', scale =>
                _this && _this.onAfterUpdateScale(scale));
            setDefault(config, 'options.scales.xAxes[0].afterBuildTicks', (axis, ticks) =>
                _this && _this.onAfterBuildTicks(axis, ticks));
            setDefault(config, 'options.scales.xAxes[0].ticks.sampleSize', 50);
            setDefault(config, 'options.scales.xAxes[0].ticks.padding', 4);
            setDefault(config, 'options.scales.xAxes[0].ticks.minRotation', 30);
            setDefault(config, 'options.scales.xAxes[0].ticks.maxRotation', 50);
            setDefault(config, 'options.scales.xAxes[0].ticks.autoSkipPadding', 20);
            setDefault(config, 'options.scales.xAxes[0].ticks.callback', (_, index, ticks) =>
                _this && _this.formatTickLabel(index, ticks));
            setDefault(config, 'options.scales.xAxes[0].ticks.major.enabled', true);
            setDefault(config, 'options.scales.xAxes[0].ticks.major.fontStyle', 'bold');
            setDefault(config, 'options.scales.xAxes[0].ticks.major.fontSize', 11);
            setDefault(config, 'options.scales.xAxes[0].ticks.minor.fontSize', 10);
            setDefault(config, 'options.scales.yAxes[0].type', 'linear');
            setDefault(config, 'options.scales.yAxes[0].scaleLabel.display', true);
            setDefault(config, 'options.scales.yAxes[0].ticks.min', 0);
            setDefault(config, 'options.tooltips.mode', 'index');
            setDefault(config, 'options.tooltips.enabled', false);  // Use custom html.
            setDefault(config, 'options.tooltips.activitiesFormatter', (...args) =>
                _this.activitiesTooltipFormatter(...args));
            setDefault(config, 'options.tooltips.custom', sauce.debounced(requestAnimationFrame, tt =>
                tt.dataPoints && tt.dataPoints.length &&
                _this.updateTooltips(...tt.dataPoints.map(x => [x.datasetIndex, x.index]))));
            setDefault(config, 'options.plugins.zoom.enabled', true);
            setDefault(config, 'options.plugins.zoom.callbacks.beforeZoom', (...args) =>
                _this.onBeforeZoom(...args));
            super(ctx, view, config);
            _this = this;
        }

        activitiesTooltipFormatter(acts) {
            if (acts.length === 1) {
                return acts[0].name;
            } else if (acts.length > 1) {
                return `<i>${acts.length} ${this.view.LM('activities')}</i>`;
            } else {
                return '-';
            }
        }

        update(...args) {
            super.update(...args);
            const idx = this.options.tooltips.defaultIndex ? this.options.tooltips.defaultIndex(this) : -1;
            if (this.data.datasets && this.data.datasets.length) {
                const tuples = Array.from(sauce.data.range(this.data.datasets.length)).map(i => [i, idx]);
                this.updateTooltips(...tuples);
            }
        }

        updateTooltips(...highlightedTuples) {
            const labels = [];
            const elements = [];
            let startDate = Infinity;
            let mostDays = -Infinity;
            const adjHiTuples = highlightedTuples.map(([dsIdx, i]) => {
                const ds = this.data.datasets[dsIdx];
                i = i >= 0 ? i : ds.data && ds.data.length && ds.data.length + i;
                return [ds, i];
            }).filter(([ds, i]) => ds && ds.data && ds.label && typeof i === 'number' && i >= 0);
            // Interrogate valid highlighted datasets first...
            for (let [ds, idx] of adjHiTuples) {
                const data = ds.data[idx];
                if (!data) {
                    continue;
                }
                startDate = data.b.date < startDate ? data.b.date : startDate;
                mostDays = data.b.days > mostDays ? data.b.days : mostDays;
            }
            const endDate = D.adjacentDay(startDate, mostDays);
            // Gather stats from all datasets (vis and hidden) in the range detected from visible...
            for (const ds of this.data.datasets) {
                if (!ds || !ds.data || !ds.label) {
                    continue;
                }
                const inRangeIndexes = ds.data
                    .map((x, i) => x.b.date >= startDate && x.b.date < endDate ? i : -1)
                    .filter(x => x !== -1);
                for (const i of inRangeIndexes) {
                    const data = ds.data[i];
                    const raw = data.y;
                    const value = ds.tooltipFormat ? ds.tooltipFormat(raw, i, ds) : raw;
                    const values = Array.isArray(value) ? value : [value];
                    if (!ds.hidden) {
                        for (const x of Object.values(ds._meta)) {
                            elements.push(x.data[i]);
                        }
                    }
                    labels.push(`
                        <div class="data-label ${ds.hidden ? "ds-hidden" : ''}" data-ds="${ds.id}"
                             style="--border-color: ${ds.borderColor};
                                    --bg-color: ${ds.backgroundColor};">
                            <key>${ds.label}${ds.hidden ? '' : ':'}</key>
                            ${ds.hidden ? '' : values.map(x => `<value>${x}</value>`).join('')}
                        </div>
                    `);
                }
            }

            let desc = '';
            if (this.options.tooltips.bucketsFormatter) {
                const buckets = this.getBucketsAtIndexes(...highlightedTuples);
                if (buckets.length) {
                    desc = this.options.tooltips.bucketsFormatter(buckets);
                }
            } else if (this.options.tooltips.activitiesFormatter) {
                const acts = this.getActivitiesAtIndexes(...highlightedTuples);
                if (acts.length) {
                    desc = this.options.tooltips.activitiesFormatter(acts);
                }
            }
            let title = '';
            if (mostDays === 1) {
                title = H.date(startDate, {style: 'weekdayYear'});
            } else if (startDate !== Infinity) {
                if (sauce.date.isMonthRange(startDate, endDate)) {
                    title = H.date(startDate, {style: 'monthYear'});
                } else if (sauce.date.isYearRange(startDate, endDate)) {
                    title = H.date(startDate, {style: 'year'});
                } else {
                    const from = H.date(startDate, {style: 'weekday'});
                    const to = H.date(D.adjacentDay(startDate, mostDays - 1), {style: 'weekdayYear'});
                    title = `${from} -> ${to}`;
                }
            }
            const caretX = sauce.data.avg(elements.map(x => x.getCenterPoint().x));
            const $tooltipEl = jQuery(this.canvas).closest('.sauce-panel').find('.chart-tooltip');
            $tooltipEl[0].classList.toggle('inactive', caretX == null);
            $tooltipEl[0].style.setProperty('--caret-left', `${caretX || 0}px`);
            $tooltipEl.html(`
                <div class="tt-labels axis">${labels.join('')}</div>
                <div class="tt-horiz axis">
                    <div class="tt-title">${title}</div>
                    <div class="tt-desc">${desc}</div>
                </div>
            `);
        }

        formatTickLabel(index, ticks) {
            const days = (ticks[ticks.length - 1].value - ticks[0].value) / DAY;
            const data = ticks[index];
            const d = new Date(data.value);
            if (days < 370) {
                if (data.showToday) {
                    return this.view.LM('today'); // XXX
                } else if (data.showYear) {
                    return [H.date(d, {style: 'month'}) + ' ', d.getFullYear()];
                } else if (data.showMonth) {
                    return H.date(d, {style: 'monthDay'});
                } else {
                    return H.date(d, {style: 'shortDay'});
                }
            } else {
                if (data.showToday) {
                    return this.view.LM('today');
                } else if (data.showYear) {
                    return [H.date(d, {style: 'month'}) + ' ', d.getFullYear()];
                } else {
                    return H.date(d, {style: 'month'});
                }
            }
        }

        onAfterBuildTicks(scale, ticks) {
            // This is used for doing fit calculations.  We don't actually use the label
            // value as it will get filtered down after layout determines which ticks will
            // fit and what step size to use.  However it's important to use the same basic
            // formatting so the size constraints are correct.
            if (!ticks) {
                return;
            }
            this._updateTicksConfig(ticks, scale);
            for (const x of ticks) {
                x.major = true;  // Use bold font for all sizing calcs, then correct with afterUpdate.
            }
            return ticks;
        }

        _updateTicksConfig(ticks, scale) {
            let lastMonth;
            let lastYear;
            const spans = (ticks[ticks.length - 1].value - ticks[0].value) / DAY;
            const today = D.today();
            let needTodayMark = scale.max > today;
            for (let i = 0; i < ticks.length; i++) {
                let tick = ticks[i];
                if (needTodayMark && (tick.value >= today || i === ticks.length - 1)) {
                    needTodayMark = false;
                    if (tick.value !== +today) {
                        // We have to hijack this or the previous tick.  Whichever is closest.
                        if (i && +today - ticks[i - 1].value < tick.value - +today) {
                            tick = ticks[--i];
                        }
                        tick.value = +today;
                    }
                    Object.assign(tick, {showToday: true, major: true});
                    tick.label = this.formatTickLabel(i, ticks);
                    continue;
                }
                const d = new Date(tick.value);
                const m = d.getMonth();
                const y = d.getFullYear();
                const showMonth = lastMonth != null && lastMonth != m;
                const showYear = lastYear != null && lastYear != y;
                lastMonth = m;
                lastYear = y;
                Object.assign(tick, {
                    showMonth,
                    showYear,
                    major: spans < 370 ? showMonth || showYear : showYear,
                });
                tick.label = this.formatTickLabel(i, ticks);
            }
            return ticks;
        }

        onAfterUpdateScale(scale) {
            // This runs after all the scale/ticks work is done.  We need to finally
            // patch up the final set of ticks with our desired label and major/minor
            // state.  Major == bold.
            if (scale._ticksToDraw.length) {
                this._updateTicksConfig(scale._ticksToDraw, scale);
            }
        }

        onBeforeZoom(start, end) {
            // Pad out the zoom to be inclusive of nearest metric unit.
            const data = this.data.datasets[0].data;
            let first = data.findIndex(x => x.b.date >= start);
            let last = data.findIndex(x => x.b.date > end);
            if (first === -1) {
                return;
            }
            first = first > 0 ? first - 1 : first;
            last = last > 0 ? last : data.length - 1;
            return [data[first].b.date, data[last].b.date];
        }
    }


    class ChartView extends views.PerfView {
        get events() {
            return {
                ...super.events,
                'click canvas': 'onChartClick',
            };
        }

        async init({pageView, id, ChartClass=SauceChart}) {
            if (!pageView || !id || !ChartClass) {
                throw new TypeError('missing args');
            }
            this.pageView = pageView;
            this.id = id;
            this._ChartClass = ChartClass;
            await super.init();
            this.listenTo(pageView, 'update-activities', this.onUpdateActivities);
        }

        setElement($el) {
            if (this.chart) {
                // Because of the funky config system we never rebuild a chart, we use just one.
                // So we need to save the canvas from the first render.
                this.chart.stop();
                this.$canvas = this.$('canvas');
                $el.find('canvas').replaceWith(this.$canvas);
            } else {
                this.$canvas = $el.find('canvas');
            }
            super.setElement($el);
        }

        setChartConfig(config) {
            this._chartConfig = config;
        }

        async render() {
            await super.render();
            if (this.chart) {
                this.chart.update();
            } else if (this._chartConfig) {
                const ctx = this.$canvas[0].getContext('2d');
                this.chart = new this._ChartClass(ctx, this, this._chartConfig);
            }
        }

        async onChartClick(ev) {
            const box = this.chart.chartArea;
            if (!box ||
                ev.offsetX < box.left ||
                ev.offsetX > box.right ||
                ev.offsetY < box.top ||
                ev.offsetY > box.bottom) {
                return;
            }
            const {intersect, axis, mode = 'nearest'} = this.chart.options.tooltips;
            const elements = this.chart.getElementsAtEventForMode(ev, mode, {intersect, axis});
            if (elements.length) {
                const acts = this.chart.getActivitiesAtIndexes(...elements.map(x => [x._datasetIndex, x._index]));
                if (acts.length) {
                    this.pageView.trigger('select-activities', acts);
                }
            }
        }

        onUpdateActivities() { }
    }


    class ActivityTimeRangeChartView extends ChartView {
        get events() {
            return {
                ...super.events,
                'click .chart-tooltip .data-label': 'onDataLabelClick',
            };
        }

        async init(options) {
            await super.init({ChartClass: ActivityTimeRangeChart, ...options});
            this._dataVisibilityKey = `perfChartDataVisibility-${this.id}`;
            this.dataVisibility = sauce.storage.getPrefFast(this._dataVisibilityKey) || {};
        }

        onDataLabelClick(ev) {
            const dataId = ev.currentTarget.dataset.ds;
            if (!dataId) {
                console.warn("No ID for dataset");
                return;
            }
            this.toggleDataVisibility(dataId);
        }

        toggleDataVisibility(dataId) {
            const index = this.chart.data.datasets.findIndex(x => x.id === dataId);
            this.dataVisibility[dataId] = !this.chart.isDatasetVisible(index);
            sauce.storage.setPref(this._dataVisibilityKey, this.dataVisibility);  // bg okay
            this.chart.update();
        }
    }


    class TrainingChartView extends ActivityTimeRangeChartView {
        get localeKeys() {
            return [
                'activities', 'predicted_tss', 'predicted_tss_tooltip', 'fitness',
                'fatigue', 'form', 'today',
            ];
        }

        async init(options) {
            await super.init({...options, id: 'training'});
            this.setChartConfig({
                plugins: [chartOverUnderFillPlugin],
                options: {
                    plugins: {
                        datalabels: {
                            display: ctx =>
                                !!(ctx.dataset.data[ctx.dataIndex] &&
                                ctx.dataset.data[ctx.dataIndex].showDataLabel === true),
                            formatter: (value, ctx) => {
                                const r = ctx.dataset.tooltipFormat(value.y);
                                return Array.isArray(r) ? r[0] : r;
                            },
                            backgroundColor: ctx => ctx.dataset.backgroundColor,
                            borderRadius: 2,
                            color: 'white',
                            padding: 4,
                            anchor: 'center',
                        },
                    },
                    scales: {
                        yAxes: [{
                            id: 'tss',
                            scaleLabel: {labelString: 'TSS'},
                            ticks: {min: 0, maxTicksLimit: 6},
                        }, {
                            id: 'tsb',
                            scaleLabel: {labelString: 'TSB', display: true},
                            ticks: {maxTicksLimit: 8},
                            position: 'right',
                            gridLines: {display: false},
                        }]
                    },
                    tooltips: {
                        intersect: false,
                        bucketsFormatter: this.bucketsTooltipFormatter.bind(this),
                        defaultIndex: chart => {
                            if (chart.data.datasets && chart.data.datasets.length) {
                                const data = chart.data.datasets[0].data;
                                if (data && data.length) {
                                    const today = D.today();
                                    for (let i = data.length - 1; i; i--) {
                                        if (data[i].x <= today) {
                                            return i;
                                        }
                                    }
                                }
                            }
                            return -1;
                        }
                    },
                }
            });
        }

        bucketsTooltipFormatter(buckets) {
            const day = buckets[0];
            let desc;
            if (day.future) {
                desc = `<i title="${this.LM('predicted_tss_tooltip')}">` +
                    `${this.LM('predicted_tss')}</i>`;
            } else if (day.activities.length > 1) {
                desc = `<i>${day.activities.length} ${this.LM('activities')}</i>`;
            } else if (day.activities.length === 1) {
                desc = day.activities[0].name;
            }
            return `${desc ? desc + ' ' : ''}(${day.future ? '~' : ''}${H.number(day.tss)} TSS)`;
        }

        onUpdateActivities({range, daily, metricData}) {
            const lineWidth = range.days > 366 ? 0.66 : range.days > 60 ? 1 : 1.25;
            const maxCTLIndex = sauce.data.max(daily.map(x => x.ctl), {index: true});
            const minTSBIndex = sauce.data.min(daily.map(x => x.ctl - x.atl), {index: true});
            let future = [];
            if (range.end >= Date.now() && daily.length) {
                const last = daily[daily.length - 1];
                const fDays = Math.floor(Math.min(range.days * 0.10, 62));
                const fStart = D.dayAfter(last.date);
                const fEnd = D.roundToLocaleDayDate(+fStart + fDays * DAY);
                const predictions = [];
                const tau = 1;
                const decay = 2;
                const tssSlope = (((last.atl / last.ctl) || 1) - 1) / tau;
                let tssPred = last.ctl;
                for (const [i, date] of Array.from(D.dayRange(fStart, fEnd)).entries()) {
                    tssPred *= 1 + (tssSlope * (1 / (i * decay + 1)));
                    predictions.push({ts: +date, tssOverride: tssPred});
                }
                future = data.activitiesByDay(predictions, fStart, fEnd, last.atl, last.ctl);
            }
            const buckets = daily.concat(future.map(x => (x.future = true, x)));
            const ifFuture = (yes, no) => ctx => buckets[ctx.p1DataIndex].future ? yes : no;
            this.chart.data.datasets = [{
                id: 'ctl',
                label: `CTL (${this.LM('fitness')})`,
                yAxisID: 'tss',
                borderWidth: lineWidth,
                backgroundColor: '#4c89d0e0',
                borderColor: '#2c69b0f0',
                pointStyle: ctx => ctx.dataIndex === maxCTLIndex ? 'circle' : false,
                pointRadius: ctx => ctx.dataIndex === maxCTLIndex ? 2 : 0,
                tooltipFormat: x => Math.round(x).toLocaleString(),
                segment: {
                    borderColor: ifFuture('4c89d0d0'),
                    borderDash: ifFuture([3, 3], []),
                },
                data: buckets.map((b, i) => ({
                    b,
                    x: b.date,
                    y: b.ctl,
                    showDataLabel: i === maxCTLIndex,
                })),
            }, {
                id: 'atl',
                label: `ATL (${this.LM('fatigue')})`,
                yAxisID: 'tss',
                borderWidth: lineWidth,
                backgroundColor: '#ff3730e0',
                borderColor: '#f02720f0',
                tooltipFormat: x => Math.round(x).toLocaleString(),
                segment: {
                    borderColor: ifFuture('#ff4740d0'),
                    borderDash: ifFuture([3, 3]),
                },
                data: buckets.map(b => ({
                    b,
                    x: b.date,
                    y: b.atl,
                }))
            }, {
                id: 'tsb',
                label: `TSB (${this.LM('form')})`,
                yAxisID: 'tsb',
                borderWidth: lineWidth,
                backgroundColor: '#bc714cc0',
                borderColor: '#0008',
                fill: true,
                overUnder: true,
                overBackgroundColorMax: '#7fe78a',
                overBackgroundColorMin: '#bfe58a22',
                underBackgroundColorMin: '#d9940422',
                underBackgroundColorMax: '#bc0000',
                overBackgroundMax: 50,
                underBackgroundMin: -50,
                pointStyle: ctx => ctx.dataIndex === minTSBIndex ? 'circle' : false,
                pointRadius: ctx => ctx.dataIndex === minTSBIndex ? 2 : 0,
                tooltipFormat: x => Math.round(x).toLocaleString(),
                segment: {
                    borderColor: ifFuture('#000a'),
                    borderDash: ifFuture([3, 3]),
                    overBackgroundColorMax: ifFuture('#afba'),
                    overBackgroundColorMin: ifFuture('#df82'),
                    underBackgroundColorMin: ifFuture('#f922'),
                    underBackgroundColorMax: ifFuture('#d22b'),
                },
                data: buckets.map((b, i) => ({
                    b,
                    x: b.date,
                    y: b.ctl - b.atl,
                    showDataLabel: i === minTSBIndex,
                }))
            }];
            this.chart.update();
        }
    }


    class ActivityVolumeChartView extends ActivityTimeRangeChartView {
        get localeKeys() {
            return ['predicted', '/analysis_time', '/analysis_distance', 'activities'];
        }

        async init(options) {
            await super.init({...options, id: 'activity-volume'});
            const distStepSize = L.distanceFormatter.unitSystem === 'imperial' ? 1609.344 * 10 : 10000;
            this.setChartConfig({
                type: 'bar',
                options: {
                    scales: {
                        xAxes: [{
                            stacked: true,
                        }],
                        yAxes: [{
                            id: 'tss',
                            scaleLabel: {labelString: 'TSS'},
                            ticks: {min: 0, maxTicksLimit: 6},
                        }, {
                            id: 'duration',
                            position: 'right',
                            gridLines: {display: false},
                            ticks: {
                                min: 0,
                                suggestedMax: 5 * 3600,
                                stepSize: 3600,
                                maxTicksLimit: 7,
                                callback: v => H.duration(v, {maxPeriod: 3600, minPeriod: 3600}),
                            }
                        }, {
                            id: 'distance',
                            position: 'right',
                            gridLines: {display: false},
                            ticks: {
                                min: 0,
                                stepSize: distStepSize,
                                maxTicksLimit: 7,
                                callback: v => H.distance(v, 0, {suffix: true}),
                            },
                        }]
                    },
                }
            });
        }

        onUpdateActivities({range, daily, metricData}) {
            let predictions;
            if (D.tomorrow() <= range.end && metricData.length) {
                const remaining = (range.end - Date.now()) / DAY;
                const days = Math.round((range.end - metricData[metricData.length - 1].date) / DAY);
                const weighting = Math.min(days, daily.length);
                const avgTSS = sauce.perf.expWeightedAvg(weighting, daily.map(x => x.tss));
                const avgDuration = sauce.perf.expWeightedAvg(weighting, daily.map(x => x.duration));
                const avgDistance = sauce.perf.expWeightedAvg(weighting, daily.map(x => x.distance));
                predictions = {
                    days,
                    tss: metricData.map((b, i) => ({
                        b,
                        x: b.date,
                        y: i === metricData.length - 1 ? avgTSS * remaining : null,
                    })),
                    duration: metricData.map((b, i) => ({
                        b,
                        x: b.date,
                        y: i === metricData.length - 1 ? avgDuration * remaining : null,
                    })),
                    distance: metricData.map((b, i) => ({
                        b,
                        x: b.date,
                        y: i === metricData.length - 1 ? avgDistance * remaining : null,
                    })),
                };
            }
            const commonOptions = {
                borderWidth: 1
            };
            this.chart.data.datasets = [{
                id: 'tss',
                label: 'TSS',
                backgroundColor: '#1d86cdd0',
                borderColor: '#0d76bdf0',
                hoverBackgroundColor: '#0d76bd',
                hoverBorderColor: '#0d76bd',
                yAxisID: 'tss',
                stack: 'tss',
                tooltipFormat: (x, i) => {
                    const tss = Math.round(x).toLocaleString();
                    const tssDay = Math.round(x / metricData[i].days).toLocaleString();
                    const tips = [`${tss} <small>(${tssDay}/d)</small>`];
                    if (predictions && i === metricData.length - 1) {
                        const ptssRaw = predictions.tss[i].y + x;
                        const ptss = Math.round(ptssRaw).toLocaleString();
                        const ptssDay = Math.round(ptssRaw / predictions.days).toLocaleString();
                        tips.push(`${this.LM('predicted')}: <b>~${ptss} <small>(${ptssDay}/d)</small></b>`);
                    }
                    return tips;
                },
                data: metricData.map((b, i) => ({b, x: b.date, y: b.tssSum})),
            }, {
                id: 'duration',
                label: this.LM('analysis_time'),
                backgroundColor: '#fc7d0bd0',
                borderColor: '#dc5d00f0',
                hoverBackgroundColor: '#ec6d00',
                hoverBorderColor: '#dc5d00',
                yAxisID: 'duration',
                stack: 'duration',
                tooltipFormat: (x, i) => {
                    const tips = [H.duration(x, {maxPeriod: 3600, minPeriod: 3600, digits: 1})];
                    if (predictions && i === metricData.length - 1) {
                        const pdur = H.duration(predictions.duration[i].y + x,
                            {maxPeriod: 3600, minPeriod: 3600, digits: 1});
                        tips.push(`${this.LM('predicted')}: <b>~${pdur}</b>`);
                    }
                    return tips;
                },
                data: metricData.map((b, i) => ({b, x: b.date, y: b.duration})),
            }, {
                id: 'distance',
                label: this.LM('analysis_distance'),
                backgroundColor: '#244d',
                borderColor: '#022f',
                hoverBackgroundColor: '#133',
                hoverBorderColor: '#022',
                yAxisID: 'distance',
                stack: 'distance',
                tooltipFormat: (x, i) => {
                    const tips = [L.distanceFormatter.formatShort(x)];
                    if (predictions && i === metricData.length - 1) {
                        const pdist = L.distanceFormatter.formatShort(predictions.distance[i].y + x, 0);
                        tips.push(`${this.LM('predicted')}: <b>~${pdist}</b>`);
                    }
                    return tips;
                },
                data: metricData.map((b, i) => ({b, x: b.date, y: b.distance})),
            }];
            if (predictions) {
                this.chart.data.datasets.push({
                    id: 'tss',
                    backgroundColor: '#1d86cd30',
                    borderColor: '#0d76bd50',
                    hoverBackgroundColor: '#0d76bd60',
                    hoverBorderColor: '#0d76bd60',
                    yAxisID: 'tss',
                    stack: 'tss',
                    data: predictions.tss,
                }, {
                    id: 'duration',
                    backgroundColor: '#fc7d0b30',
                    borderColor: '#dc5d0050',
                    hoverBackgroundColor: '#ec6d0060',
                    hoverBorderColor: '#dc5d0060',
                    yAxisID: 'duration',
                    stack: 'duration',
                    data: predictions.duration,
                }, {
                    id: 'distance',
                    backgroundColor: '#2443',
                    borderColor: '#0225',
                    hoverBackgroundColor: '#1336',
                    hoverBorderColor: '#0226',
                    yAxisID: 'distance',
                    stack: 'distance',
                    data: predictions.distance,
                });
            }
            for (const [i, x] of this.chart.data.datasets.entries()) {
                this.chart.data.datasets[i] = Object.assign({}, commonOptions, x);
            }
            this.chart.update();
        }
    }


    class ElevationChartView extends ActivityTimeRangeChartView {
        get localeKeys() {
            return ['/analysis_gain', 'activities'];
        }

        async init(options) {
            const thousandFeet = 1609.344 / 5280 * 100;
            const stepSize = L.elevationFormatter.unitSystem === 'imperial' ? thousandFeet : 1000;
            await super.init({...options, id: 'elevation'});
            this.setChartConfig({
                options: {
                    elements: {
                        line: {
                            fill: true,
                            backgroundColor: '#8f8782e0',
                            borderColor: '#6f6762f0',
                            cubicInterpolationMode: 'monotone',
                        }
                    },
                    scales: {
                        yAxes: [{
                            id: 'elevation',
                            scaleLabel: {labelString: this.LM('analysis_gain')},
                            ticks: {
                                min: 0,
                                maxTicksLimit: 8,
                                stepSize,
                                callback: v => H.elevation(v, {suffix: true}),
                            },
                        }]
                    },
                    tooltips: {
                        intersect: false,
                    },
                }
            });
        }

        onUpdateActivities({range, daily}) {
            let gain = 0;
            const days = range.days;
            const lineWidth = days > 366 ? 0.66 : days > 60 ? 1 : 1.25;
            this.chart.data.datasets = [{
                id: 'elevation',
                label: this.LM('analysis_gain'),
                borderWidth: lineWidth,
                yAxisID: 'elevation',
                tooltipFormat: x => H.elevation(x, {suffix: true}),
                data: daily.map(b => {
                    gain += b.altGain;
                    return {b, x: b.date, y: gain};
                }),
            }];
            this.chart.update();
        }
    }


    class MainView extends views.PerfView {
        get events() {
            return {
                ...super.events,
                'change header.filters select[name="range"]': 'onRangeChange',
                'click header.filters .btn.range': 'onRangeShiftClick',
                'click header.filters .btn.expand': 'onExpandClick',
                'click header.filters .btn.compress': 'onCompressClick',
            };
        }

        get tpl() {
            return 'performance/fitness/main.html';
        }

        get localeKeys() {
            return ['weekly', 'monthly', 'yearly', 'activities', 'today'];
        }

        async init({pageView}) {
            this.pageView = pageView;
            this.trainingChartView = new TrainingChartView({pageView});
            this.activityVolumeChartView = new ActivityVolumeChartView({pageView});
            this.elevationChartView = new ElevationChartView({pageView});
            this.listenTo(pageView, 'before-update-activities', this.onBeforeUpdateActivities);
            this.listenTo(pageView, 'available-activities-changed', this.onAvailableChanged);
            await super.init();
        }

        setElement(el, ...args) {
            const r = super.setElement(el, ...args);
            const expanded = sauce.storage.getPrefFast('perfMainViewExpanded');
            this.toggleExpanded(!!expanded, {noSave: true, noAside: true});
            return r;
        }

        async toggleExpanded(expanded, options={}) {
            this.$el.toggleClass('expanded', expanded);
            this.$el.prev('nav').toggleClass('compressed', expanded);
            if (!options.noAside) {
                await this.pageView.detailsView.setExpanded(!expanded);
            }
            if (!options.noSave) {
                await sauce.storage.setPref('perfMainViewExpanded', expanded);
            }
        }

        renderAttrs() {
            const range = this.pageView.getRangeSnapshot();
            return {range: [range.period, range.metric].join()};
        }

        async render() {
            await super.render();
            this.trainingChartView.setElement(this.$('.training-chart-view'));
            this.activityVolumeChartView.setElement(this.$('.activity-volume-chart-view'));
            this.elevationChartView.setElement(this.$('.elevation-chart-view'));
            await this.trainingChartView.render();
            await this.activityVolumeChartView.render();
            await this.elevationChartView.render();
        }

        async onExpandClick(ev) {
            await this.toggleExpanded(true);
        }

        async onCompressClick(ev) {
            await this.toggleExpanded(false);
        }

        async onRangeChange(ev) {
            let [rawPeriod, metric] = ev.currentTarget.value.split(',');
            const all = !metric && rawPeriod === 'all';
            if (all) {
                [rawPeriod, metric] = this.pageView.getAllRange();
            }
            await this.pageView.setRangePeriod(Number(rawPeriod), metric, {all});
        }

        onRangeShiftClick(ev) {
            const classes = ev.currentTarget.classList;
            const adj = classes.contains('newest') ?
                Infinity :
                classes.contains('oldest') ?
                    -Infinity :
                    classes.contains('next') ?
                        1 :
                        -1;
            ev.currentTarget.classList.add('sauce-busy');
            this.pageView.shiftRange(adj).finally(() =>
                // follows a debounced update-activities
                ev.currentTarget.classList.remove('sauce-busy'));
            this.updateRangeButtons();
        }

        onAvailableChanged({oldest}) {
            this.updateRangeButtons(null, oldest);
        }

        onBeforeUpdateActivities({range}) {
            this.updateRangeButtons(range);
        }

        updateRangeButtons(range, oldest) {
            range = range || this.pageView.getRangeSnapshot();
            oldest = oldest || this.pageView.oldest;
            const localeMetricMap = {
                weeks: 'weekly',
                months: 'monthly',
                years: 'yearly',
            };
            this.$('.metric-display').text(this.LM(localeMetricMap[range.metric]));
            const $start = this.$('header .range.start');
            const $end = this.$('header .range.end');
            const selectedRange = this.pageView.allRange ? 'all' : `${range.period},${range.metric}`;
            let $option = this.$(`select[name="range"] option[value="${selectedRange}"]`);
            if (!$option.length) {
                // Just manually add an entry.  The user may be playing with the URL and that's fine.
                $option = jQuery(`<option value="${range.period},${range.metric}"]>` +
                    `${range.period} ${range.metric}</option>`);
                this.$(`select[name="range"]`).append($option);
            }
            $option[0].selected = true;
            $start.text(H.date(range.start));
            const isStart = range.start <= oldest;
            this.$('.btn.range.prev').toggleClass('disabled', isStart);
            this.$('.btn.range.oldest').toggleClass('disabled', isStart);
            const isEnd = range.end >= Date.now();
            this.$('.btn.range.next').toggleClass('disabled', isEnd);
            this.$('.btn.range.newest').toggleClass('disabled', isEnd);
            $end.text(isEnd ?
                new Intl.RelativeTimeFormat([], {numeric: 'auto'}).format(0, 'day') :
                H.date(D.roundToLocaleDayDate(range.end - DAY)));
        }
    }


    async function load() {
        const $page = jQuery(document.getElementById('error404'));
        $page.empty();
        $page.removeClass();  // removes all
        $page[0].id = 'sauce-performance';
        const isAvailable = !location.search.match(/onboarding/) && sauce.patronLevel >= 10;
        const athletes = new Map(isAvailable ? enAthletes.map(x => [x.id, x]) : []);
        if (!athletes.size) {
            const view = new views.OnboardingView({el: $page});
            await view.render();
        } else {
            self.pv = new views.PageView({athletes, router, MainView, el: $page});
            await self.pv.render();
        }
    }


    Backbone.history.start({pushState: true});

    if (['interactive', 'complete'].indexOf(document.readyState) === -1) {
        addEventListener('DOMContentLoaded', () => load().catch(sauce.report.error));
    } else {
        load().catch(sauce.report.error);
    }
});
