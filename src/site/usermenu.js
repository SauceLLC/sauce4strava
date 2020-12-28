/* global sauce */

(function () {
    'use strict';

    async function load() {
        try {
            await _load();
        } catch(e) {
            await sauce.report.error(e);
            throw e;
        }
    }


    async function _load() {
        const menuOptions = document.querySelector('#global-header .user-nav .user-menu .options');
        if (!menuOptions) {
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
