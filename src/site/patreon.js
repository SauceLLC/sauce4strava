/* global sauce, jQuery */

sauce.ns('patreon', async ns => {
    'use strict';

    const L = sauce.locale;

    await L.init();
    await sauce.propDefined('Backbone', {once: true});
    const view = await sauce.getModule('/src/site/view.mjs');


    async function getMembershipLevel() {
        const id = await sauce.storage.get('patreon-membership');
        if (!id) {
            throw new Error("Patreon account not linked with Sauce. Hint, use the Link button again.");
        }
        const r = await fetch(`https://api.saucellc.io/patreon/membership?id=${id}`);
        if (r.status === 404) {
            return null;
        }
        if (!r.ok) {
            throw new Error(await r.text());
        }
        const level = await r.json();
        return level;
    }


    class PageView extends view.SauceView {
        get events() {
            return {
                ...super.events,
            };
        }

        get tpl() {
            return 'patreon-auth.html';
        }

        async init() {
            //await sauce.sleep(5000);
            await super.init();
            this.$el.addClass('loading');
            const q = new URLSearchParams(location.search);
            const code = q.get('code');
            try {
                if (code) {
                    const r = await fetch('https://api.saucellc.io/patreon/auth', {
                        method: 'POST',
                        headers: {'Content-type': 'application/json'},
                        body: JSON.stringify({code}),
                    });
                    if (r.status === 404) {
                        this.error = 'No Sauce Patreon benefits found';
                    } else if (!r.ok) {
                        this.error = await r.text() || "General error getting auth token";
                    } else {
                        const id = await r.json();
                        if (!id) {
                            throw new Error('Service API Error');
                        }
                        await sauce.storage.set('patreon-membership', id);
                    }
                    if (this.error) {
                        await sauce.storage.set('patreon-membership', null);
                        return;
                    }
                }
                this.membership = await getMembershipLevel();
            } catch(e) {
                this.error = e.message;
            } finally {
                this.$el.removeClass('loading');
            }
        }

        renderAttrs() {
            return {
                error: this.error,
                membership: this.membership,
            };
        }
    }


    async function load() {
        const $page = jQuery(document.getElementById('error404'));
        $page.empty();
        $page.removeClass();  // removes all
        $page[0].id = 'sauce-patreon-authorize';
        self.pv = new PageView({el: $page});
        await self.pv.render();
    }


    if (['interactive', 'complete'].indexOf(document.readyState) === -1) {
        addEventListener('DOMContentLoaded', () => load().catch(sauce.report.error));
    } else {
        load().catch(sauce.report.error);
    }
});
