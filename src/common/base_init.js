/* global browser */
(function() {
    const manifest = browser.runtime.getManifest();
    const {name, version} = manifest;
    self.sauceBaseInit(browser.runtime.id, browser.runtime.getURL(''), name, version);
})();
