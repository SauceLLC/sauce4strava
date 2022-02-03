/* global sauce */

import * as views from './views.mjs';
import * as data from './data.mjs';
import * as charts from './charts.mjs';
import * as peaks from './peaks.mjs';


const DAY = 86400 * 1000;
const L = sauce.locale;
const H = L.human;
const D = sauce.date;


function humanKJ(kj) {
    if (kj >= 1000000) {
        return `${H.number(kj / 1000000, 1)} gJ`;
    } else if (kj >= 1000) {
        return `${H.number(kj / 1000, 1)} mJ`;
    } else {
        return `${H.number(kj)} kJ`;
    }
}


export class TrainingChartView extends charts.ActivityTimeRangeChartView {
    static nameLocaleKey = 'performance_training_load_title';
    static descLocaleKey = 'performance_training_load_desc';
    static tpl = 'performance/fitness/training-load.html';
    static localeKeys = [
        'activities', 'predicted_tss', 'predicted_tss_tooltip', 'fitness', 'fatigue', 'form',
        'today',
    ];

    async init(options) {
        await super.init(options);
        this.setChartConfig({
            plugins: [charts.overUnderFillPlugin],
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
                }
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


export class ZoneTimeChartView extends charts.ActivityTimeRangeChartView {
    static nameLocaleKey = 'performance_zonetime_title';
    static descLocaleKey = 'performance_zonetime_desc';
    static localeKeys = ['power_zones', 'activities'];
    static tpl = 'performance/fitness/zonetime.html';

    async init(options) {
        await super.init(options);
        this.setChartConfig({
            type: 'bar',
            options: {
                scales: {
                    xAxes: [{
                        stacked: true,
                    }],
                    yAxes: [{
                        id: 'time',
                        position: 'right',
                        ticks: {
                            min: 0,
                            suggestedMax: 1 * 3600,
                            stepSize: 3600,
                            maxTicksLimit: 7,
                            callback: v => H.duration(v, {maxPeriod: 3600, minPeriod: 3600}),
                        }
                    }]
                },
            }
        });
    }

    onUpdateActivities({range, daily, metricData}) {
        this.$('.metric-display').text(this.pageView.getMetricLocale(range.metric));
        const zones = [
            {id: 'power-z1', h: 180, s: 10, l: 70},
            {id: 'power-z2', h: 100, s: 65, l: 60},
            {id: 'power-z3', h: 60, s: 70, l: 60},
            {id: 'power-z4', h: 0, s: 70, l: 60},
            {id: 'power-z5', h: 320, s: 70, l: 50},
            {id: 'power-z6', h: 300, s: 70, l: 40},
            {id: 'power-z7', h: 280, s: 70, l: 20},
        ];
        this.chart.data.datasets = zones.map((x, zoneIndex) => ({
            id: x.id,
            label: `Z${zoneIndex + 1}`,
            backgroundColor: `hsla(${x.h}deg, ${x.s - 3}%, ${x.l + 2}%, 0.8)`,
            hoverBackgroundColor: `hsla(${x.h}deg, ${x.s + 3}%, ${x.l - 2}%, 0.9)`,
            borderColor: `hsla(${x.h}deg, ${x.s - 3}%, ${x.l - 10}%, 0.9)`,
            hoverBorderColor: `hsla(${x.h}deg, ${x.s + 3}%, ${x.l - 20}%, 0.9)`,
            borderWidth: 1,
            yAxisID: 'time',
            stack: 'power',
            tooltipFormat: (x, i) => {
                const tips = [H.duration(x, {maxPeriod: 3600, minPeriod: 3600, digits: 1})];
                return tips;
            },
            data: metricData.map((b, i) => ({b, x: b.date, y: b.powerZonesTime[zoneIndex] || 0})),
        }));
        this.chart.update();
    }
}


class PanelSettingsView extends views.PerfView {
    constructor(panelView, options) {
        super(options);
        this.panelView = panelView;
    }

    renderAttrs() {
        return this.panelView.getPrefs();
    }
}


class ActivityVolumentChartSettingsView extends PanelSettingsView {
    static tpl = 'performance/fitness/activity-volume-settings.html';

    get events() {
        return {
            'input input.ds-vis[type="checkbox"]': 'onDatasetVisibilityInput',
        };
    }

    async onDatasetVisibilityInput(ev) {
        const enabled = ev.currentTarget.checked;
        const name = ev.currentTarget.name;
        this.panelView.getPrefs('hiddenDatasets', {})[name] = !enabled;
        this.panelView.getPrefs('disabledDatasets', {})[name] = !enabled;
        await this.panelView.savePrefs();
        await this.panelView.render();
    }
}


export class ActivityVolumeChartView extends charts.ActivityTimeRangeChartView {
    static nameLocaleKey = 'performance_activities_title';
    static descLocaleKey = 'performance_activities_desc';
    static tpl = 'performance/fitness/activity-volume.html';
    static localeKeys = ['predicted', '/analysis_time', '/analysis_distance', 'activities',
        '/analysis_energy'];
    static SettingsView = ActivityVolumentChartSettingsView;

    async init(options) {
        await super.init(options);
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
                    }, {
                        id: 'energy',
                        position: 'right',
                        gridLines: {display: false},
                        ticks: {
                            min: 0,
                            maxTicksLimit: 6,
                            callback: v => humanKJ(v),
                        },
                    }]
                }
            }
        });
    }

    onUpdateActivities({range, daily, metricData}) {
        this.$('.metric-display').text(this.pageView.getMetricLocale(range.metric));
        let predictions;
        if (D.tomorrow() <= range.end && metricData.length) {
            const remaining = (range.end - Date.now()) / DAY;
            const days = Math.round((range.end - metricData[metricData.length - 1].date) / DAY);
            const weighting = Math.min(days, daily.length);
            const avgKJ = sauce.perf.expWeightedAvg(weighting, daily.map(x => x.kj));
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
                energy: metricData.map((b, i) => ({
                    b,
                    x: b.date,
                    y: i === metricData.length - 1 ? avgKJ * remaining : null,
                }))
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
        }, {
            id: 'energy',
            label: this.LM('analysis_energy'),
            backgroundColor: '#8ccd6cd0',
            borderColor: '#7cbd5cf0',
            hoverBackgroundColor: '#7cbd5c',
            hoverBorderColor: '#7cbd5c',
            yAxisID: 'energy',
            stack: 'energy',
            tooltipFormat: (x, i) => {
                const kjDay = H.number(x / metricData[i].days);
                const tips = [`${humanKJ(x)} <small>(${kjDay}/d)</small>`];
                if (predictions && i === metricData.length - 1) {
                    const pkj = predictions.energy[i].y + x;
                    const pkjDay = H.number(pkj / predictions.days);
                    tips.push(`${this.LM('predicted')}: <b>~${humanKJ(pkj)} <small>(${pkjDay}/d)</small></b>`);
                }
                return tips;
            },
            data: metricData.map((b, i) => ({b, x: b.date, y: b.kj})),
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
            }, {
                id: 'energy',
                backgroundColor: '#8ccd6c50',
                borderColor: '#7cbd5c50',
                hoverBackgroundColor: '#7cbd5c60',
                hoverBorderColor: '#7cbd5c60',
                yAxisID: 'energy',
                stack: 'energy',
                data: predictions.energy,
            });
        }
        for (const [i, x] of this.chart.data.datasets.entries()) {
            this.chart.data.datasets[i] = Object.assign({}, commonOptions, x);
        }
        this.chart.update();
    }
}


export class ElevationChartView extends charts.ActivityTimeRangeChartView {
    static nameLocaleKey = 'performance_elevation_title';
    static descLocaleKey = 'performance_elevation_desc';
    static tpl = 'performance/fitness/elevation.html';
    static localeKeys = ['/analysis_gain', 'activities'];

    async init(options) {
        const thousandFeet = 1609.344 / 5280 * 100;
        const stepSize = L.elevationFormatter.unitSystem === 'imperial' ? thousandFeet : 1000;
        await super.init(options);
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


export const PanelViews = {
    TrainingChartView,
    ActivityVolumeChartView,
    ElevationChartView,
    ZoneTimeChartView,
};


class FitnessMainView extends views.MainView {
    static tpl = 'performance/fitness/main.html';

    get availablePanelViews() {
        return {...PanelViews, ...peaks.PanelViews};
    }

    get defaultPrefs() {
        return {
            ...super.defaultPrefs,
            panels: [{
                id: 'panel-default-training-load-0',
                view: 'TrainingChartView',
                settings: {},
            }, {
                id: 'panel-default-activity-volume-1',
                view: 'ActivityVolumeChartView',
                settings: {},
            }, {
                id: 'panel-default-zonetimes-3',
                view: 'ZoneTimeChartView',
                settings: {},
            }, {
                id: 'panel-default-elevation-2',
                view: 'ElevationChartView',
                settings: {},
            }]
        };
    }
}


export default async function load({athletes, router, $page}) {
    self.pv = new views.PageView({athletes, router, MainView: FitnessMainView, el: $page});
    await self.pv.render();
}
