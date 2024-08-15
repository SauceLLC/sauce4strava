(function() {
    const params = JSON.parse(document.currentScript.dataset.params);
    self.sauce = self.sauce || {};
    self.sauce.options = params.options;
    Object.assign(self.sauce, params.patronVars);
})();
