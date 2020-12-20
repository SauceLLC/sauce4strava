/* global sauce  */

(function() {
    'use strict';

    self.sauce = self.sauce || {};
    const ns = sauce.proxy = sauce.proxy || {};

    ns.exports = new Map();


    ns.export = function(fn, options={}) {
        const eventing = !!options.eventing;
        const name = options.name || fn.name;
        const call = options.namespace ? `${options.namespace}.${name}` : name;
        ns.exports.set(call, {
            desc: {
                call,
                eventing
            },
            exec: wrapExportFn(fn)
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
})();
