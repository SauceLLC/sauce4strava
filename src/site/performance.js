/* global sauce */

sauce.ns('performance', ns => {
    'use strict';


    function load() {
        console.warn("Let there be light");
    }
    

    return {
        load,
    };
});


addEventListener('DOMContentLoaded', async ev => {
    if (sauce.testing) {
        return;
    }
    try {
        await sauce.performance.load();
    } catch(e) {
        await sauce.report.error(e);
        throw e;
    }
});
