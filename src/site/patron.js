/* global sauce, jQuery */

sauce.ns('patron', async ns => {
    'use strict';

    const L = sauce.locale;

    await L.init();
    await sauce.propDefined('Backbone', {once: true});
    await sauce.proxy.connected;
    const view = await sauce.getModule('/src/site/view.mjs');


    class PageView extends view.SauceView {
        get events() {
            return {
                ...super.events,
            };
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

        async renderAttrs() {
            const code = this.oneTimeAuthCode;
            let linkState;
            let error;
            if (this.oneTimeAuthCode) {
                let r;
                try {
                    r = await fetch('https://api.saucellc.io/patreon/auth', {
                        method: 'POST',
                        headers: {'Content-type': 'application/json'},
                        body: JSON.stringify({code}),
                    });
                } catch(e) {
                    error = {error: 'Network Error'};
                }
                if (r.status === 404) {
                    linkState = 'nonmember';
                } else if (!r.ok) {
                    try {
                        error = await r.json();
                    } catch(e) {
                        sauce.report.error(`Invalid patreon error [${e.status}]: ${await r.text()}`);
                        error = {
                            status: e.status,
                            error: 'Patreon API Error',
                        };
                    }
                } else {
                    const m = await r.json();
                    if (!m) {
                        sauce.report.error(`Empty patreon membership response`);
                        error = {
                            status: r.status,
                            error: 'Patreon API Misconfiguration',
                        };
                    } else {
                        const prev = await sauce.storage.get('patreon-member-id');
                        await sauce.storage.set('patreon-member-id', m.memberId);
                        linkState = prev !== m.memberId ? 'updated' : 'linked';
                    }
                }
            }
            let membership;
            if (!error && linkState !== 'nonmember') {
                try {
                    const id = await sauce.storage.get('patreon-member-id');
                    membership = await sauce.refreshPatronMembershipDetails(id);
                    linkState = (membership && membership.level) ? (linkState || 'linked') : 'nonmember';
                } catch(e) {
                    sauce.report.error(e);
                    error = {
                        error: 'Patreon Membership Lookup Error',
                    };
                }
            }
            return {
                error,
                linkState,
                membership,
                overridePresent: sauce.patronOverride,
            };
        }
    }


    async function load() {
        const $page = jQuery(document.getElementById('error404'));
        $page.empty();
        $page.removeClass();  // removes all
        $page[0].id = 'sauce-patron-authorize';
        self.pv = new PageView({el: $page});
        await self.pv.render();
    }


    if (['interactive', 'complete'].indexOf(document.readyState) === -1) {
        addEventListener('DOMContentLoaded', () => load().catch(sauce.report.error));
    } else {
        load().catch(sauce.report.error);
    }
});
