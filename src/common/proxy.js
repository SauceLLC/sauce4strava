/* global sauce  */

sauce.ns('proxy', ns => {
    'use strict';

    ns.exports = new Map();


    ns.export = function(fn, options={}) {
        const isClass = fn.prototype instanceof ns.Proxy;
        const eventing = fn.prototype instanceof ns.Eventing;
        const name = options.name || fn.name;
        const call = options.namespace ? `${options.namespace}.${name}` : name;
        const desc = {
            call,
            isClass,
            eventing,
        };
        if (isClass) {
            const stopAt = eventing ? ns.Eventing.prototype : ns.Proxy.prototype;
            const methods = getMethodNames(fn.prototype, stopAt);
            methods.delete('constructor');
            desc.methods = Array.from(methods);
        }
        ns.exports.set(call, {
            desc,
            exec: isClass ? wrapExportClass(fn) : wrapExportFn(fn)
        });
    };


    ns._wrapError = function(pid, e) {
        return {
            success: false,
            pid,
            result: {
                name: e.name,
                message: e.message,
                stack: e.stack
            }
        };
    };


    ns.bindExports = function(exports, buildProxyFunc, buildProxyClass) {
        for (const desc of exports) {
            const path = desc.call.split('.');
            let offt = sauce;
            for (const x of path.slice(0, -1)) {
                offt[x] = offt[x] || {};
                offt = offt[x];
            }
            const builder = desc.isClass ? buildProxyClass : buildProxyFunc;
            if (builder) {
                const name = path[path.length - 1];
                offt[name] = builder(name, desc);
            }
        }
    };


    ns.encodeArgs = function(args) {
        return args.map(x => x === undefined ? '___SAUCE_UNDEFINED_ARG___' : x);
    };


    function decodeArgs(args) {
        return args.map(x => x === '___SAUCE_UNDEFINED_ARG___' ? undefined : x);
    }


    function getMethodNames(obj, stopAt=Object.prototype) {
        const props = new Set();
        do {
            for (const x of Object.getOwnPropertyNames(obj)) {
                if (typeof obj[x] === 'function' && !x.startsWith('_')) {
                    props.add(x);
                }
            }
        } while ((obj = Object.getPrototypeOf(obj)) && obj !== stopAt);
        return props;
    }


    function wrapExportClass(Klass) {
        return async function({pid, port, desc, args}) {
            const instance = new Klass(...decodeArgs(args));
            instance._port = port;
            const wrappedMethods = new Map(desc.methods.map(x => [x, wrapExportFn(instance[x])]));

            async function onPortMessage(data) {
                if (!data || data.type !== 'sauce-proxy-request') {
                    throw new Error("Protocol error in class method request handler");
                }
                let resp;
                const method = wrappedMethods.get(data.desc.call);
                if (!method) {
                    resp = ns._wrapError(new Error('Invalid proxy call: ' + data.desc.call));
                } else {
                    resp = await method.call(instance, data);
                }
                resp.type = 'sauce-proxy-response';
                port.postMessage(resp);
            }

            // This is a safari only condition where they dispatch the establishing
            // postMessage to this event listener despite it being added DURING
            // the handling of the very same message.  And even then it's not consistent,
            // so there seems to be a race condition in their impl.
            await new Promise(r => queueMicrotask(r));

            if (port.addEventListener) {
                port.addEventListener('message', ev => onPortMessage(ev.data));
                port.start();
            } else {
                // bg page has slightly different interface and supports delete.
                port.onMessage.addListener(onPortMessage);
                port.onDisconnect.addListener(() => {
                    try {
                        instance.delete();
                    } finally {
                        instance._port = null;
                    }
                });
            }
            return {
                success: true,
                pid,
                result: null
            };
        };
    }


    function wrapExportFn(fn) {
        const wrap = async function({pid, args}) {
            try {
                const result = await fn.apply(this, decodeArgs(args));
                return {
                    success: true,
                    pid,
                    result
                };
            } catch(e) {
                return ns._wrapError(pid, e);
            }
        };
        if (fn.name) {
            Object.defineProperty(wrap, 'name', {value: `proxyWrap(${fn.name})`});
        }
        return wrap;
    }


    ns.Proxy = class Proxy {
        delete() {
            // Subclasses should implement ref cleanup and remove event listeners here.
        }
    };


    ns.Eventing = class Eventing extends ns.Proxy {
        dispatchEvent(ev) {
            this._port.postMessage({
                type: 'sauce-proxy-event',
                event: ev.type,
                data: ev.data
            });
        }
    };
});
