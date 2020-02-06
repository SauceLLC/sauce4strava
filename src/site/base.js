/* global sauce */

window.sauce = window.sauce || {};

sauce.ns = async function(ns, callback) {
    let offt = sauce;
    const assignments = callback && await callback(offt);
    for (const x of ns.split('.')) {
        if (!offt[x]) {
            offt = (offt[x] = {});
        }
    }
    if (assignments) {
        Object.assign(offt, assignments);
    }
    return offt;
};
