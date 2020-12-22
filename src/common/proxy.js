/* global sauce  */

(function() {
    'use strict';

    self.sauce = self.sauce || {};
    const ns = sauce.proxy = sauce.proxy || {};
    const instances = new Map();

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
            const properties = getAllProperties(fn.prototype);
            properties.remove('constructor');
            desc.properties = properties;
            console.error(properties);
        }
        ns.exports.set(call, {
            desc,
            exec: eventing ? wrapExportEventingClass(fn) : wrapExportFn(fn)
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


    function getAllProperties(Klass) {
        let proto = Klass.prototype;
        const props = new Set();
        do {
            for (const x of Reflect.ownKeys(proto)) {
                props.add(x);
            }
        } while ((proto = Reflect.getPrototypeOf(proto)) && proto !== Object.prototype);
        return props;
    }


    function wrapExportEventingClass(Klass) {
        return async function(pid, ...args) {
            try {
                const instance = new Klass(...decodeArgs(args));
                instances.set(pid, instance);
                debugger;
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
        return async function(pid, ...args) {
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


    ns.Proxy = class Proxy {};


    ns.Eventing = class Eventing extends ns.Proxy {

        constructor() {
            super();
            this._listeners = new Map();
        }

        addEventListener(name, callback) {
            if (!this._listeners.has(name)) {
                this._listeners.set(name, new Set());
            }
            this._listeners.get(name).add(callback);
        }

        removeEventListener(name, callback) {
            this._listeners.get(name).delete(callback);
        }

        dispatchEvent(name, data) {
            throw 'TBD';
        }
    };
})();
