/* global sauce */

sauce.ns('proxy', ns => {
    'use strict';

    let proxyId = 0;
    const inflight = new Map();
    let requestPort;
    let _connected = false;

    ns.connected = (async () => {
        let respPort;
        [requestPort, respPort] = await createChannel();
        initResponseBroker(respPort);
        return (_connected = true);
    })();


    function setupExports(exports) {
        for (const desc of exports) {
            const path = desc.call.split('.');
            let offt = sauce;
            for (const x of path.slice(0, -1)) {
                offt[x] = offt[x] || {};
                offt = offt[x];
            }
            const name = path[path.length - 1];
            let callable;
            if (desc.isClass) {
                debugger;
                callable = buildProxyClass(name, desc);
            } else {
                callable = (...args) => extCall(desc, ...args);
            }
            offt[name] = callable;
        }
    }


    function encodeArgs(args) {
        return args.map(x => x === undefined ? '___SAUCE_UNDEFINED_ARG___' : x);
    }


    function buildProxyClass(name, desc) {
        const Klass = class K {}
        Klass.name = name;
        for (const x of desc.properties) {
            Klass.prototype[x] = 
        }
    }


    async function extCall(desc, ...nativeArgs) {
        if (!_connected) {
            await ns.connected();
        }
        return await new Promise((resolve, reject) => {
            const pid = proxyId++;
            inflight.set(pid, {resolve, reject});
            requestPort.postMessage({
                pid,
                desc,
                args: encodeArgs(nativeArgs),
                type: 'sauce-proxy-request',
                extId: sauce.extId
            });
        });
    }


    async function createChannel() {
        // Instead of just broadcasting everything over generic 'message' events, create a channel
        // which is like a unix pipe pair and transfer one of the ports to the ext for us
        // to securely and performantly talk over.
        const reqChannel = new MessageChannel();
        const reqPort = reqChannel.port1;
        const respPort = await new Promise((resolve, reject) => {
            function onMessageEstablishChannelAck(ev) {
                reqPort.removeEventListener('message', onMessageEstablishChannelAck);
                if (!ev.data || ev.data.extId !== sauce.extId ||
                    ev.data.type !== 'sauce-proxy-establish-channel-ack') {
                    reject(new Error('Proxy Protocol Violation [CONTENT] [ACK]!'));
                    return;
                }
                setupExports(ev.data.exports);
                resolve(ev.ports[0]);
            }
            reqPort.addEventListener('message', onMessageEstablishChannelAck);
            reqPort.addEventListener('messageerror', ev => console.error('Message Error:', ev));
            reqPort.start();
            window.postMessage({
                type: 'sauce-proxy-establish-channel',
                extId: sauce.extId,
            }, self.origin, [reqChannel.port2]);
        });
        return [reqPort, respPort];
    }


    function issubclass(A, B) {
        return A && B && (A.prototype instanceof B || A === B);
    }


    async function initResponseBroker(port) {
        port.addEventListener('message', ev => {
            if (!ev.data || ev.data.extId !== sauce.extId || ev.data.type !== 'sauce-proxy-response') {
                throw new Error('Proxy Protocol Violation [CONTENT] [RESP]!');
            }
            if (ev.data.success === true) {
                const pid = ev.data.pid;
                const {resolve} = inflight.get(pid);
                inflight.delete(pid);
                resolve(ev.data.result);
            } else if (ev.data.success === false) {
                const pid = ev.data.pid;
                const {reject} = inflight.get(pid);
                inflight.delete(pid);
                const {name, stack, message} = ev.data.result;
                const EClass = issubclass(self[name], Error) ? self[name] : Error;
                const e = new EClass(message);
                e.stack = stack;
                reject(e);
            } else {
                throw new TypeError("Proxy Protocol Violation [DATA]");
            }
        });
        port.start();
    }
});
