/* global browser */

import '../ext/webext.js';


function parseRawReactProps(raw) {
    const frag = document.createElement('div');
    // Unescapes html entities, ie. "&quot;"
    const htmlEntitiesKey = String.fromCharCode(...[33, 39, 36, 30, 46, 5, 10, 2, 12]
        .map((x, i) => (x ^ i) + 72));
    frag[htmlEntitiesKey] = raw;
    return JSON.parse(frag[htmlEntitiesKey]
        .replace(/\\\\/g, '\\')
        .replace(/\\\$/g, '$')
        .replace(/\\`/g, '`'));
}


const calls = {
    parseRawReactProps,
};

browser.runtime.onConnect.addListener(port => {
    if (port.name !== 'sauce-offscreen-proxy-port') {
        return;
    }
    port.onMessage.addListener(async ({name, id, args}) => {
        const call = Object.prototype.hasOwnProperty.call(calls, name) && calls[name];
        try {
            if (call) {
                port.postMessage({id, success: true, value: await call(...args)});
            } else {
                throw new TypeError('invalid call');
            }
        } catch(e) {
            port.postMessage({id, success: false,
                error: {name: e.name, message: e.message, stack: e.stack}});
        }
    });
    port.onDisconnect.addListener((...args) => {
        // WARNING: We must close when the SW dies to prevent bugs with other runtime
        // based message happening betweeen the SW and the content scripts.
        console.info("Service worker connection terminated: Closing...");
        close();
    });
});
