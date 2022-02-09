/* global sauce */

import * as views from './views.mjs';
import * as fitness from './fitness.mjs';
import * as charts from './charts.mjs';

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
        power_wkg: x => x.toFixed(1),
        np: H.number,
        xp: H.number,
        hr: H.number,
        pace: H.pace,
        gap: H.pace,
    }[streamType];
}


async function getPeaks({type, period, activityType, limit, skipEstimates, ...optional}) {
    const options = {
        limit,
        activityType,
        skipEstimates,
        expandActivities: optional.expandActivities,
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


class PeaksControlsView extends views.PerfView {
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
            periods: await views.getPeakRanges('periods'),
            distances: await views.getPeakRanges('distances'),
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


export class PeaksTableView extends views.PerfView {
    static tpl = 'performance/peaks/table.html';
    static nameLocaleKey = 'performance_peaks_table_title';
    static descLocaleKey = 'performance_peaks_desc';

    get events() {
        return {
            ...super.events,
            'click .results table tbody tr': 'onResultClick',
            'click .edit-activity': 'onEditActivityClick',
            'pointerdown .resize-drag': 'onResizePointerDown',
        };
    }

    get defaultPrefs() {
        return {
            type: 'power',
            limit: 10,
            time: 300,
            distance: 10000,
            includeAllAthletes: false,
            includeAllDates: false,
            activityType: null,
            skipEstimates: null,
        };
    }

    async init({pageView, ...options}) {
        this.peaks = [];
        this.range = pageView.getRangeSnapshot();
        this.athlete = pageView.athlete;
        this.controlsView = new PeaksControlsView({panelView: this});
        this.listenTo(pageView, 'before-update-activities',
            sauce.debounced(this.onBeforeUpdateActivities));
        await super.init({pageView, ...options});
    }

    renderAttrs() {
        const prefs = this.getPrefs();
        return {
            name: this.name,
            prefs,
            peaks: this.peaks,
            unit: getPeaksUnit(prefs.type),
            valueFormatter: getPeaksValueFormatter(prefs.type),
            getAthleteName: id => this.getAthleteName(id),
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

    async getAthleteName(id) {
        const athlete = await getAthlete(id);
        return athlete ? athlete.name : `<${id}>`;
    }

    async updatePeaks() {
        const {start, end} = this.range;
        const prefs = this.getPrefs();
        const period = getPeriodType(prefs.type) === 'distance' ? prefs.distance : prefs.time;
        this.peaks = await getPeaks({
            period,
            start,
            end,
            athlete: this.athlete,
            expandActivities: true,
            ...prefs
        });
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
        views.editActivityDialogXXX(activity, this.pageView);
    }

    onResizePointerDown(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        const origHeight = this.$el.height();
        const origPageY = ev.pageY;
        this.$el.height(origHeight);
        this.$el.addClass('fixed-height');
        const onDragDone = () => {
            removeEventListener('pointermove', onDrag);
            removeEventListener('pointerup', onDragDone);
            removeEventListener('pointercancel', onDragDone);
        };
        const onDrag = ev => {
            this.$el.height(origHeight + (ev.pageY - origPageY));
        };
        addEventListener('pointermove', onDrag);
        addEventListener('pointerup', onDragDone);
        addEventListener('pointercancel', onDragDone);
        sauce.report.event('PerfPeaksTableView', 'resize');
    }
}


export class PeaksChartView extends charts.ActivityTimeRangeChartView {
    static tpl = 'performance/peaks/chart.html';
    static nameLocaleKey = 'performance_peaks_chart_title';
    static descLocaleKey = 'performance_peaks_desc';
    static localeKeys = [...super.localeKeys];

    get defaultPrefs() {
        const mile = 1609.344;
        return {
            type: 'power',
            time: 300,
            distance: 10000,
            activityType: null,
            skipEstimates: null,
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
            periods: await views.getPeakRanges('periods'),
            distances: await views.getPeakRanges('distances'),
        };
        this.controlsView = new PeaksControlsView({
            panelView: this,
            disableLimit: true,
            disableIncludeAllDates: true,
            disableIncludeAllAthletes: true,
            disablePeriod: true,
        });
        this.availableDatasets = {
            ...Object.fromEntries(this.peakRanges.periods.map(x =>
                [`p${x.value}`, {period: x.value, type: 'period', label: `${H.duration(x.value)}`}])),
            ...Object.fromEntries(this.peakRanges.distances.map(x =>
                [`d${x.value}`, {period: x.value, type: 'distance', label: `${H.raceDistance(x.value)}`}])),
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
                            maxTicksLimit: 8,
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

    async render({update}={}) {
        this.$('.loading-mask').addClass('loading');
        const prefs = this.getPrefs();
        this.valueFormatter = getPeaksValueFormatter(prefs.type);
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
}


export const PanelViews = {
    PeaksTableView,
    PeaksChartView,
};


class PeaksMainView extends views.MainView {
    static tpl = 'performance/peaks/main.html';

    get availablePanelViews() {
        return {...PanelViews, ...fitness.PanelViews};
    }

    get defaultPrefs() {
        return {
            ...super.defaultPrefs,
            panels: [{
                id: 'panel-default-peaks-table-0',
                view: 'PeaksTableView',
                settings: {},
            }, {
                id: 'panel-default-peaks-chart-1',
                view: 'PeaksChartView',
                settings: {},
            }]
        };
    }
}


export default async function load({athletes, router, $page}) {
    self.pv = new views.PageView({athletes, router, MainView: PeaksMainView, el: $page});
    await self.pv.render();
}
