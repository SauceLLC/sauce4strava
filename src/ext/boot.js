/* global sauce, browser */

(async function() {
    'use strict';

    const manifests = [{
        name: 'Analysis',
        pathMatch: /^\/activities\/.*/,
        pathExclude: /^\/activities\/.*?\/edit/,
        stylesheets: [
            'site/analysis.css',
            'site/mobile.css',
        ],
        scripts: [
            'site/base.js',
            'site/rpc.js',
            'site/locale.js',
            'common/template.js',
            'site/sparkline.js',
            'site/lib.js',
            'site/export.js',
            'site/analysis.js',
        ],
        callbacks: [() => {
            function attachViewportMeta() {
                const viewport = document.createElement('meta');
                viewport.setAttribute('name', 'viewport');
                viewport.setAttribute('content', Object.entries({
                    'width': 'device-width',
                    'initial-scale': '1.0',
                    'maximum-scale': '1.0',
                    'user-scalable': 'no'
                }).map(([k, v]) => `${k}=${v}`).join(', '));
                const charset = document.querySelector('head meta[charset]');
                charset.insertAdjacentElement('afterend', viewport);
            }
            if (document.head) {
                attachViewportMeta();
            } else {
                addEventListener('DOMContentLoaded', attachViewportMeta, {capture: true});
            }
        }]
    }, {
        name: 'Dashboard',
        pathMatch: /^\/dashboard(\/.*|\b)/,
        scripts: [
            'site/base.js',
            'site/rpc.js',
            'site/locale.js',
            'common/template.js',
            'site/lib.js',
            'site/dashboard.js'
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


    function loadScript(url, options) {
        options = options || {};
        const script = document.createElement('script');
        if (!options.blocking) {
            script.defer = 'defer';
        }
        const p = new Promise(resolve => script.onload = resolve);
        script.src = url;
        addHeadElement(script, options.top);
        return p;
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
        await loadScript(`${extUrl}src/site/preloader.js`, {blocking: true, top: true});
        const config = await sauce.storage.get(null);
        if (config.enabled === false) {
            console.info("Sauce is disabled");
            return;
        }
        document.documentElement.classList.add('sauce-enabled');
        const ext = browser.runtime.getManifest();
        insertScript(`
            self.sauce = self.sauce || {};
            sauce.options = ${JSON.stringify(config.options)};
            sauce.extUrl = "${extUrl}";
            sauce.extId = "${browser.runtime.id}";
            sauce.name = "${ext.name}";
            sauce.version = "${ext.version}";
        `);
        for (const m of manifests) {
            if ((m.pathMatch && !location.pathname.match(m.pathMatch)) ||
                (m.pathExclude && location.pathname.match(m.pathExclude))) {
                continue;
            }
            console.info(`Sauce loading: ${m.name}`);
            if (m.callbacks) {
                for (const cb of m.callbacks) {
                    cb();
                }
            }
            if (m.stylesheets) {
                for (const url of m.stylesheets) {
                    loadStylesheet(`${extUrl}css/${url}`);
                }
            }
            if (m.scripts) {
                for (const url of m.scripts) {
                    await loadScript(`${extUrl}src/${url}`);
                }
            }
        }
    }

    load();
})();
