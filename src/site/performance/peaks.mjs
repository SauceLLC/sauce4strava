/* global sauce */

import * as views from './views.mjs';
import * as fitness from './fitness.mjs';
import * as charts from './charts.mjs';

const L = sauce.locale;
const H = L.human;


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
    console.error("get peaks", type, period, activityType, limit, skipEstimates, optional);
    const options = {
        limit,
        activityType,
        skipEstimates,
        expandActivities: true,
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
        this.peaks = await getPeaks({period, start, end, athlete: this.athlete, ...prefs});
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
        return {
            type: 'power',
            time: 300,
            distance: 10000,
            activityType: null,
            skipEstimates: null,
            disabledDatasets: {
                p5: true,
                d400: true,
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
                    xAxes: [{
                        distribution: 'time', // XXX Maybe use daily/metricData and map getPeaks into it.
                    }],
                    yAxes: [{
                        id: 'values',
                        ticks: {
                            min: 0,
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

    async render() {
        this.$('.loading-mask').addClass('loading');
        const prefs = this.getPrefs();
        this.valueFormatter = getPeaksValueFormatter(prefs.type);
        try {
            await super.render();
            this.controlsView.setElement(this.$('.peaks-controls-view'));
            await this.controlsView.render();
        } finally {
            this.$('.loading-mask').removeClass('loading');
        }
    }

    getActiveDatasets() {
        const disabled = this.getPrefs('disabledDatasets', {});
        const prefs = this.getPrefs();
        const periodType = getPeriodType(prefs.type);
        const datasets = [];
        for (const [id, x] of Object.entries(this.availableDatasets)) {
            if (!disabled[id] && x.type === periodType) {
                datasets.push([id, x]);
            }
        }
        return datasets;
    }

    async updateChart() {
        const prefs = this.getPrefs();
        const {start, end} = this.range;
        const peaksGroups = await Promise.all(this.getActiveDatasets().map(async ([id, x]) => {
            const peaks = await getPeaks({period: x.period, start, end, athlete: this.athlete, ...prefs});
            peaks.sort((a, b) => a.ts - b.ts);
            return {peaks, id, ...x};
        }));
        const peaksIters = peaksGroups.map(x => x.peaks.values());
        for (const x of this.metricData) {
        }
        this.chart.options.scales.yAxes[0].ticks.reverse = getPeriodType(prefs.type) === 'distance';
        //const days = this.range.days;
        //const borderWidth = days > 366 ? 0.66 : days > 60 ? 1 : 1.25;
        const datasets = [];
        for (const {peaks, id, label} of peaksGroups) {
            datasets.push({
                id,
                label,
                //borderWidth,
                yAxisID: 'values',
                tooltipFormat: x => this.valueFormatter(x),
                data: peaks.map(x => ({
                    b: {
                        date: new Date(x.ts),
                        days: 1,
                        activities: [x.activity]
                    },
                    x: x.ts,
                    y: x.value
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
