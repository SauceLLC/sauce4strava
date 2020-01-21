/* global sauce */

window.sauce = window.sauce || {};

sauce.ns = async function(ns, callback) {
    let offt = sauce;
    ns.split('.').forEach(function(x) {
        if (!offt[x]) {
            offt = (offt[x] = {});
        }
    });

    if (callback) {
        Object.assign(offt, await callback(offt));
    }
};
