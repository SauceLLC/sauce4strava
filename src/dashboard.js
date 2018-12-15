/* global Strava sauce jQuery pageView _ */

sauce.ns('dashboard', function(ns) {

    function filterFeed() {
        const feed = document.querySelector('.main .feed-container .feed');
        if (ns.options['activity-hide-promotions']) {
            for (const card of feed.querySelectorAll('.card.promo')) {
                console.info("SAUCE: Hiding promo card:", card.id);
                card.style.display = 'none';
            }
        }
        if (ns.options['activity-hide-virtual']) {
            for (const card of feed.querySelectorAll('.card')) {
                if (card.querySelector(`.entry-owner:not([href="/athletes/${currentAthlete.id}"])`) &&
                    card.querySelector(`[class^="icon-virtual"], [class*=" icon-virtual"]`)) {
                    console.info("SAUCE: Hiding Virtual Activity:", card.id);
                    card.style.display = 'none';
                }
            }
        }
        if (ns.options['activity-hide-challenges']) {
            for (const card of feed.querySelectorAll('.card.challenge')) {
                console.info("SAUCE: Hiding challenge card:", card.id);
                card.style.display = 'none';
            }
        }
        if (ns.options['activity-chronological']) {
            console.info("SAUCE: Ordering feed chronologically");
            let lastTimestamp;
            for (const card of feed.querySelectorAll('.card')) {
                if (!card.dataset.updatedAt && lastTimestamp) {
                    lastTimestamp += 1;
                } else {
                    lastTimestamp = card.dataset.updatedAt;
                }
                card.style.order = -Number(card.dataset.updatedAt);
            }
        }
    }

    async function load() {
        ns.options = await sauce.comm.get('options');
        const feedMutationObserver = new MutationObserver(_.debounce(filterFeed, 200));
        feedMutationObserver.observe(document.querySelector('.main .feed-container .feed'), {
            childList: true,
            attributes: false,
            characterData: false,
            subtree: false,
        });
        filterFeed();
    }

    return {
        load,
    };
});


(function() {
    if (window.location.pathname.startsWith('/dashboard')) {
        sauce.dashboard.load();
    }
})();
