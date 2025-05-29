/* global sauce */

import * as locks from '/src/common/jscoop/locks.mjs';

const sauceBrandName = 'Unbranded'; // Must be in strava backend
const sauceModelName = 'Sauce Meta Data';
const maxGearDescSize = 65535;
const loadLock = new locks.Lock();
const metaVersion = 1;

let _athleteId;
let _loadData;
let _csrfToken;


async function encode(data) {
    const r = await sauce.data.compress(JSON.stringify(data));
    return [metaVersion, sauce.data.toBase64(await r.arrayBuffer())].join('\n');
}


async function decode(raw) {
    const v = raw.split('\n', 1)[0];
    if (+v !== metaVersion) {
        throw new TypeError("Incompatible gear file version");
    }
    const r = await sauce.data.decompress(sauce.data.fromBase64(raw.substr(v.length + 1)));
    return await r.json();
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
        throw new Error("Failed to get csrf token for gear files");
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
        headers: {
            'x-requested-with': 'XMLHttpRequest',
            'x-csrf-token': _csrfToken,
        }
    });
    if (!resp.ok) {
        console.error(`fetchGear error [${resp.status}]:`, await resp.text());
        throw new Error("Gear Fetch Error");
    }
    const data = await resp.json();
    if (data && data.pathType === 'session_expired') {
        _csrfToken = null;
        if (_allowRetry !== false) {
            return await fetchGear(resource, options, false);
        } else {
            console.error("Aborting gear fetch loop");
            throw new Error("Gear Fetch Loop Error");
        }
    }
    return data;
}


export function init({athleteId}) {
    _athleteId = athleteId;
    console.debug("Init meta gear store:", athleteId);
}


export async function load(name, {forceFetch}={}) {
    if (forceFetch || !_loadData || (name && !_loadData.some(x => x.name === name))) {
        await loadLock.acquire();
        try {
            if (forceFetch || !_loadData || (name && !_loadData.some(x => x.name === name))) {
                console.debug("Fetching meta gear files");
                const r = await fetchGear('shoes');
                const files = r.filter(x => x.brand_name === sauceBrandName &&
                                            x.model_name === sauceModelName);
                _loadData = await Promise.all(files.map(async x => {
                    let decoded;
                    let corrupt;
                    try {
                        decoded = await decode(x.description);
                        corrupt = false;
                    } catch(e) {
                        console.error("Failed to decode gear file:", e);
                        corrupt = true;
                        decoded = {};
                    }
                    return {
                        id: x.id,
                        name: x.name,
                        corrupt,
                        created: decoded.created,
                        updated: decoded.updated,
                        data: decoded.data,
                    };
                }));
            }
            return _get(name);
        } finally {
            loadLock.release();
        }
    }
    return await get(name);
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
        return name ? filtered.filter(x => x.name === name) : filtered;
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
    const encoded = await encode({
        created,
        updated: created,
        data,
    });
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
    const entry = {id: r.id, name, created, updated: created, data};
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
    const encoded = await encode({
        created: entry.created,
        updated: entry.updated,
        data,
    });
    if (encoded.length > maxGearDescSize) {
        throw new Error("File too large");
    }
    await fetchGear(id, {
        method: 'PUT',
        body: new URLSearchParams({
            brandName: sauceBrandName,
            modelName: sauceModelName,
            name: entry.name, // XXX try without, maybe even try PATCH method
            description: encoded,
            shoeId: id
        })
    });
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
