/* global sauce currentAthlete jQuery */

import {SauceView} from '../view.mjs';
import * as data from './data.mjs';

const DAY = 86400 * 1000;
const L = sauce.locale;
const H = L.human;
const D = sauce.date;

const lastSyncMaxAge = 3600 * 1000;

const _syncControllers = new Map();
function getSyncController(athleteId) {
    if (!_syncControllers.has(athleteId)) {
        _syncControllers.set(athleteId, new sauce.hist.SyncController(athleteId));
    }
    return _syncControllers.get(athleteId);
}


function hasSyncController(athleteId) {
    return _syncControllers.has(athleteId);
}


function isoDate(d) {
    return new Date(d).toISOString().substr(0, 10);
}


const _peakRanges = {};
export async function getPeakRanges(type) {
    if (!_peakRanges[type]) {
        _peakRanges[type] = await sauce.peaks.getRanges(type);
    }
    return _peakRanges[type];
}


function getPeaksUnit(streamType) {
    const paceUnit = L.paceFormatter.shortUnitKey();
    return {
        power_wkg: 'w/kg',
        power: 'w',
        np: 'w',
        xp: 'w',
        hr: L.hrFormatter.shortUnitKey(),
        pace: paceUnit,
        gap: paceUnit,
    }[streamType];
}


function getPeaksRangeTypeForStream(streamType) {
    return ['gap', 'pace'].includes(streamType) ? 'distances' : 'periods';
}


function getPeaksKeyFormatter(streamType) {
    if (getPeaksRangeTypeForStream(streamType) === 'distances') {
        return H.raceDistance;
    } else {
        return H.peakPeriod;
    }
}


function getPeaksValueFormatter(streamType) {
    return {
        power: H.number,
        power_wkg: (x, options) => H.number(x, {fixed: true, precision: 1, ...options}),
        np: H.number,
        xp: H.number,
        hr: H.number,
        pace: H.pace,
        gap: H.pace,
    }[streamType];
}


export async function editActivityDialogXXX(activity, pageView) {
    // XXX replace this trash with a view and module
    console.debug("Activity:", activity);
    const tss = sauce.model.getActivityTSS(activity);
    const $modal = await sauce.ui.modal({
        title: 'Edit Activity', // XXX localize
        width: '28em',
        icon: await sauce.ui.getImage('fa/edit-duotone.svg'),
        body: `
            <b>${activity.name}</b><hr/>
            <label>TSS® Override:
                <input name="tss-override" type="number"
                       value="${activity.tssOverride != null ? activity.tssOverride : ''}"
                       placeholder="${tss != null ? Math.round(tss) : ''}"/>
            </label>
            <hr/>
            <label>Exclude this activity from peak performances:
                <input name="peaks-exclude" type="checkbox"
                       ${activity.peaksExclude ? 'checked' : ''}/>
            </label>
        `,
        extraButtons: [{
            text: 'Save', // XXX localize
            click: async ev => {
                const tss = Number($modal.find('input[name="tss-override"]').val() || NaN);
                const updates = {
                    tssOverride: isNaN(tss) ? null : tss,
                    peaksExclude: $modal.find('input[name="peaks-exclude"]').is(':checked'),
                };
                ev.currentTarget.disabled = true;
                ev.currentTarget.classList.add('sauce-loading');
                try {
                    await sauce.hist.updateActivity(activity.id, updates);
                    await sauce.hist.invalidateActivitySyncState(activity.id, 'local', null);
                } finally {
                    ev.currentTarget.classList.remove('sauce-loading');
                    ev.currentTarget.disabled = false;
                }
                $modal.dialog('destroy');
            }
        }, {
            text: 'Reimport', // XXX localize
            click: async ev => {
                ev.currentTarget.disabled = true;
                ev.currentTarget.classList.add('sauce-loading');
                try {
                    await sauce.hist.invalidateActivitySyncState(activity.id, 'streams', null, {wait: true});
                } finally {
                    ev.currentTarget.classList.remove('sauce-loading');
                    ev.currentTarget.disabled = false;
                }
                $modal.dialog('destroy');
            }
        }, {
            text: 'Delete', // XXX localize
            class: 'btn sauce-negative',
            click: async ev => {
                // XXX See: https://github.com/SauceLLC/sauce4strava/issues/55
                // Also, we'll need to handle updates to affected areas in here if
                // a progress event doesn't tell us about deleted activities.
                ev.currentTarget.disabled = true;
                ev.currentTarget.classList.add('sauce-loading');
                try {
                    await sauce.hist.deleteActivity(activity.id);
                    await pageView.render();
                } finally {
                    ev.currentTarget.classList.remove('sauce-loading');
                    ev.currentTarget.disabled = false;
                }
                $modal.dialog('destroy');
            }
        }]
    });
    return $modal;
}


export class PerfView extends SauceView {
    static localeNS = 'performance';

    get defaultPrefs() {
        return {};
    }

    _prefKey() {
        return this.id || this.constructor.name;
    }

    getPrefs(key, defaultValue) {
        if (!this._prefs) {
            this._prefs = {
                ...this.defaultPrefs,
                ...sauce.storage.getPrefFast(this._prefKey()),
            };
        }
        if (key && defaultValue !== undefined && !this._prefs[key]) {
            this._prefs[key] = defaultValue;
        }
        return key ? this._prefs[key] : this._prefs;
    }

    async savePrefs(updates) {
        Object.assign(this._prefs, updates);
        await sauce.storage.setPref(this._prefKey(), this._prefs);
    }

    async init({name, pageView, ...options}={}) {
        if (name) {
            this.name = name;
        }
        if (pageView) {
            this.pageView = pageView;
        }
        await super.init(options);
    }
}


export class ResizablePerfView extends PerfView {
    get events() {
        return {
            ...super.events,
            'pointerdown .resize-drag': 'onResizePointerDown',
        };
    }

    onResizePointerDown(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        const origHeight = this.$el.height();
        const origPageY = ev.pageY;
        this.$el.height(origHeight);
        this.$el.addClass('fixed-height');
        const onDrag = ev => {
            this.$el.height(origHeight + (ev.pageY - origPageY));
        };
        const onDragDone = () => {
            removeEventListener('pointermove', onDrag);
            removeEventListener('pointerup', onDragDone);
            removeEventListener('pointercancel', onDragDone);
        };
        addEventListener('pointermove', onDrag);
        addEventListener('pointerup', onDragDone);
        addEventListener('pointercancel', onDragDone);
    }
}


export class PanelSettingsView extends PerfView {
    constructor(panelView, options) {
        super(options);
        this.panelView = panelView;
    }

    renderAttrs() {
        return this.panelView.getPrefs();
    }
}


export class ActivityStreamGraphsView extends PerfView {
    static tpl = 'performance/activity-stream-graphs.html';

    renderAttrs() {
        return {
            activity: this.activity,
        };
    }

    async setActivity(activity) {
        this.activity = activity;
        if (activity) {
            this.streams = await sauce.hist.getStreamsForActivity(activity.id);
        } else {
            this.streams = null;
        }
        await this.render();
    }

    async render() {
        await super.render();
        if (this.streams && this.streams.time) {
            const options = {
                streams: {...this.streams},
                width: '100%',
                height: 64,
                paceType: this.activity.basetype === 'run' ? 'pace' : 'speed',
                activityType: this.activity.basetype,
            };
            let watts;
            if (this.activity.basetype === 'run') {
                if (!this.pageView.athlete.disableRunWatts) {
                    watts = this.streams.watts;
                }
                if (!watts && this.pageView.athlete.estRunWatts) {
                    watts = this.streams.watts_calc;
                }
            } else {
                watts = this.streams.watts;
            }
            if (watts) {
                options.streams.watts = watts;
                await sauce.ui.createStreamGraphs(
                    this.$('.power-graph'), {graphs: ['power'], ...options});
            }
            if (this.streams.heartrate) {
                await sauce.ui.createStreamGraphs(this.$('.hr-graph'), {graphs: ['hr'], ...options});
            }
            if (this.streams.distance) {
                const graphs = ['pace'];
                if (this.activity.basetype === 'run') {
                    graphs.push('gap');
                }
                await sauce.ui.createStreamGraphs(this.$('.pace-graph'), {graphs, ...options});
            }
            if (this.streams.altitude) {
                await sauce.ui.createStreamGraphs(
                    this.$('.elevation-graph'), {graphs: ['elevation', 'vam'], ...options});
            }
        }
    }
}


export class ActivityTableView extends PerfView {
    static tpl = 'performance/activity-table.html';
    static localeKeys = [];

    get events() {
        return {
            ...super.events,
            'click tbody tr[data-id]': 'onDataRowClick',
            'click tbody tr.load-more': 'onLoadMoreClick',
            'click thead th[data-sort-id]': 'onSortClick',
            'click .btn.collapse-activity': 'onCollapseActivityClick',
            'click .btn.expand-activity': 'onExpandActivityClick',
            'click .btn.edit-activity': 'onEditActivityClick',
        };
    }

    async init({pageView, mode, sortBy, sortDesc, ...options}) {
        await super.init({pageView, ...options});
        this.mode = mode;
        this.activities = Array.from(options.activities || []);
        this.peaks = new Map();
        this.streamsView = new ActivityStreamGraphsView({pageView});
        this.rowPageSize = 50;
        this.defaultSortBy = 'date';
        this.sortBy = sortBy || this.defaultSortBy;
        this.sortDesc = sortDesc != null ? sortDesc : true;
        this.rowLimit = this.rowPageSize;
        this.expandedRow;
        this.columns = [];
        this.peakColTypes = {
            time: 'power',
            distance: 'pace',
        };
        const peakRanges = {
            periods: await getPeakRanges('periods'),
            distances: await getPeakRanges('distances'),
        };
        this.availableColumns = [{
            id: 'name',
            labelKey: '/name',
            sortKey: x => x.name.toLowerCase(),
            tooltip: x => x ? x.name + (x.description ? "\n\n" + x.description : '') : '',
            sortReverse: true,
            format: x => `<a target="_blank" href="/activities/${x.id}">${sauce.template.escape(x.name)}</a>`,
        }, {
            id: 'date',
            labelKey: '/date',
            sortKey: x => x.ts,
            format: x => H.date(x.ts),
        }, {
            id: 'type',
            labelKey: '/type',
            sortKey: x => x.type || x.basetype,
            sortReverse: true,
            align: 'right',
            format: x => x.type || x.basetype,
        }, {
            id: 'time',
            labelKey: '/time',
            shortLabel: await sauce.ui.getImage('fa/clock-duotone.svg'),
            sortKey: x => x.stats?.activeTime || 0,
            align: 'right',
            format: x => H.timer(x.stats?.activeTime) || '-',
        }, {
            id: 'distance',
            labelKey: '/distance',
            shortLabel: await sauce.ui.getImage('fa/road-duotone.svg'),
            sortKey: x => x.stats?.distance || 0,
            align: 'right',
            format: x => H.distance(x.stats?.distance || null,
                                    {precision: 0, suffix: true, html: true}) || '-',
        }, {
            id: 'pace',
            labelKey: '/speed',
            sortKey: x => (x.stats?.distance / x.stats?.activeTime) || 0,
            align: 'right',
            format: x => H.pace(
                (x.stats?.activeTime && x.stats?.distance) ?
                    1 / (x.stats.distance / x.stats.activeTime) : undefined,
                {precision: 0, activityType: x.basetype, suffix: true, html: true}) || '-',
        }, {
            id: 'elevation',
            labelKey: '/elevation',
            shortLabel: await sauce.ui.getImage('fa/mountains-duotone.svg'),
            sortKey: x => x.stats?.altitudeGain,
            align: 'right',
            format: x => x.stats?.altitudeGain ?
                '+' + H.elevation(x.stats.altitudeGain, {suffix: true, html: true}) :
                '-',
        }, {
            labelKey: '/np',
            id: 'np',
            sortKey: x => x.stats?.np || 0,
            align: 'right',
            format: x => H.number(x.stats?.np, {suffix: 'w', html: true}) || '-',
        }, {
            labelKey: '/tss',
            id: 'tss',
            sortKey: x => sauce.model.getActivityTSS(x) || 0,
            align: 'right',
            format: x => H.number(sauce.model.getActivityTSS(x)) || '-',
        },
        ...peakRanges.periods.map(x => {
            const period = x.value;
            const id = `time-${period}`;
            return {
                id,
                period,
                type: 'peak',
                align: 'right',
                metric: 'time',
                label: H.peakPeriod(period, {short: false, html: true}),
                shortLabel: H.peakPeriod(period, {short: true, html: true}),
                sortKey: function(x) { return this.peaks.get(x.id)?.[id]?.peak?.value; },
                format: function(a, peaks) { return this._formatPeak(peaks[id]?.peak, a); },
            };
        }),
        ...peakRanges.distances.map(x => {
            const period = x.value;
            const id = `distance-${period}`;
            return {
                id,
                period,
                type: 'peak',
                align: 'right',
                metric: 'distance',
                label: H.raceDistance(period, {html: true, short: false}),
                shortLabel: H.raceDistance(period, {html: true, short: true}),
                sortKey: function(x) { return this.peaks.get(x.id)?.[id]?.peak?.value; },
                sortReverse: true,
                format: function(a, peaks) { return this._formatPeak(peaks[id]?.peak, a); },
            };
        })];
    }

    _formatPeak(peak, activity) {
        if (!peak) {
            return '-';
        }
        const valueFormatter = getPeaksValueFormatter(peak.type);
        return valueFormatter(peak.value, {
            suffix: getPeaksUnit(peak.type),
            html: true,
            activityType: activity.basetype
        });
    }

    async setColumns(columns) {
        this.columns.splice(0, this.columns.length, ...columns);
        const sortCol = this.columns.find(x => x.id === this.sortBy);
        if (!sortCol) {
            if (this.columns.find(x => x.id === this.defaultSortBy)) {
                this.sortBy = this.defaultSortBy;
            } else {
                this.sortBy = this.columns.find(x => x.sortKey)?.id;
            }
            console.warn("Sort column resetting to:", this.sortBy);
            this.sort();
            this.trigger('sort', {sortBy: this.sortyBy, sortDesc: this.sortDesc});
        }
        // NOTE: We could optimize this to just render if peak cols are unchanged
        await this.setActivities(this.activities);
    }

    setPeakColType(metric, type) {
        this.peakColTypes[metric] = type;
    }

    _getColPeakType(col) {
        return col.type === 'peak' ? this.peakColTypes[col.metric] : undefined;
    }

    async setActivities(activities) {
        this.rowLimit = this.rowPageSize;
        this.activities = Array.from(activities || []);
        const activityIds = new Set(activities.map(x => x.id));
        const newPeaks = new Map(Array.from(activityIds).map(x => [x, {}]));
        // Benchmark optimized...
        const peakMetrics = new Set(this.columns.map(x => x.metric).filter(x => x));
        await Promise.all([...peakMetrics].map(async metric => {
            const mColumns = this.columns.filter(x => x.type === 'peak' && x.metric === metric);
            mColumns.sort((a, b) => a.period - b.period);
            const type = this.peakColTypes[metric];
            const needed = [];
            for (const id of activityIds) {
                const existing = this.peaks.get(id);
                if (existing && mColumns.every(x => existing[x.id]?.type === type)) {
                    newPeaks.set(id, existing);
                } else {
                    needed.push(id);
                }
            }
            const ps = await sauce.hist.getPeaksForActivityIds(needed, {
                type,
                period: [mColumns.at(0).period, mColumns.at(-1).period]
            });
            for (const [i, peaks] of ps.entries()) {
                const id = needed[i];
                for (const col of mColumns) {
                    const peak = peaks.find(x => x.period === col.period);
                    newPeaks.get(id)[col.id] = {type, peak};
                }
            }
        }));
        this.peaks = newPeaks;
        this.sort();
        await this.render();
    }

    async setActivityFilter(fn) {
        this._filterFn = fn;
        await this.setActivities(this.activities);
    }

    async setMode(mode) {
        this.mode = mode;
        await this.render();
    }

    getFilteredActivities() {
        return this._filterFn ? this.activities.filter(this._filterFn) : this.activities;
    }

    renderAttrs() {
        const activities = this.getFilteredActivities();
        const mostlyRuns = activities.filter(x => x.basetype === 'run').length / activities.length > 0.5;
        return {
            entryTpl: 'performance/activity-table-entry.html',
            activities,
            peaks: this.peaks,
            mode: this.mode,
            rowLimit: this.rowLimit,
            sortBy: this.sortBy,
            sortDesc: this.sortDesc,
            paceLocaleKey: mostlyRuns ? '/pace' : '/speed',
            columns: this.columns,
            table: this,
        };
    }

    async render() {
        await super.render();
        this.streamsView.setElement(this.$('tr.activity-streams td'));
    }

    sort() {
        const col = this.columns.find(x => x.id === this.sortBy);
        if (col && col.sortKey) {
            const sortDir = (this.sortDesc ? 1 : -1) * (col.sortReverse ? -1 : 1);
            this.activities.sort((a, b) => {
                const aVal = col.sortKey.call(this, a);
                const bVal = col.sortKey.call(this, b);
                if (aVal === bVal || (aVal == null && bVal == null)) {
                    return 0;
                } else if (aVal == null) {
                    return 1; // Always push null values to bottom
                } else if (bVal == null) {
                    return -1; // Always push null values to bottom
                } else {
                    return aVal < bVal ? sortDir : -sortDir;
                }
            });
        } else {
            console.warn("Unsortable activity table");
        }
    }

    async onSortClick(ev) {
        const id = ev.currentTarget.dataset.sortId;
        if (id === this.sortBy) {
            this.sortDesc = !this.sortDesc;
        } else {
            this.sortBy = id;
        }
        this.sort();
        this.trigger('sort', {sortBy: id, sortDesc: this.sortDesc});
        await this.render();
    }

    async onLoadMoreClick(ev) {
        const loadMore = ev.currentTarget;
        loadMore.classList.add('loading');
        let activities;
        try {
            const tpl = await sauce.template.getTemplate(
                'performance/activity-table-entry.html', 'performance');
            const attrs = this.renderAttrs();
            activities = this.getFilteredActivities();
            const moreActs = activities.slice(this.rowLimit, this.rowLimit += this.rowPageSize);
            const newRows = await Promise.all(moreActs.map(a => tpl({a, ...attrs})));
            sauce.adjacentNodeContents(loadMore, 'beforebegin', newRows.join('\n'));
        } finally {
            if (!activities || activities.length <= this.rowLimit) {
                loadMore.classList.add('hidden');
            }
            loadMore.classList.remove('loading');
        }
    }

    async onDataRowClick(ev) {
        if (ev.target.closest('a,.btn,button,input,select')) {
            return;
        }
        const id = Number(ev.currentTarget.dataset.id);
        const activity = await sauce.hist.getActivity(id);
        await this.pageView.detailsView.setActivities([activity]);
    }

    async onCollapseActivityClick(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        this.expandedRow.classList.remove('expanded');
        this.expandedRow = null;
        await this.streamsView.setActivity(null);
    }

    async onExpandActivityClick(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        const row = ev.currentTarget.closest('tr[data-id]');
        if (this.expandedRow) {
            this.expandedRow.classList.remove('expanded');
        }
        this.expandedRow = row;
        row.classList.add('expanded');
        row.insertAdjacentElement('afterend', this.streamsView.el.closest('tr'));
        this.streamsView.$('.loading-mask').addClass('loading');
        try {
            const activity = await sauce.hist.getActivity(Number(row.dataset.id));
            await this.streamsView.setActivity(activity);
        } finally {
            this.streamsView.$('.loading-mask').removeClass('loading');
        }
    }

    async onEditActivityClick(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        const id = Number(ev.currentTarget.closest('[data-id]').dataset.id);
        const activity = await sauce.hist.getActivity(id);
        editActivityDialogXXX(activity, this.pageView);
    }
}


export class BulkActivityEditDialog extends PerfView {
    static localeKeys = ['/save', 'edit_activities', 'exclude_peaks_tooltip'];

    async init({activities, pageView, ...options}) {
        await super.init({pageView, ...options});
        this.athletes = new Set(activities.map(x => x.athlete));
        this.icon = await sauce.ui.getImage('fa/list-duotone.svg');
        this.activityTable = new ActivityTableView({pageView, ...options});
        await this.activityTable.initializing;
        const columns =  this.activityTable.availableColumns.filter(x =>
            ['name', 'date', 'type', 'time', 'distance', 'pace', 'elevation'].includes(x.id));
        columns.push({
            id: 'tss-override',
            labelKey: '/tss',
            format: x => {
                const tss = sauce.model.getActivityTSS(x);
                return `<input type="number" style="width: 6ch" name="tss-override"
                               value="${x.tssOverride || ''}"
                               placeholder="${tss != null ? Math.round(tss) : ''}"/>`;
            },
        }, {
            id: 'peaks-exclude',
            label: await sauce.ui.getImage('fa/eye-slash-regular.svg'),
            align: 'center',
            tooltip: this.LM('exclude_peaks_tooltip'),
            format: x => `<input type="checkbox" name="peaks-exclude" ${x.peaksExclude ? 'checked' : ''}/>`,
        });
        await this.activityTable.setColumns(columns);
        await this.activityTable.setActivities(activities);
    }

    async render() {
        await super.render();
        await this.activityTable.setElement(this.$el).render();
    }

    show() {
        sauce.ui.modal({
            title: this.LM('edit_activities'),
            el: this.$el,
            flex: true,
            width: '60em',
            icon: this.icon,
            dialogClass: 'sauce-edit-activities-dialog',
            extraButtons: [{
                text: this.LM('save'),
                click: async ev => {
                    const updates = {};
                    for (const tr of this.$('table tbody tr[data-id]')) {
                        updates[Number(tr.dataset.id)] = {
                            tssOverride: Number(tr.querySelector('input[name="tss-override"]').value) || null,
                            peaksExclude: tr.querySelector('input[name="peaks-exclude"]').checked,
                        };
                    }
                    ev.currentTarget.disabled = true;
                    ev.currentTarget.classList.add('sauce-loading');
                    try {
                        await sauce.hist.updateActivities(updates);
                        for (const id of Object.keys(updates)) {
                            await sauce.hist.invalidateActivitySyncState(Number(id), 'local', null,
                                                                         {disableSync: true});
                        }
                        for (const x of this.athletes) {
                            await sauce.hist.syncAthlete(x);
                        }
                    } finally {
                        ev.currentTarget.classList.remove('sauce-loading');
                        ev.currentTarget.disabled = false;
                    }
                    this.$el.dialog('destroy');
                }
            }]
        });
    }
}


export class SummaryView extends PerfView {
    static tpl = 'performance/summary.html';
    static localeKeys = ['rides', 'runs', 'swims', 'skis', 'workouts', 'ride', 'run', 'swim',
        'ski', 'workout'];

    get defaultPrefs() {
        return {
            type: 'power',
            collapsed: {},
        };
    }

    get events() {
        return {
            ...super.events,
            'click a.collapser': 'onCollapserClick',
            'click a.expander': 'onExpanderClick',
            'click section.training a.missing-tss': 'onMissingTSSClick',
            'click section.highlights row[data-activity-id]': 'onHighlightClick',
            'dblclick section > header': 'onDblClickHeader',
            'change select[name="type"]': 'onTypeChange',
        };
    }

    async init({pageView, ...options}) {
        this.loading = true;
        this.sync = {};
        this.daily = [];
        this.missingTSS = [];
        this.counts = null;
        this.onSyncActive = this._onSyncActive.bind(this);
        this.onSyncStatus = this._onSyncStatus.bind(this);
        this.onSyncError = this._onSyncError.bind(this);
        this.onSyncProgress = this._onSyncProgress.bind(this);
        if (pageView.athlete) {
            await this.setAthlete(pageView.athlete);
        }
        await super.init({pageView, ...options});
        this.listenTo(pageView, 'before-update-activities', this.onBeforeUpdateActivities);
        this.listenTo(pageView, 'update-activities', sauce.debounced(this.onUpdateActivities));
    }

    async findPeaks() {
        const [start, end] = [this.start, this.end];
        if (start == null || end == null) {
            return [];
        }
        const type = this.getPrefs('type');
        const ranges = await getPeakRanges(getPeaksRangeTypeForStream(type));
        const keyFormatter = getPeaksKeyFormatter(type);
        const valueFormatter = getPeaksValueFormatter(type);
        const peaks = await sauce.hist.getPeaksForAthlete(
            this.athlete.id, type, ranges.map(x => x.value), {limit: 1, start, end, expandActivities: true});
        return peaks.map(x => ({
            key: keyFormatter(x.period, {html: true}),
            prettyValue: valueFormatter(x.value, {activityType: x.activityType}),
            unit: getPeaksUnit(type),
            activity: x.activity,
            rankBadge: x.rankLevel && sauce.power.rankBadge(x.rankLevel),
        }));
    }

    async renderAttrs() {
        const weeks = this.daily.length / 7;
        const totalTime = sauce.data.sum(this.daily.map(x => x.duration));
        const totalDistance = sauce.data.sum(this.daily.map(x => x.distance));
        const totalAltGain = sauce.data.sum(this.daily.map(x => x.altGain));
        return {
            loading: this.loading,
            athlete: this.athlete,
            prefs: this.getPrefs(),
            sync: this.sync,
            activeDays: this.daily.filter(x => x.activities.length).length,
            tssAvg: this.daily.length ? sauce.data.sum(this.daily.map(x =>
                x.tss)) / this.daily.length : 0,
            currentCTL: (this.end >= Date.now() && this.daily.length) ?
                this.daily[this.daily.length - 1].ctl : undefined,
            maxCTL: sauce.data.max(this.daily.map(x => x.ctl)),
            minTSB: sauce.data.min(this.daily.map(x => x.ctl - x.atl)),
            totalTime,
            weeklyTime: totalTime / weeks,
            totalDistance,
            weeklyDistance: totalDistance / weeks,
            totalAltGain,
            weeklyAltGain: totalAltGain / weeks,
            missingTSS: this.missingTSS,
            peaks: await this.findPeaks(),
            mostFreqType: this.mostFreqType,
            mostFreqLocaleKey: this.mostFreqType ? this.mostFreqType.type + 's' : null,
        };
    }

    async render() {
        await super.render();
        if (this.counts) {
            this.$('.counts-piechart').sparkline(this.counts.map(x => x.count), {
                type: 'pie',
                width: '100%',
                height: '100%',
                highlightLighten: 1,
                sliceColors: this.counts.map(x => ({
                    ride: '#f09675',
                    run: '#f0d175',
                    swim: '#c0d7f1',
                    ski: '#267e88',
                    workout: '#999',
                }[x.type])),
                tooltipFormatter: (_, __, data) => {
                    const items = this.counts.map(x =>
                        `<li>${x.count} ${this.LM(x.type + (x.count !== 1 ? 's' : ''))}</li>`);
                    return `<ul>${items.join('')}</ul>`;
                }
            });
        }
    }

    async setAthlete(athlete) {
        // Set loading class early on for better UI feel...
        this.$('.loading-mask').addClass('loading');
        this.loading = true;
        this.athlete = athlete;
        const id = athlete && athlete.id;
        if (this.syncController) {
            this.syncController.removeEventListener('active', this.onSyncActive);
            this.syncController.removeEventListener('status', this.onSyncStatus);
            this.syncController.removeEventListener('error', this.onSyncError);
            this.syncController.removeEventListener('progress', this.onSyncProgress);
            this.syncController = null;
        }
        if (id) {
            this.syncController = getSyncController(id);
            this.syncController.addEventListener('active', this.onSyncActive);
            this.syncController.addEventListener('status', this.onSyncStatus);
            this.syncController.addEventListener('error', this.onSyncError);
            this.syncController.addEventListener('progress', this.onSyncProgress);
            this.sync = await this.syncController.getState();
            this.sync.counts = await sauce.hist.activityCounts(id);
        }
    }

    async onTypeChange(ev) {
        const type = ev.currentTarget.value;
        await this.savePrefs({type});
        await this.render();
    }

    async _onSyncActive(ev) {
        if (ev.data.active) {
            this.syncError = null;
        }
        this.sync.active = ev.data.active;
        await this.render();
    }

    async _onSyncStatus(ev) {
        this.sync.status = ev.data;
        await this.render();
    }

    async _onSyncError(ev) {
        this.sync.error = ev.data.error;
        await this.render();
    }

    async _onSyncProgress(ev) {
        this.sync.counts = ev.data.counts;
        await this.render();
    }

    async onBeforeUpdateActivities({athlete, activities, daily, range}) {
        if (this.athlete !== athlete) {
            await this.setAthlete(athlete);
            await this.render();
        }
    }

    async onUpdateActivities({athlete, activities, daily, range}) {
        this.loading = false;
        this.daily = daily;
        this.activities = activities;
        this.missingTSS = activities.filter(x => sauce.model.getActivityTSS(x) == null);
        this.start = +range.start;
        this.end = +range.end;
        const counts = activities.reduce((agg, x) =>
            (agg[x.basetype] = (agg[x.basetype] || 0) + 1, agg), {});
        this.counts = Object.entries(counts).map(([type, count]) =>
            ({type, count})).filter(x => x.count);
        this.counts.sort((a, b) => b.count - a.count);
        this.mostFreqType = this.counts[0];
        if (this.mostFreqType) {
            this.mostFreqType.pct = this.mostFreqType.count /
                sauce.data.sum(this.counts.map(x => x.count));
        }
        await this.render();
    }

    async onCollapserClick(ev) {
        await this.toggleCollapsed(ev.currentTarget.closest('section'), true);
    }

    async onExpanderClick(ev) {
        await this.toggleCollapsed(ev.currentTarget.closest('section'), false);
    }

    async onHighlightClick(ev) {
        const activity = await sauce.hist.getActivity(Number(ev.currentTarget.dataset.activityId));
        this.pageView.trigger('select-activities', [activity]);
    }

    async onMissingTSSClick(ev) {
        const bulkEditDialog = new BulkActivityEditDialog({
            activities: this.missingTSS,
            pageView: this.pageView
        });
        await bulkEditDialog.render();
        bulkEditDialog.show();
    }

    async onDblClickHeader(ev) {
        const section = ev.currentTarget.closest('section');
        await this.toggleCollapsed(section);
    }

    async toggleCollapsed(section, en) {
        const collapsed = this.getPrefs('collapsed');
        const id = section.dataset.id;
        if (en == null) {
            en = !section.classList.contains('collapsed');
        }
        const isCollapsed = collapsed[id] = (en !== false);
        section.classList.toggle('collapsed', isCollapsed);
        await this.savePrefs({collapsed});
    }
}


export class DetailsView extends PerfView {
    static tpl = 'performance/details.html';

    get events() {
        return {
            ...super.events,
            'click header a.collapser': 'onCollapserClick',
            'click .activity .edit-activity': 'onEditActivityClick',
            'click .btn.load-more.older': 'onLoadOlderClick',
            'click .btn.load-more.newer': 'onLoadNewerClick',
            'click .btn.load-more.recent': 'onLoadRecentClick',
            'click row .btn.expand': 'onExpandRowClick',
            'click row .btn.compress': 'onCompressRowClick',
            'click .detail-media video': 'onVideoClick',
            'click .detail-media img': 'onImageClick',
        };
    }

    get defaultPrefs() {
        return {
            collapsed: false,
        };
    }

    async init({pageView, ...options}) {
        this._observing = new Map();
        this._intersectionObserver = new IntersectionObserver(this.onIntersection.bind(this));
        this.onSyncProgress = this._onSyncProgress.bind(this);
        this.listenTo(pageView, 'change-athlete', this.onChangeAthlete);
        this.listenTo(pageView, 'select-activities', this.setActivities);
        this.listenTo(pageView, 'available-activities-changed', this.onAvailableChanged);
        this.setAthlete(pageView.athlete);
        this.manifests = await sauce.hist.getActivitySyncManifests('local');
        await super.init({pageView, ...options});
    }

    setElement(el, ...args) {
        const r = super.setElement(el, ...args);
        this.toggleCollapsed(this.getPrefs('collapsed'), {noSave: true});
        return r;
    }

    onIntersection(entries) {
        for (const x of entries) {
            if (!x.target.dataset.fullResUrl) {
                continue;
            }
            clearTimeout(this._observing.get(x.target));
            if (x.isIntersecting) {
                this._observing.set(x.target, setTimeout(() => {
                    if (!x.target.isConnected) {
                        return;
                    }
                    x.target.fetchPriority = 'low';
                    x.target.src = x.target.dataset.fullResUrl;
                    delete x.target.dataset.fullResUrl;
                    this._intersectionObserver.unobserve(x.target);
                    this._observing.delete(x.target);
                }, 2000));
            }
        }
    }

    renderAttrs(obj) {
        let hasNewer;
        let hasOlder;
        if (this.activities && this.activities.length && this.pageView.newest) {
            const ourOldest = this.activities[0].ts;
            const ourNewest = this.activities[this.activities.length - 1].ts;
            hasNewer = ourNewest < this.pageView.newest;
            hasOlder = ourOldest > this.pageView.oldest;
        }
        return {
            daily: this.activities ? data.activitiesByDay(this.activities) : null,
            getSyncErrors: x => sauce.model.getActivitySyncErrors(x, this.manifests),
            hasNewer,
            hasOlder,
            debug: !!location.search.match(/debug/),
            ...obj,
        };
    }

    async render(...args) {
        for (const [el, promoteTimeout] of this._observing.entries()) {
            this._intersectionObserver.unobserve(el);
            clearTimeout(promoteTimeout);
        }
        this._observing.clear();
        const ret = await super.render(...args);
        for (const el of this.el.querySelectorAll('.activity-media img[data-full-res-url]')) {
            this._intersectionObserver.observe(el);
            this._observing.set(el, undefined);
        }
        return ret;
    }

    async _onSyncProgress(ev) {
        const done = ev.data.done;
        if (!this.activities || !this.activities.length || !done.ids || !done.ids.length) {
            return;
        }
        const ids = new Set(done.ids);
        const updating = this.activities.filter(x => ids.has(x.id)).map(orig =>
            sauce.hist.getActivity(orig.id).then(updated => [updated, orig]));
        for (const [updated, orig] of await Promise.all(updating)) {
            this.activities[this.activities.indexOf(orig)] = updated;
        }
        if (updating.length) {
            await this.render();
        }
    }

    async onChangeAthlete(athlete) {
        this.setAthlete(athlete);
        await this.render();
    }

    setAthlete(athlete) {
        this.activities = null;
        const id = athlete && athlete.id;
        if (this.syncController) {
            this.syncController.removeEventListener('progress', this.onSyncProgress);
        }
        if (id) {
            this.syncController = getSyncController(id);
            this.syncController.addEventListener('progress', this.onSyncProgress);
        } else {
            this.syncController = null;
        }
    }

    async onAvailableChanged() {
        await this.render();
    }

    async toggleCollapsed(collapsed, options={}) {
        if (collapsed == null) {
            collapsed = !this.$el.hasClass('collapsed');
        }
        this.$el.toggleClass('collapsed', collapsed);
        if (!options.noSave) {
            await this.savePrefs({collapsed});
        }
        return collapsed;
    }

    async setActivities(activities, options={}) {
        this.activities = Array.from(activities);
        this.activities.sort((a, b) => (a.ts || 0) - (b.ts || 0));
        await this.render(options);
        if (!options.noHighlight && this.$el.hasClass('collapsed')) {
            this.toggleCollapsed();  // bg okay
        }
    }

    async onCollapserClick(ev) {
        await this.toggleCollapsed(true);
    }

    onEditActivityClick(ev) {
        const id = Number(ev.currentTarget.closest('[data-id]').dataset.id);
        let activity;
        for (const a of this.activities) {
            if (a.id === id) {
                activity = a;
                break;
            }
        }
        editActivityDialogXXX(activity, this.pageView);
    }

    async onLoadOlderClick(ev) {
        if (!this.activities.length) {
            return;
        }
        const oldest = this.activities[0];
        const more = await sauce.hist.getActivitySiblings(oldest.id, {direction: 'prev', limit: 1});
        await this.setActivities(this.activities.concat(more), {noHighlight: true});
    }

    async onLoadNewerClick(ev) {
        if (!this.activities.length) {
            return;
        }
        const newest = this.activities[this.activities.length - 1];
        const more = await sauce.hist.getActivitySiblings(newest.id, {direction: 'next', limit: 1});
        await this.setActivities(this.activities.concat(more), {noHighlight: true});
    }

    async onLoadRecentClick(ev) {
        const range = this.pageView.range;
        const start = +range.start;
        const end = +range.end;
        const activities = await sauce.hist.getActivitiesForAthlete(
            this.pageView.athlete.id, {start, end, limit: 10, direction: 'prev'});
        await this.setActivities(activities, {noHighlight: true});
    }

    async onExpandRowClick(ev) {
        const row = ev.currentTarget.closest('row');
        row.classList.add('expanded');
        if (!row.querySelector('.expanded-details')) {
            const id = Number(row.closest('.activity').dataset.id);
            const mode = row.dataset.expandMode;
            if (mode === 'peaks') {
                await this.expandPeaks(row, id);
            } else {
                throw new Error("Unknown expander mode");
            }
        }
    }

    async expandPeaks(row, id) {
        const peaks = await sauce.hist.getPeaksForActivityId(id);
        const type = row.dataset.peakType;
        const periods = new Set((await getPeakRanges(getPeaksRangeTypeForStream(type))).map(x => x.value));
        const typedPeaks = peaks.filter(x => x.type === type && periods.has(x.period));
        if (typedPeaks.length) {
            const keyFormatter = getPeaksKeyFormatter(type);
            const valueFormatter = getPeaksValueFormatter(type);
            const details = document.createElement('div');
            details.classList.add('expanded-details');
            for (const x of typedPeaks) {
                const row = document.createElement('row');
                const key = document.createElement('key');
                const value = document.createElement('value');
                key.textContent = keyFormatter(x.period);
                sauce.adjacentNodeContents(value, 'beforeend', valueFormatter(x.value, {
                    activityType: x.activityType,
                    suffix: getPeaksUnit(type),
                    html: true
                }));
                row.appendChild(key);
                row.appendChild(value);
                details.appendChild(row);
            }
            row.insertAdjacentElement('beforeend', details);
        }
    }

    onCompressRowClick(ev) {
        ev.currentTarget.closest('row').classList.remove('expanded');
    }

    onVideoClick(ev) {
        const srcVideo = ev.currentTarget;
        const video = document.createElement('video');
        video.src = srcVideo.src;
        video.setAttribute('controls', '1');
        this.showModalMedia(video);
    }

    onImageClick(ev) {
        const srcImg = ev.currentTarget;
        const img = document.createElement('img');
        img.src = srcImg.dataset.fullResUrl || srcImg.src;
        this.showModalMedia(img);
    }

    showModalMedia(el) {
        const dialog = document.createElement('dialog');
        dialog.classList.add('modal-media');
        dialog.setAttribute('closedby', 'any');
        document.body.append(dialog);
        dialog.addEventListener('close', ev => {
            dialog.remove();
        });
        const closeBtn = document.createElement('div');
        closeBtn.classList.add('close-btn');
        closeBtn.textContent = '✕';
        closeBtn.addEventListener('click', () => dialog.close());
        dialog.append(closeBtn, el);
        dialog.showModal();
    }
}


class ActivityTablePanelSettingsView extends PanelSettingsView {
    static tpl = 'performance/activity-table-settings.html';

    get events() {
        return {
            'input input.column[type="checkbox"]': 'onColumnInput',
            'input select[name="peak-time-type"]': 'onPeakTimeTypeInput',
            'input select[name="peak-distance-type"]': 'onPeakDistanceTypeInput',
            'input input.pref[type="checkbox"]': 'onPrefInput',
        };
    }

    async onPrefInput(ev) {
        const enabled = ev.currentTarget.checked;
        const name = ev.currentTarget.name;
        await this.panelView.savePrefs({[name]: enabled});
        await this.panelView.render();
    }

    async onColumnInput(ev) {
        const enabled = ev.currentTarget.checked;
        const name = ev.currentTarget.name;
        this.panelView.getPrefs('columns', {})[name] = !!enabled;
        await this.panelView.savePrefs();
        await this.panelView.render();
    }

    async onPeakTimeTypeInput(ev) {
        const peakTimeType = ev.currentTarget.value;
        const tables = [this.panelView.activityTable];
        if (this.panelView.getPrefs('comparisonView')) {
            tables.push(this.panelView.activityTableAux);
        }
        for (const x of tables) {
            x.setPeakColType('time', peakTimeType);
            await x.setActivities(x.activities);
        }
        await this.panelView.savePrefs({peakTimeType});
    }

    async onPeakDistanceTypeInput(ev) {
        const peakDistanceType = ev.currentTarget.value;
        const tables = [this.panelView.activityTable];
        if (this.panelView.getPrefs('comparisonView')) {
            tables.push(this.panelView.activityTableAux);
        }
        for (const x of tables) {
            x.setPeakColType('distance', peakDistanceType);
            await x.setActivities(x.activities);
        }
        await this.panelView.savePrefs({peakDistanceType});
    }

    renderAttrs(attrs) {
        return {
            ...super.renderAttrs(),
            availableColumns: this.panelView.activityTable.availableColumns,
            ...attrs,
        };
    }
}


export class ActivityTablePanelView extends ResizablePerfView {
    static uuid = 'c9222e6a-80ee-4ccc-a45c-dfe996c3ec16';
    static tpl = 'performance/activity-table-panel.html';
    static SettingsView = ActivityTablePanelSettingsView;
    static typeLocaleKey = 'performance_activity_table_type';
    static nameLocaleKey = 'performance_activity_table_name';
    static descLocaleKey = 'performance_activity_table_desc';
    static localeKeys = ['/type'];

    get defaultPrefs() {
        return {
            comparisonView: false,
            peakTimeType: 'power',
            peakDistanceType: 'pace',
            columns: {
                'name': true,
                'date': true,
                'type': true,
                'time': true,
                'distance': true,
                'speed': true,
                'elevation': true,
                'np': true,
                'tss': true,
            },
        };
    }

    get events() {
        return {
            ...super.events,
            'change .aux-table-header select[name="aux-range"]': 'onAuxRangeChange',
            'input .aux-table-header input[type="date"]': 'onAuxDateChange',
            'input header input[name="sauce-activity-search"]': 'onActivitySearch',
        };
    }

    async init({pageView, ...options}) {
        await super.init({pageView, ...options});
        const {sortBy, sortDesc} = this.getPrefs();
        this._searchTrigramCache = new WeakMap();
        this.activityTable = new ActivityTableView({pageView, sortBy, sortDesc, ...options});
        this.activityTableAux = new ActivityTableView({pageView, sortBy, sortDesc, ...options});
        await this.activityTable.initializing;
        await this.activityTableAux.initializing;
        this._mainTableResizeObserver = new ResizeObserver(
            sauce.settled(this.layoutAuxTable, 200).bind(this));
        this.listenTo(this.activityTable, 'render', this.onMainTableRender);
        this.listenTo(this.activityTableAux, 'render', this.layoutAuxTable);
        this.listenTo(this.activityTable, 'sort', this.onTableSort);
        this.listenTo(pageView, 'before-update-activities', () =>
            this.$('.loading-mask').addClass('loading'));
        this.listenTo(pageView, 'update-activities', sauce.debounced(this.onUpdateActivities));
    }

    renderAttrs() {
        return {
            name: this.name,
            ...this.getPrefs(),
        };
    }

    async render() {
        this.$('.loading-mask').addClass('loading');
        try {
            await super.render();
            const enabled = this.getPrefs('columns');
            const columns = this.activityTable.availableColumns.filter(x => enabled[x.id]);
            this.activityTable.setElement(this.$('.table-wrap.main'));
            this.activityTable.setPeakColType('time', this.getPrefs('peakTimeType'));
            this.activityTable.setPeakColType('distance', this.getPrefs('peakDistanceType'));
            this.activityTable.setActivityFilter(undefined);
            await this.activityTable.setColumns(columns);
            if (this.getPrefs('comparisonView')) {
                this.activityTableAux.setElement(this.$('.table-wrap.aux'));
                this.activityTableAux.setPeakColType('time', this.getPrefs('peakTimeType'));
                this.activityTableAux.setPeakColType('distance', this.getPrefs('peakDistanceType'));
                this.activityTableAux.setActivityFilter(undefined);
                await this.activityTableAux.setColumns(columns);
                await this.updateAuxTableActivities();
            }
        } finally {
            this.$('.loading-mask').removeClass('loading');
        }
    }

    async updateAuxTableActivities() {
        const auxRange = this.getPrefs('auxRange') || this.$('select[name="aux-range"]').val();
        const range = this.pageView.range.clone();
        if (auxRange === 'custom') {
            range.start = this.getPrefs('auxRangeStart') || undefined;
            range.end = this.getPrefs('auxRangeEnd') || undefined;
        } else if (auxRange === 'prev') {
            range.shift(-1);
        } else if (auxRange === 'next') {
            range.shift(1);
        } else if (auxRange === 'before') {
            range.end = range.start;
            range.start = undefined;
        } else if (auxRange === 'after') {
            range.start = range.end;
            range.end = undefined;
        } else if (auxRange === 'all') {
            range.start = range.end = undefined;
        } else {
            console.error('Invalid aux range', auxRange);
            range.start = range.end = undefined;
        }
        if (range.start && range.end) {
            if (range.start >= range.end) {
                console.warn("Empty or inverted range", range.start, range.end);
                range.end = range.start + 1;
            }
        }
        const sig = JSON.stringify([range.start, range.end]);
        if (this._lastAuxRangeSig === sig) {
            return;
        }
        this._lastAuxRangeSig = sig;
        const $start = this.$('input[type="date"][name="aux-start"]');
        const $end = this.$('input[type="date"][name="aux-end"]');
        $start.attr('max', $end.val())[0].valueAsNumber = range.start;
        $end.attr('min', $start.val())[0].valueAsNumber = range.end;
        const activities = await sauce.hist.getActivitiesForAthlete(this.pageView.athlete.id, {
            start: range.start != null ? +range.start : undefined,
            end: range.end != null ? +range.end : undefined,
            excludeUpper: true
        });
        await this.activityTableAux.setActivities(activities);
    }

    onActivitySearch(ev) {
        const el = ev.currentTarget;
        const rawValue = el.value;
        const parts = rawValue.toLowerCase().split(/(type:[a-z]+)|(is:[a-z]+)|(name:".*?")/);
        const types = [];
        const ises = [];
        let name;
        const texts = [];
        for (const part of parts) {
            if (!part || !part.match(/[a-zA-Z0-9]/)) {
                continue;
            }
            if (part.match(/^type:[a-z]+$/)) {
                const type = part.split('type:')[1];
                if (['ride', 'run', 'swim', 'workout'].includes(type)) {
                    types.push(type);
                }
            } else if (part.match(/^is:[a-z]+$/)) {
                const is = part.split('is:')[1];
                if (['virtual', 'commute'].includes(is)) {
                    ises.push(is);
                }
            } else if (part.match(/^name:".*?"$/)) {
                name = part.split('name:')[1].slice(1, -1);
            } else {
                if (part && part.trim().length >= 2) {
                    texts.push(part);
                }
            }
        }
        const filterFns = [];
        if (types.length) {
            filterFns.push(activity => types.includes(activity.basetype));
        }
        if (ises.length) {
            filterFns.push(activity => ises.some(x => activity[x] === true));
        }
        if (name && name.length > 3) {
            filterFns.push(activity => activity.name && activity.name.toLowerCase().includes(name));
        }
        if (texts.length) {
            const searchGrams = this.makeTrigrams(texts.join(' '));
            const similarity = 0.8;
            const similaritySize = Math.round(searchGrams.size * similarity);
            filterFns.push(activity => {
                let actGrams = this._searchTrigramCache.get(activity);
                if (!actGrams) {
                    actGrams = this.makeTrigrams(`${activity.name || ''}\n\n${activity.description || ''}`);
                    this._searchTrigramCache.set(activity, actGrams);
                }
                // NOTE: Don't use `intersection()` even when available.  It's slower.
                let found = 0;
                for (const xx of searchGrams) {
                    if (actGrams.has(xx)) {
                        if (++found >= similaritySize) {
                            return true;
                        }
                    }
                }
                return false;
            });
        }
        const filter = filterFns.length > 1 ?
            activity => filterFns.every(x => x(activity)) :
            filterFns[0];
        this.activityTable.setActivityFilter(filter);
        if (this.getPrefs('comparisonView')) {
            this.activityTableAux.setActivityFilter(filter);
        }
    }

    makeTrigrams(value) {
        const grams = new Set();
        if (!value) {
            return grams;
        }
        value = value.toLowerCase().replace(/\s+/g, ' ').padEnd(3, ' ');
        for (let i = 0; i < value.length; i++) {
            const gram = value.substr(i, 3);
            if (gram.length === 3) {
                grams.add(gram);
            }
        }
        return grams;
    }

    async onAuxRangeChange(ev) {
        this.savePrefs({auxRange: ev.currentTarget.value});
        await this.updateAuxTableActivities();
    }

    async onAuxDateChange(ev) {
        const isStart = ev.currentTarget.name === 'aux-start';
        const key = isStart ? 'auxRangeStart' : 'auxRangeEnd';
        this.$('select[name="aux-range"]').val('custom');
        await this.savePrefs({[key]: ev.currentTarget.valueAsNumber, auxRange: 'custom'});
        await this.updateAuxTableActivities();
    }

    onMainTableRender(table) {
        this._mainTableResizeObserver.disconnect();
        for (const x of table.el.querySelectorAll(':scope > table > thead > tr > th')) {
            this._mainTableResizeObserver.observe(x, {box: 'border-box'});
        }
    }

    layoutAuxTable() {
        const firstRow = this.activityTableAux.el.querySelector(
            ':scope > table > tbody:first-of-type > tr[data-id]');
        if (!firstRow) {
            return;
        }
        // Batch reads and writes to avoid layout thrash..
        const widths = [];
        for (const x of this.activityTable.el.querySelectorAll(':scope > table > thead > tr > th')) {
            widths.push(x.getBoundingClientRect().width);
        }
        for (const [i, x] of widths.entries()) {
            firstRow.children[i].style.width = `${x}px`;
        }
    }

    onMainTableResize(resized) {
        const firstRow = this.activityTableAux.el.querySelector(
            ':scope > table > tbody:first-of-type > tr[data-id]');
        if (!firstRow) {
            return;
        }
        for (const [i, x] of resized.entries()) {
            firstRow.children[i].style.width = `${x.borderBoxSize[0].inlineSize}px`;
        }
    }


    async onTableSort({sortBy, sortDesc}) {
        await this.savePrefs({sortBy, sortDesc});
        if (this.getPrefs('comparisonView')) {
            this.activityTableAux.sortBy = sortBy;
            this.activityTableAux.sortDesc = sortDesc;
            this.activityTableAux.sort();
            await this.activityTableAux.render();
        }
    }

    async onUpdateActivities({activities}) {
        try {
            await this.activityTable.setActivities(activities);
            if (this.getPrefs('comparisonView')) {
                await this.updateAuxTableActivities();
            }
        } finally {
            this.$('.loading-mask').removeClass('loading');
        }
    }
}


export const PanelViews = [
    ActivityTablePanelView
];


export class MainView extends PerfView {
    static tpl = 'performance/fitness/main.html';
    static localeKeys = [
        'activities', 'today', 'panel_settings_title', 'auto', '/delete', '/add',
        'panel_add_title'
    ];

    get events() {
        return {
            ...super.events,
            'change header.filters select[name="range"]': 'onRangeChange',
            'click header.filters .btn.range': 'onRangeShiftClick',
            'click header.filters .dates .range': 'onRangeDateClick',
            'click header.filters .btn.expand': 'onExpandClick',
            'click header.filters .btn.compress': 'onCompressClick',
            'click header.filters .btn.add-panel': 'onPanelAddClick',
            'click .sauce-panel .sauce-panel-settings.btn': 'onPanelSettingsClick',
            'click .sauce-panel .sauce-panel-maximize.btn': 'onPanelMaximizeClick',
            'click .sauce-panel .sauce-panel-restore.btn': 'onPanelRestoreClick',
        };
    }

    get defaultPrefs() {
        return {
            maximized: false,
        };
    }

    get availablePanelViews() {
        return [ActivityTablePanelView];
    }

    async init({pageView, ...options}) {
        this.panels = [];
        this.listenTo(pageView, 'before-update-activities', this.onBeforeUpdateActivities);
        this.listenTo(pageView, 'available-activities-changed', this.onAvailableChanged);
        await super.init({pageView, ...options});
        const invalid = [];
        const panelPrefs = this.getPrefs('panels');
        for (const [i, x] of panelPrefs.entries()) {
            const p = await this._createPanel(x);
            if (!p) {
                invalid.unshift(i);  // splice from back to front
            } else {
                this.panels.push(p);
            }
        }
        if (invalid.length) {
            for (const i of invalid) {
                console.warn("Removing invalid panel view:", panelPrefs[i]);
                panelPrefs.splice(i, 1);
            }
            await this.savePrefs();
        }
    }

    async _createPanel(prefs) {
        const View = this.availablePanelViews.find(x => x.uuid === prefs.view);
        if (!View) {
            return;  // deprecated view (hopefully)
        }
        if (!prefs.settings) {
            prefs.settings = {};
        }
        const name = prefs.settings.name || await L.getMessage(View.nameLocaleKey);
        const id = prefs.id;
        const view = new View({id, name, pageView: this.pageView});
        return {view, prefs};
    }

    setElement(el, ...args) {
        const r = super.setElement(el, ...args);
        this.toggleMaximized(this.getPrefs('maximized'), {noSave: true, noAside: true});
        return r;
    }

    async toggleMaximized(maximized, options={}) {
        this.$el.toggleClass('maximized', maximized);
        this.$el.prev('nav').toggleClass('collapsed', maximized);
        if (!options.noAside) {
            await this.pageView.detailsView.toggleCollapsed(maximized);
        }
        if (!options.noSave) {
            await this.savePrefs({maximized});
        }
    }

    renderAttrs() {
        const range = this.pageView.range;
        return {range: [range.period, range.metric].join()};
    }

    async render() {
        await super.render();
        const $panels = this.$('.sauce-panels');
        const asyncPending = [];
        for (const [i, x] of this.panels.entries()) {
            x.view.el.classList.add('sauce-panel');
            x.view.el.dataset.id = x.prefs.id;
            x.view.el.style.order = i;
            x.view.el.style.setProperty('--height-factor', x.prefs.settings.heightFactor || 1);
            x.view.el.style.setProperty('--width-factor', x.prefs.settings.widthFactor || 1);
            // Required if parent view re-rendered due to jQuery.html removing child event listeners.
            x.view.delegateEvents();
            asyncPending.push(x.view.render().then(() => $panels.append(x.view.$el)));
        }
        await Promise.all(asyncPending);
    }

    async onExpandClick(ev) {
        await this.toggleMaximized(true);
    }

    async onCompressClick(ev) {
        await this.toggleMaximized(false);
    }

    async onPanelAddClick(ev) {
        const template = await sauce.template.getTemplate('performance/panel-add.html', 'performance');
        const panelViews = this.availablePanelViews;
        let selected = Object.values(panelViews)[0];
        const $dialog = sauce.ui.dialog({
            width: '18em',
            autoDestroy: true,
            flex: true,
            title: this.LM('panel_add_title'),
            icon: await sauce.ui.getImage('fa/layer-plus-duotone.svg'),
            body: await template({panelViews, selected}),
            extraButtons: [{
                text: this.LM('add'),
                class: 'btn btn-primary',
                click: async () => {
                    const panelPrefs = {
                        id: `panel-custom-${selected.uuid}-${Date.now()}`,
                        view: selected.uuid,
                        settings: {
                            name: $dialog.find('input[name="name"]').val() || undefined,
                        }
                    };
                    this.getPrefs('panels').unshift(panelPrefs);
                    this.panels.unshift(await this._createPanel(panelPrefs));
                    await this.savePrefs();
                    await this.render();
                    await this.pageView.schedUpdateActivities();
                    $dialog.dialog('destroy');
                }
            }],
            position: {
                my: 'right top',
                at: 'right-2 top+2',
                of: ev.currentTarget,
            },
            dialogClass: 'sauce-performance-panel-settings no-pad sauce-small',
            resizable: false,
        });
        $dialog.on('change', 'select[name="type"]', async ev => {
            const el = ev.currentTarget;
            selected = panelViews.find(x => x.uuid === el.value);
            $dialog.find('.desc').text(await L.getMessage(selected.descLocaleKey));
            $dialog.find('input[name="name"]').attr(
                'placeholder', await L.getMessage(selected.nameLocaleKey));
        });
    }

    onPanelMaximizeClick(ev) {
        const el = ev.currentTarget;
        el.closest('.sauce-panel').classList.add('maximized');
        el.classList.add('hidden');
        el.parentElement.querySelector('.sauce-panel-restore.btn').classList.remove('hidden');
        this.el.scrollIntoView();
    }

    onPanelRestoreClick(ev) {
        const el = ev.currentTarget;
        el.classList.add('hidden');
        el.parentElement.querySelector('.sauce-panel-maximize.btn').classList.remove('hidden');
        el.closest('.sauce-panel').classList.remove('maximized');
    }

    async onPanelSettingsClick(ev) {
        const panelEl = ev.currentTarget.closest('.sauce-panel');
        const id = panelEl.dataset.id;
        let order = this.panels.findIndex(x => x.prefs.id === id);
        const allPrefs = this.getPrefs('panels');
        const panel = this.panels[order];
        const template = await sauce.template.getTemplate('performance/panel-settings.html', 'performance');
        const settings = panel.prefs.settings;
        const sizeHint = key => !settings[key + 'Factor'] ?
            this.LM('auto') : H.number(settings[key + 'Factor'] * 100) + '%';
        const throttleAnimation = sauce.ui.throttledAnimationFrame();
        const $dialog = sauce.ui.dialog({
            width: '18em',
            autoDestroy: true,
            flex: true,
            title: this.LM('panel_settings_title'),
            icon: await sauce.ui.getImage('fa/cog-duotone.svg'),
            body: await template({
                panelView: panel.view,
                panelCount: this.panels.length,
                settings,
                order,
                sizeHint,
            }),
            extraButtons: [{
                text: this.LM('delete'),
                class: 'btn sauce-negative',
                click: async () => {
                    allPrefs.splice(order, 1);
                    this.panels.splice(order, 1);
                    await this.savePrefs();
                    await this.render();
                    await this.pageView.schedUpdateActivities();
                    $dialog.dialog('destroy');
                }
            }],
            position: {
                my: 'left top',
                at: 'left+38 top-8',
                collision: 'flip',
                of: ev.currentTarget,
            },
            dialogClass: 'sauce-performance-panel-settings no-pad sauce-small',
            resizable: false,
        });
        if (panel.view.constructor.SettingsView) {
            const v = new panel.view.constructor.SettingsView(
                panel.view, {el: $dialog.find('.panel-settings')});
            v.render();  // bg okay
            $dialog.on('dialogclose', () => v.remove());
        }
        $dialog.on('input', 'input[name="panel-name"]', async ev => {
            const el = ev.currentTarget;
            const name = el.value || undefined;
            const nameEl = panelEl.querySelector('.panel-name');
            if (nameEl) {
                nameEl.textContent = name || await L.getMessage(panel.view.constructor.nameLocaleKey);
            }
            settings.name = name;  // For reloads
            panel.view.name = name;  // For rerenders
            await this.savePrefs();
        });
        $dialog.on('input', 'input[name="panel-position"]', async ev => {
            const el = ev.currentTarget;
            // XXX streamline splicing to just one entity
            const tp = allPrefs[order];
            allPrefs.splice(order, 1);
            this.panels.splice(order, 1);
            order = Number(el.value);
            allPrefs.splice(order, 0, tp);
            this.panels.splice(order, 0, panel);
            el.nextElementSibling.textContent = order + 1;
            for (const [i, x] of this.panels.entries()) {
                x.view.$el[0].style.order = i;
            }
            await this.savePrefs();
            panel.view.el.scrollIntoView({behavior: 'smooth'});
        });
        $dialog.on('input', 'input.size-factor[type="range"]', async ev => {
            const el = ev.currentTarget;
            const dimension = el.dataset.dim;
            const value = Number(el.value);
            settings[dimension + 'Factor'] = value;
            throttleAnimation(() => {
                el.nextElementSibling.textContent = sizeHint(dimension);
                panel.view.el.style.setProperty(`--${dimension}-factor`, value || 1);
            });
            await this.savePrefs();
        });
    }

    async onRangeChange(ev) {
        let [rawPeriod, metric] = ev.currentTarget.value.split(',');
        const all = !metric && rawPeriod === 'all';
        if (all) {
            [rawPeriod, metric] = this.pageView.getAllRange();
        }
        await this.pageView.setRangePeriod(Number(rawPeriod), metric, {all});
    }

    onRangeShiftClick(ev) {
        const classes = ev.currentTarget.classList;
        const adj = classes.contains('newest') ?
            Infinity :
            classes.contains('oldest') ?
                -Infinity :
                classes.contains('next') ?
                    1 :
                    -1;
        ev.currentTarget.classList.add('sauce-busy');
        this.pageView.shiftRange(adj).finally(() =>
            // follows a debounced update-activities
            ev.currentTarget.classList.remove('sauce-busy'));
        this.updateRangeButtons();
    }

    onRangeDateClick(ev) {
        const el = ev.currentTarget;
        if (el.classList.contains('editing')) {
            return;
        }
        const isStart = el.classList.contains('start');
        const cal = document.createElement('input');
        cal.type = 'date';
        const range = this.pageView.range;
        if (isStart) {
            cal.valueAsNumber = +range.start;
            cal.min = isoDate(D.dayBefore(this.pageView.oldest || 0));
            cal.max = isoDate(D.dayBefore(range.end));
        } else {
            cal.valueAsNumber = +D.dayBefore(range.end);
            cal.min = isoDate(range.start);
            cal.max = isoDate(D.adjacentDay(D.tomorrow(), 365));
        }
        cal.addEventListener('input', async ev => {
            const date = (cal.checkValidity() && cal.valueAsNumber) ?
                new Date(D.addTZ(cal.valueAsNumber)) :
                NaN;
            if (isNaN(date)) {
                console.warn("Ignoring invalid date:", cal.value);
                return;
            }
            let start, end;
            if (isStart) {
                start = date;
            } else {
                end = D.dayAfter(date);
            }
            await this.pageView.setRangeCustomStartEnd(start, end);
        });
        cal.addEventListener('blur', ev => {
            el.classList.remove('editing');
            this.updateRangeButtons();
        });
        el.classList.add('editing');
        el.replaceChildren(cal);
        cal.focus();
        cal.showPicker();
    }

    onAvailableChanged({oldest}) {
        this.updateRangeButtons(null, oldest);
    }

    onBeforeUpdateActivities({range}) {
        this.updateRangeButtons(range);
    }

    updateRangeButtons(range, oldest) {
        range = range || this.pageView.range;
        oldest = oldest || this.pageView.oldest;
        const $start = this.$('header .range.start');
        const $end = this.$('header .range.end');
        const selectedRange = this.pageView.allRange ? 'all' : `${range.period},${range.metric}`;
        const $range = this.$('> header.filters select[name="range"]');
        let $option = $range.find(`option[value="${selectedRange}"]`);
        if (!$option.length) {
            // Just manually add an entry.  The user may be playing with the URL and that's fine.
            $option = jQuery(`<option value="${range.period},${range.metric}">` +
                `${range.period} ${range.metric}</option>`);
            $range.append($option);
        }
        $option[0].selected = true;
        if (!$start.hasClass('editing')) {
            $start.text(H.date(range.start));
        }
        const isStart = range.start <= oldest;
        this.$('.btn.range.prev').toggleClass('disabled', isStart);
        this.$('.btn.range.oldest').toggleClass('disabled', isStart);
        const isEnd = range.end >= Date.now();
        this.$('.btn.range.next').toggleClass('disabled', isEnd);
        this.$('.btn.range.newest').toggleClass('disabled', isEnd);
        if (!$end.hasClass('editing')) {
            $end.text(isEnd ?
                new Intl.RelativeTimeFormat([], {numeric: 'auto'}).format(0, 'day') :
                H.date(D.roundToLocaleDayDate(range.end - DAY)));
        }
    }
}


export class PageView extends PerfView {
    static tpl = 'performance/page.html';
    static localeKeys = ['weekly', 'monthly', 'yearly'];

    get events() {
        return {
            ...super.events,
            'change nav select[name="athlete"]': 'onAthleteChange',
            'click .onboarding-stack .btn.enable': 'onOnboardingEnableClick',
        };
    }

    get defaultPrefs() {
        return {
            defaultRange: {
                period: 12,
                metric: 'weeks',
                all: false,
            }
        };
    }

    async init({router, MainView, athletes, ...options}) {
        this.router = router;
        this.onSyncProgress = this._onSyncProgress.bind(this);
        this.athletes = athletes;
        this.syncButtons = new Map();
        const f = router.filters;
        this.schedUpdateActivities = sauce.debounced(this._schedUpdateActivities);
        await this.setAthleteId(f.athleteId);
        this._setRangeFromRouter();
        this.summaryView = new SummaryView({pageView: this});
        this.mainView = new MainView({pageView: this});
        this.detailsView = new DetailsView({pageView: this});
        router.setFilters(this.athlete, this.range, {replace: true, all: this.allRange});
        router.on('route:onNav', this.onRouterNav.bind(this));
        router.on('route:onNavAll', this.onRouterNav.bind(this));
        await super.init(options);
    }

    _setRangeFromRouter() {
        const f = this.router.filters;
        const defaults = this.getPrefs().defaultRange;
        this.allRange = f.all || (f.all === undefined && defaults.all);
        if (this.allRange) {
            const [period, metric] = this.getAllRange();
            this.range = new D.CalendarRange(null, period, metric);
        } else {
            this.range = new D.CalendarRange(
                f.suggestedEnd,
                f.period || defaults.period || 4,
                f.metric || defaults.metric || 'weeks');
        }
    }

    getMetricLocale(metric) {
        const localeMetricMap = {
            weeks: 'weekly',
            months: 'monthly',
            years: 'yearly',
        };
        return this.LM(localeMetricMap[metric]);
    }

    renderAttrs() {
        return {
            athletes: Array.from(this.athletes.values()),
            athleteId: this.athlete && this.athlete.id,
            range: [this.range.period, this.range.metric].join(),
        };
    }

    async render() {
        this.syncButtons.clear();  // Must not reuse on re-render() for DOM events.
        const syncBtnPromise = this.athlete && this.getSyncButton(this.athlete.id);
        await super.render();
        const range = this.range.clone({frozen: true});
        const actsPromise = this.athlete && this._getActivities(range);
        if (!this.athlete) {
            return;
        }
        this.$('nav .athlete select').after(await syncBtnPromise);
        this.summaryView.setElement(this.$('nav .summary'));
        this.mainView.setElement(this.$('main'));
        this.detailsView.setElement(this.$('aside.details'));
        await Promise.all([
            this.summaryView.render(),
            this.detailsView.render(),
            this.mainView.render(),
        ]);
        this.trigger('before-update-activities', {athlete: this.athlete, range});
        this._updateActivities(await actsPromise);
    }

    async setAthleteId(athleteId) {
        if (athleteId && this.athletes.has(athleteId)) {
            this.athlete = this.athletes.get(athleteId);
        } else {
            if (athleteId || Object.is(athleteId, NaN)) {
                console.warn("Invalid athlete:", athleteId);
            }
            this.athlete = this.athletes.get(currentAthlete.id) || this.athletes.values().next().value;
        }
        const $oldBtn = this.$('nav .athlete .sauce-sync-button');
        if ($oldBtn.length) {
            // No-op during init(), but needed for updates.
            this.getSyncButton(this.athlete.id).then($btn => $oldBtn.before($btn).detach());
        }
        if (this.syncController) {
            this.syncController.removeEventListener('progress', this.onSyncProgress);
        }
        if (this.athlete) {
            const _athlete = this.athlete;
            const isNew = !hasSyncController(this.athlete.id);
            this.syncController = getSyncController(this.athlete.id);
            this.syncController.addEventListener('progress', this.onSyncProgress);
            if (isNew) {
                // Update our model and monitor for changes.
                this.syncController.addEventListener('active', ev =>
                    Object.assign(_athlete, ev.data.athlete));
                Object.assign(_athlete, await sauce.hist.getAthlete(this.athlete.id));
            }
            if (this.athlete.lastSync != null && Date.now() - this.athlete.lastSync > lastSyncMaxAge) {
                setTimeout(() => sauce.hist.syncAthlete(this.athlete.id), 400);
            }
        } else {
            this.syncController = null;
        }
        await this.refreshNewestAndOldest();
    }

    async _onSyncProgress(ev) {
        const done = ev.data.done;
        if (!done.count) {
            return;
        }
        // Little bit of a hack here, to reflect training load values properly
        // we need to treat updated activities from about 42 days before our range
        // start as an update to our activities, because it's very possible the
        // ATL/CTL seed values will be forward propagated into our activity range.
        if (this.range && this.range.start && this.range.end) {
            const rangeStart = +this.range.start - (42 * DAY);
            if (done.oldest <= this.range.end && done.newest >= rangeStart) {
                await this.schedUpdateActivities();
                await this.refreshNewestAndOldest();
            }
        }
    }

    async refreshNewestAndOldest() {
        const id = this.athlete && this.athlete.id;
        if (!id) {
            return;
        }
        const [wasNewest, wasOldest] = [this.newest, this.oldest];
        [this.newest, this.oldest] = await Promise.all([
            sauce.hist.getNewestActivityForAthlete(id).then(a => a && a.ts),
            sauce.hist.getOldestActivityForAthlete(id).then(a => a && a.ts),
        ]);
        // Handle new athlete / sync in progress...
        if (!this.newest) {
            this.newest = D.tomorrow();
        }
        if (!this.oldest) {
            this.oldest = D.today();
        }
        const updated = wasNewest !== this.newest || wasOldest !== this.oldest;
        if (updated) {
            this.trigger('available-activities-changed', {newest: this.newest, oldest: this.oldest});
        }
    }

    async getSyncButton(id) {
        if (!this.syncButtons.has(id)) {
            const $btn = await sauce.sync.createSyncButton(id, null, {noStatus: true});
            $btn.addClass('btn-icon-only btn-unstyled');
            this.syncButtons.set(id, $btn);
        }
        return this.syncButtons.get(id);
    }

    async onAthleteChange(ev) {
        const id = Number(ev.currentTarget.value);
        await this.setAthleteId(id);
        this.trigger('change-athlete', this.athlete);
        if (this.allRange) {
            const [period, metric] = this.getAllRange();
            this._setRangePeriod(period, metric, {all: true});
        }
        this.router.setFilters(this.athlete, this.range, {all: this.allRange});
        await this.schedUpdateActivities();
    }

    async onRouterNav() {
        // This func gets valid arguments but they are raw.  Use the filters object instead.
        const f = this.router.filters;
        if (f.athleteId !== this.athlete.id) {
            await this.setAthleteId(f.athleteId);
            this.$(`select[name="athlete"] option[value="${f.athleteId}"]`)[0].selected = true;
            this.trigger('change-athlete', this.athlete);
        }
        this._setRangeFromRouter();
        await this.schedUpdateActivities();
    }

    getAllRange() {
        let period, metric;
        const now = new Date();
        const days = (now - this.oldest) / DAY;
        if (days > 3 * 365) {
            metric = 'years';
            period = (now.getFullYear() - new Date(this.oldest).getFullYear()) + 1;
        } else if (days > 200) {
            metric = 'months';
            const years = (now.getFullYear() - new Date(this.oldest).getFullYear());
            period = ((now.getMonth() + (years * 12)) - new Date(this.oldest).getMonth()) + 1;
        } else {
            metric = 'weeks';
            period = Math.ceil(days / 7);
        }
        return [period, metric];
    }

    _setRangePeriod(period, metric, options={}) {
        // This keeps the range from floating past the present when we go
        // from a big range to a smaller one.
        this.allRange = !!options.all;
        this.range.setPeriod(period);
        this.range.setMetric(metric);
        const tomorrow = D.tomorrow();
        this.range.setEndSeed(this.range.end > tomorrow ? tomorrow : this.range.end);
        this.savePrefs({defaultRange: {period, metric, all: options.all}});  // bg okay
    }

    async setRangePeriod(period, metric, options={}) {
        this._setRangePeriod(period, metric, options);
        this.router.setFilters(this.athlete, this.range, options);
        await this.schedUpdateActivities();
    }

    async setRangeCustomStartEnd(start, end) {
        const proposedRange = (end != null ? end : this.range.end) -
            (start != null ? start : this.range.start);
        if (proposedRange > 100 * 365 * DAY) {
            // Prevent OOM bugs with insane ranges...
            console.error('Invalid range (too big)', proposedRange);
            return;
        } else if (proposedRange < 0) {
            console.error('Invalid range (negative)', proposedRange);
            return;
        }
        if (start != null) {
            this.range.start = new Date(start);
        }
        if (end != null) {
            this.range.end = new Date(end);
        }
        this.range.setPeriodAggregateDays((this.range.end - this.range.start) / DAY);
        this.router.setFilters(this.athlete, this.range);
        await this.schedUpdateActivities();
    }

    shiftRange(offset) {
        if (offset === Infinity) {
            this.range.setEndSeed(D.tomorrow());
        } else if (offset === -Infinity) {
            this.range.setStartSeed(this.oldest);
        } else {
            this.range.shift(offset);
        }
        this.router.setFilters(this.athlete, this.range);
        return this.schedUpdateActivities();
    }

    async _schedUpdateActivities() {
        const range = this.range.clone({frozen: true});
        this.trigger('before-update-activities', {athlete: this.athlete, range});
        this._updateActivities(await this._getActivities(range));
    }

    async _getActivities(range) {
        const start = +range.start;
        const end = +range.end;
        const activities = await sauce.hist.getActivitiesForAthlete(
            this.athlete.id, {start, end, includeTrainingLoadSeed: true, excludeUpper: true});
        return {activities, range};
    }

    _updateActivities({activities, range}) {
        let atl = 0;
        let ctl = 0;
        if (activities.length) {
            ({atl, ctl} = activities[0].trainingLoadSeed);
        }
        const end = Math.min(range.end, D.tomorrow());
        const daily = data.activitiesByDay(activities, range.start, end, atl, ctl);
        let metricData;
        if (range.metric === 'weeks') {
            metricData = data.aggregateActivitiesByWeek(daily, {isoWeekStart: true});
        } else if (range.metric === 'months') {
            metricData = data.aggregateActivitiesByMonth(daily);
        } else if (range.metric === 'years') {
            metricData = data.aggregateActivitiesByYear(daily);
        } else {
            throw new TypeError('Unsupported range metric: ' + range.metric);
        }
        this.trigger('update-activities', {
            athlete: this.athlete,
            range,
            activities,
            daily,
            metricData,
        });
    }
}


export class OnboardingView extends PerfView {
    static tpl = 'performance/onboarding.html';

    get events() {
        return {
            ...super.events,
            'click .onboarding-stack .btn.enable': 'onOnboardingEnableClick',
        };
    }

    async init(options) {
        this.$el.addClass('onboarding');
        if (self.CSS && self.CSS.registerProperty) {
            this.$el.addClass('animate-hue');
            CSS.registerProperty({
                name: '--colorwheel-conic-turn',
                syntax: '<number>',
                inherits: true,
                initialValue: 0
            });
        }
        await super.init(options);
    }

    async onOnboardingEnableClick(ev) {
        ev.currentTarget.classList.add('sauce-loading');
        let athlete = await sauce.hist.getAthlete(currentAthlete.id);
        if (!athlete) {
            athlete = await sauce.hist.addAthlete({
                id: currentAthlete.id,
                gender: currentAthlete.get('gender') === 'F' ? 'female' : 'male',
                name: currentAthlete.get('display_name'),
            });
        }
        await sauce.hist.enableAthlete(athlete.id);
        location.reload();
    }
}
