(async function() {
    'use strict';

    const ns = (self.sauce = self.sauce || {});

    ns.propDefined = function(propertyAccessor, callback, root) {
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
                while (props.length && props[0] in objRef) {
                    objRef = objRef[props.shift()];
                }
                return objRef;
            }
                
            function catchDefine(obj, prop) {
                let _value;
                Object.defineProperty(obj, prop, {
                    get: () => _value,
                    set: value => {
                        _value = value;
                        if (!done) {
                            const nextObj = walkProps();
                            if (props.length) {
                                jobs.push(() => catchDefine(nextObj, props[0]));
                            }
                            run.next(nextObj);
                        }
                    }
                });
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


    ns.propDefined('pageView', view => {
        const addCustomRoutes = view.addCustomRoutes;
        view.addCustomRoutes = menuRouter => {
            addCustomRoutes.call(view, menuRouter);
            // Fix for reload hang on /analysis page
            if (!('route:analysis' in menuRouter._events)) {
                const pageNav = document.querySelector('ul#pagenav');
                // Add an analysis link to the nav if not there already.
                if (!pageNav.querySelector('[data-menu="analysis"]')) {
                    const analysisLink = document.createElement('li');
                    const id = view.activity().id;
                    analysisLink.innerHTML = `<a data-menu="analysis" href="/activities/${id}/analysis">Analysis S</a>`;
                    pageNav.appendChild(analysisLink);
                }
                menuRouter.addRoute('/analysis', 'analysis');
                menuRouter.on('route:analysis', () => {
                    view.handleAnalysisClicked();
                });
            }
        };
    });
})();
