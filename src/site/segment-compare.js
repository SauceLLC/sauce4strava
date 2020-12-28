/* global sauce */

sauce.ns('segmentCompare', ns => {
    'use strict';

    // Using mutation observers on the entire document leads to perf issues in chrome.
    let _pageMonitorsBackoff = 10;
    async function startPageMonitors() {
        if (sauce.options['responsive']) {
            maintainScalableSVG();
        }
        _pageMonitorsBackoff *= 1.25;
        setTimeout(startPageMonitors, _pageMonitorsBackoff);
    }


    function maintainScalableSVG() {
        const candidates = document.querySelectorAll('svg[width][height]:not([data-sauce-mark])');
        for (const el of candidates) {
            el.dataset.sauceMark = true;
            if (!el.hasAttribute('viewBox') && el.parentNode &&
                el.parentNode.classList.contains('base-chart')) {
                const width = Number(el.getAttribute('width'));
                const height = Number(el.getAttribute('height'));
                if (!isNaN(width) && !isNaN(height)) {
                    el.setAttribute('viewBox', `0 0 ${width} ${height}`);
                    el.removeAttribute('width');
                    el.removeAttribute('height');
                    const mo = new MutationObserver(mutations => {
                        for (const m of mutations) {
                            if (m.attributeName === 'width') {
                                el.removeAttribute('width');
                            }
                            if (m.attributeName === 'height') {
                                el.removeAttribute('height');
                            }
                        }
                    });
                    mo.observe(el, {attributes: true});
                }
            }
        }
    }


    function load() {
        startPageMonitors();
    }


    return {
        load,
    };
});


(async function() {
    if (sauce.testing) {
        return;
    }
    try {
        sauce.segmentCompare.load();
    } catch(e) {
        await sauce.report.error(e);
        throw e;
    }
})();
