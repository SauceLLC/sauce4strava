/* global sauce, jQuery, Chart, moment, Backbone */

sauce.ns('performance', async ns => {
    'use strict';

    const DAY = 86400 * 1000;
    const TZ = (new Date()).getTimezoneOffset() * 60000;

    const urn = 'sauce/performance';
    const defaultPeriod = 30;

    await sauce.propDefined('Backbone.Router', {once: true});
    const AppRouter = Backbone.Router.extend({
        constructor: function() {
            this.filters = {};
            Backbone.Router.prototype.constructor.apply(this, arguments);
        },

        routes: {
            [`${urn}/:athleteId/:period/:startDay/:endDay`]: 'onNav',
            [`${urn}/:athleteId/:period`]: 'onNav',
            [`${urn}/:athleteId`]: 'onNav',
            [urn]: 'onNav',
        },

        onNav: function(athleteId, period, startDay, endDay) {
            this.filters = {
                athleteId: athleteId && Number(athleteId),
                period: period && Number(period),
                periodStart: startDay && startDay * DAY + TZ,
                periodEnd: endDay && endDay * DAY + TZ,
            };
        },

        setAthlete: function(athleteId, options) {
            this.filters.athleteId = athleteId;
            this.filterNavigate(options);
        },

        setPeriod: function(athleteId, period, start, end) {
            this.filters.athleteId = athleteId;
            this.filters.period = period;
            this.filters.periodStart = start;
            this.filters.periodEnd = end;
            this.filterNavigate();
        },

        filterNavigate: function(options={}) {
            const f = this.filters;
            if (f.periodEnd != null && f.periodStart != null && f.period != null &&
                f.athleteId != null) {
                const startDay = (f.periodStart - TZ) / DAY;
                const endDay = (f.periodEnd - TZ) / DAY;
                this.navigate(`${urn}/${f.athleteId}/${f.period}/${startDay}/${endDay}`, options);
            } else if (f.period != null && f.athleteId != null) {
                this.navigate(`${urn}/${f.athleteId}/${f.period}`, options);
            } else if (f.athleteId != null) {
                this.navigate(`${urn}/${f.athleteId}`, options);
            } else {
                this.navigate(`${urn}`, options);
            }
        }
    });
    ns.router = new AppRouter();
    Backbone.history.start({pushState: true});

    await sauce.proxy.connected;
    // XXX find something just after all the locale stuff.
    await sauce.propDefined('Strava.I18n.DoubledStepCadenceFormatter', {once: true});
    await sauce.locale.init();
    await sauce.propDefined('Backbone.View', {once: true});
    const view = await sauce.getModule('/src/site/view.mjs');

    const currentUser = await sauce.storage.get('currentUser');

    Chart.plugins.unregister(self.ChartDataLabels);  // Disable data labels by default.


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


    function activitiesByDay(acts, start, end, atl=0, ctl=0) {
        // NOTE: Activities should be in chronological order
        if (!acts.length) {
            return [];
        }
        const slots = [];
        const startDay = sauce.date.toLocaleDayDate(start);
        let i = 0;
        for (const date of sauce.date.dayRange(startDay, new Date(end))) {
            if (!acts.length) {
                break;
            }
            let tss = 0;
            let duration = 0;
            const ts = date.getTime();
            const daily = [];
            while (i < acts.length && sauce.date.toLocaleDayDate(acts[i].ts).getTime() === ts) {
                const a = acts[i++];
                daily.push(a);
                tss += sauce.model.getActivityTSS(a) || 0;
                duration += a.stats && a.stats.activeTime || 0;
            }
            atl = sauce.perf.calcATL([tss], atl);
            ctl = sauce.perf.calcCTL([tss], ctl);
            slots.push({
                date,
                activities: daily,
                tss,
                duration,
                atl,
                ctl,
            });
        }
        if (i !== acts.length) {
            throw new Error('Internal Error');
        }
        return slots;
    }


    function aggregateActivitiesByFn(daily, indexFn, aggregateFn) {
        const metricData = [];
        function agg(entry) {
            entry.tss = entry.tssSum / entry.days;
            if (aggregateFn) {
                aggregateFn(entry);
            }
        }
        for (let i = 0; i < daily.length; i++) {
            const slot = daily[i];
            const index = indexFn(slot, i);
            if (!metricData[index]) {
                if (index) {
                    agg(metricData[index - 1]);
                }
                metricData[index] = {
                    date: slot.date,
                    tssSum: slot.tss,
                    duration: slot.duration,
                    days: 1,
                    activities: [...slot.activities],
                };
            } else {
                const entry = metricData[index];
                entry.tssSum += slot.tss;
                entry.duration += slot.duration;
                entry.days++;
                entry.activities.push(...slot.activities);
            }
        }
        if (metricData.length) {
            agg(metricData[metricData.length - 1]);
        }
        return metricData;
    }


    function aggregateActivitiesByWeek(daily, options={}) {
        let week = null;
        return aggregateActivitiesByFn(daily, (x, i) => {
            if (options.isoWeekStart) {
                if (week === null) {
                    week = 0;
                } else if (x.date.getDay() === /*monday*/ 1) {
                    week++;
                }
                return week;
            } else {
                return Math.floor(i / 7);
            }
        });
    }


    function aggregateActivitiesByMonth(daily, options={}) {
        let month = null;
        let curMonth;
        return aggregateActivitiesByFn(daily, x => {
            const m = x.date.getMonth();
            if (month === null) {
                month = 0;
            } else if (m !== curMonth) {
                month++;
            }
            curMonth = m;
            return month;
        });
    }


    async function getSeedTrainingLoad(activity) {
        const seed = (await sauce.hist.getActivitySiblings(activity.id,
            {direction: 'prev', limit: 1}))[0];
        let atl = 0;
        let ctl = 0;
        if (seed && seed.training) {
            atl = seed.training.atl || 0;
            ctl = seed.training.ctl || 0;
            // Drain inactive days between the seed and the activity...
            const seedDay = sauce.date.toLocaleDayDate(seed.ts);
            const firstDay = sauce.date.toLocaleDayDate(activity.ts);
            const zeros = [...sauce.date.dayRange(seedDay, firstDay)].map(() => 0);
            zeros.pop();  // Exclude seed day.
            if (zeros.length) {
                atl = sauce.perf.calcATL(zeros, atl);
                ctl = sauce.perf.calcCTL(zeros, ctl);
            }
        }
        return {atl, ctl};
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
            this.legendClicking = true;
            try {
                Chart.defaults.global.legend.onClick.call(element, ev, item);
            } finally {
                this.legendClicking = false;
            }
            const index = item.datasetIndex;
            const id = element.chart.data.datasets[index].id;
            if (!id) {
                console.warn("No ID for dataset");
                return;
            }
            jQuery(element.chart.canvas).trigger('dataVisibilityChange', {
                id,
                visible: element.chart.isDatasetVisible(index)
            });
        }

        beforeUpdate(chart) {
            // Skip setting the hidden state when the update is from the legend click.
            if (this.legendClicking) {
                return;
            }
            const chartId = chart.canvas.id;
            if (!chartId) {
                console.error("Missing canvas ID needed for visibility mgmt.");
                return;
            }
            for (const ds of chart.data.datasets) {
                if (!ds.id) {
                    console.warn("Missing ID on dataset: visiblity state unmanaged");
                    continue;
                }
                ds.hidden = this.view.dataVisibility[`${chartId}-${ds.id}`] === false;
            }
        }
    }


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

        _getFillGradientColor(ref, pct) {
            const size = this._fillGradientSize;
            pct = Math.max(0, Math.min(1, pct));
            const aPct = (Math.abs(ref.alphaMax - ref.alphaMin) * pct);
            const a = ref.alphaMax > ref.alphaMin ? aPct + ref.alphaMin : ref.alphaMin - aPct;
            const refOffset = Math.max(0, Math.min(size - 1, Math.round(pct * size)));
            const [r, g, b] = ref.gradient.getImageData(refOffset, 0, refOffset + 1, 1).data.slice(0, 3);
            return [r, g, b, a];
        },

        beforeRender: function (chart, options) {
            //var model = chart.data.datasets[3]._meta[Object.keys(dataset._meta)[0]].dataset._model;
            for (const ds of chart.data.datasets) {
                if (!ds.overUnder) {
                    continue;
                }
                for (const meta of Object.values(ds._meta)) {
                    if (!meta.dataset) {
                        continue;
                    }
                    if (!ds._overUnderRef) {
                        // We have to preserve the alpha components externally.
                        const color = c => Chart.helpers.color(c);
                        const overMax = color(ds.overBackgroundColorMax);
                        const overMin = color(ds.overBackgroundColorMin);
                        const underMin = color(ds.underBackgroundColorMin);
                        const underMax = color(ds.underBackgroundColorMax);
                        ds._overUnderRef = {
                            over: {
                                gradient: this._buildFillGradient(chart,
                                    overMin.rgbString(), overMax.rgbString()),
                                alphaMin: overMin.alpha(),
                                alphaMax: overMax.alpha(),
                            },
                            under: {
                                gradient: this._buildFillGradient(chart,
                                    underMin.rgbString(), underMax.rgbString()),
                                alphaMin: underMin.alpha(),
                                alphaMax: underMax.alpha(),
                            }
                        };
                    }
                    const ref = ds._overUnderRef;
                    const model = meta.dataset._model;
                    const scale = chart.scales[ds.yAxisID];
                    const zeroPct = Math.min(1, Math.max(0, scale.getPixelForValue(0) / scale.height));
                    const gFill = chart.ctx.createLinearGradient(0, 0, 0, scale.height);
                    const max = ds.overBackgroundMax != null ? ds.overBackgroundMax : scale.max;
                    const min = ds.underBackgroundMin != null ? ds.underBackgroundMin : scale.min;
                    const midPointMarginPct = 0.001;
                    try {
                        if (scale.max > 0) {
                            const overMaxColor = this._getFillGradientColor(ref.over, scale.max / max);
                            const overMinColor = this._getFillGradientColor(ref.over, scale.min / max);
                            const topPct = Math.max(0, scale.getPixelForValue(max) / scale.height);
                            gFill.addColorStop(topPct, `rgba(${overMaxColor.join()}`);
                            gFill.addColorStop(Math.max(0, zeroPct - midPointMarginPct),
                                `rgba(${overMinColor.join()}`);
                            gFill.addColorStop(Math.max(0, zeroPct),
                                `rgba(${overMinColor.slice(0, 3).join()}, 0)`);
                        }
                        if (scale.min < 0) {
                            const underMinColor = this._getFillGradientColor(ref.under, scale.max / min);
                            const underMaxColor = this._getFillGradientColor(ref.under, scale.min / min);
                            const bottomPct = Math.min(1, scale.getPixelForValue(min) / scale.height);
                            gFill.addColorStop(Math.min(1, zeroPct),
                                `rgba(${underMinColor.slice(0, 3).join()}, 0`);
                            gFill.addColorStop(Math.min(1, zeroPct + midPointMarginPct),
                                `rgba(${underMinColor.join()}`);
                            gFill.addColorStop(bottomPct, `rgba(${underMaxColor.join()}`);
                        }
                        model.backgroundColor = gFill;
                    } catch(e) { console.error(e); }
                }
            }
        }
    };


    const drawSave = Chart.controllers.line.prototype.draw;
    Chart.controllers.line.prototype.draw = function(ease) {
        drawSave.apply(this, arguments);
        if (!this.chart.options.tooltipLine) {
            return;
        }
        const active = this.chart.tooltip._active;
        if (active && active.length) {
            const activePoint = active[0];
            const ctx = this.chart.ctx;
            const x = activePoint.tooltipPosition().x;
            const top = this.chart.chartArea.top;
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


    class ActivityTimeRangeChart extends Chart {
        constructor(canvasSelector, view, config) {
            const ctx = document.querySelector(canvasSelector).getContext('2d');
            config = config || {};
            setDefault(config, 'type', 'line');
            setDefault(config, 'plugins[]', new ChartVisibilityPlugin(config, view));
            setDefault(config, 'options.aspectRatio', 3/1);
            setDefault(config, 'options.tooltipLine', true);
            setDefault(config, 'options.tooltipLineColor', '#07c');
            setDefault(config, 'options.animation.duration', 200);
            setDefault(config, 'options.legend.position', 'bottom');

            setDefault(config, 'options.scales.xAxes[0].id', 'days');
            setDefault(config, 'options.scales.xAxes[0].offset', true);
            setDefault(config, 'options.scales.xAxes[0].type', 'time');
            setDefault(config, 'options.scales.xAxes[0].time.tooltipFormat', 'll'); // XXX use func
            setDefault(config, 'options.scales.xAxes[0].distribution', 'series');
            setDefault(config, 'options.scales.xAxes[0].gridLines.display', false);
            setDefault(config, 'options.scales.xAxes[0].ticks.maxTicksLimit', 16);
            setDefault(config, 'options.scales.xAxes[0].ticks.callback', (label, index, ticks) => {
                const data = ticks[index];
                const d = new Date(data.value);
                const span = ticks[ticks.length - 1].value - ticks[0].value;
                const format = span >= 200 * DAY ? 'MMM' : 'MMM Do';
                return moment(d).format(format); // XXX need to figure out when to actually show year
                /*
                if (!d.getMonth()) {
                    return moment(d).format(format) + '\n' + d.getFullYear();
                } else {
                    return moment(d).format(format);
                }
                */
            });

            setDefault(config, 'options.scales.yAxes[0].type', 'linear');
            setDefault(config, 'options.scales.yAxes[0].scaleLabel.display', true);
            setDefault(config, 'options.scales.yAxes[0].ticks.min', 0);

            setDefault(config, 'options.tooltips.mode', 'index');
            setDefault(config, 'options.tooltips.callbacks.label', (item, data) => {
                const ds = data.datasets[item.datasetIndex];
                const label = ds.label || '';
                const val = ds.tooltipFormat ? ds.tooltipFormat(item.value, ds, this) : item.value;
                return `${label}: ${val}`;
            });
            setDefault(config, 'options.tooltips.callbacks.footer',
                items => this.onTooltipSummary(items));
            super(ctx, config);
            this.view = view;
        }

        onTooltipSummary(items) {
            const idx = items[0].index;
            const slot = this.options.useMetricData ? this.view.metricData[idx] : this.view.daily[idx];
            if (!slot.activities.length) {
                return '';
            }
            if (slot.activities.length === 1) {
                return `\n1 activity - click for details`; // XXX Localize
            } else {
                return `\n${slot.activities.length} activities - click for details`; // XXX Localize
            }
        }
    }


    class SummaryView extends view.SauceView {
        get tpl() {
            return 'performance-summary.html';
        }

        async init({pageView}) {
            this.pageView = pageView;
            this.period = ns.router.filters.period || defaultPeriod;
            this.syncCounts = {};
            this.onSyncProgress = this._onSyncProgress.bind(this);
            this.listenTo(pageView, 'change-athlete', this.onChangeAthlete);
            this.listenTo(pageView, 'update-period', this.onUpdatePeriod);
            ns.router.on('route:onNav', this.onRouterNav.bind(this));
            await super.init();
        }

        renderAttrs() {
            return {
                athlete: this.athlete,
                syncCounts: this.athlete && this.syncCounts[this.athlete.id],
                weeklyTSS: 1000 * Math.random(),
                weeklyTime: 3600 * 10 * Math.random(),
                peaks: {
                    s5: 2000 * Math.random(),
                    s60: 1000 * Math.random(),
                    s300: 800 * Math.random(),
                    s1200: 600 * Math.random(),
                    s3600: 400 * Math.random(),
                }
            };
        }

        async render() {
            if (this.pageView.athlete !== this.athlete) {
                await this.setAthlete(this.pageView.athlete);
            }
            await super.render();
        }

        async setAthlete(athlete) {
            this.athlete = athlete;
            const id = athlete && athlete.id;
            if (this.syncController) {
                this.syncController.removeEventListener('progress', this.onSyncProgress);
            }
            if (id) {
                this.syncController = this.pageView.syncControllers[id];
                this.syncController.addEventListener('progress', this.onSyncProgress);
                this.syncCounts[id] = await sauce.hist.activityCounts(id);
            } else {
                this.syncController = null;
            }
        }

        async onRouterNav(_, period) {
            period = period && Number(period);
            if (period !== this.period) {
                this.period = period;
                await this.render();
            }
        }

        async onChangeAthlete(athlete) {
            await this.setAthlete(athlete);
            await this.render();
        }

        async _onSyncProgress(ev) {
            this.syncCounts[this.athlete.id] = ev.data.counts;
            await this.render();
        }

        async onUpdatePeriod({daily}) {
            //console.warn("XXX");
            await this.render();
        }
    }


    class DetailsView extends view.SauceView {
        get events() {
            return {
                'click header .collapser': 'onCollapserClick',
                'click .activity .edit-activity': 'onEditActivityClick',
            };
        }

        get tpl() {
            return 'performance-details.html';
        }

        async init({pageView}) {
            this.pageView = pageView;
            this.listenTo(pageView, 'change-athlete', async () => {
                this.activities = null;
                await this.render();
            });
            this.listenTo(pageView, 'select-activities', async activities => {
                this.activities = activities;
                await this.render();
                const expanded = this.$el.hasClass('expanded');
                await this.setExpanded();
                if (expanded) {
                    this.el.scrollIntoView({behavior: 'smooth'});
                } else {
                    this.$el.one('transitionend', () =>
                        this.el.scrollIntoView({behavior: 'smooth'}));
                }
            });
            await super.init();
        }

        setElement(el, ...args) {
            const r = super.setElement(el, ...args);
            sauce.storage.getPref('perfDetailsAsideVisible').then(vis =>
                this.setExpanded(vis, {noSave: true}));
            return r;
        }

        async renderAttrs() {
            return {
                getTSS: sauce.model.getActivityTSS,
                activities: this.activities
            };
        }

        async setExpanded(en, options={}) {
            const visible = en !== false;
            this.$el.toggleClass('expanded', visible);
            if (!options.noSave) {
                await sauce.storage.setPref('perfDetailsAsideVisible', visible);
            }
        }

        async onCollapserClick(ev) {
            await this.setExpanded(false);
        }

        async onEditActivityClick(ev) {
            const id = Number(ev.currentTarget.closest('[data-id]').dataset.id);
            let activity;
            for (const a of this.activities) {
                if (a.id === id) {
                    activity = a;
                    break;
                }
            }
            // XXX Viewify this...
            const $modal = await sauce.modal({
                title: 'Edit Activity', // XXX localize
                body: `
                    <b>${activity.name}</b><hr/>
                    <label>TSS Override:
                        <input name="tss_override" type="number"
                               value="${sauce.model.getActivityTSS(activity)}"/>
                    </label>
                    <hr/>
                    <label>Exclude power data from performance calculations:
                        <input name="power_exclude" type="checkbox"
                               ${activity.perfExclude ? 'checked' : ''}"/>
                    </label>
                `,
                extraButtons: [{
                    text: 'Save', // XXX localize
                    click: async ev => {
                        const tssOverride = Number($modal.find('input[name="tss_override"]').val()) || null;
                        const powerExclude = $modal.find('input[name="power_exclude"]').is(':checked');
                        ev.currentTarget.classList.add('sauce-loading');
                        try {
                            await sauce.hist.updateActivity(id, {tssOverride, powerExclude});
                            await sauce.hist.invalidateSyncState(activity.athlete, 'local', 'training-load');
                            // TODO: Listen to sync controller and refresh views after this finishes.
                            await new Promise(resolve => setTimeout(resolve, 10000));
                            await this.pageView.render();
                        } finally {
                            ev.currentTarget.classList.remove('sauce-loading');
                        }
                        $modal.dialog('destroy');
                    }
                }]
            });
        }
    }


    class MainView extends view.SauceView {
        get events() {
            return {
                'change header select[name="period"]': 'onPeriodChange',
                'click header button.period': 'onPeriodShift',
                'click canvas': 'onChartClick',
                'dataVisibilityChange canvas': 'onDataVisibilityChange',
            };
        }

        get tpl() {
            return 'performance-main.html';
        }

        get periodEndMax() {
            const d = sauce.date.toLocaleDayDate(new Date());
            return d.getTime() + (86400 * 1000);
        }

        async init({pageView}) {
            this.pageView = pageView;
            this.period = ns.router.filters.period || defaultPeriod;
            this.periodEnd = ns.router.filters.periodEnd || this.periodEndMax;
            this.periodStart = ns.router.filters.periodStart || this.periodEnd - (this.period * DAY);
            this.charts = {};
            this.athlete = pageView.athlete;
            this.listenTo(pageView, 'change-athlete', this.setAthlete);
            ns.router.on('route:onNav', this.onRouterNav.bind(this));
            this.dataVisibility = await sauce.storage.getPref('perfChartDataVisibility') || {};
            await super.init();
        }

        renderAttrs() {
            return {period: this.period};
        }

        async render() {
            await super.render();
            if (!this.athlete) {
                return;
            }
            this.charts.training = new ActivityTimeRangeChart('#training', this, {
                plugins: [chartOverUnderFillPlugin],
                options: {
                    plugins: {colorschemes: {scheme: 'tableau.ClassicBlueRed6'}},
                    scales: {
                        yAxes: [{
                            id: 'tss',
                            scaleLabel: {labelString: 'TSS'},
                            ticks: {min: 0, maxTicksLimit: 8},
                        }, {
                            id: 'tsb',
                            scaleLabel: {labelString: 'TSB'},
                            ticks: {maxTicksLimit: 8},
                            position: 'right',
                            gridLines: {display: false},
                        }]
                    },
                    tooltips: {
                        intersect: false,
                    },
                }
            });

            this.charts.activities = new ActivityTimeRangeChart('#activities', this, {
                options: {
                    plugins: {colorschemes: {scheme: 'tableau.ClassicBlueRed6'}},
                    useMetricData: true,
                    scales: {
                        yAxes: [{
                            id: 'tss',
                            scaleLabel: {labelString: 'TSS'}, // XXX localize
                            ticks: {min: 0, maxTicksLimit: 3},
                        }, {
                            id: 'duration',
                            position: 'right',
                            gridLines: {display: false},
                            scaleLabel: {labelString: 'Duration'}, // XXX localize
                            ticks: {
                                suggestedMax: 5 * 3600,
                                stepSize: 3600,
                                maxTicksLimit: 7,
                                callback: v => sauce.locale.human.duration(v, {maxPeriod: 3600})
                            }
                        }]
                    },
                }
            });
            await this.update();
        }

        async update() {
            const start = this.periodStart;
            const end = this.periodEnd;
            const activities = await sauce.hist.getActivitiesForAthlete(this.athlete.id, {start, end});
            activities.reverse();
            let atl = 0;
            let ctl = 0;
            if (activities.length) {
                ({atl, ctl} = await getSeedTrainingLoad(activities[0]));
            }
            this.daily = activitiesByDay(activities, start, end, atl, ctl);
            this.metric = this.period > 240 ? 'months' : this.period > 60 ? 'weeks' : 'days';
            if (this.metric === 'weeks') {
                this.metricData = aggregateActivitiesByWeek(this.daily, {isoWeekStart: true});
            } else if (this.metric === 'months') {
                this.metricData = aggregateActivitiesByMonth(this.daily);
            } else {
                this.metricData = this.daily;
            }
            this.pageView.trigger('update-period', {
                start,
                end,
                metric: this.metric,
                activities,
                daily: this.daily,
                metricData: this.metricData,
            });
            const $start = this.$('header span.period.start');
            const $end = this.$('header span.period.end');
            $start.text(sauce.locale.human.date(start));
            const isEnd = end >= this.periodEndMax;
            this.$('button.period.next').toggleClass('hidden', isEnd);
            $end.text(isEnd ?
                new Intl.RelativeTimeFormat([], {numeric: 'auto'}).format(0, 'day') :
                sauce.locale.human.date(end));
            const lineWidth = this.period > 365 ? 0.5 : this.period > 90 ? 1 : 1.5;
            this.charts.training.data.datasets = [{
                id: 'ctl',
                label: 'CTL (Fitness)', // XXX Localize
                yAxisID: 'tss',
                borderWidth: lineWidth,
                fill: false,
                pointRadius: 0,
                tooltipFormat: x => Math.round(x).toLocaleString(),
                data: this.daily.map(a => ({
                    x: a.date,
                    y: a.ctl,
                }))
            }, {
                id: 'atl',
                label: 'ATL (Fatigue)', // XXX Localize
                yAxisID: 'tss',
                borderWidth: lineWidth,
                fill: false,
                pointRadius: 0,
                tooltipFormat: x => Math.round(x).toLocaleString(),
                data: this.daily.map(a => ({
                    x: a.date,
                    y: a.atl,
                }))
            }, {
                id: 'tsb',
                label: 'TSB (Form)', // XXX Localize
                yAxisID: 'tsb',
                borderWidth: lineWidth,
                borderColor: '#444',
                overUnder: true,
                overBackgroundColorMax: '#7fe78a',
                overBackgroundColorMin: '#bfe58a22',
                underBackgroundColorMin: '#d9940422',
                underBackgroundColorMax: '#bc0000ff',
                overBackgroundMax: 50,
                underBackgroundMin: -50,
                pointRadius: 0,
                tooltipFormat: x => Math.round(x).toLocaleString(),
                data: this.daily.map(a => ({
                    x: a.date,
                    y: a.ctl - a.atl,
                }))
            }];
            this.charts.training.update();

            this.charts.activities.data.datasets = [{
                id: 'tss',
                label: 'TSS', // XXX Localize
                type: 'bar',
                yAxisID: 'tss',
                borderWidth: 1,
                tooltipFormat: x => Math.round(x).toLocaleString(),
                data: this.metricData.map(a => ({
                    x: a.date,
                    y: a.tss,
                })),
            }, {
                id: 'duration',
                label: 'Duration', // XXX Localize
                type: 'bar',
                yAxisID: 'duration',
                tooltipFormat: x => sauce.locale.human.duration(x, {maxPeriod: 3600}),
                data: this.metricData.map(a => ({
                    x: a.date,
                    y: a.duration,
                })),
            }];
            this.charts.activities.update();
        }

        async onChartClick(ev) {
            const chart = this.charts[ev.currentTarget.id];
            let elements;
            if (chart.options.tooltips.intersect === false) {
                elements = chart.getElementsAtXAxis(ev);
            } else {
                elements = chart.getElementsAtEvent(ev);
            }
            if (elements.length) {
                const idx = elements[0]._index;
                const slot = chart.options.useMetricData ? this.metricData[idx] : this.daily[idx];
                if (slot && slot.activities && slot.activities.length) {
                    this.pageView.trigger('select-activities', slot.activities);
                }
            }
        }

        async onRouterNav(_, period, startDay, endDay) {
            period = period && Number(period);
            const start = startDay && Number(startDay) * DAY;
            const end = endDay && Number(endDay) * DAY;
            let needRender;
            if (period !== this.period) {
                this.period = period || defaultPeriod;
                needRender = true;
            }
            if (end !== this.periodEnd) {
                this.periodEnd = end || this.periodEndMax;
                needRender = true;
            }
            if (start !== this.periodStart) {
                this.periodStart = start || this.periodEnd - (DAY * this.period);
                needRender = true;
            }
            if (needRender) {
                await this.update();
            }
        }

        async onPeriodChange(ev) {
            this.period = Number(ev.currentTarget.value);
            this.periodStart = this.periodEnd - (DAY * this.period);
            this.updateNav();
            await this.update();
        }

        async onPeriodShift(ev) {
            const next = ev.currentTarget.classList.contains('next');
            this.periodEnd = Math.min(this.periodEnd + this.period * DAY * (next ? 1 : -1),
                this.periodEndMax);
            this.periodStart = this.periodEnd - (this.period * DAY);
            this.updateNav();
            await this.update();
        }

        async onDataVisibilityChange(ev, data) {
            const chartId = ev.currentTarget.id;
            this.dataVisibility[`${chartId}-${data.id}`] = data.visible;
            await sauce.storage.setPref('perfChartDataVisibility', this.dataVisibility);
        }

        updateNav() {
            if (this.periodEnd === this.periodEndMax) {
                ns.router.setPeriod(this.athlete.id, this.period);
            } else {
                ns.router.setPeriod(this.athlete.id, this.period, this.periodStart, this.periodEnd);
            }
        }

        async setAthlete(athlete) {
            this.athlete = athlete;
            await this.update();
        }
    }


    class PageView extends view.SauceView {
        get events() {
            return {
                'change nav select[name=athlete]': 'onAthleteChange',
                'click button.sync-panel': 'onControlPanelClick',
            };
        }

        get tpl() {
            return 'performance.html';
        }

        async init({athletes}) {
            this.syncControllers = {};
            this.athletes = athletes;
            this.setAthlete(ns.router.filters.athleteId);
            this.summaryView = new SummaryView({pageView: this});
            this.mainView = new MainView({pageView: this});
            this.detailsView = new DetailsView({pageView: this});
            ns.router.on('route:onNav', this.onRouterNav.bind(this));
            await super.init();
        }

        renderAttrs() {
            return {
                athletes: Array.from(this.athletes.values()),
                athleteId: this.athlete && this.athlete.id,
            };
        }

        async render() {
            await super.render();
            this.summaryView.setElement(this.$('nav .summary'));
            this.mainView.setElement(this.$('main'));
            this.detailsView.setElement(this.$('aside.details'));
            await Promise.all([
                this.summaryView.render(),
                this.mainView.render(),
                this.detailsView.render(),
            ]);
        }

        setAthlete(athleteId) {
            let success = true;
            if (athleteId && this.athletes.has(athleteId)) {
                this.athlete = this.athletes.get(athleteId);
            } else {
                if (athleteId || Object.is(athleteId, NaN)) {
                    console.warn("Invalid athlete:", athleteId);
                    ns.router.setAthlete(undefined, {replace: true});
                    success = false;
                }
                this.athlete = this.athletes.get(currentUser) || this.athletes.values().next().value;
            }
            const id = this.athlete && this.athlete.id;
            if (id && !this.syncControllers[id]) {
                this.syncControllers[id] = new sauce.hist.SyncController(id);
            }
            return success;
        }

        onAthleteChange(ev) {
            const id = Number(ev.currentTarget.value);
            if (this.setAthlete(id)) {
                ns.router.setAthlete(id);
            }
            this.trigger('change-athlete', this.athlete);
        }

        async onControlPanelClick(ev) {
            const mod = await sauce.getModule('/src/site/sync-panel.mjs');
            await mod.activitySyncDialog(this.athlete, this.syncControllers[this.athlete.id]);
        }

        async onRouterNav(athleteId) {
            athleteId = athleteId && Number(athleteId);
            if (athleteId !== this.athlete.id) {
                this.setAthlete(athleteId);
                await this.render();
            }
        }
    }


    async function load() {
        const athletes = new Map((await sauce.hist.getEnabledAthletes()).map(x => [x.id, x]));
        const $page = jQuery('#error404');  // replace the 404 content
        $page.removeClass();  // removes all
        $page.attr('id', 'sauce-performance');
        const pageView = new PageView({athletes, el: $page});
        await pageView.render();
    }

    if (['interactive', 'complete'].indexOf(document.readyState) === -1) {
        addEventListener('DOMContentLoaded', () => load().catch(sauce.report.error));
    } else {
        load().catch(sauce.report.error);
    }
});
