/* global sauce */

import * as hist from './history-views.mjs';


export async function activitySyncDialog(athlete, syncController) {
    const tpl = await sauce.template.getTemplate('sync-control-panel.html', 'sync_control_panel');
    const initiallyEnabled = !!athlete.sync;
    const $modal = sauce.modal({
        title: `Activity Sync Control Panel - ${athlete.name}`,
        icon: await sauce.images.asText('fa/sync-alt-duotone.svg'),
        dialogClass: 'sauce-sync-athlete-dialog',
        body: await tpl({
            athlete,
            enabled: initiallyEnabled
        }),
        flex: true,
        width: '35em',
        autoDestroy: true,
        autoOpen: false,
        closeOnMobileBack: true,
        extraButtons: [{
            text: 'Import Data',
            click: ev => {
                const btn = ev.currentTarget;
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '*.sbin';
                input.multiple = true;
                input.style.display = 'none';
                input.addEventListener('change', async ev => {
                    const jobs = await sauce.getModule('/src/common/jscoop/jobs.js');
                    const importingQueue = new jobs.UnorderedWorkQueue({maxPending: 12});
                    btn.classList.add('sauce-loading', 'disabled');
                    try {
                        const dataEx = new sauce.hist.DataExchange();
                        for (const f of input.files) {
                            const ab = await sauce.blobToArrayBuffer(f);
                            const batch = sauce.decodeBundle(ab);
                            const stride = 250;  // ~10MB
                            const producer = (async () => {
                                for (let i = 0; i < batch.length; i += stride) {
                                    await importingQueue.put(dataEx.import(batch.slice(i, i + stride)));
                                }
                            })();
                            await producer;
                            for await (const x of importingQueue) { void x; }
                        }
                        await dataEx.flush();
                    } finally {
                        btn.classList.remove('sauce-loading', 'disabled');
                    }
                });
                document.body.appendChild(input);
                input.click();
                input.remove();
            }
        }, {
            text: 'Export Data',
            click: async ev => {
                let bigBundle;
                let page = 1;
                const rid = Math.floor(Math.random() * 1000000);
                const dl = () => {
                    sauce.downloadBlob(new Blob([bigBundle]), `${athlete.name}-${rid}-${page++}.sbin`);
                    bigBundle = null;
                };
                ev.currentTarget.classList.add('sauce-loading', 'disabled');
                try {
                    const dataEx = new sauce.hist.DataExchange(athlete.id);
                    dataEx.addEventListener('data', async ev => {
                        const bundle = sauce.encodeBundle(ev.data);
                        bigBundle = bigBundle ? sauce.concatBundles(bigBundle, bundle) : bundle;
                        if (bigBundle.byteLength > 256 * 1024 * 1024) {
                            dl();
                        }
                    });
                    await dataEx.export();
                    dl();
                } finally {
                    ev.currentTarget.classList.remove('sauce-loading', 'disabled');
                }
            }
        }]
    });
    const ftpHistView = new hist.FTPHistoryView({athlete, el: $modal.find('.entry.history.ftp')});
    const weightHistView = new hist.WeightHistoryView({athlete, el: $modal.find('.entry.history.weight')});
    const rendering = [ftpHistView.render(), weightHistView.render()];

    async function updateSyncCounts(counts) {
        counts = counts || await sauce.hist.activityCounts(athlete.id);
        const total = counts.total - counts.unavailable;
        const synced = counts.processed;
        const title =
            `Total: ${counts.total}\n` +
            `Imported: ${counts.imported}\n` +
            `Unavailable: ${counts.unavailable}\n` +
            `Remaining: ${counts.total - counts.unavailable - counts.imported}\n` +
            `Processed: ${counts.processed}\n` +
            `Unprocessable: ${counts.unprocessable}\n`;
        const $synced = $modal.find('.entry.synced');
        $synced.attr('title', title);
        $synced.find('progress').attr('value', synced / total);
        if (synced === total) {
            $synced.find('.text').html(`100% - ${synced.toLocaleString()} activities`);
        } else {
            $synced.find('.text').html(`${synced.toLocaleString()} of ${total.toLocaleString()} activities`);
        }
    }

    async function updateSyncTimes() {
        const [lastSync, nextSync] = await Promise.all([syncController.lastSync(), syncController.nextSync()]);
        $modal.find('.entry.last-sync value').text(lastSync ? (sauce.locale.human.datetime(lastSync)) : '');
        $modal.find('.entry.next-sync value').text(nextSync ? (sauce.locale.human.datetime(nextSync)) : '');
    }

    let rateLimiterInterval;
    async function setActive(active) {
        if (active) {
            $modal.addClass('sync-active');
            $modal.removeClass('has-error');
            $modal.find('.entry.status value').text('Running...');
            $modal.find('.entry.last-sync value').empty();
            $modal.find('.entry.next-sync value').empty();
            $modal.find('.entry.error value').empty();
            $modal.find('.entry.synced progress').removeAttr('value');
            $modal.find('.entry.synced .text').empty();
            clearInterval(rateLimiterInterval);
            rateLimiterInterval = setInterval(async () => {
                const resumes = await syncController.rateLimiterResumes();
                if (resumes && resumes - Date.now() > 10000) {
                    const resumesLocale = sauce.locale.human.datetime(resumes);
                    $modal.find('.entry.status value').text(`Suspended until: ${resumesLocale}`);
                }
            }, 2000);
        } else {
            clearInterval(rateLimiterInterval);
            $modal.removeClass('sync-active');
            $modal.find('.entry.status value').text('Idle');
            await Promise.all([updateSyncCounts(), updateSyncTimes()]);
        }
    }

    const listeners = {
        active: ev => void setActive(ev.data),
        error: async ev => {
            $modal.addClass('has-error');
            $modal.find('.entry.error value').text(ev.data.error);
        },
        progress: ev => void updateSyncCounts(ev.data.counts),
        enable: ev => void ($modal.find('input[name="enable"]')[0].checked = true),
        disable: ev => void ($modal.find('input[name="enable"]')[0].checked = false),
    };
    for (const [event, cb] of Object.entries(listeners)) {
        syncController.addEventListener(event, cb);
    }

    $modal.on('input', 'input[name="enable"]', async ev => {
        const enabled = ev.currentTarget.checked;
        if (enabled) {
            await Promise.all([updateSyncCounts(), updateSyncTimes()]);
            await sauce.hist.enableAthlete(athlete.id);
        } else {
            await sauce.hist.disableAthlete(athlete.id);
        }
        $modal.toggleClass('sync-disabled', !enabled);
    });
    $modal.on('click', '.sync-stop.btn', ev => {
        ev.preventDefault();
        $modal.removeClass('sync-active');
        syncController.cancel();
    });
    $modal.on('click', '.sync-recompute.btn', async ev => {
        ev.preventDefault();
        $modal.addClass('sync-active');
        $modal.find('.entry.synced progress').removeAttr('value');  // make it indeterminate
        $modal.find('.entry.synced .text').empty();
        await sauce.hist.invalidateAthleteSyncState(athlete.id, 'local');
    });
    $modal.on('click', '.sync-start.btn', async ev => {
        ev.preventDefault();
        $modal.addClass('sync-active');
        await sauce.hist.refreshRequest(athlete.id);
    });
    $modal.on('dialogclose', () => {
        for (const [event, cb] of Object.entries(listeners)) {
            syncController.removeEventListener(event, cb);
        }
    });
    if (initiallyEnabled) {
        await Promise.all([updateSyncCounts(), updateSyncTimes()]);
        if (await syncController.isActiveSync()) {
            setActive(true);
        } else {
            $modal.find('.entry.status value').text('Idle');
        }
    } else {
        $modal.addClass('sync-disabled');
    }
    await Promise.all(rendering);
    $modal.dialog('open');
    return $modal;
}
