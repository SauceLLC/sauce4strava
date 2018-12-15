/* global Strava sauce jQuery pageView _ */

sauce.ns('dashboard', function(ns) {

    function filterFeed() {
        if (ns.options['activity-chronological']) {
            console.info("Ordering feed chronologically");
            let lastTimestamp;
            for (const card of document.querySelectorAll('.main .feed-container .feed > .card')) {
                if (ns.options['activity-hide-promotions'] && card.classList.contains('promo')) {
                    console.info("Removing promo card:", card);
                    card.remove();
                    continue;
                }
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
        const feedMutationObserver = new MutationObserver(filterFeed);
        feedMutationObserver.observe(document.querySelector('.main .feed-container .feed'), {
            childList: true,
            attributes: false,
            characterData: false,
            subtree: false,
        });
        filterFeed();

        if (ns.options['activity-chronological']) {
            console.info("Ordering feed chronologically");
            let lastTimestamp;
            for (const card of document.querySelectorAll('.main .feed-container .feed > .card')) {
                if (ns.options['activity-hide-promotions'] && card.classList.contains('promo')) {
                    console.info("Removing promo card:", card);
                    card.remove();
                    continue;
                }
                if (!card.dataset.updatedAt && lastTimestamp) {
                    lastTimestamp += 1;
                } else {
                    lastTimestamp = card.dataset.updatedAt;
                }
                card.style.order = -Number(card.dataset.updatedAt);
            }
        }
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
