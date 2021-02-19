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


    let scheduledAthleteDefined;
    const virtCheckedData = 'data-sauce-checked-hide-virtual';
    const virtTagQuery = ['.activity-map-tag', '.enhanced-tag'].map(x =>
        `.card:not([${virtCheckedData}]) ${x}`).join();
    const virtualTags = new Set([
        'zwift',
        'trainerroad',
        'peloton',
        'virtual',
    ]);
    function hideVirtual(feedEl) {
        if (!self.currentAthlete) {
            // Too early in page load to filter out virtual activities.
            if (!scheduledAthleteDefined) {
                console.info("Defering hide of virtual activities until currentAthlete info available.");
                sauce.propDefined('currentAthlete', {once: true}).then(() => filterFeed(feedEl));
                scheduledAthleteDefined = true;
            }
            return false;
        }
        let count = 0;
        const seen = new Set();
        const ourId = self.currentAthlete.id;
        for (const tag of feedEl.querySelectorAll(virtTagQuery)) {
            if (virtualTags.has(tag.textContent.trim().toLowerCase())) {
                const card = tag.closest('.card');
                if (seen.has(card.id)) {
                    continue;
                }
                seen.add(card.id);
                card.setAttribute(virtCheckedData, 1);
                if (!card.querySelector(`.entry-owner[href="/athletes/${ourId}"]`)) {
                    console.debug("Hiding Virtual Activity:", card.id || 'group activity',
                        tag.textContent.trim());
                    card.classList.add('hidden-by-sauce');
                    count++;
                }
            }
        }
        feedEvent('hide', 'virtual-activity', count);
        return !!count;
    }


    function hideChallenges(feedEl) {
        let count = 0;
        for (const card of feedEl.querySelectorAll('.card.challenge:not(.hidden-by-sauce)')) {
            console.info("Hiding challenge card:", card.id);
            card.classList.add('hidden-by-sauce');
            count++;
        }
        feedEvent('hide', 'challenge-card', count);
        return !!count;
    }


    function hidePromotions(feedEl) {
        let count = 0;
        for (const card of feedEl.querySelectorAll('.card.promo:not(.hidden-by-sauce)')) {
            console.info("Hiding promo card:", card.id);
            card.classList.add('hidden-by-sauce');
            count++;
        }
        feedEvent('hide', 'promo-card', count);
        return !!count;
    }

    function getCardTimestamp(card) {
        const mode = sauce.options['activity-chronological-mode'];
        if (mode === 'started') {
            const timeEl = card.querySelector('time[datetime]');
            return timeEl && (new Date(timeEl.dateTime)).getTime() / 1000;
        } else if (!mode || mode === 'updated') {
            return card.dataset.updatedAt && Number(card.dataset.updatedAt);
        } else {
            throw new TypeError("Invalid sort mode");
        }
    }


    let _lastTimestamp;
    const _orderOfft = Math.round(Date.now() / 1000);
    function orderChronological(feedEl) {
        let count = 0;
        for (const card of feedEl.querySelectorAll('.card:not(.ordered-by-sauce)')) {
            const ts = getCardTimestamp(card);
            if (!ts && _lastTimestamp) {
                _lastTimestamp += 1;
            } else {
                _lastTimestamp = ts;
            }
            card.classList.add('ordered-by-sauce');
            card.style.order = -Math.round(ts - _orderOfft);
            count++;
        }
        console.info(`Ordered ${count} cards chronologically`);
        feedEvent('sort-feed', 'chronologically');
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
        if (sauce.options['activity-hide-challenges']) {
            resetFeedLoader |= hideChallenges(feedEl);
        }
        if (sauce.options['activity-chronological']) {
            resetFeedLoader |= orderChronological(feedEl);
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
