/* global Strava, sauce, jQuery, pageView, jsfit */

sauce.ns('analysis', ns => {
    'use strict';

    const commonStreams = [
        'time', 'timer_time', 'heartrate', 'altitude', 'distance', 'moving',
        'grade_smooth', 'velocity_smooth', 'cadence'
    ];
    const manifests = {
        'Ride': {
            start: startRideActivity,
            streams: new Set(commonStreams.concat(['watts', 'watts_calc'])),
        },
        'Run': {
            start: startRunActivity,
            streams: new Set(commonStreams.concat(['watts', 'grade_adjusted_distance'])),
        },
        'Swim': {
            start: startSwimActivity,
            streams: new Set(commonStreams),
        },
        'Other': {
            start: startOtherActivity,
            streams: new Set(commonStreams.concat(['watts'])),
        },
        'StationaryOther': {
            start: startOtherActivity,
            streams: new Set(commonStreams.concat(['watts'])),
        }
    };

    let _resolvePrepared;
    const ctx = {
        ready: false,
        prepared: new Promise(resolve => {
            _resolvePrepared = () => {
                ctx.ready = true;
                resolve();
            };
        })
    };

    const tplUrl = sauce.extUrl + 'templates';

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
        {value: 10800},
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
        {value: Math.round(metersPerMile * 13.1), filter: a => a.isRun()},
        {value: Math.round(metersPerMile * 26.2), filter: a => a.isRun()},
        {value: 50000},
        {value: 100000},
        {value: Math.round(metersPerMile * 100)},
        {value: 200000},
    ];

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
        if (pageView.streamsRequest.pending) {
            // We must wait until the pageView.streamsRequest has completed.
            // Stream transform functions fail otherwise.
            await pageView.streamsRequest.pending;
        }
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
                const p = new Promise((resolve, reject) => {
                    streams.fetchStreams(fetching, {
                        success: resolve,
                        error: (streams, ajax) =>
                            reject(new Error(`Fetch streams failed: ${ajax.status} ${ajax.statusText}`))
                    });
                });
                for (const x of fetching) {
                    pending.set(x, p);
                }
                try {
                    await p;
                } finally {
                    for (const x of fetching) {
                        pending.delete(x);
                    }
                }
                for (const x of fetching) {
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
        period = period || 10;
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


    function getStreamIndexTime(index) {
        const timeStream = _getStream('time');
        return timeStream[index];
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


    function editableField($field, options) {
        const $input = $field.find('input');
        const $link = $field.find('a');
        $input.on('keyup', async ev => {
            if (ev.keyCode == 27 /* escape */) {
                $field.removeClass('editing');
                return;
            } else if (ev.keyCode != 13 /* enter */) {
                return;
            }
            let cleanValue;
            try {
                cleanValue = options.validator($input.val());
            } catch(invalid) {
                modal({
                    title: invalid.title,
                    body: invalid.message
                });
                return;
            }
            $link.text('...');
            $field.removeClass('editing');
            if (options.onSubmit) {
                await options.onSubmit(cleanValue);
            }
        });
        $input.on('blur', async ev => {
            if (!$field.hasClass('editing')) {
                return;  // ignore if not editing (e.g. escape key was pressed)
            }
            // Save valid value but don't reload page..
            let cleanValue;
            try {
                cleanValue = options.validator($input.val());
            } catch(e) {
                return;
            }
            if (options.onBlur) {
                await options.onBlur(cleanValue);
            }
            $link.text(cleanValue);
            $field.addClass('dirty');
        });
        $link.on('click', () => {
            $field.addClass('editing');
            const padding = $input.outerWidth() - $input.innerWidth();
            $input.css('width', `calc(${padding}px + ${$input.data('width')})`);
            $input.focus();
        });
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
        const $field = $parent.find('.sauce-editable-field.ftp');
        async function save(ftp_override) {
            await updateAthleteInfo(ctx.athlete, {ftp_override});
        }
        editableField($field, {
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
            onBlur: save,
            onSubmit: async v => {
                await save(v);
                modal({
                    title: 'Reloading...',
                    body: '<b>Reloading page to reflect FTP change.</b>'
                });
                try {
                    await sauce.rpc.reportEvent('AthleteInfo', 'edit', 'ftp');
                } finally {
                    location.reload();
                }
            }
        });
    }


    function attachEditableWeight($parent) {
        const $field = $parent.find('.sauce-editable-field.weight');
        async function save(v) {
            const weight_override = weightUnconvert(v);
            await updateAthleteInfo(ctx.athlete, {weight_override});
        }
        editableField($field, {
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
            onBlur: save,
            onSubmit: async v => {
                await save(v);
                modal({
                    title: 'Reloading...',
                    body: '<b>Reloading page to reflect weight change.</b>'
                });
                try {
                    await sauce.rpc.reportEvent('AthleteInfo', 'edit', 'weight');
                } finally {
                    location.reload();
                }
            }
        });
    }


    function navHeightAdjustments() {
        // The main site's side nav is absolute positioned, so if the primary view is too short
        // the footer will overflow and mess everything up.  Add a min-height to the view to
        // prevent the footer from doing this.
        sauce.rpc.auditStackFrame();
        const sidenav = document.querySelector('nav.sidenav');
        const minHeight = sidenav.offsetHeight;
        document.querySelector('.view > .page.container').style.minHeight = `${minHeight}px`;
        adjustSlideMenu();
    }


    async function renderTertiaryStats(attrs) {
        sauce.rpc.auditStackFrame();
        const template = await getTemplate('tertiary-stats.html');
        const $stats = jQuery(await template(Object.assign({
            optionsIcon: await sauce.images.asText('fa/cog-duotone.svg'),
        }, attrs)));
        attachEditableFTP($stats);
        attachEditableWeight($stats);
        jQuery('.activity-stats .inline-stats').last().after($stats);
    }


    class PeakEffortsPanel {
        constructor({type, menu, renderAttrs, infoDialog}) {
            sauce.rpc.auditStackFrame();
            this.$el = jQuery(`<ul id="sauce-infopanel" class="pagenav"/>`);
            this.type = type;
            this.menu = menu;
            this.sourceKey = `${type}_source`;
            this.renderAttrs = renderAttrs;
            this.$el.on('click', '.group tr[data-range-value]', async ev => {
                ev.stopPropagation();  // prevent click-away detection from closing dialog.
                const row = ev.currentTarget;
                try {
                    await infoDialog({
                        startTime: Number(row.dataset.startTime),
                        endTime: Number(row.dataset.endTime),
                        wallStartTime: Number(row.dataset.wallStartTime),
                        wallEndTime: Number(row.dataset.wallEndTime),
                        label: row.dataset.rangeLabel,
                        icon: row.dataset.rangeIcon,
                        source: this._selectedSource,
                        originEl: row
                    });
                } catch (e) {
                    sauce.rpc.reportError(e);
                    throw e;
                }
                sauce.rpc.reportEvent('InfoDialog', 'open',
                    `${this._selectedSource}-${row.dataset.rangeValue}`);
            });
            this.$el.on('click', '.drop-down-menu .options li[data-source]', async ev => {
                await this.setSelectedSource(ev.currentTarget.dataset.source);
                await this.render();
            });
        }

        async render() {
            sauce.rpc.auditStackFrame();
            const source = await this.getSelectedSource();
            const template = await getTemplate('peak-efforts.html');
            this.$el.html(await template(Object.assign({
                menuInfo: await Promise.all(this.menu.map(async x => ({
                    source: x,
                    icon: await sauce.images.asText(ctx.peakIcons[x]),
                    tooltip: x + '_tooltip'
                }))),
                source,
                sourceTooltip: source + '_tooltip',
                sourceIcon: await sauce.images.asText(ctx.peakIcons[source]),
            }, await this.renderAttrs.call(this, source))));
            navHeightAdjustments();
        }

        async getSelectedSource() {
            let lastKnown;
            if (!this._selectedSource) {
                const ranges = await sauce.rpc.storageGet('analysis_peak_ranges');
                lastKnown = ranges && ranges[this.sourceKey];
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
            this._selectedSource = source;
            await sauce.rpc.storageUpdate('analysis_peak_ranges', {[this.sourceKey]: source});
            sauce.rpc.reportEvent('PeakRange', 'select', source);
        }
    }


    function _rangeRollToRow({range, roll, value, unit, style}) {
        return {
            rangeValue: range.value,
            rangeLabel: range.label,
            value,
            unit,
            startTime: roll.firstTime({noPad: true}),
            endTime: roll.lastTime({noPad: true}),
            wallStartTime: roll.firstTime(),
            wallEndTime: roll.lastTime(),
            style
        };
    }


    function hrRangesToRows(ranges, timeStream, hrStream) {
        const unit = ctx.hrFormatter.shortUnitKey();
        const rows = [];
        for (const range of ranges.filter(x => x.value >= minHRTime)) {
            const roll = sauce.data.peakAverage(range.value, timeStream, hrStream, {active: true});
            if (roll) {
                const value = humanNumber(roll.avg({active: true}));
                rows.push(_rangeRollToRow({range, roll, value, unit}));
            }
        }
        return rows;
    }


    function cadenceRangesToRows(ranges, timeStream, cadenceStream) {
        const unit = ctx.cadenceFormatter.shortUnitKey();
        const rows = [];
        for (const range of ranges.filter(x => x.value >= minHRTime)) {
            const roll = sauce.data.peakAverage(range.value, timeStream, cadenceStream,
                {active: true, ignoreZeros: true});
            if (roll) {
                const value = ctx.cadenceFormatter.format(roll.avg({active: true}));
                rows.push(_rangeRollToRow({range, roll, value, unit}));
            }
        }
        return rows;
    }


    function powerRangesToRows(ranges, timeStream, wattsStream, estimate) {
        const rows = [];
        const prefix = estimate ? '~' : '';
        for (const range of ranges.filter(x => !estimate || x.value >= minWattEstTime)) {
            const roll = sauce.power.peakPower(range.value, timeStream, wattsStream);
            if (roll) {
                const avg = roll.avg();
                const value = prefix + humanNumber(avg);
                //const rank = (ctx.weight && avg) && sauce.power.rank(roll.elapsed(), avg / ctx.weight, ctx.gender);
                let style;
                //if (rank) {
                //    const pct = Math.round(rank.level * 100);
                //    style = `background-image: linear-gradient(90deg, #f002 0% ${pct}%, transparent ${pct}%);`;
                //}
                rows.push(_rangeRollToRow({range, roll, value, unit: 'w', style}));
            }
        }
        return rows;
    }


    function paceVelocityRangesToRows(ranges, timeStream, distStream) {
        const unit = ctx.paceFormatter.shortUnitKey();
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
                const value = humanNumber((gain / roll.elapsed()) * 3600);
                rows.push(_rangeRollToRow({range, roll, value, unit: 'Vm/h'}));
            }
        }
        return rows;
    }


    function filterPeriodRanges(elapsed, ...filterArgs) {
        return ctx.allPeriodRanges.filter(x => x.value <= elapsed && (!x.filter || x.filter.apply(x, filterArgs)));
    }


    function filterDistRanges(distance, ...filterArgs) {
        return ctx.allDistRanges.filter(x => x.value <= distance && (!x.filter || x.filter.apply(x, filterArgs)));
    }


    function makeWattsSeaLevelStream(wattsStream, altStream) {
        const seaWatts = wattsStream.map((x, i) => sauce.power.seaLevelPower(x, altStream[i]));
        pageView.streams().streamData.add('watts_sealevel', seaWatts);
        return seaWatts;
    }


    async function startRideActivity() {
        sauce.rpc.auditStackFrame();
        const realWattsStream = await fetchStream('watts');
        const timeStream = await fetchStream('time');
        const hrStream = await fetchStream('heartrate');
        const distStream = await fetchStream('distance');
        const cadenceStream = await fetchStream('cadence');
        const altStream = await fetchSmoothStream('altitude');
        const elapsedTime = streamDelta(timeStream);
        const distance = streamDelta(distStream);
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
            if (supportsSeaPower()) {
                makeWattsSeaLevelStream(wattsStream, altStream);
            }
            const corrected = sauce.power.correctedPower(timeStream, wattsStream);
            np = corrected && supportsNP() && corrected.np();
            if (corrected && ctx.ftp) {
                if (np) {
                    // Calculate TSS based on elapsed time when NP is being used.
                    tss = sauce.power.calcTSS(np, elapsedTime, ctx.ftp);
                    intensity = np / ctx.ftp;
                } else {
                    // Calculate TSS based on active time when just avg is available.
                    const activeTime = await getActiveTime();
                    const power = corrected.kj() * 1000 / activeTime;
                    tss = sauce.power.calcTSS(power, activeTime, ctx.ftp);
                    intensity = power / ctx.ftp;
                }
            }
        }
        await renderTertiaryStats({
            weight: humanNumber(ctx.weightFormatter.convert(ctx.weight), 2),
            weightUnit: ctx.weightFormatter.shortUnitKey(),
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
                if (supportsSeaPower()) {
                    menu.push('peak_sp');
                }
            }
            if (distStream) {
                menu.push('peak_pace');
            }
            if (hrStream) {
                menu.push('peak_hr');
            }
            if (cadenceStream) {
                menu.push('peak_cadence');
            }
            if (altStream) {
                menu.push('peak_vam');
            }
            if (!menu.length) {
                return;
            }
            const panel = new PeakEffortsPanel({
                type: 'ride',
                menu,
                infoDialog: rideInfoDialog,
                renderAttrs: async source => {
                    let rows;
                    const attrs = {};
                    const activity = pageView.activity();
                    const periodRanges = filterPeriodRanges(elapsedTime, activity);
                    const distRanges = filterDistRanges(distance, activity);
                    if (source === 'peak_power') {
                        attrs.isWattEstimate = isWattEstimate;
                        rows = powerRangesToRows(periodRanges, timeStream, wattsStream, isWattEstimate);
                    } else if (source === 'peak_sp') {
                        attrs.isWattEstimate = isWattEstimate;
                        const spStream = await fetchStream('watts_sealevel');
                        rows = powerRangesToRows(periodRanges, timeStream, spStream, true);
                    } else if (source === 'peak_pace') {
                        rows = paceVelocityRangesToRows(distRanges, timeStream, distStream);
                    } else if (source === 'peak_np') {
                        rows = [];
                        for (const range of periodRanges.filter(x => x.value >= minNPTime)) {
                            const roll = sauce.power.peakNP(range.value, timeStream, wattsStream);
                            // Use external NP method for consistency.  There are tiny differences because
                            // the peakNP function is a continous rolling avg vs the external method that
                            // only examines the trimmed dateset.
                            const np = roll && roll.np({external: true});
                            if (np) {
                                const value = humanNumber(np);
                                rows.push(_rangeRollToRow({range, roll, value, unit: 'w'}));
                            }
                        }
                    } else if (source === 'peak_hr') {
                        rows = hrRangesToRows(periodRanges, timeStream, hrStream);
                    } else if (source === 'peak_cadence') {
                        rows = cadenceRangesToRows(periodRanges, timeStream, cadenceStream);
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


    async function startSwimActivity() {
        sauce.rpc.auditStackFrame();
        const timeStream = await fetchStream('time');
        const hrStream = await fetchStream('heartrate');
        const distStream = await fetchStream('distance');
        const cadenceStream = await fetchStream('cadence');
        const elapsedTime = streamDelta(timeStream);
        const distance = streamDelta(distStream);
        await renderTertiaryStats({
            weight: humanNumber(ctx.weightFormatter.convert(ctx.weight), 2),
            weightUnit: ctx.weightFormatter.shortUnitKey(),
            weightNorm: humanWeight(ctx.weight),
            weightOrigin: ctx.weightOrigin,
        });
        if (sauce.options['analysis-cp-chart']) {
            const menu = [/*locale keys*/];
            if (distStream) {
                menu.push('peak_pace');
            }
            if (hrStream) {
                menu.push('peak_hr');
            }
            if (cadenceStream) {
                menu.push('peak_cadence');
            }
            if (!menu.length) {
                return;
            }
            const panel = new PeakEffortsPanel({
                type: 'swim',
                menu,
                infoDialog: swimInfoDialog,
                renderAttrs: async source => {
                    const activity = pageView.activity();
                    const periodRanges = filterPeriodRanges(elapsedTime, activity);
                    const distRanges = filterDistRanges(distance, activity);
                    let rows;
                    if (source === 'peak_pace') {
                        rows = paceVelocityRangesToRows(distRanges, timeStream, distStream);
                    } else if (source === 'peak_hr') {
                        rows = hrRangesToRows(periodRanges, timeStream, hrStream);
                    } else if (source === 'peak_cadence') {
                        rows = cadenceRangesToRows(periodRanges, timeStream, cadenceStream);
                    }
                    return {rows};
                }
            });
            attachInfoPanel(panel);
            await panel.render();
        }
    }


    async function startOtherActivity() {
        sauce.rpc.auditStackFrame();
        const realWattsStream = await fetchStream('watts');
        const activeTime = await getActiveTime();
        const timeStream = await fetchStream('time');
        const hrStream = await fetchStream('heartrate');
        const altStream = await fetchSmoothStream('altitude');
        const distStream = await fetchStream('distance');
        const cadenceStream = await fetchStream('cadence');
        const elapsedTime = streamDelta(timeStream);
        const distance = streamDelta(distStream);
        const isWattEstimate = !realWattsStream;
        let wattsStream = realWattsStream;
        if (!wattsStream) {
            wattsStream = await fetchStream('watts_calc');
        }
        let power;
        if (wattsStream) {
            if (supportsSeaPower()) {
                makeWattsSeaLevelStream(wattsStream, altStream);
            }
            const corrected = sauce.power.correctedPower(timeStream, wattsStream);
            power = corrected && corrected.kj() * 1000 / activeTime;
        }
        let tss;
        let intensity;
        if (power && ctx.ftp) {
            tss = sauce.power.calcTSS(power, activeTime, ctx.ftp);
            intensity = power / ctx.ftp;
        }
        await renderTertiaryStats({
            weight: humanNumber(ctx.weightFormatter.convert(ctx.weight), 2),
            weightUnit: ctx.weightFormatter.shortUnitKey(),
            weightNorm: humanWeight(ctx.weight),
            weightOrigin: ctx.weightOrigin,
            ftp: ctx.ftp,
            ftpOrigin: ctx.ftpOrigin,
            intensity,
            tss,
            power,
        });
        if (sauce.options['analysis-cp-chart']) {
            const menu = [/*locale keys*/];
            if (wattsStream) {
                menu.push('peak_power');
                if (supportsSeaPower()) {
                    menu.push('peak_sp');
                }
            }
            if (distStream) {
                menu.push('peak_pace');
            }
            if (hrStream) {
                menu.push('peak_hr');
            }
            if (cadenceStream) {
                menu.push('peak_cadence');
            }
            if (altStream) {
                menu.push('peak_vam');
            }
            if (!menu.length) {
                return;
            }
            const panel = new PeakEffortsPanel({
                type: 'other',
                menu,
                infoDialog: otherInfoDialog,
                renderAttrs: async source => {
                    const activity = pageView.activity();
                    const periodRanges = filterPeriodRanges(elapsedTime, activity);
                    const distRanges = filterDistRanges(distance, activity);
                    let rows;
                    const attrs = {};
                    if (source === 'peak_pace') {
                        rows = paceVelocityRangesToRows(distRanges, timeStream, distStream);
                    } else if (source === 'peak_power') {
                        attrs.isWattEstimate = isWattEstimate;
                        rows = powerRangesToRows(periodRanges, timeStream, wattsStream, isWattEstimate);
                    } else if (source === 'peak_sp') {
                        attrs.isWattEstimate = isWattEstimate;
                        const spStream = await fetchStream('watts_sealevel');
                        rows = powerRangesToRows(periodRanges, timeStream, spStream, true);
                    } else if (source === 'peak_hr') {
                        rows = hrRangesToRows(periodRanges, timeStream, hrStream);
                    } else if (source === 'peak_cadence') {
                        rows = cadenceRangesToRows(periodRanges, timeStream, cadenceStream);
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


    async function startRunActivity() {
        sauce.rpc.auditStackFrame();
        let wattsStream = await fetchStream('watts');
        const activeTime = await getActiveTime();
        const timeStream = await fetchStream('time');
        const hrStream = await fetchStream('heartrate');
        const altStream = await fetchSmoothStream('altitude');
        const distStream = await fetchStream('distance');
        const cadenceStream = await fetchStream('cadence');
        const gradeDistStream = distStream && await fetchGradeDistStream();
        const elapsedTime = streamDelta(timeStream);
        const distance = streamDelta(distStream);
        const isWattEstimate = !wattsStream;
        let power;
        if (!wattsStream && ctx.weight && gradeDistStream) {
            wattsStream = [0];
            for (let i = 1; i < gradeDistStream.length; i++) {
                const dist = gradeDistStream[i] - gradeDistStream[i - 1];
                const time = timeStream[i] - timeStream[i - 1];
                const kj = sauce.pace.work(ctx.weight, dist);
                wattsStream.push(kj * 1000 / time);
            }
            pageView.streams().streamData.add('watts_calc', wattsStream);
        }
        if (wattsStream) {
            if (supportsSeaPower()) {
                makeWattsSeaLevelStream(wattsStream, altStream);
            }
            const corrected = sauce.power.correctedPower(timeStream, wattsStream);
            power = corrected && corrected.kj() * 1000 / activeTime;
        }
        let tss;
        let intensity;
        if (power && ctx.ftp) {
            tss = sauce.power.calcTSS(power, activeTime, ctx.ftp);
            intensity = power / ctx.ftp;
        }
        await renderTertiaryStats({
            weight: humanNumber(ctx.weightFormatter.convert(ctx.weight), 2),
            weightUnit: ctx.weightFormatter.shortUnitKey(),
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
            if (wattsStream) {
                menu.push('peak_power');
                if (supportsSeaPower()) {
                    menu.push('peak_sp');
                }
            }
            if (hrStream) {
                menu.push('peak_hr');
            }
            if (cadenceStream) {
                menu.push('peak_cadence');
            }
            if (altStream) {
                menu.push('peak_vam');
            }
            if (!menu.length) {
                return;
            }
            const panel = new PeakEffortsPanel({
                type: 'run',
                menu,
                infoDialog: runInfoDialog,
                renderAttrs: async source => {
                    const activity = pageView.activity();
                    const periodRanges = filterPeriodRanges(elapsedTime, activity);
                    const distRanges = filterDistRanges(distance, activity);
                    let rows;
                    const attrs = {};
                    if (source === 'peak_pace') {
                        rows = paceVelocityRangesToRows(distRanges, timeStream, distStream);
                    } else if (source === 'peak_gap') {
                        rows = paceVelocityRangesToRows(distRanges, timeStream, gradeDistStream);
                    } else if (source === 'peak_power') {
                        attrs.isWattEstimate = isWattEstimate;
                        rows = powerRangesToRows(periodRanges, timeStream, wattsStream, isWattEstimate);
                    } else if (source === 'peak_sp') {
                        attrs.isWattEstimate = isWattEstimate;
                        const spStream = await fetchStream('watts_sealevel');
                        rows = powerRangesToRows(periodRanges, timeStream, spStream, true);
                    } else if (source === 'peak_hr') {
                        rows = hrRangesToRows(periodRanges, timeStream, hrStream);
                    } else if (source === 'peak_cadence') {
                        rows = cadenceRangesToRows(periodRanges, timeStream, cadenceStream);
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
        const expandedClass = 'sauce-nav-expanded';
        const expanded = document.body.classList.contains(expandedClass);
        const evOptions = {capture: true, passive: false};
        if (expanded) {
            document.removeEventListener('click', onMobileNavClickaway, evOptions);
            document.body.classList.remove(expandedClass);
        } else {
            document.body.classList.add(expandedClass);
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


    function humanWeight(kg) {
        return humanNumber(ctx.weightFormatter.convert(kg), 1);
    }


    function humanTime(seconds) {
        /* Convert seconds to a human string */
        return ctx.timeFormatter.display(seconds);
    }


    function humanDistance(meters, precision) {
        return ctx.distanceFormatter.format(meters, precision || 2);
    }


    function humanPace(raw, options) {
        options = options || {};
        const mps = options.velocity ? raw : 1 / raw;
        const value = ctx.paceFormatter.key === 'distance_per_time' ? mps * 3600 : mps;
        if (options.suffix) {
            if (options.html) {
                return ctx.paceFormatter.abbreviated(value);
            } else {
                return ctx.paceFormatter.formatShort(value);
            }
        } else {
            return ctx.paceFormatter.format(value);
        }
    }


    function humanNumber(value, precision) {
        return sauce.template.helpers.formatNumber(value, precision == null ? 0 : precision);
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
                return ctx.elevationFormatter.formatLong(meters);
            } else {
                return ctx.elevationFormatter.formatShort(meters);
            }
        } else {
            return ctx.elevationFormatter.format(meters);
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
        const chart = document.querySelector('#basic-analysis section.chart');
        if (chart) {
            const $collapsables = jQuery('.collapsable');
            if ($collapsables.queue().length) {
                // Run after animation completes..
                $collapsables.queue(next => {
                    next();
                    chart.scrollIntoView({behavior: 'smooth', block: 'center'});
                });
            } else {
                chart.scrollIntoView({behavior: 'smooth', block: 'center'});
            }
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
            icon: await sauce.images.asText(ctx.peakIcons[options.source]),
            dialogClass: 'sauce-info-dialog',
            body: options.body,
            resizable: false,
            width: 260,
            position: {
                my: 'left center',
                at: 'right center',
                of: options.originEl
            },
            extraButtons: {
                "Analysis View": () => {
                    $dialog.dialog('close');
                    changeToAnalysisView(options.start, options.end);
                }
            }
        });
        $dialog.find('.start_time_link').on('click',() => {
            $dialog.dialog('close');
            changeToAnalysisView(options.start, options.end);
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
            normalRangeColor: '#8885',
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
            tooltipFormatter: (_, __, data) => formatter(data.y)
        });
    }


    async function fetchGradeDistStream(options) {
        options = options || {};
        if (!pageView.activity().isRun()) {
            return;
        }
        if (options.startTime != null && options.endTime != null) {
            return await fetchStreamTimeRange('grade_adjusted_distance', options.startTime,
                options.endTime);
        } else {
            return await fetchStream('grade_adjusted_distance', options.start, options.end);
        }
    }


    let _correctedPower;
    async function correctedPowerTimeRange(wallStartTime, wallEndTime, options) {
        // startTime and endTime can be pad based values with corrected power sources.
        // Using wall time values and starting with full streams gives us the correct
        // padding as the source.
        options = options || {};
        const stream = options.stream || 'watts';
        if (_correctedPower === undefined) {
            _correctedPower = null;
            let fullStream = await fetchStream(stream);
            const isEstimate = !fullStream;
            if (isEstimate) {
                fullStream = await fetchStream('watts_calc');
            }
            if (fullStream) {
                const power = sauce.power.correctedPower(await fetchStream('time'), fullStream);
                if (power) {
                    power.isEstimate = isEstimate;
                    _correctedPower = power;
                }
            }
        }
        if (_correctedPower) {
            const range = _correctedPower.slice(wallStartTime, wallEndTime);
            range.isEstimate = _correctedPower.isEstimate;
            return range;
        }
    }


    function isVirtual() {
        const type = pageView.activity().get('detailedType');
        return type && !!type.match(/Virtual/);
    }


    function supportsSeaPower() {
        return !isVirtual() && !!_getStream('altitude') &&
            !!(_getStream('watts') || _getStream('watts_calc'));
    }


    // XXX more DRY...
    async function rideInfoDialog({startTime, endTime, wallStartTime, wallEndTime, label, source, originEl}) {
        const elapsedTime = wallEndTime - wallStartTime;
        const correctedPower = await correctedPowerTimeRange(wallStartTime, wallEndTime);
        const timeStream = await fetchStreamTimeRange('time', startTime, endTime);
        const distStream = await fetchStreamTimeRange('distance', startTime, endTime);
        const hrStream = await fetchStreamTimeRange('heartrate', startTime, endTime);
        const altStream = await fetchSmoothStreamTimeRange('altitude', null, startTime, endTime);
        const cadenceStream = await fetchStreamTimeRange('cadence', startTime, endTime);
        const velocityStream = await fetchStreamTimeRange('velocity_smooth', startTime, endTime);
        const distance = streamDelta(distStream);
        const heading = await sauce.locale.getMessage(`analysis_${source}`);
        const textLabel = jQuery(`<div>${label}</div>`).text();
        const template = await getTemplate('ride-info-dialog.html');
        const body = await template({
            startsAt: humanTime(wallStartTime),
            power: correctedPower && powerData(correctedPower.kj(), null, elapsedTime, altStream, {
                max: sauce.data.max(correctedPower.values()),
                np: correctedPower.np(),
                estimate: correctedPower.isEstimate
            }),
            pace: distance && {
                avg: humanPace(distance / elapsedTime, {velocity: true}),
                max: humanPace(sauce.data.max(velocityStream), {velocity: true}),
            },
            hr: hrInfo(hrStream),
            hrUnit: ctx.hrFormatter.shortUnitKey(),
            cadence: cadenceStream && ctx.cadenceFormatter.format(sauce.data.avg(cadenceStream)),
            cadenceUnit: ctx.cadenceFormatter.shortUnitKey(),
            elevation: elevationData(altStream, elapsedTime, distance),
            elevationUnit: ctx.elevationFormatter.shortUnitKey(),
            paceUnit: ctx.paceFormatter.shortUnitKey(),
            source,
        });
        const $dialog = await createInfoDialog({
            heading,
            textLabel,
            source,
            body,
            originEl,
            start: startTime,
            end: endTime,
        });
        const $sparkline = $dialog.find('.sauce-sparkline');
        if (source === 'peak_power' || source === 'peak_np') {
            await infoDialogGraph($sparkline, {
                data: correctedPower.values(),
                formatter: x => `${humanNumber(x)}<abbr class="unit short">w</abbr>`,
                colorSteps: [0, 100, 400, 1200]
            });
        } else if (source === 'peak_sp') {
            const correctedSP = await correctedPowerTimeRange(wallStartTime, wallEndTime,
                {stream: 'watts_sealevel'});
            await infoDialogGraph($sparkline, {
                data: correctedSP.values(),
                formatter: x => `~${humanNumber(x)}<abbr class="unit short">w (SP)</abbr>`,
                colorSteps: [0, 100, 400, 1200]
            });
        } else if (source === 'peak_pace') {
            await infoDialogGraph($sparkline, {
                data: velocityStream,
                formatter: x => humanPace(x, {velocity: true, html: true, suffix: true}),
                colorSteps: [4, 12, 20, 28]
            });
        } else if (source === 'peak_hr') {
            const unit = ctx.hrFormatter.shortUnitKey();
            await infoDialogGraph($sparkline, {
                data: hrStream,
                formatter: x => `${humanNumber(x)}<abbr class="unit short">${unit}</abbr>`,
                colorSteps: [40, 100, 150, 200]
            });
        } else if (source === 'peak_cadence') {
            const unit = ctx.cadenceFormatter.shortUnitKey();
            const format = x => ctx.cadenceFormatter.format(x);
            await infoDialogGraph($sparkline, {
                data: cadenceStream,
                formatter: x => `${format(x)}<abbr class="unit short">${unit}</abbr>`,
                colorSteps: [40, 80, 120, 150]
            });
        } else if (source === 'peak_vam') {
            await infoDialogGraph($sparkline, {
                data: createVAMStream(timeStream, altStream).slice(1),  // first entry is always 0
                formatter: x => `${humanNumber(x)}<abbr class="unit short">Vm/h</abbr>`,
                colorSteps: [-500, 500, 1000, 2000]
            });
        }
        return $dialog;
    }


    // XXX more DRY...
    async function runInfoDialog({startTime, endTime, wallStartTime, wallEndTime, label, source, originEl}) {
        const elapsedTime = wallEndTime - wallStartTime;
        const correctedPower = await correctedPowerTimeRange(wallStartTime, wallEndTime);
        const timeStream = await fetchStreamTimeRange('time', startTime, endTime);
        const distStream = await fetchStreamTimeRange('distance', startTime, endTime);
        const velocityStream = await fetchStreamTimeRange('velocity_smooth', startTime, endTime);
        const hrStream = await fetchStreamTimeRange('heartrate', startTime, endTime);
        const cadenceStream = await fetchStreamTimeRange('cadence', startTime, endTime);
        const altStream = await fetchSmoothStreamTimeRange('altitude', null, startTime, endTime);
        const gradeDistStream = distStream && await fetchGradeDistStream({startTime, endTime});
        const heading = await sauce.locale.getMessage(`analysis_${source}`);
        const textLabel = jQuery(`<div>${label}</div>`).text();
        const gap = gradeDistStream && streamDelta(gradeDistStream) / elapsedTime;
        const template = await getTemplate('run-info-dialog.html');
        const distance = streamDelta(distStream);
        const body = await template({
            startsAt: humanTime(wallStartTime),
            power: correctedPower && powerData(correctedPower.kj(), null, elapsedTime, altStream, {
                max: sauce.data.max(correctedPower.values()),
                estimate: correctedPower.isEstimate
            }),
            pace: distance && {
                avg: humanPace(distance / elapsedTime, {velocity: true}),
                max: humanPace(sauce.data.max(velocityStream), {velocity: true}),
                gap: gap && humanPace(gap, {velocity: true}),
            },
            elapsed: humanTime(elapsedTime),
            hr: hrInfo(hrStream),
            hrUnit: ctx.hrFormatter.shortUnitKey(),
            cadence: cadenceStream && ctx.cadenceFormatter.format(sauce.data.avg(cadenceStream)),
            cadenceUnit: ctx.cadenceFormatter.shortUnitKey(),
            elevation: elevationData(altStream, elapsedTime, distance),
            elevationUnit: ctx.elevationFormatter.shortUnitKey(),
            paceUnit: ctx.paceFormatter.shortUnitKey(),
            source,
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
        } else if (source === 'peak_power') {
            await infoDialogGraph($sparkline, {
                data: correctedPower.values(),
                formatter: x => `${humanNumber(x)}<abbr class="unit short">w</abbr>`,
                colorSteps: [0, 100, 400, 1200]
            });
        } else if (source === 'peak_sp') {
            const correctedSP = await correctedPowerTimeRange(wallStartTime, wallEndTime,
                {stream: 'watts_sealevel'});
            await infoDialogGraph($sparkline, {
                data: correctedSP.values(),
                formatter: x => `~${humanNumber(x)}<abbr class="unit short">w (SP)</abbr>`,
                colorSteps: [0, 100, 400, 1200]
            });
        } else if (source === 'peak_hr') {
            const unit = ctx.hrFormatter.shortUnitKey();
            await infoDialogGraph($sparkline, {
                data: hrStream,
                formatter: x => `${humanNumber(x)}<abbr class="unit short">${unit}</abbr>`,
                colorSteps: [40, 100, 150, 200]
            });
        } else if (source === 'peak_cadence') {
            const unit = ctx.cadenceFormatter.shortUnitKey();
            const format = x => ctx.cadenceFormatter.format(x);
            await infoDialogGraph($sparkline, {
                data: cadenceStream,
                formatter: x => `${format(x)}<abbr class="unit short">${unit}</abbr>`,
                colorSteps: [50, 80, 90, 100]
            });
        } else if (source === 'peak_vam') {
            await infoDialogGraph($sparkline, {
                data: createVAMStream(timeStream, altStream).slice(1),  // first entry is always 0
                formatter: x => `${humanNumber(x)}<abbr class="unit short">Vm/h</abbr>`,
                colorSteps: [-500, 500, 1000, 2000]
            });
        }
        return $dialog;
    }


    // XXX more DRY...
    async function swimInfoDialog({startTime, endTime, wallStartTime, wallEndTime, label, source, originEl}) {
        const elapsedTime = wallEndTime - wallStartTime;
        const distStream = await fetchStreamTimeRange('distance', startTime, endTime);
        const velocityStream = await fetchStreamTimeRange('velocity_smooth', startTime, endTime);
        const hrStream = await fetchStreamTimeRange('heartrate', startTime, endTime);
        const cadenceStream = await fetchStreamTimeRange('cadence', startTime, endTime);
        const distance = streamDelta(distStream);
        const heading = await sauce.locale.getMessage(`analysis_${source}`);
        const textLabel = jQuery(`<div>${label}</div>`).text();
        const template = await getTemplate('swim-info-dialog.html');
        const body = await template({
            startsAt: humanTime(wallStartTime),
            pace: distance && {
                avg: humanPace(distance / elapsedTime, {velocity: true}),
                max: humanPace(sauce.data.max(velocityStream), {velocity: true}),
            },
            elapsed: humanTime(elapsedTime),
            hr: hrInfo(hrStream),
            hrUnit: ctx.hrFormatter.shortUnitKey(),
            cadence: cadenceStream && ctx.cadenceFormatter.format(sauce.data.avg(cadenceStream)),
            cadenceUnit: ctx.cadenceFormatter.shortUnitKey(),
            paceUnit: ctx.paceFormatter.shortUnitKey(),
            source,
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
                colorSteps: [0.5, 0.85, 1.1, 1.75]
            });
        } else if (source === 'peak_hr') {
            const unit = ctx.hrFormatter.shortUnitKey();
            await infoDialogGraph($sparkline, {
                data: hrStream,
                formatter: x => `${humanNumber(x)}<abbr class="unit short">${unit}</abbr>`,
                colorSteps: [40, 100, 150, 200]
            });
        } else if (source === 'peak_cadence') {
            const unit = ctx.cadenceFormatter.shortUnitKey();
            const format = x => ctx.cadenceFormatter.format(x);
            await infoDialogGraph($sparkline, {
                data: cadenceStream,
                formatter: x => `${format(x)}<abbr class="unit short">${unit}</abbr>`,
                colorSteps: [20, 25, 30, 35]
            });
        }
        return $dialog;
    }


    // XXX more DRY...
    async function otherInfoDialog({startTime, endTime, wallStartTime, wallEndTime, label, source, originEl}) {
        const elapsedTime = wallEndTime - wallStartTime;
        const correctedPower = await correctedPowerTimeRange(wallStartTime, wallEndTime);
        const timeStream = await fetchStreamTimeRange('time', startTime, endTime);
        const distStream = await fetchStreamTimeRange('distance', startTime, endTime);
        const velocityStream = await fetchStreamTimeRange('velocity_smooth', startTime, endTime);
        const hrStream = await fetchStreamTimeRange('heartrate', startTime, endTime);
        const cadenceStream = await fetchStreamTimeRange('cadence', startTime, endTime);
        const altStream = await fetchSmoothStreamTimeRange('altitude', null, startTime, endTime);
        const distance = streamDelta(distStream);
        const heading = await sauce.locale.getMessage(`analysis_${source}`);
        const textLabel = jQuery(`<div>${label}</div>`).text();
        const template = await getTemplate('other-info-dialog.html');
        const body = await template({
            startsAt: humanTime(wallStartTime),
            power: correctedPower && powerData(correctedPower.kj(), null, elapsedTime, altStream, {
                max: sauce.data.max(correctedPower.values()),
                estimate: correctedPower.isEstimate
            }),
            pace: distance && {
                avg: humanPace(distance / elapsedTime, {velocity: true}),
                max: humanPace(sauce.data.max(velocityStream), {velocity: true}),
            },
            elapsed: humanTime(elapsedTime),
            hr: hrInfo(hrStream),
            hrUnit: ctx.hrFormatter.shortUnitKey(),
            cadence: cadenceStream && ctx.cadenceFormatter.format(sauce.data.avg(cadenceStream)),
            cadenceUnit: ctx.cadenceFormatter.shortUnitKey(),
            elevation: elevationData(altStream, elapsedTime, streamDelta(distStream)),
            elevationUnit: ctx.elevationFormatter.shortUnitKey(),
            paceUnit: ctx.paceFormatter.shortUnitKey(),
            source,
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
                colorSteps: [0.5, 10, 15, 30]
            });
        } else if (source === 'peak_power') {
            await infoDialogGraph($sparkline, {
                data: correctedPower.values(),
                formatter: x => `${humanNumber(x)}<abbr class="unit short">w</abbr>`,
                colorSteps: [0, 100, 400, 1200]
            });
        } else if (source === 'peak_sp') {
            const correctedSP = await correctedPowerTimeRange(wallStartTime, wallEndTime,
                {stream: 'watts_sealevel'});
            await infoDialogGraph($sparkline, {
                data: correctedSP.values(),
                formatter: x => `~${humanNumber(x)}<abbr class="unit short">w (SP)</abbr>`,
                colorSteps: [0, 100, 400, 1200]
            });
        } else if (source === 'peak_hr') {
            const unit = ctx.hrFormatter.shortUnitKey();
            await infoDialogGraph($sparkline, {
                data: hrStream,
                formatter: x => `${humanNumber(x)}<abbr class="unit short">${unit}</abbr>`,
                colorSteps: [40, 100, 150, 200]
            });
        } else if (source === 'peak_cadence') {
            const unit = ctx.cadenceFormatter.shortUnitKey();
            const format = x => ctx.cadenceFormatter.format(x);
            await infoDialogGraph($sparkline, {
                data: cadenceStream,
                formatter: x => `${format(x)}<abbr class="unit short">${unit}</abbr>`,
                colorSteps: [10, 50, 100, 160]
            });
        } else if (source === 'peak_vam') {
            await infoDialogGraph($sparkline, {
                data: createVAMStream(timeStream, altStream).slice(1),  // first entry is always 0
                formatter: x => `${humanNumber(x)}<abbr class="unit short">Vm/h</abbr>`,
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
            // Strava shows the word "Subscription" (localized) for the menu heading of
            // premium member's activities ONLY for rides.  For runs, it uses the locale
            // translation of "Analysis".  This makes our job of re-adding the analysis
            // link more difficult because we don't want the menu to repeat the word "Analysis".
            // So for Runs we make their menu structure look like a rides, and add our analysis
            // menu entry as if it was born there.  If Strava changes their menu structure this will
            // surely be a problem.
            if (pageView.activity().isRun()) {
                const titleEl = premiumGroup.querySelector('.title');
                titleEl.classList.add('small');
                titleEl.innerText = await sauce.locale.getMessage('subscription');
            }
        }
    }


    async function sendGAPageView(type) {
        await sauce.rpc.ga('set', 'page', `/site/analysis/${type}`);
        await sauce.rpc.ga('set', 'title', 'Sauce Analysis');
        await sauce.rpc.ga('send', 'pageview');
    }


    let _tplCache = {};
    async function getTemplate(filename, localeKey) {
        const cacheKey = '' + filename + localeKey;
        if (!_tplCache[cacheKey]) {
            const resp = await fetch(`${tplUrl}/${filename}`);
            const tplText = await resp.text();
            localeKey = localeKey || 'analysis';
            _tplCache[cacheKey] = sauce.template.compile(tplText, {localePrefix: `${localeKey}_`});
        }
        return _tplCache[cacheKey];
    }


    async function attachActionMenuItems() {
        const exportLocale = await sauce.locale.getMessage('analysis_export');
        const menuEl = document.querySelector('nav.sidenav .actions-menu .drop-down-menu ul.options');
        if (!menuEl) {
            console.warn("Side nav menu not found: Probably a flagged activity");
            return;
        }
        menuEl.insertAdjacentHTML('beforeend', `
            <li class="sauce-group">
                <div class="sauce-header">
                    <div class="sauce-title">SAUCE</div>
                    <img src="${sauce.extUrl}images/logo_horiz_320x120.png"/>
                </div>
                <ul>
                    <li><a title="TCX files are best for activities with power data (watts)."
                           class="tcx">${exportLocale} TCX</a></li>
                </ul>
            </li>
        `);
        menuEl.querySelector('a.tcx').addEventListener('click', () => {
            exportActivity(sauce.export.TCXSerializer).catch(sauce.rpc.reportError);  // bg okay
            sauce.rpc.reportEvent('ActionsMenu', 'export', 'tcx');
        });
        if (!menuEl.querySelector('a[href$="/export_gpx"')) {
            menuEl.querySelector('.sauce-group ul').insertAdjacentHTML('beforeend', `
                <li><a title="NOTE: GPX files do not support power data (watts)."
                       class="gpx">${exportLocale} GPX</a></li>
            `);
            menuEl.querySelector('a.gpx').addEventListener('click', () => {
                exportActivity(sauce.export.GPXSerializer).catch(sauce.rpc.reportError);  // bg okay
                sauce.rpc.reportEvent('ActionsMenu', 'export', 'gpx');
            });
        }
    }


    function attachRankBadgeDialog() {
        jQuery('body').on('click', 'img.sauce-rank', async ev => {
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
                        ${humanNumber(wKg * ctx.weight)}<abbr class="unit short">W</abbr>
                        (with current athlete's weight)<br/>`;
                } else {
                    tooltipFormatterAbs = wKg => ``;
                }
                $graph.sparkline(requirements[gender].map(({high, low}) => (pct * (high - low)) + low), {
                    type: 'line',
                    width: '100%',
                    height: 100,
                    chartRangeMin: 0,
                    tooltipFormatter: (_, __, data) => `
                        ${humanNumber(data.y, 1)}<abbr class="unit short">W/kg</abbr><br/>
                        ${tooltipFormatterAbs(data.y)}
                        Duration: ${humanTime(times[data.x])}`
                });
            }
            $levelSelect.on('change', drawGraph);
            $genderSelect.on('change', drawGraph);
            $dialog.on('dialogresize', drawGraph);
            drawGraph();
            sauce.rpc.reportEvent('PowerProfileHelp', 'show');
        });
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

    function attachLiveSegmentsHandler() {
        jQuery(document).on('click', '.live-segment.sauce-button.enabled', async ev => {
            const id = ev.currentTarget.dataset.segmentId;
            const details = pageView.segmentEffortDetails().get(id);
            await createLiveSegment({
                start: details.get('start_index'),
                end: details.get('end_index'),
                name: details.get('name'),
                id: details.get('segment_id')
            });
        });
    }


    function addBadge(row) {
        if (!ctx.weight || row.querySelector(':scope > td.sauce-mark')) {
            return;
        }
        const segment = pageView.segmentEfforts().getEffort(row.dataset.segmentEffortId);
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
                     title="World Ranking: ${levelPct}%\nWatts/kg: ${humanNumber(wKg, 1)}"/>
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
                sauce.rpc.reportError(e);
            }
        }
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


    async function getActiveStream(start, end) {
        const isTrainer = pageView.activity().isTrainer();
        const timeStream = await fetchStream('time', start, end);
        const movingStream = await fetchStream('moving', start, end);
        const cadenceStream = isTrainer && await fetchStream('cadence', start, end);
        const wattsStream = await fetchStream('watts', start, end);
        const distStream = await fetchStream('distance', start, end);
        const activeStream = [];
        const speedMin = 0.447;  // meter/second (1mph)
        for (let i = 0; i < movingStream.length; i++) {
            activeStream.push(!!(
                movingStream[i] ||
                (cadenceStream && cadenceStream[i]) ||
                (wattsStream && wattsStream[i]) ||
                (distStream && i &&
                 (distStream[i] - distStream[i - 1]) /
                 (timeStream[i] - timeStream[i - 1]) >= speedMin)
            ));
        }
        return activeStream;
    }


    async function getActiveTime(start, end) {
        const activeStream = await getActiveStream(start, end);
        const timeStream = await fetchStream('time', start, end);
        return sauce.data.activeTime(timeStream, activeStream);
    }


    async function getStopCount(start, end) {
        let stops = 0;
        let wasActive = false;
        const activeStream = await getActiveStream(start, end);
        for (const x of activeStream) {
            if (!x && wasActive) {
                stops++;
            }
            wasActive = x;
        }
        return stops;
    }


    function elevationData(altStream, elapsed, distance) {
        if (altStream && elapsed && distance) {
            const {gain, loss} = altitudeChanges(altStream);
            return {
                gain: gain > 1 ? humanElevation(gain) : 0,
                loss: loss && humanElevation(loss),
                grade: ((gain - loss) / distance) * 100,
                vam: elapsed >= minVAMTime ? (gain / elapsed) * 3600 : 0,
                avg: humanElevation(sauce.data.avg(altStream))
            };
        }
    }


    function hrInfo(hrStream) {
        if (hrStream) {
            const fmt = ctx.hrFormatter;
            return {
                min: fmt.format(sauce.data.min(hrStream)),
                avg: fmt.format(sauce.data.avg(hrStream)),
                max: fmt.format(sauce.data.max(hrStream)),
            };
        }
    }


    function powerData(kj, active, elapsed, altStream, extra) {
        const activeAvg = active ? kj * 1000 / active : null;
        const elapsedAvg = elapsed ? kj * 1000 / elapsed : null;
        let activeSP;
        let elapsedSP;
        if (supportsSeaPower()) {
            const avgEl = sauce.data.avg(altStream);
            activeSP = activeAvg && sauce.power.seaLevelPower(activeAvg, avgEl);
            elapsedSP = elapsedAvg && sauce.power.seaLevelPower(elapsedAvg, avgEl);
        }
        return Object.assign({
            activeAvg,
            elapsedAvg,
            activeSP,
            elapsedSP,
            activeSPAdjust: activeSP && activeSP / activeAvg,
            elapsedSPAdjust: elapsedSP && elapsedSP / elapsedAvg,
            activeWKg: (ctx.weight && activeAvg != null) && activeAvg / ctx.weight,
            elapsedWKg: (ctx.weight && elapsedAvg != null) && elapsedAvg / ctx.weight,
            rank: (ctx.weight && elapsedAvg != null) &&
                sauce.power.rank(elapsed, elapsedAvg / ctx.weight, ctx.gender),
        }, extra);
    }


    function supportsStream(type) {
        return !!(ctx.manifest && ctx.manifest.streams && ctx.manifest.streams.has(type));
    }


    function supportsNP() {
        return pageView.activity().isRide() && !!pageView.streams().getStream('watts');
    }


    async function _updateAnalysisStats(start, end) {
        const timeStream = await fetchStream('time', start, end);
        const distStream = await fetchStream('distance', start, end);
        const altStream = await fetchSmoothStream('altitude', null, start, end);
        const activeTime = await getActiveTime(start, end);
        const correctedPower = supportsStream('watts') && await correctedPowerTimeRange(
            getStreamIndexTime(start), getStreamIndexTime(end));
        const elapsedTime = streamDelta(timeStream);
        const distance = streamDelta(distStream);
        const pausedTime = elapsedTime - activeTime;
        const tplData = {
            logo: sauce.extUrl + 'images/logo_vert_48x128.png',
            supportsRankBadge: pageView.activity().isRide(),
            supportsPerfPredictor: !!(pageView.activity().isRide() && distance && altStream),
            elapsed: humanTime(elapsedTime),
            active: humanTime(activeTime),
            paused: ctx.timeFormatter.abbreviatedNoTags(pausedTime, null, false),
            stops: await getStopCount(start, end),
            weight: ctx.weight,
            elUnit: ctx.elevationFormatter.shortUnitKey(),
            isSpeed: ctx.paceMode === 'speed',
            paceUnit: ctx.paceFormatter.shortUnitKey(),
            samples: timeStream.length,
            elevation: elevationData(altStream, elapsedTime, distance),
            expandIcon: await sauce.images.asText('fa/plus-square-duotone.svg'),
            compressIcon: await sauce.images.asText('fa/minus-square-duotone.svg'),
        };
        if (correctedPower) {
            const kj = correctedPower.kj();
            const np = supportsNP() && correctedPower.np();
            tplData.power = powerData(kj, activeTime, elapsedTime, altStream, {np});
            let tss;
            let intensity;
            if (ctx.ftp) {
                if (np) {
                    tss = sauce.power.calcTSS(np, elapsedTime, ctx.ftp);
                    intensity = np / ctx.ftp;
                } else {
                    tss = sauce.power.calcTSS(tplData.power.activeAvg, activeTime, ctx.ftp);
                    intensity = tplData.power.activeAvg / ctx.ftp;
                }
            }
            tplData.energy = {
                kj,
                kjHour: (kj / activeTime) * 3600,
                tss,
                intensity
            };
        }
        if (distance) {
            const gradeDistStream = await fetchGradeDistStream({start, end});
            const gradeDistance = streamDelta(gradeDistStream);
            tplData.pace = {
                elapsed: humanPace(distance / elapsedTime, {velocity: true}),
                active: humanPace(distance / activeTime, {velocity: true}),
                gap: gradeDistance && humanPace(gradeDistance / activeTime, {velocity: true}),
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
    let _schedUpdateErrorTS;
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
        if (!ctx.ready) {
            if (!ctx.unsupported) {
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
        })().catch(e => {
            const now = Date.now();
            if (!_schedUpdateErrorTS || (now - _schedUpdateErrorTS) > 5000) {
                _schedUpdateErrorTS = now;
                sauce.rpc.reportError(e);
            }
        });
    }


    function _rawStreamsInfo() {
        return [
            {name: 'time'},
            {name: 'timer_time'},
            {name: 'moving'},
            {name: 'distance'},
            {name: 'grade_adjusted_distance', label: 'gap_distance'},
            {name: 'watts'},
            {name: 'watts_calc'},
            {name: 'heartrate'},
            {name: 'cadence', formatter: x => ctx.cadenceFormatter.format(x)},
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
                                     'gap_distance', 'grade_smooth', 'moving', 'altitude_smooth', 'temp']);
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
        sauce.rpc.reportEvent('RawData', 'show');
    }


    function weightUnconvert(localeWeight) {
        return ctx.weightFormatter.unitSystem === 'metric' ? localeWeight : localeWeight / 2.20462;
    }


    function elevationUnconvert(localeEl) {
        return ctx.elevationFormatter.unitSystem === 'metric' ? localeEl : localeEl * 0.3048;
    }


    function velocityUnconvert(localeV) {
        return (ctx.paceFormatter.unitSystem === 'metric' ? localeV * 1000 : localeV * metersPerMile) / 3600;
    }


    function distanceUnconvert(localeDist) {
        return ctx.distanceFormatter.unitSystem === 'metric' ? localeDist * 1000 : localeDist * metersPerMile;
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
        sauce.rpc.reportEvent('GraphData', 'show');
    }


    async function getAthleteBike() {
        const bikeEl = document.querySelector('.gear-name');
        const bikeName = (bikeEl && bikeEl.textContent.trim()) || '_default_';
        const bikes = await sauce.rpc.getAthleteProp(ctx.athlete.id, 'bikes');
        return bikes && bikes[bikeName];
    }


    async function updateAthleteBike(settings) {
        const bikeEl = document.querySelector('.gear-name');
        const bikeName = (bikeEl && bikeEl.textContent.trim()) || '_default_';
        const bikes = (await sauce.rpc.getAthleteProp(ctx.athlete.id, 'bikes')) || {};
        if (!bikes[bikeName]) {
            bikes[bikeName] = {};
        }
        Object.assign(bikes[bikeName], settings);
        await sauce.rpc.setAthleteProp(ctx.athlete.id, 'bikes', bikes);
    }

    async function createLiveSegment({start, end, id, name}) {
        if (!window.jsfit) {
            const script = document.createElement('script');
            await new Promise((resolve, reject) => {
                script.addEventListener('load', resolve);
                script.addEventListener('error', reject);
                script.type = 'module';
                script.src = `${sauce.extUrl}src/site/jsfit/web.js`;
                document.head.appendChild(script);
            });
        }
        const uuid = `sauce-${id}-${pageView.activity().id}`;  // Avoid collision with strava ids so we can coexist
        const timeStream = await fetchStream('time', start, end);
        const distStream = await fetchStream('distance', start, end);
        const altStream = await fetchSmoothStream('altitude', null, start, end);
        const latlngStream = await fetchStream('latlng', start, end);
        const athlete = pageView.activityAthlete();
        const athleteInitials = athlete.get('first_name').substr(0, 1) + athlete.get('last_name').substr(0, 1);
        const dateStamp = (await getEstimatedActivityStart()).toLocaleDateString();
        const points = [];
        const distOfft = distStream[0];
        const timeOfft = timeStream[0];
        let nec_lat = latlngStream[0][0];
        let nec_long = latlngStream[0][1];
        let swc_lat = latlngStream[0][0];
        let swc_long = latlngStream[0][1];
        for (let i = 0; i < altStream.length; i++) {
            nec_lat = Math.max(latlngStream[i][0], nec_lat);
            nec_long = Math.max(latlngStream[i][1], nec_long);
            swc_lat = Math.min(latlngStream[i][0], swc_lat);
            swc_long = Math.min(latlngStream[i][1], swc_long);
            points.push({
                altitude: altStream[i],
                distance: distStream[i] - distOfft,
                position_lat: latlngStream[i][0],
                position_long: latlngStream[i][1],
                leader_time: [timeStream[i] - timeOfft],
                message_index: {
                    flags: [],
                    value: i
                }
            });
        }
        const fitParser = new jsfit.FitParser();
        fitParser.addMessage('file_id', {
            manufacturer: 'strava',
            type: 'segment',
            time_created: new Date()
        });
        fitParser.addMessage('segment_id', {
            name: `${name.substr(0, 32)} [${athleteInitials} ${dateStamp}]`,
            enabled: true,
            sport: pageView.isRide() ? 'cycling' : pageView.isRun() ? 'running' : null,
            selection_type: 'starred',
            uuid,
            default_race_leader: 0,
        });
        fitParser.addMessage('segment_lap', {
            uuid,
            total_distance: streamDelta(distStream),
            total_ascent: altitudeChanges(altStream).gain,
            start_position_lat: latlngStream[0][0],
            start_position_long: latlngStream[0][1],
            end_position_lat: latlngStream[latlngStream.length - 1][0],
            end_position_long: latlngStream[latlngStream.length - 1][1],
            swc_lat,
            swc_long,
            nec_lat,
            nec_long,
            message_index: {
                flags: [],
                value: 0
            }
        });
        fitParser.addMessage('segment_leaderboard_entry', {
            activity_id_string: pageView.activity().id.toString(),
            segment_time: streamDelta(timeStream),
            type: 'rival',
            name: athlete.get('display_name'),
            message_index: {
                flags: [],
                value: 0
            }
        });
        for (const x of points) {
            fitParser.addMessage('segment_point', x);
        }
        const buf = fitParser.encode();
        const fname = `Sauce_Live_Segment-${name.substr(0, 22)}-${athleteInitials}`;
        download(new File([buf], fname.trim().replace(/\s/g, '_').replace(/[^\w_-]/g, '') + '.fit'));
        sauce.rpc.reportEvent('LiveSegment', 'create');
    }
 
    async function showPerfPredictor() {
        const start = ctx.$analysisStats.data('start');
        const end = ctx.$analysisStats.data('end');
        const timeStream = await fetchStream('time', start, end);
        const distStream = await fetchStream('distance', start, end);
        const altStream = await fetchSmoothStream('altitude', null, start, end);
        const correctedPower = supportsStream('watts') && await correctedPowerTimeRange(
            getStreamIndexTime(start), getStreamIndexTime(end));
        const origTime = streamDelta(timeStream);
        const origDistance = streamDelta(distStream);
        const origVelocity = origDistance / origTime;
        const el = sauce.data.avg(altStream);
        const template = await getTemplate('perf-predictor.html', 'perf_predictor');
        const power = correctedPower && correctedPower.avg();
        const slope = streamDelta(altStream) / origDistance;
        const powerColors = {
            gravity: '#36c',
            aero: '#dc3912',
            rr: '#f90'
        };
        const bikeDefaults = {
            cda: 0.40,
            crr: 0.0050,
            gearWeight: 13,
            bike: 'road',
            terrain: 'asphalt',
        };
        const bike = await getAthleteBike();
        if (bike) {
            Object.assign(bikeDefaults, bike.perf_predictor_defaults);
        }
        const body = await template({
            power: power && Math.round(power),
            hasWeight: !!ctx.weight,
            wkg: power && ctx.weight && humanNumber(power / ctx.weight, 1),
            bodyWeight: ctx.weightFormatter.convert(ctx.weight).toFixed(1),
            gearWeight: ctx.weightFormatter.convert(bikeDefaults.gearWeight).toFixed(1),
            slope: (slope * 100).toFixed(1),
            distance: ctx.distanceFormatter.convert(origDistance).toFixed(3),
            cda: bikeDefaults.cda,
            crr: bikeDefaults.crr,
            bike: bikeDefaults.bike,
            terrain: bikeDefaults.terrain,
            wind: 0,
            elevation: Math.round(ctx.elevationFormatter.convert(el)),
            speed: humanPace(origVelocity, {velocity: true}),
            time: humanTime(origTime),
            weightUnit: ctx.weightFormatter.shortUnitKey(),
            speedUnit: ctx.paceFormatter.shortUnitKey(),
            elevationUnit: ctx.elevationFormatter.shortUnitKey(),
            distanceUnit: ctx.distanceFormatter.shortUnitKey(),
            infoIcon: await sauce.images.asText('fa/info-circle-duotone.svg'),
            powerColors
        });
        const $dialog = modal({
            title: 'Performance Predictor',
            icon: await sauce.images.asText('fa/analytics-duotone.svg'),
            body,
            width: '60em',
            dialogClass: 'sauce-perf-predictor',
            resizable: false,
            draggable: false,
        });
        function fget(name) {
            return Number($dialog.find(`[name="${name}"]`).val());
        }
        const localeKeys = ['faster', 'slower', 'power_details_gravity', 'power_details_aero', 'power_details_rr'];
        const localeStrings = await sauce.locale.getMessages(localeKeys.map(x => `perf_predictor_${x}`));
        const locale = localeStrings.reduce((acc, x, i) => (acc[localeKeys[i]] = x, acc), {});
        let lazySaveTimeout;
        function recalc(noPulse) {
            const crr = fget('crr');
            const cda = fget('cda');
            const power = fget('power');
            const bodyWeight = weightUnconvert(fget('body-weight'));
            const gearWeight = weightUnconvert(fget('gear-weight'));
            const sysWeight = bodyWeight + gearWeight;
            const slope = fget('slope') / 100;
            const distance = distanceUnconvert(fget('distance'));
            const el = elevationUnconvert(fget('elevation'));
            const wind = velocityUnconvert(fget('wind'));
            const powerEst = sauce.power.cyclingPowerVelocitySearch(power, slope, sysWeight, crr,
                cda, el, wind, 0.035);
            const time = distance / powerEst.velocity;
            const $timeAhead = $dialog.find('.predicted .time + .ahead-behind');
            if (powerEst.velocity && time < origTime) {
                const pct = (origTime / time - 1) * 100;
                $timeAhead.text(`${humanNumber(pct, 1)}% ${locale.faster}`).addClass('sauce-positive').removeClass('sauce-negative');
            } else if (powerEst.velocity && time > origTime) {
                const pct = (time / origTime - 1) * 100;
                $timeAhead.text(`${humanNumber(pct, 1)}% ${locale.slower}`).addClass('sauce-negative').removeClass('sauce-positive');
            } else {
                $timeAhead.empty();
            }
            $dialog.find('.predicted .speed').text(humanPace(powerEst.velocity, {velocity: true}));
            $dialog.find('.predicted .time').text(humanTime(time));
            $dialog.find('.predicted .distance').text(humanDistance(distance));
            $dialog.find('.predicted .wkg').text(humanNumber(power / bodyWeight, 1));
            const $gravity = $dialog.find('.predicted .power-details .gravity');
            $gravity.find('.power').text(humanNumber(powerEst.gWatts));
            $gravity.find('.pct').text(humanNumber(powerEst.gWatts / powerEst.watts * 100));
            const $aero = $dialog.find('.predicted .power-details .aero');
            $aero.find('.power').text(humanNumber(powerEst.aWatts));
            $aero.find('.pct').text(humanNumber(powerEst.aWatts / powerEst.watts * 100));
            const $rr = $dialog.find('.predicted .power-details .rr');
            $rr.find('.power').text(humanNumber(powerEst.rWatts));
            $rr.find('.pct').text(humanNumber(powerEst.rWatts / powerEst.watts * 100));
            $dialog.find('.predicted .power-details .piechart').sparkline(
                [powerEst.gWatts, powerEst.aWatts, powerEst.rWatts],
                {
                    type: 'pie',
                    width: '100%',
                    height: '100%',
                    sliceColors: [powerColors.gravity, powerColors.aero, powerColors.rr],
                    tooltipFormatter: (_, __, data) => {
                        const key = ['gravity', 'aero', 'rr'][data.offset];
                        const force = powerEst[['g', 'a', 'r'][data.offset] + 'Force'];
                        return `
                            <b>${locale[`power_details_${key}`]}:</b>
                            <ul>
                                <li>&nbsp;&nbsp;${Math.round(data.value)}w</li>
                                <li>&nbsp;&nbsp;${data.percent.toFixed(1)}%</li>
                                <li>&nbsp;&nbsp;${humanNumber(force * distance / 1000)}kJ</li>
                            </ul>
                        `;
                    }
                });
            if (!noPulse) {
                $dialog.find('.predicted').addClass('pulse').one('animationend',
                    ev => ev.currentTarget.classList.remove('pulse'));
                clearTimeout(lazySaveTimeout);
                lazySaveTimeout = setTimeout(async () => {
                    await updateAthleteBike({
                        perf_predictor_defaults: {
                            cda,
                            crr,
                            gearWeight,
                            bike: $dialog.find('[name="bike"]:checked').val(),
                            terrain: $dialog.find('[name="terrain"]').val()
                        }
                    });
                }, 200);
            }
        }
        $dialog.on('input', '[name="bike"],[name="terrain"]', ev => {
            const terrain = $dialog.find('[name="terrain"]').val();
            const bike = $dialog.find('[name="bike"]:checked').val();
            const crr = {
                road: {asphalt: 0.0050, gravel: 0.0060, grass: 0.0070, offroad: 0.0200, sand: 0.0300},
                mtb: {asphalt: 0.0065, gravel: 0.0075, grass: 0.0090, offroad: 0.0255, sand: 0.0380}
            }[bike][terrain];
            if (crr) {
                $dialog.find('[name="crr"]').val(crr);
            }
            setTimeout(recalc, 0);
        });
        $dialog.on('input', '[name="crr"]', ev => {
            $dialog.find('select[name="terrain"]').val('custom');
            setTimeout(recalc, 0);  // Only required to save bike defaults.
        });
        $dialog.on('input', '[name="aero"]', ev => {
            const cda = $dialog.find('[name="aero"]').val();
            $dialog.find('[name="cda"]').val(cda);
            setTimeout(recalc, 0);
        });
        $dialog.on('input', '[name="cda"]', ev => {
            const cda = $dialog.find('[name="cda"]').val();
            $dialog.find('[name="aero"]').val(cda);
            setTimeout(recalc, 0);
        });
        $dialog.on('input', 'input', () => setTimeout(recalc, 0));
        $dialog.on('click', 'a.help-info', ev => {
            const helpFor = ev.currentTarget.dataset.help;
            ev.currentTarget.classList.add('hidden');
            $dialog.find(`.help[data-for="${helpFor}"]`).toggleClass('visible');
        });
        $dialog.on('click', '.help a.dismiss', ev => {
            const help = ev.currentTarget.closest('.help');
            help.classList.remove('visible');
            $dialog.find(`a.help-info[data-help="${help.dataset.for}"]`).removeClass('hidden');
        });
        recalc(/*noPulse*/ true);
        sauce.rpc.reportEvent('PerfPredictor', 'show');
    }


    function attachAnalysisStats($el) {
        if (!ctx.$analysisStats) {
            ctx.$analysisStats = jQuery(`<div class="sauce-analysis-stats"></div>`);
        }
        $el.find('#stacked-chart').before(ctx.$analysisStats);
        $el.on('click', 'a.sauce-raw-data', () => showRawData().catch(sauce.rpc.reportError));
        $el.on('click', 'a.sauce-graph-data', () => showGraphData().catch(sauce.rpc.reportError));
        $el.on('click', 'a.sauce-perf-predictor', () => showPerfPredictor().catch(sauce.rpc.reportError));
        $el.on('click', 'a.expander', ev =>
            ev.currentTarget.closest('.sauce-analysis-stats').classList.toggle('expanded'));
    }


    function adjustSlideMenu() {
        // We expand the sidenav, so we need to modify this routine to make the menu
        // work properly in all conditions.
        sauce.rpc.auditStackFrame();
        const sidenav = document.querySelector('nav.sidenav');
        if (!sidenav) {
            return;
        }
        const navHeight = sidenav.offsetHeight;
        const slideMenu = sidenav.querySelector('.slide-menu');
        if (!slideMenu) {
            console.warn("Slide menu not found: Probably a flagged activity");
            return;
        }
        // Must use jQuery since it's hidden and they do the magic..
        const slideMenuHeight = jQuery(slideMenu.querySelector(".options")).height();
        const top = slideMenuHeight > navHeight;
        requestAnimationFrame(() => {
            slideMenu.classList.remove("align-top");  // Never seems to be a good idea.
            slideMenu.classList.toggle("align-bottom", !top);
        });
    }


    async function pageViewAssembled() {
        sauce.rpc.auditStackFrame();
        if (!pageView.factory().page()) {
            const pf = pageView.factory();
            const setget = pf.page;
            await new Promise(resolve => {
                pf.page = function(v) {
                    try {
                        return setget.apply(this, arguments);
                    } finally {
                        if (v) {
                            pf.page = setget;
                            resolve();
                        }
                    }
                };
            });
        }
    }


    async function prepareContext() {
        sauce.rpc.auditStackFrame();
        const activity = pageView.activity();
        ctx.athlete = pageView.activityAthlete();
        ctx.gender = ctx.athlete.get('gender') === 'F' ? 'female' : 'male';
        await Promise.all([
            getWeightInfo(ctx.athlete.id).then(x => Object.assign(ctx, x)),
            getFTPInfo(ctx.athlete.id).then(x => Object.assign(ctx, x)),
        ]);
        ctx.elevationFormatter = new Strava.I18n.ElevationFormatter();
        ctx.hrFormatter = new Strava.I18n.HeartRateFormatter();
        ctx.cadenceFormatter = activity.isRun() ?
            new Strava.I18n.DoubledStepCadenceFormatter() :
            new Strava.I18n.CadenceFormatter();
        ctx.timeFormatter = new Strava.I18n.TimespanFormatter();
        ctx.weightFormatter = new Strava.I18n.WeightFormatter();
        ctx.distanceFormatter = new Strava.I18n.DistanceFormatter();
        const speedUnit = activity.get('speedUnit') || (activity.isRide() ? 'mph' : 'mpm');
        const PaceFormatter = {
            mp100m: Strava.I18n.SwimPaceFormatter,
            mph: Strava.I18n.DistancePerTimeFormatter,
            mpm: Strava.I18n.PaceFormatter,
        }[speedUnit];
        ctx.paceFormatter = new PaceFormatter();
        ctx.paceMode = speedUnit === 'mph' ? 'speed' : 'pace';
        ctx.peakIcons = {
            peak_power: 'fa/bolt-duotone.svg',
            peak_np: 'fa/atom-alt-duotone.svg',
            peak_sp: 'fa/ship-duotone.svg',
            peak_hr: 'fa/heartbeat-duotone.svg',
            peak_vam: 'fa/rocket-launch-duotone.svg',
            peak_gap: 'fa/hiking-duotone.svg',
            peak_pace: 'fa/rabbit-fast-duotone.svg',
            peak_cadence: 'fa/solar-system-duotone.svg'
        };
        if (activity.isRun()) {
            ctx.peakIcons.peak_pace = 'fa/running-duotone.svg';
            ctx.peakIcons.peak_cadence = 'fa/shoe-prints-duotone.svg';
        } else if (activity.isSwim()) {
            ctx.peakIcons.peak_pace = 'fa/swimmer-duotone.svg';
        }
        updateSideNav().catch(sauce.rpc.reportError);  // bg okay
        attachActionMenuItems().catch(sauce.rpc.reportError);  // bg okay
        attachComments().catch(sauce.rpc.reportError);  // bg okay
        attachLiveSegmentsHandler();
        const savedRanges = await sauce.rpc.storageGet('analysis_peak_ranges');
        ctx.allPeriodRanges = (savedRanges && savedRanges.periods) || defaultPeakPeriods;
        for (const range of ctx.allPeriodRanges) {
            range.label = await sauce.locale.humanDuration(range.value);
        }
        ctx.allDistRanges = (savedRanges && savedRanges.distances) || defaultPeakDistances;
        const imperialDistanceFormatter = new Strava.I18n.DistanceFormatter(
            Strava.I18n.UnitSystemSource.IMPERIAL);
        const metricDistanceFormatter = new Strava.I18n.DistanceFormatter(
            Strava.I18n.UnitSystemSource.METRIC);
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
        const svg = await sauce.images.asText('fa/bars-regular.svg');
        const navHeader = document.querySelector('#global-header > nav');
        navHeader.insertAdjacentHTML('afterbegin',
            `<div style="display: none" class="menu-expander">${svg}</div>`);
        navHeader.querySelector('.menu-expander').addEventListener('click', toggleMobileNavMenu);
    }


    async function load() {
        sauce.rpc.auditStackFrame();
        await sauce.propDefined('pageView', {once: true});
        if (sauce.options['responsive']) {
            attachMobileMenuExpander().catch(sauce.rpc.reportError);  // bg okay
            pageView.unbindScrollListener();
            document.body.classList.add('sauce-disabled-scroll-listener');
            pageView.handlePageScroll = function() {};
            // Disable animations for mobile screens (reduces jank and works better for some nav changes)
            const mobileMedia = window.matchMedia('(max-width: 768px)');
            mobileMedia.addListener(ev => void (jQuery.fx.off = ev.matches));
            jQuery.fx.off = mobileMedia.matches;
        }
        await pageViewAssembled();
        const activity = pageView.activity();
        const type = activity.get('type');
        ctx.manifest = manifests[type];
        if (ctx.manifest) {
            if (ctx.manifest.streams) {
                fetchStreams(Array.from(ctx.manifest.streams)).catch(sauce.rpc.reportError);  // bg okay
            }
            const pageRouter = pageView.router();
            pageRouter.on('route', page => {
                document.body.dataset.route = page;
                resetPageMonitors();
            });
            document.body.dataset.route = pageRouter.context.startMenu();
            startPageMonitors();
            attachRankBadgeDialog();
            await prepareContext();
            // Make sure this is last thing before start..
            if (sauce.analysisStatsIntent && !_schedUpdateAnalysisPending) {
                const {start, end} = sauce.analysisStatsIntent;
                schedUpdateAnalysisStats(start, end);
            }
            await ctx.manifest.start();
            sauce.rpc.reportEvent('ActivityAnalysis', 'load', type);
        } else {
            ctx.unsupported = true;
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
});


(async function() {
    if (sauce.testing) {
        return;
    }
    sauce.rpc.auditStackFrame();
    try {
        await sauce.analysis.load();
    } catch(e) {
        await sauce.rpc.reportError(e);
        throw e;
    }
})();
