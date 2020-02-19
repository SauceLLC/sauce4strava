/* global sauce, browser */

(function() {
    'use strict';


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
        const html = [];
        for (const [id, athlete] of Object.entries(info || {})) {
            const json = JSON.stringify(athlete, null, 2);
            const lines = json.split('\n');
            html.push(`
                <div class="athlete-box" data-athlete-id="${id}">
                    <div class="label">
                        ${athlete.name} (ID: ${id})
                        <button class="remove red">Remove</button>
                    </div>
                    <textarea rows="${lines.length}" class="athlete-info"
                              id="${id}">${json}</textarea>
                    <div class="error"></div>
                </div>
            `);
        }
        el.innerHTML = html.join('');
    }


    async function renderOptions(el) {
        const options = await sauce.storage.get('options');
        const json = JSON.stringify(options, null, 2);
        el.setAttribute('rows', json.split('\n').length);
        el.innerHTML = json;
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


    async function main() {
        document.querySelector('a.dismiss').addEventListener('click', () => {
            browser.tabs.update({active: true});  // required to allow self.close()
            self.close();
        });
        document.getElementById('clear').addEventListener('click', function() {
            this.innerText = "Double Click to Confirm Erase";
            this.addEventListener('dblclick', async () => {
                await sauce.storage.remove('athlete_info');
                await sauce.storage.remove('analysis_peak_ranges');
                await sauce.storage.set('options', {
                    "analysis-segment-badges": true,
                    "analysis-cp-chart": true,
                    "activity-hide-promotions": true
                });
                browser.tabs.reload();
                window.location.reload();
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
            browser.tabs.reload();
            await sleep(5);
            status.textContent = '';
        });
    }

    document.addEventListener('DOMContentLoaded', main);
})();
