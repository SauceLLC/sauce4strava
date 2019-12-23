/* global sauce */


(function() {
    'use strict';

    function sleep(seconds) {
        return new Promise(resolve => setTimeout(resolve, seconds * 1000));
    }

    async function saveFtps(ftps) {
        const ftpInputs = document.querySelectorAll('#ftp_list input[name="ftp"]');
        const overrides = await sauce.storage.get('ftp_overrides');
        for (const el of ftpInputs) {
            const id = Number(el.id);
            overrides[id] = Number(el.value);
        }
        await sauce.storage.set('ftp_overrides', overrides);
        const status = document.getElementById('status');
        status.textContent = 'Options saved.';
        await sleep(2);
        status.textContent = '';
    }


    async function getFtps() {
        const data = await sauce.storage.get(['ftp_overrides', 'athlete_info']);
        if (!data.ftp_overrides) {
            // Migrate old entries to new system..
            data.ftp_overrides = {};
            data.athlete_info = data.athlete_info || {};
            const all = await sauce.storage.get(null);
            for (const [key, value] of Object.entries(all)) {
                if (key.indexOf('athlete_ftp_') === 0) {
                    // await sauce.storage.remove(key);  // XXX turn on in a future release
                    const id = Number(key.substr(12));
                    console.info("Migrating athlete FTP override for:", id);
                    data.ftp_overrides[id] = value;
                    data.athlete_info[id] = {
                        name: `Athlete ID: ${id}`
                    };
                }
            }
            await sauce.storage.set(data);
        }
        const ftps = [];
        for (const id of Object.keys(data.ftp_overrides)) {
            ftps.push({id, name: data.athlete_info[id].name, ftp: data.ftp_overrides[id]});
        }
        return ftps;
    }


    async function main() {
        document.getElementById('clear').addEventListener('click', function() {
            this.innerText = "Double Click to Confirm Erase";
            this.addEventListener('dblclick', async () => {
                await sauce.storage.remove('ftp_overrides');
                window.location.reload();
            });
        });
        const ftps = await getFtps();
        const ftp_list = document.getElementById('ftp_list');
        for (const x of ftps) {
            ftp_list.innerHTML += `
                <tr>
                    <td class="label">${x.name}:</td>
                    <td><input name="ftp" type="number" maxlength="4" size="4" step="10"
                               id="${x.id}" value="${x.ftp}"/></td>
                </tr>
            `;
        }
        document.getElementById('save').addEventListener('click', saveFtps);
    }

    document.addEventListener('DOMContentLoaded', main);
})();
