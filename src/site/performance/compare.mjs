/* global sauce, jQuery, Backbone */

import * as views from './views.mjs';
import RangeRouter from './router.mjs';

sauce.ns('performance.compare', async ns => {
    const DAY = 86400 * 1000;
    const urn = 'sauce/performance/compare';
    const L = sauce.locale;
    const H = L.human;
    const D = sauce.date;

    // Carefully optimized for low page load time...
    let enAthletes;
    const router = new RangeRouter(urn, 'Compare Activities | Sauce Performance');
    await Promise.all([
        L.init(),
        L.getMessagesObject(['performance', 'menu_performance_compare']).then(l =>
            router.pageTitle = `${l.menu_performance_compare} | Sauce ${l.performance}`),
        sauce.proxy.connected.then(() => Promise.all([
            sauce.storage.fastPrefsReady(),
            sauce.hist.getEnabledAthletes().then(x => void (enAthletes = x)),
        ])),
    ]);


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
            return 'performance/compare/main.html';
        }

        get localeKeys() {
            return ['weekly', 'monthly', 'yearly', 'activities', 'today'];
        }

        async init({pageView}) {
            this.pageView = pageView;
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
            // FIll out XXX
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
