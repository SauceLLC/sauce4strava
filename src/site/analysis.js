/* global Strava sauce jQuery pageView _ currentAthlete */

sauce.ns('analysis', function(ns) {
    'use strict';

    const ctx = {};
    const default_ftp = 200;
    const tpl_url = sauce.extURL + 'templates';

    const ride_cp_periods = [
        ['5 s', 5],
        ['15 s', 15],
        ['30 s', 30],
        ['1 min', 60],
        ['2 min', 120],
        ['5 min', 300],
        ['10 min', 600],
        ['15 min', 900],
        ['20 min', 1200],
        ['30 min', 1800],
        ['1 hour', 3600]
    ];

    const metersPerMile = 1609.344;
    const run_cp_distances = [
        ['400 m', 400],
        ['1 km', 1000],
        ['1 mile', Math.round(metersPerMile)],
        ['3 km', 3000],
        ['5 km', 5000],
        ['10 km', 10000],
        ['13.1 mile', Math.round(metersPerMile * 13.1)],
        ['26.2 mile', Math.round(metersPerMile * 26.2)]
    ];

    const rank_map = [
        [/^World Class.*/, 'world-tour.png'],
        [/^Pro.?/, 'pro.png'],
        [/^Cat 1.?/, 'cat1.png'],
        [/^Cat 2.?/, 'cat2.png'],
        [/^Cat 3.?/, 'cat3.png'],
        [/^Cat 4.?/, 'cat4.png'],
        [/^Cat 5.?/, 'cat5.png']
    ];


    function rank_image(rank_cat) {
        for (let i = 0; i < rank_map.length; i++) {
            if (rank_cat.match(rank_map[i][0])) {
                return sauce.extURL + 'assets/ranking/' + rank_map[i][1];
            }
        }
    }


    function resample(data, maxLen) {
        // Reduce a data array to maxLen by resampling the numeric values.
        // This can be useful for smoothing out graphs.
        if (data.length < maxLen) {
            return Array.from(data);
        }
        const resampled = [];
        const increment = Math.ceil(data.length / maxLen);
        for (let i = 0; i < data.length; i += increment) {
            let v = 0;
            let ii;
            for (ii = 0; ii < increment && i + ii < data.length; ii++) {
                v += data[i + ii];
            }
            resampled.push(v / ii);
        }
        return resampled;
    }


    let _activity;
    async function fetchFullActivity() {
        // The initial activity object is not fully loaded for owned' activities.  This routine
        // will return a full activity object if the activity is from the page owner. Note that
        // we leave the existing pageView.activity() object alone to avoid compatibility issues.
        if (_activity) {
            return _activity;
        }
        if (pageView.isOwner()) {
            const activity = new Strava.Labs.Activities.TrainingActivity({id: pageView.activityId()});
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


    async function fetchStreams(names) {
        const streams = pageView.streams();
        const missing = names.filter(x => streams.getStream(x) === undefined);
        if (missing.length) {
            console.info("Fetching streams:", missing);
            await new Promise((success, error) => streams.fetchStreams(missing, {success, error}));
        }
        return names.map(x => streams.getStream(x));
    }


    async function fetchStream(name) {
        return (await fetchStreams([name]))[0];
    }


    function getStream(name, startIndex, endIndex) {
        const s = pageView.streams().getStream(name);
        if (s && startIndex != null) {
            return s.slice(startIndex, endIndex);
        } else {
            return s;
        }
    }


    function getStreamTimeIndex(time) {
        const timeStream = getStream('time');
        return timeStream.indexOf(time);
    }


    function getStreamTimeRange(name, startTime, endTime) {
        const startIndex = getStreamTimeIndex(startTime);
        const endIndex = getStreamTimeIndex(endTime);
        return getStream(name, startIndex, endIndex);
    }


    let _currentOpenDialog;
    function openDialog(dialog, selectorEl) {
        if (_currentOpenDialog) {
            _currentOpenDialog.dialog('close');
        } else if (_currentOpenDialog === undefined) {
            /* First usage; wire click-away detection to close open dialog. */
            jQuery(document).on('click', ev => {
                if (_currentOpenDialog && !jQuery(ev.target).closest(_currentOpenDialog).length) {
                    _currentOpenDialog.dialog('close');
                    _currentOpenDialog = null;
                }
            });
        }
        _currentOpenDialog = dialog;
        dialog.on('dialogclose', () => selectorEl.removeClass('selected'));
        selectorEl.addClass('selected');
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
                jQuery(`<div title="${invalid.title}">${invalid.message}</div>`).dialog({
                    modal: true,
                    buttons: {
                        Ok: function() {
                            jQuery(this).dialog('close');
                        }
                    }
                });
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


    function attachEditableFTP(parentEl) {
        const link = parentEl.find('.provide-ftp');
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
            onValid: async v => {
                await sauce.rpc.setFTP(pageView.activityAthlete(), v);
                jQuery(`
                    <div title="Reloading...">
                        <b>Reloading page to reflect FTP change.
                    </div>
                `).dialog({modal: true});
                location.reload();
            }
        });
    }


    function attachEditableWeight(parentEl) {
        const link = parentEl.find('.provide-weight');
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
                await sauce.rpc.setWeight(pageView.activityAthlete(), prefersKg() ? v : v / 2.20462);
                jQuery(`
                    <div title="Reloading...">
                        <b>Reloading page to reflect weight change.
                    </div>
                `).dialog({modal: true});
                location.reload();
            }
        });
    }


    async function processRideStreams() {
        await fetchStreams([
            'watts',
            'time',
            'heartrate',
            'altitude',
            'cadence',
            'latlng',
            'distance',
            'grade_smooth',
        ]);
        let wattsStream = getStream('watts');
        const is_watt_estimate = !wattsStream;
        if (!wattsStream) {
            wattsStream = await fetchStream('watts_calc');
            if (!wattsStream) {
                console.info("No power data for this activity.");
            }
            /* Only show large period for watt estimates. */
            while (ride_cp_periods[0][1] < 300) {
                ride_cp_periods.shift();
            }
        }
        const np = wattsStream ? sauce.power.calcNP(wattsStream) : undefined;
        const np_val = np && np.value;
        const weight_unit = pageView.activityAthlete().get('weight_measurement_unit');
        const intensity = np && np_val / ctx.ftp;
        const stats_frag = jQuery(ctx.tertiary_stats_tpl({
            type: 'ride',
            np: np_val,
            weight_unit,
            weight_norm: Math.round(prefersKg() ? ctx.weight: ctx.weight * 2.20462),
            weight_origin: ctx.weight_origin,
            ftp: ctx.ftp,
            ftp_origin: ctx.ftp_origin,
            intensity,
            tss: np && sauce.power.calcTSS(np, intensity, ctx.ftp)
        }));
        attachEditableFTP(stats_frag);
        attachEditableWeight(stats_frag);
        stats_frag.insertAfter(jQuery('.inline-stats').last());
        if (wattsStream && sauce.config.options['analysis-cp-chart']) {
            const critpower_frag = jQuery(ctx.critpower_tpl({
                cp_periods: ride_cp_periods,
                is_watt_estimate: is_watt_estimate
            }));
            critpower_frag.insertAfter(jQuery('#pagenav').first());
            const timeStream = getStream('time');
            for (const [label, period] of ride_cp_periods) {
                const roll = sauce.power.critpower(period, timeStream, wattsStream);
                if (!roll) {
                    continue;
                }
                const el = jQuery(`#sauce-cp-${period}`);
                el.html(Math.round(roll.avg()));
                el.parent().click(ev => {
                    openDialog(moreinfoRideDialog({
                        label,
                        roll,
                        anchor_to: el.parent()
                    }), el.closest('tr'));
                    ev.stopPropagation();
                    sauce.rpc.reportEvent('MoreInfoDialog', 'open', `critical-power-${period}`);
                });
                jQuery(`#sauce-cp-row-${period}`).show();
            }
        }
    }


    async function processRunStreams() {
        await fetchStreams([
            'distance',
            'time',
            'pace',
            'grade_smooth',
        ]);
        const distStream = getStream('distance');
        if (!distStream || !sauce.config.options['analysis-cp-chart']) {
            return;
        }
        const weight_unit = pageView.activityAthlete().get('weight_measurement_unit');
        const stats_frag = jQuery(ctx.tertiary_stats_tpl({
            type: 'run',
            weight_unit,
            weight_norm: Math.round(prefersKg() ? ctx.weight: ctx.weight * 2.20462),
            weight_origin: ctx.weight_origin,
        }));
        attachEditableWeight(stats_frag);
        stats_frag.insertAfter(jQuery('.inline-stats').last());
        const metric = prefersMetric();
        const bestpace_frag = jQuery(ctx.bestpace_tpl({
            metric,
            cp_distances: run_cp_distances
        }));
        bestpace_frag.insertAfter(jQuery('#pagenav').first());
        const timeStream = getStream('time');
        const paceStream = getStream('pace');
        for (const [label, distance] of run_cp_distances) {
            const roll = sauce.pace.bestpace(distance, timeStream, distStream, paceStream);
            if (roll === undefined) {
                continue;
            }
            const el = jQuery(`#sauce-cp-${distance}`);
            el.attr('title', `Elapsed time: ${formatPace(roll.elapsed())}`);
            const unit = metric ? 'k' : 'm';
            el.html(`${humanPace(roll.avg())}<small>/${unit}</small>`);
            el.parent().click(ev => {
                openDialog(moreinfoRunDialog({
                    label,
                    roll,
                    elapsed: formatPace(roll.elapsed()),
                    bp_str: humanPace(roll.avg()),
                    anchor_to: el.parent()
                }), el.closest('tr'));
                ev.stopPropagation();
                sauce.rpc.reportEvent('MoreInfoDialog', 'open', `best-pace-${distance}`);
            });
            jQuery(`#sauce-cp-row-${distance}`).show();
        }
    }


    let _preferMetric;
    function prefersMetric() {
        if (_preferMetric === undefined) {
            _preferMetric = currentAthlete.get('measurement_preference') !== 'feet';
        }
        return _preferMetric;
    }


    let _preferKg;
    function prefersKg() {
        if (_preferKg === undefined) {
            _preferKg = pageView.activityAthlete().get('weight_measurement_unit') !== 'lbs';
        }
        return _preferKg;
    }


    function milePace(secondsPerMeter) {
        /* Convert strava pace into seconds per mile */
        return metersPerMile * secondsPerMeter;
    }


    function kmPace(secondsPerMeter) {
        /* Convert strava pace into seconds per kilometer */
        return  1000 * secondsPerMeter;
    }


    function localePace(secondsPerMeter) {
        /* Convert seconds per metere (native stream format) to seconds per
         * the athletes locale based fav unit.  E.g. /km or /mile */
        if (prefersMetric()) {
            return kmPace(secondsPerMeter);
        } else {
            return milePace(secondsPerMeter);
        }
    }


    function formatPace(pace) {
        /* Convert seconds to a human string */
        pace = Math.round(pace);
        const hours = Math.floor(pace / 3600);
        const mins = Math.floor(pace / 60 % 60);
        const seconds = pace % 60;
        const result = [];
        if (hours) {
            result.push(hours);
            if (mins < 10) {
                result.push('0' + mins);
            } else {
                result.push(mins);
            }
        } else {
            result.push(mins);
        }
        if (seconds < 10) {
            result.push('0' + seconds);
        } else {
            result.push(seconds);
        }
        return result.join(':');
    }


    function humanPace(secondsPerMeter) {
        return formatPace(localePace(secondsPerMeter));
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


    function humanElevation(elevation) {
        if (prefersMetric()) {
            return `${elevation.toLocaleString(undefined, {maximumFractionDigits: 0})}`;
        } else {
            return `${(elevation * 3.28084).toLocaleString(undefined, {maximumFractionDigits: 0})}`;
        }
    }


    function moreinfoRideDialog(opts) {
        const roll = opts.roll;
        const avgPower = roll.avg();
        const np = sauce.power.calcNP(roll.values());
        const rollSize = roll.size();
        const avgpwr = np.value ? np : {value: avgPower, count: rollSize};
        const intensity = avgpwr.value / ctx.ftp;
        const w_kg = ctx.weight ? avgPower / ctx.weight : null;
        const gender = pageView.activityAthlete().get('gender') === 'F' ? 'female' : 'male';
        const rank = sauce.power.rank(roll.period, w_kg, gender);
        const rank_cat = rank && sauce.power.rankCat(rank);
        const startTime = roll.firstTimestamp({noPad: true});
        const endTime = roll.lastTimestamp({noPad: true});
        const hrStream = getStreamTimeRange('heartrate', startTime, endTime);
        const altStream = getStreamTimeRange('altitude', startTime, endTime);
        const altChanges = altStream && altitudeChanges(altStream);
        const gradeStream = altStream && getStreamTimeRange('grade_smooth', startTime, endTime);
        const cadenceStream = getStreamTimeRange('cadence', startTime, endTime);
        const data = {
            title: `Critical Power: ${opts.label}`,
            start_time: (new Strava.I18n.TimespanFormatter()).display(startTime),
            w_kg,
            power: {
                avg: avgPower,
                max: sauce.data.max(roll.values()),
                np: np.value,
            },
            tss: sauce.power.calcTSS(avgpwr, intensity, ctx.ftp),
            rank,
            rank_cat,
            rank_image: rank && rank_image(rank_cat),
            intensity,
            hr: hrStream && {
                min: sauce.data.min(hrStream),
                avg: sauce.data.avg(hrStream),
                max: sauce.data.max(hrStream),
            },
            cadence: cadenceStream && sauce.data.avg(cadenceStream),
            grade: gradeStream && {
                min: sauce.data.min(gradeStream),
                avg: sauce.data.avg(gradeStream),
                max: sauce.data.max(gradeStream),
                gain: humanElevation(altChanges.gain),
                loss: humanElevation(altChanges.loss),
                vam: (altChanges.gain / roll.period) * 3600,
            },
            elevationUnit: prefersMetric() ? 'm' : 'ft',
            hasFtp: ctx.ftp_origin !== 'default'
        };
        const moreinfo_frag = jQuery(ctx.moreinfo_tpl(data));
        let dialog;
        const showAnalysisView = function() {
            const start = getStreamTimeIndex(startTime);
            const end = getStreamTimeIndex(endTime);
            pageView.router().changeMenuTo(`analysis/${start}/${end + 1}`);
            dialog.dialog('close');
        };
        moreinfo_frag.find('.start_time_link').click(showAnalysisView);

        dialog = moreinfo_frag.dialog({
            resizable: false,
            width: 240,
            dialogClass: 'sauce-freerange-dialog',
            show: {
                effect: 'slideDown',
                duration: 200
            },
            position: {
                my: 'left center',
                at: 'right center',
                of: opts.anchor_to
            },
            buttons: [{
                text: 'Close',
                click: function() {
                    dialog.dialog('close');
                }
            }, {
                text: 'Analysis View',
                click: showAnalysisView
            }]
        });

        const smoothedData = resample(roll.values(), 240);
        /* Must run after the dialog is open for proper rendering. */
        moreinfo_frag.find('.sauce-sparkline').sparkline(smoothedData, {
            type: 'line',
            width: '100%',
            height: 56,
            lineColor: '#EA400D',
            fillColor: 'rgba(234, 64, 13, 0.61)',
            chartRangeMin: 0,
            normalRangeMin: 0,
            normalRangeMax: avgPower,
            tooltipSuffix: 'w'
        });

        return dialog;
    }


    function moreinfoRunDialog(opts) {
        const roll = opts.roll;
        const elapsed = formatPace(roll.elapsed());
        const startTime = roll.firstTimestamp();
        const endTime = roll.lastTimestamp();
        const hrStream = getStreamTimeRange('heartrate', startTime, endTime);
        const gapStream = getStreamTimeRange('grade_adjusted_pace', startTime, endTime);
        const cadenceStream = getStreamTimeRange('cadence', startTime, endTime);
        const altStream = getStreamTimeRange('altitude', startTime, endTime);
        const altChanges = altStream && altitudeChanges(altStream);
        const gradeStream = altStream && getStreamTimeRange('grade_smooth', startTime, endTime);
        const metric = prefersMetric();
        const maxPace = localePace(sauce.data.max(roll._paces));
        const data = {
            title: 'Best Pace: ' + opts.label,
            start_time: (new Strava.I18n.TimespanFormatter()).display(startTime),
            metric,
            pace: {
                min: humanPace(sauce.data.min(roll._paces)),
                avg: humanPace(roll.avg()),
                max: maxPace < 3600 ? formatPace(maxPace) : null, // filter out paces over 1 hour
                gap: gapStream && humanPace(sauce.data.avg(gapStream)),
            },
            elapsed,
            hr: hrStream && {
                min: sauce.data.min(hrStream),
                avg: sauce.data.avg(hrStream),
                max: sauce.data.max(hrStream),
            },
            cadence: cadenceStream && sauce.data.avg(cadenceStream) * 2,
            grade: gradeStream && {
                min: sauce.data.min(gradeStream),
                avg: sauce.data.avg(gradeStream),
                max: sauce.data.max(gradeStream),
                gain: humanElevation(altChanges.gain),
                loss: humanElevation(altChanges.loss),
            },
            elevationUnit: metric ? 'm' : 'ft'
        };
        const moreinfo_frag = jQuery(ctx.moreinfo_tpl(data));
        let dialog;
        const showAnalysisView = function() {
            const start = getStreamTimeIndex(startTime);
            const end = getStreamTimeIndex(endTime);
            pageView.router().changeMenuTo(`analysis/${start}/${end + 1}`);
            dialog.dialog('close');
        };
        moreinfo_frag.find('.start_time_link').click(showAnalysisView);

        dialog = moreinfo_frag.dialog({
            resizable: false,
            width: 240,
            dialogClass: 'sauce-freerange-dialog',
            show: {
                effect: 'slideDown',
                duration: 200
            },
            position: {
                my: 'left center',
                at: 'right center',
                of: opts.anchor_to
            },
            buttons: [{
                text: 'Close',
                click: function() {
                    dialog.dialog('close');
                }
            }, {
                text: 'Analysis View',
                click: showAnalysisView
            }]
        });

        const smoothedData = resample(roll._paces, 240);
        const perUnitPaceData = smoothedData.map(x => Math.round((localePace(x) / 60) * 100) / 100);
        /* Must run after the dialog is open for proper rendering. */
        moreinfo_frag.find('.sauce-sparkline').sparkline(perUnitPaceData, {
            type: 'line',
            width: '100%',
            height: 56,
            lineColor: '#EA400D',
            fillColor: 'rgba(234, 64, 13, 0.61)',
            chartRangeMin: 0,
            normalRangeMin: 0,
            normalRangeMax: localePace(roll.avg()) / 60,
            tooltipSuffix: '/mi'
        });

        return dialog;
    }


    async function load() {
        const activity = await fetchFullActivity();
        let start;
        if (activity.isRun()) {
            start = startRun;
        } else if (activity.isRide()) {
            start = startRide;
        }
        const type = activity.get('fullType') || activity.get('type');
        await sauce.rpc.ga('set', 'page', `/site/analysis/${type}`);
        await sauce.rpc.ga('set', 'title', 'Sauce Analysis');
        await sauce.rpc.ga('send', 'pageview');
        if (start) {
            await start();
        }
    }


    async function getTemplate(filename) {
        const resp = await fetch(`${tpl_url}/${filename}`);
        const tplText = await resp.text();
        return _.template(tplText);
    }


    async function attachExporters() {
        const menuEl = document.querySelector('nav.sidenav .actions-menu .drop-down-menu ul.options');
        const sauceIcon = `<img class="sauce-icon" src="${sauce.extURL}assets/icons/icon64.png"/>`;

        const gpxLink = document.createElement('li');
        gpxLink.innerHTML = `<a href="javascript:void(0)">${sauceIcon}Export GPX <sup style="color: blue;">BETA</sup></a>`;
        gpxLink.title = 'Generate a GPX file for this activity using Strava Sauce';
        gpxLink.addEventListener('click', () => exportActivity(sauce.export.GPXSerializer));
        menuEl.appendChild(gpxLink);

        const tpxLink = document.createElement('li');
        tpxLink.title = 'Generate a TCX file for this activity using Strava Sauce';
        tpxLink.innerHTML = `<a href="javascript:void(0)">${sauceIcon}Export TCX <sup style="color: blue;">BETA</sup></a>`;
        tpxLink.addEventListener('click', () => exportActivity(sauce.export.TCXSerializer));
        menuEl.appendChild(tpxLink);
    }


    function getEstimatedActivityStart() {
        // Activity start time is sadly complicated.  Despite being visible in the header
        // for all activities we only have access to it for rides and self-owned runs.  Trying
        // to parse the html might work for english rides but will fail for non-english users.
        const localTime = pageView.activity().get('startDateLocal') * 1000;
        if (localTime) {
            // Do a very basic tz correction based on the longitude of any geo data we can find.
            // Using a proper timezone API is too expensive for this use case.
            const geoStream = getStream('latlng');
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
                const athleteGeo = pageView.activityAthlete().get('geo');
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


    async function exportActivity(Serializer) {
        const streamNames = ['time', 'watts', 'heartrate', 'altitude', 'cadence', 'temp', 'latlng', 'distance'];
        const streams = (await fetchStreams(streamNames)).reduce((acc, x, i) => (acc[streamNames[i]] = x, acc), {});
        const activity = await fetchFullActivity();
        const realStartTime = activity.get('start_time');
        let start;
        if (realStartTime) {
            start = new Date(realStartTime);
        } else {
            start = getEstimatedActivityStart();
        }
        console.info("Setting activity start time to:", start);
        const name = document.querySelector('#heading .activity-name').textContent;
        const serializer = new Serializer(name, activity.get('type'), start);
        serializer.loadStreams(streams);
        const link = document.createElement('a');
        const f = serializer.toFile();
        link.href = URL.createObjectURL(f);
        link.download = f.name;
        link.style.display = 'none';
        document.body.appendChild(link);
        try {
            link.click();
        } finally {
            link.remove();
            URL.revokeObjectURL(link.href);
        }
    }


    async function attachComments() {
        const $root = jQuery('.activity-summary');
        const $commentsEl = jQuery('<div class="sauce-inline-comments"></div>');
        const $submitEl = jQuery([
            '<div class="sauce-new-comment">',
                '<div>',
                    '<div class="sauce-label">Say something</div>',
                    '<input type="text" placeholder="Your comment here..."/>',
                    '<button disabled>Comment</button>',
                '</div>',
            '</div>'
        ].join(''));
        const $input = $submitEl.find('input');
        const $button = $input.next('button');
        const activityId = pageView.activity().get('id');
        const submit_comment = () => {
            pageView.commentsController().comment('Activity', activityId, $input.val());
            $input.val('');
            sauce.rpc.reportEvent('Comment', 'submit');
        };
        $input.on('input', ev => {
            if ($input.val()) {
                $button.removeAttr('disabled');
            } else {
                $button.attr('disabled', 'disabled');
            }
        });
        $input.on('keypress', ev => {
            if (ev.which == 13 /*Enter*/ && $input.val()) {
                submit_comment();
            }
        });
        $button.on('click', submit_comment);
        $root.append([$commentsEl, $submitEl]);

        const commentsTpl = await getTemplate('inline-comment.html');
        const renderComments = () => {
            const ctrl = pageView.commentsController();
            const comments = ctrl.getFromHash(`Activity-${activityId}`);
            const stack = [];
            comments.forEach(function(x) {
                const dt = new Date(jQuery(x.timestamp).attr('datetime'));
                x.timeago = sauce.time.ago(dt);
                stack.push(commentsTpl(x));
            });
            $commentsEl.html(stack.join(''));
        };

        pageView.commentsController().on('commentCompleted', () => renderComments());
        renderComments();
    }


    function addBadge(row) {
        const gender = pageView.activityAthlete().get('gender') === 'F' ? 'female' : 'male';
        if (row.querySelector(':scope > td.sauce-mark')) {
            return;
        }
        const segment = pageView.segmentEfforts().getEffort(Number(row.dataset.segmentEffortId));
        if (!segment) {
            console.warn("Segment data not found for:", row.dataset.segmentEffortId);
            return;
        }
        const w_kg = segment.get('avg_watts_raw') / ctx.weight;
        const rank = sauce.power.rank(segment.get('elapsed_time_raw'), w_kg, gender);
        if (!rank || rank <= 0) {
            return;  // Too slow/weak
        }
        const cat = sauce.power.rankCat(rank);
        const src = rank_image(cat);
        if (!src) {
            return;  // Too slow/weak
        }
        const locator = row.querySelector(':scope > td > abbr[title="watts"]');
        if (!locator) {
            console.error("Watt TD location failed for row:", row);
            throw new Error("Badge Fail");
        }
        const td = locator.closest('td');
        td.classList.add('sauce-mark');
        td.innerHTML = [
            `<div class="sauce-watts-holder">`,
                `<div class="watts">${td.innerHTML}</div>`,
                `<img src="${src}" title="World Ranking: ${Math.round(rank * 100)}%\n`,
                                         `Watts/kg: ${w_kg.toFixed(1)}" class="sauce-rank"/>`,
            `</div>`
        ].join('');
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
            }
        }
    }


    async function startRun() {
        await attachExporters();
        await attachComments();
        ctx.tertiary_stats_tpl = await getTemplate('tertiary-stats.html');
        ctx.bestpace_tpl = await getTemplate('bestpace.html');
        ctx.moreinfo_tpl = await getTemplate('bestpace-moreinfo.html');
        assignWeight(await sauce.rpc.getWeight(pageView.activityAthlete().get('id')));
        await processRunStreams();
    }


    async function startRide() {
        const displayDetailsFn = Strava.Charts.Activities.BasicAnalysisElevation.prototype.displayDetails;
        Strava.Charts.Activities.BasicAnalysisElevation.prototype.displayDetails = function(start, end) {
            return extendSelectionDisplayDetails(displayDetailsFn.call(this, start, end), start, end);
        };
        sauce.func.runAfter(Strava.Charts.Activities.BasicAnalysisElevation,
            'displayDetails', function(ret, start, end) {
                ns.handleSelectionChange(start, end);
            });
        sauce.func.runAfter(Strava.Charts.Activities.LabelBox, 'handleStreamHover',
            function(ret, _, start, end) {
                ns.handleSelectionChange(start, end);
            });
        const segments = document.querySelector('table.segments');
        if (segments && sauce.config.options['analysis-segment-badges']) {
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
            }
        }
        await attachExporters();
        await attachComments();
        ctx.tertiary_stats_tpl = await getTemplate('tertiary-stats.html');
        ctx.critpower_tpl = await getTemplate('critpower.html');
        ctx.moreinfo_tpl = await getTemplate('critpower-moreinfo.html');
        assignFTP(await sauce.rpc.getFTP(pageView.activityAthlete().get('id')));
        assignWeight(await sauce.rpc.getWeight(pageView.activityAthlete().get('id')));
        await processRideStreams();
    }


    function assignFTP(sauce_ftp) {
        const power = pageView.powerController && pageView.powerController();
        /* Sometimes you can get it from the activity.  I think this only
         * works when you are the athlete in the activity. */
        const strava_ftp = power ? power.get('athlete_ftp') : pageView.activity().get('ftp');
        let ftp;
        if (!sauce_ftp) {
            if (strava_ftp) {
                ftp = strava_ftp;
                ctx.ftp_origin = 'strava';
            } else {
                ftp = default_ftp;
                ctx.ftp_origin = 'default';
            }
        } else {
            if (strava_ftp && sauce_ftp != strava_ftp) {
                console.warn("Sauce FTP override differs from Strava FTP:", sauce_ftp, strava_ftp);
            }
            ftp = sauce_ftp;
            ctx.ftp_origin = 'sauce';
        }
        ctx.ftp = ftp;
    }


    function assignWeight(sauce_weight) {
        const strava_weight = pageView.activityAthleteWeight();
        let weight;
        if (!sauce_weight) {
            if (strava_weight) {
                weight = strava_weight;
                ctx.weight_origin = 'strava';
            } else {
                weight = 0;
                ctx.weight_origin = 'default';
            }
        } else {
            if (strava_weight && sauce_weight != strava_weight) {
                console.warn("Sauce weight override differs from Strava weight:", sauce_weight, strava_weight);
            }
            weight = sauce_weight;
            ctx.weight_origin = 'sauce';
        }
        ctx.weight = weight;
    }


    function handleSelectionChange(start, end) {
        const wattsStream = getStream('watts') || getStream('watts_calc');
        if (!wattsStream) {
            return;
        }
        const selection = wattsStream.slice(start, end);
        const np = sauce.power.calcNP(selection).value;
        const avg = sauce.data.avg(selection);
        const el = jQuery('text.label:contains(Power)').siblings('.avg-js');
        const text = [`Avg ${Math.round(avg)}`];
        if (np) {
            text.push(` (${Math.round(np)} np)`);
        }
        el.html(text.join(''));
    }


    function extendSelectionDisplayDetails(value, start, end) {
        const altStream = getStream('altitude', start, end);
        if (!altStream) {
            return value;
        }
        const altChanges = altitudeChanges(altStream);
        const vam = (altChanges.gain / (end - start)) * 3600;
        if (vam > 0) {
            const pad = Array(6).join('&nbsp;');
            return value + `${pad}<span title="Vertical Ascent Meters / hour">VAM: ` +
                           `${Math.round(vam).toLocaleString()}<small>m/hr</small></span><sup style="color: blue"> BETA</sup>`;
        }
        return value;
    }


    return {
        load,
        handleSelectionChange,
    };
});


if (!sauce.testing) {
    (async function() {
        try {
            await sauce.analysis.load();
        } catch(e) {
            await sauce.rpc.reportError(e);
            throw e;
        }
    })();
}
