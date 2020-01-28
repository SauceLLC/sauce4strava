/* global Strava sauce jQuery pageView _ */

sauce.analysisReady = sauce.ns('analysis', async ns => {
    'use strict';

    await Promise.all([
        sauce.propDefined('pageView'),
        sauce.propDefined('Strava.I18n'),
        sauce.propDefined('_')
    ]);

    const ctx = {};
    const tplUrl = sauce.extURL + 'templates';

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
    const metersPerMile = 1609.344;
    const defaultCritPeriods = [
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
    const defaultCritDistances = [
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


    let _activity;
    async function fetchFullActivity() {
        // The initial activity object is not fully loaded for owned' activities.  This routine
        // will return a full activity object if the activity is from the page owner. Note that
        // we leave the existing pageView.activity() object alone to avoid compatibility issues.
        if (_activity) {
            return _activity;
        }
        if (pageView.isOwner()) {
            const activity = new Strava.Labs.Activities.TrainingActivity({id: pageView.activity().id});
            await new Promise((success, error) => activity.fetch({success, error}));
            // Move the real type value to fullType and use the Strava modified type instead.
            // Various functions like `isRide` are broken without this.
            activity.set({
                type: pageView.activity().get('type'),  // Is hardcoded to by pageView.
                fullType: activity.get('type')  // Will be things like VirtualRide (which breaks isRide()).
            });
            _activity = activity;
        } else {
            _activity = pageView.activity().clone();
        }
        return _activity;
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
                console.info("Waiting for existing stream fetch(es) to finish");
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
        return timeStream.indexOf(time);
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


    let _currentMoreinfoDialog;
    function openMoreinfoDialog($dialog, selectorEl) {
        if (_currentMoreinfoDialog) {
            closeCurrentMoreinfoDialog();
        } else if (_currentMoreinfoDialog === undefined) {
            /* First usage; wire click-away detection to close open dialog. */
            jQuery(document).on('pointerdown', ev => {
                if (_currentMoreinfoDialog && ev.target.isConnected) {
                    const $root = _currentMoreinfoDialog.closest('.ui-dialog');
                    if (!jQuery(ev.target).closest($root).length) {
                        closeCurrentMoreinfoDialog();
                    }
                }
            });
        }
        $dialog.on('dialogclose', () => {
            selectorEl.classList.remove('selected');
            if ($dialog === _currentMoreinfoDialog) {
                _currentMoreinfoDialog = null;
            }
            $dialog.dialog('destroy');
        });
        _currentMoreinfoDialog = $dialog;
        selectorEl.classList.add('selected');
    }


    function closeCurrentMoreinfoDialog() {
        const $d = _currentMoreinfoDialog;
        if ($d) {
            _currentMoreinfoDialog = null;
            $d.dialog('close');
        }
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
                dialogPrompt(invalid.title, invalid.message);
                return;
            }
            inputEl.hide();
            displayEl.html('...').show();
            if (options.onValid) {
                await options.onValid(cleanValue);
            }
        });
        displayEl.click(() => inputEl.width(displayEl.hide().width()).show());
    }


    function dialogPrompt(title, body, options) {
        const $dialog = jQuery(`<div title="${title}">${body}</div>`);
        options = options || {};
        const dialogClass = `${options.dialogClass || ''} sauce-dialog`;
        $dialog.dialog(Object.assign({
            modal: true,
            buttons: {
                "Ok": () => $dialog.dialog('close')
            }
        }, options, {dialogClass}));
        return $dialog;
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
                dialogPrompt('Reloading...', '<b>Reloading page to reflect FTP change.</b>');
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
                dialogPrompt('Reloading...', '<b>Reloading page to reflect weight change.</b>');
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


    class CriticalsPanel {
        constructor({type, menu, zones, renderAttrs, moreinfoDialog}) {
            this.$el = jQuery(`<ul id="sauce-infopanel" class="pagenav"/>`);
            this.$el.insertAfter(jQuery('#pagenav').first());
            this.type = type;
            this.menu = menu;
            this.sourceKey = `${type}_source`;
            this.renderAttrs = renderAttrs;
            this.$el.on('click', '.group tr[data-zone-value]', async ev => {
                ev.stopPropagation();  // prevent click-away detection from closing dialog.
                const row = ev.currentTarget;
                openMoreinfoDialog(await moreinfoDialog({
                    startTime: Number(row.dataset.startTime),
                    endTime: Number(row.dataset.endTime),
                    zone: zones.filter(x => x.value == row.dataset.zoneValue)[0],
                    source: this._selectedSource,
                    anchorEl: row
                }), row);
                sauce.rpc.reportEvent('MoreInfoDialog', 'open',
                    `${this.source}-${row.dataset.zoneValue}`);
            });
            this.$el.on('click', '.drop-down-menu .options li[data-source]', async ev => {
                await this.setSelectedSource(ev.currentTarget.dataset.source);
                await this.render();
            });

        }

        async render() {
            const source = await this.getSelectedSource();
            const template = await getTemplate('criticals.html');
            this.$el.html(await template(Object.assign({
                menuInfo: this.menu.map(x => ({source: x, tooltip: x + '_tooltip'})),
                source,
                sourceTooltip: source + '_tooltip',
            }, await this.renderAttrs.call(this, source))));
            requestAnimationFrame(navHeightAdjustments);
        }

        async getSelectedSource() {
            let lastKnown;
            if (!this._selectedSource) {
                const zonesSettings = await sauce.rpc.storageGet('analysis_critical_zones');
                lastKnown = zonesSettings && zonesSettings[`${this.type}_source`];
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
            await sauce.rpc.storageUpdate('analysis_critical_zones', {[key]: source});
        }
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
            np = sauce.power.calcNP(corrected.values());
            if (ctx.ftp) {
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
                menu.push('critical_power');
                if (!isWattEstimate) {
                    menu.push('critical_np');
                }
            }
            if (hrStream) {
                menu.push('critical_hr');
            }
            if (altStream) {
                menu.push('critical_vam');
            }
            if (!menu.length) {
                return;
            }
            const savedZones = await sauce.rpc.storageGet('analysis_critical_zones');
            const allZones = (savedZones && savedZones.periods) || defaultCritPeriods;
            const zones = allZones.filter(x => x.value <= elapsedTime);
            for (const zone of zones) {
                if (!zone.label) {
                    zone.label = timeFormatter.abbreviated(zone.value).replace(/ 0<abbr.*?>s<\/abbr>/, '');
                }
            }
            const critPanel = new CriticalsPanel({
                type: 'ride',
                menu,
                zones,
                moreinfoDialog: moreinfoRideDialog,
                renderAttrs: async source => {
                    const rows = [];
                    const attrs = {};
                    if (source === 'critical_power') {
                        const prefix = isWattEstimate ? '~' : '';
                        attrs.isWattEstimate = isWattEstimate;
                        for (const zone of zones) {
                            if (isWattEstimate && zone.value < 300) {
                                continue;
                            }
                            const roll = sauce.power.critPower(zone.value, timeStream, wattsStream);
                            if (roll) {
                                const value = prefix + Math.round(roll.avg()).toLocaleString();
                                rows.push({
                                    zoneValue: zone.value,
                                    label: zone.label,
                                    value,
                                    unit: 'w',
                                    startTime: roll.firstTimestamp(),
                                    endTime: roll.lastTimestamp(),
                                });
                            }
                        }
                    } else if (source === 'critical_np') {
                        for (const zone of zones) {
                            if (zone.value < 900) {
                                continue;  // NP is only valid for ~20min+.
                            }
                            const roll = sauce.power.critNP(zone.value, timeStream, wattsStream);
                            if (roll && roll.np()) {
                                rows.push({
                                    zoneValue: zone.value,
                                    label: zone.label,
                                    value: Math.round(roll.np()).toLocaleString(),
                                    unit: 'w',
                                    startTime: roll.firstTimestamp(),
                                    endTime: roll.lastTimestamp(),
                                });
                            }
                        }
                    } else if (source === 'critical_hr') {
                        for (const zone of zones) {
                            if (zone.value < minHRTime) {
                                continue;
                            }
                            const roll = sauce.data.critAverage(zone.value, timeStream, hrStream, {moving: true});
                            if (!roll) {
                                break;  // No longer filling, so discontinue searching.
                            }
                            if (roll) {
                                rows.push({
                                    zoneValue: zone.value,
                                    label: zone.label,
                                    value: Math.round(roll.avg({moving: true})).toLocaleString(),
                                    unit: 'bpm',
                                    startTime: roll.firstTimestamp(),
                                    endTime: roll.lastTimestamp(),
                                });
                            }
                        }
                    } else if (source === 'critical_vam') {
                        const vamStream = createVAMStream(timeStream, altStream);
                        for (const zone of zones) {
                            if (zone.value < minVAMTime) {
                                continue;
                            }
                            const roll = sauce.data.critAverage(zone.value, timeStream, vamStream);
                            if (roll) {
                                rows.push({
                                    zoneValue: zone.value,
                                    label: zone.label,
                                    value: Math.round(roll.avg()).toLocaleString(),
                                    unit: 'Vm/h',
                                    startTime: roll.firstTimestamp(),
                                    endTime: roll.lastTimestamp(),
                                });
                            }
                        }
                    }
                    return Object.assign(attrs, {rows});
                }
            });
            jQuery('#pagenav').first().after(critPanel.$el);
            await critPanel.render();
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
        const gradeDistStream = await fetchStream('grade_adjusted_distance');
        let power;
        if (wattsStream) {
            const corrected = sauce.power.correctedPower(timeStream, wattsStream);
            power = corrected.kj() * 1000 / movingTime;
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
                menu.push('critical_pace');
            }
            if (gradeDistStream) {
                menu.push('critical_gap');
            }
            if (hrStream) {
                menu.push('critical_hr');
            }
            if (altStream) {
                menu.push('critical_vam');
            }
            if (!menu.length) {
                return;
            }
            const savedZones = await sauce.rpc.storageGet('analysis_critical_zones');
            const zones = (savedZones && savedZones.distances) || defaultCritDistances;
            for (const zone of zones) {
                if (!zone.label) {
                    if (zone.value < 1000) {
                        zone.label = `${zone.value} <abbr class="unit short" title="meters">m</abbr>`;
                    } else {
                        const miles = zone.value / metersPerMile;
                        if (isRoughlyEqual(miles, 13.1) ||
                            isRoughlyEqual(miles, 26.2) ||
                            isRoughlyEqual(miles, Math.round(miles))) {
                            zone.label = imperialDistanceFormatter.abbreviated(zone.value);
                        } else {
                            zone.label = metricDistanceFormatter.abbreviated(zone.value);
                        }
                    }
                    zone.label = zone.label.replace(/\.0 <abbr/, ' <abbr');
                }
            }
            const critPanel = new CriticalsPanel({
                type: 'run',
                menu,
                zones,
                moreinfoDialog: moreinfoRunDialog,
                renderAttrs: async source => {
                    const rows = [];
                    const attrs = {};
                    if (source === 'critical_pace') {
                        const unit = '/' + distanceFormatter.shortUnitKey();
                        for (const zone of zones) {
                            const roll = sauce.pace.bestPace(zone.value, timeStream, distStream);
                            if (roll) {
                                rows.push({
                                    zoneValue: zone.value,
                                    label: zone.label,
                                    value: humanPace(roll.avg()),
                                    unit,
                                    startTime: roll.firstTimestamp(),
                                    endTime: roll.lastTimestamp(),
                                });
                            }
                        }
                    } else if (source === 'critical_gap') {
                        const unit = '/' + distanceFormatter.shortUnitKey();
                        for (const zone of zones) {
                            const roll = sauce.pace.bestPace(zone.value, timeStream, gradeDistStream);
                            if (roll) {
                                rows.push({
                                    zoneValue: zone.value,
                                    label: zone.label,
                                    value: humanPace(roll.avg()),
                                    unit,
                                    startTime: roll.firstTimestamp(),
                                    endTime: roll.lastTimestamp(),
                                });
                            }
                        }
                    }
                    return Object.assign(attrs, {rows});
                }
            });
            jQuery('#pagenav').first().after(critPanel.$el);
            await critPanel.render();
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
        const start = getStreamTimeIndex(startTime);
        const end = getStreamTimeIndex(endTime);
        pageView.router().changeMenuTo(`analysis/${start}/${end}`);
    }


    async function moreinfoRideDialog({startTime, endTime, zone, source, anchorEl}) {
        let fullWattsStream = await fetchStream('watts');
        if (!fullWattsStream) {
            fullWattsStream = await fetchStream('watts_calc');
        }
        let roll;
        if (fullWattsStream) {
            const power = sauce.power.correctedPower(await fetchStream('time'), fullWattsStream);
            roll = power.slice(startTime, endTime);
        }
        const avgPower = roll && roll.avg();
        const rollValues = roll && roll.values();
        const wKg = ctx.weight && avgPower / ctx.weight;
        const elapsedTime = endTime - startTime;
        const rank = sauce.power.rank(elapsedTime, wKg, ctx.gender);
        // startTime and endTime can be pad based values with corrected power sources.
        // Use non padded values for other streams.
        const startTS = roll ? roll.firstTimestamp({noPad: true}) : startTime;
        const endTS = roll ? roll.lastTimestamp({noPad: true}) : endTime;
        const timeStream = await fetchStreamTimeRange('time', startTS, endTS);
        const hrStream = await fetchStreamTimeRange('heartrate', startTS, endTS);
        const altStream = await fetchSmoothStreamTimeRange('altitude', null, startTS, endTS);
        const altChanges = altStream && altitudeChanges(altStream);
        const gradeStream = altStream && await fetchStreamTimeRange('grade_smooth', startTS, endTS);
        const cadenceStream = await fetchStreamTimeRange('cadence', startTS, endTS);
        const heading = await sauce.locale.getMessage(`analysis_${source}`);
        const textLabel = jQuery(`<div>${zone.label}</div>`).text();
        const template = await getTemplate('criticals-ride-moreinfo.html');
        const $dialog = jQuery(await template({
            title: `${heading}: ${textLabel}`,
            startsAt: humanTime(startTime),
            wKg,
            power: roll && {
                avg: avgPower,
                max: sauce.data.max(rollValues),
                np: sauce.power.calcNP(rollValues),
            },
            rank,
            hr: hrStream && {
                min: sauce.data.min(hrStream),
                avg: sauce.data.avg(hrStream),
                max: sauce.data.max(hrStream),
            },
            cadence: cadenceStream && sauce.data.avg(cadenceStream),
            elevation: (gradeStream && altChanges) && {
                grade: sauce.data.avg(gradeStream),
                gain: humanElevation(altChanges.gain),
                loss: humanElevation(altChanges.loss),
                vam: elapsedTime >= minVAMTime && (altChanges.gain / elapsedTime) * 3600,
            },
            elevationUnit: elevationFormatter.shortUnitKey(),
            distUnit: distanceFormatter.shortUnitKey(),
            distUnitLong: distanceFormatter.longUnitKey(),
        }));
        $dialog.dialog({
            resizable: false,
            width: 240,
            dialogClass: 'sauce-dialog',
            position: {
                my: 'left center',
                at: 'right center',
                of: anchorEl
            },
            buttons: {
                "Close": () => $dialog.dialog('close'),
                "Analysis View": () => {
                    changeToAnalysisView(startTS, endTS);
                    $dialog.dialog('close');
                }
            }
        });
        let graphData;
        let graphFormatter;
        let graphColorSteps;
        if (source === 'critical_power' || source === 'critical_np') {
            graphData = rollValues;
            graphFormatter = x => `${Math.round(x).toLocaleString()}<abbr class="unit short">w</abbr>`;
            graphColorSteps = [0, 100, 400, 1200];
        } else if (source === 'critical_hr') {
            graphData = hrStream;
            graphFormatter = x => `${Math.round(x)}<abbr class="unit short">bpm</abbr>`;
            graphColorSteps = [40, 100, 150, 200];
        } else if (source === 'critical_vam') {
            graphData = createVAMStream(timeStream, altStream);
            graphFormatter = x => `${Math.round(x)}<abbr class="unit short">Vm/h</abbr>`;
            graphColorSteps = [-500, 500, 1000, 2000];
        }

        if (graphData && graphData.length) {
            if (graphData.length > 120) {
                graphData = await sauce.data.resample(graphData, 120);
            }
            const graphMin = Math.max(0, sauce.data.min(graphData) * 0.75);
            $dialog.find('.sauce-sparkline').sparkline(graphData, {
                type: 'line',
                width: '100%',
                height: 56,
                lineColor: '#EA400DA0',
                fillColor: {
                    type: 'gradient',
                    opacity: 0.6,  // use this instead of rgba colors (it's technical)
                    steps: [{
                        value: graphColorSteps[0],
                        color: '#f0f0f0'
                    }, {
                        value: graphColorSteps[1],  // ~easy
                        color: '#fd6d1d'
                    }, {
                        value: graphColorSteps[2],  // ~hard
                        color: '#780271'
                    }, {
                        value: graphColorSteps[3],  // ~sprint
                        color: '#000'
                    }]
                },
                chartRangeMin: graphMin,
                normalRangeMin: graphMin,
                normalRangeMax: sauce.data.avg(graphData),
                tooltipFormatter: (_, _2, data) => graphFormatter(data.y)
            });
        }
        $dialog.find('.start_time_link').on('click',() => {
            changeToAnalysisView(startTS, endTS);
            $dialog.dialog('close');
        });
        return $dialog;
    }


    async function moreinfoRunDialog({startTime, endTime, zone, source, anchorEl}) {
        const timeStream = await fetchStreamTimeRange('time', startTime, endTime);
        const distStream = await fetchStreamTimeRange('distance', startTime, endTime);
        const roll = new sauce.data.RollingPace(null);
        roll.import(timeStream, distStream);
        const elapsedTime = endTime - startTime;
        const elapsed = humanTime(elapsedTime);
        const velocityStream = await fetchStreamTimeRange('velocity_smooth', startTime, endTime);
        const hrStream = await fetchStreamTimeRange('heartrate', startTime, endTime);
        const gradeDistStream = await fetchStreamTimeRange('grade_adjusted_distance', startTime, endTime);
        const cadenceStream = await fetchStreamTimeRange('cadence', startTime, endTime);
        const altStream = await fetchSmoothStreamTimeRange('altitude', null, startTime, endTime);
        const altChanges = altStream && altitudeChanges(altStream);
        const gradeStream = altStream && await fetchStreamTimeRange('grade_smooth', startTime, endTime);
        const maxVelocity = sauce.data.max(velocityStream);
        const heading = await sauce.locale.getMessage(`analysis_${source}`);
        const textLabel = jQuery(`<div>${zone.label}</div>`).text();
        const template = await getTemplate('bestpace-moreinfo.html');
        const gap = gradeDistStream && streamDelta(gradeDistStream) / elapsedTime;
        const $dialog = jQuery(await template({
            title: `${heading}: ${textLabel}`,
            startsAt: humanTime(startTime),
            pace: {
                avg: humanPace(roll.avg()),
                max: humanPace(maxVelocity, {velocity: true}),
                gap: gap && humanPace(gap, {velocity: true}),
            },
            elapsed,
            hr: hrStream && {
                min: sauce.data.min(hrStream),
                avg: sauce.data.avg(hrStream),
                max: sauce.data.max(hrStream),
            },
            cadence: cadenceStream && sauce.data.avg(cadenceStream) * 2,
            elevation: (gradeStream && altChanges) && {
                grade: sauce.data.avg(gradeStream),
                gain: humanElevation(altChanges.gain),
                loss: humanElevation(altChanges.loss),
                vam: elapsedTime >= minVAMTime && (altChanges.gain / elapsedTime) * 3600,
            },
            elevationUnit: elevationFormatter.shortUnitKey(),
            distUnit: distanceFormatter.shortUnitKey(),
            distUnitLong: distanceFormatter.longUnitKey(),
        }));
        $dialog.dialog({
            resizable: false,
            width: 240,
            dialogClass: 'sauce-dialog',
            position: {
                my: 'left center',
                at: 'right center',
                of: anchorEl
            },
            buttons: {
                "Close": () => $dialog.dialog('close'),
                "Analysis View": () => {
                    changeToAnalysisView(startTime, endTime);
                    $dialog.dialog('close');
                }
            }
        });
        let graphData;
        if (velocityStream.length > 120) {
            graphData = await sauce.data.resample(velocityStream, 120);
        } else if (velocityStream.length > 1) {
            graphData = velocityStream;
        }
        if (graphData) {
            const minVelocity = sauce.data.min(graphData);
            const chartMin = Math.max(0, minVelocity * 0.75);
            $dialog.find('.sauce-sparkline').sparkline(graphData, {
                type: 'line',
                width: '100%',
                height: 56,
                lineColor: '#EA400DA0',
                fillColor: {
                    type: 'gradient',
                    opacity: 0.6,  // use this instead of rgba colors (it's technical)
                    steps: [{
                        value: 0.5,  // Slow Walking
                        color: '#f0f0f0'
                    }, {
                        value: 2,  // Running slow
                        color: '#fd6d1d'
                    }, {
                        value: 5,  // Running fast
                        color: '#780271'
                    }, {
                        value: 10,  // Usain bolt!
                        color: '#000'
                    }]
                },
                chartRangeMin: chartMin,
                normalRangeMin: chartMin,
                normalRangeMax: sauce.data.avg(graphData),
                tooltipFormatter: (_, _2, data) =>
                    humanPace(data.y, {velocity: true, html: true, suffix: true})
            });
        }
        $dialog.find('.start_time_link').on('click',() => {
            changeToAnalysisView(startTime, endTime);
            $dialog.dialog('close');
        });
        return $dialog;
    }


    async function updateSideNav() {
        const pageNav = document.querySelector('ul#pagenav');
        // Add an analysis link to the nav if not there already.
        if (pageNav.querySelector('[data-menu="analysis"]')) {
            return;
        }
        const id = ctx.activity.id;
        const analysisTitle = await sauce.locale.getMessage('analysis_title');
        const analysisLink = document.createElement('li');
        analysisLink.innerHTML = `<a data-menu="analysis" href="/activities/${id}/analysis">${analysisTitle}</a>`;
        const overview = pageNav.querySelector('[data-menu="overview"]').closest('li');
        pageNav.insertBefore(analysisLink, overview.nextSibling);
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
            if (ctx.activity.isRun()) {
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


    async function load() {
        const activity = pageView && pageView.activity();
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
        sendGAPageView(type);  // bg okay
        if (start) {
            ctx.athlete = pageView.activityAthlete();
            ctx.activity = await fetchFullActivity();
            ctx.gender = ctx.athlete.get('gender') === 'F' ? 'female' : 'male';
            await Promise.all([
                getWeightInfo(ctx.athlete.id).then(x => Object.assign(ctx, x)),
                getFTPInfo(ctx.athlete.id).then(x => Object.assign(ctx, x)),
            ]);
            updateSideNav();  //bg okay
            attachExporters();  // bg okay
            attachComments();  // bg okay
            await start()
        } else {
            console.info("Unsupported activity type:", type);
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
                                src="${sauce.extURL}images/icon64.png"/>`;
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
        const localTime = ctx.activity.get('startDateLocal') * 1000;
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
        const realStartTime = ctx.activity.get('start_time');
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
        const serializer = new Serializer(name, desc, ctx.activity.get('type'), start);
        serializer.start();
        serializer.loadStreams(streams);
        download(serializer.toFile());
    }


    function submitComment(comment) {
        pageView.commentsController().comment('Activity', ctx.activity.id, comment);
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
            for (const x of pageView.commentsController().getFromHash(`Activity-${ctx.activity.id}`)) {
                comments.push({
                    tokens: x.comment,
                    athlete: x.athlete,
                    timeago: sauce.time.ago(new Date(jQuery(x.timestamp).attr('datetime'))),
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
        if (row.querySelector(':scope > td.sauce-mark')) {
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
        const segments = document.querySelector('table.segments');
        if (segments && sauce.options['analysis-segment-badges']) {
            const segmentsMutationObserver = new MutationObserver(_.debounce(addSegmentBadges, 200));
            segmentsMutationObserver.observe(segments, {
                childList: true,
                attributes: false,
                characterData: false,
                subtree: true,
            });
            try {
                addSegmentBadges();
            } catch(e) {
                console.error("Problem adding segment badges!", e);
                sauce.rpc.reportError(e);
            }
        }
        jQuery('body').on('click', '.rank_badge', async ev => {
            closeCurrentMoreinfoDialog();
            const powerProfileTpl = await getTemplate('power-profile-help.html');
            const $dialog = dialogPrompt(
                'Power Profile Badges Explained',
                await powerProfileTpl(),
                {width: 600});
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
            const power = pageView.powerController && pageView.powerController();
            let stravaFtp;
            if (power) {
                await new Promise(resolve => power.deferred.done(resolve));
                stravaFtp = power.get('athlete_ftp');
            } else {
                /* Sometimes you can get it from the activity.  I think this only
                 * works when you are the athlete in the activity. */
                stravaFtp = ctx.activity.get('ftp');
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


    async function _updateAnalysisStats(start, end) {
        const isRun = ctx.activity.isRun();
        const prefetchStreams = ['time', 'timer_time', 'moving', 'altitude', 'watts', 'grade_smooth'];
        if (isRun) {
            Array.prototype.push.apply(prefetchStreams, ['grade_adjusted_distance', 'distance']);
        }
        await fetchStreams(prefetchStreams);  // better load perf
        const timeStream = await fetchStream('time', start, end);
        const movingTime = await getMovingTime(start, end);
        const elapsedTime = streamDelta(timeStream);
        const pausedTime = elapsedTime - movingTime;
        const tplData = {
            isRun,
            elapsed: humanTime(elapsedTime),
            moving: humanTime(movingTime),
            paused: timeFormatter.abbreviatedNoTags(pausedTime, null, false),
            weight: ctx.weight,
            elUnit: elevationFormatter.shortUnitKey(),
            distUnit: distanceFormatter.shortUnitKey(),
            samples: timeStream.length,
        };
        const altStream = await fetchSmoothStream('altitude', null, start, end);
        if (altStream) {
            const altChanges = altitudeChanges(altStream);
            const gradeStream = await fetchStream('grade_smooth', start, end);
            tplData.elevation = {
                gain: altChanges.gain && humanElevation(altChanges.gain),
                grade: gradeStream && sauce.data.avg(gradeStream),
                loss: altChanges.loss && humanElevation(altChanges.loss),
                vam: elapsedTime >= minVAMTime && (altChanges.gain / elapsedTime) * 3600
            };
        }
        let kj;
        const wattsStream = await fetchStream('watts', start, end);
        if (wattsStream) {
            // Use idealGap and maxGap from whole data stream for cleanest results.
            if (!ctx.idealGap) {
                const gaps = sauce.data.recommendedTimeGaps(await fetchStream('time'));
                ctx.idealGap = gaps.ideal;
                ctx.maxGap = gaps.max;
            }
            const roll = sauce.power.correctedPower(timeStream, wattsStream, ctx.idealGap, ctx.maxGap);
            tplData.power = {
                elapsed: roll.avg(),
                np: sauce.power.calcNP(roll.values()),
                moving: roll.kj() * 1000 / movingTime
            };
            kj = roll.kj();
        }
        if (isRun) {
            const gradeDistStream = await fetchStream('grade_adjusted_distance', start, end);
            const distStream = await fetchStream('distance', start, end);
            const gradeDistance = streamDelta(gradeDistStream);
            const distance = streamDelta(distStream);
            if (!wattsStream && gradeDistance && ctx.weight) {
                kj = sauce.pace.work(ctx.weight, gradeDistance);
                tplData.power = {
                    moving: kj * 1000 / movingTime,
                    elapsed: kj * 1000 / elapsedTime
                };
            }
            tplData.pace = {
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
        jQuery('#sauce-menu').menu();
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
        if (!ctx.$analysisStats) {
            const $el = jQuery('.chart');
            if (!$el.length) {
                console.warn("Update analysis rescheduled due to DOM unreadiness.");
                setTimeout(() => schedUpdateAnalysisStats(null), 100);
                return;
            }
            attachAnalysisStats($el);
        }
        if (!ctx.activity) {
            console.warn("activity not ready yet, rescheduling analysis stats update");
            setTimeout(() => schedUpdateAnalysisStats(null), 100);
            return;
        }
        const id = ++_schedUpdateAnalysisId;
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
            _schedUpdateAnalysisHash = hash;
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
            {name: 'cadence', formatter: ctx.activity.isRun() ? x => x * 2 : null},
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
        const $dialog = dialogPrompt('Raw Data', `<pre>${initialData}</pre>`, {
            width: `calc(${initialWidth}ch + 4em)`,
            dialogClass: 'sauce-big-data',
            buttons: {
                "Ok": () => $dialog.dialog('close'),
                "Download": () => {
                    const range = start && end ? `-${start}-${end}` : '';
                    const name = `${ctx.activity.id}${range}.csv`;
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
        const $dialog = dialogPrompt('Graph Data', '<div style="padding: 0.5em" class="graphs"></div>', {
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
            // We extend the nav sidebar, so we need to modify this routine to make the menu
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



    return {
        load,
        fetchStream,
        fetchStreams,
        dialogPrompt,
        humanWeight,
        humanTime,
        humanPace,
        humanElevation,
        schedUpdateAnalysisStats,
        attachAnalysisStats,
    };
});


if (!sauce.testing) {
    (async function() {
        await sauce.analysisReady;
        try {
            await sauce.analysis.load();
        } catch(e) {
            await sauce.rpc.reportError(e);
            throw e;
        }
    })();
}
