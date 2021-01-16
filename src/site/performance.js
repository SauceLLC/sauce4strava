/* global sauce, jQuery, Chart */

sauce.ns('performance', ns => {
    'use strict';

    Chart.plugins.unregister(self.ChartDataLabels);  // Disable data labels by default.

    const DAY = 86400 * 1000;

    function htmlTooltip(tooltipModel) {
        // Tooltip Element
        var tooltipEl = document.getElementById('chartjs-tooltip');

        // Create element on first render
        if (!tooltipEl) {
            tooltipEl = document.createElement('div');
            tooltipEl.id = 'chartjs-tooltip';
            tooltipEl.innerHTML = '<table></table>';
            document.body.appendChild(tooltipEl);
        }

        // Hide if no tooltip
        if (tooltipModel.opacity === 0) {
            tooltipEl.style.opacity = 0;
            return;
        }

        // Set caret Position
        tooltipEl.classList.remove('above', 'below', 'no-transform');
        if (tooltipModel.yAlign) {
            tooltipEl.classList.add(tooltipModel.yAlign);
        } else {
            tooltipEl.classList.add('no-transform');
        }

        function getBody(bodyItem) {
            return bodyItem.lines;
        }

        // Set Text
        if (tooltipModel.body) {
            var titleLines = tooltipModel.title || [];
            var bodyLines = tooltipModel.body.map(getBody);

            var innerHtml = '<thead>';

            titleLines.forEach(function(title) {
                innerHtml += '<tr><th>' + title + '</th></tr>';
            });
            innerHtml += '</thead><tbody>';

            bodyLines.forEach(function(body, i) {
                var colors = tooltipModel.labelColors[i];
                var style = 'background:' + colors.backgroundColor;
                style += '; border-color:' + colors.borderColor;
                style += '; border-width: 2px';
                var span = '<span style="' + style + '"></span>';
                innerHtml += '<tr><td>' + span + body + '</td></tr>';
            });
            innerHtml += '</tbody>';

            var tableRoot = tooltipEl.querySelector('table');
            tableRoot.innerHTML = innerHtml;
        }

        // `this` will be the overall tooltip
        var position = this._chart.canvas.getBoundingClientRect();

        // Display, position, and set styles for font
        tooltipEl.style.opacity = 1;
        tooltipEl.style.position = 'absolute';
        tooltipEl.style.left = position.left + window.pageXOffset + tooltipModel.caretX + 'px';
        tooltipEl.style.top = position.top + window.pageYOffset + tooltipModel.caretY + 'px';
        tooltipEl.style.fontFamily = tooltipModel._bodyFontFamily;
        tooltipEl.style.fontSize = tooltipModel.bodyFontSize + 'px';
        tooltipEl.style.fontStyle = tooltipModel._bodyFontStyle;
        tooltipEl.style.padding = tooltipModel.yPadding + 'px ' + tooltipModel.xPadding + 'px';
        tooltipEl.style.pointerEvents = 'none';
    }

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
            const acts = [];
            while (i < activities.length) {
                const a = activities[i];
                if (a.ts >= ts - DAY && a.ts < ts) {
                    acts.push(a);
                    i++;
                } else {
                    break;
                }
            }
            if (acts.length) {
                days.push({ts, activities: acts});
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
        actsByDay.push({ts: now + (predDays * DAY), activities: []});

        const tssCtx = document.querySelector('#tss').getContext('2d');
        const tssChart = new Chart(tssCtx, {
            type: 'bar',
            plugins: [self.ChartRegressions],
            options: {
                scales: {
                    xAxes: [{
                        offset: true,  // Fixes clipping on start/end
                        type: 'time',
                        time: {
                            isoWeekday: true,  // mon - sun
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
                    }]
                },
                tooltips: {
                    mode: 'index',
                    enabled: false,
                    custom: htmlTooltip,
                    callbacks: {
                        label: item => Math.round(item.value).toLocaleString(),
                        footer: items => {
                            const idx = items[0].index;
                            const day = actsByDay[idx];
                            return day.activities.map(x => `<a href="/activities/${x.id}">${x.name}</a>`).join('<br/>');
                        }
                    }
                }
            },
            data: {
                datasets: [{
                    label: 'TSS',
                    yAxisID: 'tss',
                    backgroundColor: '#ff4444',
                    data: actsByDay.map(d => ({
                        x: (new Date(d.ts)).toDateString(),
                        y: sauce.data.sum(d.activities.map(a => a.stats ? (a.stats.tss || a.stats.tTss) : 0)),
                    })),
                }]
            }
        });

        const hoursCtx = document.querySelector('#hours').getContext('2d');
        const hoursChart = new Chart(hoursCtx, {
            type: 'bar',
            plugins: [self.ChartRegressions],
            options: {
                scales: {
                    xAxes: [{
                        offset: true,  // Fixes clipping on start/end
                        type: 'time',
                        time: {
                            isoWeekday: true,  // mon - sun
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
                        id: 'time',
                        type: 'linear',
                        position: 'right',
                        ticks: {
                            min: 0,
                            suggestedMax: 5 * 3600,
                            stepSize: 3600,
                            callback: v => sauce.locale.humanDuration(v)
                        },
                        gridLines: {
                            display: false
                        }
                    }]
                },
                tooltips: {mode: 'index'}
            },
            data: {
                datasets: [{
                    label: 'Time',
                    yAxisID: 'time',
                    backgroundColor: '#33ffaa',
                    data: actsByDay.map(d => ({
                        x: (new Date(d.ts)).toDateString(),
                        y: sauce.data.sum(d.activities.map(a => a.stats ? a.stats.activeTime : 0))
                    })),
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
