/* global sauce, browser */

(async function() {
    'use strict';

    const manifests = [{
        pathExclude: /^\/($|subscribe|login|register|legal|routes\/new|.+?\/heatmaps\/|.+?\/training\/log|segments\/.+?\/local-legend)(\/.*|\b|$)/,
        stylesheets: ['site/theme.css'],
        callbacks: [
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
            }
        ]
    }, {
        callbacks: [
            config => {
                if (config.options['hide-upsells']) {
                    document.documentElement.classList.add('sauce-hide-upsells');
                }
            }
        ]
    }, {
        name: 'Analysis',
        pathMatch: /^\/activities\/.*/,
        stylesheets: ['site/analysis.css'],
        cssClass: 'sauce-analysis',
        scripts: [
            'common/proxy.js',
            'site/proxy.js',
            'site/locale.js',
            'site/storage.js',
            'site/ui.js',
            'site/template.js',
            'common/lib.js',
            'site/sync.js',
            'site/sparkline.js',
            'site/analysis.js',
        ],
    }, {
        name: 'Segment Compare',
        pathMatch: /^\/segments\/[0-9]+\/compare\b/,
        cssClass: 'sauce-segment-compare',
        scripts: [
            'common/proxy.js',
            'site/proxy.js',
            'site/segment-compare.js',
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
        name: 'Sauce Performance - Fitness',
        pathMatch: /^\/sauce\/performance\/fitness\b/,
        stylesheets: ['site/performance.css'],
        cssClass: ['sauce-performance', 'sauce-performance-fitness', 'sauce-responsive'],
        scripts: [
            'common/proxy.js',
            'site/proxy.js',
            'site/locale.js',
            'site/storage.js',
            'site/ui.js',
            'site/template.js',
            'common/lib.js',
            'site/sync.js',
            'site/chartjs/Chart.js',
            'site/chartjs/adapter-date-fns.bundle.js',
            'site/chartjs/plugin-datalabels.js',
            'site/chartjs/plugin-zoom.js',
            'site/sparkline.js',
            'site/performance.js',
        ],
    }, {
        name: 'Sauce Performance - Peaks',
        pathMatch: /^\/sauce\/performance\/peaks\b/,
        stylesheets: ['site/performance.css'],
        cssClass: ['sauce-performance', 'sauce-performance-peaks', 'sauce-responsive'],
        scripts: [
            'common/proxy.js',
            'site/proxy.js',
            'site/locale.js',
            'site/storage.js',
            'site/ui.js',
            'site/template.js',
            'common/lib.js',
            'site/sync.js',
            'site/chartjs/Chart.js',
            'site/chartjs/adapter-date-fns.bundle.js',
            'site/chartjs/plugin-datalabels.js',
            'site/chartjs/plugin-zoom.js',
            'site/sparkline.js',
            'site/performance.js',
        ],
    }, {
        name: 'Sauce Performance - Compare',
        pathMatch: /^\/sauce\/performance\/compare\b/,
        stylesheets: ['site/performance.css'],
        cssClass: ['sauce-performance', 'sauce-performance-compare', 'sauce-responsive'],
        scripts: [
            'common/proxy.js',
            'site/proxy.js',
            'site/locale.js',
            'site/storage.js',
            'site/ui.js',
            'site/template.js',
            'common/lib.js',
            'site/sync.js',
            'site/chartjs/Chart.js',
            'site/chartjs/adapter-date-fns.bundle.js',
            'site/chartjs/plugin-datalabels.js',
            'site/chartjs/plugin-zoom.js',
            'site/sparkline.js',
            'site/performance.js',
        ]
    }, {
        name: 'Sauce Patron',
        pathMatch: /^\/sauce\/patron\b/,
        stylesheets: ['site/patron.css'],
        cssClass: ['sauce-patron', 'sauce-responsive'],
        scripts: [
            'common/proxy.js',
            'site/proxy.js',
            'site/locale.js',
            'site/storage.js',
            'site/ui.js',
            'site/template.js',
            'common/lib.js',
            'site/patron.js',
        ],
    }, {
        name: 'Profile',
        pathMatch: /^\/(athletes|pros)\/[0-9]+\/?$/,
        stylesheets: ['site/profile.css'],
        cssClass: 'sauce-profile',
        scripts: [
            'common/proxy.js',
            'site/proxy.js',
            'site/locale.js',
            'site/ui.js',
            'site/template.js',
            'common/lib.js',
            'site/sync.js',
            'site/profile.js',
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
            'common/proxy.js',
            'site/proxy.js',
            'site/locale.js',
            'site/storage.js',
            'site/ui.js',
            'site/template.js',
            'common/lib.js',
            'site/dashboard.js'
        ]
    }, {
        pathExclude: /^\/($|subscribe|login|register|legal)(\/.*|\b|$)/,
        scripts: [
            'common/proxy.js',
            'site/proxy.js',
            'site/locale.js',
            'site/usermenu.js',
        ]
    }];


    function addHeadElement(script, top) {
        const rootElement = document.head || document.documentElement;
        if (top) {
            const first = rootElement.firstChild;
            if (first) {
                rootElement.insertBefore(script, first);
            } else {
                rootElement.appendChild(script);
            }
        } else {
            rootElement.appendChild(script);
        }
    }


    const _loadedScripts = new Set();
    function loadScripts(urls, options={}) {
        const loading = [];
        const frag = document.createDocumentFragment();
        for (const url of urls) {
            if (_loadedScripts.has(url)) {
                continue;
            }
            _loadedScripts.add(url);
            const script = document.createElement('script');
            if (options.defer) {
                script.defer = 'defer';
            }
            if (!options.async) {
                script.async = false;  // default is true
            }
            loading.push(new Promise((resolve, reject) => {
                script.addEventListener('load', resolve);
                script.addEventListener('error', ev => {
                    reject(new URIError(`Script load error: ${ev.target.src}`));
                });
            }));
            script.src = url;
            frag.appendChild(script);
        }
        addHeadElement(frag, options.top);
        return Promise.all(loading);
    }


    function loadStylesheet(url, options={}) {
        const link = document.createElement('link');
        link.setAttribute('rel', 'stylesheet');
        link.setAttribute('type', 'text/css');
        link.setAttribute('href', url);
        addHeadElement(link, options.top);
    }


    function insertScript(content) {
        const script = document.createElement('script');
        script.textContent = content;
        addHeadElement(script, /*top*/ true);
    }


    async function sha256(input) {
        const encoder = new TextEncoder();
        const data = encoder.encode(input);
        const hash = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hash));
        return hashArray.map(x => x.toString(16).padStart(2, '0')).join('');
    }


    async function updatePatronLevelNames() {
        const ts = await sauce.storage.get('patronLevelNamesTimestamp');
        if (!ts || ts < Date.now() - (7 * 86400 * 1000)) {
            await sauce.storage.set('patronLevelNamesTimestamp', Date.now());  // backoff regardless
            const resp = await fetch('https://saucellc.io/patron_levels.json');
            const patronLevelNames = await resp.json();
            patronLevelNames.sort((a, b) => b.level - a.level);
            await sauce.storage.set({patronLevelNames});
        }
    }


    async function updatePatronLevel(config) {
        if ((config.patronLevelExpiration || 0) > Date.now()) {
            const legacy = config.patronLegacy == null ? !!config.patronLevel : config.patronLegacy;
            return [config.patronLevel || 0, legacy];
        }
        let legacy = false;
        let level = 0;
        const errors = [];
        try {
            if (await sauce.storage.get('patreon-auth')) {
                const d = await getPatreonMembership();
                level = (d && d.patronLevel) || 0;
            }
        } catch(e) {
            errors.push(e);
        }
        try {
            if (!level && config.currentUser) {
                [level, legacy] = await getPatronLevelLegacy(config.currentUser);
            }
        } catch(e) {
            errors.push(e);
        }
        if (errors.length) {
            for (const e of errors) {
                sauce.report.error(e);
            }
            await sauce.storage.set('patronLevelExpiration', Date.now() + (12 * 3600 * 1000));  // backoff
        }
        return [level, legacy];
    }


    async function _setPatronCache(level, isLegacy) {
        await sauce.storage.set({
            patronLevel: level,
            patronLegacy: isLegacy || false,
            patronLevelExpiration: Date.now() + (level ? (7 * 86400 * 1000) : (3600 * 1000))
        });
        return [level, isLegacy];
    }


    async function getPatronLevelLegacy(athleteId) {
        const resp = await fetch('https://saucellc.io/patrons.json');
        const fullPatrons = await resp.json();
        const hash = await sha256(athleteId);
        let level = 0;
        let legacy = false;
        if (fullPatrons[hash]) {
            level = fullPatrons[hash].level;
            legacy = true;
        }
        await _setPatronCache(level, legacy);
        return [level, legacy];
    }


    async function getPatreonMembership(options={}) {
        const auth = await sauce.storage.get('patreon-auth');
        if (auth) {
            const q = options.detailed ? 'detailed=1' : '';
            const r = await fetch(`https://api.saucellc.io/patreon/membership?${q}`, {
                headers: {Authorization: `${auth.id} ${auth.secret}`}
            });
            if (!r.ok) {
                if ([401, 403].includes(r.status)) {
                    await sauce.storage.set('patreon-auth', null);
                }
                if (r.status !== 404) {
                    sauce.report.error(new Error('Failed to get patreon membership: ' + r.status));
                }
            } else {
                const data = await r.json();
                await _setPatronCache((data && data.patronLevel) || 0, false);
                return data;
            }
        }
    }
    sauce.proxy.export(getPatreonMembership);


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
        const ext = browser.runtime.getManifest();
        const extUrl = browser.runtime.getURL('');
        const sauceVars = {
            extUrl,
            extId: browser.runtime.id,
            name: ext.name,
            version: ext.version,
        };
        insertScript([
            self.sauceBaseInit.toString(),
            self.saucePreloaderInit.toString(),
            `sauceBaseInit();`,
            `saucePreloaderInit(${JSON.stringify(sauceVars)});`,
        ].join('\n'));
        const config = await sauce.storage.get(null);
        self.currentUser = config.currentUser;
        updatePatronLevelNames().catch(sauce.report.error);  // bg okay
        [sauceVars.patronLevel, sauceVars.patronLegacy] = await updatePatronLevel(config);
        insertScript(`
            self.sauce = self.sauce || {};
            sauce.options = ${JSON.stringify(config.options)};
            Object.assign(sauce, ${JSON.stringify(sauceVars)});
        `);
        for (const m of matchingManifests) {
            if (m.name) {
                console.info(`Sauce loading: ${m.name}`);
            }
            if (m.stylesheets) {
                for (const url of m.stylesheets) {
                    loadStylesheet(`${extUrl}css/${url}`);
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
                await loadScripts(m.scripts.map(x => `${extUrl}src/${x}`));
            }
        }
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
