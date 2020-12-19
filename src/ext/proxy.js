/* global sauce, browser */

(function() {
    'use strict';

    self.sauce = self.sauce || {};
    const ns = sauce.proxy = sauce.proxy || {};
    const bgInit = browser.runtime.sendMessage({call: 'sauce-proxy-init'});
    const exports = new Map();

    ns.export = function(fn, options={}) {
        const eventing = !!options.eventing;
        const name = options.name || fn.name;
        const call = options.namespace ? `${options.namespace}.${name}` : name;
        exports.set(call, {
            desc: {
                call, eventing
            },
            fn
        });
    };


    function makeBackgroundProxy(desc) {
        return async function(...args) {
            return await browser.runtime.sendMessage(desc, ...args);
        };
    }


    async function messageHandler(msg) {
        const hook = sauce.proxy.hooks[msg.system][msg.op];
        if (!hook) {
            throw new Error(`Invalid proxy hook: ${msg.system} ${msg.op}`);
        }
        if (msg.bg || (hook.options && hook.options.bg)) {
            return await browser.runtime.sendMessage(msg);
        } else {
            return await hook.callback(msg.data);
        }
    }


    async function onMessageEstablishChannel(ev) {
        const extId = browser.runtime.id;
        if (ev.source !== self || !ev.data || ev.data.extId !== extId ||
            ev.data.type !== 'sauce-proxy-establish-channel') {
            return;
        }
        window.removeEventListener('message', onMessageEstablishChannel);
        for (const desc of await bgInit) {
            exports.set(desc.call, {desc, fn: makeBackgroundProxy(desc)});
        }
        const reqPort = ev.ports[0];
        const respChannel = new MessageChannel();
        const respPort = respChannel.port1;
        reqPort.addEventListener('message', async ev => {
            if (!ev.data || ev.data.extId !== extId) {
                throw new TypeError('Proxy Protocol Violation [PAGE]');
            }
            let data;
            try {
                const result = await messageHandler(ev.data.msg);
                data = {success: true, pid: ev.data.pid, result};
            } catch(e) {
                console.error('Proxy Hook Error:', e);
                data = {success: false, pid: ev.data.pid, result: e.message};
            }
            data.extId = extId;
            data.type = 'sauce-proxy-response';
            respPort.postMessage(data);
        });
        reqPort.addEventListener('messageerror', ev => console.error("Message Error:", ev));
        reqPort.start();
        reqPort.postMessage({
            type: 'sauce-proxy-establish-channel-ack',
            extId,
            exports: Array.from(exports.values()).map(x => x.desc)
        }, [respChannel.port2]);
    }
    window.addEventListener('message', onMessageEstablishChannel);
})();
