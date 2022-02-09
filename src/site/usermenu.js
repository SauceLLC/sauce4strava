/* global sauce */
/*
 * Note that all async work happens with callbacks AFTER the DOM is updated.
 * In some cases like analysis the menu nav actually gets moved around, so we
 * need to be immediate and need closures on the elements at the time of creation.
 */

(function () {
    'use strict';

    const perfMenu = [{
        localeKey: 'fitness',
        tmpText: 'Fitness Tracking',
        href: '/sauce/performance/fitness',
        icon: 'analytics-duotone',
    }, {
        localeKey: 'peaks',
        tmpText: 'Peak Performances',
        href: '/sauce/performance/peaks',
        icon: 'medal-duotone',
    }/*, {
        localeKey: 'compare',
        tmpText: 'Compare Activities',
        href: '/sauce/performance/compare',
        icon: 'balance-scale-right-duotone',
    }*/];
    const localesPromise = sauce.locale.getMessagesObject(
        ['/performance', '/analysis_options', ...perfMenu.map(x => x.localeKey)],
        'menu_performance');


    function load() {
        try {
            _loadPerf();
            _loadOptions();
        } catch(e) {
            sauce.report.error(e);
            throw e;
        }
    }


    function upsellsHidden() {
        return document.documentElement.classList.contains('sauce-hide-upsells');
    }


    function _loadOptions() {
        let menuEl = document.querySelector('#global-header .user-nav .user-menu .options');
        if (!menuEl) {
            // React page with obfuscated HTML.
            menuEl = document.querySelector('header nav ul li ul[labeledby="athlete-menu"]');
            if (!menuEl) {
                return;
            }
        }
        const a = document.createElement('a');
        const span = document.createElement('span');
        span.textContent = `Sauce Options`;
        a.appendChild(span);
        localesPromise.then(locales => span.textContent = `Sauce ${locales.analysis_options}`);
        const logo = document.createElement('img');
        logo.src = sauce.extUrl + 'images/logo_horiz_128x48.png';
        a.appendChild(logo);
        a.href = 'javascript:void(0);';
        a.addEventListener('click', () => {
            sauce.menu.openOptionsPage().catch(sauce.report.error);  // bg okay
            sauce.report.event('UserMenu', 'options');
        });
        const item = document.createElement('li');
        item.classList.add('sauce-options-menu-item');
        item.appendChild(a);
        menuEl.appendChild(item);
    }

    function _loadPerf() {
        if (!sauce.patronLegacy && sauce.isSafari()) {
            // Only permit legacy safari from seeing this since we already let them.
            return;
        }
        if (sauce.patronLevel < 10 && upsellsHidden()) {
            return;
        }
        const group = document.createElement('li');
        group.classList.add('sauce-options-menu-group');
        const callout = document.createElement('div');
        callout.classList.add('sauce-callout', 'text-caption4');
        const calloutSpan = document.createElement('span');
        calloutSpan.textContent = `Sauce Performance`;
        callout.appendChild(calloutSpan);
        localesPromise.then(locales => calloutSpan.textContent = `Sauce ${locales.performance}`);
        const calloutLogo = document.createElement('img');
        calloutLogo.src = sauce.extUrl + 'images/logo_horiz_128x48.png';
        callout.appendChild(calloutLogo);
        group.appendChild(callout);
        const list = document.createElement('ul');
        group.appendChild(list);
        for (const x of perfMenu) {
            const item = document.createElement('li');
            const a = document.createElement('a');
            const span = document.createElement('span');
            a.appendChild(span);
            a.href = x.href;
            if (x.tmpText) {
                span.textContent = x.tmpText;
            }
            if (x.localeKey) {
                localesPromise.then(locales => span.textContent = locales[x.localeKey]);
            }
            if (x.icon) {
                fetch(sauce.extUrl + `images/fa/${x.icon}.svg`).then(resp =>
                    resp.text().then(svg => sauce.adjacentNodeContents(a, 'afterbegin', svg)));
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
