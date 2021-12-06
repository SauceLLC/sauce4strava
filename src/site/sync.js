/* global sauce, jQuery */

sauce.ns('sync', ns => {
    'use strict';

    const controllers = new Map();
    const L = sauce.locale;
    const H = sauce.locale.human;


    function setupSyncController($btn, id) {
        let statusTimeout;
        let syncError;
        const $status = $btn.find('.sauce-sync-status');
        if (!controllers.has(id)) {
            controllers.set(id, new sauce.hist.SyncController(id));
        }
        const controller = controllers.get(id);

        function setStatus(msg, options={}) {
            clearTimeout(statusTimeout);
            $status.html(msg);
            if (options.timeout) {
                statusTimeout = setTimeout(() => $status.empty(), options.timeout);
            }
        }

        controller.addEventListener('active', ev => {
            const active = ev.data;
            $btn.toggleClass('sync-active', active);
            if (active) {
                syncError = null;
                setStatus('Starting sync...');
            } else if (!syncError) {
                setStatus('Sync completed', {timeout: 5000});
            }
        });
        controller.addEventListener('error', ev => {
            setStatus(`Sync error: ${ev.data.error}`);
        });
        controller.addEventListener('progress', async ev => {
            const counts = ev.data.counts;
            const synced = counts.processed;
            const total = counts.total - counts.unavailable - counts.unprocessable;
            setStatus(`${synced.toLocaleString()}/${total.toLocaleString()}`);
        });
        controller.addEventListener('enable', ev => {
            $btn.addClass('enabled');
            setStatus('Sync enabled', {timeout: 5000});
        });
        controller.addEventListener('disable', ev => {
            $btn.removeClass('enabled sync-active');
            setStatus('Sync disabled', {timeout: 5000});
        });
        controller.isActiveSync().then(x => $btn.toggleClass('sync-active', x));
    }


    async function createSyncButton(id, athleteData, options={}) {
        if (athleteData && !athleteData.name) {
            throw new TypeError('athleteData.name is required');
        }
        await sauce.proxy.connected;
        await sauce.locale.init();
        if (options.syncController) {
            controllers.set(id, options.syncController);
        }
        const tpl = await sauce.template.getTemplate('sync-button.html');
        const $btn = jQuery(await tpl({status: !options.noStatus}));
        const athlete = await sauce.hist.getAthlete(id);
        $btn.toggleClass('enabled', !!(athlete && athlete.sync));
        setupSyncController($btn, id);
        $btn.on('click', async () => {
            if (!athlete && !(await sauce.hist.getAthlete(id))) {
                await sauce.hist.addAthlete({id, ...athleteData});
            }
            await activitySyncDialog(id, controllers.get(id));
            sauce.report.event('AthleteSync', 'ui-button', 'show-dialog');
        });
        return $btn;
    }


    async function activitySyncDialog(athleteId, syncController) {
        const locale = await L.getMessagesObject([
            'total', 'imported', 'unavailable', 'processed', 'unprocessable', 'activities',
            'delayed_until', 'title', 'remaining',
        ], 'sync_control_panel');
        let athlete = await sauce.hist.getAthlete(athleteId);
        const {FTPHistoryView, WeightHistoryView} = await sauce.getModule('/src/site/data-views.mjs');
        const tpl = await sauce.template.getTemplate('sync-control-panel.html', 'sync_control_panel');
        const hrZonesTpl = await sauce.template.getTemplate('sync-control-panel-hr-zones.html',
            'sync_control_panel');
        const initiallyEnabled = !!athlete.sync;
        const $modal = sauce.modal({
            title: `${locale.title} - ${athlete.name}`,
            icon: await sauce.images.asText('fa/sync-alt-duotone.svg'),
            dialogClass: 'sauce-sync-athlete-dialog',
            body: await tpl({
                athlete,
                enabled: initiallyEnabled
            }),
            flex: true,
            width: '60em',
            autoDestroy: true,
            autoOpen: false,
            closeOnMobileBack: true,
            extraButtons: [{
                text: 'Import Data',
                click: ev => {
                    sauce.report.event('AthleteSync', 'ui-button', 'import');
                    const btn = ev.currentTarget;
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = '.sbin';
                    input.multiple = true;
                    input.style.display = 'none';
                    input.addEventListener('change', async ev => {
                        const jobs = await sauce.getModule('/src/common/jscoop/jobs.js');
                        const importingQueue = new jobs.UnorderedWorkQueue({maxPending: 12});
                        const files = input.files;
                        const dataEx = new sauce.hist.DataExchange();
                        const origText = btn.textContent;
                        btn.classList.add('sauce-loading', 'disabled');
                        try {
                            let fileNum = 0;
                            for (const f of files) {
                                fileNum++;
                                const fileDesc = files.length > 1 ?
                                    `file ${fileNum} of ${files.length}` : 'file';
                                btn.textContent = `Reading ${fileDesc}...`;
                                const ab = await sauce.blobToArrayBuffer(f);
                                const batch = sauce.decodeBundle(ab);
                                const stride = 250;  // ~10MB
                                for (let i = 0; i < batch.length; i += stride) {
                                    importingQueue.put(dataEx.import(batch.slice(i, i + stride)));
                                }
                                let i = 1;
                                for await (const x of importingQueue) {
                                    void x;
                                    const progress = Math.min(i++ * stride, batch.length);
                                    btn.textContent = `Importing ${fileDesc}: ${H.number(progress / batch.length * 100)}%`;
                                }
                            }
                            await dataEx.flush();
                        } finally {
                            btn.textContent = origText;
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
                    sauce.report.event('AthleteSync', 'ui-button', 'export');
                    let bigBundle;
                    let page = 1;
                    const mem = navigator.deviceMemory || 4;
                    const date = (new Date()).toISOString().replace(/[-T:]/g, '_').split('.')[0];
                    const dl = () => {
                        sauce.downloadBlob(new Blob([bigBundle]), `${athlete.name}-${date}-${page++}.sbin`);
                        bigBundle = null;
                    };
                    const btn = ev.currentTarget;
                    const origText = btn.textContent;
                    btn.classList.add('sauce-loading', 'disabled');
                    const MB = 1024 * 1024;
                    const GB = 1024 * MB;
                    try {
                        const dataEx = new sauce.hist.DataExchange(athlete.id);
                        dataEx.addEventListener('data', async ev => {
                            const bundle = sauce.encodeBundle(ev.data);
                            bigBundle = bigBundle ? sauce.concatBundles(bigBundle, bundle) : bundle;
                            btn.textContent = `Creating file ${page}: ${H.number(bigBundle.byteLength / MB)}MB`;
                            if (bigBundle.byteLength > Math.min(mem * 0.25, 1) * GB) {
                                dl();
                            }
                        });
                        await dataEx.export();
                        dl();
                    } finally {
                        btn.textContent = origText;
                        btn.classList.remove('sauce-loading', 'disabled');
                    }
                }
            }]
        });
        const ftpHistView = new FTPHistoryView({
            athlete,
            el: $modal.find('.entry.history.ftp')
        });
        const weightHistView = new WeightHistoryView({
            athlete,
            el: $modal.find('.entry.history.weight')
        });

        async function updateHRZones() {
            $modal.find('.hr-zones').html(await hrZonesTpl({athlete}));
        }

        const rendering = [ftpHistView.render(), weightHistView.render(), updateHRZones()];

        async function updateSyncCounts(counts) {
            counts = counts || await sauce.hist.activityCounts(athlete.id);
            const total = counts.total - counts.unavailable;
            const synced = counts.processed;
            const title =
                `${locale.total}: ${counts.total}\n` +
                `${locale.imported}: ${counts.imported}\n` +
                `${locale.unavailable}: ${counts.unavailable}\n` +
                `${locale.remaining}: ${counts.total - counts.unavailable - counts.imported}\n` +
                `${locale.processed}: ${counts.processed}\n` +
                `${locale.unprocessable}: ${counts.unprocessable}\n`;
            const $synced = $modal.find('.entry.synced');
            $synced.attr('title', title);
            $synced.find('progress').attr('value', synced / total);
            if (synced === total) {
                $synced.find('.text').html(`100% | ${synced.toLocaleString()} ${locale.activities}`);
            } else {
                $synced.find('.text').html(`${synced.toLocaleString()} of ${total.toLocaleString()} ${locale.activities}`);
            }
        }

        async function updateSyncTimes() {
            const [lastSync, nextSync] = await Promise.all([
                syncController.lastSync(),
                syncController.nextSync()
            ]);
            $modal.find('.entry.last-sync value').text(lastSync ? H.datetime(lastSync) : '');
            $modal.find('.entry.next-sync value').text(nextSync ? H.datetime(nextSync) : '');
        }

        let rateLimiterInterval;
        async function setActive(active) {
            if (active) {
                $modal.addClass('sync-active');
                $modal.removeClass('has-error');
                $modal.find('.entry.status value').text('Running...');
                $modal.find('.entry.last-sync value').empty();
                $modal.find('.entry.next-sync value').empty();
                $modal.find('.entry.synced progress').removeAttr('value');
                $modal.find('.entry.synced .text').empty();
                clearInterval(rateLimiterInterval);
                rateLimiterInterval = setInterval(async () => {
                    const resumes = await syncController.rateLimiterResumes();
                    if (resumes && resumes - Date.now() > 10000) {
                        const resumesLocale = H.datetime(resumes, {concise: true});
                        $modal.find('.entry.status value').text(`${locale.delayed_until}: ${resumesLocale}`);
                    }
                }, 2000);
            } else {
                clearInterval(rateLimiterInterval);
                $modal.removeClass('sync-active');
                $modal.find('.entry.status value').text('Idle');
                athlete = await sauce.hist.getAthlete(athleteId);
                await Promise.all([updateSyncCounts(), updateSyncTimes(), updateHRZones()]);
            }
        }

        const listeners = {
            active: ev => void setActive(ev.data),
            error: async ev => {
                $modal.addClass('has-error');
                $modal.find('.entry.status value').text(ev.data.error);
            },
            progress: ev => void updateSyncCounts(ev.data.counts),
            enable: ev => void ($modal.find('input[name="enable"]')[0].checked = true),
            disable: ev => void ($modal.find('input[name="enable"]')[0].checked = false),
        };
        for (const [event, cb] of Object.entries(listeners)) {
            syncController.addEventListener(event, cb);
        }

        function onPromoKeyDown(ev) {
            if (ev.key === 'Escape') {
                ev.preventDefault();
                ev.stopPropagation();
                removeEventListener('keydown', onPromoKeyDown, {capture: true});
                $modal.find('.perf-promo').removeClass('expanded');
            }
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
            sauce.report.event('AthleteSync', 'ui-button', enabled ? 'enable' : 'disable');
        });
        $modal.on('click', '.perf-promo .btn.enable', async ev => {
            $modal.find('input[name="enable"]').click();
        });
        $modal.on('click', '.perf-promo .nav-left', ev => {
            const $promo = jQuery(ev.currentTarget.closest('.perf-promo'));
            const $selected = $promo.find('.selected');
            $selected.removeClass('selected').prev().addClass('selected');
            const isFirst = $promo.find('.nav-placement .selected').is(':first-child');
            const isLast = $promo.find('.nav-placement .selected').is(':last-child');
            $promo.find('.nav-left').toggleClass('hidden', isFirst);
            $promo.find('.nav-right').toggleClass('hidden', isLast);
        });
        $modal.on('click', '.perf-promo .nav-right', ev => {
            const $promo = jQuery(ev.currentTarget.closest('.perf-promo'));
            const $selected = $promo.find('.selected');
            $selected.removeClass('selected').next().addClass('selected');
            const isFirst = $promo.find('.nav-placement .selected').is(':first-child');
            const isLast = $promo.find('.nav-placement .selected').is(':last-child');
            $promo.find('.nav-left').toggleClass('hidden', isFirst);
            $promo.find('.nav-right').toggleClass('hidden', isLast);
        });
        $modal.on('click', '.perf-promo .slides img', ev => {
            const $el = $modal.find('.perf-promo').toggleClass('expanded');
            if ($el.hasClass('expanded')) {
                addEventListener('keydown', onPromoKeyDown, {capture: true});
            } else {
                removeEventListener('keydown', onPromoKeyDown, {capture: true});
            }
        });
        $modal.on('click', '.perf-promo .btn.zoom-out', ev => {
            $modal.find('.perf-promo').removeClass('expanded');
            removeEventListener('keydown', onPromoKeyDown, {capture: true});
        });
        $modal.on('click', '.sync-stop.btn', ev => {
            $modal.removeClass('sync-active');
            syncController.cancel();
            sauce.report.event('AthleteSync', 'ui-button', 'stop');
        });
        $modal.on('click', '.sync-recompute.btn', async ev => {
            $modal.addClass('sync-active');
            $modal.find('.entry.synced progress').removeAttr('value');  // make it indeterminate
            $modal.find('.entry.synced .text').empty();
            await sauce.hist.invalidateAthleteSyncState(athlete.id, 'local');
            sauce.report.event('AthleteSync', 'ui-button', 'recompute');
        });
        $modal.on('click', '.sync-hr-zones.btn', async ev => {
            $modal.addClass('sync-active');
            $modal.find('.entry.synced progress').removeAttr('value');  // make it indeterminate
            $modal.find('.entry.synced .text').empty();
            await sauce.hist.updateAthlete(athlete.id, {hrZonesTS: null});
            athlete.hrZonesTS = null;
            await updateHRZones();
            await sauce.hist.invalidateAthleteSyncState(athlete.id, 'local', 'athlete-settings');
            sauce.report.event('AthleteSync', 'ui-button', 'hr-zones');
        });
        $modal.on('click', '.sync-start.btn', async ev => {
            $modal.addClass('sync-active');
            await sauce.hist.syncAthlete(athlete.id);
            sauce.report.event('AthleteSync', 'ui-button', 'start');
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


    return {
        createSyncButton,
        activitySyncDialog,
    };
});
