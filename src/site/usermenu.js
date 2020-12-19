/* global sauce */

(function () {
    'use strict';

    async function load() {
        try {
            await _load();
        } catch(e) {
            await sauce.proxy.reportError(e);
            throw e;
        }
    }

    async function _load() {
        let menuOptions = document.querySelector('#global-header .user-nav .user-menu .options');
        if (!menuOptions) {
            menuOptions = document.querySelector('[class*="src--global-header--"] ul[labeledby="athlete-menu"]');
            if (!menuOptions) {
                return;
            }
        }
        const anchor = document.createElement('a');
        anchor.textContent = `Sauce ${await sauce.locale.getMessage('analysis_options')}`;
        const image = document.createElement('img');
        image.src = sauce.extUrl + 'images/logo_horiz_128x48.png';
        anchor.appendChild(image);
        anchor.href = 'javascript:void(0);';
        anchor.addEventListener('click', () => {
            sauce.proxy.openOptionsPage().catch(sauce.proxy.reportError);  // bg okay
            sauce.proxy.reportEvent('UserMenu', 'options');
        });
        const item = document.createElement('li');
        item.id = 'global-sauce-options-menu-item';
        item.appendChild(anchor);
        menuOptions.appendChild(item);
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        load();
    } else {
        addEventListener('DOMContentLoaded', load);
    }
})();
