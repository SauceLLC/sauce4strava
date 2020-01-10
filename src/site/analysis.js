/* global Strava sauce jQuery pageView _ */

sauce.ns('analysis', function(ns) {
    'use strict';

    const ctx = {};
    const tplUrl = sauce.extURL + 'templates';

    const distanceFormatter = new Strava.I18n.DistanceFormatter();
    const elevationFormatter = new Strava.I18n.ElevationFormatter();
    const timeFormatter = new Strava.I18n.TimespanFormatter();
    const paceFormatter = new Strava.I18n.PaceFormatter();
    const weightFormatter = new Strava.I18n.WeightFormatter();

    const rideCPs = [
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
        ['1 hour', 3600],
    ];

    const metersPerMile = 1609.344;
    const runBPs = [
        ['100 m', 100],
        ['200 m', 200],
        ['400 m', 400],
        ['1 km', 1000],
        ['1 mile', Math.round(metersPerMile)],
        ['3 km', 3000],
        ['5 km', 5000],
        ['10 km', 10000],
        ['13.1 mile', Math.round(metersPerMile * 13.1)],
        ['26.2 mile', Math.round(metersPerMile * 26.2)],
        ['50 km', 50000],
    ];

    const rankMap = [
        [/^World Class.*/, 'world-tour.png'],
        [/^Pro.?/, 'pro.png'],
        [/^Cat 1.?/, 'cat1.png'],
        [/^Cat 2.?/, 'cat2.png'],
        [/^Cat 3.?/, 'cat3.png'],
        [/^Cat 4.?/, 'cat4.png'],
        [/^Cat 5.?/, 'cat5.png']
    ];


    function rankImage(rankCat) {
        for (const [expr, image] of rankMap) {
            if (rankCat.match(expr)) {
                return `${sauce.extURL}assets/ranking/${image}`;
            }
        }
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
        dialog.on('dialogclose', () => selectorEl.classList.remove('selected'));
        selectorEl.classList.add('selected');
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
                const kg = weightFormatter.unitSystem === 'metric' ? v : v / 2.20462;
                await sauce.rpc.setWeight(pageView.activityAthlete(), kg);
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
        const isWattEstimate = !wattsStream;
        if (!wattsStream) {
            wattsStream = await fetchStream('watts_calc');
            if (!wattsStream) {
                console.info("No power data for this activity.");
            }
            /* Only show large period for watt estimates. */
            while (rideCPs[0][1] < 300) {
                rideCPs.shift();
            }
        }
        const np = sauce.power.calcNP(wattsStream);
        const adjPowerAvg = np || Infinity; // XXX use unbounded rollingavg 
        const intensity = ctx.ftp ? adjPowerAvg / ctx.ftp : undefined;
        const timeStream = getStream('time');
        const duration = timeStream[timeStream.length - 1] - timeStream[0];
        const statsFrag = jQuery(ctx.tertiaryStatsTpl({
            type: 'ride',
            np,
            weightUnit: weightFormatter.shortUnitKey(),
            weightNorm: humanWeight(ctx.weight),
            weightOrigin: ctx.weightOrigin,
            ftp: ctx.ftp,
            ftpOrigin: ctx.ftpOrigin,
            intensity,
            tss: ctx.ftp ? sauce.power.calcTSS(adjPowerAvg, duration, ctx.ftp) : undefined
        }));
        attachEditableFTP(statsFrag);
        attachEditableWeight(statsFrag);
        statsFrag.insertAfter(jQuery('.inline-stats').last());
        if (wattsStream && sauce.config.options['analysis-cp-chart']) {
            const critPowers = [];
            for (const [label, period] of rideCPs) {
                const roll = sauce.power.critpower(period, timeStream, wattsStream);
                if (roll) {
                    critPowers.push({
                        label,
                        roll,
                        power: Math.round(roll.avg()).toLocaleString(),
                    });
                }
            }
            const holderEl = jQuery(ctx.critpowerTpl({
                critPowers,
                isWattEstimate
            })).insertAfter(jQuery('#pagenav').first())[0];
            for (const {label, roll} of critPowers) {
                const row = holderEl.querySelector(`#sauce-cp-${roll.period}`);
                row.addEventListener('click', async ev => {
                    //ev.stopPropagation();
                    openDialog(await moreinfoRideDialog({label, roll, anchorEl: row}), row);
                    sauce.rpc.reportEvent('MoreInfoDialog', 'open', `critical-power-${roll.period}`);
                });
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
        const timeStream = getStream('time');
        const saucePaceStream = [];
        const saucePaceStream2 = [];
        let lastDistance = distStream[0];
        //let lastTime = timeStream[0];
        const rollAvg = new sauce.data.RollingWindow(10);
        for (let i = 1; i < timeStream.length; i++) {
            const time = timeStream[i] - timeStream[i - 1];
            rollAvg.add(time, distStream[i] - distStream[i - 1]);
            saucePaceStream2.push(rollAvg.avg());
            const dist = distStream[i] - lastDistance;
            if (dist > 0.1) {
                let ii = i;
                const pace = time / dist;
                do {
                    saucePaceStream[ii--] = pace;
                } while(ii >= 0 && saucePaceStream[ii] === undefined);
                //lastTime = timeStream[i];
                lastDistance = distStream[i];
            } else {
                console.count("Buffering");
            }
        }
        pageView.streams().streamData.add('sauce_pace', saucePaceStream);
        if (window.location.search.match(/\?s/)) {
            pageView.streams().streamData.add('pace', saucePaceStream); // XXX
        }
        const statsFrag = jQuery(ctx.tertiaryStatsTpl({
            type: 'run',
            weightUnit: weightFormatter.shortUnitKey(),
            weightNorm: humanWeight(ctx.weight),
            weightOrigin: ctx.weightOrigin,
        }));
        attachEditableWeight(statsFrag);
        statsFrag.insertAfter(jQuery('.inline-stats').last());
        const bestPaces = [];
        for (const [label, distance] of runBPs) {
            const roll = sauce.pace.bestpace(distance, timeStream, distStream);
            if (roll) {
                bestPaces.push({
                    label,
                    roll,
                    pace: humanPace(roll.avg()),
                });
            }
        }
        if (bestPaces.length) {
            const holderEl = jQuery(ctx.bestpaceTpl({
                bestPaces,
                distUnit: distanceFormatter.shortUnitKey(),
            })).insertAfter(jQuery('#pagenav').first())[0];
            for (const {label, roll} of bestPaces) {
                const row = holderEl.querySelector(`#sauce-cp-${roll.period}`);
                row.addEventListener('click', async ev => {
                    //ev.stopPropagation();
                    openDialog(await moreinfoRunDialog({label, roll, anchorEl: row}), row);
                    sauce.rpc.reportEvent('MoreInfoDialog', 'open', `best-pace-${roll.period}`);
                });
            }
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


    function humanPace(secondsPerMeter, options) {
        options = options || {};
        const mps = 1 / secondsPerMeter;
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


    async function moreinfoRideDialog({roll, label, anchorEl}) {
        const avgPower = roll.avg();
        const rollValues = roll.values();
        const np = sauce.power.calcNP(rollValues);
        const adjPowerAvg = np || avgPower;
        const intensity = ctx.ftp ? adjPowerAvg / ctx.ftp : undefined;
        const tss = ctx.ftp ? sauce.power.calcTSS(adjPowerAvg, roll.elapsed(), ctx.ftp) : undefined;
        const wKg = ctx.weight ? avgPower / ctx.weight : undefined;
        const gender = pageView.activityAthlete().get('gender') === 'F' ? 'female' : 'male';
        const rank = sauce.power.rank(roll.period, wKg, gender);
        const startTime = roll.firstTimestamp({noPad: true});
        const endTime = roll.lastTimestamp({noPad: true});
        const hrStream = getStreamTimeRange('heartrate', startTime, endTime);
        const altStream = getStreamTimeRange('altitude', startTime, endTime);
        const altChanges = altStream && altitudeChanges(altStream);
        const gradeStream = altStream && getStreamTimeRange('grade_smooth', startTime, endTime);
        const cadenceStream = getStreamTimeRange('cadence', startTime, endTime);
        const moreinfoFrag = jQuery(ctx.moreinfoTpl({
            title: `Critical Power: ${label}`,
            startsAt: humanTime(startTime),
            wKg,
            power: {
                avg: avgPower,
                max: sauce.data.max(rollValues),
                np,
            },
            tss,
            rank,
            rankImage: rank && sauce.power.rankCat(rank),
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
            elevationUnit: elevationFormatter.shortUnitKey(),
            distUnit: distanceFormatter.shortUnitKey(),
            distUnitLong: distanceFormatter.longUnitKey(),
        }));
        let dialog;
        const showAnalysisView = () => {
            const start = getStreamTimeIndex(startTime);
            const end = getStreamTimeIndex(endTime);
            pageView.router().changeMenuTo(`analysis/${start}/${end}`);
            dialog.dialog('close');
        };
        moreinfoFrag.find('.start_time_link').click(showAnalysisView);
        dialog = moreinfoFrag.dialog({
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
                of: anchorEl
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
        const smoothedData = rollValues.length > 120 ? await sauce.data.resample(rollValues, 120): rollValues;
        /* Must run after the dialog is open for proper rendering. */
        moreinfoFrag.find('.sauce-sparkline').sparkline(smoothedData, {
            type: 'line',
            width: '100%',
            height: 56,
            lineColor: '#EA400D',
            fillColor: 'rgba(234, 64, 13, 0.61)',
            chartRangeMin: 0,
            normalRangeMin: 0,
            normalRangeMax: avgPower,
            tooltipFormatter: (_, _2, data) => `${Math.round(data.y)}<abbr class="unit short">w</abbr>`
        });
        return dialog;
    }


    async function moreinfoRunDialog({roll, label, anchorEl}) {
        const elapsed = humanTime(roll.elapsed());
        const startTime = roll.firstTimestamp({noPad: true});
        const endTime = roll.lastTimestamp({noPad: true});
        //const paceStream = getStreamTimeRange('pace', startTime, endTime);
        const paceStream = getStreamTimeRange('sauce_pace', startTime, endTime);
        const hrStream = getStreamTimeRange('heartrate', startTime, endTime);
        const gapStream = getStreamTimeRange('grade_adjusted_pace', startTime, endTime);
        const cadenceStream = getStreamTimeRange('cadence', startTime, endTime);
        const altStream = getStreamTimeRange('altitude', startTime, endTime);
        const altChanges = altStream && altitudeChanges(altStream);
        const gradeStream = altStream && getStreamTimeRange('grade_smooth', startTime, endTime);
        const maxPace = sauce.data.max(paceStream);
        const data = {
            title: `Best Pace: ${label}`,
            startsAt: humanTime(startTime),
            pace: {
                min: humanPace(sauce.data.min(paceStream)),
                avg: humanPace(roll.avg()),
                max: maxPace < 2 && humanPace(maxPace), // filter out slow paces
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
            elevationUnit: elevationFormatter.shortUnitKey(),
            distUnit: distanceFormatter.shortUnitKey(),
            distUnitLong: distanceFormatter.longUnitKey(),
        };
        const moreinfoFrag = jQuery(ctx.moreinfoTpl(data));
        let dialog;
        const showAnalysisView = () => {
            const start = getStreamTimeIndex(startTime);
            const end = getStreamTimeIndex(endTime);
            pageView.router().changeMenuTo(`analysis/${start}/${end}`);
            dialog.dialog('close');
        };
        moreinfoFrag.find('.start_time_link').click(showAnalysisView);
        dialog = moreinfoFrag.dialog({
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
                of: anchorEl
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
        const smoothedData = paceStream.length > 120 ? await sauce.data.resample(paceStream, 120) : paceStream;
        //const invertedData = smoothedData.map(x => x < 2 ? 2 - x : null);
        const invertedData = smoothedData.map(x => x);
        /* Must run after the dialog is open for proper rendering. */
        moreinfoFrag.find('.sauce-sparkline').sparkline(invertedData, {
            type: 'line',
            width: '100%',
            height: 56,
            lineColor: '#EA400D',
            fillColor: 'rgba(234, 64, 13, 0.61)',
            chartRangeMin: 0, // XXX
            normalRangeMin: 0, // XXX
            normalRangeMax: sauce.data.avg(invertedData),
            tooltipFormatter: (_, _2, data) => humanPace(2 - data.y, {html: true, suffix: true})
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


    let _tplCache = {};
    async function getTemplate(filename) {
        if (!_tplCache[filename]) {
            const resp = await fetch(`${tplUrl}/${filename}`);
            const tplText = await resp.text();
            _tplCache[filename] = _.template(tplText);
        }
        return _tplCache[filename];
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
        const streamNames = ['time', 'watts', 'heartrate', 'altitude',
                             'cadence', 'temp', 'latlng', 'distance'];
        const streams = (await fetchStreams(streamNames)).reduce((acc, x, i) => (acc[streamNames[i]] = x, acc), {});
        const activity = await fetchFullActivity();
        const realStartTime = activity.get('start_time');
        let start;
        if (realStartTime) {
            start = new Date(realStartTime);
        } else {
            start = getEstimatedActivityStart();
        }
        // Name and description are not available in the activity model for other users..
        const name = document.querySelector('#heading .activity-name').textContent;
        const descEl = document.querySelector('#heading .activity-description .content');
        const desc = descEl && descEl.textContent;
        const serializer = new Serializer(name, desc, activity.get('type'), start);
        serializer.start();
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
        const submitComment = () => {
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
                submitComment();
            }
        });
        $button.on('click', submitComment);
        $root.append([$commentsEl, $submitEl]);
        const commentsTpl = await getTemplate('inline-comment.html');
        function renderComments() {
            const commentsHtml = [];
            for (const x of pageView.commentsController().getFromHash(`Activity-${activityId}`)) {
                commentsHtml.push(commentsTpl({
                    tokens: x.comment,
                    athlete: x.athlete,
                    timeago: sauce.time.ago(new Date(jQuery(x.timestamp).attr('datetime'))),
                }));
            }
            $commentsEl.html(commentsHtml.join(''));
        }
        pageView.commentsController().on('commentCompleted', renderComments);
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
        const wKg = segment.get('avg_watts_raw') / ctx.weight;
        const rank = sauce.power.rank(segment.get('elapsed_time_raw'), wKg, gender);
        if (!rank || rank <= 0) {
            return;  // Too slow/weak
        }
        const cat = sauce.power.rankCat(rank);
        const src = rankImage(cat);
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
                                         `Watts/kg: ${wKg.toFixed(1)}" class="sauce-rank"/>`,
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
        ctx.tertiaryStatsTpl = await getTemplate('tertiary-stats.html');
        ctx.bestpaceTpl = await getTemplate('bestpace.html');
        ctx.moreinfoTpl = await getTemplate('bestpace-moreinfo.html');
        assignWeight(await sauce.rpc.getWeight(pageView.activityAthlete().get('id')));
        await processRunStreams();
    }


    async function startRide() {
        const displayDetailsFn = Strava.Charts.Activities.BasicAnalysisElevation.prototype.displayDetails;
        Strava.Charts.Activities.BasicAnalysisElevation.prototype.displayDetails = function(start, end) {
            return extendSelectionDisplayDetails(displayDetailsFn.call(this, start, end), start, end);
        };
        sauce.func.runAfter(Strava.Charts.Activities.BasicAnalysisElevation, 'displayDetails',
            (ret, start, end) => handleSelectionChange(start, end));
        sauce.func.runAfter(Strava.Charts.Activities.LabelBox, 'handleStreamHover',
            (ret, _, start, end) => handleSelectionChange(start, end));
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
        ctx.tertiaryStatsTpl = await getTemplate('tertiary-stats.html');
        ctx.critpowerTpl = await getTemplate('critpower.html');
        ctx.moreinfoTpl = await getTemplate('critpower-moreinfo.html');
        assignFTP(await sauce.rpc.getFTP(pageView.activityAthlete().get('id')));
        assignWeight(await sauce.rpc.getWeight(pageView.activityAthlete().get('id')));
        await processRideStreams();
    }


    function assignFTP(sauceFtp) {
        const power = pageView.powerController && pageView.powerController();
        /* Sometimes you can get it from the activity.  I think this only
         * works when you are the athlete in the activity. */
        const stravaFtp = power ? power.get('athlete_ftp') : pageView.activity().get('ftp');
        let ftp;
        if (!sauceFtp) {
            if (stravaFtp) {
                ftp = stravaFtp;
                ctx.ftpOrigin = 'strava';
            } else {
                ftp = 0;
                ctx.ftpOrigin = 'default';
            }
        } else {
            if (stravaFtp && sauceFtp != stravaFtp) {
                console.warn("Sauce FTP override differs from Strava FTP:", sauceFtp, stravaFtp);
            }
            ftp = sauceFtp;
            ctx.ftpOrigin = 'sauce';
        }
        ctx.ftp = ftp;
    }


    function assignWeight(sauceWeight) {
        const stravaWeight = pageView.activityAthleteWeight();
        let weight;
        if (!sauceWeight) {
            if (stravaWeight) {
                weight = stravaWeight;
                ctx.weightOrigin = 'strava';
            } else {
                weight = 0;
                ctx.weightOrigin = 'default';
            }
        } else {
            if (stravaWeight && sauceWeight != stravaWeight) {
                console.warn("Sauce weight override differs from Strava weight:", sauceWeight, stravaWeight);
            }
            weight = sauceWeight;
            ctx.weightOrigin = 'sauce';
        }
        ctx.weight = weight;
    }


    function handleSelectionChange(start, end) {
        const wattsStream = getStream('watts') || getStream('watts_calc');
        if (!wattsStream) {
            return;
        }
        const selection = wattsStream.slice(start, end);
        const np = sauce.power.calcNP(selection);
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
