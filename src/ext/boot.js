/* global chrome */

(async function() {
    'use strict';

    const config = await new Promise(resolve => chrome.storage.sync.get(null, resolve));

    function loadScript(url) {
        console.info(`Sauce script load: ${url}`);
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

    const extUrl = chrome.extension.getURL('');

    const siteScripts = [
        'https://cdnjs.cloudflare.com/ajax/libs/jquery-sparklines/2.1.2/jquery.sparkline.min.js',
        'src/site/base.js',
        'src/site/comm.js',
        'src/site/lib.js',
        'src/site/analysis.js',
        'src/site/dashboard.js'
    ];

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
    
    if (config.enabled !== false) {
        /* Create namespace and copy config from the sync store. */
        document.body.classList.add('sauce-enabled');
        insertScript(`
            window.sauce = {};
            sauce.config = ${JSON.stringify(config)};
            sauce.extURL = "${extUrl}";
            sauce.extID = "${chrome.runtime.id}";
        `);
        await Promise.all(siteScripts.map(async url => {
            if (!url.match(/https?:\/\//i)) {
                url = extUrl + url;
            }
            await loadScript(url);
        }));
    }
})();
