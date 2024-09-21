/* global browser */
(function() {
    let id;
    let url;
    let manifest;
    if (globalThis.browser && browser.runtime.getManifest) {
        id = browser.runtime.id;
        url = browser.runtime.getURL('');
        manifest = browser.runtime.getManifest();
    } else {
        console.warn("Manifest unavailable");
        id = 'no-id';
        url = 'no-url';
        manifest = {name: 'unset', version: '0.0.0'};
    }
    const {name, version} = manifest;
    self.sauceBaseInit(id, url, name, version);
})();
