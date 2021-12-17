/* global sauce, browser */

sauce.ns('proxy', ns => {
    'use strict';

    browser.runtime.onConnect.addListener(port => {
        if (port.name !== 'sauce-proxy-port') {
            console.warn("Unexpected extension port usage");
            return;
        }
        const handleBackgroundProxyCall = async data => {
            if (data.type && data.type === 'sauce-proxy-establish-port') {
                port.onMessage.removeListener(handleBackgroundProxyCall);
            }
            data.port = port;
            let result;
            if (data.desc.call === 'sauce-proxy-init') {
                while (sauce._pendingAsyncExports.length) {
                    const pending = Array.from(sauce._pendingAsyncExports);
                    sauce._pendingAsyncExports.length = 0;
                    await Promise.allSettled(pending);
                }
                result = {pid: data.pid, exports: Array.from(ns.exports.values()).map(x => x.desc)};
            } else {
                const entry = ns.exports.get(data.desc.call);
                if (!entry) {
                    result = ns._wrapError(new Error('Invalid proxy call: ' + data.desc.call));
                } else {
                    result = await entry.exec.call(port.sender, data);
                }
            }
            if (port) {
                port.postMessage(result);
            }
        };
        port.onMessage.addListener(handleBackgroundProxyCall);
        port.onDisconnect.addListener(() => void (port = null));
    });
});
