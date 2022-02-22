/* global sauce Chart jQuery */

import * as views from './views.mjs';

const DAY = 86400 * 1000;
const chartTopPad = 15;
const L = sauce.locale;
const H = L.human;
const D = sauce.date;


// XXX maybe Chart.helpers has something like this..
export function setDefault(obj, path, value) {
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
        this.view = view;
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
            ds.hidden = this.view.isDatasetHidden(ds);
            displayStates[ds.yAxisID || 0] |= !ds.hidden;
        }
        for (const scale of chart.options.scales.yAxes) {
            scale.display = !!displayStates[scale.id || 0];
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


export const overUnderFillPlugin = {
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


export class ActivityTimeRangeChart extends SauceChart {
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
        setDefault(config, 'options.scales.yAxes[0].ticks.beginAtZero', true);
        setDefault(config, 'options.tooltips.mode', 'index');
        setDefault(config, 'options.tooltips.enabled', false);  // Use custom html.
        setDefault(config, 'options.tooltips.activitiesFormatter', (...args) =>
            _this.activitiesTooltipFormatter(...args));
        const ttAnimation = sauce.ui.throttledAnimationFrame();
        setDefault(config, 'options.tooltips.custom', tt => {
            if (tt.dataPoints && tt.dataPoints.length) {
                const tuples = tt.dataPoints.map(x => [x.datasetIndex, x.index]);
                ttAnimation(() => _this.updateTooltips(...tuples));
            }
        });
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
                        <div class="color-bubble"></div>
                        <div class="lines">
                            <div class="line">
                                <span class="label">${ds.label}</span> <span class="value">${values[0]}</span>
                            </div>
                            ${values.slice(1).map(x => `<div class="line extra">${x}</div>`).join('')}
                        </div>
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


export class ChartView extends views.PerfView {
    get events() {
        return {
            ...super.events,
            'click canvas': 'onChartClick',
        };
    }

    async init({pageView, ChartClass=SauceChart, ...options}) {
        this._ChartClass = ChartClass;
        this.listenTo(pageView, 'update-activities', this.onUpdateActivities);
        await super.init({pageView, ...options});
    }

    setChartConfig(config) {
        this._chartConfig = config;
    }

    updateChart() {
        throw new Error("unimplemented");
    }

    onUpdateActivities(obj) {
        Object.assign(this, obj);
        this.updateChart();
    }

    async render() {
        const $canvas = this.$el && this.$('canvas');
        if ($canvas && $canvas.length) {
            // Because of the funky config system we never rebuild a chart, we use just one.
            // So we need to save the canvas from the first render and then reattach after.
            if (this.chart) {
                this.chart.stop();
            }
            $canvas.detach();
        }
        await super.render();
        if ($canvas && $canvas.length) {
            this.$('canvas').replaceWith($canvas);
        }
        if (this.chart) {
            this.chart.update();
        } else if (this._chartConfig) {
            const ctx = this.$('canvas')[0].getContext('2d');
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
}


export class ChartViewSettingsView extends views.PanelSettingsView {
    static tpl = 'performance/chart-settings.html';

    get events() {
        return {
            'input input.ds-en[type="checkbox"]': 'onDatasetEnabledInput',
            'input input.ds-group-en[type="checkbox"]': 'onDatasetGroupEnabledInput',
        };
    }

    async onDatasetEnabledInput(ev) {
        const enabled = ev.currentTarget.checked;
        const name = ev.currentTarget.name;
        this.panelView.getPrefs('hiddenDatasets', {})[name] = !enabled;
        this.panelView.getPrefs('disabledDatasets', {})[name] = !enabled;
        await this.panelView.savePrefs();
        this.panelView.updateChart();
    }

    async onDatasetGroupEnabledInput(ev) {
        const enabled = ev.currentTarget.checked;
        const name = ev.currentTarget.name;
        this.panelView.getPrefs('disabledDatasetGroups', {})[name] = !enabled;
        await this.panelView.savePrefs();
        this.panelView.updateChart();
    }

    renderAttrs(attrs) {
        return {
            ...super.renderAttrs(),
            availableDatasets: this.panelView.availableDatasets,
            availableDatasetGroups: this.panelView.availableDatasetGroups,
            ...attrs,
        };
    }
}


export class ActivityTimeRangeChartView extends ChartView {
    static SettingsView = ChartViewSettingsView;
    static localeKeys = ['today', 'activities'];

    get events() {
        return {
            ...super.events,
            'click .chart-tooltip .data-label': 'onDataLabelClick',
        };
    }

    get defaultPrefs() {
        return {
            hiddenDatasets: {},
            disabledDatasets: {},
            disabledDatasetGroups: {},
        };
    }

    async init(options) {
        await super.init({ChartClass: ActivityTimeRangeChart, ...options});
    }

    renderAttrs(extra) {
        return {name: this.name, ...extra};
    }

    onDataLabelClick(ev) {
        const dataId = ev.currentTarget.dataset.ds;
        if (!dataId) {
            console.warn("No ID for dataset");
            return;
        }
        this.toggleDataVisibility(dataId);
    }

    isDatasetHidden(ds) {
        return (
            !!this.getPrefs('hiddenDatasets', {})[ds.id] ||
            !!this.getPrefs('disabledDatasets', {})[ds.id] ||
            !!(ds.group && this.getPrefs('disabledDatasetGroups', {})[ds.group])
        );
    }

    toggleDataVisibility(dataId) {
        const index = this.chart.data.datasets.findIndex(x => x.id === dataId);
        const hiddenDatasets = this.getPrefs('hiddenDatasets', {});
        hiddenDatasets[dataId] = !!this.chart.isDatasetVisible(index);
        this.savePrefs({hiddenDatasets});  // bg okay
        this.chart.update();
    }
}
