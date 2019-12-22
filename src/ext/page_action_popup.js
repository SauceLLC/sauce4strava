/* global sauce chrome */

(function() {
    'use strict';

    function manageEnabler(initialState) {
        const enabler = document.getElementById("enabler");
        let en_state = null;

        function toggle(state) {
            en_state = state;
            enabler.innerText = en_state ? 'Disable' : 'Enable';
            enabler.innerText += ' Extension';
            enabler.style.color = en_state ? '#933' : '#393';
            if (state) {
                document.body.classList.remove('disabled');
            } else {
                document.body.classList.add('disabled');
            }
        }
        toggle(initialState !== false);
        enabler.addEventListener('click', async () => {
            await sauce.storage.set('enabled', !en_state);
            toggle(!en_state);
            chrome.tabs.reload();
        });
    }

    function manageOptions(options) {
        options = options || {};
        const inputs = document.querySelectorAll('.option > input');
        for (const input of inputs) {
            input.checked = !!options[input.id];
            input.addEventListener('change', async ev => {
                options[input.id] = input.checked;
                await sauce.storage.set('options', options);
                chrome.tabs.reload();
            });
        }
    }

    async function main() {
        const details_el = document.querySelector('#details > tbody');
        const appDetail = chrome.app.getDetails();
        const details_list = [
            ['Version', appDetail.version_name || appDetail.version],
            ['Author', appDetail.author]
        ];
        details_list.forEach(function(x) {
            details_el.innerHTML += [
                '<tr><td class="key">', x[0], '</td>',
                '<td class="value">', x[1], '</td></tr>'
            ].join('');
        });

        const config = await sauce.storage.get();
        manageEnabler(config.enabled);
        manageOptions(config.options);
    }

    document.addEventListener('DOMContentLoaded', main);
})();
