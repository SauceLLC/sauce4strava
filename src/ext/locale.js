/* global sauce, browser */

(function() {
    'use strict';

    self.sauce = self.sauce || {};


    function getMessage(args) {
        try {
            return browser.i18n.getMessage.apply(null, args);
        } catch(e) {
            console.warn(`Failed to get i18n message for: ${args[0]}: ${e.message}`);
        }
    }
    sauce.proxy.export(getMessage, {namespace: 'locale'});


    function getMessages(batch) {
        return batch.map(x => getMessage(x));
    }
    sauce.proxy.export(getMessages, {namespace: 'locale'});
})();
