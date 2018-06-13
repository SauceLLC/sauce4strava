/* global Strava sauce jQuery pageView _ */

sauce.ns('analysis', function(ns) {
    'use strict';

    const ctx = {};
    const default_ftp = 200;
    const tpl_url = sauce.extURL + 'templates/';

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
    const run_cp_periods = [
        ['400 m', 400],
        ['1 km', 1000],
        ['1 mile', Math.round(metersPerMile)],
        ['3 km', 3000],
        ['5 km', 5000],
        ['10 km', 10000],
        ['13.1 miles', Math.round(metersPerMile * 13.1)],
        ['26.2 miles', Math.round(metersPerMile * 26.2)]
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

    function onRideStreamData() {
        const streams = pageView.streams();
        let watts_stream = streams.getStream('watts');
        const is_watt_estimate = !watts_stream;
        if (!watts_stream) {
            watts_stream = streams.getStream('watts_calc');
            if (!watts_stream) {
                console.info("No power data for this activity.");
            }
            /* Only show large period for watt estimates. */
            while (ride_cp_periods[0][1] < 300) {
                ride_cp_periods.shift();
            }
        }

        const np = watts_stream ? sauce.power.calcNP(watts_stream) : undefined;
        const np_val = np && np.value;
        const ts_stream = streams.getStream('time');
        const weight_kg = pageView.activityAthleteWeight();
        const weight_unit = pageView.activityAthlete().get('weight_measurement_unit');
        const if_ = np && np_val / ctx.ftp;
        const stats_frag = jQuery(ctx.tertiary_stats_tpl({
            type: 'ride',
            np: np_val,
            weight_unit: weight_unit,
            weight_norm: (weight_unit == 'lbs') ? weight_kg * 2.20462 : weight_kg,
            ftp: ctx.ftp,
            ftp_origin: ctx.ftp_origin,
            if_: if_,
            tss: np && sauce.power.calcTSS(np, if_, ctx.ftp)
        }));
        const ftp_link = stats_frag.find('.provide-ftp');
        const ftp_input = ftp_link.siblings('input');

        ftp_input.keyup(function(ev) {
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
            jQuery('<div title="Reloading...">' +
                   '<b>Reloading page to reflect FTP change."' +
                   '</div>').dialog({modal: true});
            sauce.comm.setFTP(ctx.athlete_id, val, function() {
                location.reload();
            });
        });

        ftp_link.click(function() {
            ftp_input.width(ftp_link.hide().width()).show();
        });

        stats_frag.insertAfter(jQuery('.inline-stats').last());

        if (watts_stream) {
            const open_dialog = [];
            const hr_stream = streams.getStream('heartrate');
            const critpower_frag = jQuery(ctx.critpower_tpl({
                cp_periods: ride_cp_periods,
                is_watt_estimate: is_watt_estimate
            }));
            critpower_frag.insertAfter(jQuery('#pagenav').first());
            ride_cp_periods.forEach(function(period) {
                const cp = sauce.power.critpower(period[1], ts_stream, watts_stream);
                if (cp !== undefined) {
                    let hr_arr;
                    if (hr_stream) {
                        const start = cp.offt - cp._values.length + cp.padCount();
                        hr_arr = hr_stream.slice(start, cp.offt);
                    }
                    const el = jQuery('#sauce-cp-' + period[1]);
                    el.html(Math.round(cp.avg()));
                    el.parent().click(function() {
                        const existing = open_dialog.shift();
                        if (existing) {
                            existing.dialog('close');
                        }
                        const dialog = moreinfoRideDialog.call(ctx, {
                            cp_period: period,
                            cp_roll: cp,
                            hr_arr,
                            weight: weight_kg,
                            anchor_to: el.parent()
                        });
                        const row = el.closest('tr');
                        dialog.on('dialogclose', function() {
                            row.removeClass('selected');
                        });
                        row.addClass('selected');
                        open_dialog.push(dialog);
                    });
                    jQuery('#sauce-cp-row-' + period[1]).show();
                }
            });
        }
    }

    function onRunStreamData() {
        const streams = pageView.streams();
        const dist_stream = streams.getStream('distance');
        if (!dist_stream) {
            console.warn("No distance data for this activity.");
            return;
        }
        const ts_stream = streams.getStream('time');
        const pace_stream = streams.getStream('pace');
        const weight_kg = pageView.activityAthleteWeight();
        const weight_unit = pageView.activityAthlete().get('weight_measurement_unit');
        const stats_frag = jQuery(ctx.tertiary_stats_tpl({
            type: 'run',
            weight_unit: weight_unit,
            weight_norm: (weight_unit == 'lbs') ? weight_kg * 2.20462 : weight_kg,
        }));

        stats_frag.insertAfter(jQuery('.inline-stats').last());

        const open_dialog = [];
        const hr_stream = streams.getStream('heartrate');
        const bestpace_frag = jQuery(ctx.bestpace_tpl({
            cp_periods: run_cp_periods
        }));
        bestpace_frag.insertAfter(jQuery('#pagenav').first());
        run_cp_periods.forEach(function(period) {
            const bp = sauce.pace.bestpace(period[1], ts_stream, dist_stream, pace_stream);
            if (bp !== undefined) {
                let hr_arr;
                if (hr_stream) {
                    hr_arr = hr_stream.slice(bp.offt, bp.offt + bp.size());
                }
                const el = jQuery('#sauce-cp-' + period[1]);
                el.html(formatPace(bp.elapsed()));
                el.parent().click(function() {
                    const existing = open_dialog.shift();
                    if (existing) {
                        existing.dialog('close');
                    }
                    console.debug('Actual distance', bp.distance());
                    const dialog = moreinfoRunDialog.call(ctx, {
                        bp_period: period,
                        bp_window: bp,
                        elapsed: formatPace(bp.elapsed()),
                        bp_str: formatPace(milePace(bp.avg())),
                        hr_arr,
                        weight: weight_kg,
                        anchor_to: el.parent()
                    });
                    const row = el.closest('tr');
                    dialog.on('dialogclose', function() {
                        row.removeClass('selected');
                    });
                    row.addClass('selected');
                    open_dialog.push(dialog);
                });
                jQuery('#sauce-cp-row-' + period[1]).show();
            }
        });
    }

    function milePace(secondsPerMeter) {
        /* Convert strava pace into seconds per mile */
        return  metersPerMile * secondsPerMeter;
    }

    function formatPace(pace) {
        /* Convert float representation seconds/mile to a time string */
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
        const crit = opts.cp_roll;
        const hr = opts.hr_arr;
        const cp_avg = crit.avg();
        const np = sauce.power.calcNP(crit._values);
        const pwr_size = crit._values.length;
        const avgpwr = np.value ? np : {value: cp_avg, count: pwr_size};
        const if_ = avgpwr.value / ctx.ftp;
        const w_kg = cp_avg / opts.weight;
        const gender = pageView.activityAthlete().get('gender') === 'F' ? 'female' : 'male';
        const rank = sauce.power.rank(opts.cp_period[1], w_kg, gender);
        const rank_cat = rank && sauce.power.rankCat(rank);
        const data = {
            title: 'Critical Power: ' + opts.cp_period[0],
            start_time: (new Strava.I18n.TimespanFormatter()).display(crit._times[0]),
            w_kg: w_kg,
            peak_power: Math.max.apply(null, crit._values),
            cp_avg: cp_avg,
            np: np.value,
            tss: sauce.power.calcTSS(avgpwr, if_, ctx.ftp),
            rank: rank,
            rank_cat: rank_cat,
            rank_image: rank && rank_image(rank_cat),
            if_: if_,
            hr_avg: hr && (_.reduce(hr, function(a, b) { return a + b; }, 0) / hr.length),
            hr_max: Math.max.apply(null, hr),
            hr_min: Math.min.apply(null, hr)
        };

        const moreinfo_frag = jQuery(ctx.moreinfo_tpl(data));
        let dialog;
        const showAnalysisView = function() {
            pageView.router().changeMenuTo([
                'analysis',
                crit.offt - pwr_size + crit.padCount(),
                crit.offt
            ].join('/'));
            dialog.dialog('close');
        };
        moreinfo_frag.find('.start_time_link').click(showAnalysisView);

        dialog = moreinfo_frag.dialog({
            resizable: false,
            width: 220,
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

        /* Smooth data for best visaul appearance. */
        let pwr_stream;
        if (pwr_size >= 240) {
            pwr_stream = [];
            const increment = Math.floor(pwr_size / 120);
            for (let i = 0; i < pwr_size; i += increment) {
                let v = 0;
                let ii;
                for (ii = 0; ii < increment && i + ii < pwr_size; ii++) {
                    v += crit._values[i+ii];
                }
                pwr_stream.push(Math.round(v / ii));
            }
        } else {
            pwr_stream = crit._values;
        }

        /* Must run after the dialog is open for proper rendering. */
        moreinfo_frag.find('.sauce-sparkline').sparkline(pwr_stream, {
            type: 'line',
            width: '100%',
            height: 56,
            lineColor: '#EA400D',
            fillColor: 'rgba(234, 64, 13, 0.61)',
            chartRangeMin: 0,
            normalRangeMin: 0,
            normalRangeMax: cp_avg,
            tooltipSuffix: 'w'
        });

        return dialog;
    }

    function moreinfoRunDialog(opts) {
        const bestpace = opts.bp_window;
        const hr = opts.hr_arr;
        const pace = formatPace(milePace(bestpace.avg()));
        const elapsed = formatPace(bestpace.elapsed());
        const bp_size = bestpace.size();
        const data = {
            title: 'Best Pace: ' + opts.bp_period[0],
            start_time: (new Strava.I18n.TimespanFormatter()).display(bestpace._times[0]),
            pace: pace,
            pace_slowest: formatPace(milePace(Math.max.apply(null, bestpace._paces))),
            pace_peak: formatPace(milePace(Math.min.apply(null, bestpace._paces))),
            elapsed: elapsed,
            hr_avg: hr && (_.reduce(hr, function(a, b) { return a + b; }, 0) / hr.length),
            hr_max: Math.max.apply(null, hr),
            hr_min: Math.min.apply(null, hr),
        };

        const moreinfo_frag = jQuery(ctx.moreinfo_tpl(data));
        let dialog;
        const showAnalysisView = function() {
            pageView.router().changeMenuTo([
                'analysis',
                bestpace.offt,
                bestpace.offt + bp_size - 1 // Is inclusive for runs; Must subtract 1.
            ].join('/'));
            dialog.dialog('close');
        };
        moreinfo_frag.find('.start_time_link').click(showAnalysisView);

        dialog = moreinfo_frag.dialog({
            resizable: false,
            width: 220,
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

        /* Smooth data for best visaul appearance. */
        let pace_stream;
        if (bp_size >= 240) {
            pace_stream = [];
            const increment = Math.floor(bp_size / 120);
            for (let i = 0; i < bp_size; i += increment) {
                let v = 0;
                let ii;
                for (ii = 0; ii < increment && i + ii < bp_size; ii++) {
                    v += bestpace._paces[i+ii];
                }
                pace_stream.push(v / ii);
            }
        } else {
            pace_stream = bestpace._paces;
        }

        /* Must run after the dialog is open for proper rendering. */
        let maxPace = 0;
        let minPace = Infinity;
        const perMilePaceStream = pace_stream.map(function(x) {
            const pace = milePace(x) / 60;
            if (pace > maxPace) {
                maxPace = pace;
            }
            if (pace < minPace) {
                minPace = pace;
            }
            return Math.round(pace * 100) / 100;
        });
        moreinfo_frag.find('.sauce-sparkline').sparkline(perMilePaceStream, {
            type: 'line',
            width: '100%',
            height: 56,
            lineColor: '#EA400D',
            fillColor: 'rgba(234, 64, 13, 0.61)',
            chartRangeMin: 0,
            normalRangeMin: 0,
            normalRangeMax: milePace(bestpace.avg()) / 60,
            tooltipSuffix: '/mi'
        });

        return dialog;
    }

    function load() {
        console.info('Loading Sauce...');
        const activity = pageView.activity();
        const type = activity.get('type');
        let loadStreams;
        if (type === 'Run') {
            loadStreams = loadRunStreams;
        } else if (type === 'Ride') {
            loadStreams = loadRideStreams;
        } else {
            console.debug("Unsupported activity type:", type);
            return;
        }
        ctx.athlete_id = pageView.activityAthlete().get('id');
        ctx.activity_id = activity.get('id');
        /* Avoid racing with other stream requests...
         * This strange test tells us the `streamRequest.request` routine is
         * in-flight because the callbacks associated with that func will
         * clear the `required` array.  While strange looking, this is the
         * best way to detect a common condition where network loading of
         * stream data is currently running and we would do best to wait for
         * it's finish and thus avoid double loading data. */
        const streamRequestActive = !!pageView.streamsRequest.required.length;
        if (streamRequestActive) {
            console.log("Deferred load of additional streams...");
            pageView.streamsRequest.deferred.done(loadStreams);
        } else {
            loadStreams();
        }
    }

    function loadRideStreams() {
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
            streams.fetchStreams(resources, {
                success: startRide,
                error: function() {
                    console.warn("Failed to load wattage streams. Load Aborted");
                }
            });
        } else {
            startRide();
        }
    }

    function loadRunStreams() {
        const streams = pageView.streams();
        if (!streams.getStream('distance')) {
            console.warn("Run without distance data?");
            return;
        } else {
            startRun();
        }
    }

    function attachComments($root) {
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

        const renderComments = () => {
            const ctrl = pageView.commentsController();
            const comments = ctrl.getFromHash('Activity-' + ctx.activity_id);
            const stack = [];
            comments.forEach(function(x) {
                const dt = new Date(jQuery(x.timestamp).attr('datetime'));
                x.timeago = sauce.time.ago(dt);
                stack.push(ctx.comments_tpl(x));
            });
            $commentsEl.html(stack.join(''));
        };

        jQuery.ajax(tpl_url + 'inline-comment.html').done(function(data) {
            ctx.comments_tpl = _.template(data);
            pageView.commentsController().on('commentCompleted', function() {
                renderComments();
            });
            renderComments();
        });
    }

    function startRun() {
        attachComments(jQuery('.activity-summary'));
        sauce.func.runAfter(Strava.Charts.Activities.BasicAnalysisElevation,
            'displayDetails', function(ret, start, end) {
                ns.handleSelectionChange(start, end);
            });
        sauce.func.runAfter(Strava.Charts.Activities.LabelBox, 'handleStreamHover',
            function(ret, _, start, end) {
                ns.handleSelectionChange(start, end);
            });

        const final = new sauce.func.IfDone(onRunStreamData);

        const tpl_url = sauce.extURL + 'templates/';
        jQuery.ajax(tpl_url + 'tertiary-stats.html').done(final.before(function(data) {
            ctx.tertiary_stats_tpl = _.template(data);
        }));
        jQuery.ajax(tpl_url + 'bestpace.html').done(final.before(function(data) {
            ctx.bestpace_tpl = _.template(data);
        }));
        jQuery.ajax(tpl_url + 'bestpace-moreinfo.html').done(final.before(function(data) {
            ctx.moreinfo_tpl = _.template(data);
        }));

        final.inc();
        sauce.comm.getFTP(ctx.athlete_id, function(ftp) {
            assignFTP(ftp);
            final.dec();
        });
    }

    function startRide() {
        attachComments(jQuery('.activity-summary'));
        sauce.func.runAfter(Strava.Charts.Activities.BasicAnalysisElevation,
            'displayDetails', function(ret, start, end) {
                ns.handleSelectionChange(start, end);
            });
        sauce.func.runAfter(Strava.Charts.Activities.LabelBox, 'handleStreamHover',
            function(ret, _, start, end) {
                ns.handleSelectionChange(start, end);
            });

        const final = new sauce.func.IfDone(onRideStreamData);

        const tpl_url = sauce.extURL + 'templates/';
        jQuery.ajax(tpl_url + 'tertiary-stats.html').done(final.before(function(data) {
            ctx.tertiary_stats_tpl = _.template(data);
        }));
        jQuery.ajax(tpl_url + 'critpower.html').done(final.before(function(data) {
            ctx.critpower_tpl = _.template(data);
        }));
        jQuery.ajax(tpl_url + 'critpower-moreinfo.html').done(final.before(function(data) {
            ctx.moreinfo_tpl = _.template(data);
        }));

        final.inc();
        sauce.comm.getFTP(ctx.athlete_id, function(ftp) {
            assignFTP(ftp);
            final.dec();
        });
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

    function handleSelectionChange(start, end) {
        const streams = pageView.streams();
        let watts_stream = streams.getStream('watts');
        if (!watts_stream) {
            watts_stream = streams.getStream('watts_calc');
            if (!watts_stream) {
                return;
            }
        }
        const selection = watts_stream.slice(start, end);
        const np = sauce.power.calcNP(selection).value;
        const avg = selection.reduce(function(acc, x) { return acc + x; }) / selection.length;
        const el = jQuery('text.label:contains(Power)').siblings('.avg-js');
        let text = ['Avg ', Math.round(avg)];
        if (np) {
            text = text.concat([' (', Math.round(np), 'np)']);
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
