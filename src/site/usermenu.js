/* global sauce */

(function () {
    'use strict';

    async function load() {
        try {
            await Promise.all([_loadOptions(), _loadPerf()]);
        } catch(e) {
            sauce.report.error(e);
            throw e;
        }
    }


    function upsellsHidden() {
        return document.documentElement.classList.contains('sauce-hide-upsells');
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
        if (!sauce.patronLegacy && sauce.isSafari()) {
            // Only permit legacy safari from seeing this since we already let them.
            return;
        }
        if (sauce.patronLevel < 10 && upsellsHidden()) {
            return;
        }
        const locales = await sauce.locale.getMessagesObject(
            ['/performance', 'fitness', 'best', 'compare'], 'menu');
        const menuEntries = [{
            text: `${locales.fitness}`,
            href: '/sauce/performance',
            image: 'images/logo_horiz_128x48.png',
        }, {
            text: `${locales.best}`,
            href: '/sauce/performance/best',
        }, {
            text: `${locales.compare}`,
            href: '/sauce/performance/compare',
        }];
        const group = document.createElement('li');
        group.classList.add('sauce-options-menu-group');
        const callout = document.createElement('div');
        callout.classList.add('sauce-callout');
        callout.textContent = `Sauce ${locales.performance}`;
        group.appendChild(callout);
        const list = document.createElement('ul');
        group.appendChild(list);
        for (const x of menuEntries) {
            const item = document.createElement('li');
            const a = document.createElement('a');
            a.textContent = x.text;
            a.href = x.href;
            if (x.image) {
                const image = document.createElement('img');
                image.src = sauce.extUrl + x.image;
                a.appendChild(image);
            }
            if (location.pathname.startsWith(x.href)) {
                item.classList.add('selected');
            }
            item.appendChild(a);
            list.appendChild(item);
        }

        const options = document.querySelector('#global-header .global-nav [data-log-category="training"] .options');
        if (options) {
            const refEl = options.querySelector('li.premium');
            if (refEl) {
                refEl.insertAdjacentElement('beforebegin', group);
            }
        } else {
            // React page with obfuscated HTML.
            const prev = document.querySelector('header nav ul li ul li a[href="/athlete/training"]');
            if (prev) {
                prev.parentElement.insertAdjacentElement('afterend', group);
            }
        }
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        load();
    } else {
        addEventListener('DOMContentLoaded', load);
    }
})();
