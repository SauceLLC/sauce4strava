
sauce.ns('analysis', function(ns) {
    /* TODO: Move to user options. */
    var cp_periods = [
        ['5s', 5],
        ['15s', 10],
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
                jQuery('#sauce-cp-row-' + cp_periods[i][1]).hide();
                delete cp_periods[i];
            });
        }
        var ts_stream = streams.getStream('time'); 

        var athlete = pageView.activityAthlete();
        var weight_kg = weight_norm = pageView.activityAthleteWeight();
        var weight_unit = athlete.get('weight_measurement_unit');
        if (weight_unit == 'lbs') {
            weight_norm *= 2.20462;
        }

        var power_ctrl = pageView.powerController();
        var ftp = power_ctrl && power_ctrl.get('athlete_ftp');
        if (!ftp) {
            debugger;
        }
        var time_formatter = new Strava.I18n.TimespanFormatter();

        jQuery('#sauce-critpower').show();
        cp_periods.forEach(function(period) {
            var cp = sauce.power.critpower(ts_stream, watts_stream, period[1]);
            var el = jQuery('#sauce-cp-' + period[1]);
            if (cp === undefined) {
                jQuery('#sauce-cp-row-' + period[1]).hide();
            } else {
                var cp_avg = cp.avg();
                var w_kg = (cp_avg / weight_kg).toFixed(1);
                el.html(Math.round(cp_avg) + '<attr class="unit">W</attr>');
                var np = sauce.power.calc_np(cp._values);
                var analysis_link = 'https://www.strava.com/activities/' + 
                                    pageView.activity().get('id') +
                                    '/analysis/' + cp._times[0] + '/' +
                                    cp._times[cp._times.length-1];
                var moreinfo = [
                    '<div title="Critical power - ', period[0], '"',
                           'class="sauce-critpower-moreinfo">',
                        '<div class="sauce-sparkline"></div>',
                        '<table>',
                            '<tr>',
                                '<td>Start time</td>',
                                '<td><a href="', analysis_link, '">', /* XXX: use routes */
                                time_formatter.display(cp._times[0]), '</a></td>',
                            '</tr>',
                            '<tr>',
                                '<td>Watts/kg</td>',
                                '<td>', w_kg, '</td>',
                            '</tr>',
                            '<tr>',
                                '<td>Peak power</td>',
                                '<td>', Math.max.apply(null, cp._values), 'w</td>',
                            '</tr>',
                            '<tr>',
                                '<td>Average power</td>',
                                '<td>', Math.round(cp_avg), 'w</td>',
                            '</tr>'
                ];
                if (np.value) {
                    moreinfo.push([
                        '<tr>',
                            '<td>Normalized power</td>',
                            '<td>', Math.round(np.value), 'w</td>',
                        '</tr>'
                    ].join(''));
                }
                if (ftp) {
                    var avgpwr = np.value ? np : {value: cp_avg, count: cp._values.length};
                    var if_ = avgpwr.value / ftp;
                    moreinfo.push([
                        '<tr>',
                            '<td>Intensity factor</td>',
                            '<td>', if_.toFixed(2), '</td>',
                        '</tr>',
                        '<tr>',
                            '<td>TSS</td>',
                            '<td>', Math.round(sauce.power.calc_tss(avgpwr, if_, ftp)), '</td>',
                        '</tr>',
                    ].join(''));
                }
                moreinfo.push('</div></table>');

                moreinfo = jQuery(moreinfo.join('')).dialog({
                    resizable: false,
                    modal: false,
                    autoOpen: false,
                    buttons: {
                        Close: function() { moreinfo.dialog('close'); }
                    }
                });
                el.click(function(x) {
                    moreinfo.dialog('open');
                    moreinfo.find('.sauce-sparkline').sparkline(cp._values, {
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
                });
            }
        });

        if (power_ctrl) {
            var np = sauce.power.calc_np(watts_stream);
            if (!ftp) {
                jQuery('.sauce-if').parent().parent().hide();
                jQuery('.sauce-tss').parent().parent().hide();
            } else {
                var if_ = np.value / ftp;
                var tss = sauce.power.calc_tss(np, if_, ftp);
                jQuery('.sauce-if').html(if_.toFixed(2));
                jQuery('.sauce-tss').html(Math.round(tss));
            }
            jQuery('.sauce-np').html(Math.round(np.value));
            jQuery('.sauce-stats').show();
        } else {
            console.log("Skipping power stats for powerless activity.");
        }
        jQuery('.sauce-weight-label').html(weight_unit);
        jQuery('.sauce-weight').html(Math.round(weight_norm));
    };

    var start = function() {
        console.log('Starting Sauce Activity Analysis');

        var panel = [
            '<ul id="sauce-critpower" style="display: none;" class="pagenav">',
                '<li class="group">',
                    '<div class="title">Critical Power</div>',
                    '<table>'
        ];
        cp_periods.forEach(function(x) {
            var r = [
                '<tr id="sauce-cp-row-', x[1], '">',
                    '<td>', x[0], '</td>',
                    '<td id="sauce-cp-', x[1], '">...</td>',
                '</tr>'
            ];
            panel.push(r.join(''));
        });
        panel.push('</table></li></ul>');
        jQuery(panel.join('')).insertBefore('.actions-menu');

        var sauce_stats = [
            '<ul style="display: none;" class="inline-stats section secondary-stats sauce-stats">',
                '<li>',
                    '<strong>',
                        '<span class="sauce-np">...</span>',
                        '<abbr class="unit" title="watts">W</abbr>',
                    '</strong>',
                    '<div class="label">Normalized Power</div>',
                '</li>',
                '<li>',
                    '<strong>',
                        '<span class="sauce-if">...</span>',
                        '<abbr class="unit" title="Intesity Factor">IF</abbr>',
                    '</strong>',
                    '<div class="label">Intensity Factor</div>',
                '</li>',
                '<li>',
                    '<strong>',
                        '<span class="sauce-tss">...</span>',
                    '</strong>',
                    '<div class="label">TSS</div>',
                '</li>',
                '<li>',
                    '<strong>',
                        '<span class="sauce-weight">...</span>',
                        '<abbr class="unit sauce-weight-label" title="Weight"></abbr>',
                    '</strong>',
                    '<div class="label">Weight</div>',
                '</li>',
            '</ul>'
        ];

        jQuery(sauce_stats.join('')).insertAfter('.inline-stats.secondary-stats');

        pageView.streamsRequest.deferred.done(function() {
            on_stream_data();
        });

        sauce.func.run_before(Strava.Labs.Activities.StreamsRequest, 'request', function() {
            this.require('watts');
        });
    };

    return {
        start: start
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
