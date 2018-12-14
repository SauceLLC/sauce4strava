/* global chrome */

(async function() {
    'use strict';

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

    let en_state = null;

    async function storageSet(key, value) {
        await new Promise(resolve => chrome.storage.sync.set({[key]: value}, resolve));
    }

    /*async function storageGet(key) {
        if (!key) {
            throw new Error("Key required");
        }
        await new Promise(resolve => chrome.storage.sync.get(key, result => resolve(result[key])));
    }*/

    async function storageGetAll() {
        return await new Promise(resolve => chrome.storage.sync.get(null, resolve));
    }

    async function manageEnabler(initialState) {
        const enabler = document.getElementById("enabler");
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
            await storageSet('enabled', !en_state);
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
                await storageSet('options', options);
                chrome.tabs.reload();
            });
        }
    }

    const config = await storageGetAll();
    manageEnabler(config.enabled);
    manageOptions(config.options);
})();
