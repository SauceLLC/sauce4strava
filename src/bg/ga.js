/* global sauce */

sauce.ns('ga', ns => {
    'use strict';

    const namespace = 'ga';
    const tabsState = new Map();
    let dnt = !!localStorage.getItem('dnt') || navigator.doNotTrack === '1';
    let clientUuid = localStorage.getItem("anonymousClientUuid");
    if (!clientUuid) {
        clientUuid = sauce.randomUUID();
        localStorage.setItem("anonymousClientUuid", clientUuid);
    }


    function getTabState(id) {
        if (!tabsState.has(id)) {
            tabsState.set(id, {id});
        }
        return tabsState.get(id);
    }


    function getTabId(scope) {
        return (scope && scope.tab && scope.tab.id) || ((scope && scope.url) ? 'ext-page' : 'bg-page');
    }


    ns.set = function set(key, value) {
        const id = getTabId(this);
        getTabState(id)[key] = value;
    };
    sauce.proxy.export(ns.set, {namespace});


    const pendingSends = [];
    let sendBatchId;
    let onlineErrorCount = 0;
    async function sendBatch() {
        // Ref: https://developers.google.com/analytics/devguides/collection/protocol/v1/devguide#batch-limitations
        if (navigator.onLine === false) {
            sendBatchId = setTimeout(sendBatch, 4000);
            return;
        }
        sendBatchId = null;
        const maxSize = 1024 * 16;
        const maxEntries = 20;
        const batch = Array.from(pendingSends);
        pendingSends.length = 0;
        while (batch.length) {
            const entries = [];
            let size = 0;
            while (entries.length < maxEntries && batch.length) {
                const [ts, q] = batch[0];
                q.set('qt', Date.now() - ts);
                const data = q.toString();
                size += data.length;
                if (size + data.length > maxSize) {
                    break;
                } else {
                    entries.push(data);
                    size += data.length;
                    batch.shift();
                }
            }
            try {
                const r = await fetch('https://www.google-analytics.com/batch', {
                    method: 'POST',
                    body: entries.join('\n'),
                });
                if (!r.ok) {
                    throw new Error(r.status);
                }
            } catch(e) {
                if (navigator.onLine === true) {
                    if (++onlineErrorCount > 10) {
                        dnt = true;
                        localStorage.setItem('dnt', '1');
                    }
                }
            }
        }
    }

    ns.sendSoon = function sendSoon(type, options={}) {
        if (dnt) {
            return;
        }
        const id = getTabId(this);
        const state = getTabState(id);
        const gaHostname = 'www.strava.com';  // Has to be this to avoid GA filtering it out.
        if (options.href) {
            state.location = options.href.split('#')[0];
        } else if (this && this.url) {
            const url = new URL(this.url);
            if (url.hostname === gaHostname) {
                state.location = url.href.split('#')[0];
            } else {
                state.location = `https://${gaHostname}/EXTENSION_PAGE${url.pathname}${url.search}`;
            }
        } else {
            state.location = `https://${gaHostname}/EXTENSION_BG${location.pathname}${location.search}`;
        }
        if (this && this.tab) {
            state.viewportSize = `${this.tab.width}x${this.tab.height}`;
        }
        if (options.referrer) {
            state.referrer = options.referrer;
        }
        // Ref: https://developers.google.com/analytics/devguides/collection/protocol/v1/parameters
        const params = {
            v: 1, // version
            aip: 1,  // anonymize IP
            tid: 'UA-64711223-1',
            an: 'sauce',
            av: sauce.version,
            cid: clientUuid,
            t: type,
            dr: state.referrer,
            dl: state.location,
            ec: options.eventCategory,
            ea: options.eventAction,
            el: options.eventLabel,
            ev: options.eventValue,
            ni: options.nonInteraction ? 1 : undefined,
            sr: `${screen.width}x${screen.height}`,
            vp: state.viewportSize,
            ul: navigator.language,
            exd: options.exDescription,
        };
        const q = new URLSearchParams(Object.entries(params).filter(([k, v]) => v != null));
        for (const [k, v] of q.entries()) {
            const specLimits = {
                dr: 2048,
                dl: 2048,
                dt: 1500,
                ec: 150,
                ea: 500,
                el: 500,
                exd: 150,
            };
            const limit = specLimits[k];
            if (limit && v.length > limit) {
                q.set(k, v.slice(0, limit));
            }
        }
        while (pendingSends.length > 100) {
            pendingSends.shift();
        }
        pendingSends.push([Date.now(), q]);
        if (sendBatchId) {
            clearTimeout(sendBatchId);
        }
        sendBatchId = setTimeout(sendBatch, 5000);
    };
    sauce.proxy.export(ns.sendSoon, {namespace});
});
