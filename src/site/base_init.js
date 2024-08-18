(function() {
    const params = JSON.parse(document.documentElement.dataset.sauceBaseInitParams);
    delete document.documentElement.dataset.sauceBaseInitParams;
    self.sauceBaseInit(params.extId, params.extUrl, params.name, params.version);
    self.saucePreloaderInit();
})();
