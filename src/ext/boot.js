/* global sauce, browser */

(async function() {
    'use strict';

    const manifests = [{
        name: 'Analysis',
        pathMatch: /^\/activities\/.*/,
        stylesheets: ['site/analysis.css'],
        scripts: [
            'site/proxy.js',
            'site/locale.js',
            'site/template.js',
            'common/lib.js',
            'site/sync.js',
            'site/sparkline.js',
            'site/analysis.js',
        ],
        callbacks: [
            config => void document.documentElement.classList.add('sauce-analysis')
        ]
    }, {
        name: 'Segment Compare',
        pathMatch: /^\/segments\/[0-9]+\/compare\b/,
        scripts: [
            'site/proxy.js',
            'site/segment-compare.js',
        ],
        callbacks: [
            config => void document.documentElement.classList.add('sauce-segment-compare')
        ]
    }, {
        name: 'Route Builder',
        pathMatch: /^\/routes\/new\b/,
        callbacks: [
            config => void document.documentElement.classList.add('sauce-route-builder')
        ]
    }, {
        name: 'Sauce Performance',
        pathMatch: /^\/sauce\/performance\b/,
        stylesheets: ['site/performance.css'],
        scripts: [
            'site/proxy.js',
            'site/locale.js',
            'site/template.js',
            'common/lib.js',
            'site/sync.js',
            'site/chart.js',
            'site/chartjs/plugin-datalabels.js',
            'site/chartjs/chart-matrix.js',
            'site/sparkline.js',
            'site/performance.js',
        ],
        callbacks: [
            config => void document.documentElement.classList.add('sauce-performance', 'sauce-responsive')
        ]
    }, {
        name: 'Profile',
        pathMatch: /^\/(athletes|pros)\/[0-9]+\/?$/,
        stylesheets: ['site/profile.css'],
        scripts: [
            'site/proxy.js',
            'site/locale.js',
            'site/template.js',
            'common/lib.js',
            'site/sync.js',
            'site/profile.js',
        ],
        callbacks: [
            config => void document.documentElement.classList.add('sauce-profile')
        ]
    }, {
        stylesheets: ['site/responsive.css'],
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
                    addEventListener('DOMContentLoaded', attachViewportMeta, {capture: true});
                }
            }
        ]
    }, {
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
        name: 'Dashboard',
        pathMatch: /^\/dashboard(\/.*|\b)/,
        scripts: [
            'site/proxy.js',
            'site/locale.js',
            'site/template.js',
            'common/lib.js',
            'site/dashboard.js'
        ]
    }, {
        pathExclude: /^\/($|subscribe|login|register|legal|challenges)(\/.*|\b|$)/,
        scripts: [
            'site/proxy.js',
            'site/locale.js',
            'site/usermenu.js',
        ]
    }, {
        callbacks: [
            config => {
                if (config.options['hide-upsells']) {
                    document.documentElement.classList.add('sauce-hide-upsells');
                }
            }
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


    function isSafari() {
        return browser.runtime.getURL('').startsWith('safari-web-extension:');
    }


    async function getBuildInfo() {
        const extUrl = browser.runtime.getURL('');
        const resp = await fetch(extUrl + 'build.json');
        return await resp.json();
    }


    async function checkForSafariUpdates() {
        const buildInfo = await getBuildInfo();
        const resp = await fetch('https://saucellc.io/builds/safari/LATEST.json');
        const latestVersion = await resp.json();
        if (latestVersion.commit !== buildInfo.git_commit) {
            // We'll do the UI work elsewhere, we've simply found a new update, so place the info
            // in general storage with other places like the analysis code can use it.
            await sauce.storage.set('safariLatestVersion', latestVersion);
        }
    }


    async function sha256(input) {
        const encoder = new TextEncoder();
        const data = encoder.encode(input);
        const hash = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hash));
        return hashArray.map(x => x.toString(16).padStart(2, '0')).join('');
    }


    async function refreshPatronLevel(athleteId) {
        const resp = await fetch('https://saucellc.io/patrons.json');
        const fullPatrons = await resp.json();
        const hash = await sha256(athleteId);
        let patronLevel = 0;
        if (fullPatrons[hash]) {
            const ts = await sauce.storage.get('patronLevelNamesTimestamp');
            if (!ts || ts < Date.now() - (7 * 86400 * 1000)) {
                const resp2 = await fetch('https://saucellc.io/patron_levels.json');
                const patronLevelNames = await resp2.json();
                patronLevelNames.sort((a, b) => b.level - a.level);
                const patronLevelNamesTimestamp = Date.now();
                await sauce.storage.set({patronLevelNames, patronLevelNamesTimestamp});
            }
            patronLevel = fullPatrons[hash].level || 0;
        }
        const patronLevelExpiration = Date.now() + (patronLevel ? (7 * 86400 * 1000) : (3600 * 1000));
        await sauce.storage.set({patronLevel, patronLevelExpiration});
        return patronLevel;
    }


    async function bgCommand(op, data) {
        return await browser.runtime.sendMessage(Object.assign({
            source: 'ext/boot',
            op
        }, data));
    }


    function setEnabled() {
        return bgCommand('setEnabled');
    }
    sauce.proxy.export(setEnabled);


    function setDisabled() {
        return bgCommand('setDisabled');
    }
    sauce.proxy.export(setDisabled);


    function setBackgroundPageCurrentUser(currentUser) {
        return bgCommand('setCurrentUser', {currentUser});
    }
    sauce.proxy.export(setBackgroundPageCurrentUser);


    async function load() {
        /* Using the src works but is async, this will block the page from loading while the scripts
         * are evaluated and executed, preventing race conditions in our preloader */
        insertScript([
            self.sauceBaseInit.toString(),
            self.saucePreloaderInit.toString(),
            'sauceBaseInit();',
            'saucePreloaderInit();',
        ].join('\n'));
        const config = await sauce.storage.get(null);
        if (config.enabled === false) {
            console.info("Sauce is disabled");
            document.documentElement.classList.add('sauce-disabled');
            setDisabled();
            return;
        }
        document.documentElement.classList.add('sauce-enabled');
        self.currentUser = config.currentUser;
        let patronLevel;
        if (!config.patronLevelExpiration || config.patronLevelExpiration < Date.now()) {
            try {
                patronLevel = await refreshPatronLevel(self.currentUser);
            } catch(e) {
                console.error('Failed to refresh patron level:', e);
                // Fallback to stale value;  Might just be infra issue...
                patronLevel = config.patronLevel || 0;
            }
        } else {
            patronLevel = config.patronLevel || 0;
        }
        const ext = browser.runtime.getManifest();
        const extUrl = browser.runtime.getURL('');
        insertScript(`
            self.sauce = self.sauce || {};
            sauce.options = ${JSON.stringify(config.options)};
            sauce.extUrl = "${extUrl}";
            sauce.extId = "${browser.runtime.id}";
            sauce.name = "${ext.name}";
            sauce.version = "${ext.version}";
            sauce.patronLevel = ${patronLevel};
        `);
        for (const m of manifests) {
            if ((m.pathMatch && !location.pathname.match(m.pathMatch)) ||
                (m.pathExclude && location.pathname.match(m.pathExclude))) {
                continue;
            }
            if (m.name) {
                console.info(`Sauce loading: ${m.name}`);
            }
            if (m.callbacks) {
                for (const cb of m.callbacks) {
                    cb(config);
                }
            }
            if (m.stylesheets) {
                for (const url of m.stylesheets) {
                    loadStylesheet(`${extUrl}css/${url}`);
                }
            }
            if (m.scripts) {
                await loadScripts(m.scripts.map(x => `${extUrl}src/${x}`));
            }
        }
        setEnabled();
        if (isSafari()) {
            const lastCheck = config.lastSafariUpdateCheck || 0;
            const lastVersion = config.lastSafariVersion || ext.version;
            if (lastCheck < Date.now() - 86400 * 1000 || lastVersion !== ext.version) {
                await sauce.storage.set('lastSafariUpdateCheck', Date.now());
                await sauce.storage.set('lastSafariVersion', ext.version);
                await checkForSafariUpdates();
            }
        }
    }

    document.documentElement.addEventListener('sauceCurrentUserUpdate', async ev => {
        // Handle message from the preloader which has access to more user info.
        // This works on almost every strava page thankfully.
        const id = Number(ev.currentTarget.dataset.sauceCurrentUser) || undefined;
        delete ev.currentTarget.dataset.sauceCurrentUser;
        if (id !== self.currentUser) {
            if (!id) {
                console.info("Detected user logout");
            } else {
                console.info("Detected new current user:", id);
            }
            self.currentUser = id;
            await sauce.storage.set('currentUser', id);
        }
        setBackgroundPageCurrentUser(self.currentUser);
    });

    load();
})();
