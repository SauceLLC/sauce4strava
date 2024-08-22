/* global Backbone, sauce */

export class SauceView extends Backbone.View {
    static localeNS;  // Subclass returns locale namespace for template and localeKeys.
    static localeKeys;  // Subclasses can provide an array of keys.
    static tpl;  // Subclass should provide name of template;

    constructor(...args) {
        super(...args);
        const cls = this.constructor;
        if (cls.localeKeys) {
            this._localePromise = sauce.locale.getMessagesObject(cls.localeKeys, cls.localeNS);
        }
        this.initializing = this.init(...args);
    }

    async init() {
        const tpl = this.constructor.tpl;
        if (tpl) {
            this._tpl = await sauce.template.getTemplate(tpl, this.constructor.localeNS);
        }
        if (this._localePromise) {
            this._localeMessages = await this._localePromise;
            delete this._localePromise;
        }
    }

    /* locale message getter */
    LM(key) {
        const m = this._localeMessages[key];
        if (!m) {
            console.warn(`Locale key missing: '${key}' - It must be added to localeKeys`);
            return `!L(${key})`;
        } else {
            return m;
        }
    }

    renderAttrs(options={}) {
        return options;
    }

    async render(options) {
        await this.initializing;
        if (this._tpl) {
            this.$el.html(await this._tpl(await this.renderAttrs(options)));
        }
    }
}
