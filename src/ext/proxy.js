/* global sauce, browser */

sauce.ns('proxy', ns => {
    'use strict';

    let proxyId = -2;  // ext context goes negative, site context goes positive.
    let mainBGPort;
    const inflight = new Map();

    function connectBackground(skipBind) {
        ns.isConnected = false;
        const connectPid = proxyId--;
        ns.connected = (new Promise(resolve => inflight.set(connectPid, resolve))).then(x => {
            if (!skipBind) {
                for (const desc of x.exports) {
                    ns.exports.set(desc.call, {desc, exec: makeBackgroundExec(desc)});
                }
                ns.bindExports(x.exports, buildProxyFunc);
            }
            ns.isConnected = true;
        });
        mainBGPort = browser.runtime.connect({name: `sauce-proxy-port`});
        mainBGPort.onMessage.addListener(msg => {
            const resolve = inflight.get(msg.pid);
            inflight.delete(msg.pid);
            resolve(msg);
        });
        mainBGPort.onDisconnect.addListener(port => {
            console.warn("Main bg port disconnected");
            ns.isConnected = false;
            ns.connected = new Promise(() => 0); // XXX make callable and trigger reconnect (probably not used often this way (ever?) but shd support
        });
        mainBGPort.postMessage({desc: {call: 'sauce-proxy-init'}, pid: connectPid});
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
        const fn = function({pid, port, args}) {
            if (port) {
                // Make a unique port for this invocation that both sides can
                // continue to use after the call exec.
                console.warn("XXX check if we need to impl sw reviver herre...");
                const bgPort = browser.runtime.connect({name: `sauce-proxy-port`});
                port.addEventListener('message', ev => bgPort.postMessage(ev.data));
                port.start();
                const response = new Promise(resolve => {
                    const onAck = msg => {
                        // The first message back is the response to the exec call.
                        // After that it's up to the user how they use the port.
                        bgPort.onMessage.removeListener(onAck);
                        resolve(msg);
                        // Safari will send THIS event to any handlers registered in
                        // the same microtask, but only sometimes;  Register new listener outside. :(
                        queueMicrotask(() => bgPort.onMessage.addListener(port.postMessage.bind(port)));
                    };
                    bgPort.onMessage.addListener(onAck);
                    bgPort.postMessage({desc, args, pid, type: 'sauce-proxy-establish-port'});
                });
                return response;
            } else {
                if (!ns.isConnected) {
                    console.warn("Restarting background connection/worker...");
                    connectBackground(false);
                }
                const response = new Promise(resolve => inflight.set(pid, resolve));
                mainBGPort.postMessage({desc, args, pid});
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
        await ns.connected;
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


    connectBackground();
    self.addEventListener('message', onMessageEstablishChannel);
});
