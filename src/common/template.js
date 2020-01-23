/* global sauce */
/*
 * Derived from _.template.
 * Adds:
 *  Async support
 *  Localization support via {{{localized_key}}}
 */
(function() {
    'use strict';

    self.sauce = self.sauce || {};
    const ns = self.sauce.template = {};

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

    ns.compile = (text, settingsOverrides) => {
        const settings = Object.assign({}, {
            evaluate: /<%([\s\S]+?)%>/g,
            interpolate: /\{-(.+?)-\}/g,
            escape: /\{\{(.+?)\}\}/g,
            locale: /\{\{\{(.+?)\}\}\}/g,
            localePrefix: ''
        }, settingsOverrides);
        const noMatch = /(.)^/;

        // Combine delimiters into one regular expression via alternation.
        const matcher = RegExp([
            (settings.locale || noMatch).source,
            (settings.escape || noMatch).source,
            (settings.interpolate || noMatch).source,
            (settings.evaluate || noMatch).source
        ].join('|') + '|$', 'g');

        const code = [];
        code.push(`
            let __t;
            const __p = [];
            with(obj || {}) {
        `);
        let index = 0;
        text.replace(matcher, (match, locale, escape, interpolate, evaluate, offset) => {
            code.push(`__p.push('${text.slice(index, offset).replace(escapeRegExp, escapeChar)}');\n`);
            index = offset + match.length;
            if (locale) {
                code.push(`__p.push(await sauce.locale.getMessage('${settings.localePrefix}${locale}'));\n`);
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
                        __p.push(__t);  // XXX maybe ('' + __t)
                    }
                `);
            } else if (evaluate) {
                code.push(evaluate);
            }
        });
        code.push(`
            } /*end-with*/
            return __p.join('');
        `);
        let render;
        const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
        const source = code.join('');
        try {
            render = new AsyncFunction('obj', 'sauce', source);
        } catch (e) {
            e.source = source;
            throw e;
        }

        const template = function(data) {
            return render.call(this, data, sauce);
        };

        // Provide the compiled source as a convenience for precompilation.
        template.source = `async function(obj) {\n${source}\n}`;
        return template;
    };
}());
