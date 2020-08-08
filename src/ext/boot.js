/* global sauce, browser */

(async function() {
    'use strict';

    const manifests = [{
        name: 'Analysis',
        pathMatch: /^\/activities\/.*/,
        stylesheets: ['site/analysis.css'],
        scripts: [
            'site/rpc.js',
            'site/locale.js',
            'common/template.js',
            'site/sparkline.js',
            'site/lib.js',
            'site/export.js',
            'site/analysis.js',
        ],
        callbacks: [
            config => void document.documentElement.classList.add('sauce-analysis')
        ]
    }, {
        name: 'Segment Compare',
        pathMatch: /^\/segments\/[0-9]+\/compare\b/,
        scripts: [
            'site/rpc.js',
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
        pathExclude: /^\/($|subscribe|login|register|legal)(\/.*|\b|$)/,
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
            'site/rpc.js',
            'site/locale.js',
            'common/template.js',
            'site/lib.js',
            'site/dashboard.js'
        ]
    }, {
        pathExclude: /^\/($|subscribe|login|register|legal|challenges)(\/.*|\b|$)/,
        scripts: [
            'site/rpc.js',
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
    function loadScripts(urls, options) {
        const loading = [];
        const frag = document.createDocumentFragment();
        for (const url of urls) {
            if (_loadedScripts.has(url)) {
                continue;
            }
            _loadedScripts.add(url);
            options = options || {};
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


    function loadScript(url, options) {
        return loadScripts([url], options);
    }


    function loadStylesheet(url, options) {
        options = options || {};
        const link = document.createElement('link');
        link.setAttribute('rel', 'stylesheet');
        link.setAttribute('type', 'text/css');
        link.setAttribute('href', url);
        addHeadElement(link, options.top);
    }


    function insertScript(content) {
        const script = document.createElement('script');
        script.textContent = content;
        addHeadElement(script, true);
    }


    async function load() {
        const extUrl = browser.extension.getURL('');
        await loadScripts([
            `${extUrl}src/site/base.js`,
            `${extUrl}src/site/preloader.js`
        ], {top: true});
        const config = await sauce.storage.get(null);
        if (config.enabled === false) {
            document.documentElement.classList.add('sauce-disabled');
            console.info("Sauce is disabled");
            return;
        }
        document.documentElement.classList.add('sauce-enabled');
        const ext = browser.runtime.getManifest();
        let patronLevel;
        let patronLevelName;
        try {
            const p = sauce.patron.getLevel();
            patronLevel = (p instanceof Promise) ? await p : p;
            if (patronLevel) {
                const n = sauce.patron.getLevelName(patronLevel);
                patronLevelName = (n instanceof Promise) ? await n : n;
            }
        } catch(e) {
            patronLevel = 0;
        }
        insertScript(`
            self.sauce = self.sauce || {};
            sauce.options = ${JSON.stringify(config.options)};
            sauce.extUrl = "${extUrl}";
            sauce.extId = "${browser.runtime.id}";
            sauce.name = "${ext.name}";
            sauce.version = "${ext.version}";
            sauce.patronLevel = ${patronLevel};
            sauce.patronLevelName = "${patronLevelName || ''}";
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
                for (const url of m.scripts) {
                    loadScript(`${extUrl}src/${url}`, {});
                }
            }
        }
    }

    load();
})();
