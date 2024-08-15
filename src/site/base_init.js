(function() {
    console.warn("base init");
    const params = JSON.parse(document.documentElement.dataset.sauceBaseInitParams);
    console.warn("asdfasdf", params);
    self.sauceBaseInit(params.extId, params.extUrl, params.manifest);
    self.saucePreloaderInit();
    console.warn("base init done", self.sauce);
})();
