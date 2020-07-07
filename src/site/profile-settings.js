/* global sauce */

sauce.ns('profileSettings', ns => {
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
        const menu = document.querySelector('#settings-menu');
        const item = document.createElement('li');
        const anchor = document.createElement('a');
        anchor.textContent = `Sauce ${await sauce.locale.getMessage('analysis_options')}`;
        anchor.href = 'javascript:void(0)';
        anchor.addEventListener('click', () => sauce.rpc.openOptionsPage());
        item.appendChild(anchor);
        menu.appendChild(item);
    }

    return {
        load,
    };
});

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    sauce.profileSettings.load();
} else {
    addEventListener('DOMContentLoaded', sauce.profileSettings.load);
}
