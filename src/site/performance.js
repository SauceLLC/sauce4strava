/* global sauce, jQuery, Chart, moment, regression, Backbone */

sauce.ns('performance', async ns => {
    'use strict';

    const DAY = 86400 * 1000;

    const urn = 'sauce/performance';
    const defaultPeriod = 30;

    await sauce.propDefined('Backbone.Router', {once: true});
    const AppRouter = Backbone.Router.extend({
        constructor: function() {
            this.filters = {};
            Backbone.Router.prototype.constructor.apply(this, arguments);
        },

        routes: {
            [`${urn}/:athleteId/:period/:start/:end`]: 'onNav',
            [`${urn}/:athleteId/:period`]: 'onNav',
            [`${urn}/:athleteId`]: 'onNav',
            [urn]: 'onNav',
        },

        onNav: function(athleteId, period, start, end) {
            console.debug("onNav", athleteId, period, start, end);
            this.filters = {
                athleteId: athleteId && Number(athleteId),
                period: period && Number(period),
                periodStart: start && Number(start),
                periodEnd: end && Number(end)
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
                this.navigate(`${urn}/${f.athleteId}/${f.period}/${f.periodStart}/${f.periodEnd}`,
                    options);
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


    function activitiesByDay(acts, callback) {
        // NOTE: Activities should be in chronological order
        if (!acts.length) {
            return [];
        }
        const days = [];
        const startDay = sauce.date.toLocaleDayDate(acts[0].ts);
        const end = new Date(acts[acts.length - 1].ts + 1); // Add 1 ms for exact midnight.
        let i = 0;
        for (const day of sauce.date.dayRange(startDay, end)) {
            if (!acts.length) {
                break;
            }
            const daily = [];
            while (i < acts.length && sauce.date.toLocaleDayDate(acts[i].ts).getTime() === day.getTime()) {
                const m = acts[i++];
                daily.push(m);
            }
            const entry = {day, activities: daily};
            if (callback) {
                callback(entry, days);
            }
            days.push(entry);
        }
        if (i !== acts.length) {
            throw new Error('Internal Error');
        }
        return days;
    }


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


    class ActivityTimeRangeChart extends Chart {
        constructor(canvasSelector, view, config) {
            const ctx = document.querySelector(canvasSelector).getContext('2d');
            config = config || {};
            setDefault(config, 'type', 'bar');
            setDefault(config, 'options.plugins.colorschemes.scheme', 'brewer.Blues9');
            setDefault(config, 'options.plugins.colorschemes.reverse', true);
            //setDefault(config, 'options.legend.display', false);
            setDefault(config, 'options.scales.xAxes[0].offset', true);
            setDefault(config, 'options.scales.xAxes[0].type', 'time');
            setDefault(config, 'options.scales.xAxes[0].stacked', true);
            setDefault(config, 'options.scales.xAxes[0].time.minUnit', 'day');
            setDefault(config, 'options.scales.xAxes[0].time.tooltipFormat', 'll');  // Jan 16, 2021
            setDefault(config, 'options.scales.xAxes[0].gridLines.display', false);
            setDefault(config, 'options.scales.xAxes[0].ticks.maxTicksLimit', 12);
            setDefault(config, 'options.scales.yAxes[0].type', 'linear');
            setDefault(config, 'options.scales.yAxes[0].stacked', true);
            setDefault(config, 'options.scales.yAxes[0].scaleLabel.display', true);
            setDefault(config, 'options.scales.yAxes[0].ticks.min', 0);
            setDefault(config, 'options.tooltips.mode', 'x');
            setDefault(config, 'options.tooltips.callbacks.footer', view.onTooltipSummary.bind(view));
            setDefault(config, 'options.onClick', view.onChartClick.bind(view));
            super(ctx, config);
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

        async onUpdatePeriod({activitiesByDay}) {
            //console.warn("XXX");
            await this.render();
        }
    }


    class DetailsView extends view.SauceView {
        get tpl() {
            return 'performance-details.html';
        }

        async init({pageView}) {
            this.listenTo(pageView, 'change-athlete', async () => {
                this.activities = null;
                await this.render();
            });
            this.listenTo(pageView, 'select-activities', async activities => {
                this.activities = activities;
                await this.render();
            });
            await super.init();
        }

        async renderAttrs() {
            return {
                moment,
                activities: this.activities
            };
        }
    }


    class MainView extends view.SauceView {
        get events() {
            return {
                'change header select[name="period"]': 'onPeriodChange',
                'click header button.period': 'onPeriodShift',
            };
        }

        get tpl() {
            return 'performance-main.html';
        }

        async init({pageView}) {
            this.pageView = pageView;
            this.period = ns.router.filters.period || defaultPeriod;
            this.periodEndMax = Number(moment().endOf('day').toDate());
            this.periodEnd = ns.router.filters.periodEnd || this.periodEndMax;
            this.periodStart = ns.router.filters.periodStart || this.periodEnd - (this.period * DAY);
            this.charts = {};
            this.athlete = pageView.athlete;
            this.listenTo(pageView, 'change-athlete', this.setAthlete);
            ns.router.on('route:onNav', this.onRouterNav.bind(this));
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
            this.charts.tss = new ActivityTimeRangeChart('#tss', this, {
                options: {
                    plugins: {colorschemes: {scheme: 'brewer.Blues9'}},
                    scales: {
                        yAxes: [{
                            id: 'tss',
                            scaleLabel: {labelString: 'TSS'},
                            ticks: {suggestedMax: 300},
                        }, {
                            id: 'atl',
                            scaleLabel: {labelString: 'ATL (Fatigue)'},
                            ticks: {suggestedMax: 250},
                        }, {
                            id: 'ctl',
                            scaleLabel: {labelString: 'CTL (Fitness)'},
                            ticks: {suggestedMax: 250},
                        }]
                    },
                    tooltips: {callbacks: {label: item => Math.round(item.value).toLocaleString()}},
                }
            });
            this.charts.hours = new ActivityTimeRangeChart('#hours', this, {
                options: {
                    plugins: {colorschemes: {scheme: 'brewer.Reds9'}},
                    scales: {
                        yAxes: [{
                            id: 'hours',
                            scaleLabel: {
                                labelString: 'Duration'
                            },
                            ticks: {
                                suggestedMax: 5 * 3600,
                                stepSize: 3600,
                                callback: v => sauce.locale.human.duration(v)
                            }
                        }]
                    },
                    tooltips: {callbacks: {label: item => sauce.locale.human.duration(item.value)}},
                }
            });
            await this.update();
        }

        async update() {
            const start = this.periodStart;
            const end = this.periodEnd;
            const activities = await sauce.hist.getActivitiesForAthlete(this.athlete.id, {start, end});
            activities.reverse();
            this.actsByDay = activitiesByDay(activities, entry => {
                let tss = 0;
                for (const x of entry.activities) {
                    tss += sauce.model.getActivityTSS(x) || 0;
                }
                entry.tss = tss;
            });
            if (activities.length) {
                // XXX Eventually find the ATL from the activity just before this window (need new bg call).
                const seedATL = activities[0].at;
            this.pageView.trigger('update-period', {start, end, activities, activitiesByDay: this.actsByDay});
            const $start = this.$('header span.period.start');
            const $end = this.$('header span.period.end');
            $start.text(moment(start).format('ll'));
            $end.text(moment(end).format('ll'));
            this.$('button.period.next').prop('disabled', end >= Date.now());
            this.charts.tss.data.datasets = [].concat(this.actsByDay.map((col, i) => ({
                label: 'TSS', // currently hidden.
                stack: 'tss',
                yAxisID: 'tss',
                borderColor: '#8888',
                borderWidth: 1,
                barPercentage: 0.9,
                categoryPercentage: 1,
                data: col.map(a => ({
                    x: a.ts,
                    y: a.activity ? sauce.model.getActivityTSS(a.activity) : null,
                })),
            })), [{
                label: 'ATL (Fatigue)',
                type: 'line',
                yAxisID: 'atl',
                spanGaps: true,
                order: 10,
                data: this.actsByDay.map(a => ({
                    x: a.ts,
                    y: a.activities && a.activities[0] && a.activities[0].training && a.activities[0].training.atl
                }))
            }, {
                label: 'CTL - Fitness',
                type: 'line',
                yAxisID: 'ctl',
                spanGaps: true,
                order: 10,
                data: this.actsByDay.map(a => ({
                    x: a.ts,
                    y: a.activities && a.activities[0] && a.activities[0].training && a.activities[0].training.ctl
                }))
            }]);
            this.charts.tss.update();
            const cleanActs = this.actsByDay.filter(x => x.activities);
            const offts = cleanActs[0].ts;
            const hoursReg = regression.polynomial(cleanActs.map(x => [
                (x.ts - offts) / DAY,
                sauce.data.sum(x.activities.map(a => a.stats && a.stats.activeTime ? a.stats.activeTime : 0))
            ]), {order: 5, precision: 10});
            this.charts.hours.data.datasets = [].concat(actsDataStacks.map((row, i) => ({
                stack: 'hours',
                yAxisID: 'hours',
                borderColor: '#8888',
                borderWidth: 1,
                barPercentage: 0.9,
                categoryPercentage: 1,
                data: row.map(a => ({
                    x: a.ts,
                    y: (a.activity && a.activity.stats) ? a.activity.stats.activeTime : null,
                })),
            })), [{
                type: 'line',
                yAxisID: 'hours',
                data: hoursReg.points.map(([day, val]) => ({
                    x: day * DAY + offts,
                    y: val
                })),
            }]);
            this.charts.hours.update();
        }

        onTooltipSummary(items) {
            const idx = items[0].index;
            const day = this.actsByDay[idx];
            if (day.activities.length === 1) {
                return `1 activity - click for details`;
            } else {
                return `${day.activities.length} activities - click for details`;
            }
        }

        async onChartClick(ev) {
            const chart = this.charts[ev.currentTarget.id];
            const ds = chart.getElementsAtEvent(ev);
            if (ds.length) {
                const data = this.actsByDay[ds[0]._index];
                console.warn(new Date(data.ts).toLocaleString(), new Date(data.activities[0].ts).toLocaleString()); // XXX
                this.pageView.trigger('select-activities', data.activities);
            }
        }

        async onRouterNav(_, period, start, end) {
            period = period && Number(period);
            start = start && Number(start);
            end = end && Number(end);
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
                athleteId: this.athlete.id,
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
