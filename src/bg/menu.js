/* global browser, sauce */

(async function() {
    sauce.proxy.export(
        browser.runtime.openOptionsPage,
        {namespace: 'menu', name: 'openOptionsPage'});  // Need to set name for FF

    if (browser.contextMenus) {
        const pageActions = {
            supporters: {
                title: browser.i18n.getMessage('menu_supporters'),
                onClick: () => void browser.tabs.create({url: 'https://www.sauce.llc/supporters.html'})
            }
        };
        const reviewUrl = {
            chrome: 'https://chrome.google.com/webstore/detail/eigiefcapdcdmncdghkeahgfmnobigha/reviews',
            firefox: 'https://addons.mozilla.org/en-US/firefox/addon/sauce4strava/',
            safari: 'https://apps.apple.com/us/app/sauce-for-strava/id1570922521?action=write-review',
        }[sauce.browser()];
        if (reviewUrl) {
            pageActions.review = {
                title: browser.i18n.getMessage('menu_add_review'),
                onClick: () => void browser.tabs.create({url: reviewUrl})
            };
        }
        await browser.contextMenus.removeAll();
        for (const [id, obj] of Object.entries(pageActions)) {
            browser.contextMenus.create({id, title: obj.title, contexts: ['action']});
        }
        browser.contextMenus.onClicked.addListener(ev => {
            const cb = pageActions[ev.menuItemId].onClick;
            if (cb) {
                cb();
            }
        });
    }
})();

