/* global sauce, jQuery, Chart, moment, regression, Backbone */

sauce.ns('performance', async ns => {
    'use strict';

    await sauce.proxy.connected;
    // XXX find something just after all the locale stuff.
    await sauce.propDefined('Strava.I18n.DoubledStepCadenceFormatter', {once: true});
    await sauce.locale.init();
    await sauce.propDefined('Backbone.View', {once: true});

    const DAY = 86400 * 1000;

    Chart.plugins.unregister(self.ChartDataLabels);  // Disable data labels by default.


    function activitiesByDay(activities, start, end) {
        // NOTE: Activities should be in chronological order
        const days = [];
        let i = 0;
        for (let ts = start; ts < end; ts += DAY) {
            const acts = [];
            while (i < activities.length) {
                const a = activities[i];
                if (a.ts >= ts && a.ts < ts + DAY) {
                    acts.push(a);
                    i++;
                } else {
                    break;
                }
            }
            days.push({ts, activities: acts});
        }
        return days;
    }


    function activitiesByDayToDateStacks(data) {
        // Turn the by-day data into an arrangment suitable for stacked chart datasets.
        const stacks = [];
        let level = 0;
        while (true) {
            const stack = [];
            let added = 0;
            for (const x of data) {
                if (x.activities && x.activities.length > level) {
                    stack.push({ts: x.ts, activity: x.activities[level]});
                    added++;
                } else {
                    // Required to avoid time axis issues in chart.js
                    stack.push({ts: x.ts});
                }
            }
            if (!added) {
                break;
            }
            stacks.push(stack);
            level++;
        }
        return stacks;
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
            setDefault(config, 'options.legend.display', false);
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


    class SauceView extends Backbone.View {
        constructor(...args) {
            super(...args);
            this.initializing = this.init(...args);
        }

        async init() {
            this._tpl = await sauce.template.getTemplate(this.tpl);
        }

        async renderAttrs(options={}) {
            return options;
        }

        async render(options) {
            await this.initializing;
            this.$el.html(await this._tpl(await this.renderAttrs(options)));
        }
    }


    class SummaryView extends SauceView {
        get tpl() {
            return 'performance-summary.html';
        }

        async init({pageView}) {
            this.pageView = pageView;
            this.syncCounts = {};
            this.onSyncProgress = this._onSyncProgress.bind(this);
            this.athlete = pageView.athlete;
            this.listenTo(pageView, 'change-athlete', this.setAthlete);
            this.listenTo(pageView, 'update-period', this.onUpdatePeriod);
            await this.setAthlete(this.athlete, {noRender: true});
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

        async setAthlete(athlete, options={}) {
            await this.initialized;
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
            if (!options.noRender) {
                await this.render();
            }
        }

        async _onSyncProgress(ev) {
            this.syncCounts[this.athlete.id] = ev.data.counts;
            await this.render();
        }

        async onUpdatePeriod({activitiesByDay}) {
            console.warn("XXX");
            await this.render();
        }
    }


    class DetailsView extends SauceView {
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


    class MainView extends SauceView {
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
            this.period = 30;  // days // XXX remember last and or opt use URL params
            this.periodEndMax = Number(moment().endOf('day').toDate());
            this.periodEnd = this.periodEndMax;  // opt use URL params
            this.periodStart = this.periodEnd - (this.period * DAY);
            this.charts = {};
            this.athlete = pageView.athlete;
            this.listenTo(pageView, 'change-athlete', this.setAthlete);
            await super.init();
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
            this.actsByDay = activitiesByDay(activities, this.periodStart, this.periodEnd);
            this.pageView.trigger('update-period', {start, end, activities, activitiesByDay: this.actsByDay});
            const actsDataStacks = activitiesByDayToDateStacks(this.actsByDay);
            const $start = this.$('header span.period.start');
            const $end = this.$('header span.period.end');
            $start.text(moment(start).calendar());
            $end.text(moment(end).format('ll'));
            this.$('button.period.next').prop('disabled', end >= Date.now());
            this.charts.tss.data.datasets = actsDataStacks.map((row, i) => ({
                label: 'TSS', // currently hidden.
                stack: 'tss',
                yAxisID: 'tss',
                borderColor: '#8888',
                borderWidth: 1,
                barPercentage: 0.9,
                categoryPercentage: 1,
                data: row.map(a => ({
                    x: a.ts,
                    y: (a.activity && a.activity.stats) ? (a.activity.stats.tss || a.activity.stats.tTss) : null,
                })),
            }));
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
            const chart = this.charts[ev.target.id];
            const ds = chart.getElementsAtEvent(ev);
            if (ds.length) {
                const data = this.actsByDay[ds[0]._index];
                console.warn(new Date(data.ts).toLocaleString(), new Date(data.activities[0].ts).toLocaleString()); // XXX
                this.pageView.trigger('select-activities', data.activities);
            }
        }

        async onPeriodChange(ev) {
            this.period = Number(ev.target.value);
            this.periodStart = this.periodEnd - (86400 * 1000 * this.period);
            await this.update();
        }

        async onPeriodShift(ev) {
            const next = ev.target.classList.contains('next');
            this.periodEnd = Math.min(this.periodEnd + this.period * DAY * (next ? 1 : -1),
                this.periodEndMax);
            this.periodStart = this.periodEnd - (this.period * DAY);
            await this.update();
        }

        async setAthlete(athlete) {
            this.athlete = athlete;
            await this.update();
        }
    }


    class PageView extends SauceView {
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
            this.athletes = athletes;
            this.athlete = athletes.values().next().value;  // XXX remember last or opt use URL param
            this.syncControllers = {};
            if (this.athlete) {
                this.syncControllers[this.athlete.id] = new sauce.hist.SyncController(this.athlete.id);
            }
            this.summaryView = new SummaryView({pageView: this});
            this.mainView = new MainView({pageView: this});
            this.detailsView = new DetailsView({pageView: this});
            await super.init();
        }

        renderAttrs() {
            return {
                athletes: Array.from(this.athletes.values())
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

        onAthleteChange(ev) {
            const id = Number(ev.target.value);
            this.athlete = this.athletes.get(id);
            if (!this.syncControllers[id]) {
                this.syncControllers[id] = new sauce.hist.SyncController(id);
            }
            this.athlete = this.athletes.get(Number(ev.target.value));
            this.trigger('change-athlete', this.athlete);
        }

        async onControlPanelClick(ev) {
            const mod = await sauce.getModule('/src/site/sync-panel.mjs');
            await mod.activitySyncDialog(this.athlete, this.syncControllers[this.athlete.id]);
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
