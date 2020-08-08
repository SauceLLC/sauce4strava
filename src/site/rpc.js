/* global sauce */

sauce.ns('rpc', function() {
    'use strict';


    async function storageSet() {
        const args = Array.from(arguments);
        return await invoke({system: 'storage', op: 'set', data: {args}});
    }


    async function storageGet() {
        const args = Array.from(arguments);
        return await invoke({system: 'storage', op: 'get', data: {args}});
    }


    async function getAthleteInfo(id) {
        const athlete_info = await storageGet('athlete_info');
        if (athlete_info && athlete_info[id]) {
            return athlete_info[id];
        }
    }


    async function storageUpdate() {
        const args = Array.from(arguments);
        return await invoke({system: 'storage', op: 'update', data: {args}});
    }


    async function updateAthleteInfo(id, updates) {
        return await storageUpdate(`athlete_info.${id}`, updates);
    }


    async function setAthleteProp(id, key, value) {
        await updateAthleteInfo(id, {[key]: value});
    }


    async function getAthleteProp(id, key) {
        const info = await getAthleteInfo(id);
        return info && info[key];
    }


    async function ga() {
        const args = Array.from(arguments);
        const meta = {referrer: document.referrer};
        return await invoke({system: 'ga', op: 'apply', data: {meta, args}});
    }


    async function reportEvent(eventCategory, eventAction, eventLabel, options) {
        await sauce.rpc.ga('send', 'event', Object.assign({
            eventCategory,
            eventAction,
            eventLabel,
        }, options));
    }


    async function reportError(e) {
        if (e && e.disableReport) {
            console.warn('Ignoring non-reporting error:', e);
            return;
        }
        const page = location.pathname;
        const desc = [`v${sauce && sauce.version}`];
        try {
            if (e == null || !e.stack) {
                console.error("Non-exception object was thrown:", e);
                const props = {type: typeof e};
                try {
                    props.json = JSON.parse(JSON.stringify(e));
                } catch(_) {/*no-pragma*/}
                if (e != null) {
                    props.klass = e.constructor && e.constructor.name;
                    props.name = e.name;
                    props.message = e.message;
                    props.code = e.code;
                }
                desc.push(`Invalid Error: ${JSON.stringify(props)}`);
                for (const x of _stackFrameAudits) {
                    desc.push(` Audit frame: ${x}`);
                }
            } else {
                desc.push(e.stack);
            }
        } catch(intError) {
            desc.push(`Internal error during report error: ${intError.stack} ::: ${e}`);
        }
        for (const x of getStackFrames().slice(1)) {
            desc.push(` Stack frame: ${x}`);
        }
        const exDescription = desc.join('\n');
        console.error('Reporting:', exDescription);
        await sauce.rpc.ga('send', 'exception', {
            exDescription,
            exFatal: true,
            page
        });
        await reportEvent('Error', 'exception', desc, {nonInteraction: true, page});
    }


    function getStackFrames() {
        const e = new Error();
        return e.stack.split(/\n/).slice(2).map(x => x.trim());
    }


    let _stackFrameAudits = [];
    function auditStackFrame() {
        const frames = getStackFrames();
        const caller = frames && frames[1];
        if (typeof caller === 'string') { // be paranoid for now
            _stackFrameAudits.push(caller);
        }
    }


    async function getLocaleMessage() {
        const data = Array.from(arguments);
        return await invoke({system: 'locale', op: 'getMessage', data});
    }


    async function getLocaleMessages(data) {
        return await invoke({system: 'locale', op: 'getMessages', data});
    }


    async function ping(...data) {
        return await invoke({system: 'util', op: 'ping', data});
    }


    async function bgping(...data) {
        return await invoke({system: 'util', op: 'bgping', data});
    }


    async function openOptionsPage() {
        return await invoke({system: 'options', op: 'openOptionsPage'});
    }


    async function trailforksIntersections() {
        const args = Array.from(arguments);
        return await invoke({system: 'trailforks', op: 'intersections', data: {args}});
    }


    const _invokePromise = (async () => {
        // Instead of just broadcasting all RPC over generic 'message' events, create a channel
        // which is like a unix pipe pair and transfer one of the ports to the ext for us
        // to securely and performantly talk over.
        const rpcCallbacks = new Map();
        const reqChannel = new MessageChannel();
        const reqPort = reqChannel.port1;
        await new Promise((resolve, reject) => {
            function onMessageEstablishChannelAck(ev) {
                reqPort.removeEventListener('message', onMessageEstablishChannelAck);
                if (!ev.data || ev.data.extId !== sauce.extId ||
                    ev.data.type !== 'sauce-rpc-establish-channel-ack') {
                    reject(new Error('RPC Protocol Violation [CONTENT] [ACK]!'));
                    return;
                }
                const respPort = ev.ports[0];
                respPort.addEventListener('message', ev => {
                    if (!ev.data || ev.data.extId !== sauce.extId || ev.data.type !== 'sauce-rpc-response') {
                        throw new Error('RPC Protocol Violation [CONTENT] [RESP]!');
                    }
                    if (ev.data.success === true) {
                        const rid = ev.data.rid;
                        const {resolve} = rpcCallbacks.get(rid);
                        rpcCallbacks.delete(rid);
                        resolve(ev.data.result);
                    } else if (ev.data.success === false) {
                        const rid = ev.data.rid;
                        const {reject} = rpcCallbacks.get(rid);
                        rpcCallbacks.delete(rid);
                        reject(new Error(ev.data.result || 'unknown rpc error'));
                    } else {
                        throw new TypeError("RPC Protocol Violation [DATA]");
                    }
                });
                respPort.start();
                resolve();
            }
            reqPort.addEventListener('message', onMessageEstablishChannelAck);
            reqPort.addEventListener('messageerror', ev => console.error('Message Error:', ev));
            reqPort.start();
            window.postMessage({
                type: 'sauce-rpc-establish-channel',
                extId: sauce.extId,
            }, self.origin, [reqChannel.port2]);
        });
        let rpcId = 0;
        return msg => {
            return new Promise((resolve, reject) => {
                const rid = rpcId++;
                rpcCallbacks.set(rid, {resolve, reject});
                reqPort.postMessage({
                    rid,
                    msg,
                    type: 'sauce-rpc-request',
                    extId: sauce.extId
                });
            });
        };
    })();

    let invoke = async msg => {
        invoke = await _invokePromise;
        return await invoke(msg);
    };

    return {
        getAthleteInfo,
        updateAthleteInfo,
        getAthleteProp,
        setAthleteProp,
        storageSet,
        storageGet,
        storageUpdate,
        ga,
        reportEvent,
        reportError,
        auditStackFrame,
        getLocaleMessage,
        getLocaleMessages,
        ping,
        bgping,
        openOptionsPage,
        trailforksIntersections,
    };
});
