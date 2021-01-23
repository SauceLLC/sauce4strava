/* global Backbone, sauce */

export class SauceView extends Backbone.View {
    constructor(...args) {
        super(...args);
        this.initializing = this.init(...args);
    }

    get tpl() {
        // Subclass returns name of template;
        return undefined;
    }

    get tplNamespace() {
        // Subclass returns locale namespace of template;
        return undefined;
    }

    async init() {
        const tpl = this.tpl;
        if (tpl) {
            this._tpl = await sauce.template.getTemplate(this.tpl, this.tplNamespace);
        }
    }

    async renderAttrs(options={}) {
        return options;
    }

    async render(options) {
        await this.initializing;
        if (this._tpl) {
            this.$el.html(await this._tpl(await this.renderAttrs(options)));
        }
    }
}
