/* global sauce */

window.sauce = window.sauce || {};

sauce.ns = function(ns, callback) {
    let offt = sauce;
    for (const x of ns.split('.')) {
        if (!offt[x]) {
            offt = (offt[x] = {});
        }
    }
    const assignments = callback && callback(offt);
    if (assignments) {
        Object.assign(offt, assignments);
    }
    return offt;
};
