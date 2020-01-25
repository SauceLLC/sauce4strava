/* global sauce */

(function() {
    'use strict';

    function sleep(seconds) {
        return new Promise(resolve => setTimeout(resolve, seconds * 1000));
    }


    async function saveAthleteInfo(el, info) {
        const textareas = el.querySelectorAll('textarea.athlete-info');
        const status = document.getElementById('status');
        const errors = el.querySelectorAll('.error');
        for (const x of errors) {
            x.textContent = '';
        }
        for (const x of textareas) {
            const athlete = info[x.id];
            try {
                Object.assign(athlete, JSON.parse(x.value));
            } catch(e) {
                x.parentNode.querySelector('.error').textContent = e.toString();
                status.textContent = `Error updating ${athlete.name} (${x.id})`;
                return;
            }
        }
        await sauce.storage.set('athlete_info', info);
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
                <div class="athlete-box">
                    <div class="label">${athlete.name} (ID: ${id})</div>
                    <textarea rows="${lines.length}" class="athlete-info"
                              id="${id}">${json}</textarea>
                    <div class="error"></div>
                </div>
            `);
        }
        el.innerHTML = html.join('');
    }


    async function main() {
        document.getElementById('clear').addEventListener('click', function() {
            this.innerText = "Double Click to Confirm Erase";
            this.addEventListener('dblclick', async () => {
                await sauce.storage.remove('athlete_info');
                window.location.reload();
            });
        });
        const info = await sauce.storage.get('athlete_info');
        const el = document.getElementById('athlete-list');
        await renderAthleteInfo(el);
        document.getElementById('save').addEventListener('click', () => saveAthleteInfo(el, info));
    }

    document.addEventListener('DOMContentLoaded', main);
})();
