/* global sauce */

window.sauce = window.sauce || {};

sauce.ns = async function(ns, callback) {
    let offt = sauce;
    for (const x of ns.split('.')) {
        if (!offt[x]) {
            offt = (offt[x] = {});
        }
    }
    const assignments = callback && await callback(offt);
    if (assignments) {
        Object.assign(offt, assignments);
    }
    return offt;
};
