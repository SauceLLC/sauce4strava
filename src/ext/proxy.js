/* global sauce, browser */

sauce.ns('proxy', ns => {
    'use strict';

    let proxyId = -2;  // ext context goes negative, site context goes positive.
    let activeBGPort;
    const inflight = new Map();
    const subPorts = new Set();
    let exportsBound;
    let bgConnecting;
    let keepaliveInterval;

    ns.isConnected = false;

    ns.disconnect = (bgPort=activeBGPort) => {
        if (bgPort !== activeBGPort) {
            console.warn("Dedup background worker [port] disconnect", bgPort);
            return;
        }
        ns.isConnected = false;
        clearInterval(keepaliveInterval);
        activeBGPort = null;
        bgConnecting = null;
        bgPort.disconnect();
        for (const x of subPorts) {
            x.disconnect();
        }
    };

    ns.ensureConnected = async function({forceReconnect}={}) {
        if (forceReconnect && activeBGPort) {
            ns.disconnect();
        } else if (ns.isConnected) {
            return;
        } else if (bgConnecting) {
            return bgConnecting;
        }
        const connectPid = --proxyId;
        console.info("Connecting to background worker...");
        clearInterval(keepaliveInterval);
        bgConnecting = new Promise(resolve => {
            inflight.set(connectPid, msg => {
                if (connectPid !== proxyId) {
                    console.warn("Background worker connection attempt overlap");
                    return;
                }
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
                for (const x of subPorts) {
                    x.connect().catch(e => void console.error("Failed to reconnect background sub-port:", e));
                }
                resolve();
            });
        });
        const bgPort = activeBGPort = browser.runtime.connect({name: `sauce-proxy-port`});
        bgPort.onMessage.addListener(msg => {
            const resolve = inflight.get(msg.pid);
            inflight.delete(msg.pid);
            resolve(msg);
        });
        bgPort.onDisconnect.addListener(() => {
            // Dedup required for safari that calls this from the disconnect() call's microtask
            if (bgPort === activeBGPort) {
                console.info("Background worker [port] disconnected");
                ns.disconnect(bgPort);
            }
        });
        bgPort.postMessage({desc: {call: 'sauce-proxy-init'}, pid: connectPid});
        await bgConnecting;
        if (!sauce.isSafari()) {
            keepaliveInterval = setInterval(() => {
                if (bgPort !== activeBGPort || document.hidden) {
                    return;
                }
                try {
                    bgPort.postMessage({type: 'keepalive', pid: connectPid, ts: Date.now()});
                } catch(e) {
                    if (e.message && e.message.match(/disconnected port/)) {
                        // Devtools pause breaks onDisconnect when SW dies during breakpoint (chromium)
                        ns.disconnect(bgPort);
                    }
                }
            }, 15000);
        } else {
            // Safari requires more than data on the existing port to keep it alive, we have to
            // open a new connection.
            keepaliveInterval = setInterval(() => {
                // Because Safari doesn't emit onDisconnect when it times out the background page
                // we can't safely backoff when document.hidden is true.
                if (bgPort !== activeBGPort) {
                    return;
                }
                const p = browser.runtime.connect({name: 'sauce-aggressive-keepalive'});
                const watchdogTimeout = setTimeout(() => {
                    // Actually quite unlikely because the connect revives the background page.
                    // This is probably case of suspended timers.
                    console.warn("Aggressive keepalive timeout: Background page is dead");
                    p.disconnect();
                    ns.ensureConnected({forceReconnect: true});
                }, 2500);
                p.onMessage.addListener(msg => {
                    clearTimeout(watchdogTimeout);
                    p.disconnect();
                    if (msg.reset) {
                        // This most likely revive scenerio..
                        console.warn("Background worker reset: revive it..");
                        ns.ensureConnected({forceReconnect: true});
                    }
                });
            }, 15000);
        }
    };


    class BackgroundProxySubPort extends EventTarget {

        constructor({desc, args, pid, clientPort}) {
            super();
            this.desc = desc;
            this.args = args;
            this.pid = pid;
            this.clientPort = clientPort;
            this.bgPort = null;
            this.connected = false;
            clientPort.addEventListener('message', async ev => {
                if (!this.bgPort) {
                    console.info("Restarting background connection/worker [from proxy port]...");
                    await this.connect();
                }
                this.bgPort.postMessage(ev.data);
            });
            clientPort.start();
        }

        async connect() {
            if (this.bgPort) {
                throw new Error("already connected");
            }
            console.info("Connecting background proxy sub-port", this.pid);
            this.connected = false;
            const bgPort = this.bgPort = browser.runtime.connect({name: `sauce-proxy-port`});
            bgPort.onDisconnect.addListener(p => {
                if (this.bgPort === p) {
                    console.warn('Background worker port disconnected');
                    this.disconnect();
                }
            });
            return await new Promise(resolve => {
                const onAck = msg => {
                    // The first message back is the response to the exec call.
                    // After that it's up to the user how they use the port.
                    bgPort.onMessage.removeListener(onAck);
                    // Safari will send THIS event to any handlers registered in
                    // the same microtask, but only sometimes;  Register new listener outside. :(
                    queueMicrotask(() => {
                        bgPort.onMessage.addListener(this.clientPort.postMessage.bind(this.clientPort));
                        if (bgPort === this.bgPort) {
                            this.connected = true;
                        }
                        resolve(msg);
                    });
                };
                bgPort.onMessage.addListener(onAck);
                bgPort.postMessage({
                    desc: this.desc,
                    args: this.args,
                    pid: this.pid,
                    type: 'sauce-proxy-establish-port'
                });
            });
        }

        disconnect() {
            console.warn("Disconnect background proxy sub-port", this.pid);
            const bgPort = this.bgPort;
            this.bgPort = null;
            this.connected = false;
            if (bgPort) {
                bgPort.disconnect();
            }
            const ev = new Event('disconnect');
            ev.subPort = this;
            this.dispatchEvent(ev);
        }
    }


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
        const fn = function({pid, args, port}) {
            if (port) {
                // Make a unique port for this invocation that both sides can
                // continue to use after the call exec.
                const subPort = new BackgroundProxySubPort({desc, pid, args, clientPort: port});
                subPorts.add(subPort);
                return subPort.connect();
            } else {
                const response = new Promise(resolve => inflight.set(pid, resolve));
                if (ns.isConnected) {
                    activeBGPort.postMessage({desc, args, pid});
                } else {
                    ns.ensureConnected().then(() => void activeBGPort.postMessage({desc, args, pid}));
                }
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


    self.addEventListener('message', onMessageEstablishChannel);
    ns.ensureConnected();
});
