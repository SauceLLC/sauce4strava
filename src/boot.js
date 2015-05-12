chrome.storage.sync.get(null, function(options) {

    var load_script = function(url) {
        var script = document.createElement('script');
        script.src = url;
        document.head.appendChild(script);
    };

    var insert_script = function(content) {
        var script = document.createElement('script');
        script.textContent = content;
        document.head.appendChild(script);
    }

    var deps = [
     //   'https://cdnjs.cloudflare.com/ajax/libs/jquery-sparklines/2.1.2/jquery.sparkline.min.js'
    ];

    var load = [
        'src/base.js',
        'src/lib.js',
        'src/analysis.js'
    ];


    /* Create namespace and copy options from the sync store. */
    insert_script([
        'window.sauce = {};',
        'sauce.options = ', JSON.stringify(options), ';'
    ].join(''));

    load.forEach(function(x) {
        var script = document.createElement('script');
        script.src = chrome.extension.getURL(x);
        document.head.appendChild(script);
    });

    deps.forEach(function(x) {
        var script = document.createElement('script');
        script.src = x;
        document.head.appendChild(script);
    });
});
