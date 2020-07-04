/* global sauce, browser */

(function() {
    'use strict';

    const isPopup = (new URLSearchParams(window.location.search)).get('popup') !== null;
    if (isPopup) {
        document.documentElement.classList.add('popup');
    }

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
                if (isPopup) {
                    browser.tabs.reload();
                }
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

    function manageOptions(options, patronLevel) {
        options = options || {};
        const checkboxes = document.querySelectorAll('.option input[type="checkbox"]');
        for (const input of checkboxes) {
            input.checked = !!options[input.name];
            if (input.dataset.restriction) {
                input.disabled = patronLevel < Number(input.dataset.restriction);
            }
            input.addEventListener('change', async ev => {
                options[input.name] = input.checked;
                resetSuboptions(input);
                await sauce.storage.set('options', options);
                if (isPopup) {
                    browser.tabs.reload();
                }
            });
            resetSuboptions(input);
        }
        const radios = document.querySelectorAll('.option input[type="radio"]');
        for (const input of radios) {
            input.checked = options[input.name] === input.value;
            if (input.dataset.restriction) {
                input.disabled = patronLevel < Number(input.dataset.restriction);
            }
            input.addEventListener('change', async ev => {
                options[input.name] = input.value;
                await sauce.storage.set('options', options);
                if (isPopup) {
                    browser.tabs.reload();
                }
            });
        }
        const selects = document.querySelectorAll('.option select');
        for (const select of selects) {
            if (select.dataset.restriction) {
                select.disabled = patronLevel < Number(select.dataset.restriction);
            }
            for (const o of select.options) {
                o.selected = options[select.name] === o.value;
                if (o.dataset.restriction) {
                    o.disabled = patronLevel < Number(o.dataset.restriction);
                }
            }
            select.addEventListener('change', async ev => {
                const value = Array.from(select.selectedOptions).map(x => x.value).join(',');
                options[select.name] = value;
                await sauce.storage.set('options', options);
                if (isPopup) {
                    browser.tabs.reload();
                }
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
        const doc = document.documentElement;
        doc.classList.add(type);
        if (navigator.userAgent.match(/ Edg\//)) {
            doc.classList.add('edge');
        }
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
        manageOptions(config.options, config.patronLevel);
    }

    document.addEventListener('DOMContentLoaded', main);
})();
