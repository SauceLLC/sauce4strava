/* global sauce */

/*
 * We simply need to export the functions needed by the site context...
 * */

(function () {
    "use strict";

    const ns = sauce.storage;
    const exports = [
        [ns.set],
        [ns.get],
        [ns.remove],
        [ns.clear],
        [ns.getAthleteInfo],
        [ns.updateAthleteInfo],
        [ns.getPref],
        [ns.setPref, {name: '_setPref'}],
        [ns.update],
    ];

    for (const [fn, options] of exports) {
        sauce.proxy.export(fn, {namespace: 'storage', ...options});
    }
})();
