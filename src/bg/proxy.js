/* global sauce, browser */

sauce.ns('proxy', ns => {
    'use strict';

    const connectedTabs = new Set();
    let localConnIdSeq = 1;

    let _ready;
    const ready = new Promise(resolve => {
        ns.startBackgroundHandler = () => {
            _ready = true;
            resolve();
            // Notify our other tabs that we are back so they don't miss any events.
            browser.tabs.query({active: true}).then(tabs => {
                for (const tab of tabs) {
                    if (!connectedTabs.has(tab.id)) {
                        browser.tabs.sendMessage(tab.id, {op: 'background-sw-revived'}).catch(e => {
                            if (!e.message.match(/Receiving end does not exist/)) {
                                console.error("Error sending revival message to tab:", e);
                            }
                        });
                    }
                }
            });
        };
    });

    browser.runtime.onConnect.addListener(port => {
        if (port.name !== 'sauce-proxy-port') {
            console.warn("Unexpected extension port usage");
            return;
        }
        const connId = localConnIdSeq++;
        const tabId = port.sender.tab?.id;
        const sender = tabId != null ? `tab:${tabId}` : 'non-tab';
        console.debug(`Accepting new proxy connection [${sender}]: ${connId}`);
        if (tabId != null) {
            connectedTabs.add(tabId);
        }
        const handleBackgroundProxyCall = async data => {
            if (data.type === 'keepalive') {
                return;
            }
            if (data.type && data.type === 'sauce-proxy-establish-port') {
                port.onMessage.removeListener(handleBackgroundProxyCall);
            }
            data.port = port;
            if (!_ready) {
                await ready;
            }
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
        port.onDisconnect.addListener(() => {
            port = null;
            console.debug(`Proxy client disconnected [${sender}]: ${connId}`);
            if (tabId != null) {
                connectedTabs.delete(tabId);
            }
        });
    });
});
