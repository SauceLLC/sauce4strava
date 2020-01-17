/* global chrome, sauce */

(async function() {
    'use strict';

    const manifests = [{
        name: 'Analysis',
        pathMatch: /^\/activities\/.*/,
        scripts: [
            'jquery.sparkline.js',
            'base.js',
            'rpc.js',
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


    function loadScript(url) {
        const script = document.createElement('script');
        script.defer = 'defer';
        const p = new Promise(resolve => script.onload = resolve);
        script.src = url;
        document.head.appendChild(script);
        return p;
    }


    function insertScript(content) {
        const script = document.createElement('script');
        script.textContent = content;
        document.head.appendChild(script);
    }


    async function initConfig() {
        // Perform storage migration/setup here and return config object.
        const initialVersion = await sauce.storage.get('migrationVersion');
        for (const x of migrations) {
            if (initialVersion && initialVersion >= x.version) {
                console.info("Skipping completed migration:", x.name, x.version);
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
        const config = await initConfig();
        if (config.enabled === false) {
            console.info("Strava sauce is disabled");
            return;
        }
        document.documentElement.classList.add('sauce-enabled');
        const appDetails = await sendMessageToBackground({system: 'app', op: 'getDetails'});
        const extUrl = chrome.extension.getURL('');
        insertScript(`
            window.sauce = {};
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
