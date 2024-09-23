
function init() {
    const params = JSON.parse(document.documentElement.dataset.sauceBaseInitParams);
    if (params) {
        delete document.documentElement.dataset.sauceBaseInitParams;
        self.sauceBaseInit(params.extId, params.extUrl, params.name, params.version);
        self.saucePreloaderInit();
    }
}


(function() {
    if (!document.documentElement.dataset.sauceBaseInitParams) {
        // Firefox script loading is indeterminate...
        // https://bugzilla.mozilla.org/show_bug.cgi?id=1920169
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
