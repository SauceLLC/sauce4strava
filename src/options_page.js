
function save_options(ftps) {
    toset = {};
    ftps.forEach(function(x) {
        toset[x[0]] = Number(document.getElementById(x[0]).value);
    });
    console.log(toset);
    chrome.storage.sync.set(toset, function() {
        var status = document.getElementById('status');
        status.textContent = 'Options saved.';
        setTimeout(function() {
            status.textContent = '';
        }, 2000);
    });
}


function load_options() {
    chrome.storage.sync.get(null, function(data) {
        /* Comb for athlete ftp.. meh */
        ftps = [];
        Object.keys(data).forEach(function(x) {
            if (x.indexOf('athlete_ftp') === 0) {
                ftps.push([x, data[x]]);
            }
        });
        var ftp_list = document.getElementById('ftp_list');
        ftps.forEach(function(x) {
            ftp_list.innerHTML += [
                '<li><div><div class="label">', x[0], ':</div>',
                '<input id="', x[0], '" value="', x[1], '"/></div></li>'
            ].join('');
        });
        document.getElementById('save').addEventListener('click', function() {
            save_options(ftps);
        });
        document.getElementById('clear').addEventListener('click', function() {
            if (confirm('Are you sure you want to erase all settings?')) {
                chrome.storage.sync.clear(function() {
                    location.reload();
                });
            }
        });
    });
}


document.addEventListener('DOMContentLoaded', function() {
    load_options();
});
