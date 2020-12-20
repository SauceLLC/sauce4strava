/* global sauce, browser */

(function() {
    'use strict';

    self.sauce = self.sauce || {};
    sauce.rpc = sauce.rpc || {};
    sauce.rpc.hooks = {};


    function addHook(system, op, callback, options) {
        const sysTable = sauce.rpc.hooks[system] || (sauce.rpc.hooks[system] = {});
        sysTable[op] = {
            callback,
            options,
        };
    }


    addHook('options', 'openOptionsPage', () => browser.runtime.openOptionsPage(), {bg: true});

    addHook('trailforks', 'intersections', ({args}) => sauce.trailforks.intersections.apply(null, args), {bg: true});
})();
