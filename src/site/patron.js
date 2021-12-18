/* global sauce, jQuery */

sauce.ns('patron', async ns => {
    'use strict';

    const L = sauce.locale;

    await L.init();
    await sauce.propDefined('Backbone', {once: true});
    await sauce.proxy.connected;
    const view = await sauce.getModule('/src/site/view.mjs');


    class NonMember extends Error {}


    class PageView extends view.SauceView {
        get events() {
            return {
                ...super.events,
                'click a.sauce-options': 'onSauceOptionsClick',
            };
        }

        onSauceOptionsClick() {
            sauce.menu.openOptionsPage();
        }

        get tpl() {
            return 'patron.html';
        }

        async init(...args) {
            await super.init(...args);
            const q = new URLSearchParams(location.search);
            if (q.has('code')) {
                this.oneTimeAuthCode = q.get('code');
                history.replaceState(null, null, location.pathname);
            }
        }

        async render() {
            this.$el.addClass('loading');
            try {
                await super.render();
            } finally {
                this.$el.removeClass('loading');
            }
        }

        async _api(res, options) {
            const r = await fetch('https://api.saucellc.io' + res, options);
            const body = await r.text();
            const data = body ? JSON.parse(body) : null;
            if (r.status === 404) {
                throw new NonMember();
            } else if (!r.ok) {
                throw new Error(JSON.stringify({status: r.status, data}, null, 4));
            } else {
                return data;
            }
        }

        async renderAttrs() {
            let isMember;
            let error;
            if (this.oneTimeAuthCode) {
                try {
                    await this._link();
                    isMember = true;
                } catch(e) {
                    isMember = false;
                    if (!(e instanceof NonMember)) {
                        sauce.report.error(e);
                        error = e.message;
                    }
                }
            }
            let membership;
            if (!error && isMember !== false) {
                try {
                    membership = await sauce.getPatreonMembership({detailed: true});
                } catch(e) {
                    sauce.report.error(e);
                    error = e.message;
                }
            }
            return {
                error,
                membership,
                isLegacy: sauce.patronLegacy,
            };
        }

        async _link() {
            const code = this.oneTimeAuthCode;
            await sauce.storage.set('patreon-auth', null);
            const auth = await this._api('/patreon/auth', {
                method: 'POST',
                body: JSON.stringify({code}),
            });
            await sauce.storage.set('patreon-auth', auth);
        }
    }


    async function load() {
        const $page = jQuery(document.getElementById('error404'));
        $page.empty();
        $page.removeClass();  // removes all
        $page[0].id = 'sauce-patron-view';
        self.pv = new PageView({el: $page});
        await self.pv.render();
    }


    if (['interactive', 'complete'].indexOf(document.readyState) === -1) {
        addEventListener('DOMContentLoaded', () => load().catch(sauce.report.error));
    } else {
        load().catch(sauce.report.error);
    }
});
