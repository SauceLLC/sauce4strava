/* global sauce, jQuery, Chart */

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
        for (let ts = end; ts > start; ts -= DAY) {
            const day = {ts, activities: []};
            days.push(day);
            while (i < activities.length) {
                const a = activities[i];
                if (a.ts >= ts - DAY && a.ts < ts) {
                    day.activities.push(a);
                    i++;
                } else {
                    break;
                }
            }
        }
        return days;
    }


    async function load() {
        const {tpl, athletes} = await initing;
        const $replace = jQuery('#error404');
        const now = Date.now();
        const start = now - 86400 * 1000 * 30;
        $replace.html(await tpl({athletes}));
        $replace.removeClass();  // removes all
        $replace.attr('id', 'sauce-performance');
        const activities = await sauce.hist.getActivitiesForAthlete(athletes[0].id, {start});
        const actsByDay = activitiesByDay(activities, start, now);
        actsByDay.reverse();
        const predDays = 7;
        for (let i = 1; i < predDays; i++) {
            actsByDay.push({ts: now + (i * DAY)});
        }
        console.warn(actsByDay);
        const tssCtx = document.querySelector('#tss').getContext('2d');
        const tssChart = new Chart(tssCtx, {
            type: 'bar',
            plugins: [
                //self.ChartRegressions
            ],
            options: {
                plugins: {
                    colorschemes: {
                        scheme: 'brewer.RdYlBu4',
                    }
                },
                scales: {
                    xAxes: [{
                        type: 'time',
                        time: {
                            isoWeekday: true,  // mon - sun
                            unit: 'day',
                            round: true,
                            minUnit: 'day',
                        },
                        gridLines: {
                            display: false
                        },
                        ticks: {
                            maxTicksLimit: 14,
                        }
                    }],
                    yAxes: [{
                        id: 'tss',
                        type: 'linear',
                        scaleLabel: {
                            display: true,
                            labelString: 'TSS'
                        },
                        ticks: {
                            min: 0,
                            suggestedMax: 300,
                        },
                    }, {
                        id: 'time',
                        type: 'linear',
                        position: 'right',
                        scaleLabel: {
                            display: true,
                            labelString: 'Hours'
                        },
                        ticks: {
                            min: 0,
                            suggestedMax: 5 * 3600,
                            callback: v => sauce.locale.humanDuration(v)
                        },
                        gridLines: {
                            display: false
                        }
                    }]
                },
                tooltips: {
                    mode: 'index'
                }
            },
            data: {
                datasets: [{
                    label: 'TSS',
                    yAxisID: 'tss',
                    data: actsByDay.filter(d => d.activities && d.activities.length).map(d => ({
                        x: new Date(d.ts),
                        y: sauce.data.sum(d.activities.map(a => a.stats ? (a.stats.tss || a.stats.tTss) : 0)),
                    })),
                }, {
                    label: 'Time',
                    yAxisID: 'time',
                    data: actsByDay.filter(d => d.activities && d.activities.length).map(d => ({
                        x: new Date(d.ts),
                        y: sauce.data.sum(d.activities.map(a => a.stats ? a.stats.activeTime : 0))
                    })),
                }]
            }
        });
        const hoursCtx = document.querySelector('#hours').getContext('2d');
        const hourChart = new Chart(hoursCtx, {
            type: 'bar',
            data: {
                labels: ['one', 'two', 'three', 'four', 'five'],
                datasets: [{
                    label: 'Hours',
                    data: [100, 20, 33, 44, 100]
                }]
            }
        });

        const activityCtx = document.querySelector('#activity').getContext('2d');
        const activityChart = new Chart(activityCtx, {
            type: 'matrix',
            data: {
                labels: ['one', 'two', 'three', 'four', 'five'],
                datasets: [{
                    label: 'Activity',
                    data: [100, 20, 33, 44, 100]
                }]
            }
        });
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
