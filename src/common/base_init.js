/* global browser */
(function() {
    let manifest;
    if (browser.runtime.getManifest) {
        manifest = browser.runtime.getManifest();
    } else {
        console.warn("Manifest unavailable");
        manifest = {name: 'unset', version: '0.0.0'};
    }
    const {name, version} = manifest;
    self.sauceBaseInit(browser.runtime.id, browser.runtime.getURL(''), name, version);
})();
