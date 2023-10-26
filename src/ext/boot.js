/* global sauce, browser */


let _attrDialog;
function handleAttributionDialog() {
    document.documentElement.addEventListener('click', ev => {
        const attr = ev.target.closest('attr[for]');
        if (!attr) {
            return;
        }
        if (_attrDialog) {
            _attrDialog.close();
        } else {
            const dialog = document.createElement('dialog');
            dialog.classList.add('sauce-attr');
            sauce.adjacentNodeContents(dialog, 'beforeend',
                browser.i18n.getMessage(`attribution_${attr.getAttribute('for')}`));
            const pos = attr.getBoundingClientRect(attr);
            if (pos.left || pos.top) {
                dialog.style.setProperty('top', pos.top + pos.height + 'px');
                dialog.style.setProperty('left', pos.left + 'px');
                dialog.classList.add('anchored');
            }
            dialog.addEventListener('click', ev => dialog.close());
            dialog.addEventListener('close', ev => {
                if (dialog === _attrDialog) {
                    _attrDialog = null;
                    dialog.remove();
                }
            });
            _attrDialog = dialog;
            document.body.append(dialog);
            dialog.showModal();
        }
    });
}


(async function() {
    'use strict';

    const manifests = [{
        pathExclude: /^\/($|subscribe|login|register|legal|dashboard|routes\/new|.+?\/heatmaps\/|.+?\/training\/log|segments\/.+?\/local-legend)(\/.*|\b|$)/,
        stylesheets: ['site/theme.css'],
        callbacks: [
            handleAttributionDialog,
            config => {
                let theme = config.options.theme;
                if (theme === 'system') {
                    theme = (matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : null;
                }
                if (theme) {
                    document.documentElement.classList.add(
                        'sauce-theme-enabled',
                        `sauce-theme-${theme}`);
                }
                const root = document.documentElement;
                browser.runtime.onMessage.addListener(msg => {
                    if (msg && msg.op === 'options-change') {
                        if (msg.key === 'font-custom-family') {
                            root.classList.toggle('sauce-font-custom-family', !!msg.value);
                            if (msg.value) {
                                root.style.setProperty('--sauce-font-custom-family', `'${msg.value}'`);
                                if (config.options['font-custom-size']) {
                                    root.classList.add('sauce-font-custom-size');
                                }
                            } else {
                                root.classList.remove('sauce-font-custom-size');
                            }
                        } else if (msg.key === 'font-custom-size') {
                            root.classList.toggle('sauce-font-custom-size', !!msg.value);
                            if (msg.value) {
                                root.style.setProperty('--sauce-font-custom-size', `${msg.value}px`);
                            }
                        }
                    }
                });
                if (config.options['font-custom-family']) {
                    if (config.options['font-custom-size']) {
                        root.style.setProperty('--sauce-font-custom-size',
                            `${config.options['font-custom-size']}px`);
                        root.classList.add('sauce-font-custom-size');
                    }
                    root.style.setProperty('--sauce-font-custom-family',
                        `'${config.options['font-custom-family']}'`);
                    root.classList.add('sauce-font-custom-family');
                }
                if (config.options['analysis-max-page-width']) {
                    root.style.setProperty('--analysis-max-page-width',
                        `${config.options['analysis-max-page-width']}px`);
                }
            }
        ]
    }, {
        callbacks: [
            config => {
                if (config.options['hide-upsells']) {
                    document.documentElement.classList.add('sauce-hide-upsells');
                }
                if (sauce.hideBonusFeatures) {
                    document.documentElement.classList.add('sauce-sauce-bonus-features');
                }
            }
        ]
    }, {
        name: 'Analysis',
        pathMatch: /^\/activities\/.*/,
        stylesheets: ['site/analysis.css'],
        cssClass: 'sauce-analysis',
        scripts: [
            'src/common/proxy.js',
            'src/site/proxy.js',
            'src/site/locale.js',
            'src/site/storage.js',
            'src/site/ui.js',
            'src/site/template.js',
            'src/common/lib.js',
            'src/site/sync.js',
            'src/site/sparkline.js',
            'src/site/analysis.js',
        ],
    }, {
        name: 'Segment Compare',
        pathMatch: /^\/segments\/[0-9]+\/compare\b/,
        cssClass: 'sauce-segment-compare',
        scripts: [
            'src/common/proxy.js',
            'src/site/proxy.js',
            'src/site/segment-compare.js',
        ],
    }, {
        name: 'Route Builder',
        pathMatch: /^\/routes\/new\b/,
        cssClass: 'sauce-route-builder',
    }, {
        name: 'Sauce Performance - Legacy Redirect',
        pathMatch: /^\/sauce\/performance(\/)?$/,
        callbacks: [() => window.location.assign('/sauce/performance/fitness')]
    }, {
        name: 'Sauce Libs',
        pathMatch: /^\/sauce\/.+/,
        cssClass: ['sauce-responsive'],
        scripts: [
            'src/common/proxy.js',
            'src/site/proxy.js',
            'src/site/locale.js',
            'src/site/storage.js',
            'src/site/ui.js',
            'src/site/template.js',
            'src/common/lib.js',
        ]
    }, {
        name: 'Sauce Performance - Common',
        pathMatch: /^\/sauce\/performance\/.+/,
        stylesheets: ['site/performance.css'],
        cssClass: ['sauce-performance'],
        scripts: [
            'src/site/sync.js',
            'src/site/chartjs/Chart.js',
            'src/site/chartjs/adapter-date-fns.bundle.js',
            'src/site/chartjs/plugin-datalabels.js',
            'src/site/chartjs/plugin-zoom.js',
            'src/site/sparkline.js',
        ],
    }, {
        name: 'Sauce Performance - Fitness',
        pathMatch: /^\/sauce\/performance\/fitness\b/,
        cssClass: ['sauce-performance-fitness'],
        modules: [
            'src/site/performance/loader.mjs?module=fitness',
        ],
    }, {
        name: 'Sauce Performance - Peaks',
        pathMatch: /^\/sauce\/performance\/peaks\b/,
        cssClass: ['sauce-performance-peaks'],
        modules: [
            'src/site/performance/loader.mjs?module=peaks',
        ],
    }, {
        name: 'Sauce Performance - Activity Compare',
        pathMatch: /^\/sauce\/performance\/compare\b/,
        cssClass: ['sauce-performance-compare'],
        modules: [
            'src/site/performance/loader.mjs?module=compare',
        ],
    }, {
        name: 'Sauce Patron',
        pathMatch: /^\/sauce\/patron\b/,
        stylesheets: ['site/patron.css'],
        cssClass: ['sauce-patron', 'sauce-responsive'],
        scripts: [
            'src/site/patron.js',
        ],
    }, {
        name: 'Profile',
        pathMatch: /^\/(athletes|pros)\/[0-9]+\/?$/,
        stylesheets: ['site/profile.css'],
        cssClass: 'sauce-profile',
        scripts: [
            'src/common/proxy.js',
            'src/site/proxy.js',
            'src/site/locale.js',
            'src/site/ui.js',
            'src/site/template.js',
            'src/common/lib.js',
            'src/site/sync.js',
            'src/site/profile.js',
        ],
    }, {
        callbacks: [
            config => {
                if (!config.options.responsive) {
                    return;
                }
                document.documentElement.classList.add('sauce-responsive');
                function attachViewportMeta() {
                    if (document.querySelector('head meta[name="viewport"]')) {
                        return;
                    }
                    const viewport = document.createElement('meta');
                    viewport.setAttribute('name', 'viewport');
                    viewport.setAttribute('content', Object.entries({
                        'width': 'device-width',
                        'initial-scale': '1.0',
                        'maximum-scale': '1.0',
                        'user-scalable': 'no'
                    }).map(([k, v]) => `${k}=${v}`).join(', '));
                    const charset = document.querySelector('head meta[charset]');
                    if (charset) {
                        charset.insertAdjacentElement('afterend', viewport);
                    } else {
                        document.head.insertAdjacentElement('afterbegin', viewport);
                    }
                }
                if (document.head) {
                    attachViewportMeta();
                } else {
                    // XXX Mutation observer would be better.
                    addEventListener('DOMContentLoaded', attachViewportMeta, {capture: true});
                }
            }
        ]
    }, {
        name: 'Dashboard',
        pathMatch: /^\/dashboard(\/.*|\b)/,
        stylesheets: ['site/dashboard.css'],
        scripts: [
            'src/common/proxy.js',
            'src/site/proxy.js',
            'src/site/locale.js',
            'src/site/storage.js',
            'src/site/ui.js',
            'src/site/template.js',
            'src/common/lib.js',
            'src/site/dashboard.js'
        ]
    }, {
        pathExclude: /^\/($|subscribe|login|register|legal)(\/.*|\b|$)/,
        scripts: [
            'src/common/proxy.js',
            'src/site/proxy.js',
            'src/site/locale.js',
            'src/site/usermenu.js',
        ]
    }];


    async function bgCommand(op, data) {
        return await browser.runtime.sendMessage(Object.assign({
            source: 'ext/boot',
            op
        }, data));
    }


    function setBackgroundPageCurrentUser(currentUser) {
        return bgCommand('setCurrentUser', {currentUser});
    }
    sauce.proxy.export(setBackgroundPageCurrentUser);


    // We can quickly download blob URLs made by the background page, but only in this
    // context.  Downloading them in the background page works for Chromium only, but
    // this works on everything.
    async function downloadExtBlobURL(url, name) {
        const resp = await fetch(url);
        const data = await resp.arrayBuffer();
        const blob = new Blob([data]);
        const link = document.createElement('a');
        link.download = name;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.href = URL.createObjectURL(blob);
        try {
            link.click();
        } finally {
            URL.revokeObjectURL(link.href);
            link.remove();
        }
    }
    sauce.proxy.export(downloadExtBlobURL);


    async function load() {
        /* Using the src works but is async, this will block the page from loading while the scripts
         * are evaluated and executed, preventing race conditions in our preloader */
        if (document.documentElement.classList.contains('sauce-enabled')) {
            throw new Error("Multiple Sauce extensions active");
        }
        document.documentElement.classList.add('sauce-enabled');  // legacy
        const matchingManifests = manifests.filter(m =>
            !((m.pathMatch && !location.pathname.match(m.pathMatch)) ||
              (m.pathExclude && location.pathname.match(m.pathExclude))));
        for (const x of matchingManifests) {
            if (x.cssClass) {
                document.documentElement.classList.add(...(typeof x.cssClass === 'string' ?
                    [x.cssClass] : x.cssClass));
            }
        }
        const manifest = browser.runtime.getManifest();
        const extUrl = browser.runtime.getURL('');
        sauce.insertScript([
            self.sauceBaseInit.toString(),
            self.saucePreloaderInit.toString(),
            `sauceBaseInit('${browser.runtime.id}', '${extUrl}', ${JSON.stringify(manifest)});`,
            `saucePreloaderInit();`,
        ].join('\n'));
        const config = await sauce.storage.get(null);
        const options = config.options;
        self.currentUser = config.currentUser;
        sauce.proxy.connected.then(() =>
            sauce.patron.updatePatronLevelNames().catch(sauce.report.error));  // bg okay
        const patronVars = {};
        if ((config.patronLevelExpiration || 0) > Date.now()) {
            patronVars.patronLegacy = config.patronLegacy == null ?
                !!config.patronLevel : config.patronLegacy;
            patronVars.patronLevel = config.patronLevel || 0;
        } else {
            [patronVars.patronLevel, patronVars.patronLegacy] =
                await sauce.proxy.connected.then(() =>
                    sauce.patron.updatePatronLevel(self.currentUser));
        }
        patronVars.hideBonusFeatures = (patronVars.patronLevel || 0) < 10 && !!(options &&
            options['hide-upsells'] &&
            options['hide-sauce-bonus-features']);
        Object.assign(sauce, patronVars);
        sauce.insertScript(`
            self.sauce = self.sauce || {};
            sauce.options = ${JSON.stringify(options || {})};
            Object.assign(sauce, ${JSON.stringify(patronVars)});
        `);
        const loading = [];
        for (const m of matchingManifests) {
            if (m.name) {
                console.info(`Sauce loading: ${m.name}`);
            }
            if (m.stylesheets) {
                for (const url of m.stylesheets) {
                    sauce.loadStylesheet(`${extUrl}css/${url}`);
                }
            }
            if (m.callbacks) {
                for (const cb of m.callbacks) {
                    try {
                        const r = cb(config);
                        if (r instanceof Promise) {
                            await r;
                        }
                    } catch(e) {
                        sauce.report.error(e);
                    }
                }
            }
            if (m.scripts) {
                loading.push(sauce.loadScripts(m.scripts.map(x => extUrl + x), {defer: true})
                    .catch(sauce.report.error));
            }
            if (m.modules) {
                loading.push(sauce.loadScripts(m.modules.map(x => extUrl + x), {module: true})
                    .catch(sauce.report.error));
            }
        }
        await Promise.all(loading);
        document.documentElement.classList.add('sauce-booted');
        const ev = new Event('sauceBooted');
        document.dispatchEvent(ev);
    }

    document.documentElement.addEventListener('sauceCurrentUserUpdate', async ev => {
        // Handle message from the preloader which has access to more user info.
        // This works on almost every strava page thankfully.
        const id = Number(ev.currentTarget.dataset.sauceCurrentUser) || undefined;
        delete ev.currentTarget.dataset.sauceCurrentUser;
        if (id !== self.currentUser) {
            if (!id) {
                console.debug("Detected user logout");
            } else {
                console.debug("Detected new current user:", id);
            }
            self.currentUser = id;
            await sauce.storage.set('currentUser', id);
        }
        setBackgroundPageCurrentUser(self.currentUser);
    });

    load();
})();
