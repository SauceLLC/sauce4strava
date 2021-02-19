/* global sauce, jQuery, Strava, pageView, Backbone */

// NOTE: Must be assigned to self and have matching name for FF
self.saucePreloaderInit = function saucePreloaderInit() {
    'use strict';

    self.sauce = self.sauce || {};

    const cacheRefreshThreshold = 120 * 1000;
    const maybeRequestIdleCallback = self.requestIdleCallback || (fn => fn());  // Safari


    sauce.propDefined('pageView', view => {
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
            // Some indoor workouts for non-premium members don't have pageNav (ie. peleton)
            if (overview) {
                const li = document.createElement('li');
                li.style.display = 'none';
                li.classList.add('sauce-stub');
                li.innerHTML = `<a data-menu="analysis"></a>`;
                pageNav.insertBefore(li, overview.closest('li').nextSibling);
            }
        }
        const activity = view.activity();
        let _supportsGap;
        function supportsGap(v) {
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
        }
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
    }, {once: true});


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
    }, {once: true});


    sauce.propDefined('Strava.Charts.Activities.LabelBox', Klass => {
        // This is called when zoom selections change or are unset in the profile graph.
        const saveFn = Klass.prototype.handleStreamHover;
        Klass.prototype.handleStreamHover = function(_, start, end) {
            start = start === undefined ? start : Number(start);
            end = end === undefined ? end : Number(end);
            if (sauce.analysis) {
                sauce.analysis.schedUpdateAnalysisStats(start, end);
            } else {
                sauce.analysisStatsIntent = {start, end};
            }
            return saveFn.apply(this, arguments);
        };
    }, {once: true});


    sauce.propDefined('Strava.Labs.Activities.BasicAnalysisView', Klass => {
        // Monkey patch the analysis view so we always have our hook for extra stats.
        const saveFn = Klass.prototype.renderTemplate;
        Klass.prototype.renderTemplate = function() {
            const $el = saveFn.apply(this, arguments);
            if (sauce.analysis) {
                sauce.analysis.attachAnalysisStats($el);
            } else {
                sauce.analysisStatsIntent = {start: undefined, end: undefined};
            }
            return $el;
        };
    }, {once: true});


    /* Patch dragging bug when scrolled in this old jquery ui code.
     * NOTE: We must use Promise.then instead of a callback because the
     * draggable widget isn't fully baked when it's first defined.  The
     * promise resolution won't execute until the assignment is completed.
     */
    sauce.propDefined('jQuery.ui.draggable', {once: true}).then(draggable => {
        const $ = jQuery;
        jQuery.widget('ui.draggable', draggable, {
            _convertPositionTo: function(d, pos) {
                pos = pos || this.position;
                const mod = d === "absolute" ? 1 : -1;
                const useOffsetParent = this.cssPosition === "absolute" &&
                    (this.scrollParent[0] === this.document[0] || !$.contains(this.scrollParent[0], this.offsetParent[0]));
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
                    left: pos.left + this.offset.relative.left * mod + this.offset.parent.left * mod - scrollLeft
                };
            },
            _generatePosition: function(ev) {
                let top;
                let left;
                const useOffsetParent = this.cssPosition === "absolute" &&
                    (this.scrollParent[0] === this.document[0] || !$.contains(this.scrollParent[0], this.offsetParent[0]));
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
                            this.originalPageY + Math.round((pageY - this.originalPageY) / o.grid[1]) * o.grid[1] :
                            this.originalPageY;
                        pageY = containment ?
                            ((top - this.offset.click.top >= containment[1] || top - this.offset.click.top > containment[3]) ?
                                top :
                                ((top - this.offset.click.top >= containment[1]) ? top - o.grid[1] : top + o.grid[1])) :
                            top;
                        left = o.grid[0] ?
                            this.originalPageX + Math.round((pageX - this.originalPageX) / o.grid[0]) * o.grid[0] :
                            this.originalPageX;
                        pageX = containment ?
                            ((left - this.offset.click.left >= containment[0] || left - this.offset.click.left > containment[2]) ?
                                left :
                                ((left - this.offset.click.left >= containment[0]) ? left - o.grid[0] : left + o.grid[0])) :
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
                    top: pageY - this.offset.click.top - this.offset.relative.top - this.offset.parent.top + scrollTop,
                    left: pageX - this.offset.click.left - this.offset.relative.left - this.offset.parent.left + scrollLeft
                };
            }
        });
    });


    // Allow html titles and icons for dialogs.
    sauce.propDefined('jQuery.ui.dialog', {once: true}).then(dialog => {
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
        self.Strava.Labs.Activities.SegmentEffortsTableView = function(_, options) {
            const activity = options.context.chartContext.activity().clone();
            if (activity.isRun() && sauce.options && sauce.options['analysis-detailed-run-segments']) {
                activity.set('type', 'Ride');
                options.context.chartContext.activity(activity);
            }
            View.prototype.constructor.apply(this, arguments);
        };
        self.Strava.Labs.Activities.SegmentEffortsTableView.prototype = View.prototype;
    }, {once: true});


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
                    this.chart = new Strava.Charts.Activities.Activity(this.context, this.streamsRequest,
                        this.showStreamsOnZoom);
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
                if (sauce.options.responsive) {
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
    }, {once: true});


    // Provide race-free detection of pending requests.
    sauce.propDefined('Strava.Labs.Activities.StreamsRequest', Model => {
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
    });


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
    }, {once: true});


    sauce.propDefined('Strava.ExternalPhotos.Views.PhotoLightboxView', Klass => {
        // Must wait for prototype to be fully assigned by the current execution context.
        setTimeout(() => {
            const renderSave = Klass.prototype.render;
            Klass.prototype.render = function() {
                const ret = renderSave.apply(this, arguments);
                this.$('.lightbox-more-controls').prepend(`
                    <button class="btn btn-unstyled sauce-download" title="Open fullsize photo">
                        <div class="app-icon sauce-download-icon icon-xs"
                             style="background-image: url(${sauce.extUrl}images/fa/external-link-duotone.svg);"></div>
                    </button>
                `);
                this.$el.on('click', 'button.sauce-download', async ev => {
                    const url = this.$('.photo-slideshow-content .image-wrapper img').attr('src');
                    window.open(url, '_blank');
                });
                return ret;
            };
        }, 0);
    }, {once: true});


    sauce.propDefined('Strava.Labs.Activities.SegmentEffortDetailView', async Klass => {
        const renderSave = Klass.prototype.render;
        async function addButton(segmentId, label, tip, extraCls, icon) {
            const runSegmentsView = this.options.pageView.chartContext().activity().get('type') === 'Run';
            const selector = runSegmentsView ? '.bottomless.inset' : '.effort-actions';
            let $btns = this.$(`${selector} .sauce-buttons`);
            if (!$btns.length) {
                const toolsLocale = await sauce.locale.getMessage('analysis_tools');
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
            const isPatron = sauce.patronLevel && sauce.patronLevel >= 10;
            if (supportsLiveSeg && (isPatron || (sauce.options && !sauce.options['hide-upsells']))) {
                const tooltip = await sauce.locale.getMessage('analysis_create_live_segment_tooltip');
                const icon = await sauce.images.asText('fa/trophy-duotone.svg');
                await addButton.call(this, segId, `Live Segment`, tooltip, `live-segment`, icon);
            }
            if (pageView.activity().isRide()) {
                const tooltip = await sauce.locale.getMessage('analysis_perf_predictor_tooltip');
                const icon = await sauce.images.asText('fa/analytics-duotone.svg');
                await addButton.call(this, segId, 'Perf Predictor', tooltip, 'perf-predictor', icon);
            }
        }
        Klass.prototype.render = function() {
            const ret = renderSave.apply(this, arguments);
            if (sauce.options) {
                addButtons.call(this).catch(sauce.report.error);
            }
            return ret;
        };
    }, {once: true});


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
        const resp = await fetch(fqUrl, {
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
                        console.error(`Sauce inteceptCallback failed (falling back to ajax):`, e);
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
    sauce.propDefined('Strava.Labs.Activities.Streams', Klass => {
        if (!_streamsCache) {
            _streamsCache = new sauce.cache.TTLCache('streams', 180 * 86400 * 1000);
        }
        Klass.prototype._cacheKey = function(key) {
            const keyPrefix = this.activityId;
            return `${keyPrefix}-${key}`;
        };
        const pendingStale = new Set();
        let pendingFill;
        async function fillCache(options, streams) {
            const query = Array.from(streams).map(value => ({key: 'stream_types[]', value}));
            const data = await fetchLikeXHR(options.url, query);
            const cacheObj = {};
            for (const key of streams) {
                // Convert undefined to null so indicate cache has been set.
                cacheObj[this._cacheKey(key)] = data[key] === undefined ? null : data[key];
            }
            await _streamsCache.setObject(cacheObj);
            setTimeout(() => sauce.proxy.connected.then(() => sauce.hist.incrementStreamsUsage()), 100);
            return data;
        }
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
                    if (Date.now() - cacheEntry.created > cacheRefreshThreshold) {
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
                }), 1000);
            }
            return streamsObj;
        }
        Klass.prototype.fetch = interceptModelFetch(Klass.prototype.fetch, getStreams);
    });


    let _segmentEffortCache;
    sauce.propDefined('Strava.Models.SegmentEffortDetail', Klass => {
        if (!_segmentEffortCache) {
            _segmentEffortCache = new sauce.cache.TTLCache('segment-effort', 1 * 86400 * 1000);
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
                if (Date.now() - cachedEntry.created > cacheRefreshThreshold) {
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
            _segmentLeaderboardCache = new sauce.cache.TTLCache('segment-leaderboard', 1 * 86400 * 1000);
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
            const key = `${id}-${JSON.stringify(options.data)}`;
            const cachedEntry = await _segmentLeaderboardCache.getEntry(key);
            if (cachedEntry) {
                if (Date.now() - cachedEntry.created > cacheRefreshThreshold) {
                    setTimeout(() => maybeRequestIdleCallback(() => fillCache(options, key)), 1000);
                }
                return cachedEntry.value;
            }
            return await fillCache(options, key);
        }
        Klass.prototype.fetch = interceptModelFetch(Klass.prototype.fetch, getSegmentLeaderboard);
    });


    sauce.propDefined('currentAthlete', athlete => {
        document.documentElement.dataset.sauceCurrentUser = athlete.id || '';
        document.documentElement.dispatchEvent(new Event('sauceCurrentUserUpdate'));
    });
};
