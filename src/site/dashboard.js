/* global Strava sauce */

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


    const virtCheckedClass = 'sauce-checked-virtual';
    const virtTagQuery = ['activity-map-tag', 'enhanced-tag'].map(x =>
        `.react-card-container:not(.${virtCheckedClass}) [class*="--${x}--"]`).join();
    const virtualTags = new Set([
        'zwift',
        'trainerroad',
        'peloton',
        'virtual',
        'whoop',
    ]);
    function hideVirtual(feedEl) {
        let count = 0;
        for (const tag of feedEl.querySelectorAll(virtTagQuery)) {
            const card = tag.closest('.react-card-container');
            card.classList.add(virtCheckedClass);
            if (virtualTags.has(tag.textContent.trim().toLowerCase())) {
                const props = getCardProps(card);
                if (props && props.activity && props.activity.athlete.athleteId !== props.viewingAthlete.id) {
                    console.debug("Hiding Virtual Activity", tag.textContent.trim());
                    card.classList.add('hidden-by-sauce');
                    count++;
                }
            }
        }
        feedEvent('hide', 'virtual-activity', count);
        return !!count;
    }


    function hideCommutes(feedEl) {
        let count = 0;
        const qs = `.react-card-container:not(.hidden-by-sauce):not(.sauce-checked-commute) > [data-react-class="Activity"]`;
        for (const x of feedEl.querySelectorAll(qs)) {
            const card = x.parentElement;
            card.classList.add('sauce-checked-commute');
            const props = getCardProps(card);
            if (props && props.activity && props.activity.isCommute &&
                props.activity.athlete.athleteId !== props.viewingAthlete.id) {
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
