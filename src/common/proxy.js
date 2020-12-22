/* global sauce  */

(function() {
    'use strict';

    self.sauce = self.sauce || {};
    const ns = sauce.proxy = sauce.proxy || {};

    ns.instances = new Map();
    ns.exports = new Map();


    ns.export = function(fn, options={}) {
        const isClass = (fn.prototype instanceof ns.Proxy) || fn === ns.Proxy;
        const eventing = (fn.prototype instanceof ns.Eventing) || fn === ns.Eventing;
        const name = options.name || fn.name;
        const call = options.namespace ? `${options.namespace}.${name}` : name;
        const desc = {
            call,
            isClass,
            eventing,
        };
        if (isClass) {
            const methods = getMethodNames(fn.prototype);
            methods.delete('constructor');
            desc.methods = Array.from(methods);
        }
        ns.exports.set(call, {
            desc,
            exec: eventing ? wrapExportClass(fn) : wrapExportFn(fn)
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


    function decodeArgs(args) {
        return args.map(x => x === '___SAUCE_UNDEFINED_ARG___' ? undefined : x);
    }


    function getMethodNames(obj) {
        const props = new Set();
        do {
            for (const x of Object.getOwnPropertyNames(obj)) {
                if (typeof obj[x] === 'function') {
                    props.add(x);
                }
            }
        } while ((obj = Object.getPrototypeOf(obj)) && obj !== Object.prototype);
        return props;
    }


    function wrapExportClass(Klass) {
        return async function({pid, port, args}) {
            debugger;
            try {
                const instance = new Klass(...decodeArgs(args));
                ns.instances.set(pid, instance);
                return {
                    success: true,
                    pid,
                    result: null
                };
            } catch(e) {
                console.error('Proxy eventing class error', e);
                return ns._wrapError(pid, e);
            }
        };
    }


    function wrapExportFn(fn) {
        return async function({pid, args}) {
            try {
                const result = await fn.apply(this, decodeArgs(args));
                return {
                    success: true,
                    pid,
                    result
                };
            } catch(e) {
                console.error('Proxy function error', e);
                return ns._wrapError(pid, e);
            }
        };
    }


    ns.Proxy = class Proxy {
        constructor() {
        }
    };


    ns.Eventing = class Eventing extends ns.Proxy {
        dispatchEvent(name, data) {
            throw 'TBD';
        }
    };
})();
