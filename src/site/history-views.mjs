/* global sauce */

import {SauceView} from './view.mjs';


class HistoryView extends SauceView {
    get events() {
        return {
            'click .history-entry-add': 'onAddEntry',
            'click .history-entry-delete': 'onDeleteEntry',
            'click .history-save': 'onSave',
            'input .history-entry input': 'onInput',
        };
    }

    get tpl() {
        return 'history-view.html';
    }

    get tplNamespace() {
        return 'history_view';
    }

    async init(options) {
        this.$el.addClass('history-view');
        this.ident = options.ident;
        this.athleteKey = options.ident + 'History';
        this.athlete = options.athlete;
        this.valueUnconvert = options.valueUnconvert || (x => x);
        this.valueConvert = options.valueConvert || (x => x);
        this.entryTpl = await sauce.template.getTemplate('history-view-entry.html', this.tplNamespace);
        this.attrs = options;
        this.edited = false;
        await super.init();
    }

    async renderAttrs() {
        return await super.renderAttrs(Object.assign({
            data: this.athlete[this.athleteKey] || [],
            entryTpl: this.entryTpl,
            valueConvert: this.valueConvert,
            cid: this.cid,
        }, this.attrs));
    }
    
    async onAddEntry(ev) {
        ev.preventDefault();
        const entry = await this.entryTpl(Object.assign(
            {ts: Date.now(), value: undefined},
            await this.renderAttrs()));
        this.$('.history-entries').prepend(entry);
        this.$el.addClass('dirty');
    }

    async onDeleteEntry(ev) {
        ev.preventDefault();
        const entry = ev.currentTarget.closest('.history-entry');
        entry.remove();
        this.$el.addClass('dirty');
    }

    async onSave(ev) {
        ev.preventDefault();
        const data = [];
        for (const x of this.$('.history-entry')) {
            const ts = (new Date(x.querySelector('[type="date"]').value)).getTime();
            const rawValue = x.querySelector('[type="number"]').value;
            let value = rawValue ? Number(rawValue) : NaN;
            if (!isNaN(value)) {
                value = this.valueUnconvert(value);
            }
            if (isNaN(ts) || isNaN(value)) {
                console.warn("Skipping invalid entry:", ts, value);
            } else {
                data.push({ts, value});
            }
        }
        const ordered = await sauce.hist.setAthleteHistoryValues(this.athlete.id, this.ident, data);
        this.athlete[this.athleteKey] = ordered;
        this.$el.removeClass('dirty');
        this.edited = true;
        await this.render();
    }

    onInput(ev) {
        this.$el.addClass('dirty');
    }
}


export class FTPHistoryView extends HistoryView {
    constructor({athlete, el}) {
        super({
            el,
            athlete,
            ident: 'ftp',
            localeTitleKey: 'ftp_title',
            localeHelpKey: 'ftp_help',
            valueMin: 0,
            valueMax: 1000,
            valueUnit: 'w',
        });
    }
}


export class WeightHistoryView extends HistoryView {
    constructor({athlete, el}) {
        super({
            el,
            athlete,
            ident: 'weight',
            localeTitleKey: 'weight_title',
            localeHelpKey: 'weight_help',
            valueMin: 0,
            valueStep: 'any',
            valueConvert: x => sauce.locale.weightFormatter.convert(x).toFixed(1),
            valueUnconvert: x => sauce.locale.weightUnconvert(x),
            valueUnit: sauce.locale.weightFormatter.shortUnitKey(),
        });
    }
}
