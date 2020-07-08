/* global sauce */

sauce.ns('settings', ns => {
    'use strict';

    async function load() {
        try {
            await _load();
        } catch(e) {
            await sauce.rpc.reportError(e);
            throw e;
        }
    }

    async function _load() {
        const anchor = document.createElement('a');
        anchor.textContent = `Sauce ${await sauce.locale.getMessage('analysis_options')}`;
        const image = document.createElement('img');
        image.src = sauce.extUrl + 'images/logo_horiz_128x48.png';
        anchor.appendChild(image);
        anchor.href = 'javascript:void(0);';
        anchor.addEventListener('click', () => sauce.rpc.openOptionsPage());
        const item = document.createElement('li');
        item.classList.add('sauce');
        item.appendChild(anchor);
        document.querySelector('#settings-menu').appendChild(item);
    }

    return {
        load,
    };
});

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    sauce.settings.load();
} else {
    addEventListener('DOMContentLoaded', sauce.settings.load);
}
