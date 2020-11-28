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
                const enabling = !enabled;
                await sauce.storage.set('enabled', enabling);
                toggle(enabling);
                if (isPopup) {
                    browser.tabs.reload();
                }
                await reportOptionSet('enabled', enabling);
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

    async function reportOptionSet(name, value) {
        let prettyValue;
        if (value === null) {
            prettyValue = 'null';
        } else if (value === undefined) {
            prettyValue = 'undefined';
        } else if (value.toString) {
            prettyValue = value.toString();
        } else {
            prettyValue = JSON.stringify(value);
        }
        return await reportEvent('Options', `set-${name}`, prettyValue);
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
                await reportOptionSet(input.name, input.checked);
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
                await reportOptionSet(input.name, input.value);
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
                await reportOptionSet(select.name, value);
            });
        }
    }

    async function getBuildInfo() {
        const resp = await fetch('/build.json');
        return await resp.json();
    }

    async function reportEvent(eventCategory, eventAction, eventLabel) {
        const t = await sauce.ga.getOrCreateTracker();
        return t.send('event', {eventCategory, eventAction, eventLabel});
    }

    async function main() {
        const supporters = await supP;
        const supporter = supporters[Math.floor(Math.random() * supporters.length)];
        const supEl = document.querySelector('p.supporter a');
        if (supEl) {
            supEl.textContent = supporter;
        }
        document.querySelector('a.dismiss').addEventListener('click', () => {
            browser.tabs.update({active: true});  // required to allow self.close()
            self.close();
        });
        const detailsEl = document.querySelector('#details > tbody');
        const type = browser.runtime.getURL('').split(':')[0];
        const doc = document.documentElement;
        doc.classList.add(type);
        if (navigator.userAgent.match(/ Edg\//)) {
            doc.classList.add('edge');
        }
        const config = await sauce.storage.get();
        const manifest = browser.runtime.getManifest();
        const build = await getBuildInfo();
        const commit = build.git_commit.slice(0, 10);
        const details = [
            ['Version', `${manifest.version_name || manifest.version} (${commit})`],
        ];
        if (config.safariLatestVersion) {
            if (build.git_commit !== config.safariLatestVersion.commit &&
                config.lastSafariVersion === manifest.version) {
                const link = document.createElement('a');
                link.setAttribute('href', config.safariLatestVersion.url);
                link.setAttribute('target', '_blank');
                link.textContent = `Download Version: ${config.safariLatestVersion.version}`;
                link.style.fontWeight = 'bold';
                details.push(['Update Available', link]);
            }
        }
        if (config.patronLevel) {
            // There is going to be small window where names are not available
            let levelName;
            if (config.patronLevelNames) {
                for (const x of config.patronLevelNames) {
                    if (x.level <= config.patronLevel) {
                        levelName = x.name;
                        break;
                    }
                }
            }
            details.push(['Patron Level', levelName || config.patronLevel]);
        }
        for (const [key, value] of details) {
            const tdKey = document.createElement('td');
            tdKey.classList.add('key');
            tdKey.textContent = key;
            const tdVal = document.createElement('td');
            tdVal.classList.add('value');
            if (value instanceof Element) {
                tdVal.appendChild(value);
            } else {
                tdVal.textContent = value;
            }
            const tr = document.createElement('tr');
            tr.appendChild(tdKey);
            tr.appendChild(tdVal);
            detailsEl.appendChild(tr);
        }
        manageEnabler(config.enabled !== false);
        manageOptions(config.options, config.patronLevel);
        (await sauce.ga.getOrCreateTracker()).send('pageview');
    }

    const supP = fetch('https://saucellc.io/supporters.json').then(x => x.json());
    document.addEventListener('DOMContentLoaded', main);
})();
