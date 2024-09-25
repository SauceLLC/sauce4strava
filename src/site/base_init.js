(function() {
    if (!document.documentElement.dataset.sauceBaseInitParams) {
        // Firefox script loading can be indeterminate...
        // https://bugzilla.mozilla.org/show_bug.cgi?id=1920169
        throw new Error('Ext context has not loaded yet');
    }
    const params = JSON.parse(document.documentElement.dataset.sauceBaseInitParams);
    delete document.documentElement.dataset.sauceBaseInitParams;
    self.sauceBaseInit(params.extId, params.extUrl, params.name, params.version);
    self.saucePreloaderInit();
})();
