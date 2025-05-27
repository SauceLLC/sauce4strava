/* global sauce, browser */


function handleAttributionDialog() {
    const hoverDelay = 500;
    let dialogSingleton;
    let hoverTimeout;
    function makeAttrDialog(el, key) {
        const dialog = document.createElement('dialog');
        dialog.srcElement = el;
        dialog.classList.add('sauce-attr');
        sauce.adjacentNodeContents(dialog, 'beforeend', browser.i18n.getMessage(`attribution_${key}`));
        const pos = el.getBoundingClientRect();
        if (pos.x || pos.y) {
            dialog.style.setProperty('top', pos.y + pos.height + 'px');
            dialog.style.setProperty('left', pos.x + 'px');
            dialog.classList.add('anchored');
        } else {
            // Needs a note as to why/where this happens...
            console.warn("XXX: Triage this context", el);
            debugger;
        }
        dialog.addEventListener('click', ev => dialog.close());
        dialog.addEventListener('close', ev => {
            if (dialog === dialogSingleton) {
                dialogSingleton = null;
            }
            dialog.remove();
        });
        document.body.append(dialog);
        dialogSingleton = dialog;
        return dialog;
    }
    document.documentElement.addEventListener('click', ev => {
        if (dialogSingleton) {
            dialogSingleton.close();
        }
        const attr = ev.target.closest('attr[for]');
        if (!attr) {
            return;
        }
        const dialog = makeAttrDialog(attr, attr.getAttribute('for'));
        dialog.persistent = true;
        dialog.showModal();
    });
    document.documentElement.addEventListener('pointerover', ev => {
        if (hoverTimeout) {
            clearTimeout(hoverTimeout);
            hoverTimeout = null;
        }
        const attr = ev.target.closest('[attr-tooltip]');
        if (!attr) {
            if (dialogSingleton && !dialogSingleton.persistent) {
                const rect = dialogSingleton.getBoundingClientRect();
                const pad = 20;
                const x = ev.pageX - scrollX;
                const y = ev.pageY - scrollY;
                if (x < (rect.x - pad) || x > (rect.x + rect.width + pad) ||
                    y < (rect.y - pad) || y > (rect.y + rect.height + pad)) {
                    dialogSingleton.close();
                }
            }
            return;
        }
        if (dialogSingleton) {
            if (dialogSingleton.srcElement === attr) {
                return;
            }
            dialogSingleton.close();
        }
        hoverTimeout = setTimeout(() =>
            makeAttrDialog(attr, attr.getAttribute('attr-tooltip')).show(), hoverDelay);
    });
}


function setCustomFont(options) {
    const root = document.documentElement;
    let customSize;
    if (options['font-custom-family']) {
        if (+options['font-custom-size']) {
            customSize = `${options['font-custom-size']}px`;
        }
        root.style.setProperty('--sauce-font-custom-family', `'${options['font-custom-family']}'`);
        root.classList.add('sauce-font-custom-family');
    } else {
        root.classList.remove('sauce-font-custom-family');
    }
    root.classList.toggle('sauce-font-custom-size', !!customSize);
    if (customSize) {
        root.style.setProperty('--sauce-font-custom-size', customSize);
    } else {
        root.style.removeProperty('--sauce-font-custom-size');
    }
}


(function() {
    'use strict';

    const manifests = [{
        pathExcludes: [
            /^\/dashboard(\/.*|\b|$)/,
            /^\/routes\/new(\/.*|\b|$)/,
            /^\/maps\/(\/.*|\b|$)/,
            /^\/challenges(\/.*|\b|$)/,
            /^\/segments\/.+?\/local-legend\/(\/.*|\b|$)/,
            /^\/athlete\/fitness(\/.*|\b|$)/,
            /^\/athletes\/.+?\/training\/log(\/.*|\b|$)/,
            /^\/athletes\/.+?\/posts\/new(\/.*|\b|$)/,
            /^\/subscribe(\/.*|\b|$)/,
            /^\/subscription\/perks(\/.*|\b|$)/,
            /^\/login(\/.*|\b|$)/,
            /^\/register(\/.*|\b|$)/,
            /^\/legal(\/.*|\b|$)/,
            /^\/.+?\/heatmaps\/(\/.*|\b|$)/,
            /^\/$/,
        ],
        stylesheets: ['theme.css'],
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
                browser.runtime.onMessage.addListener(async msg => {
                    if (!msg) {
                        return;
                    } else if (msg.op === 'background-sw-revived') {
                        console.info("Background worker revive");
                        await sauce.proxy.ensureConnected();
                    }
                });
                sauce.storage.addListener((key, value, oldValue) => {
                    if (key === 'options' && (
                        value['font-custom-family'] !== oldValue['font-custom-family'] ||
                        value['font-custom-size'] !== oldValue['font-custom-size'])) {
                        setCustomFont(value);
                    }
                });
                setCustomFont(config.options);
                if (config.options['analysis-max-page-width']) {
                    document.documentElement.style.setProperty(
                        '--analysis-max-page-width',
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
        pathExclude: /^\/activities\/.*?\/truncate/,
        stylesheets: ['analysis.css'],
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
        name: 'Segment View',
        pathMatch: /^\/segments\/[0-9]+\/?$/,
        cssClass: 'sauce-segment-view',
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
        stylesheets: ['performance.css'],
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
        stylesheets: ['patron.css'],
        cssClass: ['sauce-patron', 'sauce-responsive'],
        scripts: [
            'src/site/patron.js',
        ],
    }, {
        name: 'Profile',
        pathMatch: /^\/(athletes|pros)\/[0-9]+\/?$/,
        stylesheets: ['profile.css'],
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
        pathExclude: /^\/($|subscribe|login|register|legal|maps)(\/.*|\b|$)/,
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
            (!m.pathMatch || location.pathname.match(m.pathMatch)) &&
            (!m.pathExclude || !location.pathname.match(m.pathExclude)) &&
            (!m.pathExcludes || !m.pathExcludes.some(re => location.pathname.match(re))));
        for (const x of matchingManifests) {
            if (x.cssClass) {
                document.documentElement.classList.add(...(typeof x.cssClass === 'string' ?
                    [x.cssClass] : x.cssClass));
            }
        }
        const manifest = browser.runtime.getManifest();
        const extUrl = browser.runtime.getURL('');
        document.documentElement.dataset.sauceBaseInitParams = JSON.stringify({
            extId: browser.runtime.id,
            extUrl,
            name: manifest.name,
            version: manifest.version,
        });
        const config = await sauce.storage.get(null);
        const options = config.options;
        self.currentUser = config.currentUser;
        sauce.proxy.ensureConnected().then(() => sauce.patron.updatePatronLevelNames());  // bg okay
        const patronVars = {};
        if ((config.patronLevelExpiration || 0) > Date.now()) {
            patronVars.patronLegacy = config.patronLegacy == null ?
                !!config.patronLevel : config.patronLegacy;
            patronVars.patronLevel = config.patronLevel || 0;
        } else {
            [patronVars.patronLevel, patronVars.patronLegacy] =
                await sauce.proxy.ensureConnected().then(() =>
                    sauce.patron.updatePatronLevel(self.currentUser));
        }
        patronVars.hideBonusFeatures = (patronVars.patronLevel || 0) < 10 && !!(options &&
            options['hide-upsells'] &&
            options['hide-sauce-bonus-features']);
        Object.assign(sauce, patronVars);
        sauce.loadScripts([`${extUrl}src/site/set_options.js`],
                          {params: JSON.stringify({options: options || {}, patronVars})});
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
                        console.error('Boot callback error:', e);
                    }
                }
            }
            if (m.scripts) {
                loading.push(sauce.loadScripts(m.scripts.map(x => extUrl + x), {defer: true})
                    .catch(console.error));
            }
            if (m.modules) {
                loading.push(sauce.loadScripts(m.modules.map(x => extUrl + x), {module: true})
                    .catch(console.error));
            }
        }
        await Promise.all(loading);
        document.documentElement.classList.add('sauce-booted');
        const ev = new Event('sauceBooted');
        document.dispatchEvent(ev);
    }

    document.addEventListener('sauceCurrentUserUpdate', async () => {
        // Handle message from the preloader which has access to more user info.
        // This works on almost every strava page thankfully.
        const id = Number(document.documentElement.dataset.sauceCurrentUser) || undefined;
        delete document.documentElement.dataset.sauceCurrentUser;
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
