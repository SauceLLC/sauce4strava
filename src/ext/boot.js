/* global chrome */

(async function() {
    'use strict';

    const manifests = [{
        name: 'Analysis',
        pathMatch: /^\/activities\/.*/,
        scripts: [
            'jquery.sparkline.js',
            'base.js',
            'rpc.js',
            'lib.js',
            'export.js',
            'analysis.js',
        ]
    }, {
        name: 'Dashboard',
        pathMatch: /^\/dashboard(\/.*|\b)/,
        scripts: [
            'base.js',
            'rpc.js',
            'lib.js',
            'dashboard.js'
        ]
    }];

    function sendMessageToBackground(msg) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(undefined, msg, undefined, resp => {
                if (resp === undefined || !resp.success) {
                    const err = resp ? resp.error : 'general error';
                    reject(new Error(err));
                } else {
                    resolve(resp.data);
                }
            });
        });
    }

    function loadScript(url) {
        const script = document.createElement('script');
        script.defer = 'defer';
        const p = new Promise(resolve => script.onload = resolve);
        script.src = url;
        document.head.appendChild(script);
        return p;
    }

    function insertScript(content) {
        const script = document.createElement('script');
        script.textContent = content;
        document.head.appendChild(script);
    }

    async function initConfig() {
        // Perform storage migration/setup here and return config object.
        const config = await new Promise(resolve => chrome.storage.sync.get(null, resolve));
        const defaultOptions = {
            "analysis-segment-badges": true,
            "analysis-cp-chart": true,
            "activity-hide-promotions": true
        };
        if (config.options === undefined) {
            config.options = {};
        }
        let optionsUpdated;
        for (const [key, value] of Object.entries(defaultOptions)) {
            if (config.options[key] === undefined) {
                config.options[key] = value;
                optionsUpdated = true;
            }
        }
        if (optionsUpdated) {
            await new Promise(resolve => chrome.storage.sync.set({options: config.options}, resolve));
        }
        return config;
    }

    async function load() {
        const config = await initConfig();
        if (config.enabled === false) {
            console.info("Strava sauce is disabled");
            return;
        }
        document.documentElement.classList.add('sauce-enabled');
        const appDetails = await sendMessageToBackground({system: 'app', op: 'getDetails'});
        const extUrl = chrome.extension.getURL('');
        insertScript(`
            window.sauce = {};
            sauce.config = ${JSON.stringify(config)};
            sauce.extURL = "${extUrl}";
            sauce.extID = "${chrome.runtime.id}";
            sauce.name = "${appDetails.name}";
            sauce.version = "${appDetails.version}";
        `);
        for (const x of manifests) {
            if (location.pathname.match(x.pathMatch)) {
                console.info(`Sauce loading: ${x.name}`);
                for (const url of x.scripts) {
                    await loadScript(`${extUrl}src/site/${url}`);
                }
            }
        }
    }

    load();
})();
