/* global sauce */


export async function activitySyncDialog(athlete, syncController) {
    const template = await sauce.template.getTemplate('sync-control-panel.html', 'sync_control_panel');
    const state = {
        enabled: !!athlete.sync,
        dirty: {},
    };
    const $modal = sauce.modal({
        title: `Activity Sync Control Panel - ${athlete.name}`,
        icon: await sauce.images.asText('fa/sync-alt-duotone.svg'),
        dialogClass: 'sauce-sync-athlete-dialog',
        autoOpen: false,  // lazy render
        flex: true,
        width: '35em',
        autoDestroy: true,
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
                ev.currentTarget.classList.add('sauce-loading', 'disabled');
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
                    ev.currentTarget.classList.remove('sauce-loading', 'disabled');
                }
            }
        }]
    });

    async function render() {
        const f = sauce.locale.weightFormatter;
        const weightConvert = f.convert.bind(f);
        $modal.html(await template(Object.assign({
            athlete,
            weightUnit: sauce.locale.weightFormatter.shortUnitKey(),
            weightConvert,
        }, state)));
        if (!state.opened) {
            $modal.dialog('open');
            state.opened = true;
        }
        if (state.enabled) {
            await Promise.all([updateSyncCounts(), updateSyncTimes()]);
            if (await syncController.isActiveSync()) {
                setActive();
            } else {
                $modal.find('.entry.status value').text('Idle');
            }
        } else {
            $modal.addClass('sync-disabled');
        }
    }

    async function updateSyncCounts(counts) {
        counts = counts || state.counts || (state.counts = await sauce.hist.activityCounts(athlete.id));
        const synced = counts.processed;
        const total = counts.total - counts.unavailable - counts.unprocessable;
        $modal.find('.entry.synced progress').attr('value', synced / total);
        if (synced === total) {
            $modal.find('.entry.synced .text').html(`100% <small>(${synced.toLocaleString()} activities)</small>`);
        } else {
            $modal.find('.entry.synced .text').html(`${synced.toLocaleString()} of ${total.toLocaleString()} activities`);
        }
    }

    async function updateSyncTimes() {
        const [lastSync, nextSync] = await Promise.all([syncController.lastSync(), syncController.nextSync()]);
        $modal.find('.entry.last-sync value').text(lastSync ? (new Date(lastSync).toLocaleString()) : '');
        $modal.find('.entry.next-sync value').text(nextSync ? (new Date(nextSync).toLocaleString()) : '');
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
                $modal.find('.entry.status value').text(`Suspended until: ${resumesLocale}`);
            }
        }, 2000);
    }

    const listeners = {
        start: ev => void setActive(),
        stop: async ev => {
            clearInterval(rateLimiterInterval);
            $modal.removeClass('sync-active');
            $modal.find('.entry.status value').text('Idle');
            await Promise.all([updateSyncCounts(), updateSyncTimes()]);
        },
        error: async ev => {
            clearInterval(rateLimiterInterval);
            $modal.removeClass('sync-active');
            $modal.find('.entry.status value').text('Error');
            await updateSyncTimes();
        },
        progress: ev => void updateSyncCounts(ev.data.counts),
        enable: ev => void ($modal.find('input[name="enable"]')[0].checked = true),
        disable: ev => void ($modal.find('input[name="enable"]')[0].checked = false),
    };
    for (const [event, cb] of Object.entries(listeners)) {
        syncController.addEventListener(event, cb);
    }

    $modal.on('input', 'input[name="enable"]', async ev => {
        state.enabled = ev.currentTarget.checked;
        if (state.enabled) {
            await Promise.all([updateSyncCounts(), updateSyncTimes()]);
            await sauce.hist.enableAthlete(athlete.id);
        } else {
            await sauce.hist.disableAthlete(athlete.id);
        }
        $modal.toggleClass('sync-disabled', !state.enabled);
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
        await sauce.hist.invalidateSyncState(athlete.id, 'local');
    });
    $modal.on('click', '.sync-start.btn', async ev => {
        ev.preventDefault();
        $modal.addClass('sync-active');
        await sauce.hist.refreshRequest(athlete.id);
    });
    $modal.on('click', '.entry-delete.btn', async ev => {
        ev.preventDefault();
        const history = ev.currentTarget.closest('[data-type]');
        const type = history.dataset.type;
        const entry = ev.currentTarget.closest('.entry');
        const index = Number(entry.dataset.index);
        entry.remove();
        const data = athlete[type + 'History'];
        data.splice(index, 1);
        if (!state.dirty[type]) {
            state.dirty[type] = true;
            history.classList.add('dirty');
        }
    });
    $modal.on('click', '.entry-add.btn', async ev => {
        ev.preventDefault();
        const type = ev.currentTarget.closest('[data-type]').dataset.type;
        if (type === 'ftp') {
            athlete.ftpHistory.unshift({ts: Date.now()});
        } else {
            athlete.weightHistory.unshift({ts: Date.now()});
        }
        state.dirty[type] = true;
        await render();
    });
    $modal.on('input', '.entry.history input', ev => {
        const history = ev.currentTarget.closest('[data-type]');
        const type = history.dataset.type;
        const data = athlete[type + 'History'];
        const entry = ev.currentTarget.closest('.entry');
        const index = Number(entry.dataset.index);
        const ts = (new Date(entry.querySelector('[type="date"]').value)).getTime();
        const rawValue = entry.querySelector('[type="number"]').value;
        let value = rawValue ? Number(rawValue) : NaN;
        if (type === 'weight' && !isNaN(value)) {
            value = sauce.locale.weightUnconvert(value);
        }
        data[index] = {ts, value};
        if (!state.dirty[type]) {
            state.dirty[type] = true;
            history.classList.add('dirty');
        }
    });
    $modal.on('click', '.entry.history .save.btn', async ev => {
        ev.preventDefault();
        const history = ev.currentTarget.closest('[data-type]');
        const type = history.dataset.type;
        const data = athlete[type + 'History'].filter(x => !isNaN(x.ts) && !isNaN(x.value));
        const clean = await sauce.hist.setAthleteHistoryValues(athlete.id, type, data);
        athlete[type + 'History'] = clean;
        state.dirty[type] = false;
        await render();
    });
    $modal.on('dialogclose', () => {
        for (const [event, cb] of Object.entries(listeners)) {
            syncController.removeEventListener(event, cb);
        }
    });
    if (state.enabled) {
        await Promise.all([updateSyncCounts(), updateSyncTimes()]);
        if (await syncController.isActiveSync()) {
            setActive();
        } else {
            $modal.find('.entry.status value').text('Idle');
        }
    } else {
        $modal.addClass('sync-disabled');
    }
    await render();
}

