(function() {
    self.sauce = self.sauce || {};
    if (document.currentScript.dataset.params) {
        const params = JSON.parse(document.currentScript.dataset.params);
        self.sauce.options = params.options;
        Object.assign(self.sauce, params.patronVars);
        document.dispatchEvent(new Event('sauceOptionsSet'));
    }
})();
