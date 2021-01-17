/* global sauce, jQuery, Chart, moment, regression */

sauce.ns('performance', ns => {
    'use strict';

    Chart.plugins.unregister(self.ChartDataLabels);  // Disable data labels by default.

    const DAY = 86400 * 1000;

    // XXX Move from here and analysis to the template file..
    const tplUrl = sauce.extUrl + 'templates';
    const _tplCache = new Map();
    const _tplFetching = new Map();
    async function getTemplate(filename, localeKey) {
        const cacheKey = '' + filename + localeKey;
        if (!_tplCache.has(cacheKey)) {
            if (!_tplFetching.has(cacheKey)) {
                _tplFetching.set(cacheKey, (async () => {
                    const resp = await fetch(`${tplUrl}/${filename}`);
                    const tplText = await resp.text();
                    localeKey = localeKey || 'analysis';
                    _tplCache.set(cacheKey, sauce.template.compile(tplText, {localePrefix: `${localeKey}_`}));
                    _tplFetching.delete(cacheKey);
                })());
            }
            await _tplFetching.get(cacheKey);
        }
        return _tplCache.get(cacheKey);
    }


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


    async function load() {
        const {tpl, athletes} = await initing;
        const maxEnd = Number(moment().endOf('day').toDate());
        let athlete = athletes[0];  // XXX remember last or opt use URL param
        let period = 30;  // days // XXX remember last and or opt use URL params
        let periodEnd = maxEnd;  // opt use URL params
        let periodStart = periodEnd - 86400 * 1000 * period;
        const $page = jQuery('#error404');
        $page.html(await tpl({athletes}));
        $page.removeClass();  // removes all
        $page.attr('id', 'sauce-performance');
        $page.on('change', 'nav select[name="athlete"]', async ev => {
            const athleteId = Number(ev.target.value);
            for (const x of athletes) {
                if (x.id === athleteId) {
                    athlete = x;
                    await render($page, athlete, periodStart, periodEnd);
                    break;
                }
            }
        });
        $page.on('change', 'main header select[name="period"]', async ev => {
            period = Number(ev.target.value);
            periodStart = periodEnd - (86400 * 1000 * period);
            await render($page, athlete, periodStart, periodEnd);
        });
        $page.on('click', 'main header button.period', async ev => {
            const next = ev.target.classList.contains('next');
            periodEnd += period * DAY * (next ? 1 : -1);
            periodStart += period * DAY * (next ? 1 : -1);
            await render($page, athlete, periodStart, periodEnd);
        });
        await render($page, athlete, periodStart, periodEnd);
    }


    let tssChart;
    let hoursChart;
    async function render($page, athlete, start, end) {
        const activities = await sauce.hist.getActivitiesForAthlete(athlete.id, {start, end});
        activities.reverse();
        const actsByDay = activitiesByDay(activities, start, end);
        const actsDataStacks = activitiesByDayToDateStacks(actsByDay);
        const $start = $page.find('header span.period.start');
        const $end = $page.find('header span.period.end');
        $start.text(moment(start).calendar());
        $end.text(moment(end).format('ll'));
        $page.find('button.period.next').prop('disabled', end >= Date.now());

        function timeXAxis(extra) {
            return Object.assign({
                offset: true,  // Fixes clipping on start/end
                type: 'time',
                time: {
                    minUnit: 'day',
                    tooltipFormat: 'll',  // Jan 16, 2021
                },
                gridLines: {
                    display: false
                },
                ticks: {
                    maxTicksLimit: 14,
                }
            }, extra);
        }

        async function chartClickHandler(ev) {
            const chart = this;
            const ds = chart.getElementsAtEvent(ev);
            if (ds.length) {
                const data = chart.actsByDay[ds[0]._index];
                const t = await getTemplate('performance-details.html');
                $page.find('aside.details').html(await t({
                    moment,
                    activities: data.activities
                }));
            }
        }

        function tooltipSummaryHandler(items) {
            const chart = this._chart;
            const idx = items[0].index;
            const day = chart.actsByDay[idx];
            if (day.activities.length === 1) {
                return `1 activity - click for details`;
            } else {
                return `${day.activities.length} activities - click for details`;
            }
        }

        if (!tssChart) {
            const ctx = document.querySelector('#tss').getContext('2d');
            tssChart = new Chart(ctx, {
                type: 'bar',
                options: {
                    plugins: {
                        colorschemes: {
                            scheme: 'brewer.Blues9',
                            reverse: true,
                            fillAlpha: 0.5,  // no effect with bar?
                        }
                    },
                    legend: {display: false},
                    scales: {
                        xAxes: [timeXAxis({stacked: true})],
                        yAxes: [{
                            id: 'tss',
                            type: 'linear',
                            stacked: true,
                            scaleLabel: {
                                display: true,
                                labelString: 'TSS'
                            },
                            ticks: {
                                min: 0,
                                suggestedMax: 300,
                            },
                        }]
                    },
                    tooltips: {
                        mode: 'x',
                        callbacks: {
                            label: item => Math.round(item.value).toLocaleString(),
                            footer: tooltipSummaryHandler
                        }
                    },
                    onClick: chartClickHandler
                }
            });
        }
        tssChart.data.datasets = actsDataStacks.map((row, i) => ({
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
        tssChart.actsByDay = actsByDay;
        tssChart.update();

        if (!hoursChart) {
            const ctx = document.querySelector('#hours').getContext('2d');
            hoursChart = new Chart(ctx, {
                type: 'bar',
                options: {
                    plugins: {
                        colorschemes: {
                            scheme: 'brewer.Reds9',
                            reverse: true,
                            fillAlpha: 0.5,  // no effect with bar?
                        }
                    },
                    legend: {display: false},
                    scales: {
                        xAxes: [timeXAxis({stacked: true})],
                        yAxes: [{
                            id: 'hours',
                            type: 'linear',
                            stacked: true,
                            scaleLabel: {
                                display: true,
                                labelString: 'Duration'
                            },
                            ticks: {
                                min: 0,
                                suggestedMax: 5 * 3600,
                                stepSize: 3600,
                                callback: v => sauce.locale.humanDuration(v)
                            }
                        }]
                    },
                    tooltips: {
                        mode: 'x',
                        callbacks: {
                            label: item => sauce.locale.humanDuration(item.value),
                            footer: tooltipSummaryHandler
                        }
                    },
                    onClick: chartClickHandler
                }
            });
        }
        const cleanActs = actsByDay.filter(x => x.activities);
        const offts = cleanActs[0].ts;
        const hoursReg = regression.polynomial(cleanActs.map(x => [
            (x.ts - offts) / DAY,
            sauce.data.sum(x.activities.map(a => a.stats && a.stats.activeTime ? a.stats.activeTime : 0))
        ]), {order: 5, precision: 10});
        hoursChart.data.datasets = [].concat(actsDataStacks.map((row, i) => ({
            label: 'TSS', // currently hidden.
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
        hoursChart.actsByDay = actsByDay;
        hoursChart.update();
    }


    async function init() {
        await sauce.proxy.connected;
        const [, tpl, athletes] = await Promise.all([
            sauce.locale.humanInit(),
            getTemplate('performance.html'),
            sauce.hist.getEnabledAthletes(),
        ]);
        return {
            tpl,
            athletes,
        };
    }

    const initing = init();

    return {
        init,
        load,
    };
});


async function start() {
    if (sauce.testing) {
        return;
    }
    try {
        await sauce.performance.load();
    } catch(e) {
        await sauce.report.error(e);
        throw e;
    }
}

if (['interactive', 'complete'].indexOf(document.readyState) === -1) {
    addEventListener('DOMContentLoaded', start);
} else {
    start();
}
