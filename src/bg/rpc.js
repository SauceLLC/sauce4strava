/* global chrome, sauce, ga */

(function() {
    'use strict';
    const hooks = {};

    function addHook(system, op, callback) {
        const sysTable = hooks[system] || (hooks[system] = {});
        sysTable[op] = callback;
    }

    addHook('storage', 'set', sauce.storage.set);
    addHook('storage', 'get', sauce.storage.get);
    addHook('ga', 'apply', args => ga.apply(window, args));

    chrome.runtime.onMessageExternal.addListener(async (msg, sender, setResponse) => {
        console.debug(`Running RPC hook:`, msg);
        try {
            const hook = hooks[msg.system][msg.op];
            const data = await hook.call(sender, msg.data);
            setResponse({success: true, data});
        } catch(e) {
            console.error('RPC Listener:', e);
            setResponse({
                success: false,
                error: e.message
            });
        }
    });
})();
