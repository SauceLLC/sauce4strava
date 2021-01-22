/* global sauce */


export async function activitySyncDialog(athlete, syncController) {
    const enabled = athlete.sync;
    const template = await sauce.template.getTemplate('sync-control-panel.html', 'sync_control_panel');
    const $modal = sauce.modal({
        title: `Activity Sync Control Panel - ${athlete.name}`,
        icon: await sauce.images.asText('fa/sync-alt-duotone.svg'),
        dialogClass: 'sauce-sync-athlete-dialog',
        body: await template({
            enabled,
            athlete,
            weightUnit: sauce.locale.weightFormatter.shortUnitKey(),
        }),
        flex: true,
        width: '40em',
        autoDestroy: true,
        closeOnMobileBack: true,
        extraButtons: [{
            text: 'Cancel Sync',
            class: 'btn btn-primary sync-cancel',
            click: ev => {
                $modal.removeClass('sync-active');
                syncController.cancel();
            }
        }, {
            text: 'Recompute Activity Metrics',
            class: 'btn btn-primary sync-recompute',
            click: async ev => {
                $modal.addClass('sync-active');
                $modal.find('.entry.synced progress').removeAttr('value');
                $modal.find('.entry.synced .text').empty();
                await sauce.hist.invalidateSyncState(athlete.id, 'local');
            }
        }, {
            text: 'Sync Activity Data',
            class: 'btn btn-primary sync-start',
            click: async ev => {
                $modal.addClass('sync-active');
                await sauce.hist.refreshRequest(athlete.id);
            }
        }, {
            text: 'Import Data',
            click: ev => {
                const btn = ev.target;
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '*.sbin';
                input.multiple = true;
                input.style.display = 'none';
                input.addEventListener('change', async ev => {
                    btn.classList.add('sauce-loading', 'disabled');
                    try {
                        const dataEx = new sauce.hist.DataExchange();
                        for (const f of input.files) {
                            const ab = await sauce.blobToArrayBuffer(f);
                            const batch = sauce.decodeBundle(ab);
                            const stride = 100;  // Stay within String limits.
                            const importing = [];
                            for (let i = 0; i < batch.length; i += stride) {
                                importing.push(dataEx.import(batch.slice(i, i + stride)));
                            }
                            await Promise.all(importing);
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
                ev.target.classList.add('sauce-loading', 'disabled');
                const batch = [];
                let page = 0;
                const dl = () => {
                    sauce.download(new Blob([sauce.encodeBundle(batch)]),
                        `${athlete.name}-${page++}.sbin`);
                    batch.length = 0;
                };
                try {
                    const dataEx = new sauce.hist.DataExchange(athlete.id);
                    dataEx.addEventListener('data', async ev => {
                        for (const x of ev.data) {
                            batch.push(x);
                            if (batch.length > 20000) {
                                dl();
                            }
                        }
                    });
                    await dataEx.export();
                    dl();
                } finally {
                    ev.target.classList.remove('sauce-loading', 'disabled');
                }
            }
        }]
    });
    async function updateSyncCounts(counts) {
        if (!counts) {
            counts = await sauce.hist.activityCounts(athlete.id);
        }
        const synced = counts.processed;
        const total = counts.total - counts.unavailable - counts.unprocessable;
        $modal.find('.entry.synced').attr('title',
            `Synchronized ${synced.toLocaleString()} of ${total.toLocaleString()} activities`);
        $modal.find('.entry.synced progress').attr('value', synced / total);
        const pct = Math.round(synced / total * 100);
        $modal.find('.entry.synced .text').html(`${pct}% <small>(${synced.toLocaleString()} activities)</small>`);
    }
    async function updateSyncTimes() {
        const lastSync = await syncController.lastSync();
        const nextSync = await syncController.nextSync();
        $modal.find('.entry.last-sync value').text(lastSync ? (new Date(lastSync).toLocaleString()): '');
        $modal.find('.entry.next-sync value').text(nextSync ? (new Date(nextSync).toLocaleString()): '');
    }
    let rateLimiterInterval;
    function setActive() {
        $modal.addClass('sync-active');
        $modal.find('.entry.status value').text('Running...');
        $modal.find('.entry.last-sync value').empty();
        $modal.find('.entry.next-sync value').empty();
        $modal.find('.entry.synced progress').removeAttr('value');
        $modal.find('.entry.synced .text').empty();
        clearInterval(rateLimiterInterval);
        rateLimiterInterval = setInterval(async () => {
            const resumes = await syncController.rateLimiterResumes();
            if (resumes && resumes - Date.now() > 10000) {
                const resumesLocale = (new Date(resumes)).toLocaleString();
                $modal.find('.entry.status value').text(`Rate limited until: ${resumesLocale}`);
            }
        }, 5000);
    }
    const $en = $modal.find('input[name="enable"]');
    const listeners = {
        start: ev => void setActive(),
        stop: async ev => {
            clearInterval(rateLimiterInterval);
            $modal.removeClass('sync-active');
            $modal.find('.entry.status value').text('Completed');
            await Promise.all([updateSyncCounts(), updateSyncTimes()]);
        },
        error: async ev => {
            clearInterval(rateLimiterInterval);
            $modal.removeClass('sync-active');
            $modal.find('.entry.status value').text('Error');
            await updateSyncTimes();
        },
        progress: ev => void updateSyncCounts(ev.data.counts),
        enable: ev => void ($en[0].checked = true),
        disable: ev => void ($en[0].checked = false),
    };
    for (const [event, cb] of Object.entries(listeners)) {
        syncController.addEventListener(event, cb);
    }
    if (enabled) {
        await Promise.all([updateSyncCounts(), updateSyncTimes()]);
        if (await syncController.isActiveSync()) {
            setActive();
        } else {
            $modal.find('.entry.status value').text('Idle');
        }
    } else {
        $modal.addClass('sync-disabled');
    }
    $en.on('input', async ev => {
        const en = ev.target.checked;
        if (en) {
            await Promise.all([updateSyncCounts(), updateSyncTimes()]);
            await sauce.hist.enableAthlete(athlete.id);
        } else {
            await sauce.hist.disableAthlete(athlete.id);
        }
        $modal.toggleClass('sync-disabled', !en);
    });
    $modal.on('dialogclose', () => {
        for (const [event, cb] of Object.entries(listeners)) {
            syncController.removeEventListener(event, cb);
        }
    });
}

