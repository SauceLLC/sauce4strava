/* global sauce, jQuery */

sauce.ns('profile', ns => {
    'use strict';


    const idMatch = location.pathname.match(/\/(?:athletes|pros)\/([0-9]+)/);
    ns.athleteId = Number(idMatch[1]);


    let _syncStatusTimeout;
    function setSyncStatus(msg, options={}) {
        const $status = jQuery('#heading header .sauce-sync-athlete .status');
        clearTimeout(_syncStatusTimeout);
        $status.html(msg);
        if (options.timeout) {
            _syncStatusTimeout = setTimeout(() => $status.empty(), options.timeout);
        }
    }


    function setupActivitySyncController($sync) {
        ns.syncController = new sauce.hist.SyncController(ns.athleteId);
        ns.syncController.addEventListener('start', ev => {
            $sync.addClass('sync-active');
            setSyncStatus('Starting sync...');
        });
        ns.syncController.addEventListener('stop', ev => {
            $sync.removeClass('sync-active');
            setSyncStatus('Sync completed', {timeout: 5000});
        });
        ns.syncController.addEventListener('error', ev => {
            setSyncStatus('Sync problem occurred');
        });
        ns.syncController.addEventListener('progress', async ev => {
            const counts = ev.data.counts;
            const synced = counts.processed;
            const total = counts.total - counts.unavailable - counts.unprocessable;
            setSyncStatus(`${synced.toLocaleString()}/${total.toLocaleString()}`);
        });
        ns.syncController.addEventListener('enable', ev => {
            $sync.addClass('enabled');
            setSyncStatus('Sync enabled', {timeout: 5000});
        });
        ns.syncController.addEventListener('disable', ev => {
            $sync.removeClass('enabled sync-active');
            setSyncStatus('Sync disabled', {timeout: 5000});
        });
        ns.syncController.isActiveSync().then(x => $sync.toggleClass('sync-active', x));
    }


    async function attachSyncToggle() {
        const [sync, check]  = await Promise.all([
            sauce.images.asText('fa/sync-alt-regular.svg'),
            sauce.images.asText('fa/check-solid.svg'),
        ]);
        const $holder = jQuery('.profile-heading .row .spans5');
        const $sync = jQuery(`
            <button class="btn sauce-sync-button">
                <div class="sauce-sync-icon">
                    ${sync}
                    ${check}
                </div>
                <span class="sauce-sync-status"></span>
            </button>
        `);
        const id = ns.athleteId;
        let athlete = await sauce.hist.getAthlete(id);
        const enabled = !!(athlete && athlete.sync);
        if (enabled) {
            $sync.addClass('enabled');
            if (!ns.syncController) {
                setupActivitySyncController($sync);
            }
        }
        $holder.append($sync);
        $sync.on('click', async () => {
            if (!ns.syncController) {
                setupActivitySyncController($sync);
            }
            if (!athlete) {
                athlete = await buildAthleteRecord(); // XXX NOPE Move to bg page.
                await sauce.hist.addAthlete(athlete);
            }
            const mod = await sauce.getModule('/src/site/sync-panel.mjs');
            await mod.activitySyncDialog(athlete, ns.syncController);
        });
    }


    async function load() {
        await sauce.locale.init();
        await sauce.proxy.connected;
        await attachSyncToggle();
    }


    if (ns.athleteId) {
        if (['interactive', 'complete'].indexOf(document.readyState) === -1) {
            addEventListener('DOMContentLoaded', () => load().catch(sauce.report.error));
        } else {
            load().catch(sauce.report.error);
        }
    }
});
