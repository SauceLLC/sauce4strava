/* global sauce, browser */

sauce.ns('migrate', ns => {
    'use strict';

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
    }, {
        version: 5,
        name: 'set_default_dashboard_chrono_mode',
        migrate: async config => {
            config.options['activity-chronological-mode'] = 'updated';
            await sauce.storage.set({options: config.options});
        }
    }, {
        version: 6,
        name: 'theme_option',
        migrate: async config => {
            config.options['theme'] = config.options['dark-mode'] ? 'dark' : undefined;
            delete config.options['dark-mode'];
            await sauce.storage.set({options: config.options});
        }
    }];


    ns.runMigrations = async function() {
        // Perform storage migration/setup here and return config object.
        const local = await browser.storage.local.get('migrationVersion');
        if (!local || local.migrationVersion == null) {
            // Possibly this is an upgrade from sync -> local, but might also
            // just be a new install.
            try {
                const o = await browser.storage.sync.get(null);
                if (o && Object.keys(o).length) {
                    console.info("Migrating from sync-storage to local-storage");
                    await browser.storage.local.set(o);
                }
            } catch(e) {
                // Sync storage not supported.
            }
        }
        const initialVersion = await sauce.storage.get('migrationVersion');
        for (const x of migrations) {
            if (initialVersion && initialVersion >= x.version) {
                continue;
            }
            console.info("Running migration:", x.name, x.version);
            try {
                await x.migrate(await sauce.storage.get(null));
            } catch(e) {
                // XXX While this system is new prevent death by exception.
                console.error("Migration Error:", e);
                break;
            }
            await sauce.storage.set('migrationVersion', x.version);
        }
    };
});
