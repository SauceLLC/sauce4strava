/* global browser */
(function() {
    let manifest;
    if (browser.runtime.getManifest) {
        manifest = browser.runtime.getManifest();
    } else {
        manifest = {name: 'foo', version: '8.3.2'};
    }
    const {name, version} = manifest;
    self.sauceBaseInit(browser.runtime.id, browser.runtime.getURL(''), name, version);
})();
