/* global sauce, browser */

(function() {
    'use strict';

    const isPopup = (new URLSearchParams(window.location.search)).get('popup') !== null;
    if (isPopup) {
        document.documentElement.classList.add('popup');
    }


    function sleep(seconds) {
        return new Promise(resolve => setTimeout(resolve, seconds * 1000));
    }


    async function saveAthleteInfo(el) {
        const textareas = el.querySelectorAll('textarea.athlete-info');
        const errors = el.querySelectorAll('.error');
        for (const x of errors) {
            x.textContent = '';
        }
        const athlete_info = {};
        for (const x of textareas) {
            const val = x.value.trim();
            if (!val) {
                continue;  // removed
            }
            try {
                athlete_info[x.id] = JSON.parse(val);
            } catch(e) {
                x.parentNode.querySelector('.error').textContent = e.toString();
                throw new Error(`Error updating ${x.id}`);
            }
        }
        await sauce.storage.set({athlete_info});
    }


    async function saveOptions(el) {
        const options = JSON.parse(el.value.trim());
        await sauce.storage.set({options});
    }


    async function saveRanges(el) {
        const ranges = (await sauce.storage.get('analysis_peak_ranges')) || {};
        for (const input of el.querySelectorAll('input')) {
            if (input.value.trim()) {
                const values = input.value.split(',').map(x => Number(x)).filter(x => x);
                ranges[input.dataset.key] = values.map(value => ({value}));
            } else {
                ranges[input.dataset.key] = null;
            }
        }
        await sauce.storage.set({analysis_peak_ranges: ranges});
    }


    async function renderAthleteInfo(el) {
        const info = await sauce.storage.get('athlete_info');
        const boxes = [];
        for (const [id, athlete] of Object.entries(info || {})) {
            const json = JSON.stringify(athlete, null, 2);
            const lines = json.split('\n');
            const box = document.createElement('div');
            box.classList.add('athlete-box');
            box.dataset.athleteId = id;
            const label = document.createElement('div');
            label.classList.add('label');
            label.textContent = `${athlete.name} (ID: ${id})`;
            const button = document.createElement('button');
            button.classList.add('remove', 'red');
            button.textContent = 'Remove';
            label.appendChild(button);
            const text = document.createElement('textarea');
            text.classList.add('athlete-info');
            text.setAttribute('rows', lines.length);
            text.id = id;
            text.textContent = json;
            const error = document.createElement('div');
            error.classList.add('error');
            box.appendChild(label);
            box.appendChild(text);
            box.appendChild(error);
            boxes.push(box);
        }
        while (el.firstChild) {
            el.removeChild(el.firstChild);
        }
        for (const x of boxes) {
            el.appendChild(x);
        }
    }


    async function renderOptions(el) {
        const options = await sauce.storage.get('options');
        const json = JSON.stringify(options, null, 2);
        el.setAttribute('rows', json.split('\n').length);
        el.textContent = json;
    }


    async function renderRanges(el) {
        const ranges = (await sauce.storage.get('analysis_peak_ranges')) || {};
        for (const input of el.querySelectorAll('input')) {
            const value = ranges[input.dataset.key];
            if (value) {
                input.value = value.map(x => x.value).join();
            } else {
                input.value = '';
            }
        }
    }


    function onEventDelegate(rootElement, evName, selector, callback) {
        // redneck event delegation..
        rootElement.addEventListener(evName, ev => {
            if (ev.target && ev.target.closest) {
                const delegateTarget = ev.target.closest(selector);
                if (delegateTarget) {
                    ev.delegateTarget = delegateTarget;
                    return callback(ev);
                }
            }
        });
    }


    async function reportEvent(eventCategory, eventAction, eventLabel) {
        const t = await sauce.ga.getOrCreateTracker();
        return t.send('event', {eventCategory, eventAction, eventLabel});
    }


    async function main() {
        document.querySelector('a.dismiss').addEventListener('click', () => {
            browser.tabs.update({active: true});  // required to allow self.close()
            self.close();
        });
        let _confirmingErase;
        document.getElementById('clear').addEventListener('click', function() {
            if (_confirmingErase) {
                return;
            }
            _confirmingErase = true;
            this.innerText = "Double Click to Confirm Erase";
            this.addEventListener('dblclick', async () => {
                await sauce.storage.remove('athlete_info');
                await sauce.storage.remove('analysis_peak_ranges');
                await sauce.storage.set('options', {
                    "analysis-segment-badges": true,
                    "analysis-cp-chart": true,
                    "activity-hide-promotions": true
                });
                if (isPopup) {
                    browser.tabs.reload();
                }
                try {
                    await reportEvent('AdvancedOptions', 'erase-all-data');
                } finally {
                    window.location.reload();
                }
            });
        });
        const optionsEl = document.getElementById('options');
        const rangesEl = document.querySelector('.ranges');
        const athleteEl = document.getElementById('athlete-list');
        await renderOptions(optionsEl);
        await renderRanges(rangesEl);
        await renderAthleteInfo(athleteEl);
        onEventDelegate(athleteEl, 'click', '.label > button.remove', async ev => {
            const id = ev.delegateTarget.closest('.athlete-box').dataset.athleteId;
            const athlete_info = await sauce.storage.get('athlete_info');
            delete athlete_info[id];
            await sauce.storage.set({athlete_info});
            await renderAthleteInfo(athleteEl);
            reportEvent('AdvancedOptions', 'remove-athlete-info');  // bg okay
        });
        document.getElementById('save').addEventListener('click', async () => {
            const status = document.getElementById('status');
            try {
                await saveAthleteInfo(athleteEl);
                await saveOptions(optionsEl);
                await saveRanges(rangesEl);
            } catch(e) {
                status.textContent = e.message;
                return;
            }
            await renderOptions(optionsEl);
            await renderRanges(rangesEl);
            await renderAthleteInfo(athleteEl);
            status.textContent = 'Saved';
            if (isPopup) {
                browser.tabs.reload();
            }
            reportEvent('AdvancedOptions', 'save');  // bg okay
            await sleep(5);
            status.textContent = '';
        });
        (await sauce.ga.getOrCreateTracker()).send('pageview');
    }

    document.addEventListener('DOMContentLoaded', main);
})();
