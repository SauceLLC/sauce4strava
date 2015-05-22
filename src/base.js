
window.sauce = window.sauce || {};

sauce.ns = function(ns, callback) {
    var offt = sauce;
    ns.split('.').forEach(function(x) {
        if (!offt[x]) {
            offt = (offt[x] = {});
        }
    });

    if (callback) {
        var overlay = callback(offt);
        Object.keys(overlay).forEach(function(x) {
            offt[x] = overlay[x];
        });
    }
};
