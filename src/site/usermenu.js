/* global sauce */

(function () {
    'use strict';

    async function load() {
        try {
            _loadOptions();
            _loadPerf();
        } catch(e) {
            await sauce.report.error(e);
            throw e;
        }
    }


    async function _loadOptions() {
        const options = document.querySelector('#global-header .user-nav .user-menu .options');
        if (!options) {
            return;
        }
        const anchor = document.createElement('a');
        anchor.textContent = `Sauce ${await sauce.locale.getMessage('analysis_options')}`;
        const image = document.createElement('img');
        image.src = sauce.extUrl + 'images/logo_horiz_128x48.png';
        anchor.appendChild(image);
        anchor.href = 'javascript:void(0);';
        anchor.addEventListener('click', () => {
            sauce.menu.openOptionsPage().catch(sauce.report.error);  // bg okay
            sauce.report.event('UserMenu', 'options');
        });
        const item = document.createElement('li');
        item.classList.add('sauce-options-menu-item');
        item.appendChild(anchor);
        options.appendChild(item);
    }

    async function _loadPerf() {
        const options = document.querySelector('#global-header .global-nav [data-log-category="training"] .options');
        if (!options) {
            return;
        }
        const anchor = document.createElement('a');
        anchor.textContent = `Sauce ${await sauce.locale.getMessage('performance')}`;
        const image = document.createElement('img');
        image.src = sauce.extUrl + 'images/logo_horiz_128x48.png';
        anchor.appendChild(image);
        anchor.href = '/sauce/performance/';
        const item = document.createElement('li');
        item.classList.add('sauce-options-menu-item');
        item.appendChild(anchor);
        options.querySelector('li.premium').insertAdjacentElement('beforeBegin', item);
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        load();
    } else {
        addEventListener('DOMContentLoaded', load);
    }
})();
