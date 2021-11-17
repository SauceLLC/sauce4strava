/* global Backbone, sauce */

export class SauceView extends Backbone.View {
    constructor(...args) {
        super(...args);
        if (this.localeKeys) {
            this._localePromise = sauce.locale.getMessagesObject(this.localeKeys, this.localeNS);
        }
        this.initializing = this.init(...args);
    }

    get tpl() {
        // Subclass returns name of template;
        return undefined;
    }

    get localeKeys() {
        // Subclasses can provide an array of keys a la.,
        //    ['speed', 'energy', '/analysis_distance', ...]
        // See: localeNS() to change default ns.
        // Results are available after init() with lm(<key>) a la.,
        //    this.LM('speed')
        return undefined;
    }

    get localeNS() {
        // Subclass returns locale namespace for template and localeKeys;
        return undefined;
    }

    async init() {
        const tpl = this.tpl;
        if (tpl) {
            this._tpl = await sauce.template.getTemplate(this.tpl, this.localeNS);
        }
        if (this._localePromise) {
            this._localeMessages = await this._localePromise;
            delete this._localePromise;
        }
    }

    /* locale message getter */
    LM(key) {
        return this._localeMessages[key];
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
