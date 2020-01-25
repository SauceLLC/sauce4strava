/* global sauce */

(function() {
    'use strict';

    function sleep(seconds) {
        return new Promise(resolve => setTimeout(resolve, seconds * 1000));
    }


    async function saveAthleteInfo(el) {
        const textareas = el.querySelectorAll('textarea.athlete-info');
        const status = document.getElementById('status');
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
                status.textContent = `Error updating ${x.id}`;
                return;
            }
        }
        await sauce.storage.set({athlete_info});
        status.textContent = 'Athlete options saved';
        await renderAthleteInfo(el);
        await sleep(8);
        status.textContent = '';
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
        document.getElementById('clear').addEventListener('click', function() {
            this.innerText = "Double Click to Confirm Erase";
            this.addEventListener('dblclick', async () => {
                await sauce.storage.remove('athlete_info');
                window.location.reload();
            });
        });
        const el = document.getElementById('athlete-list');
        await renderAthleteInfo(el);
        onEventDelegate(el, 'click', '.label > button.remove', async ev => {
            const id = ev.delegateTarget.closest('.athlete-box').dataset.athleteId;
            const athlete_info = await sauce.storage.get('athlete_info');
            delete athlete_info[id];
            await sauce.storage.set({athlete_info});
            await renderAthleteInfo(el);
        });
        document.getElementById('save').addEventListener('click', () => saveAthleteInfo(el));
    }

    document.addEventListener('DOMContentLoaded', main);
})();
