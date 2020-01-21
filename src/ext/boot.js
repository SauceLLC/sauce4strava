/* global chrome, sauce */

(async function() {
    'use strict';

    const manifests = [{
        name: 'Analysis',
        pathMatch: /^\/activities\/.*/,
        scripts: [
            'base.js',
            'rpc.js',
            'sparkline.js',
            'lib.js',
            'export.js',
            'analysis.js',
        ]
    }, {
        name: 'Dashboard',
        pathMatch: /^\/dashboard(\/.*|\b)/,
        scripts: [
            'base.js',
            'rpc.js',
            'lib.js',
            'dashboard.js'
        ]
    }];

    const migrations = [{
        version: 1,
        name: 'options',
        migrate: async config => {
            const defaultOptions = {
                "analysis-segment-badges": true,
                "analysis-cp-chart": true,
                "activity-hide-promotions": true
            };
            const options = config.options || {};
            for (const [key, value] of Object.entries(defaultOptions)) {
                if (options[key] === undefined) {
                    options[key] = value;
                }
            }
            await sauce.storage.set({options});
        }
    }, {
        version: 2,
        name: 'ftp_overrides',
        migrate: async config => {
            if (config.ftp_overrides) {
                return;  // already applied (probably pre migration sys release).
            }
            const ftp_overrides = {};
            const athlete_info = config.athlete_info || {};
            for (const [key, value] of Object.entries(config)) {
                if (key.indexOf('athlete_ftp_') === 0) {
                    // XXX Add migration in future that does:
                    //     `await sauce.storage.remove(key)`
                    const id = Number(key.substr(12));
                    console.info("Migrating athlete FTP override for:", id);
                    ftp_overrides[id] = value;
                    athlete_info[id] = {
                        name: `Athlete ID: ${id}`
                    };
                }
            }
            await sauce.storage.set({ftp_overrides, athlete_info});
        }
    }, {
        // Note this marks the first migration that will only run once in the new system.
        version: 3,
        name: 'athlete_info_for_ftp_overrides',
        migrate: async config => {
            const athlete_info = config.athlete_info || {};
            if (config.ftp_overrides) {
                for (const [id, ftp] of Object.entries(config.ftp_overrides)) {
                    const athlete = athlete_info[id] || {name: `Athlete ID: ${id}`};
                    athlete.ftp_override = ftp;
                }
                await sauce.storage.set({athlete_info});
                await sauce.storage.remove('ftp_overrides');
            }
        }
    }, {
        version: 4,
        name: 'athlete_info_for_weight_overrides',
        migrate: async config => {
            const athlete_info = config.athlete_info || {};
            if (config.weight_overrides) {
                for (const [id, weight] of Object.entries(config.weight_overrides)) {
                    const athlete = athlete_info[id] || {name: `Athlete ID: ${id}`};
                    athlete.weight_override = weight;
                }
                await sauce.storage.set({athlete_info});
                await sauce.storage.remove('weight_overrides');
            }
        }
    }];


    function sendMessageToBackground(msg) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(undefined, msg, undefined, resp => {
                if (resp === undefined || !resp.success) {
                    const err = resp ? resp.error : 'general error';
                    reject(new Error(err));
                } else {
                    resolve(resp.data);
                }
            });
        });
    }


    function addScriptElement(script, top) {
        const rootElement = document.head || document.documentElement;
        if (top) {
            const first = rootElement.firstChild;
            if (first) {
                rootElement.insertBefore(script, first);
            } else {
                rootElement.appendChild(script);
            }
        } else {
            document.head.appendChild(script);
        }
    }


    function loadScript(url, options) {
        options = options || {};
        const script = document.createElement('script');
        if (!options.blocking) {
            script.defer = 'defer';
        }
        const p = new Promise(resolve => script.onload = resolve);
        script.src = url;
        addScriptElement(script, options.top);
        return p;
    }


    function insertScript(content) {
        const script = document.createElement('script');
        script.textContent = content;
        addScriptElement(script, true);
    }


    async function initConfig() {
        // Perform storage migration/setup here and return config object.
        const initialVersion = await sauce.storage.get('migrationVersion');
        for (const x of migrations) {
            if (initialVersion && initialVersion >= x.version) {
                continue;
            }
            console.warn("Running migration:", x.name, x.version);
            try {
                await x.migrate(await sauce.storage.get(null));
            } catch(e) {
                // XXX While this system is new prevent death by exception.
                console.error("Migration Error:", e);
                break;
            }
            await sauce.storage.set('migrationVersion', x.version);
        }
        return await sauce.storage.get(null);
    }


    async function load() {
        const extUrl = chrome.extension.getURL('');
        await loadScript(`${extUrl}src/site/preloader.js`, {blocking: true, top: true});
        const config = await initConfig();
        if (config.enabled === false) {
            console.info("Sauce is disabled");
            return;
        }
        document.documentElement.classList.add('sauce-enabled');
        const appDetails = await sendMessageToBackground({system: 'app', op: 'getDetails'});
        insertScript(`
            self.sauce = self.sauce || {};
            sauce.options = ${JSON.stringify(config.options)};
            sauce.extURL = "${extUrl}";
            sauce.extID = "${chrome.runtime.id}";
            sauce.name = "${appDetails.name}";
            sauce.version = "${appDetails.version}";
        `);
        for (const x of manifests) {
            if (location.pathname.match(x.pathMatch)) {
                console.info(`Sauce loading: ${x.name}`);
                for (const url of x.scripts) {
                    await loadScript(`${extUrl}src/site/${url}`);
                }
            }
        }
    }

    load();
})();
