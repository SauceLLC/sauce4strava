/* global sauce, jQuery, Strava, pageView, Backbone, d3 */

// NOTE: Must be assigned to self and have matching name for FF
self.saucePreloaderInit = function saucePreloaderInit() {
    'use strict';

    self.sauce = self.sauce || {};
    sauce.reactComponents = {};

    const maybeRequestIdleCallback = self.requestIdleCallback || (fn => fn());  // Safari
    const booted = document.documentElement.classList.contains('sauce-booted') ?
        Promise.resolve() :
        new Promise(resolve => document.addEventListener('sauceBooted', resolve));
    const optionsReady = sauce.options ?
        Promise.resolve() :
        new Promise(resolve => document.addEventListener('sauceOptionsSet', resolve));


    sauce.propDefined('CookieControl.Cookie', obj => {
        // cookiebot expects to run the show and it ends up doing horrible things like
        // loading our scripts multiple times.  It's pretty much impossible to live with it.
        console.info("Disabling incompatible cookiebot.com");
        window.CookieControl.Cookie = function() {};
    });

    sauce.propDefined('pageView', view => {
        const assembleSave = view.assemble;
        view.assemble = function(_, weight) {
            sauce.stravaAthleteWeight = weight; // only set for self activities
            return assembleSave.apply(this, arguments);
        };
        const addCustomRoutes = view.addCustomRoutes;
        view.addCustomRoutes = menuRouter => {
            addCustomRoutes.call(view, menuRouter);
            // Fix for reload hang on /analysis page
            if (!('route:analysis' in menuRouter._events)) {
                menuRouter.addRoute('/analysis', 'analysis');
                menuRouter.on('route:analysis', () => {
                    view.handleAnalysisClicked();
                    view.menuView.handleRouteChange('analysis');
                });
            }
        };
        if (!document.querySelector('#pagenav li [data-menu="analysis"]')) {
            // Create stub element for analysis menu, but hide it until analysis
            // can do the right thing with it.  It needs to exist early so initial
            // routes can set classes on this element.
            const pageNav = document.querySelector('#pagenav');
            const overview = pageNav && pageNav.querySelector('[data-menu="overview"]');
            // Some indoor workouts for non-premium members don't have pageNav (ie. peloton)
            if (overview) {
                const li = document.createElement('li');
                li.style.display = 'none';
                li.classList.add('sauce-stub');
                li.innerHTML = `<a data-menu="analysis"></a>`;
                pageNav.insertBefore(li, overview.closest('li').nextSibling);
            }
        }
        if (view.activity) {
            const activity = view.activity();
            let _supportsGap;
            const supportsGap = (v) => {
                // Ignore explicit false value and instead infer gap support from activity type.
                if (v) {
                    _supportsGap = true;
                } else if (!_supportsGap) {
                    return !!(
                        activity.isRun() &&
                        !activity.isTrainer() &&
                        activity.get('distance') &&
                        activity.get('elev_gain')
                    );
                }
                return _supportsGap;
            };
            supportsGap(view.supportsGap());
            view.supportsGap = supportsGap;
            if (activity) {
                supportsGap(activity.supportsGap());
                activity.supportsGap = supportsGap;
            } else {
                let _activity;
                view.activity = function(a) {
                    if (a) {
                        _activity = a;
                        supportsGap(a.supportsGap());
                        a.supportsGap = supportsGap;
                    }
                    return _activity;
                };
            }
        }
    });


    sauce.propDefined('Strava.Charts.Activities.BasicAnalysisElevation', Klass => {
        // Monkey patch analysis views so we can react to selection changes.
        const saveFn = Klass.prototype.displayDetails;
        Klass.prototype.displayDetails = function(start, end) {
            start = start === undefined ? start : Number(start);
            end = end === undefined ? end : Number(end);
            if (sauce.analysis) {
                sauce.analysis.schedUpdateAnalysisStats(start, end);
            } else {
                sauce.analysisStatsIntent = {start, end};
            }
            return saveFn.apply(this, arguments);
        };
    });


    sauce.propDefined('Strava.Charts.Activities.LabelBox', Klass => {
        // This is called when zoom selections change or are unset in the profile graph.
        const saveHandleStreamHoverFn = Klass.prototype.handleStreamHover;
        Klass.prototype.handleStreamHover = function(_, start, end) {
            start = start === undefined ? start : Number(start);
            end = end === undefined ? end : Number(end);
            if (sauce.analysis) {
                sauce.analysis.schedUpdateAnalysisStats(start, end);
            } else {
                sauce.analysisStatsIntent = {start, end};
            }
            try {
                return saveHandleStreamHoverFn.apply(this, arguments);
            } finally {
                const tweaks = this.container._streamTweaks;
                const labelBox = this;
                this.groups.selectAll('text.static-label-box.max-js').text(function(x) {
                    const labeler = (tweaks[x.streamType] || {}).maxLabel;
                    return labeler ? labeler(x, labelBox, start, end) : this.textContent;
                });
            }
        };

        const saveBuildFn = Klass.prototype.build;
        Klass.prototype.build = function() {
            // Leave a ref to ourselves on the container so it can be used by us later.
            this.container._labelBox = this;
            return saveBuildFn.apply(this, arguments);
        };
    });


    sauce.propDefined('Strava.Charts.Activities.BasicAnalysisStacked', Klass => {
        let minLocale = 'Min';
        booted.then(async () => void (minLocale = await sauce.locale.getMessage('min')));
        const paceMaxLabel = (data, labelBox, start, end) => {
            const stream = labelBox.builder().context.getStream(data.streamType)
                .slice(+start, end == null ? undefined : +end);
            const fmtr = labelBox.builder().context.formatter(data.streamType);
            return Strava.I18n.Locale.t("strava.charts.activities.label_box.hover_max", {
                metric: fmtr.format(d3.min(stream))
            });
        };
        const streamTweaks = {
            w_prime_balance: {
                suggestedMin: () => sauce.analysis.wPrime * 0.50,
                buildRow: (builder, ...args) => builder.buildAreaLine(...args.slice(0, -1), line => {
                    line.groupId('w_prime_balance');
                    const [t, b] = line.yScale().range();
                    const gradPct = value => (line.yScale()(value) - b) / (t - b);
                    const lg = builder.root.append('defs').append('linearGradient');
                    lg.attr({id: 'w-prime-bal-lg', x1: 0, x2: 0, y1: 0, y2: 1});
                    lg.append('stop').attr('offset', gradPct(sauce.analysis.wPrime));
                    lg.append('stop').attr('offset', gradPct(0));
                    lg.append('stop').attr('offset', gradPct(0));
                    lg.append('stop').attr('offset', gradPct(-sauce.analysis.wPrime * 0.25));
                }),
                maxLabel: (data, labelBox, start, end) => {
                    const stream = labelBox.builder().context.getStream(data.streamType)
                        .slice(+start, end == null ? undefined : +end);
                    const fmtr = labelBox.builder().context.formatter(data.streamType);
                    return `${minLocale} ${fmtr.format(d3.min(stream))}`;
                },
            },
            pace: {maxLabel: paceMaxLabel},
            grade_adjusted_pace: {maxLabel: paceMaxLabel},
        };

        class KJFormatter extends Strava.I18n.WorkFormatter {
            format(val, prec=1) {
                return super.format(val / 1000, prec);
            }
        }

        const saveBuildAxisFn = Klass.prototype.buildAxis;
        Klass.prototype.buildAxis = function() {
            saveBuildAxisFn.apply(this, arguments);
            const el = this.xAxisContainer;
            const opts = el.append('g');
            opts.attr({"class": 'chart-options', transform: 'translate(922, 3)'});
            const btn = opts.append('g').attr('class', 'button');
            btn.append('title').text('Options'); // XXX localize
            btn.append('rect').attr({height: 24, width: 35});
            btn.append('image').attr({
                height: 18, width: 35,
                x: 0, y: 3,
                href: sauce.getURL('images/fa/cog-duotone.svg'),
            });
            btn.on('click', () => sauce.analysis.handleGraphOptionsClick(btn, this));
        };

        Klass.prototype.smoothStreamData = function(id) {
            const origData = this.origData = this.origData || {};
            if (!origData[id]) {
                origData[id] = this.context.getStream(id);
            }
            const data = origData[id];
            if (!data) {
                return;
            }
            const smoothing = sauce.options['analysis-graph-smoothing'];
            if (smoothing) {
                const smoothingClipped = Math.min(data.length - 1, smoothing);
                this.context.streamsContext.data.add(id, sauce.data.smooth(smoothingClipped, data));
            } else {
                this.context.streamsContext.data.add(id, data);
            }
            return data;
        };

        Klass.prototype.streamExtent = function(id) {
            const tweaks = streamTweaks[id] || {};
            const stream = this.context.getStream(id);
            let [min, max] = d3.extent(stream);
            if (tweaks.suggestedMin != null) {
                min = Math.min(tweaks.suggestedMin(), min);
            }
            if (tweaks.suggestedMax != null) {
                max = Math.max(tweaks.suggestedMax(), max);
            }
            return [min, max];
        };

        const saveBuildLabelBoxesFn = Klass.prototype.buildLabelBoxes;
        Klass.prototype.buildLabelBoxes = function() {
            this.labelGroup._streamTweaks = streamTweaks;
            return saveBuildLabelBoxesFn.apply(this, arguments);
        };

        Klass.prototype.handleStreamsReady = async function() {
            // In rare cases like install the analysis page
            // is not loaded before the rest of the site.  Not waiting will
            // exclude some of our functions but won't break the site..
            await booted;
            await sauce.analysis.prepared;
            const extraStreams = [{
                stream: 'watts_calc',
                formatter: Strava.I18n.PowerFormatter,
                filter: () => !this.context.streamsContext.data.has('watts'),
            }, {
                // Runs with real watts need this to be manually added..
                stream: 'watts',
                formatter: Strava.I18n.PowerFormatter,
            }, {
                stream: 'grade_adjusted_pace',
                formatter: Strava.I18n.ChartLabelPaceFormatter,
                filter: () => sauce.options['analysis-graph-gap'] &&
                    this.context.activity().supportsGap(),
            }, {
                stream: 'w_prime_balance',
                formatter: KJFormatter,
                label: 'W\'bal',
                filter: () => sauce.options['analysis-graph-wbal'],
            }];
            for (const {stream, formatter, label, filter} of extraStreams) {
                if (filter) {
                    let include;
                    try {
                        include = filter();
                    } catch(e) {/*no-pragma*/}
                    if (!include) {
                        const idx = this.streamTypes.indexOf(stream);
                        if (idx !== -1) {
                            this.streamTypes.splice(idx, 1);
                        }
                        continue;
                    }
                }
                const data = this.context.streamsContext.streams.getStream(stream);
                if (this.streamTypes.includes(stream) || !data) {
                    continue;
                }
                if (label) {
                    Strava.I18n.Locales.DICTIONARY.strava.charts.activities
                        .chart_context[stream] = label;
                }
                if (!this.context.streamsContext.data.has(stream)) {
                    this.context.streamsContext.data.add(stream, data);
                }
                this.streamTypes.push(stream);
                this.context.sportObject().streamTypes[stream] = {formatter};
            }
            // Unminified and fixed original code...
            const rows = [];
            const streams = this.streamTypes.filter(x => !(
                this.context.getStream(x) == null ||
                (x === 'watts_calc' && (this.context.getStream("watts") != null || this.context.trainer())) ||
                (this.showStats && x === 'pace' && !this.showStats.pace)));
            this.setDomainScale();
            this.builder.height(this.stackHeight() * streams.length);  // Must come before calls to buildLine
            const height = this.stackHeight();
            for (const [i, x] of streams.entries()) {
                const stream = this.smoothStreamData(x);
                const tweaks = streamTweaks[x] || {};
                const topY = i * height;
                const yScale = d3.scale.linear();
                const [min, max] = this.streamExtent(x);
                const pad = (max - min) * 0.01; // There is some bleed in the rendering that cuts off values.
                yScale.domain([min - pad, max + pad]).range([topY + height, topY]).nice();
                this.yScales()[x] = yScale;
                const coordData = this.context.data(this.xAxisType(), x);
                if (tweaks.buildRow) {
                    tweaks.buildRow(this.builder, coordData, this.xScale, yScale, x, '');
                } else {
                    this.builder.buildLine(coordData, this.xScale, yScale, x, '');
                }
                // Fix clip path which was only bounding to the entire graph area.
                // For line charts this works but for area charts it causes fill bleed.
                const graph = this.builder.graphs()[x];
                this.builder.root.select(`rect#${graph.clipPathId()}`).attr({height, y: topY});
                const fmtr = this.context.formatter(x);
                rows.push({
                    streamType: x,
                    topY,
                    avgY: this.yScales()[x](d3.mean(stream)),
                    bottomY: topY + height,
                    label: this.context.getStreamLabel(x),
                    unit: this.context.getUnit(x),
                    min: fmtr.format(min),
                    max: fmtr.format(max),
                    avg: '--'
                });
            }
            this.buildOrUpdateAvgLines(rows);
            this.buildBottomLines(rows);
            this.buildLabelBoxes(rows);
            this.buildListenerBoxes(rows);
            this.buildBrush();
            this.builder.updateRoot();
            this.builder.buildCrossBar();
            this.buildAxis();
            this.setEventDispatcher();
            return this.deferred.resolve();
        };
    });


    sauce.propDefined('Strava.Labs.Activities.BasicAnalysisView', Klass => {
        const NewKlass = (Strava.Labs.Activities.BasicAnalysisView = function() {
            sauce.basicAnalysisView = this;
            Klass.apply(this, arguments);
            const event = new Event('basic-analysis-view-ready');
            event.view = this;
            document.dispatchEvent(event);
        });
        NewKlass.prototype = Klass.prototype;

        // Monkey patch the analysis view so we always have our hook for extra stats.
        const saveRenderTemplateFn = Klass.prototype.renderTemplate;
        Klass.prototype.renderTemplate = function() {
            const $el = saveRenderTemplateFn.apply(this, arguments);
            if (sauce.analysis) {
                sauce.analysis.attachAnalysisStats($el);
            } else {
                sauce.analysisStatsIntent = {start: undefined, end: undefined};
            }
            const $chart = $el.find('section.chart');
            if ($chart.length) {
                $chart.attr('tabindex', '0');  // make focus-able for keyboard events
            }
            return $el;
        };
    });


    sauce.propDefined('Strava.Labs.Activities.LapEffortsTableView', View => {
        const saveRender = View.prototype.render;
        View.prototype.render = function() {
            const r = saveRender.apply(this, arguments);
            const event = new Event('lap-efforts-table-view-render');
            event.view = this;
            document.dispatchEvent(event);
            return r;
        };
    });


    /* Patch dragging bug when scrolled in this old jquery ui code.
     * NOTE: We must use Promise.then instead of a callback because the
     * draggable widget isn't fully baked when it's first defined.  The
     * promise resolution won't execute until the assignment is completed.
     */
    sauce.propDefined('jQuery.ui.draggable').then(draggable => {
        const $ = jQuery;
        jQuery.widget('ui.draggable', draggable, {
            _convertPositionTo: function(d, pos) {
                pos = pos || this.position;
                const mod = d === "absolute" ? 1 : -1;
                const useOffsetParent = this.cssPosition === "absolute" &&
                    (this.scrollParent[0] === this.document[0] ||
                     !$.contains(this.scrollParent[0], this.offsetParent[0]));
                const scroll = useOffsetParent ? this.offsetParent : this.scrollParent;
                const scrollIsRootNode = useOffsetParent && (/(html|body)/i).test(scroll[0].nodeName);
                if (!this.offset.scroll) {
                    this.offset.scroll = {top: scroll.scrollTop(), left: scroll.scrollLeft()};
                }
                const scrollTop = mod * this.cssPosition === "fixed" ?
                    -this.scrollParent.scrollTop() :
                    (scrollIsRootNode ? 0 : this.offset.scroll.top);
                const scrollLeft = mod * this.cssPosition === "fixed" ?
                    -this.scrollParent.scrollLeft() :
                    (scrollIsRootNode ? 0 : this.offset.scroll.left);
                return {
                    top: pos.top + this.offset.relative.top * mod + this.offset.parent.top * mod - scrollTop,
                    left: pos.left + this.offset.relative.left * mod +
                        this.offset.parent.left * mod - scrollLeft
                };
            },
            _generatePosition: function(ev) {
                let top;
                let left;
                const useOffsetParent = this.cssPosition === "absolute" &&
                    (this.scrollParent[0] === this.document[0] ||
                     !$.contains(this.scrollParent[0], this.offsetParent[0]));
                const scroll = useOffsetParent ? this.offsetParent : this.scrollParent;
                const scrollIsRootNode = useOffsetParent && (/(html|body)/i).test(scroll[0].nodeName);
                let pageX = ev.pageX;
                let pageY = ev.pageY;
                if (!this.offset.scroll) {
                    this.offset.scroll = {top : scroll.scrollTop(), left : scroll.scrollLeft()};
                }
                if (this.originalPosition) {
                    let containment;
                    if (this.containment) {
                        if (this.relative_container){
                            const co = this.relative_container.offset();
                            containment = [
                                this.containment[0] + co.left,
                                this.containment[1] + co.top,
                                this.containment[2] + co.left,
                                this.containment[3] + co.top
                            ];
                        } else {
                            containment = this.containment;
                        }
                        if(ev.pageX - this.offset.click.left < containment[0]) {
                            pageX = containment[0] + this.offset.click.left;
                        }
                        if(ev.pageY - this.offset.click.top < containment[1]) {
                            pageY = containment[1] + this.offset.click.top;
                        }
                        if(ev.pageX - this.offset.click.left > containment[2]) {
                            pageX = containment[2] + this.offset.click.left;
                        }
                        if(ev.pageY - this.offset.click.top > containment[3]) {
                            pageY = containment[3] + this.offset.click.top;
                        }
                    }
                    const o = this.options;
                    if (o.grid) {
                        top = o.grid[1] ?
                            this.originalPageY +
                                Math.round((pageY - this.originalPageY) / o.grid[1]) * o.grid[1] :
                            this.originalPageY;
                        pageY = containment ?
                            ((top - this.offset.click.top >= containment[1] ||
                              top - this.offset.click.top > containment[3]) ?
                                top :
                                ((top - this.offset.click.top >= containment[1]) ?
                                    top - o.grid[1] : top + o.grid[1])) :
                            top;
                        left = o.grid[0] ?
                            this.originalPageX +
                                Math.round((pageX - this.originalPageX) / o.grid[0]) * o.grid[0] :
                            this.originalPageX;
                        pageX = containment ?
                            ((left - this.offset.click.left >= containment[0] ||
                              left - this.offset.click.left > containment[2]) ?
                                left :
                                ((left - this.offset.click.left >= containment[0]) ?
                                    left - o.grid[0] : left + o.grid[0])) :
                            left;
                    }
                }
                const scrollTop = this.cssPosition === "fixed" ?
                    -this.scrollParent.scrollTop() :
                    (scrollIsRootNode ? 0 : this.offset.scroll.top);
                const scrollLeft = this.cssPosition === "fixed" ?
                    -this.scrollParent.scrollLeft() :
                    (scrollIsRootNode ? 0 : this.offset.scroll.left);
                return {
                    top: pageY - this.offset.click.top - this.offset.relative.top -
                        this.offset.parent.top + scrollTop,
                    left: pageX - this.offset.click.left - this.offset.relative.left -
                        this.offset.parent.left + scrollLeft
                };
            }
        });
    });


    // Allow html titles and icons for dialogs.
    sauce.propDefined('jQuery.ui.dialog').then(dialog => {
        jQuery.widget('ui.dialog', dialog, {
            _title: function(title) {
                if (!this.options.title) {
                    title.html('&nbsp;');
                } else {
                    title.replaceWith(`
                        <div class="ui-dialog-title">
                            <div class="title-label">${this.options.title}</div>
                            <div class="title-icon">${this.options.icon || ''}</div>
                        </div>
                    `);
                }
            }
        });
    });


    // Allow html titles and icons for dialogs.
    sauce.propDefined('Strava.Labs.Activities.SegmentEffortsTableView', View => {
        const NewView = (Strava.Labs.Activities.SegmentEffortsTableView = function(_, options) {
            const activity = options.context.chartContext.activity().clone();
            if (activity.isRun() && sauce.options && sauce.options['analysis-detailed-run-segments']) {
                activity.set('type', 'Ride');
                options.context.chartContext.activity(activity);
            }
            View.apply(this, arguments);
        });
        NewView.prototype = View.prototype;
    });


    sauce.propDefined('Strava.Labs.Activities.SegmentsView', View => {
        const initSave = View.prototype.initialize;
        View.prototype.initialize = function(pageView) {
            if (pageView.isRun() && sauce.options && sauce.options['analysis-detailed-run-segments']) {
                const altPageView = Object.create(pageView);
                altPageView.activity(altPageView.activity().clone());
                altPageView.activity().set('type', 'Ride');
                altPageView._detailedSegments = true;
                Strava.Labs.Activities.SegmentsChartView.prototype.render = function() {
                    this.renderTemplate();
                    // Use non-small Activity class..
                    this.chart = new Strava.Charts.Activities.Activity(
                        this.context, this.streamsRequest, this.showStreamsOnZoom);
                    // Copy height adjustment made by ride overview in StreamsChartView.
                    this.chart.builder.height(100);
                    this.chart.render(this.$el);
                    return this;
                };
                return initSave.call(this, altPageView);
            } else {
                return initSave.call(this, pageView);
            }
        };

        const renderSave = View.prototype.render;
        View.prototype.render = function() {
            if (this.pageView._detailedSegments) {
                this.$el.removeClass('pinnable-anchor');  // Will be moved to the elevation-profile
                if (sauce.options && sauce.options.responsive) {
                    this.$el.addClass('pinnable-view');  // Must be placed on direct parent of pinnable-anchor
                }
            }
            renderSave.apply(this, arguments);
            if (this.pageView._detailedSegments) {
                this.$el.prepend(`<div class="pinnable-anchor" id="elevation-profile">
                    <div class="chart pinnable sauce-detailed-run-segments" id="chart-container"></div>
                </div>`);
                this.$el.prepend(`<div id="map-canvas" class="leaflet-container leaflet-retina
                                                              leaflet-fade-anim leaflet-touch"></div>`);
            }
            return this;
        };
    });


    // Provide race-free detection of pending requests.
    sauce.propDefined('Strava.Streams.StreamsRequest', Model => {
        const requireSave = Model.prototype.require;
        Model.prototype.require = function() {
            const ret = requireSave.apply(this, arguments);
            if (!this.pending && this.required && this.required.length) {
                this.pending = new Promise(resolve => {
                    this.deferred.always(() => {
                        this.pending = false;
                        resolve();
                    });
                });
            }
            return ret;
        };
    }, {multiple: true});


    sauce.propDefined('Strava.Labs.Activities.MenuRouter', Klass => {
        const changeMenuToSave = Klass.prototype.changeMenuTo;
        Klass.prototype.changeMenuTo = function(page, trigger) {
            if (sauce.options && sauce.options['analysis-menu-nav-history']) {
                if (trigger == null) {
                    trigger = true;
                }
                if (this.context.fullscreen()) {
                    this.trigger(`route:${page}`);
                } else {
                    this.navigate(`/${this.baseUrl}/${this.id}/${page}`, {trigger});
                }
            } else {
                return changeMenuToSave.apply(this, arguments);
            }
        };
    });


    sauce.propDefined('Strava.ExternalPhotos.Views.PhotoLightboxView', Klass => {
        // Must wait for prototype to be fully assigned by the current execution context.
        setTimeout(() => {
            const renderSave = Klass.prototype.render;
            Klass.prototype.render = function() {
                const ret = renderSave.apply(this, arguments);
                const dlIconUrl = sauce.getURL('images/fa/external-link-duotone.svg');
                this.$('.lightbox-more-controls').prepend(`
                    <button class="btn btn-unstyled sauce-download" title="Open fullsize photo">
                        <div class="app-icon sauce-download-icon icon-xs"
                             style="background-image: url(${dlIconUrl});"></div>
                    </button>
                `);
                this.$el.on('click', 'button.sauce-download', ev => {
                    const url = this.$('.photo-slideshow-content .image-wrapper img').attr('src');
                    window.open(url, '_blank');
                });
                return ret;
            };
        }, 0);
    });


    sauce.propDefined('Strava.Labs.Activities.SegmentEffortDetailView', Klass => {
        const renderSave = Klass.prototype.render;
        async function addButton(segmentId, label, tip, extraCls, icon) {
            const runSegmentsView = this.options.pageView.chartContext().activity().get('type') === 'Run';
            const selector = runSegmentsView ? '.bottomless.inset' : '.effort-actions';
            let $btns = this.$(`${selector} .sauce-buttons`);
            if (!$btns.length) {
                const toolsLocale = await sauce.locale.getMessage('tools');
                this.$(selector).append(jQuery(`
                    <div class="sauce-btn-group btn-block">
                        <label>Sauce ${toolsLocale}</label>
                        <div class="sauce-buttons btn-group"></div>
                    </div>`));
                $btns = this.$(`${selector} .sauce-buttons`);
            }
            $btns.append(jQuery(`
                <div title="${tip}" class="button sauce-button ${extraCls || ''}"
                     data-segment-id="${segmentId}">${icon || ''}${label}</div>`));
        }
        async function addButtons() {
            const segId = this.viewModel.model.id;
            const supportsLiveSeg = pageView.activity().isRide() || pageView.activity().isRun();
            if (supportsLiveSeg && !sauce.hideBonusFeatures) {
                const tooltip = await sauce.locale.getMessage('analysis_create_live_segment_tooltip');
                const icon = await sauce.ui.getImage('fa/trophy-duotone.svg');
                await addButton.call(this, segId, `Live Segment`, tooltip, `live-segment`, icon);
            }
            if (pageView.activity().isRide()) {
                const tooltip = await sauce.locale.getMessage('analysis_perf_predictor_tooltip');
                const icon = await sauce.ui.getImage('fa/analytics-duotone.svg');
                await addButton.call(this, segId, 'Perf Predictor', tooltip, 'perf-predictor', icon);
            }
        }
        Klass.prototype.render = function() {
            const ret = renderSave.apply(this, arguments);
            booted.then(() => addButtons.call(this));
            document.dispatchEvent(new CustomEvent('sauceSegmentEffortDetailsRender',
                                                   {detail: {view: this}}));
            document.dispatchEvent(new Event('sauceResetPageMonitor'));
            return ret;
        };
    });


    sauce.propDefined('Strava.Labs.Activities.SegmentLeaderboardView', Klass => {
        let filterLabel = 'My History';
        let actLabel = 'Activity';
        let customResultsSize = false;
        booted.then(() => sauce.locale.getMessages(['analysis_my_history', 'activity']).then(x => {
            filterLabel = x[0];
            actLabel = x[1];
        }));
        optionsReady.then(() => customResultsSize = !!sauce.options['analysis-segment-results-size']);
        const renderTemplate = Klass.prototype.renderTemplate;
        Klass.prototype.renderTemplate = function() {
            const ret = renderTemplate.apply(this, arguments);
            try {
                const filter =  this.viewModel.leaderboard.get('filter');
                this.$el[0].dataset.filter = filter;
                this.$el.toggleClass('sauce-overflow-leaderboard',
                                     customResultsSize || filter === 'my_history');
                if (filter === 'my_results' || filter === 'my_history') {
                    this.$('table thead th.results-col-js').text(actLabel);
                }
                let $refEl = this.$el.find('.leaderboard-filter ul.options [data-filter="my_results"]');
                if (!$refEl.length) {
                    $refEl = this.$el.find('.leaderboard-filter ul.options [data-filter]').last();
                }
                const histEl = $refEl[0].cloneNode(/*deep*/ true);
                histEl.dataset.filter = 'my_history';
                histEl.textContent = filterLabel;
                $refEl.parent().after(`<li class="sauce"></li>`).next().append(histEl);
            } catch(e) {
                // Don't ever break things...
                console.error("Internal Error:", e);
            }
            return ret;
        };

        const showHideCols = Klass.prototype.showHideCols;
        Klass.prototype.showHideCols = function() {
            if (this.viewModel.leaderboard.get('filter') === 'my_history') {
                this.$(this.RESULTS_COL_SELECTOR).show();
                return this.$(this.MY_RESULTS_COL_SELECTOR).show();
            } else {
                return showHideCols.apply(this, arguments);
            }
        };
    });


    sauce.propDefined('Strava.Labs.Activities.SegmentLeaderboardViewModel', Klass => {
        const myResults = Klass.prototype.myResults;
        Klass.prototype.myResults = function() {
            return myResults.apply(this, arguments) || this.leaderboard.get('filter') === 'my_history';
        };

        const highlightRow = Klass.prototype.highlightRow;
        Klass.prototype.highlightRow = function(effort) {
            const filter = this.leaderboard.get('filter');
            if (filter === 'my_history' || filter === 'my_results') {
                return pageView.activityId() === effort.activity_id;
            } else {
                return highlightRow.apply(this, arguments);
            }
        };
    });


    // TimerTimeStreamTransform.transform has side effects making it subject to errors when
    // called with some orderings of arguments.  If the tranform() is called with 'distance' or
    // 'grade_adjusted_distance' before 'timer_time' then subsequent calls with arguments
    // 'pace', 'grade_adjusted_pace' or 'velocity' will fail.
    // NOTE: Efforts are made to keep this ordering "safe" but as a fallback we're patching
    // this code allthesame as it is buggy.
    sauce.propDefined('Strava.Streams.Transforms.TimerTimeStreamTransform', Klass => {
        const transform = Klass.prototype.transform;
        Klass.prototype.transform = function(type, stream) {
            if (this[type] === undefined && ['distance', 'grade_adjusted_distance'].includes(type)) {
                this[type] = stream;
            }
            return transform.apply(this, arguments);
        };
    }, {multiple: true});


    async function fetchLikeXHR(url, query) {
        /* This fetch technique is required for several API endpoints. */
        const q = new URLSearchParams();
        if (query) {
            if (Array.isArray(query)) {
                for (const {key, value} of query) {
                    q.append(key, value);
                }
            } else {
                for (const [key, value] of Object.entries(query)) {
                    q.set(key, value);
                }
            }
        }
        const qStr = q.toString();
        const fqUrl = qStr ? `${url}?${qStr}` : url;
        const resp = await sauce.fetch(fqUrl, {
            redirect: 'error',
            headers: {'X-Requested-With': 'XMLHttpRequest'},  // Required to avoid 301s and 404s
        });
        if (!resp.ok) {
            throw new Error(`Sauce fetch like XHR fail: ${resp.status}`);
        }
        return await resp.json();
    }


    function interceptModelFetch(originalFetch, interceptCallback) {
        /* We would like to cache some model requests locally as they tend to be high latency
         * network calls and strava does no HTTP caching with them.  To achieve this everywhere
         * we temporarily monkey patch Backbone.ajax() during the synchronous call to fetch().
         * This modified Backbone.ajax is learned in the ways of using Sauce's cache system. */
        return function() {
            const BackboneAjaxSave = Backbone.ajax;
            const outerScope = this;  // Only use for interceptCallback.  Orig must use ajax scope.
            Backbone.ajax = function(options) {
                const d = jQuery.Deferred();
                interceptCallback.call(outerScope, options).then(data => {
                    if (options.success) {
                        options.success(data);
                    }
                    d.resolve(data);
                }).catch(e => {
                    if (!e.fallback) {
                        console.error(`Sauce interceptCallback failed (falling back to ajax):`, e);
                    }
                    const xhr = BackboneAjaxSave.apply(this, arguments);
                    xhr.done(d.resolve).fail(d.reject);
                });
                return d;
            };
            try {
                return originalFetch.apply(this, arguments);
            } finally {
                Backbone.ajax = BackboneAjaxSave;
            }
        };
    }


    let _streamsCache;
    sauce.propDefined('Strava.Streams.Streams', Klass => {
        if (!_streamsCache) {
            _streamsCache = new sauce.cache.TTLCache('streams', 30 * 86400_000);
        }

        Klass.prototype._cacheKey = function(key) {
            const keyPrefix = this.activityId;
            return `${keyPrefix}-${key}`;
        };

        async function fillCache(options, streams) {
            const query = Array.from(streams).map(value => ({key: 'stream_types[]', value}));
            const data = await fetchLikeXHR(options.url, query);
            const cacheObj = {};
            for (const key of streams) {
                // Convert undefined to null to indicate cache has been set.
                cacheObj[this._cacheKey(key)] = data[key] === undefined ? null : data[key];
            }
            await _streamsCache.setObject(cacheObj);
            setTimeout(async () => {
                await booted;
                await sauce.proxy.connected;
                sauce.hist.incrementStreamsUsage();
            }, 200);
            return data;
        }

        const pendingStale = new Set();
        let pendingFill;
        async function getStreams(options) {
            if (!pageView) {
                // File uploads use Streams class but don't have a pageView.
                const e = new Error();
                e.fallback = true;
                throw e;
            }
            const streams = options.data.stream_types;
            const cachedEntries = await _streamsCache.getEntries(streams.map(x => this._cacheKey(x)));
            const missing = new Set();
            const stale = new Set();
            const streamsObj = {};
            for (let i = 0; i < streams.length; i++) {
                const key = streams[i];
                const cacheEntry = cachedEntries[i];
                if (!cacheEntry) {
                    missing.add(key);
                } else {
                    if (Date.now() - cacheEntry.created > 300_000) {
                        stale.add(key);
                    }
                    if (cacheEntry.value !== null) {
                        streamsObj[key] = cacheEntry.value;
                    }
                }
            }
            if (missing.size) {
                Object.assign(streamsObj, await fillCache.call(this, options, missing));
            }
            if (stale.size) {
                for (const x of stale) {
                    pendingStale.add(x);
                }
                clearTimeout(pendingFill);
                pendingFill = setTimeout(() => maybeRequestIdleCallback(async () => {
                    const streams = Array.from(pendingStale);
                    pendingStale.clear();
                    await fillCache.call(this, options, streams);
                }), 2500);
            }
            return streamsObj;
        }

        Klass.prototype.fetch = interceptModelFetch(Klass.prototype.fetch, getStreams);

        const setStreamsFromResponseSave = Klass.prototype.setStreamsFromResponse;
        Klass.prototype.setStreamsFromResponse = function(response) {
            // Starting to see bogus data for watts_calc on runs that poisons our good calcs
            if (response.watts_calc && !response.watts_calc.some(x => x)) {
                console.debug("Deleting bogus watts_calc streams returned by Strava");
                delete response.watts_calc;
            }
            return setStreamsFromResponseSave.apply(this, arguments);
        };
    }, {multiple: true});


    let _segmentEffortCache;
    sauce.propDefined('Strava.Models.SegmentEffortDetail', Klass => {
        if (!_segmentEffortCache) {
            _segmentEffortCache = new sauce.cache.TTLCache('segment-effort', 7 * 86400_000);
        }

        async function fillCache(options, key) {
            const data = await fetchLikeXHR(options.url);
            await _segmentEffortCache.set(key, data);
            return data;
        }

        async function getSegmentEffort(options) {
            const key = options.url.match(/segment_efforts\/([0-9]+)/)[1];
            if (isNaN(Number(key))) {
                throw new TypeError("Invalid segment id: " + key);
            }
            const cachedEntry = await _segmentEffortCache.getEntry(key);
            if (cachedEntry) {
                if (Date.now() - cachedEntry.created > 120_000) {
                    setTimeout(() => maybeRequestIdleCallback(() => fillCache(options, key)), 1000);
                }
                return cachedEntry.value;
            }
            return await fillCache(options, key);
        }

        Klass.prototype.fetch = interceptModelFetch(Klass.prototype.fetch, getSegmentEffort);
    });


    let _segmentLeaderboardCache;
    sauce.propDefined('Strava.Models.SegmentLeaderboard', Klass => {
        if (!_segmentLeaderboardCache) {
            _segmentLeaderboardCache = new sauce.cache.TTLCache('segment-leaderboard', 7 * 86400_000);
        }

        async function fillCache(options, key) {
            const data = await fetchLikeXHR(options.url, options.data);
            await _segmentLeaderboardCache.set(key, data);
            return data;
        }

        async function getSegmentLeaderboard(options) {
            const id = options.url.match(/segments\/([0-9]+)\/leaderboard/)[1];
            if (isNaN(Number(id))) {
                throw new TypeError("Invalid leaderboard id: " + id);
            }
            if (options.data?.filter === 'my_history') {
                const resp = await fetch(`/athlete/segments/${id}/history`);
                let data;
                if (!resp.ok) {
                    if (resp.status >= 400 && resp.status < 500) {
                        console.warn("Segment history API is unavailable:", resp.status);
                        data = {efforts: []};
                        return;
                    }
                    console.error("Error fetching segment history:", await resp.text());
                    throw new TypeError("Fetch error");
                } else {
                    // Workaround for bug in strava API sending overflowed data...
                    data = JSON.parse(await resp.text(), (key, value, context) =>
                        key === 'id' ? context && context.source || "" + value : value);
                    data.efforts.reverse();
                }
                const athlete_id = pageView.currentAthlete().id;
                // Make this look like /segments/<ID>/leaderboard ...
                return {
                    filter: 'my_history',
                    date_range: null,
                    age_group: null,
                    weight_class: null,
                    gender: 'all',
                    page: 1,
                    per_page: data.efforts.length,
                    top_results: data.efforts.map((x, i) => ({
                        ...x,
                        athlete_id,
                        avg_heart_rate: x.avg_hr,
                        avg_speed: sauce.locale.human.pace(1 / (x.distance / x.moving_time),
                                                           {html: true, suffix: true}),
                        display_name: x.activity.name,
                        display_name_raw: x.activity.name,
                        elapsed_time: sauce.locale.human.timer(x.elapsed_time),
                        elapsed_time_raw: x.elapsed_time,
                        first_name: null,
                        has_watts: !!x.avg_watts,
                        start_date_local: sauce.locale.human.date(x.start_date_local, {concise: true}),
                        start_date_local_raw: x.start_date_local,
                    })),
                    top_results_count: data.athlete_effort_count,
                    viewer_clubs: [],
                };
            }
            const key = `${id}-${JSON.stringify(options.data)}`;
            let data;
            const cachedEntry = await _segmentLeaderboardCache.getEntry(key);
            if (cachedEntry) {
                if (Date.now() - cachedEntry.created > 120_000) {
                    setTimeout(() => maybeRequestIdleCallback(() => fillCache(options, key)), 1000);
                }
                data = cachedEntry.value;
            } else {
                data = await fillCache(options, key);
            }
            return data;
        }

        Klass.prototype.fetch = interceptModelFetch(Klass.prototype.fetch, getSegmentLeaderboard);

        let per_page;
        const getDefaults = Klass.prototype.getDefaults;
        Klass.prototype.getDefaults = function() {
            const defs = getDefaults();
            return per_page ? Object.assign(defs, {per_page}) : defs;
        };

        optionsReady.then(() => {
            per_page = sauce.options['analysis-segment-results-size'];
            if (per_page) {
                const localeRoots = Strava.I18n.Locales.DICTIONARY.templates.activities.segment_efforts;
                for (const obj of Object.values(localeRoots)) {
                    if (typeof obj === 'object' && obj.top_10) {
                        obj.top_10 = obj.top_10.replace(/[0-9]+/, per_page.toLocaleString());
                    }
                }
            }
        });
    });


    sauce.propDefined('currentAthlete', athlete => {
        document.documentElement.dataset.sauceCurrentUser = athlete.id || '';
        document.documentElement.classList.toggle('sauce-non-premium-user', !athlete.isPremium());
        document.dispatchEvent(new Event('sauceCurrentUserUpdate'));
    });


    sauce.propDefined('StravaSentry', x => x.enabled = false);
    window.__SENTRY_TRACING__ = false;


    sauce.propDefined('Strava.I18n.UnitSystemFormatter', Klass => {
        Klass.prototype.abbreviatedNoWhitespace = function(value) {
            const fmt = Strava.I18n.FormatterTranslations[this.key][this.unitSystem].abbr
                .replace(/ <abbr /, '<abbr ');
            return Strava.I18n.MessageFormatter.format(fmt, {
                value: this.format(value, this.precision)
            });
        };
    });


    sauce.propDefined('Strava.I18n.ScalarFormatter', Klass => {
        Klass.prototype.abbreviatedNoWhitespace = function(value) {
            const fmt = Strava.I18n.FormatterTranslations[this.key].abbr.replace(/ <abbr /, '<abbr ');
            return Strava.I18n.MessageFormatter.format(fmt, {
                value: this.format(value, this.precision)
            });
        };
    });


    // remoteEntry.js drives me crazy; silence the logorrehea..
    const cWarn = console.warn;
    Object.defineProperty(console, 'warn', {
        set: () => {
            console.debug('Ignore attempt to patch console.warn');
        },
        get: () => {
            try {
                const caller = new Error().stack.split('\n', 3)[2];
                if (caller && caller.match && caller.match(/remoteEntry\.js/)) {
                    return () => undefined;
                }
            } catch(e) {
                console.error('console.warn patch failed:', e);
            }
            return cWarn;
        }
    });
};
