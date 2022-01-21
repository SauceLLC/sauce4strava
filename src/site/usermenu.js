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

    async function preloadPerfMenu() {
        console.log(performance.now());
        const locales = await sauce.locale.getMessagesObject(
            ['/performance', 'fitness', 'best', 'compare'], 'menu');
        console.log(performance.now());
        const menu = [{
            text: `${locales.fitness} Tracking`,
            href: '/sauce/performance',
            icon: 'analytics-duotone',
        }, {
            text: `${locales.best} Performances`,
            href: '/sauce/performance/best',
            icon: 'medal-duotone',
        }, {
            text: `${locales.compare} Activities`,
            href: '/sauce/performance/compare',
            icon: 'balance-scale-right-duotone',
        }];
        await Promise.all(menu.map(async x => {
            const r = await fetch(sauce.extUrl + `images/fa/${x.icon}.svg`);
            x.svg = await r.text();
        }));
        console.log(performance.now());
        return {menu, locales};
    }
    let perfMenuPreload = preloadPerfMenu();


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
        const {menu, locales} = await perfMenuPreload;
        const group = document.createElement('li');
        group.classList.add('sauce-options-menu-group');
        const callout = document.createElement('div');
        callout.classList.add('sauce-callout', 'text-caption4');
        callout.textContent = `Sauce ${locales.performance}`;
        const calloutLogo = document.createElement('img');
        calloutLogo.src = sauce.extUrl + 'images/logo_horiz_128x48.png';
        callout.appendChild(calloutLogo);
        group.appendChild(callout);
        const list = document.createElement('ul');
        group.appendChild(list);
        for (const x of menu) {
            const item = document.createElement('li');
            const a = document.createElement('a');
            a.textContent = x.text;
            a.href = x.href;
            if (x.svg) {
                sauce.adjacentNodeContents(a, 'afterbegin', x.svg);
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
