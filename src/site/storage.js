/* global sauce */
/* Just add some client side caching to the proxy calls. */

sauce.ns('storage', ns => {
    'use strict';

    let _prefs;
    let _prefsCache = new Map();
    let _fastPrefsReadyInvoked;  // catch API misuse with this.

    const _fastPrefInit = (async () => {
        if (!sauce.proxy.isConnected) {
            await sauce.proxy.connected;
        }
        _prefs = await sauce.storage.get('preferences');
    })();


    async function fastPrefsReady() {
        if (_prefs === undefined) {
            await _fastPrefInit;
        }
        return (_fastPrefsReadyInvoked = true);
    }


    function getPrefFast(path) {
        if (_fastPrefsReadyInvoked !== true) {
            throw new TypeError('initFastPrefs() call is requried');
        }
        if (!_prefsCache.has(path)) {
            let ref = _prefs || {};
            for (const key of path.split('.')) {
                ref = ref[key];
                if (ref == null) {
                    break;
                }
            }
            _prefsCache.set(path, ref);
        }
        return _prefsCache.get(path);
    }


    async function setPref(path, value) {
        _prefsCache.set(path, value);
        return await ns._setPref(path, value);
    }

    return {
        fastPrefsReady,
        getPrefFast,
        setPref,
    };
});
