/* global chrome */

function save_options(ftps) {
    var toset = {};
    ftps.forEach(function(x) {
        toset[x[0]] = Number(document.getElementById(x[0]).value);
    });
    chrome.storage.sync.set(toset, function() {
        var status = document.getElementById('status');
        status.textContent = 'Options saved.';
        window.setTimeout(function() {
            status.textContent = '';
        }, 2000);
    });
}


function load_options() {
    chrome.storage.sync.get(null, function(data) {
        /* Comb for athlete ftp.. meh */
        var ftps = [];
        Object.keys(data).forEach(function(x) {
            if (x.indexOf('athlete_ftp') === 0) {
                ftps.push([x, data[x]]);
            }
        });
        var ftp_list = document.getElementById('ftp_list');
        ftps.forEach(function(x) {
            ftp_list.innerHTML += [
                '<tr><td class="label">', x[0], ':</td><td>',
                '<input id="', x[0], '" value="', x[1], '"/></td></tr>'
            ].join('');
        });
        document.getElementById('save').addEventListener('click', function() {
            save_options(ftps);
        });
        document.getElementById('clear').addEventListener('click', function() {
            this.innerText = "Double Click to Confirm Erase";
            this.addEventListener('dblclick', function() {
                chrome.storage.sync.clear(function() {
                    window.location.reload();
                });
            });
        });
    });
}


document.addEventListener('DOMContentLoaded', function() {
    load_options();
});
