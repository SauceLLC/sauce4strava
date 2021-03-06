/* global sauce */

import {SauceView} from './view.mjs';


export class MutableDataView extends SauceView {
    get events() {
        return {
            'click .mutable-data-entry-add': '_onAddEntry',
            'click .mutable-data-entry-delete': '_onDeleteEntry',
            'click .mutable-data-save': '_onSave',
            'input .mutable-data-entry input': '_onInput',
        };
    }

    get tpl() {
        return 'mutable-data-view.html';
    }

    get tplNamespace() {
        return 'mutable_data';
    }

    get entryTpl() {
        throw new TypeError("subclass impl required");
    }

    async init(options) {
        this.$el.addClass('mutable-data-view');
        this._entryTpl = await sauce.template.getTemplate(this.entryTpl, this.tplNamespace);
        this.attrs = {
            localeHelpKey: null,
            localeTitleKey: null,
            localeSaveKey: 'save',
            localeSaveTooltipKey: null,
            ...options,
        };
        this.edited = false;
        await super.init();
    }

    async renderAttrs() {
        return await super.renderAttrs({
            entryTpl: this._entryTpl,
            cid: this.cid,
            data: this.entryData(),
            ...this.attrs,
        });
    }

    newEntryAttrs() {
        return {};
    }

    async _onAddEntry(ev) {
        const entry = await this._entryTpl({
            parent: await this.renderAttrs(),
            ...this.newEntryAttrs(),
        });
        this.$('.mutable-data-entries').prepend(entry);
        this.$el.addClass('dirty');
    }

    _onDeleteEntry(ev) {
        const entry = ev.currentTarget.closest('.mutable-data-entry');
        entry.remove();
        this.$el.addClass('dirty');
    }

    parseEntry(entry) {
        throw new TypeError("subclass impl required");
    }

    async _onSave(ev) {
        const data = [];
        for (const entry of this.$('.mutable-data-entry')) {
            const obj = this.parseEntry(entry);
            if (obj) {
                data.push(obj);
            }
        }
        ev.currentTarget.disabled = true;
        ev.currentTarget.classList.add('sauce-loading');
        try {
            await this.onSave(data);
            this.$el.removeClass('dirty');
            this.edited = true;
            await this.render();
        } finally {
            ev.currentTarget.classList.remove('sauce-loading');
            ev.currentTarget.disabled = false;
        }
        this.trigger('save', data);
    }

    async onSave(data) {
    }

    _onInput(ev) {
        this.$el.addClass('dirty');
        this.$el.toggleClass('invalid', !!this.$('input:invalid').length);
        this.onInput(ev);
    }

    onInput(ev) {
    }
}


class HistoryView extends MutableDataView {
    get entryTpl() {
        return 'history-view-entry.html';
    }

    async init(options) {
        this.$el.addClass('history-view');
        this.ident = options.ident;
        this.athleteKey = options.ident + 'History';
        this.athlete = options.athlete;
        this.valueUnconvert = options.valueUnconvert || (x => x);
        this.valueConvert = options.valueConvert || (x => x);
        await super.init(options);
    }

    tsConvert(ts) {
        return !isNaN(ts) ? sauce.formatInputDate(ts) : '';
    }

    newEntryAttrs() {
        return {
            ts: this.tsConvert(Date.now()),
            value: undefined
        };
    }

    entryData() {
        return (this.athlete[this.athleteKey] || []).map(x => ({
            ts: this.tsConvert(x.ts),
            value: !isNaN(x.value) && x.value != null ? this.valueConvert(x.value) : '',
        }));
    }

    parseEntry(entry) {
        const ts = (new Date(entry.querySelector('[type="date"]').value)).getTime();
        const rawValue = entry.querySelector('[type="number"]').value;
        let value = rawValue ? Number(rawValue) : NaN;
        if (!isNaN(value)) {
            value = this.valueUnconvert(value);
        }
        if (isNaN(ts) || isNaN(value)) {
            console.warn("Skipping invalid entry:", ts, value);
        } else {
            return {ts, value};
        }
    }

    async onSave(data) {
        const ordered = await sauce.hist.setAthleteHistoryValues(this.athlete.id, this.ident, data);
        this.athlete[this.athleteKey] = ordered;
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


class PeaksRangesView extends MutableDataView {
    async init(options) {
        this.$el.addClass('peaks-periods-view');
        this.ranges = options.ranges;
        await super.init(options);
    }

    entryData() {
        return this.ranges;
    }

    parseEntry(entry) {
        const rawValue = entry.querySelector('input[type="number"]').value;
        let value = rawValue ? Number(rawValue) : NaN;
        if (!isNaN(value)) {
            return {value};
        }
    }

    async onSave(data) {
        data.sort((a, b) => (a.value || 0) - (b.value || 0));
        this.ranges = data;
        await sauce.peaks.setRanges(this.type, data);
    }
}


export class PeaksPeriodsView extends PeaksRangesView {
    get entryTpl() {
        return 'peaks-periods-view-entry.html';
    }

    async init(options) {
        this.type = 'periods';
        await super.init({
            localeTitleKey: 'peaks_periods_title',
            localeHelpKey: 'peaks_periods_help',
            ...options,
        });
    }

    onInput(ev) {
        const seconds = Number(ev.currentTarget.value);
        const el = ev.currentTarget.closest('.mutable-data-entry').querySelector('value');
        el.textContent = sauce.locale.human.duration(seconds);
    }
}


export class PeaksDistancesView extends PeaksRangesView {
    get entryTpl() {
        return 'peaks-distances-view-entry.html';
    }

    async init(options) {
        this.type = 'distances';
        await super.init({
            localeTitleKey: 'peaks_dists_title',
            localeHelpKey: 'peaks_dists_help',
            ...options,
        });
    }

    onInput(ev) {
        const meters = Number(ev.currentTarget.value);
        const el = ev.currentTarget.closest('.mutable-data-entry').querySelector('value');
        el.textContent = sauce.locale.human.raceDistance(meters);
    }
}
