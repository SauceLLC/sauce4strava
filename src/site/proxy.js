/* global sauce */

sauce.ns('proxy', ns => {
    'use strict';

    let proxyId = 0;
    const inflight = new Map();
    let requestPort;

    ns.isConnected = false;

    ns.connected = (async () => {
        let respPort;
        [requestPort, respPort] = await createChannel();
        initResponseBroker(respPort);
        return (ns.isConnected = true);
    })();


    class ProxyClient {
        static makeMethodCall(call) {
            const fn = function(...nativeArgs) {
                const pid = proxyId++;
                const msg = {
                    pid,
                    desc: {call},
                    args: ns.encodeArgs(nativeArgs),
                    type: 'sauce-proxy-request'
                };
                const p = new Promise((resolve, reject) => this._inflight.set(pid, {resolve, reject}));
                if (this._instantiated) {
                    return this._instantiated.then(() => (this._port.postMessage(msg), p));
                } else {
                    this._port.postMessage(msg);
                    return p;
                }
            };
            Object.defineProperty(fn, 'name', {value: call});
            return fn;
        }

        constructor(desc, ...args) {
            this._inflight = new Map();
            const channel = new MessageChannel();
            this._port = channel.port1;
            this._port.addEventListener('message', this._onPortMessage.bind(this));
            this._port.start();
            this._instantiated = this._proxyConstructor(desc, channel.port2, args);
        }

        _proxyConstructor(desc, port, nativeArgs) {
            const pid = proxyId++;
            const p = new Promise((resolve, reject) => inflight.set(pid, {resolve, reject}));
            // Must not include the transfer port in the data arg because of WebKit bug:
            // https://bugs.webkit.org/show_bug.cgi?id=254777
            const transfer = [port];
            requestPort.postMessage({
                pid,
                desc,
                args: ns.encodeArgs(nativeArgs),
                type: 'sauce-proxy-request',
                portIndex: transfer.indexOf(port),
            }, transfer);
            p.then(() => delete this._instantiated);
            return p;
        }

        _onPortMessage(ev) {
            if (!ev.data || ev.data.type !== 'sauce-proxy-response') {
                throw new Error('Proxy Protocol Violation [CONTENT] [RESP]!');
            }
            const pid = ev.data.pid;
            const {resolve, reject} = this._inflight.get(pid);
            this._inflight.delete(pid);
            if (ev.data.success === true) {
                resolve(ev.data.result);
            } else if (ev.data.success === false) {
                const {name, stack, message} = ev.data.result;
                const EClass = issubclass(self[name], Error) ? self[name] : Error;
                const e = new EClass(message);
                e.stack = stack;
                reject(e);
            } else {
                throw new TypeError("Proxy Protocol Violation [DATA]");
            }
        }
    }


    class EventingProxyClient extends ProxyClient {
        constructor(...args) {
            super(...args);
            this._listeners = new Map();
        }

        addEventListener(name, callback) {
            if (!this._listeners.has(name)) {
                this._listeners.set(name, new Set());
            }
            this._listeners.get(name).add(callback);
        }

        removeEventListener(name, callback) {
            if (this._listeners.has(name)) {
                this._listeners.get(name).delete(callback);
            }
        }

        _onPortMessage(ev) {
            if (!ev.data || ev.data.type !== 'sauce-proxy-event') {
                return super._onPortMessage(ev);
            }
            if (this._listeners.has(ev.data.event)) {
                const proxyEvent = new Event(ev.data.event);
                proxyEvent.data = ev.data.data;
                for (const cb of this._listeners.get(ev.data.event)) {
                    cb.call(this, proxyEvent);
                }
            }
        }
    }


    function buildProxyFunc(name, desc) {
        const fn = function(...nativeArgs) {
            const stack = new Error('<SETINEL>').stack;
            const pid = proxyId++;
            const p = new Promise((resolve, _reject) => {
                function reject(e) {
                    try {
                        e.stack += stack.split('<SETINEL>', 2).slice(-1)[0].replace(/^\n*/, '\n');
                    } finally {
                        _reject(e);
                    }
                }
                inflight.set(pid, {resolve, reject});
            });
            requestPort.postMessage({
                pid,
                desc,
                args: ns.encodeArgs(nativeArgs),
                type: 'sauce-proxy-request',
            });
            return p;
        };
        Object.defineProperty(fn, 'name', {value: name});
        return fn;
    }


    function buildProxyClass(name, desc) {
        const SuperClass = desc.eventing ? EventingProxyClient : ProxyClient;

        class Proxied extends SuperClass {
            constructor(...args) {
                super(desc, ...args);
            }

            get [Symbol.toStringTag]() {
                return name;
            }
        }
        Object.defineProperty(Proxied, 'name', {value: name});

        for (const x of desc.methods) {
            Proxied.prototype[x] = Proxied.makeMethodCall(x);
        }
        return Proxied;
    }


    async function createChannel() {
        // Instead of just broadcasting everything over generic 'message' events, create a channel
        // which is like a unix pipe pair and transfer one of the ports to the ext for us
        // to securely and performantly talk over.  We transfer a request port to the ext and they
        // transfer a response port to us so each channel is directional for clarity.
        const reqChannel = new MessageChannel();
        const reqPort = reqChannel.port1;
        const respPort = await new Promise((resolve, reject) => {
            function onMessageEstablishChannelAck(ev) {
                reqPort.removeEventListener('message', onMessageEstablishChannelAck);
                if (!ev.data || ev.data.type !== 'sauce-proxy-establish-channel-ack') {
                    reject(new Error('Proxy Protocol Violation [CONTENT] [ACK]!'));
                    return;
                }
                ns.bindExports(ev.data.exports, buildProxyFunc, buildProxyClass);
                resolve(ev.ports[ev.data.responsePortIndex]);
            }
            reqPort.addEventListener('message', onMessageEstablishChannelAck);
            reqPort.addEventListener('messageerror', ev => console.error('Message Error:', ev));
            reqPort.start();
            // Must not include the transfer port in the data arg because of WebKit bug:
            // https://bugs.webkit.org/show_bug.cgi?id=254777
            const transfer = [reqChannel.port2];
            self.postMessage({
                type: 'sauce-proxy-establish-channel',
                extId: sauce.extId,
                requestPortIndex: transfer.indexOf(reqChannel.port2),
            }, self.origin, transfer);
        });
        return [reqPort, respPort];
    }


    function issubclass(A, B) {
        return A && B && (A.prototype instanceof B || A === B);
    }


    function initResponseBroker(port) {
        port.addEventListener('message', ev => {
            if (!ev.data || ev.data.type !== 'sauce-proxy-response') {
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
