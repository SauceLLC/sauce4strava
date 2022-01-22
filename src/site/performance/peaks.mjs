/* global sauce, jQuery, Backbone */

import * as views from './views.mjs';
import RangeRouter from './router.mjs';

sauce.ns('performance.peaks', async ns => {
    const DAY = 86400 * 1000;
    const urn = 'sauce/performance/peaks';
    const L = sauce.locale;
    const H = L.human;
    const D = sauce.date;

    // Carefully optimized for low page load time...
    let enAthletes;
    const router = new RangeRouter(urn, 'Sauce Performance');
    const peakRanges = {};
    await Promise.all([
        L.init(),
        L.getMessagesObject(['performance', 'menu_performance_peaks']).then(l =>
            router.pageTitle = `${l.menu_performance_peaks} | Sauce ${l.performance}`),
        sauce.proxy.connected.then(() => Promise.all([
            sauce.storage.fastPrefsReady(),
            sauce.peaks.getRanges('periods').then(x => void (peakRanges.periods = x)),
            sauce.peaks.getRanges('distances').then(x => void (peakRanges.distances = x)),
            sauce.hist.getEnabledAthletes().then(x => void (enAthletes = x)),
        ])),
    ]);


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


    class PeaksView extends views.PerfView {
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

        async init({pageView}) {
            this.pageView = pageView;
            this.range = pageView.getRangeSnapshot();
            this.athlete = pageView.athlete;
            this.athleteNameCache = new Map();
            this.prefs = {
                type: 'power',
                limit: 10,
                time: 300,
                distance: 10000,
                includeAllAthletes: false,
                includeAllDates: false,
                ...sauce.storage.getPrefFast('peaksView'),
            };
            this.listenTo(pageView, 'before-update-activities',
                sauce.asyncDebounced(this.onBeforeUpdateActivities));
            await super.init();
        }

        renderAttrs() {
            return {
                prefs: this.prefs,
                peaks: this.peaks,
                mile: 1609.344,
                unit: getPeaksUnit(this.prefs.type),
                valueFormatter: getPeaksValueFormatter(this.prefs.type),
                athleteName: this.athleteName.bind(this),
                peakRanges,
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

        async savePrefs(updates) {
            Object.assign(this.prefs, updates);
            await sauce.storage.setPref('peaksView', this.prefs);
            sauce.report.event('PerfPeaksView', 'save-pref',
                Object.entries(updates).map(([k, v]) => `${k}=${v}`));
        }

        getWindow() {
            if (['pace', 'gap'].includes(this.prefs.type)) {
                return this.prefs.distance;
            } else {
                return this.prefs.time;
            }
        }

        async loadPeaks() {
            const options = {
                limit: this.prefs.limit,
                activityType: this.prefs.activityType,
                expandActivities: true,
            };
            if (!this.prefs.includeAllDates) {
                options.start = +this.range.start;
                options.end = +this.range.end;
            }
            if (!this.prefs.includeAllAthletes) {
                this.peaks = await sauce.hist.getPeaksForAthlete(this.athlete.id, this.prefs.type,
                    this.getWindow(), options);
            } else {
                this.peaks = await sauce.hist.getPeaksFor(this.prefs.type,
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
            sauce.report.event('PerfPeaksView', 'resize');
        }
    }


    class MainView extends views.PerfView {
        get events() {
            return {
                ...super.events,
                'change header.filters select[name="range"]': 'onRangeChange',
                'click header.filters .btn.range': 'onRangeShiftClick',
                'click header.filters .btn.expand': 'onExpandClick',
                'click header.filters .btn.compress': 'onCompressClick',
            };
        }

        get tpl() {
            return 'performance/peaks/main.html';
        }

        get localeKeys() {
            return ['weekly', 'monthly', 'yearly', 'activities', 'today'];
        }

        async init({pageView}) {
            this.pageView = pageView;
            this.peaksView = new PeaksView({pageView});
            this.listenTo(pageView, 'before-update-activities', this.onBeforeUpdateActivities);
            this.listenTo(pageView, 'available-activities-changed', this.onAvailableChanged);
            await super.init();
        }

        setElement(el, ...args) {
            const r = super.setElement(el, ...args);
            const expanded = sauce.storage.getPrefFast('perfMainViewExpanded');
            this.toggleExpanded(!!expanded, {noSave: true, noAside: true});
            return r;
        }

        async toggleExpanded(expanded, options={}) {
            this.$el.toggleClass('expanded', expanded);
            this.$el.prev('nav').toggleClass('compressed', expanded);
            if (!options.noAside) {
                await this.pageView.detailsView.setExpanded(!expanded);
            }
            if (!options.noSave) {
                await sauce.storage.setPref('perfMainViewExpanded', expanded);
            }
        }

        renderAttrs() {
            const range = this.pageView.getRangeSnapshot();
            return {range: [range.period, range.metric].join()};
        }

        async render() {
            await super.render();
            this.peaksView.setElement(this.$('.peaks-view'));
            await this.peaksView.render();
        }

        async onExpandClick(ev) {
            await this.toggleExpanded(true);
        }

        async onCompressClick(ev) {
            await this.toggleExpanded(false);
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

        onAvailableChanged({oldest}) {
            this.updateRangeButtons(null, oldest);
        }

        onBeforeUpdateActivities({range}) {
            this.updateRangeButtons(range);
        }

        updateRangeButtons(range, oldest) {
            range = range || this.pageView.getRangeSnapshot();
            oldest = oldest || this.pageView.oldest;
            const localeMetricMap = {
                weeks: 'weekly',
                months: 'monthly',
                years: 'yearly',
            };
            this.$('.metric-display').text(this.LM(localeMetricMap[range.metric]));
            const $start = this.$('header .range.start');
            const $end = this.$('header .range.end');
            const selectedRange = this.pageView.allRange ? 'all' : `${range.period},${range.metric}`;
            let $option = this.$(`select[name="range"] option[value="${selectedRange}"]`);
            if (!$option.length) {
                // Just manually add an entry.  The user may be playing with the URL and that's fine.
                $option = jQuery(`<option value="${range.period},${range.metric}"]>` +
                    `${range.period} ${range.metric}</option>`);
                this.$(`select[name="range"]`).append($option);
            }
            $option[0].selected = true;
            $start.text(H.date(range.start));
            const isStart = range.start <= oldest;
            this.$('.btn.range.prev').toggleClass('disabled', isStart);
            this.$('.btn.range.oldest').toggleClass('disabled', isStart);
            const isEnd = range.end >= Date.now();
            this.$('.btn.range.next').toggleClass('disabled', isEnd);
            this.$('.btn.range.newest').toggleClass('disabled', isEnd);
            $end.text(isEnd ?
                new Intl.RelativeTimeFormat([], {numeric: 'auto'}).format(0, 'day') :
                H.date(D.roundToLocaleDayDate(range.end - DAY)));
        }
    }


    async function load() {
        const $page = jQuery(document.getElementById('error404'));
        $page.empty();
        $page.removeClass();  // removes all
        $page[0].id = 'sauce-performance';
        const isAvailable = !location.search.match(/onboarding/) && sauce.patronLevel >= 10;
        const athletes = new Map(isAvailable ? enAthletes.map(x => [x.id, x]) : []);
        if (!athletes.size) {
            const view = new views.OnboardingView({el: $page});
            await view.render();
        } else {
            self.pv = new views.PageView({athletes, router, MainView, el: $page});
            await self.pv.render();
        }
    }


    Backbone.history.start({pushState: true});

    if (['interactive', 'complete'].indexOf(document.readyState) === -1) {
        addEventListener('DOMContentLoaded', () => load().catch(sauce.report.error));
    } else {
        load().catch(sauce.report.error);
    }
});
