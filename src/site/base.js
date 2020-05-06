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


sauce.theme = function(name) {
    const doc = document.documentElement;
    const classes = Array.from(doc.classList);
    for (const x of classes) {
        if (x.startsWith('sauce-theme-')) {
            doc.classList.remove(x);
        }
    }
    if (name) {
        doc.classList.add('sauce-theme-enabled');
        doc.classList.add(`sauce-theme-${name}`);
    }
};
