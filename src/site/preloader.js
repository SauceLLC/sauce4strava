/* global sauce, jQuery, Strava, pageView, Backbone */

(function() {
    'use strict';

    self.sauce = self.sauce || {};

    sauce.propDefined = function(propertyAccessor, callback, options) {
        if (typeof callback === 'object' && options === undefined) {
            options = callback;
            callback = null;
        } else {
            options = options || {};
        }
        const ourListeners = [];
        function addListener(propDesc, fn) {
            propDesc.set.listeners.push(fn);
            ourListeners.push({fn, propDesc});
        }
        return new Promise(resolve => {
            function catchDefine(obj, props) {
                const prop = props[0];
                function onSet(value) {
                    if (props.length > 1) {
                        if (Object.isExtensible(value)) {
                            catchDefine(value, props.slice(1));
                        }
                    } else {
                        if (options.once) {
                            for (const {fn, propDesc} of ourListeners) {
                                const idx = propDesc.set.listeners.indexOf(fn);
                                propDesc.set.listeners.splice(idx, 1);
                                if (!propDesc.set.listeners.length) {
                                    Object.defineProperty(obj, prop, {
                                        value: obj[prop],
                                        configurable: true,
                                        writable: true,
                                        enumerable: propDesc.enumerable
                                    });
                                }
                            }
                        }
                        if (callback) {
                            callback(value);
                        }
                        resolve(value);
                    }
                }
                const curValue = obj[prop];
                if (curValue !== undefined) {  // Not stoked on this test.
                    onSet(curValue);
                    if (options.once) {
                        return;  // Just walk the props.
                    }
                }
                const propDesc = Object.getOwnPropertyDescriptor(obj, prop);
                if (propDesc && propDesc.set && propDesc.set.listeners) {
                    addListener(propDesc, onSet);
                } else if (!propDesc || (propDesc.configurable && !propDesc.set)) {
                    let internalValue = propDesc ? propDesc.value : undefined;
                    const set = function(value) {
                        if (Object.is(internalValue, value)) {
                            return;
                        }
                        internalValue = value;
                        for (const fn of Array.from(set.listeners)) {
                            fn(value);
                        }
                    };
                    set.listeners = [];
                    Object.defineProperty(obj, prop, {
                        enumerable: true,
                        configurable: true,
                        get: () => internalValue,
                        set
                    });
                    addListener(Object.getOwnPropertyDescriptor(obj, prop), onSet);
                } else if (!options.once) {
                    console.error("Value already exists, consider using `once` option");
                    throw new TypeError("Unconfigurable");
                }
            }
            catchDefine(options.root || self, propertyAccessor.split('.'));
        });
    };


    class IDBExpirationBucket {
        static async factory() {
            const instance = new this();
            instance.db = await new Promise((resolve, reject) => {
                const request = indexedDB.open('SauceCache', 1);
                request.addEventListener('error', ev => reject(request.error));
                request.addEventListener('success', ev => resolve(ev.target.result));
                request.addEventListener('blocked', ev => reject(new Error('Blocked by existing DB connection')));
                request.addEventListener('upgradeneeded', ev => {
                    const db = ev.target.result;
                    if (ev.oldVersion < 1) {
                        const store = db.createObjectStore("entries", {autoIncrement: true});
                        store.createIndex('bucket-expiration', ['bucket', 'expiration']);
                        store.createIndex('bucket-key', ['bucket', 'key'], {unique: true});
                    }
                });
            });
            return instance;
        }

        requestPromise(req) {
            return new Promise((resolve, reject) => {
                req.addEventListener('error', ev => reject(req.error));
                req.addEventListener('success', ev => resolve(req.result));
            });
        }

        async _storeCall(transactionMode, onStore) {
            const t = this.db.transaction('entries', transactionMode);
            const store = t.objectStore('entries');
            const result = await this.requestPromise(await onStore(store));
            return await new Promise((resolve, reject) => {
                t.addEventListener('abort', ev => reject('Transaction Abort'));
                t.addEventListener('error', ev => reject(t.error));
                t.addEventListener('complete', ev => resolve(result));
            });
        }

        async get(keyOrRange) {
            return await this._storeCall('readonly', store => {
                const index = store.index('bucket-key');
                return index.get(keyOrRange);
            });
        }

        async put(data) {
            await this._storeCall('readwrite', async store => {
                const index = store.index('bucket-key');
                const key = await this.requestPromise(index.getKey([data.bucket, data.key]));
                if (key) {
                    await this.requestPromise(store.delete(key));
                }
                return store.put(data);
            });
        }

        async delete(keyOrRange) {
            await this._storeCall('readwrite', async store => {
                const index = store.index('bucket-key');
                const key = await this.requestPromise(index.getKey(keyOrRange));
                return store.delete(key);
            });
        }
    }


    class TTLCache {
        constructor(bucket, ttl) {
            this.bucket = bucket;
            this.ttl = ttl;
            this._initing = this.init();
        }

        async init() {
            this.idb = await IDBExpirationBucket.factory();
        }

        async get(key) {
            await this._initing;
            const data = await this.idb.get([this.bucket, key]);
            if (data && data.expiration > Date.now()) {
                return data.value;
            }
        }

        async set(key, value) {
            await this._initing;
            const expiration = Date.now() + this.ttl;
            await this.idb.put({
                bucket: this.bucket,
                key,
                expiration,
                value
            });
        }
    }

    sauce.cache = {
        TTLCache
    };


    if (!sauce.testing) {
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
                // Some indoor workouts for non-premium members don't have pageNav (ie. peleton)
                if (pageNav) {
                    const li = document.createElement('li');
                    li.style.display = 'none';
                    li.classList.add('sauce-stub');
                    li.innerHTML = `<a data-menu="analysis"></a>`;
                    const overview = pageNav.querySelector('[data-menu="overview"]').closest('li');
                    pageNav.insertBefore(li, overview.nextSibling);
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


        let _streamsCache;
        sauce.propDefined('Strava.Labs.Activities.Streams', Klass => {
            const fetchRemoteSave = Klass.prototype.fetchRemote;
            Klass.prototype.fetchRemote = function(streams, options) {
                if (!_streamsCache) {
                    _streamsCache = new TTLCache('streams', 300 * 1000);
                }
                const BackboneAjaxSave = Backbone.ajax;
                Backbone.ajax = function(ajaxOptions) {
                    const deferred = jQuery.Deferred();
                    function fallbackAjax() {
                        const xhr = BackboneAjaxSave(ajaxOptions);
                        xhr.done(streamsData => {
                            debugger;
                            deferred.resolve.apply(deferred, arguments);
                            _streamsCache.set(streams.join(), streamsData);
                        });
                        xhr.fail(deferred.reject); // XXX need to using scope binding?
                    }
                    // XXX just being real dumb here for now, break out to unique stream sets..
                    _streamsCache.get(streams.join()).then(streamsData => {
                        if (streamsData) {
                            deferred.resolve(streamsData);
                            if (ajaxOptions.success) {
                                ajaxOptions.success(streamsData); // XXX Guessing at arguments..
                            }
                        } else {
                            fallbackAjax();
                        }
                    }).catch(e => {
                        // Abort our cache attempt in any error case and use original method.
                        console.error('Sauce stream cache error:', e);
                        fallbackAjax();
                    });
                    return deferred;
                };
                try {
                    return fetchRemoteSave.call(this, streams, options);
                } finally {
                    Backbone.ajax = BackboneAjaxSave;
                }
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
                const supportsLiveSeg = (pageView.activity().isRide() ||
                                         pageView.activity().isRun()) &&
                                        (sauce.patronLevel && sauce.patronLevel >= 10);
                if (supportsLiveSeg || (sauce.options && !sauce.options['hide-upsells'])) {
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
                addButtons.call(this).catch(sauce.rpc.reportError);
                return ret;
            };
        }, {once: true});
    }
})();
