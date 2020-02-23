/* global sauce, jQuery */

(function() {
    'use strict';

    self.sauce = self.sauce || {};


    sauce.propDefined = function(propertyAccessor, callback, options) {
        options = options || {};
        return new Promise(resolve => {
            function catchDefine(obj, props) {
                function onSet(value) {
                    if (props.length > 1) {
                        if (Object.isExtensible(value)) {
                            catchDefine(value, props.slice(1));
                        }
                    } else {
                        if (callback) {
                            callback(value);
                        }
                        resolve(value);
                    }
                }
                const prop = props[0];
                const existing = Object.getOwnPropertyDescriptor(obj, prop);
                if (existing && existing.set && existing.set.listeners) {
                    existing.set.listeners.push(onSet);
                    console.assert(existing.set.listeners.length < 1000);
                } else {
                    let internalValue = existing ? existing.value : undefined;
                    const set = function(value) {
                        if (Object.is(internalValue, value)) {
                            return;
                        }
                        internalValue = value;
                        for (const fn of set.listeners) {
                            fn(value);
                        }
                    };
                    set.listeners = [onSet];
                    Object.defineProperty(obj, prop, {
                        enumerable: true,
                        get: () => internalValue,
                        set
                    });
                    if (existing) {
                        for (const fn of set.listeners) {
                            fn(internalValue);
                        }
                    }
                }
            }
            catchDefine(options.root || self, propertyAccessor.split('.'));
        });
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
        });

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
        let _SegmentEffortsTableView;
        sauce.propDefined('Strava.Labs.Activities.SegmentEffortsTableView', View => {
            // Our reassignment will cause a recursive loop without a short circuit.
            if (!_SegmentEffortsTableView) {
                _SegmentEffortsTableView = function(_, options) {
                    const activity = options.context.chartContext.activity().clone();
                    if (activity.isRun() && sauce.options && sauce.options['analysis-detailed-run-segments']) {
                        activity.set('type', 'Ride');
                        options.context.chartContext.activity(activity);
                    }
                    View.prototype.constructor.apply(this, arguments);
                };
                _SegmentEffortsTableView.prototype = View.prototype;
                self.Strava.Labs.Activities.SegmentEffortsTableView = _SegmentEffortsTableView;
            }
        });

        sauce.propDefined('Strava.Labs.Activities.SegmentsView', View => {
            const initSave = View.prototype.initialize;
            View.prototype.initialize = function(pageView) {
                if (pageView.isRun() && sauce.options && sauce.options['analysis-detailed-run-segments']) {
                    pageView = Object.create(pageView);
                    pageView.activity(pageView.activity().clone());
                    pageView.activity().set('type', 'Ride');
                }
                return initSave.call(this, pageView);
            };

            const renderSave = View.prototype.render;
            View.prototype.render = function() {
                renderSave.apply(this, arguments);
                if (self.pageView.isRun() && this.pageView.isRide() && sauce.options &&
                    sauce.options['analysis-detailed-run-segments']) {
                    this.$el.prepend(`<div id="map-canvas" class="leaflet-container leaflet-retina
                                                                  leaflet-fade-anim leaflet-touch"></div>`);
                }
                return this;
            };
        });

        // Provide race-free detection of pending requests.
        sauce.propDefined('Strava.Labs.Activities.StreamsRequest', Model => {
            const requireSave = Model.prototype.require;
            Model.prototype.require = function() {
                if (!this.pending) {
                    this.pending = new Promise(resolve => {
                        this.deferred.always(() => {
                            this.pending = false;
                            resolve();
                        });
                    });
                }
                return requireSave.apply(this, arguments);
            };
        });
    }
})();
