/* global chrome */

chrome.storage.sync.get(null, async config => {
    "use strict";

    const load_script = function(url, callback) {
        console.log("Sauce script load: " + url);
        const script = document.createElement('script');
        script.src = url;
        script.onload = callback;
        document.head.appendChild(script);
    };

    const insert_script = function(content) {
        const script = document.createElement('script');
        script.textContent = content;
        document.head.appendChild(script);
    };

    const ext_url = chrome.extension.getURL('');

    const src = [
        'https://cdnjs.cloudflare.com/ajax/libs/jquery-sparklines/2.1.2/jquery.sparkline.min.js',
        'src/base.js',
        'src/lib.js',
        'src/analysis.js',
        'src/dashboard.js'
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

    const loader = function(list, final_callback) {
        const _load_this = function() {
            if (list.length) {
                const script = list.shift();
                let url;
                if (script.match(/https?:\/\//i)) {
                    url = script;
                } else {
                    url = ext_url + script;
                }
                load_script(url, _load_this);
            } else if (final_callback) {
                final_callback();
            }
        };
        _load_this();
    };

    if (config.enabled !== false) {
        /* Create namespace and copy config from the sync store. */
        document.body.classList.add('sauce-enabled');
        insert_script([
            'window.sauce = {};',
            'sauce.config = ', JSON.stringify(config), ';',
            'sauce.extURL = "', ext_url, '";',
            'sauce.extID = "', chrome.runtime.id, '";'
        ].join(''));

        loader(src);
    }
});
