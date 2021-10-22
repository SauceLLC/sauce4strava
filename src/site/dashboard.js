/* global Strava sauce, jQuery */

sauce.ns('dashboard', function(ns) {

    async function feedEvent(action, category, count) {
        if (!count) {
            return;
        }
        await sauce.report.event('ActivityFeed', action, category, {
            nonInteraction: true,
            eventValue: count
        });
    }


    const _cardPropCache = new Map();
    function getCardProps(cardEl) {
        if (!_cardPropCache.has(cardEl)) {
            try {
                _cardPropCache.set(cardEl, JSON.parse(
                    cardEl.querySelector(':scope > [data-react-props]').dataset.reactProps));
            } catch(e) {
                sauce.report.error(e);
                _cardPropCache.set(cardEl, {});
            }
        }
        return _cardPropCache.get(cardEl, {});
    }


    function hideContainers(feedEl, klass) {
        let count = 0;
        const qs = `.react-card-container:not(.hidden-by-sauce) > [data-react-class="${klass}"]`;
        for (const x of feedEl.querySelectorAll(qs)) {
            x.parentElement.classList.add('hidden-by-sauce');
            count++;
        }
        return count;
    }


    const virtualTags = new Set([
        'zwift',
        'trainerroad',
        'peloton',
        'virtual',
        'whoop',
    ]);

    function isVirtual(card) {
        // XXX: This does not support group activities yet.
        const props = getCardProps(card);
        if (props && props.activity && props.activity.athlete.athleteId !== props.viewingAthlete.id) {
            if (props.activity.isVirtual) {
                return true;
            } else if (props.activity.mapAndPhotos && props.activity.mapAndPhotos.photoList) {
                // Catch the ones that don't claim to be virtual (but are).
                for (const x of props.activity.mapAndPhotos.photoList) {
                    if (x.enhanced_photo && virtualTags.has(x.enhanced_photo.name.toLowerCase())) {
                        return true;
                    }
                }
            }
        }
        return false;
    }


    function hideVirtual(feedEl) {
        let count = 0;
        const qs = `.react-card-container:not(.hidden-by-sauce):not(.sauce-checked-virtual) > [data-react-class="Activity"]`;
        for (const x of feedEl.querySelectorAll(qs)) {
            const card = x.parentElement;
            card.classList.add('sauce-checked-virtual');
            if (isVirtual(card)) {
                console.debug("Hiding Virtual");
                card.classList.add('hidden-by-sauce');
                count++;
            }
        }
        feedEvent('hide', 'virtual-activity', count);
        return !!count;
    }


    function isCommute(card) {
        const props = getCardProps(card);
        return !!(props && props.activity && props.activity.isCommute &&
            props.activity.athlete.athleteId !== props.viewingAthlete.id);
    }


    function hideCommutes(feedEl) {
        let count = 0;
        const qs = `.react-card-container:not(.hidden-by-sauce):not(.sauce-checked-commute) > [data-react-class="Activity"]`;
        for (const x of feedEl.querySelectorAll(qs)) {
            const card = x.parentElement;
            card.classList.add('sauce-checked-commute');
            if (isCommute(card)) {
                console.debug("Hiding Commute");
                card.classList.add('hidden-by-sauce');
                count++;
            }
        }
        feedEvent('hide', 'commute-activity', count);
        return !!count;
    }


    function hideChallenges(feedEl) {
        const count = hideContainers(feedEl, 'ChallengeJoin');
        feedEvent('hide', 'challenge-card', count);  // bg okay
        return !!count;
    }


    function hidePromotions(feedEl) {
        const count = hideContainers(feedEl, 'SimplePromo') + hideContainers(feedEl, 'FancyPromo');
        feedEvent('hide', 'promo-card', count);  // bg okay
        return !!count;
    }


    function filterFeed(feedEl) {
        try {
            _filterFeed(feedEl);
        } catch(e) {
            sauce.report.error(e);
        }
    }


    function _filterFeed(feedEl) {
        let resetFeedLoader = false;
        if (sauce.options['activity-hide-promotions']) {
            resetFeedLoader |= hidePromotions(feedEl);
        }
        if (sauce.options['activity-hide-virtual']) {
            resetFeedLoader |= hideVirtual(feedEl);
        }
        if (sauce.options['activity-hide-commutes']) {
            resetFeedLoader |= hideCommutes(feedEl);
        }
        if (sauce.options['activity-hide-challenges']) {
            resetFeedLoader |= hideChallenges(feedEl);
        }
        if (resetFeedLoader) {
            // To prevent breaking infinite scroll we need to reset the feed loader state.
            // During first load pagination is not ready though, and will be run by the constructor.
            if (self.Strava && Strava.Dashboard && Strava.Dashboard.PaginationRouterFactory &&
                Strava.Dashboard.PaginationRouterFactory.view) {
                const view = Strava.Dashboard.PaginationRouterFactory.view;
                requestAnimationFrame(() => view.resetFeedLoader());
            }
        }
    }


    async function sendGAPageView(type) {
        await sauce.report.ga('set', 'title', 'Sauce Dashboard');
        await sauce.report.ga('send', 'pageview');
    }


    function monitorFeed(feedEl) {
        const mo = new MutationObserver(() => filterFeed(feedEl));
        mo.observe(feedEl, {childList: true});
        filterFeed(feedEl);
    }


    let _kudoRateLimiter;
    async function getKudoRateLimiter() {
        if (!_kudoRateLimiter) {
            const jobs = await sauce.getModule('/src/common/jscoop/jobs.js');

            class KudoRateLimiter extends jobs.RateLimiter {
                async getState() {
                    const storeKey = `kudo-rate-limiter-${this.label}`;
                    return await sauce.storage.get(storeKey);
                }

                async setState(state) {
                    const storeKey = `kudo-rate-limiter-${this.label}`;
                    await sauce.storage.set(storeKey, state);
                }
            }

            const g = new jobs.RateLimiterGroup();
            g.push(new KudoRateLimiter('min', {period: (60 + 5) * 1000, limit: 30, spread: true}));
            g.push(new KudoRateLimiter('hour', {period: (3600 + 500) * 1000, limit: 200}));
            g.push(new KudoRateLimiter('day', {period: (86400 + 3600) * 1000, limit: 700}));
            _kudoRateLimiter = g;
        }
        return _kudoRateLimiter;
    }


    async function loadAfterDOM() {
        // XXX Perhaps I should use this load event for all cases but for now I'm not retesting.
        //
        // Strava kinda has bootstrap dropdowns, but most of the style is missing or broken.
        // I think it still is worth it to reuse the basics though (for now)  A lot of css
        // is required to fix this up though.
        const tpl = await sauce.template.getTemplate('kudo-all.html', 'dashboard');
        const filters = new Set((await sauce.storage.getPref('kudoAllFilters') || []));
        const $kudoAll = jQuery(await tpl({filters}));
        jQuery('#dashboard-feed > .feed-header').append($kudoAll);
        $kudoAll.find('dropdown-toggle').dropdown();
        $kudoAll.on('click', 'label.filter', ev => void ev.stopPropagation()); // prevent menu close
        $kudoAll.on('input', 'label.filter input[type="checkbox"]', async ev => {
            const id = ev.currentTarget.name;
            if (ev.currentTarget.checked) {
                filters.add(id);
            } else {
                filters.delete(id);
            }
            await sauce.storage.setPref('kudoAllFilters', Array.from(filters));
        });
        $kudoAll.on('click', 'button.sauce-invoke', async ev => {
            const rl = await getKudoRateLimiter();
            const unKudoed = document.querySelectorAll(
                `.react-card-container:not(.hidden-by-sauce) button > svg[data-testid="unfilled_kudos"]`);
            const todo = Array.from(unKudoed)
                .map(x => x.closest('[data-react-class="Activity"]').parentElement)
                .filter(x => x && (
                    (!filters.has('commutes') || !isCommute(x)) ||
                    (!filters.has('virtual') || !isVirtual(x))));
            if (!todo.length) {
                return;
            }
            const $status = $kudoAll.find('.status');
            $status.text(`0 / ${todo.length}`);
            $kudoAll.addClass('active');
            try {
                for (const [i, x] of todo.entries()) {
                    await rl.wait();
                    console.log(x.querySelector('button[data-testid="kudos_button"]')); //.click();
                    $status.text(`${i + 1} / ${todo.length}`);
                }
            } finally {
                $kudoAll.removeClass('active');
            }
        });
    }


    function load() {
        const feedSelector = '.main .feed-container .feed';
        const feedEl = document.querySelector(feedSelector);
        if (!feedEl) {
            // We're early, monitor the DOM until it's here..
            const mo = new MutationObserver(() => {
                const feedEl = document.querySelector(feedSelector);
                if (feedEl) {
                    mo.disconnect();
                    monitorFeed(feedEl);
                }
            });
            mo.observe(document.documentElement, {childList: true, subtree: true});
        } else {
            monitorFeed(feedEl);
        }
        if (sauce.options['activity-hide-media']) {
            document.documentElement.classList.add('sauce-hide-dashboard-media');
        }
        if (sauce.options['activity-hide-images']) {
            document.documentElement.classList.add('sauce-hide-dashboard-images');
        }
        if (sauce.options['activity-dense-mode']) {
            document.documentElement.classList.add('sauce-dense-dashboard');
        }
        if (!(['interactive', 'complete']).includes(document.readyState)) {
            addEventListener('DOMContentLoaded', () => loadAfterDOM().catch(sauce.report.error));
        } else {
            loadAfterDOM().catch(sauce.report.error);
        }
        sendGAPageView();  // bg okay
    }


    return {
        load,
    };
});

(async function() {
    try {
        sauce.dashboard.load();
    } catch(e) {
        await sauce.report.error(e);
        throw e;
    }
})();
