/* global sauce, browser */

sauce.ns('proxy', ns => {
    'use strict';

    let proxyId = -2;  // ext context goes negative, site context goes positive.
    let mainBGPort;
    const inflight = new Map();
    const disconnected = new Set();
    let exportsBound;
    let bgConnecting;

    ns.isConnected = false;

    ns.ensureConnected = async function() {
        if (ns.isConnected) {
            return;
        }
        if (bgConnecting) {
            return bgConnecting;
        }
        const connectPid = proxyId--;
        console.info("Connecting to background worker...");
        bgConnecting = new Promise(resolve => {
            inflight.set(connectPid, msg => {
                if (!exportsBound) {
                    for (const desc of msg.exports) {
                        ns.exports.set(desc.call, {desc, exec: makeBackgroundExec(desc)});
                    }
                    ns.bindExports(msg.exports, buildProxyFunc);
                    exportsBound = true;
                }
                ns.isConnected = true;
                bgConnecting = null;
                console.info("Connection to background worker established");
                for (const cb of Array.from(disconnected)) {
                    disconnected.delete(cb);
                    cb().catch(e => void console.error("Failed to wake up bg proxy port:", e));
                }
                resolve();
            });
        });
        mainBGPort = browser.runtime.connect({name: `sauce-proxy-port`});
        mainBGPort.onMessage.addListener(msg => {
            const resolve = inflight.get(msg.pid);
            inflight.delete(msg.pid);
            resolve(msg);
        });
        mainBGPort.onDisconnect.addListener(port => {
            console.info("Background worker disconnected");
            ns.isConnected = false;
            mainBGPort = null;
            bgConnecting = null;
        });
        mainBGPort.postMessage({desc: {call: 'sauce-proxy-init'}, pid: connectPid});
        await bgConnecting;
    };


    function buildProxyFunc(name, desc) {
        const entry = ns.exports.get(desc.call);
        const fn = function(...nativeArgs) {
            return entry.exec({
                pid: proxyId--,
                desc,
                args: ns.encodeArgs(nativeArgs),
            }).then(({pid, result, success}) => {
                if (success) {
                    return result;
                } else {
                    const {name, stack, message} = result;
                    const EClass = self[name] || Error;
                    const e = new EClass(message);
                    e.stack = stack;
                    throw e;
                }
            });
        };
        Object.defineProperty(fn, 'name', {value: name});
        return fn;
    }


    function makeBackgroundExec(desc) {
        const fn = function({pid, port, args}) {
            if (port) {
                // Make a unique port for this invocation that both sides can
                // continue to use after the call exec.
                let bgPort;
                let connecting;
                const connectBackgroundProxyPort = () => {
                    bgPort = browser.runtime.connect({name: `sauce-proxy-port`});
                    bgPort.onDisconnect.addListener(p => {
                        console.info('Background proxy port shutdown (sw is probably dead)', pid, args);
                        bgPort = null;
                        disconnected.add(connectBackgroundProxyPort);
                    });
                    connecting = new Promise(resolve => {
                        const onAck = msg => {
                            // The first message back is the response to the exec call.
                            // After that it's up to the user how they use the port.
                            bgPort.onMessage.removeListener(onAck);
                            // Safari will send THIS event to any handlers registered in
                            // the same microtask, but only sometimes;  Register new listener outside. :(
                            queueMicrotask(() => {
                                bgPort.onMessage.addListener(port.postMessage.bind(port));
                                connecting = null;
                                resolve(msg);
                            });
                        };
                        bgPort.onMessage.addListener(onAck);
                        bgPort.postMessage({desc, args, pid, type: 'sauce-proxy-establish-port'});
                    });
                    return connecting;
                };
                port.addEventListener('message', async ev => {
                    if (!bgPort) {
                        console.info("Restarting background connection/worker [from proxy port]...");
                        disconnected.delete(connectBackgroundProxyPort);
                        await connectBackgroundProxyPort();
                    } else if (connecting) {
                        // Very unlikely...
                        await connecting;
                    }
                    bgPort.postMessage(ev.data);
                });
                port.start();
                return connectBackgroundProxyPort();
            } else {
                const response = new Promise(resolve => inflight.set(pid, resolve));
                ns.ensureConnected().then(() => void mainBGPort.postMessage({desc, args, pid}));
                return response;
            }
        };
        const name = desc.call.split('.').slice(-1)[0];
        Object.defineProperty(fn, 'name', {value: name});
        return fn;
    }


    async function onMessageEstablishChannel(ev) {
        if (ev.source !== self || !ev.data || ev.data.type !== 'sauce-proxy-establish-channel' ||
            ev.data.extId !== browser.runtime.id) {
            return;
        }
        self.removeEventListener('message', onMessageEstablishChannel);
        const respChannel = new MessageChannel();
        const respPort = respChannel.port1;
        // Must get port from ports[] array because of WebKit bug:
        // https://bugs.webkit.org/show_bug.cgi?id=254777
        const requestPort = ev.ports[ev.data.requestPortIndex];
        requestPort.addEventListener('message', async ev => {
            const entry = ns.exports.get(ev.data.desc.call);
            let data;
            if (!entry) {
                data = ns._wrapError(new Error('Invalid proxy call: ' + ev.data.desc.call));
            } else {
                ev.data.port = ev.ports[ev.data.portIndex];
                data = await entry.exec(ev.data);
            }
            data.type = 'sauce-proxy-response';
            respPort.postMessage(data);
        });
        requestPort.addEventListener('messageerror', ev => console.error("Message Error:", ev));
        requestPort.start();
        await ns.ensureConnected();
        while (sauce._pendingAsyncExports.length) {
            const pending = Array.from(sauce._pendingAsyncExports);
            sauce._pendingAsyncExports.length = 0;
            await Promise.allSettled(pending);
        }
        const transfer = [respChannel.port2];
        requestPort.postMessage({
            type: 'sauce-proxy-establish-channel-ack',
            exports: Array.from(ns.exports.values()).map(x => x.desc),
            responsePortIndex: transfer.indexOf(respChannel.port2),
        }, transfer);
    }


    ns.ensureConnected();
    self.addEventListener('message', onMessageEstablishChannel);
});
