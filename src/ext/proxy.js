/* global sauce, browser */

sauce.ns('proxy', ns => {
    'use strict';

    let proxyId = -2;  // ext context goes negative, site context goes positive.
    const mainBGPort = browser.runtime.connect({name: `sauce-proxy-port`});
    const inflight = new Map();

    mainBGPort.onMessage.addListener(msg => {
        const resolve = inflight.get(msg.pid);
        inflight.delete(msg.pid);
        resolve(msg);
    });

    const bgInit = (new Promise(resolve => inflight.set(-1, resolve))).then(x => {
        for (const desc of x.exports) {
            ns.exports.set(desc.call, {desc, exec: makeBackgroundExec(desc)});
        }
        ns.bindExports(x.exports, buildProxyFunc);
    });
    mainBGPort.postMessage({desc: {call: 'sauce-proxy-init'}, pid: -1});


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
                const bgPort = browser.runtime.connect({name: `sauce-proxy-port`});
                port.addEventListener('message', ev => bgPort.postMessage(ev.data));
                port.start();
                const response = new Promise(resolve => {
                    const onAck = msg => {
                        // The first message back is the response to the exec call.
                        // After that it's up to the user how they use the port.
                        bgPort.onMessage.removeListener(onAck);
                        bgPort.onMessage.addListener(port.postMessage.bind(port));
                        resolve(msg);
                    };
                    bgPort.onMessage.addListener(onAck);
                    bgPort.postMessage({desc, args, pid, type: 'sauce-proxy-establish-port'});
                });
                return response;
            } else {
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
        ev.data.requestPort.addEventListener('message', async ev => {
            let data;
            const entry = ns.exports.get(ev.data.desc.call);
            if (!entry) {
                data = ns._wrapError(new Error('Invalid proxy call: ' + ev.data.desc.call));
            } else {
                data = await entry.exec(ev.data);
            }
            data.type = 'sauce-proxy-response';
            respPort.postMessage(data);
        });
        ev.data.requestPort.addEventListener('messageerror', ev => console.error("Message Error:", ev));
        ev.data.requestPort.start();
        await bgInit;
        while (sauce._pendingAsyncExports.length) {
            const pending = Array.from(sauce._pendingAsyncExports);
            sauce._pendingAsyncExports.length = 0;
            await Promise.allSettled(pending);
        }
        ev.data.requestPort.postMessage({
            type: 'sauce-proxy-establish-channel-ack',
            exports: Array.from(ns.exports.values()).map(x => x.desc),
            responsePort: respChannel.port2
        }, [respChannel.port2]);
    }
    self.addEventListener('message', onMessageEstablishChannel);
});
