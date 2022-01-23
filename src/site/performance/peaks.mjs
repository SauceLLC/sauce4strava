/* global sauce */

import * as views from './views.mjs';

const L = sauce.locale;
const H = L.human;


const _athleteCache = new Map();
async function getAthlete(id, maxAge=3600 * 1000) {
    const cached = _athleteCache.get(id);
    if (cached && (Date.now() - cached.ts) < maxAge) {
        return cached.value;
    } else {
        const athlete = await sauce.hist.getAthlete(id);
        _athleteCache.set(id, {ts: Date.now(), value: athlete});
        return athlete;
    }
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


function getPeaksValueFormatter(streamType) {
    return {
        power: H.number,
        power_wkg: x => x.toFixed(1),
        np: H.number,
        xp: H.number,
        hr: H.number,
        pace: H.pace,
        gap: H.pace,
    }[streamType];
}


class PeaksTableView extends views.PerfView {
    get events() {
        return {
            ...super.events,
            'change .peak-controls select[name="type"]': 'onTypeChange',
            'change .peak-controls select[name="time"]': 'onTimeChange',
            'change .peak-controls select[name="distance"]': 'onDistanceChange',
            'change .peak-controls select[name="limit"]': 'onLimitChange',
            'change .peak-controls select[name="activityType"]': 'onActivityTypeChange',
            'input .peak-controls input[name="include-all-athletes"]': 'onIncludeAllAthletesInput',
            'input .peak-controls input[name="include-all-dates"]': 'onIncludeAllDatesInput',
            'click .results table tbody tr': 'onResultClick',
            'click .edit-activity': 'onEditActivityClick',
            'pointerdown .resize-drag': 'onResizePointerDown',
        };
    }

    get tpl() {
        return 'performance/peaks/table.html';
    }

    get defaultPrefs() {
        return {
            type: 'power',
            limit: 10,
            time: 300,
            distance: 10000,
            includeAllAthletes: false,
            includeAllDates: false,
            activityType: null,
        };
    }

    async init({pageView}) {
        this.pageView = pageView;
        this.range = pageView.getRangeSnapshot();
        this.athlete = pageView.athlete;
        this.athleteNameCache = new Map();
        this.listenTo(pageView, 'before-update-activities',
            sauce.asyncDebounced(this.onBeforeUpdateActivities));
        this.peakRanges = {
            periods: await views.getPeakRanges('periods'),
            distances: await views.getPeakRanges('distances'),
        };
        await super.init();
    }

    renderAttrs() {
        const prefs = this.getPrefs();
        return {
            prefs,
            peaks: this.peaks,
            mile: 1609.344,
            unit: getPeaksUnit(prefs.type),
            valueFormatter: getPeaksValueFormatter(prefs.type),
            athleteName: this.athleteName.bind(this),
            peakRanges: this.peakRanges,
        };
    }

    async render() {
        this.$el.addClass('loading');
        try {
            await this.loadPeaks();
            await super.render();
        } finally {
            this.$el.removeClass('loading');
        }
    }

    async athleteName(id) {
        const athlete = await getAthlete(id);
        return athlete ? athlete.name : `<${id}>`;
    }

    getWindow() {
        const prefs = this.getPrefs();
        if (['pace', 'gap'].includes(prefs.type)) {
            return prefs.distance;
        } else {
            return prefs.time;
        }
    }

    async loadPeaks() {
        const prefs = this.getPrefs();
        const options = {
            limit: prefs.limit,
            activityType: prefs.activityType,
            expandActivities: true,
        };
        if (!prefs.includeAllDates) {
            options.start = +this.range.start;
            options.end = +this.range.end;
        }
        if (!prefs.includeAllAthletes) {
            this.peaks = await sauce.hist.getPeaksForAthlete(this.athlete.id, prefs.type,
                this.getWindow(), options);
        } else {
            this.peaks = await sauce.hist.getPeaksFor(prefs.type,
                this.getWindow(), options);
        }
        for (const x of this.peaks) {
            if (x.rankLevel) {
                x.rankBadge = sauce.power.rankBadge(x.rankLevel);
            }
        }
    }

    async onBeforeUpdateActivities({athlete, range}) {
        this.range = range;
        this.athlete = athlete;
        this.athleteNameCache.set(athlete.id, athlete.name);
        await this.render();
    }

    async onTypeChange(ev) {
        const type = ev.currentTarget.value;
        await this.savePrefs({type});
        await this.render();
    }

    async onTimeChange(ev) {
        const time = Number(ev.currentTarget.value);
        await this.savePrefs({time});
        await this.render();
    }

    async onDistanceChange(ev) {
        const distance = Number(ev.currentTarget.value);
        await this.savePrefs({distance});
        await this.render();
    }

    async onLimitChange(ev) {
        const limit = Number(ev.currentTarget.value);
        await this.savePrefs({limit});
        await this.render();
    }

    async onActivityTypeChange(ev) {
        const activityType = ev.currentTarget.value || null;
        await this.savePrefs({activityType});
        await this.render();
    }

    async onIncludeAllAthletesInput(ev) {
        const includeAllAthletes = ev.currentTarget.checked;
        await this.savePrefs({includeAllAthletes});
        await this.render();
    }

    async onIncludeAllDatesInput(ev) {
        const includeAllDates = ev.currentTarget.checked;
        await this.savePrefs({includeAllDates});
        await this.render();
    }

    async onResultClick(ev) {
        if (ev.target.closest('.results tr a, .results tr .btn')) {
            return;
        }
        const id = Number(ev.currentTarget.dataset.id);
        const activity = await sauce.hist.getActivity(id);
        this.pageView.trigger('select-activities', [activity]);
    }

    async onEditActivityClick(ev) {
        const id = Number(ev.currentTarget.closest('[data-id]').dataset.id);
        const activity = await sauce.hist.getActivity(id);
        views.editActivityDialogXXX(activity, this.pageView);
    }

    onResizePointerDown(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        const origHeight = this.$el.height();
        const origPageY = ev.pageY;
        this.$el.height(origHeight);
        this.$el.addClass('fixed-height');
        const onDragDone = () => {
            removeEventListener('pointermove', onDrag);
            removeEventListener('pointerup', onDragDone);
            removeEventListener('pointercancel', onDragDone);
        };
        const onDrag = ev => {
            this.$el.height(origHeight + (ev.pageY - origPageY));
        };
        addEventListener('pointermove', onDrag);
        addEventListener('pointerup', onDragDone);
        addEventListener('pointercancel', onDragDone);
        sauce.report.event('PerfPeaksTableView', 'resize');
    }
}


class PeaksMainView extends views.MainView {
    get tpl() {
        return 'performance/peaks/main.html';
    }

    async init({pageView}) {
        this.peaksTableView = new PeaksTableView({pageView});
        await super.init({pageView});
    }

    async render() {
        await super.render();
        this.peaksTableView.setElement(this.$('.peaks-view'));
        await this.peaksTableView.render();
    }
}


export default async function load({athletes, router, $page}) {
    self.pv = new views.PageView({athletes, router, MainView: PeaksMainView, el: $page});
    await self.pv.render();
}
