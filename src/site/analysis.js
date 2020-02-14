/* global Strava, sauce, jQuery, pageView */

sauce.ns('analysis', async ns => {
    'use strict';

    await sauce.propDefined('pageView');

    let _resolvePrepared;
    const ctx = {
        prepared: new Promise(resolve => void (_resolvePrepared = resolve))
    };

    const tplUrl = sauce.extUrl + 'templates';

    const distanceFormatter = new Strava.I18n.DistanceFormatter();
    const metricDistanceFormatter = new Strava.I18n.DistanceFormatter(
        Strava.I18n.UnitSystemSource.METRIC);
    const imperialDistanceFormatter = new Strava.I18n.DistanceFormatter(
        Strava.I18n.UnitSystemSource.IMPERIAL);
    const elevationFormatter = new Strava.I18n.ElevationFormatter();
    const timeFormatter = new Strava.I18n.TimespanFormatter();
    const paceFormatter = new Strava.I18n.PaceFormatter();
    const weightFormatter = new Strava.I18n.WeightFormatter();

    const minVAMTime = 60;
    const minHRTime = 60;
    const minNPTime = 900;
    const minWattEstTime = 300;

    const metersPerMile = 1609.344;
    const defaultPeakPeriods = [
        {value: 5},
        {value: 15},
        {value: 30},
        {value: 60},
        {value: 120},
        {value: 300},
        {value: 600},
        {value: 900},
        {value: 1200},
        {value: 1800},
        {value: 3600},
    ];
    const defaultPeakDistances = [
        {value: 100},
        {value: 200},
        {value: 400},
        {value: 1000},
        {value: Math.round(metersPerMile)},
        {value: 3000},
        {value: 5000},
        {value: 10000},
        {value: Math.round(metersPerMile * 13.1)},
        {value: Math.round(metersPerMile * 26.2)},
        {value: 50000},
    ];
    const peakIcons = {
        peak_power: 'fa/bolt-duotone.svg',
        peak_np: 'fa/atom-alt-duotone.svg',
        peak_hr: 'fa/heartbeat-duotone.svg',
        peak_vam: 'fa/rocket-launch-duotone.svg',
        peak_pace: 'fa/running-duotone.svg',
        peak_gap: 'fa/hiking-duotone.svg',
    };


    let _fullActivity;
    async function fetchFullActivity() {
        // The initial activity object is not fully loaded for owned' activities.  This routine
        // will return a full activity object if the activity is from the page owner. Note that
        // there are small diffrences, so only use this if needed.
        if (_fullActivity !== undefined) {
            return _fullActivity;
        }
        if (pageView.isOwner()) {
            const activity = new Strava.Labs.Activities.TrainingActivity({id: pageView.activity().id});
            await new Promise((success, error) => activity.fetch({success, error}));
            _fullActivity = activity;
        } else {
            _fullActivity = null;
        }
        return _fullActivity;
    }


    const _attemptedFetch = new Set();
    const _pendingFetches = new Map();
    async function fetchStreams(names) {
        const streams = pageView.streams();
        const attempted = _attemptedFetch;
        const pending = _pendingFetches;
        const available = new Set(Object.keys(streams.availableStreams()));
        const fetched = new Set(streams.requestedTypes);
        const todo = names.filter(x => !attempted.has(x) && !available.has(x) && !fetched.has(x));
        if (todo.length) {
            const waitfor = [];
            const fetching = [];
            for (const x of todo) {
                if (pending.has(x)) {
                    // This stream is in flight, wait for existing promise.
                    waitfor.push(pending.get(x));
                } else {
                    fetching.push(x);
                }
            }
            if (fetching.length) {
                console.info("Fetching streams:", fetching.join(', '));
                const p = new Promise((success, error) => {
                    streams.fetchStreams(fetching, {success, error});
                });
                for (const x of fetching) {
                    pending.set(x, p);
                }
                await p;
                for (const x of fetching) {
                    pending.delete(x);
                    attempted.add(x);
                }
            }
            if (waitfor.length) {
                await Promise.all(waitfor);
            }
        }
        return names.map(x => streams.getStream(x));
    }


    async function fetchStream(name, start, end) {
        await fetchStreams([name]);
        return _getStream(name, start, end);
    }


    async function fetchSmoothStream(name, period, start, end) {
        period = period || 30;
        const fqName = `${name}_smooth_${period}`;
        const stream = _getStream(fqName, start, end);
        if (stream) {
            return stream;
        }
        await fetchStreams([name]);
        const rawStream = _getStream(name);
        if (rawStream) {
            const smooth = sauce.data.smooth(period, null, rawStream);
            pageView.streams().streamData.add(fqName, smooth);
            return _getStream(fqName, start, end);
        }
    }


    function _getStream(name, startIndex, endIndex) {
        const s = pageView.streams().getStream(name);
        if (s && startIndex != null) {
            return s.slice(startIndex, endIndex + 1);
        } else {
            return s;
        }
    }


    function getStreamTimeIndex(time) {
        const timeStream = _getStream('time');
        const idx = timeStream.indexOf(time);
        if (idx !== -1) {
            return idx;
        }
    }


    async function fetchStreamTimeRange(name, startTime, endTime) {
        const startIndex = getStreamTimeIndex(startTime);
        const endIndex = getStreamTimeIndex(endTime);
        return await fetchStream(name, startIndex, endIndex);
    }


    async function fetchSmoothStreamTimeRange(name, period, startTime, endTime) {
        const startIndex = getStreamTimeIndex(startTime);
        const endIndex = getStreamTimeIndex(endTime);
        return await fetchSmoothStream(name, period, startIndex, endIndex);
    }


    function editableField(displayEl, inputEl, options) {
        inputEl.keyup(async ev => {
            if (ev.keyCode == 27 /* escape */) {
                inputEl.hide();
                displayEl.show();
                return;
            } else if (ev.keyCode != 13 /* enter */) {
                return;
            }
            const rawValue = inputEl.val();
            let cleanValue;
            try {
                cleanValue = options.validator(rawValue);
            } catch(invalid) {
                modal({
                    title: invalid.title,
                    body: invalid.message
                });
                return;
            }
            inputEl.hide();
            displayEl.html('...').show();
            if (options.onValid) {
                await options.onValid(cleanValue);
            }
        });
        displayEl.click(() => inputEl.width(displayEl.hide().width() + 20).show());
    }


    function dialog(options) {
        const $dialog = jQuery(`<div>${options.body}</div>`);
        options = options || {};
        const dialogClass = `${options.dialogClass || ''} sauce-dialog`;
        const buttons = Object.assign({
            "Close": () => $dialog.dialog('close')
        }, options.extraButtons);
        $dialog.dialog(Object.assign({
            buttons
        }, options, {dialogClass}));
        return $dialog;
    }


    function modal(options) {
        return dialog(Object.assign({
            modal: true,
        }, options));
    }


    async function updateAthleteInfo(athlete, extra) {
        // This is just for display purposes, but it helps keep things clear in the options.
        const updates = Object.assign({name: athlete.get('display_name')}, extra);
        await sauce.rpc.updateAthleteInfo(athlete.id, updates);
    }


    function attachEditableFTP($parent) {
        const link = $parent.find('.provide-ftp');
        editableField(link, link.siblings('input'), {
            validator: rawValue => {
                if (rawValue === '') {
                    return null;  // Reset to default value.
                }
                const n = parseInt(rawValue);
                if (!n || n <= 0 || n > 600) {
                    throw {
                        title: 'Invalid FTP Wattage',
                        message: `
                            <b>${rawValue} is not a valid FTP.</b><br/>
                            <br/>
                            Acceptable range: 1 - 600 watts.
                        `
                    };
                } else {
                    return n;
                }
            },
            onValid: async ftp_override => {
                await updateAthleteInfo(ctx.athlete, {ftp_override});
                modal({
                    title: 'Reloading...',
                    body: '<b>Reloading page to reflect FTP change.</b>'
                });
                location.reload();
            }
        });
    }


    function attachEditableWeight($parent) {
        const link = $parent.find('.provide-weight');
        editableField(link, link.siblings('input'), {
            validator: rawValue => {
                if (rawValue === '') {
                    return null;  // Reset to default value.
                }
                const n = Number(rawValue);
                if (!n || n <= 0 || n > 10000) {
                    throw {
                        title: 'Invalid Weight',
                        message: `
                            <b>${rawValue} is not a valid weight.</b><br/>
                            <br/>
                            Acceptable range: 1 - 10000.
                        `
                    };
                } else {
                    return n;
                }
            },
            onValid: async v => {
                const weight_override = weightFormatter.unitSystem === 'metric' ? v : v / 2.20462;
                await updateAthleteInfo(ctx.athlete, {weight_override});
                modal({
                    title: 'Reloading...',
                    body: '<b>Reloading page to reflect weight change.</b>'
                });
                location.reload();
            }
        });
    }


    function navHeightAdjustments() {
        // The main site's side nav is absolute positioned, so if the primary view is too short
        // the footer will overflow and mess everything up.  Add a min-height to the view to
        // prevent the footer from doing this.
        const $sidenav = jQuery('nav.sidenav');
        const minHeight = $sidenav.outerHeight(/*includeMargin*/ true);
        jQuery('.view > .page.container').css('min-height', `${minHeight}px`);
        Strava.Activities.Ui.prepareSlideMenu();  // Fixes ... menu in some cases
    }


    async function renderTertiaryStats(attrs) {
        const template = await getTemplate('tertiary-stats.html');
        const $stats = jQuery(await template(attrs));
        attachEditableFTP($stats);
        attachEditableWeight($stats);
        jQuery('.activity-stats .inline-stats').last().after($stats);
    }


    class PeakEffortsPanel {
        constructor({type, menu, renderAttrs, infoDialog}) {
            this.$el = jQuery(`<ul id="sauce-infopanel" class="pagenav"/>`);
            this.type = type;
            this.menu = menu;
            this.sourceKey = `${type}_source`;
            this.renderAttrs = renderAttrs;
            this.$el.on('click', '.group tr[data-range-value]', async ev => {
                ev.stopPropagation();  // prevent click-away detection from closing dialog.
                const row = ev.currentTarget;
                await infoDialog({
                    startTime: Number(row.dataset.startTime),
                    endTime: Number(row.dataset.endTime),
                    label: row.dataset.rangeLabel,
                    icon: row.dataset.rangeIcon,
                    source: this._selectedSource,
                    originEl: row
                });
                sauce.rpc.reportEvent('InfoDialog', 'open',
                    `${this._selectedSource}-${row.dataset.rangeValue}`);
            });
            this.$el.on('click', '.drop-down-menu .options li[data-source]', async ev => {
                await this.setSelectedSource(ev.currentTarget.dataset.source);
                await this.render();
            });
        }

        async render() {
            const source = await this.getSelectedSource();
            const template = await getTemplate('peak-efforts.html');
            this.$el.html(await template(Object.assign({
                menuInfo: await Promise.all(this.menu.map(async x => ({
                    source: x,
                    icon: await sauce.images.asText(peakIcons[x]),
                    tooltip: x + '_tooltip'
                }))),
                source,
                sourceTooltip: source + '_tooltip',
                sourceIcon: await sauce.images.asText(peakIcons[source]),
            }, await this.renderAttrs.call(this, source))));
        }

        async getSelectedSource() {
            let lastKnown;
            if (!this._selectedSource) {
                const ranges = await sauce.rpc.storageGet('analysis_peak_ranges');
                lastKnown = ranges && ranges[`${this.type}_source`];
            } else {
                lastKnown = this._selectedSource;
            }
            if (!lastKnown || this.menu.indexOf(lastKnown) === -1) {
                this._selectedSource = this.menu[0];
            } else {
                this._selectedSource = lastKnown;
            }
            return this._selectedSource;
        }

        async setSelectedSource(source) {
            const key = `${this.type}_source`;
            this._selectedSource = source;
            await sauce.rpc.storageUpdate('analysis_peak_ranges', {[key]: source});
        }
    }


    function _rangeRollToRow({range, roll, value, unit}) {
        return {
            rangeValue: range.value,
            rangeLabel: range.label,
            value,
            unit,
            startTime: roll.firstTime(),
            endTime: roll.lastTime(),
        };
    }


    function hrRangesToRows(ranges, timeStream, hrStream) {
        const rows = [];
        for (const range of ranges.filter(x => x.value >= minHRTime)) {
            const roll = sauce.data.peakAverage(range.value, timeStream, hrStream, {moving: true});
            if (roll) {
                const value = Math.round(roll.avg({moving: true})).toLocaleString();
                rows.push(_rangeRollToRow({range, roll, value, unit: 'bpm'}));
            }
        }
        return rows;
    }


    function paceVelocityRangesToRows(ranges, timeStream, distStream) {
        const unit = '/' + distanceFormatter.shortUnitKey();
        const rows = [];
        for (const range of ranges) {
            const roll = sauce.pace.bestPace(range.value, timeStream, distStream);
            if (roll) {
                const value = humanPace(roll.avg());
                rows.push(_rangeRollToRow({range, roll, value, unit}));
            }
        }
        return rows;
    }


    function vamRangesToRows(ranges, timeStream, altStream) {
        const vamStream = createVAMStream(timeStream, altStream);
        const rows = [];
        for (const range of ranges.filter(x => x.value >= minVAMTime)) {
            const roll = sauce.data.peakAverage(range.value, timeStream, vamStream);
            if (roll) {
                const start = getStreamTimeIndex(roll.firstTime());
                const end = getStreamTimeIndex(roll.lastTime());
                const gain = altitudeChanges(altStream.slice(start, end + 1)).gain;
                const value = Math.round((gain / roll.elapsed()) * 3600).toLocaleString();
                rows.push(_rangeRollToRow({range, roll, value, unit: 'Vm/h'}));
            }
        }
        return rows;
    }


    async function processRideStreams() {
        await fetchStreams(['watts', 'time', 'heartrate', 'altitude']);  // load perf
        const realWattsStream = await fetchStream('watts');
        const timeStream = await fetchStream('time');
        const hrStream = await fetchStream('heartrate');
        const altStream = await fetchSmoothStream('altitude');
        const elapsedTime = streamDelta(timeStream);
        const isWattEstimate = !realWattsStream;
        let wattsStream = realWattsStream;
        if (!wattsStream) {
            wattsStream = await fetchStream('watts_calc');
            if (!wattsStream) {
                console.info("No power data for this activity.");
            }
        }
        let tss;
        let np;
        let intensity;
        if (wattsStream) {
            const corrected = sauce.power.correctedPower(timeStream, wattsStream);
            np = corrected && corrected.np();
            if (corrected && ctx.ftp) {
                if (np) {
                    // Calculate TSS based on elapsed time when NP is being used.
                    tss = sauce.power.calcTSS(np, elapsedTime, ctx.ftp);
                    intensity = np / ctx.ftp;
                } else {
                    // Calculate TSS based on moving time when just avg is available.
                    const movingTime = await getMovingTime();
                    const power = corrected.kj() * 1000 / movingTime;
                    tss = sauce.power.calcTSS(power, movingTime, ctx.ftp);
                    intensity = power / ctx.ftp;
                }
            }
        }
        await renderTertiaryStats({
            weightUnit: weightFormatter.shortUnitKey(),
            weightNorm: humanWeight(ctx.weight),
            weightOrigin: ctx.weightOrigin,
            ftp: ctx.ftp,
            ftpOrigin: ctx.ftpOrigin,
            intensity,
            tss,
            np,
        });
        if (sauce.options['analysis-cp-chart']) {
            const menu = [/*locale keys*/];
            if (wattsStream) {
                menu.push('peak_power');
                if (!isWattEstimate) {
                    menu.push('peak_np');
                }
            }
            if (hrStream) {
                menu.push('peak_hr');
            }
            if (altStream) {
                menu.push('peak_vam');
            }
            if (!menu.length) {
                return;
            }
            const periodRanges = ctx.allPeriodRanges.filter(x => x.value <= elapsedTime);
            const panel = new PeakEffortsPanel({
                type: 'ride',
                menu,
                infoDialog: rideInfoDialog,
                renderAttrs: async source => {
                    let rows;
                    const attrs = {};
                    if (source === 'peak_power') {
                        const prefix = isWattEstimate ? '~' : '';
                        attrs.isWattEstimate = isWattEstimate;
                        rows = [];
                        for (const range of periodRanges.filter(x => !isWattEstimate || x.value >= minWattEstTime)) {
                            const roll = sauce.power.peakPower(range.value, timeStream, wattsStream);
                            if (roll) {
                                const value = prefix + Math.round(roll.avg()).toLocaleString();
                                rows.push(_rangeRollToRow({range, roll, value, unit: 'w'}));
                            }
                        }
                    } else if (source === 'peak_np') {
                        rows = [];
                        for (const range of periodRanges.filter(x => x.value >= minNPTime)) {
                            const roll = sauce.power.peakNP(range.value, timeStream, wattsStream);
                            // Use external NP method for consistency.  There are tiny differences because
                            // the peakNP function is a continous rolling avg vs the external method that
                            // only examines the trimmed dateset.
                            const np = roll && roll.np({external: true});
                            if (np) {
                                const value = Math.round(np).toLocaleString();
                                rows.push(_rangeRollToRow({range, roll, value, unit: 'w'}));
                            }
                        }
                    } else if (source === 'peak_hr') {
                        rows = hrRangesToRows(periodRanges, timeStream, hrStream);
                    } else if (source === 'peak_vam') {
                        rows = vamRangesToRows(periodRanges, timeStream, altStream);
                    }
                    return Object.assign(attrs, {rows});
                }
            });
            attachInfoPanel(panel);
            await panel.render();
        }
    }


    function isRoughlyEqual(a, b, sameness) {
        sameness = sameness || 0.01;
        const delta = Math.abs(a - b);
        return delta < sameness;
    }


    async function processRunStreams() {
        const wattsStream = await fetchStream('watts');
        const movingTime = await getMovingTime();
        const timeStream = await fetchStream('time');
        const hrStream = await fetchStream('heartrate');
        const altStream = await fetchSmoothStream('altitude');
        const distStream = await fetchStream('distance');
        const gradeDistStream = distStream && await fetchStream('grade_adjusted_distance');
        const elapsedTime = streamDelta(timeStream);
        let power;
        if (wattsStream) {
            const corrected = sauce.power.correctedPower(timeStream, wattsStream);
            power = corrected && corrected.kj() * 1000 / movingTime;
        } else if (ctx.weight && gradeDistStream) {
            const gradeDistance = streamDelta(gradeDistStream);
            const kj = sauce.pace.work(ctx.weight, gradeDistance);
            power = kj * 1000 / movingTime;
        }
        let tss;
        let intensity;
        if (power && ctx.ftp) {
            tss = sauce.power.calcTSS(power, movingTime, ctx.ftp);
            intensity = power / ctx.ftp;
        }
        await renderTertiaryStats({
            weightUnit: weightFormatter.shortUnitKey(),
            weightNorm: humanWeight(ctx.weight),
            weightOrigin: ctx.weightOrigin,
            ftp: ctx.ftp,
            ftpOrigin: ctx.ftpOrigin,
            intensity,
            tss,
            power
        });
        if (sauce.options['analysis-cp-chart']) {
            const menu = [/*locale keys*/];
            if (distStream) {
                menu.push('peak_pace');
            }
            if (gradeDistStream) {
                menu.push('peak_gap');
            }
            if (hrStream) {
                menu.push('peak_hr');
            }
            if (altStream) {
                menu.push('peak_vam');
            }
            if (!menu.length) {
                return;
            }
            const periodRanges = ctx.allPeriodRanges.filter(x => x.value <= elapsedTime);
            const distRanges = ctx.allDistRanges;
            const panel = new PeakEffortsPanel({
                type: 'run',
                menu,
                infoDialog: runInfoDialog,
                renderAttrs: async source => {
                    let rows;
                    if (source === 'peak_pace') {
                        rows = paceVelocityRangesToRows(distRanges, timeStream, distStream);
                    } else if (source === 'peak_gap') {
                        rows = paceVelocityRangesToRows(distRanges, timeStream, gradeDistStream);
                    } else if (source === 'peak_hr') {
                        rows = hrRangesToRows(periodRanges, timeStream, hrStream);
                    } else if (source === 'peak_vam') {
                        rows = vamRangesToRows(periodRanges, timeStream, altStream);
                    }
                    return {rows};
                }
            });
            attachInfoPanel(panel);
            await panel.render();
        }
    }


    function onMobileNavClickaway(ev) {
        if (!ev.target.closest('nav.sidenav')) {
            ev.stopImmediatePropagation();  // noops menu-expander listener.
            ev.preventDefault();  // Prevent background page from taking action
        } else if (!ev.target.closest('a')) {
            return;  // ignore non link clicks in the menu.
        }
        toggleMobileNavMenu(ev);
    }


    function toggleMobileNavMenu(ev) {
        const pageContainer = document.querySelector('.view > .page.container');
        const expandedClass = 'sauce-nav-expanded';
        const expanded = pageContainer.classList.contains(expandedClass);
        const evOptions = {capture: true, passive: false};
        if (expanded) {
            document.removeEventListener('click', onMobileNavClickaway, evOptions);
            pageContainer.classList.remove(expandedClass);
        } else {
            pageContainer.classList.add(expandedClass);
            document.addEventListener('click', onMobileNavClickaway, evOptions);
        }
    }


    function attachInfoPanel(panel) {
        const infoEl = panel.$el[0];
        async function placeInfo(isMobile) {
            if (isMobile) {
                const parent = document.getElementById('heading');
                parent.insertAdjacentElement('afterend', infoEl);
            } else {
                const before = document.getElementById('pagenav');
                before.insertAdjacentElement('afterend', infoEl);
            }
            requestAnimationFrame(navHeightAdjustments);
        }
        if (!sauce.options['responsive']) {
            placeInfo(false);
        } else {
            // Monitor for window resize with a media query that matches the mobile
            // css media query..
            const mobileMedia = window.matchMedia('(max-width: 768px)');
            mobileMedia.addListener(ev => void placeInfo(ev.matches));
            placeInfo(mobileMedia.matches);
        }
    }


    function humanWeight(kg, options) {
        options = options || {};
        if (options.suffix) {
            if (options.html) {
                return weightFormatter.abbreviated(kg);
            } else {
                return weightFormatter.formatShort(kg);
            }
        } else {
            return weightFormatter.format(kg);
        }
    }


    function humanTime(seconds) {
        /* Convert seconds to a human string */
        return timeFormatter.display(seconds);
    }


    function humanPace(speed, options) {
        options = options || {};
        const mps = options.velocity ? speed : (1 / speed);
        if (options.suffix) {
            if (options.html) {
                return paceFormatter.abbreviated(mps);
            } else {
                return paceFormatter.formatShort(mps);
            }
        } else {
            return paceFormatter.format(mps);
        }
    }


    function createVAMStream(timeStream, altStream) {
        const vams = [0];
        for (let i = 1; i < timeStream.length; i++) {
            const gain = Math.max(0, altStream[i] - altStream[i - 1]);
            vams.push((gain / (timeStream[i] - timeStream[i - 1])) * 3600);
        }
        return vams;
    }


    function altitudeChanges(stream) {
        let gain = 0;
        let loss = 0;
        if (stream && stream.length) {
            let last = stream[0];
            for (const x of stream) {
                if (x > last) {
                    gain += x - last;
                } else {
                    loss += last - x;
                }
                last = x;
            }
        }
        return {gain, loss};
    }


    function humanElevation(meters, options) {
        options = options || {};
        if (options.suffix) {
            if (options.longSuffix) {
                return elevationFormatter.formatLong(meters);
            } else {
                return elevationFormatter.formatShort(meters);
            }
        } else {
            return elevationFormatter.format(meters);
        }
    }


    function changeToAnalysisView(startTime, endTime) {
        const startIdx = getStreamTimeIndex(startTime);
        const endIdx = getStreamTimeIndex(endTime);
        if (startIdx != null && endIdx != null) {
            pageView.router().changeMenuTo(`analysis/${startIdx}/${endIdx}`);
        } else {
            pageView.router().changeMenuTo(`analysis`);
        }
    }


    let _currentInfoDialog;
    async function createInfoDialog(options) {
        if (_currentInfoDialog) {
            closeCurrentInfoDialog();
        } else if (_currentInfoDialog === undefined) {
            /* First usage; wire click-away detection to close open dialog. */
            jQuery(document).on('pointerdown', ev => {
                if (_currentInfoDialog && ev.target.isConnected) {
                    const $root = _currentInfoDialog.closest('.ui-dialog');
                    if (!jQuery(ev.target).closest($root).length) {
                        closeCurrentInfoDialog();
                    }
                }
            });
        }
        const $dialog = dialog({
            title: `${options.heading}: ${options.textLabel}`,
            icon: await sauce.images.asText(peakIcons[options.source]),
            dialogClass: 'sauce-info-dialog',
            body: options.body,
            resizable: false,
            width: 240,
            position: {
                my: 'left center',
                at: 'right center',
                of: options.originEl
            },
            extraButtons: {
                "Analysis View": () => {
                    changeToAnalysisView(options.start, options.end);
                    $dialog.dialog('close');
                }
            }
        });
        $dialog.find('.start_time_link').on('click',() => {
            changeToAnalysisView(options.start, options.end);
            $dialog.dialog('close');
        });
        $dialog.on('dialogclose', () => {
            options.originEl.classList.remove('selected');
            if ($dialog === _currentInfoDialog) {
                _currentInfoDialog = null;
            }
            $dialog.dialog('destroy');
        });
        _currentInfoDialog = $dialog;
        options.originEl.classList.add('selected');
        return $dialog;
    }


    function closeCurrentInfoDialog() {
        const $d = _currentInfoDialog;
        if ($d) {
            _currentInfoDialog = null;
            $d.dialog('close');
        }
    }


    async function rideInfoDialog({startTime, endTime, label, source, originEl}) {
        let fullWattsStream = await fetchStream('watts');
        if (!fullWattsStream) {
            fullWattsStream = await fetchStream('watts_calc');
        }
        let roll;
        if (fullWattsStream) {
            const power = sauce.power.correctedPower(await fetchStream('time'), fullWattsStream);
            roll = power && power.slice(startTime, endTime);
        }
        const rollValues = roll && roll.values();
        const elapsedTime = endTime - startTime;
        // startTime and endTime can be pad based values with corrected power sources.
        // Use non padded values for other streams.
        const startTS = roll ? roll.firstTime({noPad: true}) : startTime;
        const endTS = roll ? roll.lastTime({noPad: true}) : endTime;
        const timeStream = await fetchStreamTimeRange('time', startTS, endTS);
        const distStream = await fetchStreamTimeRange('distance', startTS, endTS);
        const hrStream = await fetchStreamTimeRange('heartrate', startTS, endTS);
        const altStream = await fetchSmoothStreamTimeRange('altitude', null, startTS, endTS);
        const cadenceStream = await fetchStreamTimeRange('cadence', startTS, endTS);
        const heading = await sauce.locale.getMessage(`analysis_${source}`);
        const textLabel = jQuery(`<div>${label}</div>`).text();
        const template = await getTemplate('ride-info-dialog.html');
        const body = await template({
            startsAt: humanTime(startTime),
            power: roll && powerData(null, roll.avg(), null, elapsedTime, {
                max: sauce.data.max(rollValues),
                np: roll.np()
            }),
            hr: hrData(hrStream),
            cadence: cadenceStream && sauce.data.avg(cadenceStream),
            elevation: elevationData(altStream, elapsedTime, streamDelta(distStream)),
            elevationUnit: elevationFormatter.shortUnitKey(),
            distUnit: distanceFormatter.shortUnitKey(),
            distUnitLong: distanceFormatter.longUnitKey(),
        });
        const $dialog = await createInfoDialog({
            heading,
            textLabel,
            source,
            body,
            originEl,
            start: startTS,
            end: endTS,
        });
        const $sparkline = $dialog.find('.sauce-sparkline');
        if (source === 'peak_power' || source === 'peak_np') {
            await infoDialogGraph($sparkline, {
                data: rollValues,
                formatter: x => `${Math.round(x).toLocaleString()}<abbr class="unit short">w</abbr>`,
                colorSteps: [0, 100, 400, 1200]
            });
        } else if (source === 'peak_hr') {
            await infoDialogGraph($sparkline, {
                data: hrStream,
                formatter: x => `${Math.round(x)}<abbr class="unit short">bpm</abbr>`,
                colorSteps: [40, 100, 150, 200]
            });
        } else if (source === 'peak_vam') {
            await infoDialogGraph($sparkline, {
                data: createVAMStream(timeStream, altStream).slice(1),  // first entry is always 0
                formatter: x => `${Math.round(x)}<abbr class="unit short">Vm/h</abbr>`,
                colorSteps: [-500, 500, 1000, 2000]
            });
        }
        return $dialog;
    }


    async function infoDialogGraph($el, {data, colorSteps, formatter}) {
        if (!data) {
            return;
        }
        // Firefox Mobile doesn't support audiocontext based resampling.
        if (data.length > 120 && !navigator.userAgent.match(/Mobile/)) {
            data = await sauce.data.resample(data, 120);
        }
        const min = Math.max(0, sauce.data.min(data) * 0.75);
        $el.sparkline(data, {
            type: 'line',
            width: '100%',
            height: 56,
            lineColor: '#EA400DA0',
            fillColor: {
                type: 'gradient',
                opacity: 0.6,  // use this instead of rgba colors (it's technical)
                steps: [{
                    value: colorSteps[0],
                    color: '#f0f0f0'
                }, {
                    value: colorSteps[1],  // ~easy
                    color: '#fd6d1d'
                }, {
                    value: colorSteps[2],  // ~hard
                    color: '#780271'
                }, {
                    value: colorSteps[3],  // ~sprint
                    color: '#000'
                }]
            },
            chartRangeMin: min,
            normalRangeMin: min,
            normalRangeMax: sauce.data.avg(data),
            tooltipFormatter: (_, _2, data) => formatter(data.y)
        });
    }


    async function runInfoDialog({startTime, endTime, label, source, originEl}) {
        const timeStream = await fetchStreamTimeRange('time', startTime, endTime);
        const distStream = await fetchStreamTimeRange('distance', startTime, endTime);
        let roll;
        if (distStream) {
            roll = new sauce.data.RollingPace(null);
            roll.import(timeStream, distStream);
        }
        const elapsedTime = endTime - startTime;
        const velocityStream = await fetchStreamTimeRange('velocity_smooth', startTime, endTime);
        const hrStream = await fetchStreamTimeRange('heartrate', startTime, endTime);
        const cadenceStream = await fetchStreamTimeRange('cadence', startTime, endTime);
        const altStream = await fetchSmoothStreamTimeRange('altitude', null, startTime, endTime);
        const gradeDistStream = distStream && await fetchStreamTimeRange('grade_adjusted_distance',
            startTime, endTime);
        const maxVelocity = sauce.data.max(velocityStream);
        const heading = await sauce.locale.getMessage(`analysis_${source}`);
        const textLabel = jQuery(`<div>${label}</div>`).text();
        const gap = gradeDistStream && streamDelta(gradeDistStream) / elapsedTime;
        const template = await getTemplate('run-info-dialog.html');
        const body = await template({
            startsAt: humanTime(startTime),
            pace: roll && {
                avg: humanPace(roll.avg()),
                max: humanPace(maxVelocity, {velocity: true}),
                gap: gap && humanPace(gap, {velocity: true}),
            },
            elapsed: humanTime(elapsedTime),
            hr: hrData(hrStream),
            cadence: cadenceStream && sauce.data.avg(cadenceStream) * 2,
            elevation: elevationData(altStream, elapsedTime, streamDelta(distStream)),
            elevationUnit: elevationFormatter.shortUnitKey(),
            distUnit: distanceFormatter.shortUnitKey(),
            distUnitLong: distanceFormatter.longUnitKey(),
        });
        const $dialog = await createInfoDialog({
            heading,
            textLabel,
            source,
            body,
            originEl,
            start: startTime,
            end: endTime
        });
        const $sparkline = $dialog.find('.sauce-sparkline');
        if (source === 'peak_pace') {
            await infoDialogGraph($sparkline, {
                data: velocityStream,
                formatter: x => humanPace(x, {velocity: true, html: true, suffix: true}),
                colorSteps: [0.5, 2, 5, 10]
            });
        } else if (source === 'peak_gap') {
            const gradeVelocity = [];
            for (let i = 1; i < gradeDistStream.length; i++) {
                const dist = gradeDistStream[i] - gradeDistStream[i - 1];
                const elapsed = timeStream[i] - timeStream[i - 1];
                gradeVelocity.push(dist / elapsed);
            }
            await infoDialogGraph($sparkline, {
                data: gradeVelocity,
                formatter: x => humanPace(x, {velocity: true, html: true, suffix: true}),
                colorSteps: [0.5, 2, 5, 10]
            });
        } else if (source === 'peak_hr') {
            await infoDialogGraph($sparkline, {
                data: hrStream,
                formatter: x => `${Math.round(x)}<abbr class="unit short">bpm</abbr>`,
                colorSteps: [40, 100, 150, 200]
            });
        } else if (source === 'peak_vam') {
            await infoDialogGraph($sparkline, {
                data: createVAMStream(timeStream, altStream).slice(1),  // first entry is always 0
                formatter: x => `${Math.round(x)}<abbr class="unit short">Vm/h</abbr>`,
                colorSteps: [-500, 500, 1000, 2000]
            });
        }
        return $dialog;
    }


    async function updateSideNav() {
        const pageNav = document.querySelector('ul#pagenav');
        // Add an analysis link to the nav if not there already.
        if (pageNav.querySelector('li:not(.sauce-stub) [data-menu="analysis"]')) {
            return;
        }
        const id = pageView.activity().id;
        const a = pageNav.querySelector('[data-menu="analysis"]');
        a.setAttribute('href', `/activities/${id}/analysis`);
        a.textContent = await sauce.locale.getMessage('analysis_title');
        a.parentNode.classList.remove('sauce-stub');
        a.parentNode.style.display = null;
        const premiumGroup = pageNav.querySelector('#premium-views');
        if (premiumGroup) {
            // This is were things get tricky...
            // Strava shows the word "Summit" (never translated) for the menu heading of
            // premium member's activities only for rides.  For runs, it uses the locale
            // translation of "Analysis".  This makes our job of re-adding the analysis
            // link more difficult because we don't want the menu to repeat the word "Analysis".
            // So for Runs we make their menu structure look like a rides, and add our analysis
            // menu entry as if it was born there.  If Strava changes their menu structure this will
            // surely be a problem.
            if (pageView.activity().isRun()) {
                const titleEl = premiumGroup.querySelector('.title');
                // Walk the contents, clearing leading text node(s) and then replacing the text.
                for (const node of Array.from(titleEl.childNodes)) {
                    if (node instanceof Text) {
                        titleEl.removeChild(node);
                    } else {
                        titleEl.insertBefore(new Text('Summit'), node);
                        break;
                    }
                }
            }
        }
    }


    async function sendGAPageView(type) {
        await sauce.rpc.ga('set', 'page', `/site/analysis/${type}`);
        await sauce.rpc.ga('set', 'title', 'Sauce Analysis');
        await sauce.rpc.ga('send', 'pageview');
    }


    let _tplCache = {};
    async function getTemplate(filename) {
        if (!_tplCache[filename]) {
            const resp = await fetch(`${tplUrl}/${filename}`);
            const tplText = await resp.text();
            _tplCache[filename] = sauce.template.compile(tplText, {localePrefix: 'analysis_'});
        }
        return _tplCache[filename];
    }


    async function attachExporters() {
        const exportLocale = await sauce.locale.getMessage('analysis_export');
        const betaLocale = await sauce.locale.getMessage('analysis_beta');
        const menuEl = document.querySelector('nav.sidenav .actions-menu .drop-down-menu ul.options');
        const sauceIcon = `<img title="Powered by Sauce" class="sauce-icon"
                                src="${sauce.extUrl}images/icon64.png"/>`;
        const gpxLink = document.createElement('li');
        gpxLink.classList.add('sauce', 'first');
        gpxLink.innerHTML = `<a title="NOTE: GPX files do not support power data (watts)."
                                href="javascript:void(0)">${sauceIcon}${exportLocale} GPX
                             <sup class="sauce-beta">${betaLocale}</sup></a>`;
        gpxLink.addEventListener('click', () => exportActivity(sauce.export.GPXSerializer));
        menuEl.appendChild(gpxLink);
        const tpxLink = document.createElement('li');
        tpxLink.classList.add('sauce', 'last');
        tpxLink.innerHTML = `<a title="TCX files are best for activities with power data (watts)."
                                href="javascript:void(0)">${sauceIcon}${exportLocale} TCX
                             <sup class="sauce-beta">${betaLocale}</sup></a>`;
        tpxLink.addEventListener('click', () => exportActivity(sauce.export.TCXSerializer));
        menuEl.appendChild(tpxLink);
    }


    async function getEstimatedActivityStart() {
        // Activity start time is sadly complicated.  Despite being visible in the header
        // for all activities we only have access to it for rides and self-owned runs.  Trying
        // to parse the html might work for english rides but will fail for non-english users.
        const localTime = pageView.activity().get('startDateLocal') * 1000;
        if (localTime) {
            // Do a very basic tz correction based on the longitude of any geo data we can find.
            // Using a proper timezone API is too expensive for this use case.
            const geoStream = await fetchStream('latlng');
            let longitude;
            if (geoStream) {
                for (const [, lng] of geoStream) {
                    if (lng != null) {
                        longitude = lng;
                        console.info("Getting longitude of activity based on latlng stream");
                        break;
                    }
                }
            }
            if (longitude == null) {
                // Take a wild guess that the activity should match the geo location of the athlete.
                const athleteGeo = ctx.athlete.get('geo');
                if (athleteGeo && athleteGeo.lat_lng) {
                    longitude = athleteGeo.lat_lng[1];
                    console.info("Getting longitude of activity based on athlete's location");
                }
            }
            let offset = 0;
            if (longitude != null) {
                offset = Math.round((longitude / 180) * (24 / 2)) * 3600000;
                console.info("Using laughably bad timezone correction:", offset);
            }
            return new Date(localTime - offset);  // Subtract offset to counteract the localtime.
        }
        // Sadly we would have to resort to HTML scraping here. Which for now, I won't..
        console.info("No activity start date could be acquired");
        return new Date();
    }


    function download(blob, name) {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = blob.name || name;
        link.style.display = 'none';
        document.body.appendChild(link);
        try {
            link.click();
        } finally {
            link.remove();
            URL.revokeObjectURL(link.href);
        }
    }


    async function exportActivity(Serializer) {
        const streamNames = ['time', 'watts', 'heartrate', 'altitude',
                             'cadence', 'temp', 'latlng', 'distance'];
        const streams = (await fetchStreams(streamNames)).reduce((acc, x, i) => (acc[streamNames[i]] = x, acc), {});
        const fullActivity = await fetchFullActivity();
        const realStartTime = fullActivity && fullActivity.get('start_time');
        let start;
        if (realStartTime) {
            start = new Date(realStartTime);
        } else {
            start = await getEstimatedActivityStart();
        }
        // Name and description are not available in the activity model for other users..
        const name = document.querySelector('#heading .activity-name').textContent;
        const descEl = document.querySelector('#heading .activity-description .content');
        const desc = descEl && descEl.textContent;
        const serializer = new Serializer(name, desc, pageView.activity().get('type'), start);
        serializer.start();
        serializer.loadStreams(streams);
        download(serializer.toFile());
    }


    function submitComment(comment) {
        pageView.commentsController().comment('Activity', pageView.activity().id, comment);
        sauce.rpc.reportEvent('Comment', 'submit');
    }


    async function attachComments() {
        const commentsTpl = await getTemplate('comments.html');
        const submitCommentTpl = await getTemplate('submit-comment.html');
        const $section = jQuery(`
            <div>
                <div class="sauce-inline-comments"></div>
                <div class="sauce-new-comment"></div>
            </div>
        `);
        jQuery('.activity-summary').append($section);
        async function render() {
            const comments = [];
            const commentsHash = `Activity-${pageView.activity().id}`;
            for (const x of pageView.commentsController().getFromHash(commentsHash)) {
                const date = new Date(jQuery(x.timestamp).attr('datetime'));
                comments.push({
                    tokens: x.comment,
                    athlete: x.athlete,
                    timeago: await sauce.locale.humanTimeAgo(date, {precision: 60}),
                });
            }
            $section.find('.sauce-inline-comments').html((await commentsTpl({comments})).trim());
            $section.find('.sauce-new-comment').html(await submitCommentTpl());
        }
        $section.on('input', '.sauce-new-comment input', ev => {
            const $input = jQuery(ev.currentTarget);
            if ($input.val()) {
                $input.next('button').removeAttr('disabled');
            } else {
                $input.next('button').attr('disabled', 'disabled');
            }
        });
        $section.on('keypress', '.sauce-new-comment input', ev => {
            const $input = jQuery(ev.currentTarget);
            if (ev.which == 13 /*Enter*/ && $input.val()) {
                submitComment($input.val());
            }
        });
        $section.on('click', '.sauce-new-comment button', ev => {
            const $input = jQuery(ev.currentTarget).prev('input');
            submitComment($input.val());
        });
        pageView.commentsController().on('commentCompleted', render);
        await render();
    }


    function addBadge(row) {
        if (!ctx.weight || row.querySelector(':scope > td.sauce-mark')) {
            return;
        }
        const segment = pageView.segmentEfforts().getEffort(Number(row.dataset.segmentEffortId));
        if (!segment) {
            console.warn("Segment data not found for:", row.dataset.segmentEffortId);
            return;
        }
        const wKg = segment.get('avg_watts_raw') / ctx.weight;
        const rank = sauce.power.rank(segment.get('elapsed_time_raw'), wKg, ctx.gender);
        if (!rank || !rank.badge) {
            return;  // Too slow/weak
        }
        let targetTD;
        for (const td of row.querySelectorAll(':scope > td')) {
            const unit = td.querySelector('abbr.unit');
            if (unit && unit.innerText.toLowerCase() === 'w') {
                // This is the highest pref for placement.  The TD doesn't have any other indications besides
                // the watts unit abbr tag.  The title value is translated, so we have to look for this.
                targetTD = td;
                break;
            }
        }
        if (!targetTD) {
            // Use fallback strategy of using a TD column with a real identifier.
            targetTD = row.querySelector('.time-col');
        }
        if (!targetTD) {
            throw new Error("Badge Fail: row query selector failed");
        }
        targetTD.classList.add('sauce-mark');
        const levelPct = Math.round(rank.level * 100);
        targetTD.innerHTML = `
            <div class="sauce-rank-holder">
                <div>${targetTD.innerHTML}</div>
                <img src="${rank.badge}" class="sauce-rank"
                     title="World Ranking: ${levelPct}%\nWatts/kg: ${wKg.toFixed(1)}"/>
            </div>
        `;
    }


    function addSegmentBadges() {
        if (!ctx.weight) {
            return;
        }
        const rows = Array.from(document.querySelectorAll('table.segments tr[data-segment-effort-id]'));
        rows.push.apply(rows, document.querySelectorAll('table.hidden-segments tr[data-segment-effort-id]'));
        for (const row of rows) {
            try {
                addBadge(row);
            } catch(e) {
                console.error("addBadge failure:", e);
                sauce.rpc.reportError(e);
            }
        }
    }


    async function startRun() {
        await processRunStreams();
    }



    async function startRide() {
        jQuery('body').on('click', '.rank_badge', async ev => {
            closeCurrentInfoDialog();
            const powerProfileTpl = await getTemplate('power-profile-help.html');
            const $dialog = modal({
                title: 'Power Profile Badges Explained',
                body: await powerProfileTpl(),
                width: 600
            });
            const times = [];
            for (let i = 5; i < 3600; i += Math.log(i + 1)) {
                times.push(i);
            }
            times.push(3600);
            const requirements = {
                male: times.map(x => sauce.power.rankRequirements(x, 'male')),
                female: times.map(x => sauce.power.rankRequirements(x, 'female'))
            };
            const $levelSelect = $dialog.find('select#sauce-rank-level');
            const $genderSelect = $dialog.find('select#sauce-rank-gender');
            const $graph = $dialog.find('.rank-graph');
            function drawGraph() {
                const gender = $genderSelect.val();
                const level = Number($levelSelect.val());
                const pct = level / 8;
                let tooltipFormatterAbs;
                if (ctx.weight) {
                    tooltipFormatterAbs = wKg => `
                        ${Math.round(wKg * ctx.weight).toLocaleString()}<abbr class="unit short">W</abbr>
                        (with current athlete's weight)<br/>`;
                } else {
                    tooltipFormatterAbs = wKg => ``;
                }
                $graph.sparkline(requirements[gender].map(({high, low}) => (pct * (high - low)) + low), {
                    type: 'line',
                    width: '100%',
                    height: 100,
                    chartRangeMin: 0,
                    tooltipFormatter: (_, _2, data) => `
                        ${(data.y).toFixed(1)}<abbr class="unit short">W/kg</abbr><br/>
                        ${tooltipFormatterAbs(data.y)}
                        Duration: ${humanTime(times[data.x])}`
                });
            }
            $levelSelect.on('change', drawGraph);
            $genderSelect.on('change', drawGraph);
            $dialog.on('dialogresize', drawGraph);
            drawGraph();
        });
        await processRideStreams();
    }


    async function getFTPInfo(athleteId) {
        const info = {};
        const override = await sauce.rpc.getAthleteProp(athleteId, 'ftp_override');
        if (override) {
            info.ftp = override;
            info.ftpOrigin = 'sauce';
        } else {
            let stravaFtp;
            const powerCtrl = pageView.powerController && pageView.powerController();
            if (powerCtrl) {
                try {
                    await new Promise((resolve, reject) => {
                        powerCtrl.deferred.done(resolve);
                        powerCtrl.deferred.fail(reject);
                    });
                    stravaFtp = powerCtrl.get('athlete_ftp');
                } catch(e) {/*no-pragma*/}
            }
            if (stravaFtp == null) {
                /* This fallback is for athletes that once had premium, set their FTP, then let
                 * their subscription pass.  It only works for them, but it's a nice to have. */
                stravaFtp = pageView.activity().get('ftp');
            }
            if (stravaFtp) {
                info.ftp = stravaFtp;
                info.ftpOrigin = 'strava';
                // Runs never display ftp, so if the athlete is multisport and
                // we've seen one activity (ride) with ftp, remember it for looking
                // at runs later.
                if (athleteId === ctx.athlete.id) {
                    await updateAthleteInfo(ctx.athlete, {ftp_lastknown: stravaFtp});
                } else {
                    await sauce.rpc.setAthleteProp(athleteId, 'ftp_lastknown', stravaFtp);
                }
            } else {
                const lastKnown = await sauce.rpc.getAthleteProp(athleteId, 'ftp_lastknown');
                if (lastKnown) {
                    info.ftp = lastKnown;
                    info.ftpOrigin = 'sauce';
                } else {
                    info.ftp = 0;
                    info.ftpOrigin = 'default';
                }
            }
        }
        return info;
    }


    async function getWeightInfo(athleteId) {
        const info = {};
        const override = await sauce.rpc.getAthleteProp(athleteId, 'weight_override');
        if (override) {
            info.weight = override;
            info.weightOrigin = 'sauce';
        } else {
            const stravaWeight = pageView.activityAthleteWeight();
            if (stravaWeight) {
                info.weight = stravaWeight;
                info.weightOrigin = 'strava';
                // Runs never display weight, so if the athlete is multisport and
                // we've seen one activity (ride) with weight, remember it for looking
                // at runs later.
                if (athleteId === ctx.athlete.id) {
                    await updateAthleteInfo(ctx.athlete, {weight_lastknown: stravaWeight});
                } else {
                    await sauce.rpc.setAthleteProp(athleteId, 'weight_lastknown', stravaWeight);
                }
            } else {
                const lastKnown = await sauce.rpc.getAthleteProp(athleteId, 'weight_lastknown');
                if (lastKnown) {
                    info.weight = lastKnown;
                    info.weightOrigin = 'sauce';
                } else {
                    info.weight = 0;
                    info.weightOrigin = 'default';
                }
            }
        }
        return info;
    }


    function streamDelta(stream) {
        if (stream) {
            if (stream.length < 2) {
                return 0;
            } else {
                return stream[stream.length - 1] - stream[0];
            }
        }
    }


    async function getMovingTime(start, end) {
        const timerTimeStream = await fetchStream('timer_time', start, end);
        if (timerTimeStream) {
            // This is good data, but only available on some runs.  Might be new.
            return streamDelta(timerTimeStream);
        } else {
            const timeStream = await fetchStream('time', start, end);
            const movingStream = await fetchStream('moving', start, end);
            return sauce.data.movingTime(timeStream, movingStream);
        }
    }


    function elevationData(altStream, elapsed, distance) {
        if (altStream && elapsed && distance) {
            const {gain, loss} = altitudeChanges(altStream);
            return {
                gain: gain > 1 ? humanElevation(gain) : 0,
                loss: loss && humanElevation(loss),
                grade: ((gain - loss) / distance) * 100,
                vam: elapsed >= minVAMTime ? (gain / elapsed) * 3600 : 0
            };
        }
    }


    function hrData(hrStream) {
        if (hrStream) {
            return {
                min: sauce.data.min(hrStream),
                avg: sauce.data.avg(hrStream),
                max: sauce.data.max(hrStream),
            };
        }
    }


    function powerData(movingAvg, elapsedAvg, moving, elapsed, extra) {
        return Object.assign({
            movingAvg,
            elapsedAvg,
            movingWKg: (ctx.weight && movingAvg != null) && movingAvg / ctx.weight,
            elapsedWKg: (ctx.weight && elapsedAvg != null) && elapsedAvg / ctx.weight,
            rank: (ctx.weight && elapsedAvg != null) &&
                sauce.power.rank(elapsed, elapsedAvg / ctx.weight, ctx.gender)
        }, extra);
    }


    function countStops(movingStream) {
        let stops = 0;
        const movingIter = movingStream.values();
        const consumeStops = () => {
            while(movingIter.next().value === false) {/*no-pragma*/}
            for (let i = 0; i < 4; i++) {
                const v = movingIter.next();
                if (v.done) {
                    return;
                }
                if (v.value === false) {
                    return consumeStops();
                }
            }
        };
        consumeStops();
        for (const x of movingIter) {
            if (!x) {
                stops++;
                consumeStops();
            }
        }
        return stops;
    }


    async function _updateAnalysisStats(start, end) {
        const isRun = pageView.activity().isRun();
        const prefetchStreams = ['time', 'timer_time', 'moving', 'altitude', 'watts',
                                 'grade_smooth', 'distance'];
        if (isRun) {
            prefetchStreams.push('grade_adjusted_distance');
        }
        await fetchStreams(prefetchStreams);  // better load perf
        const timeStream = await fetchStream('time', start, end);
        const distStream = await fetchStream('distance', start, end);
        const altStream = await fetchSmoothStream('altitude', null, start, end);
        const movingTime = await getMovingTime(start, end);
        const elapsedTime = streamDelta(timeStream);
        const distance = streamDelta(distStream);
        const pausedTime = elapsedTime - movingTime;
        const tplData = {
            logo: sauce.extUrl + 'images/logo_vert_48x128.png',
            isRun,
            elapsed: humanTime(elapsedTime),
            moving: humanTime(movingTime),
            paused: timeFormatter.abbreviatedNoTags(pausedTime, null, false),
            stops: countStops(await fetchStream('moving', start, end)),
            weight: ctx.weight,
            elUnit: elevationFormatter.shortUnitKey(),
            distUnit: distanceFormatter.shortUnitKey(),
            samples: timeStream.length,
            elevation: elevationData(altStream, elapsedTime, distance),
        };
        let kj;
        const wattsStream = await fetchStream('watts', start, end);
        if (wattsStream) {
            // Use idealGap and maxGap from whole data stream for cleanest results.
            if (!ctx.idealGap) {
                const gaps = sauce.data.recommendedTimeGaps(await fetchStream('time'));
                ctx.idealGap = gaps.ideal;
                ctx.maxGap = gaps.max;
            }
            const roll = sauce.power.correctedPower(timeStream, wattsStream,
                ctx.idealGap, ctx.maxGap);
            kj = roll && roll.kj();
            tplData.power = roll && powerData(kj * 1000 / movingTime, roll.avg(),
                movingTime, elapsedTime, {np: roll.np()});
        }
        if (isRun) {
            const gradeDistStream = distStream && await fetchStream('grade_adjusted_distance', start, end);
            const gradeDistance = streamDelta(gradeDistStream);
            if (!wattsStream && gradeDistance && ctx.weight) {
                kj = sauce.pace.work(ctx.weight, gradeDistance);
                tplData.power = powerData(kj * 1000 / movingTime, kj * 1000 / elapsedTime,
                    movingTime, elapsedTime, {estimate: true});
            }
            tplData.pace = gradeDistance && {
                elapsed: humanPace(distance / elapsedTime, {velocity: true}),
                moving: humanPace(1 / (distance / movingTime)),
                gap: gradeDistance && humanPace(gradeDistance / movingTime, {velocity: true}),
            };
        }
        if (kj) {
            tplData.energy = {
                kj,
                kjHour: (kj / movingTime) * 3600,
                tss: ctx.ftp && sauce.power.calcTSS(tplData.power.moving, movingTime, ctx.ftp)
            };
        }
        const tpl = await getTemplate('analysis-stats.html');
        ctx.$analysisStats.data({start, end});
        ctx.$analysisStats.html(await tpl(tplData));
    }


    let _schedUpdateAnalysisPromise;
    let _schedUpdateAnalysisHash = null;
    let _schedUpdateAnalysisPending = null;
    let _schedUpdateAnalysisId = 0;
    function schedUpdateAnalysisStats(start, end) {
        if (start === null) {
            // rescheduled invocation.
            [start, end] = _schedUpdateAnalysisPending;
        }
        const hash = `${start}-${end}`;
        if (_schedUpdateAnalysisHash === hash) {
            return;  // dedup
        }
        _schedUpdateAnalysisPending = [start, end];
        if (!ctx.supportedActivity) {
            if (ctx.supportedActivity === undefined) {
                ctx.prepared.then(() => schedUpdateAnalysisStats(null));
            }
            return;
        }
        if (!ctx.$analysisStats) {
            const $el = jQuery('#basic-analysis section.chart');
            if (!$el.length) {
                setTimeout(() => schedUpdateAnalysisStats(null), 200);
                return;
            }
            attachAnalysisStats($el);
        }
        const id = ++_schedUpdateAnalysisId;
        _schedUpdateAnalysisHash = hash;
        (async () => {
            try {
                await _schedUpdateAnalysisPromise;
            } catch(e) {/*no-pragma*/}
            await new Promise(resolve => requestAnimationFrame(resolve));
            if (id !== _schedUpdateAnalysisId) {
                return; // debounce
            }
            _schedUpdateAnalysisPromise = _updateAnalysisStats(start, end);
            await _schedUpdateAnalysisPromise;
        })();
    }


    function _rawStreamsInfo() {
        return [
            {name: 'time'},
            {name: 'timer_time'},
            {name: 'moving'},
            {name: 'outlier'},
            {name: 'distance'},
            {name: 'grade_adjusted_distance', label: 'gap_distance'},
            {name: 'watts'},
            {name: 'watts_calc'},
            {name: 'heartrate'},
            {name: 'cadence', formatter: pageView.activity().isRun() ? x => x * 2 : null},
            {name: 'velocity_smooth'},
            {name: 'pace'},
            {name: 'grade_adjusted_pace', label: 'gap'},
            {name: 'latlng', label: 'lat', formatter: x => x[0]},
            {name: 'latlng', label: 'lng', formatter: x => x[1]},
            {name: 'temp'},
            {name: 'altitude'},
            {name: 'altitude_smooth_30', label: 'altitude_smooth'},
            {name: 'grade_smooth'}
        ].map(x => ({
            name: x.name,
            label: x.label || x.name,
            formatter: x.formatter,
        }));
    }


    async function _fetchDataSamples(skip, start, end) {
        const streams = _rawStreamsInfo();
        const samples = {};
        const filtered = streams.filter(x => !skip || !skip.has(x.label));
        await fetchStreams(filtered.map(x => x.name));  // bulk prefetch for perf
        for (const x of filtered) {
            const data = await fetchStream(x.name, start, end);
            if (!data) {
                samples[x.label] = null;
            } else {
                samples[x.label] = x.formatter ? data.map(x.formatter) : data;
            }
        }
        return samples;
    }


    async function _dataViewStreamSelector() {
        const prefetch = await _fetchDataSamples();
        const unavailable = new Set(Object.keys(prefetch).filter(x => !prefetch[x]));
        const defaultSkip = new Set(['watts_calc', 'lat', 'lng', 'pace', 'gap', 'timer_time',
                                     'gap_distance', 'grade_smooth', 'outlier', 'moving',
                                     'altitude_smooth', 'temp']);
        const streams = _rawStreamsInfo();
        const checks = streams.filter(x => !unavailable.has(x.label)).map(x => `
            <label>
                <input ${defaultSkip.has(x.label) ? '' : 'checked'}
                       type="checkbox" name="samples"
                       value="${x.label}"/>
                ${x.label}
            </label>
        `);
        const $header = jQuery(`<header>${checks.join(' ')}</header>`);
        const $checks = $header.find('input[name="samples"]');
        let skip = defaultSkip;
        $checks.on('change', () => {
            skip = new Set($checks.filter(':not(:checked)').map((_, x) => x.value));
            $header.trigger('update', skip);
        });
        $header.skip = () => {
            for (const x of unavailable) {
                skip.add(x);
            }
            return skip;
        };
        return $header;
    }


    async function showRawData() {
        const start = ctx.$analysisStats.data('start');
        const end = ctx.$analysisStats.data('end');
        const $selector = await _dataViewStreamSelector();
        async function renderData() {
            const samples = await _fetchDataSamples($selector.skip(), start, end);
            const csvData = sauce.data.tabulate(samples, {pretty: true});
            const sep = ', ';
            const width = Math.max(sauce.data.sum(csvData[0].map(x => x.length + sep.length)), 68);
            return [csvData.map(x => x.join(sep)).join('\n'), width];
        }
        const [initialData, initialWidth] = await renderData();
        let currentData = initialData;
        const $dialog = modal({
            title: 'Raw Data',
            body: `<pre>${initialData}</pre>`,
            width: `calc(${initialWidth}ch + 4em)`,
            dialogClass: 'sauce-big-data',
            extraButtons: {
                "Download": () => {
                    const range = start && end ? `-${start}-${end}` : '';
                    const name = `${pageView.activity().id}${range}.csv`;
                    download(new Blob([currentData], {type: 'text/csv'}), name);
                }
            }
        });
        $dialog.prepend($selector);
        $selector.on('update', async () => {
            const [data, width] = await renderData();
            currentData = data;
            $dialog.find('pre').html(data);
            $dialog.dialog('option', 'width', `calc(${width}ch + 4em)`);
        });
    }


    async function showGraphData() {
        const start = ctx.$analysisStats.data('start');
        const end = ctx.$analysisStats.data('end');
        const $selector = await _dataViewStreamSelector();
        const $dialog = modal({
            title: 'Graph Data',
            body: '<div style="padding: 0.5em" class="graphs"></div>',
            width: '80vw',
            dialogClass: 'sauce-big-data',
            position: {at: 'center top+100'}
        });
        $dialog.prepend($selector);
        const $graphs = $dialog.find('.graphs');
        async function renderGraphs() {
            const samples = await _fetchDataSamples($selector.skip(), start, end);
            $graphs.empty();
            for (const [label, data] of Object.entries(samples)) {
                const $row = jQuery(`
                    <div>
                        <small><b>${label}</b></small>
                        <div class="graph"></div>
                    <div/>
                `);
                $graphs.append($row);
                $row.find('.graph').sparkline(data, {
                    type: 'line',
                    width: '100%',
                    height: 40,
                });
            }
        }
        $selector.on('update', renderGraphs);
        await renderGraphs();
    }


    function attachAnalysisStats($el) {
        if (!ctx.$analysisStats) {
            ctx.$analysisStats = jQuery(`<div class="sauce-analysis-stats"></div>`);
        }
        $el.find('#stacked-chart').before(ctx.$analysisStats);
        $el.on('click', 'a.sauce-raw-data', () => showRawData());
        $el.on('click', 'a.sauce-graph-data', () => showGraphData());
    }


    if (Strava.Activities && Strava.Activities.Ui && Strava.Activities.Ui.prepareSlideMenu) {
        Strava.Activities.Ui.prepareSlideMenu = function() {
            // We extend the sidenav, so we need to modify this routine to make the menu
            // work properly in all conditions.
            const $slideMenu = jQuery(".slide-menu");
            const navHeight = jQuery("nav.sidenav").height() || 0;
            const menuHeight = $slideMenu.find(".options").height();
            if (navHeight > 240 /*copied*/ && menuHeight > navHeight) {
                $slideMenu.removeClass("align-bottom").addClass("align-top");
            } else if (navHeight > menuHeight) {
                $slideMenu.removeClass("align-top").addClass("align-bottom");
            }
        };
    }


    async function prepareContext() {
        ctx.athlete = pageView.activityAthlete();
        ctx.gender = ctx.athlete.get('gender') === 'F' ? 'female' : 'male';
        await Promise.all([
            getWeightInfo(ctx.athlete.id).then(x => Object.assign(ctx, x)),
            getFTPInfo(ctx.athlete.id).then(x => Object.assign(ctx, x)),
        ]);
        updateSideNav();  //bg okay
        attachExporters();  // bg okay
        attachComments();  // bg okay
        const savedRanges = await sauce.rpc.storageGet('analysis_peak_ranges');
        ctx.allPeriodRanges = (savedRanges && savedRanges.periods) || defaultPeakPeriods;
        for (const range of ctx.allPeriodRanges) {
            range.label = await sauce.locale.humanDuration(range.value);
        }
        ctx.allDistRanges = (savedRanges && savedRanges.distances) || defaultPeakDistances;
        for (const range of ctx.allDistRanges) {
            if (range.value < 1000) {
                range.label = `${range.value} m`;
            } else {
                const miles = range.value / metersPerMile;
                if (isRoughlyEqual(miles, 13.1) ||
                    isRoughlyEqual(miles, 26.2) ||
                    isRoughlyEqual(miles, Math.round(miles))) {
                    range.label = imperialDistanceFormatter.formatShort(range.value);
                } else {
                    range.label = metricDistanceFormatter.formatShort(range.value);
                }
            }
            range.label = range.label.replace(/\.0 /, ' ');
        }
        _resolvePrepared();
    }


    async function streamsReady() {
        if (!pageView.streams()) {
            const save = pageView.streams;
            await new Promise(resolve => {
                pageView.streams = function(set) {
                    if (set) {
                        pageView.streams = save;
                        resolve();
                    }
                    return save.apply(this, arguments);
                };
            });
        }
    }


    // Using mutation observers on the entire document leads to perf issues in chrome.
    let _pageMonitorsBackoff = 10;
    let _pageMonitorsTimeout;
    async function startPageMonitors() {
        if (sauce.options['analysis-segment-badges']) {
            maintainSegmentBadges();
        }
        if (sauce.options['responsive']) {
            maintainScalableSVG();
        }
        _pageMonitorsBackoff *= 1.25;
        _pageMonitorsTimeout = setTimeout(startPageMonitors, _pageMonitorsBackoff);
    }


    function resetPageMonitors() {
        _pageMonitorsBackoff = 10;
        clearTimeout(_pageMonitorsTimeout);
        startPageMonitors();
    }


    function maintainSegmentBadges() {
        const segments = document.querySelector('table.segments');
        if (segments) {
            addSegmentBadges();
        }
    }


    function maintainScalableSVG() {
        const candidates = document.querySelectorAll('svg[width][height]:not([data-sauce-mark])');
        for (const el of candidates) {
            el.dataset.sauceMark = true;
            if (!el.hasAttribute('viewBox') && el.parentNode &&
                el.parentNode.classList.contains('base-chart')) {
                const width = Number(el.getAttribute('width'));
                const height = Number(el.getAttribute('height'));
                if (!isNaN(width) && !isNaN(height)) {
                    el.setAttribute('viewBox', `0 0 ${width} ${height}`);
                    el.removeAttribute('width');
                    el.removeAttribute('height');
                    const mo = new MutationObserver(mutations => {
                        for (const m of mutations) {
                            if (m.attributeName === 'width') {
                                el.removeAttribute('width');
                            }
                            if (m.attributeName === 'height') {
                                el.removeAttribute('height');
                            }
                        }
                    });
                    mo.observe(el, {attributes: true});
                }
            }
        }
    }


    async function attachMobileMenuExpander() {
        const svg = await sauce.images.asText('fa/bars-solid.svg');
        const header = document.querySelector('#heading header');
        header.insertAdjacentHTML('afterbegin',
            `<div style="display: none" class="menu-expander">${svg}</div>`);
        header.querySelector('.menu-expander').addEventListener('click', toggleMobileNavMenu);
    }


    async function load() {
        await streamsReady();
        const activity = pageView.activity();
        if (!activity) {
            return;
        }
        let start;
        if (activity.isRun()) {
            start = startRun;
        } else if (activity.isRide()) {
            start = startRide;
        }
        const type = activity.get('type');
        if (start) {
            ctx.supportedActivity = true;
            await prepareContext();
            const pageRouter = pageView.router();
            pageRouter.on('route', page => {
                document.body.dataset.route = page;
                resetPageMonitors();
            });
            document.body.dataset.route = pageRouter.context.startMenu();
            if (sauce.options['responsive']) {
                await attachMobileMenuExpander();
            }
            startPageMonitors();
            if (sauce.analysisStatsIntent && !_schedUpdateAnalysisPending) {
                const {start, end} = sauce.analysisStatsIntent;
                schedUpdateAnalysisStats(start, end);
            }
            await start();
        } else {
            ctx.supportedActivity = false;
            console.info("Unsupported activity type:", type);
        }
        sendGAPageView(type);  // bg okay
    }


    return {
        load,
        fetchStream,
        fetchStreams,
        dialog,
        modal,
        humanWeight,
        humanTime,
        humanPace,
        humanElevation,
        schedUpdateAnalysisStats,
        attachAnalysisStats,
    };
}).then(async ns => {
    if (sauce.testing) {
        return;
    }
    try {
        await ns.load();
    } catch(e) {
        await sauce.rpc.reportError(e);
        throw e;
    }
});
