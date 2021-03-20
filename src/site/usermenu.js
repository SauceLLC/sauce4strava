/* global sauce */

(function () {
    'use strict';

    async function load() {
        try {
            _loadOptions();
            if (sauce.patronLevel && sauce.patronLevel >= 10) {
                _loadPerf();
            }
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
        const anchor = document.createElement('a');
        anchor.textContent = `Sauce ${await sauce.locale.getMessage('performance')}`;
        const image = document.createElement('img');
        image.src = sauce.extUrl + 'images/logo_horiz_128x48.png';
        const disclaimer = document.createElement('div');
        disclaimer.textContent = 'preview';
        disclaimer.classList.add('disclaimer');
        anchor.appendChild(image);
        anchor.appendChild(disclaimer);
        anchor.href = '/sauce/performance/';
        const item = document.createElement('li');
        item.classList.add('sauce-options-menu-item');
        if (location.pathname.startsWith('/sauce/performance')) {
            item.classList.add('selected');
        }
        item.appendChild(anchor);
        const options = document.querySelector('#global-header .global-nav [data-log-category="training"] .options');
        if (options) {
            options.querySelector('li.premium').insertAdjacentElement('beforebegin', item);
        } else {
            // React page with obfuscated HTML.
            const prev = document.querySelector('header nav ul li > a[href="/athlete/training"]');
            if (prev) {
                prev.parentElement.insertAdjacentElement('afterend', item);
            }
        }
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        load();
    } else {
        addEventListener('DOMContentLoaded', load);
    }
})();
