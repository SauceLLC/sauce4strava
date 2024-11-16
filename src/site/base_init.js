
function init() {
    const params = JSON.parse(document.documentElement.dataset.sauceBaseInitParams);
    delete document.documentElement.dataset.sauceBaseInitParams;
    self.sauceBaseInit(params.extId, params.extUrl, params.name, params.version);
    self.saucePreloaderInit();
}


(function() {
    if (!document.documentElement.dataset.sauceBaseInitParams) {
        console.warn("Doing workaround for out of order startup bug:",
            "https://bugzilla.mozilla.org/show_bug.cgi?id=1920169");
        const mo = new MutationObserver(mutes => {
            init();
            mo.disconnect();
        });
        mo.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-sauce-base-init-params']
        });
    } else {
        init();
    }
})();
