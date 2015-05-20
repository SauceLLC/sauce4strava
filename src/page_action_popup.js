
function insert_msg(msg_label, selector) {
    var nodes = document.querySelectorAll(selector);
    for (var i = 0; i < nodes.length; i++) {
        var el = nodes.item(i);
        el.textContent = chrome.i18n.getMessage(msg_label);
    }
}

var details_el = document.querySelector('#details > tbody');
var appDetail = chrome.app.getDetails();
var details_list = [
    ['Version', appDetail.version_name || d.version],
    ['Author', appDetail.author]
];
details_list.forEach(function(x) {
    details_el.innerHTML += [
        '<tr><td class="key">', x[0], '</td>',
        '<td class="value">', x[1], '</td></tr>'
    ].join('');
});
