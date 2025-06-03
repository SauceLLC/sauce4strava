/* global sauce */

const namespace = 'migrate';

sauce.ns(namespace, ns => {
    'use strict';


    async function setDefaultConfigOptions(config, defaultOptions) {
        const options = config.options || {};
        for (const [key, value] of Object.entries(defaultOptions)) {
            if (options[key] === undefined) {
                options[key] = value;
            }
        }
        await sauce.storage.set({options});
    }


    const migrations = [{
        version: 1,
        name: 'options',
        migrate: async config => {
            await setDefaultConfigOptions(config, {
                "analysis-segment-badges": true,
                "analysis-cp-chart": true,
                "activity-hide-promotions": true
            });
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
        version: 6,
        name: 'theme_option',
        migrate: async config => {
            config.options['theme'] = config.options['dark-mode'] ? 'dark' : undefined;
            delete config.options['dark-mode'];
            await sauce.storage.set({options: config.options});
        }
    }, {
        version: 7,
        name: 'mobile_responsive',
        migrate: async config => {
            if (sauce.isMobile()) {
                const options = config.options;
                if (options['responsive'] == null) {
                    options['responsive'] = true;
                }
                if (options['analysis-menu-nav-history'] == null) {
                    options['analysis-menu-nav-history'] = true;
                }
                await sauce.storage.set({options});
            }
        }
    }, {
        version: 8,
        name: 'advanced_feed_filters',
        migrate: async config => {
            const filters = (config.options['activity-filters'] = []);
            if (config.options['activity-hide-promotions']) {
                filters.push({type: 'cat-promotion', criteria: '*', action: 'hide'});
            }
            if (config.options['activity-hide-virtual']) {
                filters.push({type: 'virtual-*', criteria: '*', action: 'hide'});
            }
            if (config.options['activity-hide-commutes']) {
                filters.push({type: 'cat-commute', criteria: '*', action: 'hide'});
            }
            if (config.options['activity-hide-challenges']) {
                filters.push({type: 'cat-challenge', criteria: '*', action: 'hide'});
            }
            delete config.options['activity-hide-promotions'];
            delete config.options['activity-hide-virtual'];
            delete config.options['activity-hide-commutes'];
            delete config.options['activity-hide-challenges'];
            await sauce.storage.set({options: config.options});
        }
    }, {
        version: 9,
        name: 'run-power-disable',
        migrate: async config => {
            await setDefaultConfigOptions(config, {
                "analysis-disable-run-watts": true,
            });
        }
    }, {
        version: 10,
        name: 'prefer-trimp-tss',
        migrate: async config => {
            await setDefaultConfigOptions(config, {
                "analysis-prefer-estimated-power-tss": false,
            });
        }
    }, {
        version: 11,
        name: 'create-device-id',
        migrate: async config => {
            await sauce.storage.set('deviceId', crypto.randomUUID());
        }
    }];

    let _activeMigration;
    ns.runMigrations = async function() {
        if (!_activeMigration) {
            _activeMigration = _runMigrations();
        }
        try {
            return await _activeMigration;
        } finally {
            _activeMigration = null;
        }
    };
    sauce.proxy.export(ns.runMigrations, {namespace, name: 'run'});


    async function _runMigrations() {
        const initialVersion = await sauce.storage.get('migrationVersion');
        for (const x of migrations) {
            if (initialVersion && initialVersion >= x.version) {
                continue;
            }
            console.info("Running migration:", x.name, x.version);
            try {
                await x.migrate(await sauce.storage.get(null));
            } catch(e) {
                console.error('Migration error:', e);
                break;
            }
            await sauce.storage.set('migrationVersion', x.version);
        }
    }
});
