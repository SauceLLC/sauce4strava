/* global sauce, browser */

(function() {
    'use strict';

    const isSafari = sauce.isSafari();
    const isPopup = (new URLSearchParams(window.location.search)).get('popup') !== null;
    if (isPopup) {
        document.documentElement.classList.add('popup');
    }


    function resetSuboptions(input) {
        if (!input.closest('.suboption')) {
            for (const suboption of input.closest('.option').querySelectorAll('.suboption')) {
                const disabled = typeof input.checked === 'boolean' ? !input.checked : !input.value;
                suboption.classList.toggle('disabled', disabled);
                suboption.querySelector('input').disabled = disabled;
            }
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
        return await sauce.report.event('Options', `set-${name}`, prettyValue);
    }


    function manageOptions(options, patronLevel) {
        const checkboxes = document.querySelectorAll('.option:not(.custom) input[type="checkbox"]');
        for (const input of checkboxes) {
            input.checked = !!options[input.name];
            if (input.dataset.restriction) {
                input.disabled = patronLevel < Number(input.dataset.restriction);
                if (input.disabled && isSafari) {
                    input.style.display = 'none';
                }
            }
            input.addEventListener('change', async ev => {
                options[input.name] = input.checked;
                resetSuboptions(input);
                await sauce.storage.set('options', options);
                if (isPopup && !input.classList.contains('no-reload')) {
                    browser.tabs.reload();
                }
                await reportOptionSet(input.name, input.checked);
            });
            resetSuboptions(input);
        }
        const radios = document.querySelectorAll('.option:not(.custom) input[type="radio"]');
        for (const input of radios) {
            input.checked = options[input.name] === input.value;
            if (input.dataset.restriction) {
                input.disabled = patronLevel < Number(input.dataset.restriction);
                if (input.disabled && isSafari) {
                    input.style.display = 'none';
                }
            }
            input.addEventListener('change', async ev => {
                options[input.name] = input.value;
                await sauce.storage.set('options', options);
                if (isPopup && !input.classList.contains('no-reload')) {
                    browser.tabs.reload();
                }
                await reportOptionSet(input.name, input.value);
            });
        }
        const selects = document.querySelectorAll('.option:not(.custom) select');
        for (const select of selects) {
            if (select.dataset.restriction) {
                select.disabled = patronLevel < Number(select.dataset.restriction);
                if (select.disabled && isSafari) {
                    select.style.display = 'none';
                }
            }
            for (const o of select.options) {
                o.selected = options[select.name] === o.value;
                if (o.dataset.restriction) {
                    o.disabled = patronLevel < Number(o.dataset.restriction);
                    if (o.disabled && isSafari) {
                        o.style.display = 'none';
                    }
                }
            }
            select.addEventListener('change', async ev => {
                const value = Array.from(select.selectedOptions).map(x => x.value).join(',');
                options[select.name] = value;
                resetSuboptions(select);
                await sauce.storage.set('options', options);
                if (isPopup && !select.classList.contains('no-reload')) {
                    browser.tabs.reload();
                }
                await reportOptionSet(select.name, value);
            });
            resetSuboptions(select);
        }
        const ranges = document.querySelectorAll('.option:not(.custom) input[type="range"]');
        for (const input of ranges) {
            input.value = options[input.name];
            if (input.dataset.restriction) {
                input.disabled = patronLevel < Number(input.dataset.restriction);
                if (input.disabled && isSafari) {
                    input.style.display = 'none';
                }
            }
            input.addEventListener('change', async ev => {
                options[input.name] = input.value;
                resetSuboptions(input);
                await sauce.storage.set('options', options);
                if (isPopup && !input.classList.contains('no-reload')) {
                    browser.tabs.reload();
                }
                await reportOptionSet(input.name, input.value);
            });
            resetSuboptions(input);
        }
    }


    function renderActivityFilters(table, options) {
        const tbody = table.querySelector('tbody');
        const filters = options['activity-filters'] = (options['activity-filters'] || []);
        tbody.textContent = '';
        if (!filters || !filters.length) {
            sauce.adjacentNodeContents(tbody, 'afterbegin',
                `<tr><td colspan="4"><i>No activity filters are configured</i></td></tr>`);
        } else {
            for (const [i, filter] of filters.entries()) {
                const row = document.createElement('tr');
                for (const key of ['type', 'criteria', 'action']) {
                    const q = `[data-filter-property="${key}"] option[value="${filter[key]}"]`;
                    const option = table.querySelector(q);
                    const label = option ? option.textContent : `invalid(${filter[key]})`;
                    const td = document.createElement('td');
                    td.classList.add(key);
                    td.textContent = label;
                    row.append(td);
                }
                const delTd = document.createElement('td');
                delTd.classList.add('op');
                const btn = document.createElement('button');
                btn.classList.add('button', 'delete');
                btn.textContent = '🗙';
                btn.title = 'Delete filter';
                btn.addEventListener('click', ev => {
                    ev.preventDefault();
                    filters.splice(i, 1);
                    sauce.storage.set('options', options); // bg okay
                    renderActivityFilters(table, options);
                });
                delTd.append(btn);
                row.append(delTd);
                tbody.append(row);
            }
        }
    }


    function manageCustomOptions(options) {
        const actFilters = document.querySelector('table.activity-filters');
        const addBtn = actFilters.querySelector('button.add-entry');
        const filters = options['activity-filters'] = (options['activity-filters'] || []);
        addBtn.addEventListener('click', ev => {
            const filter = {};
            for (const x of actFilters.querySelectorAll('select')) {
                filter[x.dataset.filterProperty] = x.value;
            }
            filters.push(filter);
            sauce.storage.set('options', options); // bg okay
            renderActivityFilters(actFilters, options);
        });
        const unset = new Set(['type', 'action']);
        let editing;
        for (const anchor of actFilters.querySelectorAll('a.select-toggle')) {
            anchor.addEventListener('click', ev => {
                ev.preventDefault();
                const td = anchor.closest('td');
                td.classList.add('editing');
                if (editing) {
                    editing.classList.remove('editing');
                }
                editing = td;
                unset.delete(td.querySelector('select').dataset.filterProperty);
                if (!unset.size) {
                    addBtn.classList.remove('disabled');
                }
            });
        }
        for (const select of actFilters.querySelectorAll('select')) {
            const handle = ev => {
                const td = select.closest('td');
                td.classList.remove('editing');
                if (editing === td) {
                    editing = null;
                }
                td.querySelector('a.select-toggle').textContent = select.options[select.selectedIndex].text;
            };
            select.addEventListener('change', handle);
            select.addEventListener('blur', handle);
        }
        renderActivityFilters(actFilters, options);
    }

 
    async function getBuildInfo() {
        const resp = await fetch('/build.json');
        return await resp.json();
    }


    async function main() {
        const supporters = await supP;
        const supporter = supporters[Math.floor(Math.random() * supporters.length)];
        const supEl = document.querySelector('p.supporter a');
        if (supEl) {
            supEl.textContent = supporter.name;
        }
        document.querySelector('a.dismiss').addEventListener('click', () => {
            browser.tabs.update({active: true});  // required to allow self.close()
            self.close();
        });
        const detailsEl = document.querySelector('#details > tbody');
        const type = browser.runtime.getURL('').split(':')[0];
        const doc = document.documentElement;
        doc.classList.add(type);
        if (sauce.isEdge()) {
            doc.classList.add('edge');
        }
        const config = await sauce.storage.get();
        const manifest = browser.runtime.getManifest();
        const build = await getBuildInfo();
        const commit = build.git_commit.slice(0, 10);
        const details = [
            ['Version', `${manifest.version_name || manifest.version} (${commit})`],
        ];
        const patronLink = document.createElement('a');
        patronLink.href = "https://saucellc.io/patreon-oauth";
        patronLink.target = "_blank";
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
            const span = document.createElement('span');
            span.textContent = (levelName || config.patronLevel) + ' ';
            if (!config.patronLegacy) {
                patronLink.textContent = '(Relink to Patreon)';
            }
            span.appendChild(patronLink);
            details.push(['Patron Level', span]);
            document.documentElement.dataset.patronLevel = config.patronLevel;
        } else if (!isSafari) {
            patronLink.textContent = 'Link to Patreon';
            details.push(['For new patrons', patronLink]);
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
        config.options = config.options || {};
        manageOptions(config.options, config.patronLevel);
        manageCustomOptions(config.options);
        handleCustomActions();
    }


    async function optionsChange(key, value) {
        for (const t of await browser.tabs.query({active: true})) {
            browser.tabs.sendMessage(t.id, {op: "options-change", key, value});
        }
    }


    function handleCustomActions() {
        if (!isPopup) {
            return;
        }
        const family = document.querySelector('[name="font-custom-family"]');
        const size = document.querySelector('[name="font-custom-size"]');
        family.addEventListener('input', ev => optionsChange('font-custom-family', family.value));
        size.addEventListener('input', ev => optionsChange('font-custom-size', size.value));
    }

    const supP = fetch('https://saucellc.io/supporters-v2.json').then(x => x.json());
    document.addEventListener('DOMContentLoaded', main);
})();
