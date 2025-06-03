(function() {
    self.sauce = self.sauce || {};
    if (document.currentScript.dataset.params) {
        const properties = JSON.parse(document.currentScript.dataset.params);
        Object.assign(self.sauce, properties);
        document.dispatchEvent(new Event('sauceOptionsSet'));
    }
})();
