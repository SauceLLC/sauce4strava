/* global sauce */

async function updatePatronLevelNames() {
    const ts = await sauce.storage.get('patronLevelNamesTimestamp');
    if (!ts || ts < Date.now() - (7 * 86400 * 1000)) {
        await sauce.storage.set('patronLevelNamesTimestamp', Date.now());  // backoff regardless
        const resp = await fetch('https://www.sauce.llc/patron_levels.json');
        const patronLevelNames = await resp.json();
        patronLevelNames.sort((a, b) => b.level - a.level);
        await sauce.storage.set({patronLevelNames});
    }
}


async function updatePatronLevel(athleteId) {
    let legacy = false;
    let level = 0;
    const errors = [];
    try {
        if (await sauce.storage.get('patreon-auth')) {
            const d = await getPatreonMembership();
            level = (d && d.patronLevel) || 0;
        }
    } catch(e) {
        errors.push(e);
    }
    try {
        if (!level && athleteId) {
            [level, legacy] = await getPatronLevelLegacy(athleteId);
        }
    } catch(e) {
        errors.push(e);
    }
    if (errors.length) {
        for (const e of errors) {
            if (e.message && !e.message.match(/NetworkError/)) {
                sauce.report.error(e);
            }
        }
        await sauce.storage.set('patronLevelExpiration', Date.now() + (12 * 3600 * 1000));  // backoff
    }
    return [level, legacy];
}


async function _setPatronCache(level, isLegacy) {
    await sauce.storage.set({
        patronLevel: level,
        patronLegacy: isLegacy || false,
        patronLevelExpiration: Date.now() + (level ? (7 * 86400 * 1000) : (3600 * 1000))
    });
    return [level, isLegacy];
}


async function getPatronLevelLegacy(athleteId) {
    const resp = await fetch('https://www.sauce.llc/patrons.json');
    const fullPatrons = await resp.json();
    const hash = await sauce.sha256(athleteId);
    let level = 0;
    let legacy = false;
    if (fullPatrons[hash]) {
        level = fullPatrons[hash].level;
        legacy = true;
    }
    await _setPatronCache(level, legacy);
    return [level, legacy];
}


async function getPatreonMembership(options={}) {
    const auth = await sauce.storage.get('patreon-auth');
    if (auth) {
        const q = options.detailed ? 'detailed=1' : '';
        const r = await fetch(`https://api.saucellc.io/patreon/membership?${q}`, {
            headers: {Authorization: `${auth.id} ${auth.secret}`}
        });
        if (!r.ok) {
            if ([401, 403].includes(r.status)) {
                await sauce.storage.set('patreon-auth', null);
            }
            if (r.status !== 404) {
                sauce.report.error(new Error('Failed to get patreon membership: ' + r.status));
            }
        } else {
            const data = await r.json();
            await _setPatronCache((data && data.patronLevel) || 0, false);
            return data;
        }
    }
}


export function initProxyExports() {
    sauce.proxy.export(updatePatronLevel, {namespace: 'patron'});
    sauce.proxy.export(updatePatronLevelNames, {namespace: 'patron'});
    sauce.proxy.export(getPatreonMembership, {namespace: 'patron'});
}
