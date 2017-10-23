/* global chrome */

(function() {
    'use strict';

    var details_el = document.querySelector('#details > tbody');
    var appDetail = chrome.app.getDetails();
    var details_list = [
        ['Version', appDetail.version_name || appDetail.version],
        ['Author', appDetail.author]
    ];
    details_list.forEach(function(x) {
        details_el.innerHTML += [
            '<tr><td class="key">', x[0], '</td>',
            '<td class="value">', x[1], '</td></tr>'
        ].join('');
    });

    var en_state = null;

    chrome.storage.sync.get(null, function(data) {
        var enabler = document.getElementById("enabler");
        function toggle(state) {
            en_state = state;
            enabler.innerText = en_state ? 'Disable' : 'Enable';
            enabler.innerText += ' Extension';
            enabler.style.color = en_state ? '#933' : '#393';
        }
        toggle(data.enabled !== false);
        enabler.addEventListener('click', function() {
            chrome.storage.sync.set({enabled: !en_state}, function() {
                toggle(!en_state);
                chrome.tabs.reload();
            });
        });
    });
})();
