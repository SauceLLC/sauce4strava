/* global sauce */

import * as locks from '/src/common/jscoop/locks.mjs';

const sauceBrandName = 'Unbranded'; // Must be in strava backend
const sauceModelName = '__SMETA__';
const maxGearDescSize = 65535;
const loadLock = new locks.Lock();
const metaVersion = 1;

let _athleteId;
let _loadData;
let _csrfToken;


async function computeHash(data) {
    return await crypto.subtle.digest('SHA-1', data);
}


function bufToHex(data) {
    return Array.from(new Uint8Array(data)).map(x => x.toString(16).padStart(2, '0')).join('');
}


async function compress(obj) {
    return await (await sauce.data.compress(JSON.stringify(obj))).arrayBuffer();
}


async function decompress(buf) {
    return await (await sauce.data.decompress(buf)).json();
}


async function encode(data, attrs) {
    const dataBuf = await compress(data);
    const attrsBuf = attrs ? await compress(attrs) : undefined;
    const hashBuf = await computeHash(dataBuf);
    const encoded = [
        metaVersion,
        sauce.data.toBase64(dataBuf),
        sauce.data.toBase64(hashBuf),
        sauce.data.toBase64(attrsBuf),
    ].join('\n');
    return {
        encoded,
        hash: bufToHex(hashBuf),
    };
}


async function decode(raw) {
    const v = raw.split('\n', 1)[0];
    if (+v !== metaVersion) {
        throw new TypeError("Incompatible version");
    }
    const [, b64Data, b64Hash, b64Attrs] = raw.split('\n');
    const dataBuf = sauce.data.fromBase64(b64Data);
    const hashBuf = await computeHash(dataBuf);
    if (b64Hash !== sauce.data.toBase64(hashBuf)) {
        debugger;
        throw new Error("Hash Mismatch");
    }
    const data = await decompress(dataBuf);
    const attrs = b64Attrs ? await decompress(sauce.data.fromBase64(b64Attrs)) : undefined;
    return {
        data,
        hash: bufToHex(hashBuf),
        attrs,
    };
}


async function refreshCSRFToken() {
    const resp = await fetch(`https://www.strava.com/settings/gear`);
    if (resp.ok) {
        const html = await resp.text();
        const m = html.match(/<.*?meta.*?name=["']csrf-token["'].*?content="(.*?)".*?>/);
        if (m) {
            _csrfToken = m[1];
        }
    }
    if (!_csrfToken) {
        throw new Error("Failed to get csrf token for Gear API");
    }
}


async function fetchGear(resource, options={}, _allowRetry) {
    if (!_athleteId) {
        throw new Error("meta.init(...) required");
    }
    const urn = resource ? `/${resource}` : '';
    if (!_csrfToken) {
        await refreshCSRFToken();
    }
    const resp = await fetch(`https://www.strava.com/athletes/${_athleteId}/gear${urn}`, {
        ...options,
        redirect: 'manual',
        headers: {
            'x-requested-with': 'XMLHttpRequest',
            'x-csrf-token': _csrfToken,
        }
    });
    let needSessionRefresh;
    if (!resp.ok) {
        if (resp.type === 'opaqueredirect') {
            needSessionRefresh = true;
        } else {
            console.error(`fetchGear error [${resp.status}]:`, await resp.text());
            throw new Error("Gear Fetch Error");
        }
    } else {
        const data = await resp.json();
        if (data && data.pathType === 'session_expired') {
            needSessionRefresh = true;
        } else {
            return data;
        }
    }
    if (needSessionRefresh) {
        _csrfToken = null;
        if (_allowRetry !== false) {
            return await fetchGear(resource, options, false);
        } else {
            console.error("Aborting gear fetch loop");
            throw new Error("Gear Fetch Loop Error");
        }
    }
}


export function init({athleteId}) {
    _athleteId = athleteId;
    console.debug("Init meta gear store:", athleteId);
}


export async function load({forceFetch}={}) {
    if (forceFetch || !_loadData) {
        await loadLock.acquire();
        try {
            if (forceFetch || !_loadData) {
                console.debug("Fetching meta gear files");
                const r = await fetchGear('shoes');
                const files = r.filter(x => x.brand_name === sauceBrandName &&
                                            x.model_name === sauceModelName);
                _loadData = await Promise.all(files.map(async x => {
                    const entry = {id: x.id, name: x.name};
                    try {
                        const {data, hash, attrs} = await decode(x.description);
                        Object.assign(entry, {
                            created: attrs.created,
                            updated: attrs.updated,
                            data,
                            hash,
                        });
                    } catch(e) {
                        console.warn("Failed to decode gear file:", e);
                        entry.corrupt = true;
                    }
                    return entry;
                }));
            }
            return _get();
        } finally {
            loadLock.release();
        }
    }
    return await get();
}


export async function get(...args) {
    await loadLock.acquire();
    try {
        return _get(...args);
    } finally {
        loadLock.release();
    }
}


function _get(name, {corrupt}={}) {
    if (!_loadData) {
        return [];
    } else {
        const filtered = corrupt ? _loadData : _loadData.filter(x => !x.corrupt);
        if (name) {
            const lookupPath = name.split('/');
            if (!lookupPath[lookupPath.length - 1]) {
                lookupPath.pop();  // trailing slash
            }
            return filtered.filter(entry => {
                const path = entry.name.split('/');
                return lookupPath.every((x, i) => path[i] === x);
            });
        } else {
            return filtered;
        }
    }
}


export async function create(...args) {
    await loadLock.acquire();
    try {
        return await _create(...args);
    } finally {
        loadLock.release();
    }
}


async function _create(name, data) {
    console.debug("Creating meta gear file (name):", name, data);
    const created = Date.now();
    const {encoded, hash} = await encode(data, {created, updated: created});
    if (encoded.length > maxGearDescSize) {
        throw new Error("Data too large");
    }
    const r = await fetchGear(null, {
        method: 'POST',
        body: new URLSearchParams({
            brandName: sauceBrandName,
            modelName: sauceModelName,
            name,
            description: encoded,
        })
    });
    const entry = {id: r.id, name, created, updated: created, data, hash};
    if (!_loadData) {
        console.warn("meta.load() not called prior to create()");
        _loadData = [];
    }
    _loadData.push(entry);
    await fetchGear(`${entry.id}/retire`, {method: 'PUT'});
    return entry;
}


export async function save(...args) {
    await loadLock.acquire();
    try {
        return await _save(...args);
    } finally {
        loadLock.release();
    }
}


async function _save(id, data) {
    console.debug("Saving meta gear file:", id, data);
    const entry = _loadData && _loadData.find(x => x.id === id);
    if (!entry) {
        throw new Error("Invalid ID");
    }
    entry.data = data;
    entry.updated = Date.now();
    if (entry.corrupt) {
        console.warn("Repairing corrupt file:", id);
        entry.corrupt = false;
        if (!entry.created) {
            entry.created = entry.updated;
        }
    }
    const {encoded, hash} = await encode(data, {created: entry.created, updated: entry.updated});
    entry.hash = hash;
    if (encoded.length > maxGearDescSize) {
        throw new Error("File too large");
    }
    await fetchGear(id, {
        method: 'PATCH',
        body: new URLSearchParams({
            brandName: sauceBrandName,
            modelName: sauceModelName,
            description: encoded,
            shoeId: id
        })
    });
    return entry;
}


export async function remove(id) {
    console.debug("Removing meta gear file:", id);
    await loadLock.acquire();
    try {
        await fetchGear(id, {method: 'DELETE'});
        const idx = _loadData.findIndex(x => x.id === id);
        if (idx !== -1) {
            _loadData.splice(idx, 1);
        }
    } finally {
        loadLock.release();
    }
}


export function initProxyExports() {
    sauce.proxy.export(load, {namespace: 'meta'});
    sauce.proxy.export(get, {namespace: 'meta'});
    sauce.proxy.export(create, {namespace: 'meta'});
    sauce.proxy.export(save, {namespace: 'meta'});
    sauce.proxy.export(remove, {namespace: 'meta'});
}
