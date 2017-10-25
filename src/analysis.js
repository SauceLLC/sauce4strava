/* global Strava sauce jQuery pageView _ */

sauce.ns('analysis', function(ns) {
    'use strict';

    var ctx = {};
    var default_ftp = 200;

    var ride_cp_periods = [
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

    var metersPerMile = 1609.344;
    var run_cp_periods = [
        ['400 m', 400],
        ['1 km', 1000],
        ['1 mile', Math.round(metersPerMile)],
        ['3 km', 3000],
        ['5 km', 5000],
        ['10 km', 10000],
        ['13.1 miles', Math.round(metersPerMile * 13.1)],
        ['26.2 miles', Math.round(metersPerMile * 26.2)]
    ];

    var rank_map = [
        [/^World Class.*/, 'world-tour.png'],
        [/^Pro.?/, 'pro.png'],
        [/^Cat 1.?/, 'cat1.png'],
        [/^Cat 2.?/, 'cat2.png'],
        [/^Cat 3.?/, 'cat3.png'],
        [/^Cat 4.?/, 'cat4.png'],
        [/^Cat 5.?/, 'cat5.png']
    ];

    var rank_image = function(rank_cat) {
        for (var i = 0; i < rank_map.length; i++) {
            if (rank_cat.match(rank_map[i][0])) {
                return sauce.extURL + 'assets/ranking/' + rank_map[i][1];
            }
        }
    };

    var onRideStreamData = function() {
        var streams = pageView.streams();
        var watts_stream = streams.getStream('watts');
        var is_watt_estimate = !watts_stream;
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

        var np = watts_stream ? sauce.power.calcNP(watts_stream) : undefined;
        var np_val = np && np.value;
        var ts_stream = streams.getStream('time');
        var weight_kg = pageView.activityAthleteWeight();
        var weight_unit = pageView.activityAthlete().get('weight_measurement_unit');
        var if_ = np && np_val / ctx.ftp;
        var stats_frag = jQuery(ctx.tertiary_stats_tpl({
            type: 'ride',
            np: np_val,
            weight_unit: weight_unit,
            weight_norm: (weight_unit == 'lbs') ? weight_kg * 2.20462 : weight_kg,
            ftp: ctx.ftp,
            ftp_origin: ctx.ftp_origin,
            if_: if_,
            tss: np && sauce.power.calcTSS(np, if_, ctx.ftp)
        }));
        var ftp_link = stats_frag.find('.provide-ftp');
        var ftp_input = ftp_link.siblings('input');

        ftp_input.keyup(function(ev) {
            if (ev.keyCode == 27 /* escape */) {
                ftp_input.hide();
                ftp_link.html(val).show();
                return;
            } else if (ev.keyCode != 13 /* enter */) {
                return;
            }
            var val = ftp_input.val();
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
            var open_dialog = [];
            var hr_stream = streams.getStream('heartrate');
            var critpower_frag = jQuery(ctx.critpower_tpl({
                cp_periods: ride_cp_periods,
                is_watt_estimate: is_watt_estimate
            }));
            critpower_frag.insertAfter(jQuery('#pagenav').first());
            ride_cp_periods.forEach(function(period) {
                var cp = sauce.power.critpower(period[1], ts_stream, watts_stream);
                if (cp !== undefined) {
                    var hr_arr;
                    if (hr_stream) {
                        var start = cp.offt - cp._values.length + cp.padCount();
                        hr_arr = hr_stream.slice(start, cp.offt);
                    }
                    var el = jQuery('#sauce-cp-' + period[1]);
                    el.html(Math.round(cp.avg()));
                    el.parent().click(function() {
                        var existing = open_dialog.shift();
                        if (existing) {
                            existing.dialog('close');
                        }
                        var dialog = moreinfoRideDialog.call(ctx, {
                            cp_period: period,
                            cp_roll: cp,
                            hr_arr: hr_arr,
                            weight: weight_kg,
                            anchor_to: el.parent()
                        });
                        var row = el.closest('tr');
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
    };

    var onRunStreamData = function() {
        var streams = pageView.streams();
        var dist_stream = streams.getStream('distance');
        if (!dist_stream) {
            console.warn("No distance data for this activity.");
            return;
        }
        var ts_stream = streams.getStream('time');
        var pace_stream = streams.getStream('pace');
        var weight_kg = pageView.activityAthleteWeight();
        var weight_unit = pageView.activityAthlete().get('weight_measurement_unit');
        var stats_frag = jQuery(ctx.tertiary_stats_tpl({
            type: 'run',
            weight_unit: weight_unit,
            weight_norm: (weight_unit == 'lbs') ? weight_kg * 2.20462 : weight_kg,
        }));

        stats_frag.insertAfter(jQuery('.inline-stats').last());

        var open_dialog = [];
        var hr_stream = streams.getStream('heartrate');
        var bestpace_frag = jQuery(ctx.bestpace_tpl({
            cp_periods: run_cp_periods
        }));
        bestpace_frag.insertAfter(jQuery('#pagenav').first());
        run_cp_periods.forEach(function(period) {
            var bp = sauce.pace.bestpace(period[1], ts_stream, dist_stream, pace_stream);
            if (bp !== undefined) {
                var hr_arr;
                if (hr_stream) {
                    hr_arr = hr_stream.slice(bp.offt, bp.offt + bp.size());
                }
                var el = jQuery('#sauce-cp-' + period[1]);
                el.html(formatPace(bp.elapsed()));
                el.parent().click(function() {
                    var existing = open_dialog.shift();
                    if (existing) {
                        existing.dialog('close');
                    }
                    console.debug('Actual distance', bp.distance());
                    var dialog = moreinfoRunDialog.call(ctx, {
                        bp_period: period,
                        bp_window: bp,
                        elapsed: formatPace(bp.elapsed()),
                        bp_str: formatPace(milePace(bp.avg())),
                        hr_arr: hr_arr,
                        weight: weight_kg,
                        anchor_to: el.parent()
                    });
                    var row = el.closest('tr');
                    dialog.on('dialogclose', function() {
                        row.removeClass('selected');
                    });
                    row.addClass('selected');
                    open_dialog.push(dialog);
                });
                jQuery('#sauce-cp-row-' + period[1]).show();
            }
        });
    };

    var milePace = function(secondsPerMeter) {
        /* Convert strava pace into seconds per mile */
        return  metersPerMile * secondsPerMeter;
    };

    var formatPace = function(pace) {
        /* Convert float representation seconds/mile to a time string */
        pace = Math.round(pace);
        var hours = Math.floor(pace / 3600);
        var mins = Math.floor(pace / 60 % 60);
        var seconds = pace % 60;
        var result = [];
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
    };

    var moreinfoRideDialog = function(opts) {
        var crit = opts.cp_roll;
        var hr = opts.hr_arr;
        var cp_avg = crit.avg();
        var np = sauce.power.calcNP(crit._values);
        var pwr_size = crit._values.length;
        var avgpwr = np.value ? np : {value: cp_avg, count: pwr_size};
        var if_ = avgpwr.value / ctx.ftp;
        var w_kg = cp_avg / opts.weight;
        var gender = pageView.activityAthlete().get('gender') === 'F' ? 'female' : 'male';
        var rank = sauce.power.rank(opts.cp_period[1], w_kg, gender);
        var rank_cat = rank && sauce.power.rankCat(rank);
        var data = {
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

        var moreinfo_frag = jQuery(ctx.moreinfo_tpl(data));
        var dialog;
        var showAnalysisView = function() {
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
        var pwr_stream;
        if (pwr_size >= 240) {
            pwr_stream = [];
            var increment = Math.floor(pwr_size / 120);
            for (var i = 0; i < pwr_size; i += increment) {
                var v = 0;
                var ii;
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
    };

    var moreinfoRunDialog = function(opts) {
        var bestpace = opts.bp_window;
        var hr = opts.hr_arr;
        var pace = formatPace(milePace(bestpace.avg()));
        var elapsed = formatPace(bestpace.elapsed());
        var bp_size = bestpace.size();
        var data = {
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

        var moreinfo_frag = jQuery(ctx.moreinfo_tpl(data));
        var dialog;
        var showAnalysisView = function() {
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
        var pace_stream;
        if (bp_size >= 240) {
            pace_stream = [];
            var increment = Math.floor(bp_size / 120);
            for (var i = 0; i < bp_size; i += increment) {
                var v = 0;
                var ii;
                for (ii = 0; ii < increment && i + ii < bp_size; ii++) {
                    v += bestpace._paces[i+ii];
                }
                pace_stream.push(v / ii);
            }
        } else {
            pace_stream = bestpace._paces;
        }

        /* Must run after the dialog is open for proper rendering. */
        var maxPace = 0;
        var minPace = Infinity;
        var perMilePaceStream = pace_stream.map(function(x) {
            var pace = milePace(x) / 60;
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
    };

    var renderComments = function(skip_quote) {
        var ctrl = pageView.commentsController();
        var comments = ctrl.getFromHash('Activity-' + ctx.activity_id);
        var stack = [];
        comments.forEach(function(x) {
            var dt = new Date(jQuery(x.timestamp).attr('datetime'));
            x.timeago = sauce.time.ago(dt);
            stack.push(ctx.comments_tpl(x));
        });
        ctx.comments_holder.html(stack.join(''));
        if (!skip_quote) {
            ctx.comment_el.find('input').val(_.sample(ctx.quotes));
        }
    };

    var load = function() {
        console.info('Loading Sauce...');
        var activity = pageView.activity();
        var type = activity.get('type');
        var loadStreams;
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
        var streamRequestActive = !!pageView.streamsRequest.required.length;
        if (streamRequestActive) {
            console.log("Deferred load of additional streams...");
            pageView.streamsRequest.deferred.done(loadStreams);
        } else {
            loadStreams();
        }
    };

    var loadRideStreams = function() {
        var streams = pageView.streams();
        if (!streams.getStream('watts')) {
            var resources = ['watts'];
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
    };

    var loadRunStreams = function() {
        var streams = pageView.streams();
        if (!streams.getStream('distance')) {
            console.warn("Run without distance data?");
            return;
        } else {
            startRun();
        }
    };

    var startRun = function() {
        sauce.func.runAfter(Strava.Charts.Activities.BasicAnalysisElevation,
            'displayDetails', function(ret, start, end) {
                ns.handleSelectionChange(start, end);
            });
        sauce.func.runAfter(Strava.Charts.Activities.LabelBox, 'handleStreamHover',
            function(ret, _, start, end) {
                ns.handleSelectionChange(start, end);
            });

        var final = new sauce.func.IfDone(onRunStreamData);

        var tpl_url = sauce.extURL + 'templates/';
        jQuery.ajax(tpl_url + 'tertiary-stats.html').done(final.before(function(data) {
            ctx.tertiary_stats_tpl = _.template(data);
        }));
        jQuery.ajax(tpl_url + 'bestpace.html').done(final.before(function(data) {
            ctx.bestpace_tpl = _.template(data);
        }));
        jQuery.ajax(tpl_url + 'bestpace-moreinfo.html').done(final.before(function(data) {
            ctx.moreinfo_tpl = _.template(data);
        }));

        ctx.comment_el = jQuery([
            '<div class="sauce-new-comment">',
                '<div>',
                    '<div class="sauce-label">Say something</div>',
                    '<input type="text"/>',
                    '<button>Comment</button>',
                '</div>',
            '</div>'
        ].join(''));

        jQuery.getJSON(sauce.extURL + 'src/quotes.json').done(final.before(function(data) {
            ctx.quotes = data;
            ctx.comment_el.find('input').val(_.sample(data));
        }));

        ctx.comments_holder = jQuery('<div class="sauce-inline-comments"></div>');
        jQuery('.activity-summary').append(ctx.comments_holder);

        var submit_comment = function() {
            var comment = ctx.comment_el.find('input').val();
            pageView.commentsController().comment('Activity', ctx.activity_id, comment);
        };

        ctx.comment_el.find('input').click(function() {
            jQuery(this).select();
        });
        ctx.comment_el.find('button').click(submit_comment);
        ctx.comment_el.find('input').keypress(function(e) {
            if (e.which == 13) {
                submit_comment();
            }
        });
        jQuery('.activity-summary').append(ctx.comment_el);

        jQuery.ajax(tpl_url + 'inline-comment.html').done(function(data) {
            ctx.comments_tpl = _.template(data);
            pageView.commentsController().on('commentCompleted', function() {
                renderComments();
            });
            renderComments(true);
        });

        final.inc();
        sauce.comm.getFTP(ctx.athlete_id, function(ftp) {
            assignFTP(ftp);
            final.dec();
        });
    };

    var startRide = function() {
        sauce.func.runAfter(Strava.Charts.Activities.BasicAnalysisElevation,
            'displayDetails', function(ret, start, end) {
                ns.handleSelectionChange(start, end);
            });
        sauce.func.runAfter(Strava.Charts.Activities.LabelBox, 'handleStreamHover',
            function(ret, _, start, end) {
                ns.handleSelectionChange(start, end);
            });

        var final = new sauce.func.IfDone(onRideStreamData);

        var tpl_url = sauce.extURL + 'templates/';
        jQuery.ajax(tpl_url + 'tertiary-stats.html').done(final.before(function(data) {
            ctx.tertiary_stats_tpl = _.template(data);
        }));
        jQuery.ajax(tpl_url + 'critpower.html').done(final.before(function(data) {
            ctx.critpower_tpl = _.template(data);
        }));
        jQuery.ajax(tpl_url + 'critpower-moreinfo.html').done(final.before(function(data) {
            ctx.moreinfo_tpl = _.template(data);
        }));

        ctx.comment_el = jQuery([
            '<div class="sauce-new-comment">',
                '<div>',
                    '<div class="sauce-label">Say something</div>',
                    '<input type="text"/>',
                    '<button>Comment</button>',
                '</div>',
            '</div>'
        ].join(''));

        jQuery.getJSON(sauce.extURL + 'src/quotes.json').done(final.before(function(data) {
            ctx.quotes = data;
            ctx.comment_el.find('input').val(_.sample(data));
        }));

        ctx.comments_holder = jQuery('<div class="sauce-inline-comments"></div>');
        jQuery('.activity-summary').append(ctx.comments_holder);

        var submit_comment = function() {
            var comment = ctx.comment_el.find('input').val();
            pageView.commentsController().comment('Activity', ctx.activity_id, comment);
        };

        ctx.comment_el.find('input').click(function() {
            jQuery(this).select();
        });
        ctx.comment_el.find('button').click(submit_comment);
        ctx.comment_el.find('input').keypress(function(e) {
            if (e.which == 13) {
                submit_comment();
            }
        });
        jQuery('.activity-summary').append(ctx.comment_el);

        jQuery.ajax(tpl_url + 'inline-comment.html').done(function(data) {
            ctx.comments_tpl = _.template(data);
            pageView.commentsController().on('commentCompleted', function() {
                renderComments();
            });
            renderComments(true);
        });

        final.inc();
        sauce.comm.getFTP(ctx.athlete_id, function(ftp) {
            assignFTP(ftp);
            final.dec();
        });
    };

    var assignFTP = function(sauce_ftp) {
        var power = pageView.powerController && pageView.powerController();
        /* Sometimes you can get it from the activity.  I think this only
         * works when you are the athlete in the activity. */
        var strava_ftp = power ? power.get('athlete_ftp') : pageView.activity().get('ftp');
        var ftp;
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
    };

    var handleSelectionChange = function(start, end) {
        var streams = pageView.streams();
        var watts_stream = streams.getStream('watts');
        if (!watts_stream) {
            watts_stream = streams.getStream('watts_calc');
            if (!watts_stream) {
                return;
            }
        }
        var selection = watts_stream.slice(start, end);
        var np = sauce.power.calcNP(selection).value;
        var avg = selection.reduce(function(acc, x) { return acc + x; }) / selection.length;
        var el = jQuery('text.label:contains(Power)').siblings('.avg-js');
        var text = ['Avg ', Math.round(avg)];
        if (np) {
            text = text.concat([' (', Math.round(np), 'np)']);
        }
        el.html(text.join(''));
    };

    return {
        load: load,
        moreinfoRunDialog: moreinfoRunDialog,
        renderComments: renderComments,
        handleSelectionChange: handleSelectionChange
    };
});


(function() {
    if (window.pageView) {
        sauce.analysis.load();
    }
})();
