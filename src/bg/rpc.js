/* global sauce, browser */

(function() {
    'use strict';

    self.sauce = self.sauce || {};
    sauce.rpc = sauce.rpc || {};

    browser.runtime.onMessage.addListener(async (msg, sender) => {
        const hook = sauce.rpc.hooks[msg.system][msg.op];
        if (!hook.options || !hook.options.backgroundOnly) {
            throw new Error("Non background-only hook being sent to background page!");
        }
        return await hook.callback.call(sender, msg.data);
    });
})();
