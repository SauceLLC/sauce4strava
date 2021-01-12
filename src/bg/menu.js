/* global browser, sauce */

(async function() {
    let agent = navigator.userAgent.match(/ Edg\//) && 'edge';
    const scheme = browser.runtime.getURL('').split(':')[0];
    agent = agent || scheme === 'chrome-extension' && 'chrome';
    agent = agent || scheme === 'moz-extension' && 'firefox';
    agent = agent || scheme === 'safari-web-extension' && 'safari';
    sauce.proxy.export(browser.runtime.openOptionsPage,
        {namespace: 'menu', name: 'openOptionsPage'});  // Need to set name for FF
    const pageActions = {
        review: {
            title: browser.i18n.getMessage('menu_add_review'),
            onClick: () => {
                if (agent !== 'firefox' && agent !== 'edge') {
                    browser.tabs.create({url: 'https://chrome.google.com/webstore/detail/eigiefcapdcdmncdghkeahgfmnobigha/reviews'});
                } else if (agent === 'firefox') {
                    browser.tabs.create({url: 'https://addons.mozilla.org/en-US/firefox/addon/sauce4strava/'});
                }
            }
        },
        supporters: {
            title: browser.i18n.getMessage('menu_supporters'),
            onClick: () => void browser.tabs.create({url: 'https://saucellc.io/supporters.html'})
        }
    };
    await browser.contextMenus.removeAll();
    for (const [id, obj] of Object.entries(pageActions)) {
        browser.contextMenus.create({id, title: obj.title, contexts: ['page_action']});
    }
    browser.contextMenus.onClicked.addListener(ev => {
        const cb = pageActions[ev.menuItemId].onClick;
        if (cb) {
            cb();
        }
    });
})();

