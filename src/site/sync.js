/* global sauce, jQuery */

sauce.ns('sync', ns => {
    'use strict';

    const controllers = new Map();
    const L = sauce.locale;
    const H = sauce.locale.human;
    const MB = 1024 * 1024;
    const GB = 1024 * MB;


    let _downloadProxyPromise;
    function initDownloadProxy() {
        if (_downloadProxyPromise) {
            return _downloadProxyPromise;
        }
        // See: https://issues.chromium.org/issues/40774955?pli=1
        //
        // With the advent of manifest v3 we have to play games to move large files/arrays
        // around.  The best way is to use an iframe in the same origin as the service worker
        // that can transfer a file through indexeddb (faster than you might think).
        //
        // If nothing changes with the above chromium issue (likely) we might move to using
        // this method for more things as it does avoid having to shuffle data through
        // the very limited ext onMessage/sendMessage IPC that is bound by string size
        // limits (very slow).
        _downloadProxyPromise = new Promise((resolve, reject) => {
            const frame = document.createElement('iframe');
            frame.style.setProperty('width', 0);
            frame.style.setProperty('height', 0);
            frame.style.setProperty('opacity', 0);
            frame.style.setProperty('visibility', 'hidden');
            frame.addEventListener('load', ev => {
                resolve({
                    download(options) {
                        frame.contentWindow.postMessage({op: 'download', options}, '*');
                    }
                });
            });
            frame.src = sauce.getURL(`/pages/_download_proxy.html`);
            document.body.append(frame);
        });
        return _downloadProxyPromise;
    }


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
            const active = ev.data.active;
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
        controller.addEventListener('progress', ev => {
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
        controller.isSyncActive().then(x => $btn.toggleClass('sync-active', x));
        return controller;
    }


    function restoreData(progressFn) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.sbin,.sbinz';
        input.multiple = true;
        input.style.display = 'none';
        const dataEx = new sauce.hist.DataExchange();

        async function onStart() {
            const jobs = await import(sauce.getURL('/src/common/jscoop/jobs.mjs'));
            const importingQueue = new jobs.UnorderedWorkQueue({maxPending: 12});
            const files = input.files;
            let fileNum = 0;
            const fflate = await import(sauce.getURL('src/common/fflate.mjs'));
            let totalBundles = 0;
            for (const f of files) {
                const gunzip = new fflate.Gunzip();
                fileNum++;
                if (progressFn) {
                    progressFn('reading', fileNum, files.length, 0);
                }
                const stride = 250;  // ~10MB
                let pendingBuf;
                let bytesRead = 0;
                for await (const ab of sauce.streamBlobAsArrayBuffers(f)) {
                    bytesRead += ab.byteLength;
                    if (progressFn) {
                        progressFn('reading', fileNum, files.length, bytesRead / f.size);
                    }
                    let buf;
                    if (f.name.endsWith('.sbinz')) {
                        gunzip.ondata = b => buf = b;
                        gunzip.push(new Uint8Array(ab));
                        if (!buf) {
                            // nothing available for decode yet.
                            console.warn("decompressor needs more data");
                            continue;
                        }
                    } else {
                        buf = ab;
                    }
                    const finalBuf = pendingBuf ? sauce.concatBuffers(pendingBuf, buf) : buf;
                    const [batch, remBuf] = sauce.decodeBundle(finalBuf);
                    for (let i = 0; i < batch.length; i += stride) {
                        await importingQueue.put(dataEx.import(batch.slice(i, i + stride)));
                    }
                    totalBundles += batch.length;
                    pendingBuf = remBuf;
                }
                let i = 1;
                for await (const x of importingQueue) {
                    void x;
                    const progress = Math.min(i++ * stride, totalBundles);
                    if (progressFn) {
                        progressFn('importing', fileNum, files.length, progress / totalBundles);
                    }
                }
            }
            await dataEx.flush();
        }

        // No way to detect if user cancels on all devices, so return
        // two promises one for if we actually start and one for fulfillement.
        let started;
        const completed = new Promise((resCompleted, rejCompleted) => {
            started = new Promise(resStarted => {
                input.addEventListener('change', () => {
                    resStarted();
                    onStart().then(resCompleted).catch(rejCompleted).finally(() => dataEx.finish());
                });
            });
        });
        document.body.appendChild(input);
        input.click();
        input.remove();
        return {started, completed};
    }


    async function backupData(athlete, progressFn) {
        const athletes = athlete ? [athlete] : await sauce.hist.getEnabledAthletes();
        const date = (new Date()).toISOString().replace(/[-T:]/g, '_').split('.')[0];
        const name = athlete ? safeName(athlete.name) : 'SauceBackup';
        const label = `${name}-${date}`;
        return await backupAthletesData(label, athletes, progressFn);
    }


    async function backupAthletesData(label, athletes, progressFn) {
        let compressedBundles;
        const fflate = await import(sauce.getURL('src/common/fflate.mjs'));
        let page = 1;
        const mem = navigator.deviceMemory || 4;
        // XXX Ick...
        let gzip;
        const initGzip = () => {
            gzip = new fflate.Gzip();
            gzip.ondata = (chunk, isLast) => {
                compressedBundles = compressedBundles ? sauce.concatBuffers(compressedBundles, chunk) : chunk;
                if (isLast) {
                    const blob = new Blob([compressedBundles]);
                    compressedBundles = null;
                    initGzip();
                    sauce.ui.downloadBlob(blob, `${label}-${page++}.sbinz`);
                }
            };
        };
        initGzip();
        for (const athlete of athletes) {
            const dataEx = new sauce.hist.DataExchange(athlete.id);
            dataEx.addEventListener('data', ev => {
                gzip.push(sauce.encodeBundle(ev.data));
                if (progressFn) {
                    progressFn(page, compressedBundles.length);
                }
                if (compressedBundles.byteLength >= Math.min(mem * 0.25, 1) * GB) {
                    gzip.push(new Uint8Array(), true);
                }
            });
            await dataEx.export();
        }
        if (compressedBundles) {
            gzip.push(new Uint8Array(), true);
        }
    }


    async function exportActivityFiles(athlete, progressFn, type) {
        const athletes = athlete ? [athlete] : await sauce.hist.getEnabledAthletes();
        for (const x of athletes) {
            await exportAthleteActivityFiles(x, progressFn);
        }
    }


    function safeName(name) {
        return name.replace(/[^a-zA-Z0-9_-]/g, '');
    }


    async function exportAthleteActivityFiles(athlete, progressFn, type) {
        const date = (new Date()).toISOString().replace(/[-T:]/g, '_').split('.')[0];
        const dataEx = new sauce.hist.DataExchange(athlete.id, {name: `${safeName(athlete.name)}-${date}`});
        const downloadProxy = await initDownloadProxy();
        let fileNum = 1;
        dataEx.addEventListener('file', ev => {
            downloadProxy.download(ev.data);
            fileNum++;
        });
        dataEx.addEventListener('progress', ev => {
            if (progressFn) {
                progressFn(fileNum, ev.data);
            }
        });
        await dataEx.exportActivityFiles();
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
        let athlete = await sauce.hist.getAthlete(id);
        $btn.toggleClass('enabled', !!(athlete && athlete.sync));
        const controller = setupSyncController($btn, id);
        controller.addEventListener('importing-athlete', ev => {
            athlete = ev.data;
            $btn.toggleClass('enabled', !!athlete.sync);
        });
        $btn.on('click', async () => {
            if (!athlete || !athlete.sync) {
                // This is idempotent and will just update ftp and weight with most cur info.
                await sauce.hist.addAthlete({id, ...athleteData});
            }
            await activitySyncDialog(id, controllers.get(id));
        });
        setTimeout(async () => {
            if (athlete && athlete.sync && athlete.syncSettings && !await controller.isSyncActive()) {
                await checkForSyncSettingsUpdates(id);
            }
        } , 1000);
        return $btn;
    }


    async function checkForSyncSettingsUpdates(athleteId) {
        const avail = await sauce.hist.getAvailableSyncChangesets(athleteId);
        if (!avail || !avail.length) {
            return;
        }
        const tpl = await sauce.template.getTemplate('sync-settings-update.html', 'sync_settings');
        const askUser = async (changeset, dryrun) => {
            const deviceId = changeset.data.deviceId;
            const deviceMeta = (await sauce.hist.getDeviceMetaData(deviceId)) || {};
            const makeBody = () => tpl({changeset, dryrun, deviceId, deviceInfo: deviceMeta.data});
            let resolveDone;
            const donePromise = new Promise(r => resolveDone = r);
            const $dialog = sauce.ui.dialog({
                title: await L.getMessage('sync_settings_title'),
                icon: await sauce.ui.getImage('fa/sync-alt-duotone.svg'),
                body: await makeBody(),
                width: 600,
                buttons: [{
                    text: await L.getMessage('sync_settings_maybe_later'),
                    class: 'btn',
                    click: () => void $dialog.dialog('close'),
                }, {
                    text: await L.getMessage('sync_settings_apply'),
                    class: 'btn sauce-positive',
                    click: async () => {
                        $dialog.dialog('close');
                        await sauce.hist.applySyncChangeset(athleteId, changeset);
                    },
                }, {
                    text: await L.getMessage('sync_settings_exclude'),
                    class: 'btn sauce-negative',
                    click: async () => {
                        $dialog.dialog('close');
                        await sauce.hist.addSyncChangesetReceipt(athleteId, changeset);
                    },
                }]
            });
            $dialog.on('click', '.device-name-edit', async () => {
                const $editNameModal = sauce.ui.modal({
                    title: await L.getMessage('sync_settings_edit_device_name'),
                    width: '20em',
                    body: `<input type="text" placeholder="name..." name="device-name"
                                  value="${deviceMeta.data?.name || ''}"/>`,
                    extraButtons: [{
                        text: await L.getMessage('save'),
                        class: 'btn btn-primary',
                        click: async ev => {
                            ev.currentTarget.classList.add('disabled');
                            const name = $editNameModal.find('input[name="device-name"]').val() || null;
                            await sauce.hist.updateDeviceMetaData(deviceId, {name});
                            deviceMeta.data = deviceMeta.data ?? {};
                            deviceMeta.data.name = name;
                            $editNameModal.dialog('close');
                            $dialog.html(await makeBody());
                        },
                    }]
                });
            });
            $dialog.on('dialogclose', () => void resolveDone());
            await donePromise;
        };
        const {changeset, dryrun} = avail[0];
        await askUser(changeset, dryrun);
    }


    async function activitySyncDialog(athleteId, syncController) {
        const locale = await L.getMessagesObject([
            'total', 'imported', 'unavailable', 'processed', 'unprocessable', 'activities',
            'delayed_until', 'title', 'remaining', 'restore_data', 'backup_data', 'export_fit_files',
        ], 'sync_control_panel');
        let athlete = await sauce.hist.getAthlete(athleteId);
        const edited = new Set();
        const {FTPHistoryView, WeightHistoryView} = await import(sauce.getURL('/src/site/data-views.mjs'));
        const tpl = await sauce.template.getTemplate('sync-control-panel.html', 'sync_control_panel');
        const hrZonesTpl = await sauce.template.getTemplate(
            'sync-control-panel-hr-zones.html', 'sync_control_panel');
        const initiallyEnabled = !!athlete.sync;
        const extraButtons = [{
            text: locale.restore_data,
            class: 'btn sauce-restore',
            click: async ev => {
                const btn = ev.currentTarget;
                const origText = btn.textContent;
                const {started, completed} = restoreData((state, fileNum, numFiles, progress) => {
                    const fileDesc = numFiles > 1 ?
                        `file ${fileNum} of ${numFiles}` : 'file';
                    if (state === 'reading') {
                        btn.textContent = `Reading ${fileDesc}: ${H.number(progress * 100)}%`;
                    } else if (state === 'importing') {
                        btn.textContent = `Importing ${fileDesc}: ${H.number(progress * 100)}%`;
                    } else {
                        console.error("unhandled progress state");
                    }
                });
                await started;  // Will not resolve if they hit cancel.
                btn.classList.add('sauce-loading', 'disabled');
                try {
                    await completed;
                } finally {
                    btn.textContent = origText;
                    btn.classList.remove('sauce-loading', 'disabled');
                }
            }
        }, {
            text: locale.backup_data,
            class: 'btn sauce-backup',
            click: async ev => {
                const btn = ev.currentTarget;
                const origText = btn.textContent;
                btn.classList.add('sauce-loading', 'disabled');
                try {
                    await backupData(athlete, (page, size) =>
                        btn.textContent = `Creating file ${page}: ${H.number(size / MB)}MB`);
                } finally {
                    btn.textContent = origText;
                    btn.classList.remove('sauce-loading', 'disabled');
                }
            }
        }];
        if (!sauce.isSafari()) {
            extraButtons.push({
                text: locale.export_fit_files,
                class: 'btn sauce-export-activity-files',
                click: async ev => {
                    const btn = ev.currentTarget;
                    const origText = btn.textContent;
                    btn.classList.add('sauce-loading', 'disabled');
                    try {
                        await exportActivityFiles(athlete, (fileNum, size) =>
                            btn.textContent = `Creating ZIP file ${fileNum}: ${H.number(size / MB)}MB`);
                    } finally {
                        btn.textContent = origText;
                        btn.classList.remove('sauce-loading', 'disabled');
                    }
                }
            });
        }
        const $modal = sauce.ui.modal({
            title: `${locale.title} - ${athlete.name}`,
            icon: await sauce.ui.getImage('fa/sync-alt-duotone.svg'),
            dialogClass: 'sauce-sync-athlete-dialog',
            body: await tpl({athlete}),
            flex: true,
            width: '60em',
            height: 720,
            autoDestroy: true,
            autoOpen: false,
            closeOnMobileBack: true,
            extraButtons,
        });
        const $buttons = $modal.siblings('.ui-dialog-buttonpane');
        const $logs = $modal.find('section.sync-logs .logs');
        const $jobStatus = $modal.find('.entry.status .job-status');
        $modal.find('.download-logs').on('click', async ev => {
            const fullLogs = await syncController.getLogs({limit: null});
            fullLogs.reverse();
            const blob = new Blob([fullLogs.map(x =>
                `${(new Date(x.ts)).toISOString()} ` +
                `[${x.level.toUpperCase().padEnd(5, ' ')}] ` +
                `${x.message}`).join('\n')]);
            sauce.ui.downloadBlob(blob, `sauce-sync-${athlete.id}.log`);
        });
        $modal.find('.maximize-logs').on('click', ev => {
            ev.currentTarget.closest('section').classList.add('maximized');
            ev.currentTarget.parentElement.querySelector('.restore-logs').classList.remove('hidden');
            ev.currentTarget.classList.add('hidden');
        });
        $modal.find('.restore-logs').on('click', ev => {
            ev.currentTarget.closest('section').classList.remove('maximized');
            ev.currentTarget.parentElement.querySelector('.maximize-logs').classList.remove('hidden');
            ev.currentTarget.classList.add('hidden');
        });
        let syncJobStatus;

        function formatLog(log) {
            return `
                <div class="log-entry" data-level="${log.level}">
                    <div class="time">${H.datetime(log.ts, {concise: true, style: 'short'})}</div>
                    <div class="level">${log.level.toUpperCase()}</div>
                    <div class="message">${sauce.template.escape(log.message)}</div>
                </div>`;
        }

        const curLogs = [];
        function appendLogs(records) {
            const newLogs = [];
            let fullPaint;
            const descRecords = Array.from(records).reverse();
            for (const record of descRecords) {
                if (!curLogs.find(x => x.ts === record.ts && x.message === record.message)) {
                    if (curLogs.length && curLogs[curLogs.length - 1].ts > record.ts) {
                        fullPaint = true;
                    }
                    curLogs.push(record);
                    newLogs.push(record);
                }
            }
            if (fullPaint) {
                console.warn("Unexpected full paint of logs required...");
                curLogs.sort((a, b) => a.ts - b.ts);
                $logs.html(Array.from(curLogs).reverse().map(formatLog).join('\n'));
            } else {
                $logs.prepend(newLogs.reverse().map(formatLog).join('\n'));
            }
        }

        function setJobStatus(status) {
            syncJobStatus = status;
            if (status && !['processing', 'complete'].includes(status)) {
                $modal.find('.entry.synced progress').removeAttr('value');  // make it indeterminate
            }
            $jobStatus.text(status || '');
        }


        async function updateHRZones() {
            $modal.find('.hr-zones-panel').html(await hrZonesTpl({athlete}));
        }

        let _ftpView, _weightView;
        async function setAthlete(_athlete) {
            athlete = _athlete;
            $modal.toggleClass('sync-disabled', !athlete.sync);
            $modal.find('input[name="enable"]')[0].checked = !!athlete.sync;
            _ftpView = new FTPHistoryView({
                athlete,
                el: $modal.find('.entry.history.ftp')
            });
            _weightView = new WeightHistoryView({
                athlete,
                el: $modal.find('.entry.history.weight')
            });
            syncController.getLogs({limit: 1000}).then(appendLogs);  // bg okay
            await Promise.all([_ftpView.render(), _weightView.render(), updateHRZones()]);
        }

        const bgRender = setAthlete(athlete);

        async function updateSyncCounts(counts) {
            counts = counts || await sauce.hist.activityCounts(athlete.id);
            const total = counts.total - counts.unavailable;
            const synced = counts.processed;
            const details = [
                [locale.total, H.number(counts.total)],
                [locale.imported, H.number(counts.imported)],
                [locale.unavailable, H.number(counts.unavailable)],
                [locale.remaining, H.number(counts.total - counts.unavailable - counts.imported)],
                [locale.processed, H.number(counts.processed)],
                [locale.unprocessable, H.number(counts.unprocessable)]
            ];
            const $synced = $modal.find('.entry.synced');
            $synced.attr('title', details.map(x => x.join(': ')).join('\n'));
            if (!syncJobStatus || ['processing', 'complete'].includes(syncJobStatus)) {
                $synced.find('progress').attr('value', synced / total);
            }
            if (synced === total) {
                $synced.find('.text').html(`${synced.toLocaleString()} ${locale.activities}`);
            } else {
                $synced.find('.text').html(
                    `${synced.toLocaleString()} of ${total.toLocaleString()} ${locale.activities}`);
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
        async function setActive(active, {passive}={}) {
            clearInterval(rateLimiterInterval);
            if (active) {
                $modal.addClass('sync-active');
                $buttons.addClass('sync-active');
                $modal.removeClass('has-error');
                $modal.find('.entry.status value').text('Running');
                $modal.find('.entry.last-sync value').empty();
                $modal.find('.entry.next-sync value').empty();
                $modal.find('.entry.synced .text').empty();
                setJobStatus(await syncController.getStatus());
                rateLimiterInterval = setInterval(async () => {
                    const resumes = await syncController.rateLimiterResumes();
                    if (resumes && resumes - Date.now() > 10000) {
                        const resumesLocale = H.datetime(resumes, {concise: true});
                        $modal.find('.entry.status value')
                            .text(`${locale.delayed_until}: ${resumesLocale}`);
                    }
                }, 2000);
            } else {
                $modal.removeClass('sync-active');
                $buttons.removeClass('sync-active');
                $modal.find('.entry.status value').text('Idle');
                // Pull in latests athlete values like ftp, weight, hr zones..
                athlete = await sauce.hist.getAthlete(athleteId);
                await updateHRZones();
            }
            if (!passive) {
                await Promise.all([updateSyncCounts(), updateSyncTimes()]);
            }
        }

        const listeners = {
            "active": ev => void setActive(ev.data.active),
            "error": ev => {
                $modal.addClass('has-error');
                $modal.find('.entry.status value').text(ev.data.error);
            },
            "progress": ev => void updateSyncCounts(ev.data.counts),
            "enable": ev => void ($modal.find('input[name="enable"]')[0].checked = true),
            "disable": ev => void ($modal.find('input[name="enable"]')[0].checked = false),
            "importing-athlete": ev => void setAthlete(ev.data),
            "log": ev => void appendLogs([ev.data]),
            "status": ev => void setJobStatus(ev.data),
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
        });
        $modal.on('input', '.sync-settings input[data-athlete-bool]', async ev => {
            const key = ev.currentTarget.dataset.athleteBool;
            edited.add(key);
            const enabled = ev.currentTarget.checked;
            const entry = ev.currentTarget.closest('.entry');
            if (!ev.currentTarget.classList.contains('sub-option')) {
                entry.querySelectorAll('input.sub-option').forEach(x => x.disabled = !enabled);
            }
            athlete[key] = enabled;
            await sauce.hist.updateAthlete(athlete.id, athlete);
        });
        $modal.on('click', '.perf-promo .btn.enable', ev => void $modal.find('input[name="enable"]').click());
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
            $buttons.removeClass('sync-active');
            syncController.cancel();
        });
        $modal.on('click', '.sync-recompute.btn', async ev => {
            setActive(true, {passive: true});  // responsive UI feedback
            await sauce.hist.invalidateAthleteSyncState(athlete.id, 'local');
        });
        $modal.on('click', '.sync-hr-zones.btn', async ev => {
            setActive(true, {passive: true});  // responsive UI feedback
            await sauce.hist.updateAthlete(athlete.id, {hrZonesTS: null});
            athlete.hrZonesTS = null;
            await updateHRZones();
            await sauce.hist.invalidateAthleteSyncState(athlete.id, 'local', 'athlete-settings');
        });
        $modal.on('click', '.sync-start.btn', async ev => {
            setActive(true, {passive: true});  // responsive UI feedback
            await sauce.hist.syncAthlete(athlete.id);
        });
        $modal.on('dialogclose', async () => {
            for (const [event, cb] of Object.entries(listeners)) {
                syncController.removeEventListener(event, cb);
            }
            if (edited.size) {
                const affectsStreams = [
                    'disableRunWatts',
                    'estRunWatts',
                    'estCyclingWatts',
                    'estCyclingPeaks'
                ];
                const proc = affectsStreams.some(x => edited.has(x)) ? 'extra-streams' : 'athlete-settings';
                await sauce.hist.invalidateAthleteSyncState(athlete.id, 'local', proc);
            }
        });
        if (initiallyEnabled) {
            await setActive(await syncController.isSyncActive());
        } else {
            $modal.addClass('sync-disabled');
        }
        await bgRender;
        $modal.dialog('open');
        return $modal;
    }


    return {
        createSyncButton,
        activitySyncDialog,
        backupData,
        restoreData,
        exportActivityFiles,
    };
});
