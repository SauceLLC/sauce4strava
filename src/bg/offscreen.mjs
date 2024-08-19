/* global browser */

import '../ext/webext.js';

browser.runtime.onConnect.addListener((port, ...args) => {
    if (port.name !== 'sauce-offscreen-proxy-port') {
        return;
    }
    port.onMessage.addListener((...args) => {
        console.warn("asdfasdf ", args);
        debugger;
    });
    console.info(port, args);
    debugger;
});
