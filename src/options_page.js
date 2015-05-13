
function save_options(options) {
    var start_date = document.getElementById('start_date').value;
    var watts = document.getElementById('watts').value;
    options.ftp_history.push({
        start_date: start_date,
        watts: watts
    });
    chrome.storage.sync.set(options, function() {
        var status = document.getElementById('status');
        status.textContent = 'Options saved.';
        setTimeout(function() {
            status.textContent = '';
            window.reload();
        }, 1000);
    });
}


function load_options() {
    chrome.storage.sync.get(null, function(options) {
        if (!options.ftp_history) {
            options.ftp_history = [];
        }
        var hist = document.getElementById('ftp_history');
        options.ftp_history.forEach(function(x) {
            hist.innerHTML += '<li>' + x.start_date +
                         ': ' + x.watts + 'w</li>';
        });
        document.getElementById('save').addEventListener('click', function() {
            save_options(options);
        });
    });
}


document.addEventListener('DOMContentLoaded', function() {
    load_options();
});
