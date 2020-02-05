/* global sauce */

(function() {
    'use strict';

    self.browser = self.browser || self.chrome;

    function manageEnabler(enabled) {
        function toggle(en) {
            enabled = en;
            if (enabled) {
                document.body.classList.remove('disabled');
            } else {
                document.body.classList.add('disabled');
            }
        }
        const enablers = document.querySelectorAll("button.enabler");
        for (const x of enablers) {
            x.addEventListener('click', async () => {
                await sauce.storage.set('enabled', !enabled);
                toggle(!enabled);
                browser.tabs.reload();
            });
        }
        toggle(enabled);
    }

    function manageOptions(options) {
        options = options || {};
        const inputs = document.querySelectorAll('.option > input');
        for (const input of inputs) {
            input.checked = !!options[input.id];
            input.addEventListener('change', async ev => {
                options[input.id] = input.checked;
                await sauce.storage.set('options', options);
                browser.tabs.reload();
            });
        }
    }

    async function main() {
        const details_el = document.querySelector('#details > tbody');
        const manifest = browser.runtime.getManifest();
        const details_list = [
            ['Version', manifest.version_name || manifest.version],
            ['Author', manifest.author]
        ];
        details_list.forEach(function(x) {
            details_el.innerHTML += [
                '<tr><td class="key">', x[0], '</td>',
                '<td class="value">', x[1], '</td></tr>'
            ].join('');
        });

        const config = await sauce.storage.get();
        manageEnabler(config.enabled !== false);
        manageOptions(config.options);
    }

    document.addEventListener('DOMContentLoaded', main);
})();
