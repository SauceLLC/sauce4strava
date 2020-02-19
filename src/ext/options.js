/* global sauce, browser */

(function() {
    'use strict';


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

    function resetSuboptions(input) {
        for (const suboption of input.closest('.option').querySelectorAll('.suboption')) {
            suboption.classList.toggle('disabled', !input.checked);
            suboption.querySelector('input').disabled = !input.checked;
        }
    }

    function manageOptions(options) {
        options = options || {};
        const checkboxes = document.querySelectorAll('.option input[type="checkbox"]');
        for (const input of checkboxes) {
            input.checked = !!options[input.name];
            input.addEventListener('change', async ev => {
                options[input.name] = input.checked;
                resetSuboptions(input);
                await sauce.storage.set('options', options);
                browser.tabs.reload();
            });
            resetSuboptions(input);
        }
        const radios = document.querySelectorAll('.option input[type="radio"]');
        for (const input of radios) {
            input.checked = options[input.name] === input.value;
            input.addEventListener('change', async ev => {
                options[input.name] = input.value;
                await sauce.storage.set('options', options);
                browser.tabs.reload();
            });
        }

    }

    async function getBuildInfo() {
        const resp = await fetch('/build.json');
        return await resp.json();
    }

    async function main() {
        document.querySelector('a.dismiss').addEventListener('click', () => {
            browser.tabs.update({active: true});  // required to allow self.close()
            self.close();
        });
        const details_el = document.querySelector('#details > tbody');
        const type = browser.runtime.getURL('').split(':')[0];
        document.body.classList.add(type);
        const manifest = browser.runtime.getManifest();
        const build = await getBuildInfo();
        const commit = build.git_commit.slice(0, 10);
        const details_list = [
            ['Version', `${manifest.version_name || manifest.version} <small>(commit:${commit})</small>`],
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
