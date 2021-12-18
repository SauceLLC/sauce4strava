/* global sauce, jQuery */

sauce.ns('patron', async ns => {
    'use strict';

    const L = sauce.locale;

    await L.init();
    await sauce.propDefined('Backbone', {once: true});
    await sauce.proxy.connected;
    const view = await sauce.getModule('/site/view');


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

        renderAttrs(data) {
            const quips = [
                'Connecting cerebral cortex to the Gibson... 🖧',
                'Finding Nemo...🐟',
                'Looking for buried treasure...💰',
                'Looking for car keys...🔑',
                'Hacking the planet...💻',
                'Watching C-beams glitter in the dark near the Tannhauser gate...🤖',
                'Exploring a series of tubes...💾',
                'Herding llamas...🦙',
                'Pursuing a long series of diversions in an attempt to avoid responsibility...🔬',
            ];
            const quip = quips[Math.floor(Math.random() * quips.length)];
            return {
                quip,
                error: this.error,
                isLegacy: sauce.patronLegacy,
                ...data
            };
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

        setError(e) {
            this.error = e.message;
            sauce.report.error(e);
        }

        async link(code) {
            let isMember;
            try {
                await this._link(code);
                isMember = true;
            } catch(e) {
                isMember = false;
                if (!(e instanceof NonMember)) {
                    this.setError(e);
                }
            }
            return isMember;
        }

        async _link(code) {
            await sauce.storage.set('patreon-auth', null);
            const auth = await this._api('/patreon/auth', {
                method: 'POST',
                body: JSON.stringify({code}),
            });
            await sauce.storage.set('patreon-auth', auth);
        }

        async getMembership() {
            try {
                return await sauce.getPatreonMembership({detailed: true});
            } catch(e) {
                this.setError(e);
            }
        }
    }


    async function load() {
        const $page = jQuery(document.getElementById('error404'));
        $page.empty();
        $page.removeClass();  // removes all
        $page[0].id = 'sauce-patron-view';
        const q = new URLSearchParams(location.search);
        let oneTimeCode;
        if (q.has('code')) {
            oneTimeCode = q.get('code');
            history.replaceState(null, null, location.pathname);
        }
        self.pv = new PageView({el: $page});
        await self.pv.render({loading: true});
        const s = Date.now();
        const isMember = oneTimeCode && await self.pv.link(oneTimeCode);
        const membership = isMember !== false && await self.pv.getMembership();
        const elapsed = Date.now() - s;
        await sauce.sleep(4000 - elapsed);  // Cheesy I know, but I like the quips, let them be read!
        await self.pv.render({isMember, membership});
    }


    if (['interactive', 'complete'].indexOf(document.readyState) === -1) {
        addEventListener('DOMContentLoaded', () => load().catch(sauce.report.error));
    } else {
        load().catch(sauce.report.error);
    }
});
