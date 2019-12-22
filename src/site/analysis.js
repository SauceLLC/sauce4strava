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


    async function processRideStreams() {
        let wattsStream = getStream('watts');
        const is_watt_estimate = !wattsStream;
        if (!wattsStream) {
            wattsStream = getStream('watts_calc');
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
        const weight = pageView.activityAthleteWeight();
        const weight_unit = pageView.activityAthlete().get('weight_measurement_unit');
        const intensity = np && np_val / ctx.ftp;
        const stats_frag = jQuery(ctx.tertiary_stats_tpl({
            type: 'ride',
            np: np_val,
            weight_unit,
            weight_norm: (weight_unit == 'lbs') ? weight * 2.20462 : weight,
            ftp: ctx.ftp,
            ftp_origin: ctx.ftp_origin,
            intensity,
            tss: np && sauce.power.calcTSS(np, intensity, ctx.ftp)
        }));
        const ftp_link = stats_frag.find('.provide-ftp');
        const ftp_input = ftp_link.siblings('input');

        ftp_input.keyup(async ev => {
            if (ev.keyCode == 27 /* escape */) {
                ftp_input.hide();
                ftp_link.html(val).show();
                return;
            } else if (ev.keyCode != 13 /* enter */) {
                return;
            }
            let val = ftp_input.val();
            if (val === '') {
                val = null;
            } else {
                val = Number(ftp_input.val());
                if (!val || val < 0 || val > 600) {
                    jQuery('<div title="Invalid FTP Wattage">' +
                           '<b>"' + ftp_input.val() + '" is not a valid FTP.</b>' +
                           '<br/><br/>' +
                           'Acceptable range: 0-600' +
                           '</div>').dialog({modal: true});
                    return;
                }
            }
            ftp_input.hide();
            ftp_link.html(val).show();
            await sauce.comm.setFTP(pageView.activityAthlete(), val);
            jQuery('<div title="Reloading...">' +
                   '<b>Reloading page to reflect FTP change."' +
                   '</div>').dialog({modal: true});
            location.reload();
        });

        ftp_link.click(function() {
            ftp_input.width(ftp_link.hide().width()).show();
        });

        stats_frag.insertAfter(jQuery('.inline-stats').last());

        if (wattsStream && sauce.config.options['analysis-cp-chart']) {
            const _start = performance.now();
            const open_dialog = [];
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
                el.parent().click(function() {
                    const existing = open_dialog.shift();
                    if (existing) {
                        existing.dialog('close');
                    }
                    const dialog = moreinfoRideDialog.call(ctx, {
                        label,
                        roll,
                        weight,
                        anchor_to: el.parent()
                    });
                    const row = el.closest('tr');
                    dialog.on('dialogclose', function() {
                        row.removeClass('selected');
                    });
                    row.addClass('selected');
                    open_dialog.push(dialog);
                });
                jQuery(`#sauce-cp-row-${period}`).show();
            }
            const _done = performance.now();
            console.info(`Analysis loaded in: ${_done - _start}ms`);
        }
    }


    async function processRunStreams() {
        const distStream = getStream('distance');
        if (!distStream) {
            console.warn("No distance data for this activity.");
            return;
        }
        const weight = pageView.activityAthleteWeight();
        const weight_unit = pageView.activityAthlete().get('weight_measurement_unit');
        const stats_frag = jQuery(ctx.tertiary_stats_tpl({
            type: 'run',
            weight_unit: weight_unit,
            weight_norm: (weight_unit == 'lbs') ? weight * 2.20462 : weight,
        }));

        stats_frag.insertAfter(jQuery('.inline-stats').last());

        const open_dialog = [];
        const is_metric = currentAthlete.get('measurement_preference') !== 'feet';
        const bestpace_frag = jQuery(ctx.bestpace_tpl({
            is_metric,
            cp_distances: run_cp_distances
        }));
        bestpace_frag.insertAfter(jQuery('#pagenav').first());
        const paceConv = is_metric ? kmPace : milePace;
        const timeStream = getStream('time');
        const paceStream = getStream('pace');
        for (const [label, distance] of run_cp_distances) {
            const roll = sauce.pace.bestpace(distance, timeStream, distStream, paceStream);
            if (roll !== undefined) {
                const el = jQuery(`#sauce-cp-${distance}`);
                el.attr('title', `Elapsed time: ${formatPace(roll.elapsed())}`);
                const unit = is_metric ? 'k' : 'm';
                el.html(`${formatPace(paceConv(roll.avg()))}<small>/${unit}</small>`);
                el.parent().click(function() {
                    const existing = open_dialog.shift();
                    if (existing) {
                        existing.dialog('close');
                    }
                    const dialog = moreinfoRunDialog.call(ctx, {
                        is_metric,
                        label,
                        roll,
                        elapsed: formatPace(roll.elapsed()),
                        bp_str: formatPace(paceConv(roll.avg())),
                        weight,
                        anchor_to: el.parent()
                    });
                    const row = el.closest('tr');
                    dialog.on('dialogclose', function() {
                        row.removeClass('selected');
                    });
                    row.addClass('selected');
                    open_dialog.push(dialog);
                });
                jQuery(`#sauce-cp-row-${distance}`).show();
            }
        }
    }


    function milePace(secondsPerMeter) {
        /* Convert strava pace into seconds per mile */
        return  metersPerMile * secondsPerMeter;
    }


    function kmPace(secondsPerMeter) {
        /* Convert strava pace into seconds per kilometer */
        return  1000 * secondsPerMeter;
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


    function moreinfoRideDialog(opts) {
        const roll = opts.roll;
        const avgPower = roll.avg();
        const np = sauce.power.calcNP(roll.values());
        const rollSize = roll.size();
        const avgpwr = np.value ? np : {value: avgPower, count: rollSize};
        const intensity = avgpwr.value / ctx.ftp;
        const w_kg = avgPower / opts.weight;
        const gender = pageView.activityAthlete().get('gender') === 'F' ? 'female' : 'male';
        const rank = sauce.power.rank(roll.period, w_kg, gender);
        const rank_cat = rank && sauce.power.rankCat(rank);
        const startTime = roll.firstTimestamp({noPad: true});
        const endTime = roll.lastTimestamp({noPad: true});
        const hrStream = getStreamTimeRange('heartrate', startTime, endTime);
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
            }
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
        const paceConv = opts.is_metric ? kmPace : milePace;
        const humanElevation = opts.is_metric ?
            x => `${x.toLocaleString(undefined, {maximumFractionDigits: 0})} m` :
            x => `${(x * 3.28084).toLocaleString(undefined, {maximumFractionDigits: 0})} ft`;
        const elapsed = formatPace(roll.elapsed());
        const startTime = roll.firstTimestamp();
        const endTime = roll.lastTimestamp();
        const hrStream = getStreamTimeRange('heartrate', startTime, endTime);
        const gapStream = getStreamTimeRange('grade_adjusted_pace', startTime, endTime);
        const gradeStream = getStreamTimeRange('grade_smooth', startTime, endTime);
        const cadenceStream = getStreamTimeRange('cadence', startTime, endTime);
        const altStream = getStreamTimeRange('altitude', startTime, endTime);
        let altGain = 0;
        let altLoss = 0;
        if (altStream && altStream.length) {
            let last = altStream[0];
            for (const x of altStream) {
                if (x > last) {
                    altGain += x - last;
                } else {
                    altLoss += last - x;
                }
                last = x;
            }
        }
        const data = {
            is_metric: opts.is_metric,
            title: 'Best Pace: ' + opts.label,
            start_time: (new Strava.I18n.TimespanFormatter()).display(startTime),
            pace: {
                min: formatPace(paceConv(sauce.data.min(roll._paces))),
                avg: formatPace(paceConv(roll.avg())),
                max: formatPace(paceConv(sauce.data.max(roll._paces))),
                gap: gapStream && formatPace(paceConv(sauce.data.avg(gapStream))),
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
                gain: humanElevation(altGain),
                loss: humanElevation(altLoss),
            }
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
        const perUnitPaceData = smoothedData.map(x => Math.round((paceConv(x) / 60) * 100) / 100);
        /* Must run after the dialog is open for proper rendering. */
        moreinfo_frag.find('.sauce-sparkline').sparkline(perUnitPaceData, {
            type: 'line',
            width: '100%',
            height: 56,
            lineColor: '#EA400D',
            fillColor: 'rgba(234, 64, 13, 0.61)',
            chartRangeMin: 0,
            normalRangeMin: 0,
            normalRangeMax: paceConv(roll.avg()) / 60,
            tooltipSuffix: '/mi'
        });

        return dialog;
    }


    async function load() {
        console.info('Loading Sauce...');
        const activity = pageView.activity();
        const type = activity.get('type');
        let loadStreams;
        let start;
        if (type === 'Run') {
            loadStreams = loadRunStreams;
            start = startRun;
        } else if (type === 'Ride') {
            loadStreams = loadRideStreams;
            start = startRide;
        } else {
            console.debug("Unsupported activity type:", type);
            return;
        }
        ctx.activity_id = activity.get('id');
        /* Avoid racing with other stream requests...
         * This strange test tells us the `streamRequest.request` routine is
         * in-flight because the callbacks associated with that func will
         * clear the `required` array.  While strange looking, this is the
         * best way to detect a common condition where network loading of
         * stream data is currently running and we would do best to wait for
         * its finish and thus avoid double loading data. */
        const streamRequestActive = !!pageView.streamsRequest.required.length;
        if (streamRequestActive) {
            console.log("Deferred load of additional streams...");
            await new Promise(resolve => pageView.streamsRequest.deferred.done(resolve));
        }
        await loadStreams();
        await start();
    }


    async function loadRideStreams() {
        const streams = pageView.streams();
        if (!streams.getStream('watts')) {
            const resources = ['watts'];
            if (!streams.getStream('watts_calc')) {
                resources.push('watts_calc');
            }
            if (!streams.getStream('time')) {
                resources.push('time');
            }
            console.info("Fetching wattage streams:", resources);
            await new Promise((success, error) => streams.fetchStreams(resources, {success, error}));
        }
    }


    async function loadRunStreams() {
        if (!getStream('distance')) {
            console.warn("Run without distance data?");
            return;
        }
    }


    async function getTemplate(filename) {
        const resp = await fetch(`${tpl_url}/${filename}`);
        const tplText = await resp.text();
        return _.template(tplText);
    }


    async function attachComments($root) {
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
        const submit_comment = () => {
            pageView.commentsController().comment('Activity', ctx.activity_id, $input.val());
            $input.val('');
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
            const comments = ctrl.getFromHash('Activity-' + ctx.activity_id);
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
        const weight = pageView.activityAthleteWeight();
        const gender = pageView.activityAthlete().get('gender') === 'F' ? 'female' : 'male';
        if (row.querySelector(':scope > td.sauce-mark')) {
            return;
        }
        const segment = pageView.segmentEfforts().getEffort(Number(row.dataset.segmentEffortId));
        if (!segment) {
            console.warn("Segment data not found for:", row.dataset.segmentEffortId);
            return;
        }
        const w_kg = segment.get('avg_watts_raw') / weight;
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
        const rows = Array.from(document.querySelectorAll('table.segments tr[data-segment-effort-id]'));
        rows.push.apply(rows, document.querySelectorAll('table.hidden-segments tr[data-segment-effort-id]'));
        for (const row of rows) {
            try {
                addBadge(row);
            } catch(e) {
                console.warn("addBadge failure:", e);
            }
        }
    }


    async function startRun() {
        sauce.func.runAfter(Strava.Charts.Activities.BasicAnalysisElevation,
            'displayDetails', function(ret, start, end) {
                ns.handleSelectionChange(start, end);
            });
        sauce.func.runAfter(Strava.Charts.Activities.LabelBox, 'handleStreamHover',
            function(ret, _, start, end) {
                ns.handleSelectionChange(start, end);
            });
        await attachComments(jQuery('.activity-summary'));
        ctx.tertiary_stats_tpl = await getTemplate('tertiary-stats.html');
        ctx.bestpace_tpl = await getTemplate('bestpace.html');
        ctx.moreinfo_tpl = await getTemplate('bestpace-moreinfo.html');
        await processRunStreams();
    }


    async function startRide() {
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
        await attachComments(jQuery('.activity-summary'));
        ctx.tertiary_stats_tpl = await getTemplate('tertiary-stats.html');
        ctx.critpower_tpl = await getTemplate('critpower.html');
        ctx.moreinfo_tpl = await getTemplate('critpower-moreinfo.html');
        assignFTP(await sauce.comm.getFTP(pageView.activityAthlete().get('id')));
        await processRideStreams();
    }
    window.xxxprs = processRideStreams;


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


    return {
        load,
        moreinfoRunDialog,
        handleSelectionChange,
    };
});


(function() {
    if (window.pageView) {
        sauce.analysis.load();
    }
})();
