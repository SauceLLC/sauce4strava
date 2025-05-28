/* global sauce */

import * as locks from '/src/common/jscoop/locks.mjs';

const sauceBrandName = 'Unbranded'; // Must be in strava backend
const sauceModelName = 'Sauce Meta Data';
const maxFileSize = 65535;
const loadLock = new locks.Lock();

let _athleteId;
let _loadData;
let _csrfToken;


async function encode(data) {
    const r = await sauce.data.compress(JSON.stringify(data));
    return sauce.data.toBase64(await r.arrayBuffer());
}


async function decode(raw) {
    const r = await sauce.data.decompress(sauce.data.fromBase64(raw));
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
}


export async function load(name, {forceFetch}={}) {
    if (forceFetch || !_loadData || (name && !_loadData.some(x => x.name === name))) {
        await loadLock.acquire();
        try {
            if (forceFetch || !_loadData || (name && !_loadData.some(x => x.name === name))) {
                const r = await fetchGear('shoes');
                // XXX Test what happens with no gear present
                if (!r || !Array.isArray(r)) {
                    throw new Error("Fetch gear empty");
                }
                const files = r.filter(x => x.brand_name === sauceBrandName &&
                                            x.model_name === sauceModelName);
                _loadData = await Promise.all(files.map(async x => ({
                    id: x.id,
                    name: x.name,
                    data: await decode(x.description)
                })));
            }
        } finally {
            loadLock.release();
        }
    }
    return get(name);
}


export function get(name) {
    if (!_loadData) {
        return [];
    } else if (!name) {
        return _loadData;
    } else {
        return _loadData.filter(x => x.name === name);
    }
}


export async function create(name, data) {
    const file = data ? await encode(data) : '';
    if (file.length > maxFileSize) {
        throw new Error("File too large");
    }
    const r = await fetchGear(null, {
        method: 'POST',
        body: new URLSearchParams({
            brandName: sauceBrandName,
            modelName: sauceModelName,
            name,
            description: file
        })
    });
    const entry = {id: r.id, name, data};
    _loadData.push(entry);
    await fetchGear(`${entry.id}/retire`, {method: 'PUT'});
    return entry;
}


export async function save(id, data) {
    const existing = _loadData && _loadData.find(x => x.id === id);
    if (!existing) {
        throw new Error("Invalid ID");
    }
    existing.data = data;
    const file = data ? await encode(data) : '';
    if (file.length > maxFileSize) {
        throw new Error("File too large");
    }
    await fetchGear(id, {
        method: 'PUT',
        body: new URLSearchParams({
            brandName: sauceBrandName,
            modelName: sauceModelName,
            name: existing.name, // XXX try without, maybe even try PATCH method
            description: file,
            shoeId: id
        })
    });
}


export async function remove(id) {
    await fetchGear(id, {method: 'DELETE'});
}
