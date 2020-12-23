/* global sauce */

(function () {
    'use strict';

    async function load() {
        try {
            await _load();
        } catch(e) {
            await sauce.ga.reportError(e);
            throw e;
        }
    }


    async function _load() {
        let menuOptions = document.querySelector('#global-header .user-nav .user-menu .options');
        if (!menuOptions) {
            menuOptions = document.querySelector('[class*="src--global-header--"] ul[labeledby="athlete-menu"]');
            if (!menuOptions) {
                return;
            }
        }
        let anchor = document.createElement('a');
        anchor.textContent = `Sauce ${await sauce.locale.getMessage('analysis_options')}`;
        const image = document.createElement('img');
        image.src = sauce.extUrl + 'images/logo_horiz_128x48.png';
        anchor.appendChild(image);
        anchor.href = 'javascript:void(0);';
        anchor.addEventListener('click', () => {
            sauce.menu.openOptionsPage().catch(sauce.ga.reportError);  // bg okay
            sauce.ga.reportEvent('UserMenu', 'options');
        });
        let item = document.createElement('li');
        item.id = 'global-sauce-options-menu-item';
        item.appendChild(anchor);
        menuOptions.appendChild(item);
        anchor = document.createElement('a');
        anchor.textContent = `Theme Editor`;
        anchor.href = 'javascript:void(0);';
        anchor.addEventListener('click', () => {
            const fields = [{
                field: 'fg',
                label: 'Foreground',
            }, {
                field: 'bg',
                label: 'Background',
            }, {
                field: 'accent',
                label: 'Accent',
            }, {
                field: 'accent2',
                label: 'Accent 2',
            }, {
                field: 'accent3',
                label: 'Accent 3',
            }, {
                field: 'accent4',
                label: 'Accent 4',
            }];
            const colors = {};
            const tpl = [];
            const css = getComputedStyle(document.documentElement);
            for (const {field, label} of fields) {
                const h = parseInt(css.getPropertyValue(`--sauce-${field}-hue`));
                const s = parseInt(css.getPropertyValue(`--sauce-${field}-sat`));
                const l = parseInt(css.getPropertyValue(`--sauce-${field}-light`));
                colors[field] = [h, s, l];
                const [r, g, b] = sauce.color.hsl2rgb(h, s, l).map(x => Math.round(x));
                const rgb = (r << 16) | (g << 8) | b;
                const hexrgb = rgb.toString(16).padStart(6, '0');
                tpl.push(`${label} <input data-field="${field}" type="color" value="#${hexrgb}"/>`);
            }
            const $dialog = self.jQuery(`<div><b>Click each color block to adjust it.</b>
                ${tpl.join('\n')}</div>`).dialog({title: 'Theme Editor'});
            const style = document.createElement('style');
            document.head.appendChild(style);
            style.sheet.insertRule(`:root {}`);
            const rule = style.sheet.cssRules[0];
            function updateColors() {
                for (const [field, [h, s, l]] of Object.entries(colors)) {
                    rule.style.setProperty(`--sauce-${field}-hue`, h);
                    rule.style.setProperty(`--sauce-${field}-sat`, `${s}%`);
                    rule.style.setProperty(`--sauce-${field}-light`, `${l}%`);
                    rule.style.setProperty(`--sauce-${field}-shade-dir`, l > 50 ? -1 : 1);
                }
            }
            $dialog.on('input', 'input[type="color"]', ev => {
                const fullNum = parseInt(ev.target.value.substr(1), 16);
                const r = fullNum >> 16;
                const g = (fullNum >> 8) & 0xFF;
                const b = fullNum & 0xFF;
                const [h, s, l] = sauce.color.rgb2hsl(r, g, b);
                colors[ev.target.dataset.field] = [h, s, l];
                updateColors();
            });
            // Insert CSS Rule
            sauce.ga.reportEvent('UserMenu', 'theme-editor');
        });
        item = document.createElement('li');
        item.id = 'global-sauce-theme-editor-menu-item';
        item.appendChild(anchor);
        menuOptions.appendChild(item);
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        load();
    } else {
        addEventListener('DOMContentLoaded', load);
    }
})();
