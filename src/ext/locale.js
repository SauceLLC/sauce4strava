/* global sauce, browser */

sauce.ns('locale', ns => {
    'use strict';

    function _getMessage(key, ...args) {
        try {
            return browser.i18n.getMessage(key, ...args);
        } catch(e) {
            console.warn(`Failed to get i18n message for: ${key}: ${e.message}`);
        }
    }
    sauce.proxy.export(_getMessage, {namespace: 'locale'});


    function _getMessages(batch) {
        return batch.map(x => _getMessage(x));
    }
    sauce.proxy.export(_getMessages, {namespace: 'locale'});
});
