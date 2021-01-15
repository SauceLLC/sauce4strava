/* global sauce, jQuery */

sauce.ns('performance', ns => {
    'use strict';

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


    async function load() {
        const tpl = await getTemplate('performance.html');
        const $replace = jQuery('#error404');
        const athletes = await sauce.hist.getEnabledAthletes();
        const start = Date.now() - 86400 * 1000 * 30;
        $replace.html(await tpl({
            athletes
        }));
        $replace.removeClass();  // removes all
        $replace.attr('id', 'sauce-performance');

        const activities = await sauce.hist.getActivitiesForAthlete(athletes[1].id, {start});
        activities.reverse();
        console.warn(activities);
        const tssCtx = document.querySelector('#tss').getContext('2d');
        const tssChart = new Chart(tssCtx, {
            type: 'line',
            data: {
                labels: activities.map(x => x.name || new Date(x.ts)),
                datasets: [{
                    label: 'TSS',
                    data: activities.map(x => Math.round(x.stats.tss || x.stats.tTss))
                }]
            }
        });

        const hoursCtx = document.querySelector('#hours').getContext('2d');
        const hourChart = new Chart(hoursCtx, {
            type: 'line',
            data: {
                labels: ['one', 'two', 'three', 'four', 'five'],
                datasets: [{
                    label: 'Hours',
                    data: [100, 20, 33, 44, 100]
                }]
            }
        });

    }


    return {
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
