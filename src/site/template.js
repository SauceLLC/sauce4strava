/* global sauce */
/*
 * Derived from _.template.
 * Adds:
 *  Async support
 *  Localization support via {{{localized_key}}}
 */
sauce.ns('template', ns => {
    'use strict';

    const _tplCache = new Map();
    const _tplFetching = new Map();


    ns.getTemplate = async function(filename, localeKey) {
        localeKey = localeKey || '';
        if (filename.startsWith('/')) {
            // This actually works for most browsers except firefox and only then if packaged
            filename = filename.replace(/^\//, '');
        }
        const cacheKey = '' + filename + localeKey;
        if (!_tplCache.has(cacheKey)) {
            if (!_tplFetching.has(cacheKey)) {
                if (sauce.locale) {
                    await sauce.locale.init();
                }
                _tplFetching.set(cacheKey, (async () => {
                    const resp = await fetch(sauce.getURL(`templates/${filename}`));
                    const tplText = await resp.text();
                    const localePrefix = localeKey && `${localeKey}_`;
                    const name = filename.split(/\..+$/)[0];
                    _tplCache.set(cacheKey, await sauce.template.compile(tplText, {localePrefix}, name));
                    _tplFetching.delete(cacheKey);
                })());
            }
            await _tplFetching.get(cacheKey);
        }
        return _tplCache.get(cacheKey);
    };


    ns.escape = (() => {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#x27;',
            '`': '&#x60;'
        };
        const special = `(?:${Object.keys(map).join('|')})`;
        const testRegexp = RegExp(special);
        const replaceRegexp = RegExp(special, 'g');
        return x => {
            const str = x == null ? '' : '' + x;
            return testRegexp.test(str) ? str.replace(replaceRegexp, x => map[x]) : str;
        };
    })();

    // Certain characters need to be escaped so that they can be put into a string literal.
    const escapes = {
        "'": "'",
        '\\': '\\',
        '\r': 'r',
        '\n': 'n',
        '\u2028': 'u2028',
        '\u2029': 'u2029'
    };
    const escapeChar = match => '\\' + escapes[match];
    const escapeRegExp = /\\|'|\r|\n|\u2028|\u2029/g;


    ns.helpers = {
        fa: async function(icon) {
            console.warn("deprecated: use {{=icon foobar}} instead");
            return await sauce.ui.getImage(`fa/${icon}.svg`);
        },
        icon: x => sauce.ui.getImage(`fa/${x}.svg`),
        embed: async function(file, data) {
            const localeKey = this.settings.localePrefix && this.settings.localePrefix.slice(0, -1);
            return (await ns.getTemplate(file, localeKey))(data);
        },
    };
    if (sauce.locale && sauce.locale.templateHelpers) {
        Object.assign(ns.helpers, sauce.locale.templateHelpers);
    }

    ns.staticHelpers = {
        icon: x => sauce.ui.getImage(`fa/${x}.svg`),
    };


    ns.compile = async (text, settingsOverrides, name) => {
        const settings = Object.assign({}, {
            localeLookup: /\{\{\{\[(.+?)\]\}\}\}/g,
            locale: /\{\{\{(.+?)\}\}\}/g,
            staticHelper: /\{\{=([^\s]+?)\s+(.+?)=\}\}/g,
            escape: /\{\{(.+?)\}\}/g,
            interpolate: /\{-(.+?)-\}/g,
            evaluate: /<%([\s\S]+?)%>/g,
            localePrefix: '',
        }, settingsOverrides);
        settings.helpers = Object.fromEntries(Object.entries(ns.helpers).map(([k, fn]) => ([k, fn.bind({settings})])));
        const noMatch = /(.)^/;
        // Combine delimiters into one regular expression via alternation.
        const matcher = RegExp([
            (settings.localeLookup || noMatch).source,
            (settings.locale || noMatch).source,
            (settings.staticHelper || noMatch).source,
            (settings.escape || noMatch).source,
            (settings.interpolate || noMatch).source,
            (settings.evaluate || noMatch).source,
        ].join('|') + '|$', 'g');
        const funcName = 'tplRender' + (name ?
            name.replace(/-/g, '_').replace(/[^a-zA-Z0-9_]/g, '')
                .split('_').map(x => x[0].toUpperCase() + x.substr(1)).join('') :
            'Anonymous');
        const code = [`
            return async function ${funcName}(sauce, helpers, localeMessages, statics, obj) {
                let __t; // tmp
                const __p = []; // output buffer
                const context = Object.assign({}, helpers, obj);
                with (context) {
        `];
        let index = 0;
        const localeKeys = [];
        const staticCalls = [];
        text.replace(matcher, (match, localeLookup, locale, shName, shArg, escape, interpolate, evaluate, offset) => {
            code.push(`__p.push('${text.slice(index, offset).replace(escapeRegExp, escapeChar)}');\n`);
            index = offset + match.length;
            if (localeLookup) {
                code.push(`
                    __t = (${localeLookup}).startsWith('/') ?
                        (${localeLookup}).substr(1) :
                        '${settings.localePrefix}' + (${localeLookup});
                    __t = sauce.locale.fastGetMessage(__t);
                    __p.push(__t instanceof Promise ? (await __t) : __t);
                `);
            } else if (locale) {
                const key = locale.startsWith('/') ? locale.substr(1) : settings.localePrefix + locale;
                localeKeys.push(key);
                code.push(`__p.push(localeMessages['${key}']);\n`);
            } else if (escape) {
                code.push(`
                    __t = (${escape});
                    if (__t != null) {
                        __p.push(sauce.template.escape(__t));
                    }
                `);
            } else if (interpolate) {
                code.push(`
                    __t = (${interpolate});
                    if (__t != null) {
                        __p.push(__t);
                    }
                `);
            } else if (evaluate) {
                code.push(evaluate);
            } else if (shName) {
                const id = staticCalls.length;
                staticCalls.push([shName, shArg]);
                code.push(`__p.push(statics[${id}]);\n`);
            }
        });
        code.push(`
                } /*end-with*/
                return __p.join('');
            }; /*end-func*/
        `);
        const source = code.join('');
        let render;
        const Fn = (function(){}).constructor;
        try {
            render = (new Fn(source))();
        } catch (e) {
            e.source = source;
            throw e;
        }
        let localeMessages;
        if (localeKeys.length) {
            localeMessages = await sauce.locale.fastGetMessagesObject(localeKeys);
        }
        let statics;
        if (staticCalls.length) {
            statics = await Promise.all(staticCalls.map(([name, args]) => ns.staticHelpers[name](args)));
        }
        return render.bind(this, sauce, settings.helpers, localeMessages, statics);
    };
});
