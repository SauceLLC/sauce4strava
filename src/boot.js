"use strict";

chrome.storage.sync.get(null, function(options) {
    var load_script = function(url, callback) {
        console.log("Sauce script load: " + url);
        var script = document.createElement('script');
        script.src = url;
        script.onload = callback;
        document.head.appendChild(script);
    };

    var insert_script = function(content) {
        var script = document.createElement('script');
        script.textContent = content;
        document.head.appendChild(script);
    };

    var ext_url = chrome.extension.getURL('');

    var src = [
        'https://cdnjs.cloudflare.com/ajax/libs/jquery-sparklines/2.1.2/jquery.sparkline.min.js',
        'src/base.js',
        'src/lib.js',
        'src/analysis.js'
    ];

    var loader = function(list, final_callback) {
        var _load_this = function() {
            if (list.length) {
                var script = list.shift();
                var url;
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

    if (options.enabled !== false) {
        /* Create namespace and copy options from the sync store. */
        insert_script([
            'window.sauce = {};',
            'sauce.options = ', JSON.stringify(options), ';',
            'sauce.extURL = "', ext_url, '";',
            'sauce.extID = "', chrome.runtime.id, '";'
        ].join(''));

        loader(src);
    }
});
