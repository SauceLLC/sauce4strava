/* global sauce, browser */

(function() {
    'use strict';

    self.sauce = self.sauce || {};
    sauce.rpc = sauce.rpc || {};

    browser.runtime.onMessage.addListener(async (msg, sender) => {
        const hook = sauce.rpc.hooks[msg.system][msg.op];
        if (!msg.bg && !(hook.options && hook.options.bg)) {
            console.error("Hook should not be running in BG:", msg, hook);
            throw new Error("Non background-only hook being sent to background page!");
        }
        return await hook.callback.call(sender, msg.data);
    });
})();
