/* global sauce */

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
        console.warn("Let there be light");
        const tpl = await getTemplate('performance.html');
        const $replace = jQuery('#error404');
        $replace.html(await tpl({}));
        $replace.removeClass();  // removes all
        $replace.attr('id', 'sauce-performance');
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
