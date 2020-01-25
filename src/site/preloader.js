/* global sauce */

(async function() {
    'use strict';

    self.sauce = self.sauce || {};


    sauce.propDefined = function(propertyAccessor, callback, root) {
        return new Promise(resolve => {
            let done;
            let run;
            let jobs;
            function *runner() {
                let val;
                while (jobs.length) {
                    const job = jobs.shift();
                    job();
                    val = yield;
                }
                done = true;
                resolve(val);
                if (callback) {
                    callback(val);
                }
            }
            const props = propertyAccessor.split('.');
            let objRef = root || self;

            function walkProps() {
                while (props.length && Object.prototype.hasOwnProperty.call(objRef, props[0])) {
                    const desc = Object.getOwnPropertyDescriptor(objRef, props[0]);
                    if (desc && desc.set &&
                        (!desc.set.hasValue ||
                         (props.length > 1 && !Object.isExtensible(objRef[props[0]])))) {
                        break;
                    }
                    objRef = objRef[props.shift()];
                }
                return objRef;
            }
                
            function catchDefine(obj, prop) {
                function onSet(value) {
                    if (done) {
                        return;
                    }
                    const lastObj = objRef;
                    const nextObj = walkProps();
                    if (!Object.is(nextObj, lastObj)) {
                        if (props.length) {
                            jobs.push(() => catchDefine(nextObj, props[0]));
                        }
                        run.next(nextObj);
                    }
                }
                const existing = Object.getOwnPropertyDescriptor(obj, prop);
                if (existing) {
                    existing.set.listeners.push(onSet);
                } else {
                    let internalValue;
                    const set = function(value) {
                        internalValue = value;
                        set.hasValue = true;
                        for (const x of set.listeners) {
                            x.call(this, value);
                        }
                    };
                    set.listeners = [onSet];
                    set.isExtensible = false;
                    Object.defineProperty(obj, prop, {
                        enumerable: true,
                        get: () => internalValue,
                        set
                    });
                }
            }

            const firstObj = walkProps();
            if (!props.length) {
                resolve(firstObj);
                if (callback) {
                    callback(firstObj);
                }
            } else {
                run = runner();
                jobs = [() => catchDefine(firstObj, props[0])];
                run.next();
            }
        });
    };


    if (!sauce.testing) {
        sauce.propDefined('pageView', view => {
            const addCustomRoutes = view.addCustomRoutes;
            view.addCustomRoutes = menuRouter => {
                addCustomRoutes.call(view, menuRouter);
                // Fix for reload hang on /analysis page
                if (!('route:analysis' in menuRouter._events)) {
                    //const pageNav = document.querySelector('ul#pagenav');
                    // Add an analysis link to the nav if not there already.
                    //if (!pageNav.querySelector('[data-menu="analysis"]')) {
                    //    const analysisLink = document.createElement('li');
                    //    const id = view.activity().id;
                    //    analysisLink.innerHTML = `<a data-menu="analysis" href="/activities/${id}/analysis">Analysis S</a>`;
                    //    pageNav.appendChild(analysisLink);
                    //}
                    menuRouter.addRoute('/analysis', 'analysis');
                    menuRouter.on('route:analysis', () => {
                        view.handleAnalysisClicked();
                    });
                }
            };
        });

        sauce.propDefined('Strava.Charts.Activities.BasicAnalysisElevation', Klass => {
            // Monkey patch analysis views so we can react to selection changes.
            const saveFn = Klass.prototype.displayDetails;
            Klass.prototype.displayDetails = function(start, end) {
                if (sauce.analysis) {
                    sauce.analysis.schedUpdateAnalysisStats(
                        start === undefined ? start : Number(start),
                        end === undefined ? end : Number(end));
                }
                return saveFn.apply(this, arguments);
            };
        });

        sauce.propDefined('Strava.Charts.Activities.LabelBox', Klass => {
            // This is called when zoom selections change or are unset in the profile graph.
            const saveFn = Klass.prototype.handleStreamHover;
            Klass.prototype.handleStreamHover = function(_, start, end) {
                if (sauce.analysis) {
                    sauce.analysis.schedUpdateAnalysisStats(
                        start === undefined ? start : Number(start),
                        end === undefined ? end : Number(end));
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
                    sauce.analysis.attachAnalysisStats($el.find('.chart'));
                }
                return $el;
            };
        });
    }
})();
