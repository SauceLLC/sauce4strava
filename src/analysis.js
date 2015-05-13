
sauce.ns('analysis', function(ns) {

    /* TODO: Move to user options. */
    var cp_periods = [
        ['5s', 5],
        ['15s', 15],
        ['30s', 30],
        ['1min', 60],
        ['2min', 120],
        ['5min', 300],
        ['10min', 600],
        ['15min', 900],
        ['20min', 1200],
        ['30min', 1800],
        ['1hour', 3600]
    ];

    var on_stream_data = function() {
        console.log("Parsing Watts Stream for Critical Power Chart");

        var streams = pageView.streams();
        var watts_stream = streams.getStream('watts');
        if (!watts_stream) {
            watts_stream = streams.getStream('watts_calc');
            if (!watts_stream) {
                console.log("NO POWER DATA FOR THIS RIDE");
                return;
            }
            /* Only show large period for watt estimates. */
            var too_small = [];
            cp_periods.forEach(function(x, i) {
                if (x[1] < 300) {
                    too_small.push(i);
                }
            });
            too_small.sort().reverse().forEach(function(i) {
                delete cp_periods[i];
            }); }

        var ts_stream = streams.getStream('time'); 
        var athlete = pageView.activityAthlete();
        var weight_norm;
        var weight_kg = pageView.activityAthleteWeight();
        var weight_unit = athlete.get('weight_measurement_unit');
        weight_norm = (weight_unit == 'lbs') ? weight_kg * 2.20462 : weight_kg;

        cp_periods.forEach(function(period) {
            var cp = sauce.power.critpower(ts_stream, watts_stream, period[1]);
            if (cp !== undefined) {
                var el = jQuery('#sauce-cp-' + period[1]);
                el.html(Math.round(cp.avg()));
                el.parent().click(function(x) {
                    sauce.analysis.moreinfo_dialog(period, cp, weight_kg);
                });
                jQuery('#sauce-cp-row-' + period[1]).show();
            }
        });
        jQuery('#sauce-critpower').show();

        var stats = jQuery('.sauce-stats');
        var np = sauce.power.calc_np(watts_stream);

        if (!np) {
            stats.find('.sauce-np-li').hide();
        } else {
            stats.find('.sauce-np').html(Math.round(np.value));
        }

        var ftp = sauce.analysis.athlete_ftp();
        if (!ftp) {
            stats.find('.sauce-if-li').hide();
            stats.find('.sauce-tss-li').hide();
        } else {
            var if_ = np.value / ftp;
            var tss = sauce.power.calc_tss(np, if_, ftp);
            stats.find('.sauce-if').html(if_.toFixed(2));
            stats.find('.sauce-tss').html(Math.round(tss));
        }

        stats.find('.sauce-weight-label').html(weight_unit);
        stats.find('.sauce-weight').html(Math.round(weight_norm));
    };

    var moreinfo_dialog = function(cp_period, cp_roll, weight) {
        var cp_avg = cp_roll.avg();
        var np = sauce.power.calc_np(cp_roll._values);
        /* XXX: Use routes this hard link is very slow. */
        /* XXX: the timestamps are not correct with gapped data. */
        var analysis_link = 'https://www.strava.com/activities/' + 
                            pageView.activity().get('id') +
                            '/analysis/' + cp_roll._times[0] + '/' +
                            cp_roll._times[cp_roll._times.length-1];
        var f = sauce.analysis.moreinfo_frag.children().clone();
        f.attr('title', 'Critical power - ' + cp_period[0]);
        /*f.find('.sauce-sparkline').sparkline(cp_roll._values, {
            type: 'line',
            width: '100%',
            height: 56,
            lineColor: '#EA400D',
            fillColor: 'rgba(234, 64, 13, 0.61)',
            chartRangeMin: 0,
            normalRangeMin: 0,
            normalRangeMax: cp_avg,
            tooltipSuffix: 'w'
        });*/

        var time_fmt = new Strava.I18n.TimespanFormatter();
        f.find('.sauce-start_time').html('<a href="' + analysis_link + '">' +
                                         time_fmt.display(cp_roll._times[0]) +
                                         '</a>');
        f.find('.sauce-w_kg').html((cp_avg / weight).toFixed(1) + 'w');
        f.find('.sauce-peak_power').html(Math.max.apply(null, cp_roll._values) + 'w');
        f.find('.sauce-cp_avg').html(Math.round(cp_avg) + 'w');

        if (!np.value) {
            f.find('.sauce-np-row').hide();
        } else {
            f.find('.sauce-np').html(Math.round(np.value) + 'w');
        }

        var ftp = sauce.analysis.athlete_ftp();
        if (!ftp) {
            f.find('.sauce-has_ftp').hide();
        } else {
            var avgpwr = np.value ? np : {value: cp_avg, count: cp_roll._values.length};
            var if_ = avgpwr.value / ftp;
            f.find('.sauce-if').html(if_.toFixed(2));
            f.find('.sauce-tss').html(Math.round(sauce.power.calc_tss(avgpwr, if_, ftp)));
        }

        var dialog = f.dialog({
            resizable: false,
            modal: false,
            buttons: {
                Close: function() { dialog.dialog('close'); }
            }
        });

        /* Must run after the dialog is open for proper rendering. */
        f.find('.sauce-sparkline').sparkline(cp_roll._values, {
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
    };

    var athlete_ftp = function() {
        var power_ctrl = pageView.powerController();
        return power_ctrl && power_ctrl.get('athlete_ftp');
    };

    var start = function() {
        console.log('Starting Sauce Activity Analysis');

        jQuery.getScript('https://cdnjs.cloudflare.com/ajax/libs/' +
                         'jquery-sparklines/2.1.2/jquery.sparkline.min.js');

        sauce.func.run_before(Strava.Labs.Activities.StreamsRequest, 'request', function() {
            this.require('watts');
        });

        var panel = [
            '<ul id="sauce-critpower" style="display: none;" class="pagenav">',
                '<li class="group">',
                    '<div class="title">Critical Power</div>',
                    '<table>'
        ];

        cp_periods.forEach(function(x) {
            var r = [
                '<tr style="display: none;" id="sauce-cp-row-', x[1], '">',
                    '<td>', x[0], '</td>',
                    '<td>',
                        '<span id="sauce-cp-', x[1], '"></span>',
                        '<attr class="unit">W</attr>',
                    '</td>',
                '</tr>'
            ];
            panel.push(r.join(''));
        });

        panel.push('</table></li></ul>');
        jQuery(panel.join('')).insertBefore('.actions-menu');

        var frag = jQuery('<div/>');
        frag.load(sauce.extURL + 'pages/tertiary-stats.html');
        frag.insertAfter('.inline-stats.secondary-stats');

        var moreinfo_url = sauce.extURL + 'pages/critpower-moreinfo.html';
        sauce.analysis.moreinfo_frag = jQuery('<div/>').load(moreinfo_url);

        pageView.streamsRequest.deferred.done(function() {
            on_stream_data();
        });
    };

    return {
        start: start,
        athlete_ftp: athlete_ftp,
        moreinfo_dialog: moreinfo_dialog
    };
});


/* We have to aggressively track script loading to jack into Strava's site
 * while it's still worth altering.  E.g. Before it makes ext API calls.
 */ 
document.head.addEventListener('DOMNodeInserted', function(event) {
    if (window.pageView) {
        document.head.removeEventListener(event.type, arguments.callee);
        sauce.analysis.start();
    }
});
