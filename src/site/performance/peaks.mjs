/* global sauce, jQuery */

import * as Views from './views.mjs';
import * as Fitness from './fitness.mjs';
import * as Charts from './charts.mjs';
import * as Eftp from '../../common/eftp.mjs';

const L = sauce.locale;
const H = L.human;
const D = sauce.date;


const _athleteCache = new Map();
async function getAthlete(id) {
    if (!_athleteCache.has(id)) {
        const athlete = await sauce.hist.getAthlete(id);
        _athleteCache.set(id, athlete);
    }
    return _athleteCache.get(id);
}


function getPeriodType(streamType) {
    if (['pace', 'gap'].includes(streamType)) {
        return 'distance';
    } else {
        return 'period';
    }
}


function getPeaksUnit(streamType) {
    const paceUnit = L.paceFormatter.shortUnitKey();
    return {
        power_wkg: 'w/kg',
        power: 'w',
        np: 'w',
        xp: 'w',
        hr: L.hrFormatter.shortUnitKey(),
        pace: paceUnit,
        gap: paceUnit,
    }[streamType];
}


function getPeaksValueFormatter(streamType) {
    return {
        power: H.number,
        power_wkg: x => H.number(x, {fixed: true, precision: 1}),
        np: H.number,
        xp: H.number,
        hr: H.number,
        pace: H.pace,
        gap: H.pace,
    }[streamType];
}


async function getPeaks({type, period, activityType, limit, skipEstimates, skipVirtual, ...optional}) {
    const options = {
        limit,
        activityType,
        skipEstimates,
        skipVirtual,
        expandActivities: optional.expandActivities,
        skip: optional.skip,
    };
    if (!optional.includeAllDates) {
        options.start = +optional.start;
        options.end = +optional.end;
    }
    let peaks;
    if (!optional.includeAllAthletes) {
        peaks = await sauce.hist.getPeaksForAthlete(optional.athlete.id, type, period, options);
    } else {
        peaks = await sauce.hist.getPeaksFor(type, period, options);
    }
    for (const x of peaks) {
        if (x.rankLevel) {
            x.rankBadge = sauce.power.rankBadge(x.rankLevel);
        }
    }
    return peaks;
}


class PeaksControlsView extends Views.PerfView {

    static tpl = 'performance/peaks/controls.html';

    get events() {
        return {
            ...super.events,
            'change select.pref[name]': 'onPrefSelectChange',
            'input input.pref[type="checkbox"]': 'onPrefCheckboxInput',
        };
    }

    async init({panelView, ...attrs}) {
        this.panelView = panelView;
        this.attrs = attrs;
        this.peakRanges = {
            periods: await Views.getPeakRanges('periods'),
            distances: await Views.getPeakRanges('distances'),
        };
        await super.init();
    }

    renderAttrs() {
        return {
            ...this.attrs,
            peakRanges: this.peakRanges,
            panelPrefs: this.panelView.getPrefs(),
        };
    }

    async updatePanelPref(updates) {
        await this.panelView.savePrefs(updates);
        await this.panelView.render({update: true});
    }

    async onPrefSelectChange(ev) {
        const raw = ev.currentTarget.value;
        const typedValue = raw ? isNaN(raw) ? raw : Number(raw) : null;
        const updates = {[ev.currentTarget.name]: typedValue};
        await this.updatePanelPref(updates);
    }

    async onPrefCheckboxInput(ev) {
        const updates = {[ev.currentTarget.name]: ev.currentTarget.checked};
        await this.updatePanelPref(updates);
    }
}


class PeaksCurveControlsView extends Views.PerfView {

    static tpl = 'performance/peaks/curve-controls.html';

    get events() {
        return {
            ...super.events,
            'change select[name="compare-picker"]': 'onComparePickerChange',
            'input input.pref[type="checkbox"]': 'onPrefCheckboxInput',
        };
    }

    async init({panelView, ...attrs}) {
        this.panelView = panelView;
        this.attrs = attrs;
        await super.init();
    }

    renderAttrs() {
        const curYear = new Date().getFullYear();
        const oldestYear = new Date(this.panelView.pageView.oldest || `${curYear - 10}-02-02`).getFullYear();
        const years = [];
        for (let y = oldestYear; y < curYear; y++) {
            years.unshift(y);
        }
        return {
            ...this.attrs,
            years,
            compareOptions: this.panelView.compareOptions,
            panelPrefs: this.panelView.getPrefs(),
        };
    }

    async updatePanelPref(updates) {
        await this.panelView.savePrefs(updates);
        await this.panelView.render({update: true});
    }

    async onComparePickerChange(ev) {
        const toggle = ev.currentTarget.value;
        const compare = this.panelView.getPrefs('compare');
        if (compare.includes(toggle)) {
            compare.splice(compare.indexOf(toggle), 1);
        } else {
            compare.push(toggle);
        }
        await this.updatePanelPref({compare});
    }

    async onPrefCheckboxInput(ev) {
        const updates = {[ev.currentTarget.name]: ev.currentTarget.checked};
        await this.updatePanelPref(updates);
    }
}



export class PeaksTableView extends Views.ResizablePerfView {
    static uuid = '9e0e835b-0d71-4116-9b5a-eb6924386526';
    static tpl = 'performance/peaks/table.html';
    static typeLocaleKey = 'performance_peaks_table_type';
    static nameLocaleKey = 'performance_peaks_table_name';
    static descLocaleKey = 'performance_peaks_desc';

    get events() {
        return {
            ...super.events,
            'click .results table tbody tr[data-id]': 'onResultClick',
            'click .edit-activity': 'onEditActivityClick',
            'click tbody tr.load-more': 'onLoadMoreClick',
            'click thead .btn.filter': 'onFilterClick',
            'input thead input.filter': 'onFilterInput',
            'pointerdown .resize-drag': 'onResizePointerDown',
        };
    }

    get defaultPrefs() {
        return {
            type: 'power',
            time: 300,
            distance: 10000,
            includeAllAthletes: false,
            includeAllDates: false,
            activityType: null,
            skipEstimates: null,
            skipVirtual: null,
        };
    }

    async init({pageView, ...options}) {
        this.peaks = [];
        this.filters = {};
        this.hasMore = false;
        this.pageSize = 100;
        this.range = pageView.range.clone({frozen: true});
        this.athlete = pageView.athlete;
        this.controlsView = new PeaksControlsView({panelView: this});
        this.listenTo(pageView, 'before-update-activities', sauce.debounced(this.onBeforeUpdateActivities));
        await super.init({pageView, ...options});
    }

    renderAttrs({peaks}={}) {
        const prefs = this.getPrefs();
        peaks = peaks || this.peaks;
        if (this.filterPeak) {
            peaks = peaks.filter(x => this.filterPeak(x));
        }
        return {
            name: this.name,
            prefs,
            peaks,
            filters: this.filters,
            unit: getPeaksUnit(prefs.type),
            valueFormatter: getPeaksValueFormatter(prefs.type),
            hasMore: this.hasMore,
        };
    }

    async render({update}={}) {
        this.$('.loading-mask').addClass('loading');
        try {
            if (update) {
                await this.updatePeaks();
            }
            await super.render();
            await this.controlsView.setElement(this.$('.peaks-controls-view')).render();
        } finally {
            this.$('.loading-mask').removeClass('loading');
        }
    }

    async makeTableRows(peaks) {
        const tpl = await sauce.template.getTemplate('performance/peaks/table-rows.html', 'performance');
        return await tpl(this.renderAttrs({peaks}));
    }

    async getAthleteName(id) {
        const athlete = await getAthlete(id);
        return athlete ? athlete.name : `<${id}>`;
    }

    async getPeaks(options={}) {
        const {start, end} = this.range;
        const prefs = this.getPrefs();
        const period = getPeriodType(prefs.type) === 'distance' ? prefs.distance : prefs.time;
        const peaks = (await getPeaks({
            period,
            start,
            end,
            athlete: this.athlete,
            expandActivities: true,
            ...prefs,
            ...options,
            limit: this.pageSize,
        })).filter(x => x.activity);
        for (const x of peaks) {
            x.activity.athleteName = await this.getAthleteName(x.athlete);
        }
        return peaks;
    }

    async updatePeaks() {
        this.peaks = await this.getPeaks();
        this.hasMore = this.peaks.length === this.pageSize;
    }

    async onBeforeUpdateActivities({athlete, range}) {
        this.range = range;
        this.athlete = athlete;
        await this.render({update: true});
    }

    async onResultClick(ev) {
        if (ev.target.closest('.results tr a, .results tr .btn')) {
            return;
        }
        const id = Number(ev.currentTarget.dataset.id);
        const activity = await sauce.hist.getActivity(id);
        this.pageView.trigger('select-activities', [activity]);
    }

    async onEditActivityClick(ev) {
        const id = Number(ev.currentTarget.closest('[data-id]').dataset.id);
        const activity = await sauce.hist.getActivity(id);
        Views.editActivityDialogXXX(activity, this.pageView);
    }

    async onLoadMoreClick(ev) {
        const loadMore = ev.currentTarget;
        loadMore.classList.add('loading');
        try {
            const morePeaks = await this.getPeaks({skip: this.peaks.length});
            this.peaks = this.peaks.concat(morePeaks);
            this.hasMore = morePeaks.length === this.pageSize;
            const moreRows = await this.makeTableRows(morePeaks);
            sauce.adjacentNodeContents(loadMore.closest('table').querySelector('tbody.data'),
                                       'beforeend', moreRows);
        } finally {
            if (!this.hasMore) {
                loadMore.classList.add('hidden');
            }
            loadMore.classList.remove('loading');
        }
    }

    onFilterClick(ev) {
        const input = ev.currentTarget.parentElement.querySelector('input.filter');
        input.classList.toggle('visible');
        if (input.classList.contains('visible')) {
            input.focus();
        }
    }

    async onFilterInput(ev) {
        const input = ev.currentTarget;
        const val = input.value;
        const field = input.dataset.activityField;
        if (val) {
            const terms = val.split(',').map(x => x.trim()).filter(x => x);
            const inTerms = terms.filter(x => !x.startsWith('!'));
            const exTerms = terms.filter(x => x.startsWith('!')).map(x => x.substr(1));
            if (inTerms.length + exTerms.length) {
                this.filters[field] = {
                    filter: peak => {
                        const v = peak.activity[field].toLowerCase();
                        return (!inTerms.length || inTerms.some(x => v.includes(x))) &&
                            exTerms.every(x => !v.includes(x));
                    },
                    val
                };
            } else {
                delete this.filters[field];
            }
        } else {
            delete this.filters[field];
        }
        // Build a filter chain instead of doing iteration in the filter func.
        this.filterPeak = null;
        for (const {filter} of Object.values(this.filters)) {
            if (this.filterPeak) {
                const prevFilter = this.filterPeak;
                this.filterPeak = x => prevFilter(x) && filter(x);
            } else {
                this.filterPeak = filter;
            }
        }
        this.$('tbody.data').html(await this.makeTableRows(this.peaks));
    }
}


export class PeaksChartView extends Charts.ActivityTimeRangeChartView {
    static uuid = '1479b2a2-c8e3-48f9-bf6f-9acce30b12d8';
    static tpl = 'performance/peaks/chart.html';
    static typeLocaleKey = 'performance_peaks_chart_type';
    static nameLocaleKey = 'performance_peaks_chart_name';
    static descLocaleKey = 'performance_peaks_desc';

    get defaultPrefs() {
        const mile = 1609.344;
        return {
            type: 'power',
            time: 300,
            distance: 10000,
            activityType: null,
            skipEstimates: null,
            skipVirtual: null,
            disabledDatasets: {
                // XXX want a small list but we don't know the user's ranges here.. :/
                p5: false,
                p15: true,
                p30: true,
                p60: false,
                p120: true,
                p600: true,
                p1800: true,
                p3600: true,
                p10800: true,

                d400: true,
                d1000: true,
                [`d${Math.round(mile)}`]: false,
                d3000: true,
                d5000: false,
                d10000: true,
                [`d${Math.round(mile * 13.1)}`]: true,
                [`d${Math.round(mile * 26.2)}`]: true,
                d50000: true,
                d100000: true,
                [`d${Math.round(mile * 100)}`]: true,
            },
        };
    }

    async init(options) {
        this.peakRanges = {
            periods: await Views.getPeakRanges('periods'),
            distances: await Views.getPeakRanges('distances'),
        };
        this.controlsView = new PeaksControlsView({
            panelView: this,
            disableLimit: true,
            disableIncludeAllDates: true,
            disableIncludeAllAthletes: true,
            disablePeriod: true,
        });
        this.availableDatasets = {
            ...Object.fromEntries(this.peakRanges.periods.map(x => [
                `p${x.value}`,
                {period: x.value, type: 'period', label: `${H.peakPeriod(x.value)}`}
            ])),
            ...Object.fromEntries(this.peakRanges.distances.map(x => [
                `d${x.value}`,
                {period: x.value, type: 'distance', label: `${H.raceDistance(x.value)}`}
            ])),
        };
        this.setChartConfig({
            options: {
                elements: {
                    point: {
                        pointStyle: 'circle',
                    },
                },
                scales: {
                    yAxes: [{
                        id: 'values',
                        ticks: {
                            beginAtZero: false,
                            maxTicksLimit: 7,
                            callback: x => {
                                const prefs = this.getPrefs();
                                return `${getPeaksValueFormatter(prefs.type)(x)} ${getPeaksUnit(prefs.type)}`;
                            }
                        },
                    }]
                },
                tooltips: {
                    intersect: false,
                },
            }
        });
        await super.init(options);
    }

    async updateChart() {
        const prefs = this.getPrefs();
        const reverse = getPeriodType(prefs.type) === 'distance';
        const {start, end} = this.range;
        const activeDatasets = this.getActiveDatasets();
        const metricPeaks = await Promise.all(Object.entries(activeDatasets).map(async ([id, x]) => {
            const peaks = await getPeaks({period: x.period, start, end, athlete: this.athlete, ...prefs});
            peaks.sort((a, b) => a.ts - b.ts);
            const metricData = this.metricData.map(x => ({...x}));  // shallow copy
            const peaksIter = peaks.values();
            let peak;
            for (const m of metricData) {
                const allActs = m.activities;
                m.activities = [];
                if (peak) {
                    // Handle unconsumed peak from prev peaksIter iteration.
                    if (this.isInMetricRange(peak._day, m)) {
                        m.peak = peak;
                        m.activities = allActs.filter(x => x.id === peak.activity);
                    } else {
                        continue;
                    }
                }
                for (peak of peaksIter) {
                    peak._day = sauce.date.toLocaleDayDate(peak.ts);
                    if (this.isInMetricRange(peak._day, m)) {
                        if (!m.peak ||
                            ((reverse && m.peak.value > peak.value) ||
                             (!reverse && m.peak.value < peak.value))) {
                            m.peak = peak;
                            m.activities = allActs.filter(x => x.id === peak.activity);
                        }
                    } else {
                        break;
                    }
                }
            }
            return {metricData, id, ...x};
        }));
        this.chart.options.scales.yAxes[0].ticks.reverse = reverse;
        const datasets = [];
        const hslSeeds = {
            power: [300, 50, 40],
            power_wkg: [300, 80, 50],
            np: [320, 100, 50],
            xp: [300, 100, 50],
            pace: [220, 100, 50],
            gap: [200, 100, 50],
            hr: [10, 100, 50],
        };
        const hueSeed = hslSeeds[prefs.type];
        const periodColor = (i, opacity) => {
            const hsla = [
                hueSeed[0],
                hueSeed[1] - ((hueSeed[1] * 0.8) * (i / metricPeaks.length)),
                hueSeed[2],
                opacity,
            ];
            return `hsla(${hsla[0]}deg, ${hsla[1]}%, ${hsla[2]}%, ${hsla[3]})`;
        };
        for (const [i, {metricData, id, label}] of metricPeaks.entries()) {
            datasets.push({
                id,
                label,
                borderColor: periodColor(i, 0.7),
                backgroundColor: periodColor(i, 0.9),
                spanGaps: true,
                yAxisID: 'values',
                tooltipFormat: x => this.valueFormatter(x),
                data: metricData.map(b => ({
                    b,
                    x: b.date,
                    y: b.peak ? b.peak.value : null,
                })),
            });
        }
        this.chart.data.datasets = datasets;
        this.chart.update();
    }

    async render({update}={}) {
        this.$('.loading-mask').addClass('loading');
        const prefs = this.getPrefs();
        this.valueFormatter = x => x != null ?
            [
                getPeaksValueFormatter(
                    prefs.type)(x), `<abbr class="unit">${getPeaksUnit(prefs.type)}</abbr>`
            ].join(' ') :
            '-';
        try {
            await super.render();
            await this.controlsView.setElement(this.$('.peaks-controls-view')).render();
            if (update) {
                await this.updateChart();
            }
        } finally {
            this.$('.loading-mask').removeClass('loading');
        }
    }

    getActiveDatasets() {
        const disabled = this.getPrefs('disabledDatasets', {});
        const prefs = this.getPrefs();
        const periodType = getPeriodType(prefs.type);
        const datasets = {};
        for (const [id, x] of Object.entries(this.availableDatasets)) {
            if (!disabled[id] && x.type === periodType) {
                datasets[id] = x;
            }
        }
        return datasets;
    }

    isInMetricRange(date, m) {
        return date >= m.date && date < D.adjacentDay(m.date, m.days);
    }
}


class PeaksCurveChart extends Charts.SauceChart {

    constructor(ctx, view, config) {
        let _this;
        config.options.scales.xAxes[0].afterBuildTicks = () => _this && _this.view.peakPeriods;
        super(ctx, view, config);
        _this = this;
    }

    updateTooltips(...highlightedTuples) {
        const labels = [];
        let title, caretX;
        for (const [dsIdx, i] of highlightedTuples) {
            const ds = this.data.datasets[dsIdx];
            if (!ds) {
                continue;
            }
            const data = ds.data[i >= 0 ? i : ds.data.length + i];
            title ??= H.peakPeriod(data.x);
            // XXX got to be a better way, also does this even make sense?..
            caretX ??= Object.values(ds._meta)[0].data[i].getCenterPoint().x;
            const activity = this.view.getActivity(data.peak.activity);
            labels.push(`
                <div class="data-label" data-ds="${ds.id}"
                     style="--border-color: ${ds.borderColor};
                            --bg-color: ${ds.backgroundColor};">
                    <div class="color-bubble"></div>
                    <div class="lines">
                        <div class="line">
                            <span class="label">${ds.label} ${data.x}</span>
                            <span class="value">${H.number(data.y, {suffix: 'w', html: true})}</span>
                        </div>
                        <div class="line extra">${H.date(data.peak.ts, {style: 'weekdayYear'})}</div>
                        ${activity ? `
                            <div class="line extra activity">
                                <a href="/activities/${activity.id}">${activity.name}</a>
                            </div>` : '<div class="line extra activity">&nbsp;</div>'}
                    </div>
                    ${data.peak.rankBadge?.badge ? `
                        <img class="rank-badge" title="${data.peak.rankBadge.tooltip}"
                             src="${data.peak.rankBadge.badge}"/>
                    ` : ''}
                </div>
            `);
        }
        const $tooltipEl = jQuery(this.canvas).closest('.sauce-panel').find('.chart-tooltip');
        $tooltipEl[0].classList.toggle('inactive', caretX == null);
        $tooltipEl[0].style.setProperty('--caret-left', `${caretX || 0}px`);
        $tooltipEl.html(`
            <div class="tt-labels axis">${labels.join('')}</div>
            <div class="tt-horiz axis">
                <div class="tt-title">${title}</div>
                <div class="tt-desc"></div>
            </div>
        `);
    }
}

export class PeaksCurveView extends Charts.ChartView {

    static uuid = '17e61fd8-3c3e-42c5-885e-5bb7c88e5aaa';
    static tpl = 'performance/peaks/curve.html';
    static typeLocaleKey = 'performance_peaks_curve_type';
    static nameLocaleKey = 'performance_peaks_curve_name';
    static descLocaleKey = 'performance_peaks_curve_desc';
    static localeKeys = ['current_range', 'previous_range', 'all_before', 'all_after', 'all'];

    get defaultPrefs() {
        return {
            skipEstimates: true,
            skipVirtual: false,
            compare: [],
            powerEstimationModel: 'morton3p',
        };
    }

    async init(options) {
        this._activityCache = new Map();
        this.peakPeriods = (await Views.getPeakRanges('periods')).map(x => x.value);
        this.controlsView = new PeaksCurveControlsView({panelView: this});
        const ttAnimation = sauce.ui.throttledAnimationFrame();
        this.setChartConfig({
            type: 'line',
            options: {
                elements: {
                    point: {
                        pointStyle: 'circle',
                    },
                    line: {
                        cubicInterpolationMode: 'monotone',
                    }
                },
                scales: {
                    yAxes: [{
                        id: 'values',
                        ticks: {
                            beginAtZero: true,
                            maxTicksLimit: 7,
                            callback: x => `${getPeaksValueFormatter('power')(x)} ${getPeaksUnit('power')}`,
                        },
                    }],
                    xAxes: [{
                        id: 'periods',
                        type: 'logarithmic',
                        ticks: {
                            min: this.peakPeriods[0],
                            max: this.peakPeriods[this.peakPeriods.length - 1],
                            callback: x => H.peakPeriod(x, {short: true}),
                        }
                    }],
                },
                tooltips: {
                    intersect: false,
                    position: 'nearest',
                    mode: 'nearest',
                    axis: 'x',
                    custom: tt => {
                        if (tt.dataPoints && tt.dataPoints.length) {
                            const tuples = tt.dataPoints.map(x => [x.datasetIndex, x.index]);
                            ttAnimation(() => this.chart.updateTooltips(...tuples));
                        }
                    }
                }
            }
        });
        await super.init({
            ...options,
            ChartClass: PeaksCurveChart,
        });
        this.compareOptions = [
            {value: 'current-range', locale: this.LM('previous_range'), required: true},
            {value: 'previous-range', locale: this.LM('previous_range')},
            {value: 'all-before', locale: this.LM('all_before')},
            {value: 'all-after', locale: this.LM('all_after')},
            {value: 'all', locale: this.LM('all')},
        ];
    }

    renderAttrs() {
        return {name: this.name};
    }

    async fetchActivity(id) {
        let activity = this.getActivity(id);
        if (!activity) {
            activity = await sauce.hist.getActivity(id);
            this._activityCache.set(id, activity || null);
        }
        return activity;
    }

    getActivity(id) {
        let activity = this._activityCache.get(id);
        if (!activity) {
            activity = this.activities.find(x => x.id === id);
            if (activity) {
                this._activityCache.set(id, activity);
            }
        }
        return activity;
    }

    async updateChart() {
        const prefs = this.getPrefs();
        const getTopRankPeaksData = async (start, end) => {
            const topRanked = await Promise.all(this.peakPeriods.map(async period => {
                const p = (await getPeaks({
                    type: 'power',
                    period,
                    start,
                    end,
                    activityType: prefs.activityType,
                    athlete: this.athlete,
                    limit: 1,
                    skipVirtual: prefs.skipVirtual,
                    skipEstimates: prefs.skipEstimates,
                }))[0];
                if (p) {
                    await this.fetchActivity(p.activity);
                }
                return p;
            }));
            return topRanked
                .filter(x => x)
                .map(peak => ({peak, x: peak.period, y: peak.value}));
        };
        const colors = [
            '#29a607',
            '#078ea6',
            '#6a54c5',
            '#c554b7',
            '#ec0404',
            '#2f80ea',
            '#074ca6',
            '#b42929',
            '#2a0aa9',
        ];
        const curRangeData = await getTopRankPeaksData(this.range.start, this.range.end);
        const datasets = [{
            id: 'current-range',
            label: this.LM('current_range'),
            borderColor: '#f228',
            backgroundColor: '#f238',
            fill: 'start',
            data: curRangeData,
        }];
        for (const x of prefs.compare) {
            if (x === 'all') {
                datasets.push({
                    id: x,
                    label: this.LM('all'),
                    data: await getTopRankPeaksData()
                });
            } else if (x === 'all-before') {
                datasets.push({
                    id: x,
                    label: this.LM('all_before'),
                    data: await getTopRankPeaksData(-Infinity, this.range.start)
                });
            } else if (x === 'all-after') {
                datasets.push({
                    id: x,
                    label: this.LM('all_after'),
                    data: await getTopRankPeaksData(this.range.end, Infinity),
                });
            } else if (x === 'previous-range') {
                const pRange = this.range.clone();
                pRange.shift(-1);
                datasets.push({
                    id: x,
                    label: this.LM('previous_range'),
                    data: await getTopRankPeaksData(pRange.start, pRange.end),
                });
            } else if (x.startsWith('year-')) {
                const year = +x.substr(5);
                const start = new Date(`${year}-01-01`).getTime();
                const end = new Date(`${year + 1}-01-01`).getTime();
                datasets.push({
                    id: x,
                    label: year,
                    data: await getTopRankPeaksData(start, end),
                });
            } else {
                console.warn('Unimplemented range type:', x);
            }
        }

        if (0) {
            const mmp = curRangeData
                .filter(o => o.x >= 0 && o.x <= 3600)
                .map(o => ({duration: o.x, power: o.y, peak: o.peak}));
            const modelMorton2 = Eftp.fitMorton2(mmp);
            const modelMorton3 = Eftp.fitMorton3(mmp);
            const modelMorton4 = Eftp.fitMorton4(mmp);
            const modelMorton5 = Eftp.fitMorton5(mmp);
            console.log("CP Morton2", Eftp.powerAtMorton2(3600, modelMorton2), modelMorton2);
            console.log("CP Morton3", Eftp.powerAtMorton3(3600, modelMorton3), modelMorton3);
            console.log("CP Morton4", Eftp.powerAtMorton4(3600, modelMorton4), modelMorton4);
            console.log("CP Morton5", Eftp.morton3(3600, modelMorton5), modelMorton5);

            const periods = curRangeData.map(o => o.x);
            const peakPower = curRangeData[0].y;
            for (const min of periods.filter(t => t <= 600 && t > 1)) {
                for (const max of periods.filter(t => t >= 1200 && t <= 3600)) {
                    const mmpb = curRangeData
                        .filter(o => o.x >= min && o.x <= max)
                        .map(o => ({duration: o.x, power: o.y, peak: o.peak}));
                    if (mmpb.length < 3) {
                        continue;
                    }
                    mmpb.unshift({duration: 1, power: peakPower});
                    const modelMorton2b = Eftp.fitMorton2(mmpb);
                    const modelMorton3b = Eftp.fitMorton3(mmpb);
                    const modelMorton4b = Eftp.fitMorton4(mmpb);
                    const modelMorton5b = Eftp.fitMorton5(mmpb);
                    console.log(min, max);
                    console.log("CP Morton2b", Eftp.powerAtMorton2(3600, modelMorton2b), modelMorton2b);
                    console.log("CP Morton3b", Eftp.powerAtMorton3(3600, modelMorton3b), modelMorton3b);
                    console.log("CP Morton4b", Eftp.powerAtMorton4(3600, modelMorton4b), modelMorton4b);
                    console.log("CP Morton5b", Eftp.morton3(3600, modelMorton5b), modelMorton5b);
                }
            }
     
            let mmpDurations = [];
            for (let i = 1;; i++) {
                const d = (mmpDurations[0] || 0) + Math.ceil(Math.exp(i / 10)) - 1;
                if (d >= 10800) {
                    mmpDurations.push(10800);
                    break;
                }
                mmpDurations.push(d);
            }
            mmpDurations = Array.from(new Set(mmpDurations.concat(curRangeData.map(o => o.x))))
                .toSorted((a, b) => a - b)
                .filter(x => x >= 5);
            datasets.push(/*{
                id: 'cp-morton(src)',
                label: 'eFTP (cp-morton-src)',
                data: mmp.map(x => ({peak: x.peak, x: x.duration, y: x.power})),
            }, {
                id: 'cp-morton(fitted)',
                label: 'eFTP (cp-morton-fitted)',
                data: mmpDurations.map(t => ({peak: {ts: new Date()}, x: t, y: Eftp.powerAtMorton(t, modelMorton)})),
            },*/ {
                id: 'cp-morton2(fitted)',
                label: 'm2',
                data: mmpDurations.map(t => ({peak: {ts: new Date()}, x: t, y: Eftp.powerAtMorton2(t, modelMorton2)})),
            }, {
                id: 'cp-morton3(fitted)',
                label: 'm3',
                data: mmpDurations.map(t => ({peak: {ts: new Date()}, x: t, y: Eftp.powerAtMorton3(t, modelMorton3)})),
            }, {
                id: 'cp-morton4(fitted)',
                label: 'm4',
                data: mmpDurations.map(t => ({peak: {ts: new Date()}, x: t, y: Eftp.powerAtMorton4(t, modelMorton4)})),
            }, {
                id: 'cp-morton5(fitted)',
                label: 'm5',
                data: mmpDurations.map(t => ({peak: {ts: new Date()}, x: t, y: Eftp.morton3(t, modelMorton5)})),
            });
            console.log(datasets);
        }

        for (const x of datasets) {
            if (!x.borderColor) {
                const color = colors.shift() || '#999999';
                x.borderColor = `hsl(from ${color} h s l / 0.8)`;
                x.backgroundColor = `hsl(from ${color} h calc(s - 50) calc(l + 20) / 0.6)`;
            }
            Object.assign(x, {
                spanGaps: true,
                tooltipFormat: x => this.valueFormatter(x),
                yAxis: 'values',
                xAxis: 'periods',
            });
        }
        this.chart.data.datasets = datasets;
        this.chart.update();
    }

    async render({update}={}) {
        this.$('.loading-mask').addClass('loading');
        this.valueFormatter = x => x != null ?
            [
                getPeaksValueFormatter('power')(x),
                `FOO123 <abbr class="unit">${getPeaksUnit('power')}</abbr>`
            ].join(' ') :
            '-';
        try {
            await super.render();
            await this.controlsView.setElement(this.$('.peaks-controls-view')).render();
            if (update) {
                await this.updateChart();
            }
        } finally {
            this.$('.loading-mask').removeClass('loading');
        }
    }
}

export const PanelViews = [
    PeaksTableView,
    PeaksChartView,
    PeaksCurveView,
];


class PeaksMainView extends Views.MainView {
    static tpl = 'performance/peaks/main.html';

    get availablePanelViews() {
        return [...PanelViews, ...Fitness.PanelViews, ...Views.PanelViews];
    }

    get defaultPrefs() {
        return {
            ...super.defaultPrefs,
            panels: [{
                id: 'panel-default-peaks-peaks-table-0',
                view: '9e0e835b-0d71-4116-9b5a-eb6924386526',
            }, {
                id: 'panel-default-peaks-peaks-chart-0',
                view: '1479b2a2-c8e3-48f9-bf6f-9acce30b12d8',
            }, {
                id: 'panel-default-peaks-activity-table-0',
                view: 'c9222e6a-80ee-4ccc-a45c-dfe996c3ec16'
            }]
        };
    }
}


export default async function load(options) {
    self.pv = new Views.PageView({...options, MainView: PeaksMainView});
    await self.pv.render();
}
