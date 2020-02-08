/* global sauce, browser */

(async function() {
    'use strict';

    const manifests = [{
        name: 'Analysis',
        pathMatch: /^\/activities\/.*/,
        scripts: [
            'site/base.js',
            'site/rpc.js',
            'site/locale.js',
            'common/template.js',
            'site/sparkline.js',
            'site/lib.js',
            'site/export.js',
            'site/analysis.js',
        ]
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


    function addScriptElement(script, top) {
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
        addScriptElement(script, options.top);
        return p;
    }


    function insertScript(content) {
        const script = document.createElement('script');
        script.textContent = content;
        addScriptElement(script, true);
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
        const manifest = browser.runtime.getManifest();
        insertScript(`
            self.sauce = self.sauce || {};
            sauce.options = ${JSON.stringify(config.options)};
            sauce.extUrl = "${extUrl}";
            sauce.extId = "${browser.runtime.id}";
            sauce.name = "${manifest.name}";
            sauce.version = "${manifest.version}";
        `);
        for (const x of manifests) {
            if (location.pathname.match(x.pathMatch)) {
                console.info(`Sauce loading: ${x.name}`);
                for (const url of x.scripts) {
                    await loadScript(`${extUrl}src/${url}`);
                }
            }
        }
    }

    load();
})();
