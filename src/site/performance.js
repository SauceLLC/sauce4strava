/* global sauce, jQuery, Chart, Backbone, currentAthlete */

sauce.ns('performance', async ns => {
    'use strict';

    const DAY = 86400 * 1000;
    const urn = 'sauce/performance';
    const chartTopPad = 15;
    const lastSyncMaxAge = 3600 * 1000;
    const L = sauce.locale;
    const H = L.human;
    const D = sauce.date;

    // Carefully optimized for low page load time...
    let pageTitle;
    let view;
    let currentUser;
    let enAthletes;
    let router;
    const peakRanges = {};
    await Promise.all([
        L.init(),
        L.getMessage('performance').then(x => pageTitle = `Sauce ${x}`),
        sauce.propDefined('Backbone', {once: true}).then(() =>
            sauce.getModule('/site/view').then(x => void (view = x))),
        sauce.proxy.connected.then(() => Promise.all([
            sauce.storage.fastPrefsReady(),
            sauce.storage.get('currentUser').then(x => void (currentUser = x)),
            sauce.peaks.getRanges('periods').then(x => void (peakRanges.periods = x)),
            sauce.peaks.getRanges('distances').then(x => void (peakRanges.distances = x)),
            sauce.hist.getEnabledAthletes().then(x => void (enAthletes = x)),
        ])),
    ]);

    router = new (Backbone.Router.extend({
        constructor: function() {
            this.filters = {};
            Backbone.Router.prototype.constructor.apply(this, arguments);
        },

        routes: {
            [`${urn}/:athleteId/:period/:metric/:endDay`]: 'onNav',
            [`${urn}/:athleteId/:period/:metric`]: 'onNav',
            [`${urn}/:athleteId/all`]: 'onNavAll',
            [`${urn}/:athleteId`]: 'onNav',
            [urn]: 'onNav',
        },

        onNavAll: function(athleteId) {
            return this.onNav(athleteId, null, null, null, true);
        },

        onNav: function(athleteId, period, metric, endDay, all) {
            const validMetric = D.CalendarRange.isValidMetric(metric);
            let suggestedEnd = validMetric && endDay ? new Date(D.addTZ(Number(endDay) * DAY)) : null;
            if (suggestedEnd && suggestedEnd >= Date.now()) {
                suggestedEnd = null;
            }
            this.filters = {
                athleteId: athleteId && Number(athleteId),
                period: validMetric && Number(period) ? Number(period) : null,
                metric: validMetric ? metric : null,
                suggestedEnd,
                all: validMetric && period ? false : all,
            };
        },

        setFilters: function(athlete, range, options={}) {
            const f = this.filters;
            f.athleteId = athlete ? athlete.id : null;
            if (range) {
                this.filters.period = range.period;
                this.filters.metric = range.metric;
                this.filters.suggestedEnd = range.end < Date.now() ? range.end : null;
            }
            if (options.all && f.athleteId != null) {
                this.navigate(`${urn}/${f.athleteId}/all`, options);
            } else if (f.suggestedEnd != null &&
                f.period != null &&
                f.metric != null &&
                f.athleteId != null) {
                const endDay = D.subtractTZ(f.suggestedEnd) / DAY;
                this.navigate(`${urn}/${f.athleteId}/${f.period}/${f.metric}/${endDay}`, options);
            } else if (f.period != null && f.metric != null && f.athleteId != null) {
                this.navigate(`${urn}/${f.athleteId}/${f.period}/${f.metric}`, options);
            } else if (f.athleteId != null) {
                this.navigate(`${urn}/${f.athleteId}`, options);
            } else {
                this.navigate(`${urn}`, options);
            }
            if (athlete) {
                const start = H.date(range.start);
                const end = H.date(D.roundToLocaleDayDate(range.end - DAY));
                document.title = `${athlete.name} | ${start} -> ${end} | ${pageTitle}`;
            } else {
                document.title = pageTitle;
            }
        }
    }))();


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


    class PerfView extends view.SauceView {
        get localeNS() {
            return 'performance';
        }
    }


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


    // XXX maybe Chart.helpers has something like this..
    function setDefault(obj, path, value) {
        path = path.split('.');
        let offt = obj;
        let m;
        const arrayPushMatch = /(.*?)\[\]/;
        const arrayIndexMatch = /(.*?)\[([0-9]+)\]/;
        for (const x of path.slice(0, -1)) {
            if ((m = x.match(arrayPushMatch))) {
                offt = offt[m[1]] || (offt[m[1]] = []);
                offt = offt.push({});
            } else if ((m = x.match(arrayIndexMatch))) {
                offt = offt[m[1]] || (offt[m[1]] = []);
                const i = Number(m[2]);
                offt = offt[i] || (offt[i] = {});
            } else {
                offt = offt[x] || (offt[x] = {});
            }
        }
        const edge = path[path.length - 1];
        if (offt[edge] !== undefined) {
            return;
        }
        if ((m = edge.match(arrayPushMatch))) {
            offt = offt[m[1]] || (offt[m[1]] = []);
            offt.push(value);
        } else if ((m = edge.match(arrayIndexMatch))) {
            offt = offt[m[1]] || (offt[m[1]] = []);
            offt[Number(m[2])] = value;
        } else {
            offt[edge] = value;
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


    function getPeaksRangeTypeForStream(streamType) {
        return ['gap', 'pace'].includes(streamType) ? 'distances' : 'periods';
    }


    function getPeaksKeyFormatter(streamType) {
        if (getPeaksRangeTypeForStream(streamType) === 'distances') {
            return H.raceDistance;
        } else {
            return H.duration;
        }
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


    async function editActivityDialogXXX(activity, pageView) {
        // XXX replace this trash with a view and module
        const tss = sauce.model.getActivityTSS(activity);
        const $modal = await sauce.ui.modal({
            title: 'Edit Activity', // XXX localize
            width: '28em',
            icon: await sauce.ui.getImage('fa/edit-duotone.svg'),
            body: `
                <b>${activity.name}</b><hr/>
                <label>TSS Override:
                    <input name="tss_override" type="number"
                           value="${activity.tssOverride != null ? activity.tssOverride : ''}"
                           placeholder="${tss != null ? Math.round(tss) : ''}"/>
                </label>
                <hr/>
                <label>Exclude this activity from peak performances:
                    <input name="peaks_exclude" type="checkbox"
                           ${activity.peaksExclude ? 'checked' : ''}/>
                </label>
            `,
            extraButtons: [{
                text: 'Save', // XXX localize
                click: async ev => {
                    const updates = {
                        tssOverride: Number($modal.find('input[name="tss_override"]').val()) || null,
                        peaksExclude: $modal.find('input[name="peaks_exclude"]').is(':checked'),
                    };
                    ev.currentTarget.disabled = true;
                    ev.currentTarget.classList.add('sauce-loading');
                    try {
                        await sauce.hist.updateActivity(activity.id, updates);
                        Object.assign(activity, updates);
                        await sauce.hist.invalidateActivitySyncState(activity.id, 'local', 'training-load',
                            {disableSync: true});
                        await sauce.hist.invalidateActivitySyncState(activity.id, 'local', 'peaks',
                            {wait: true});
                    } finally {
                        ev.currentTarget.classList.remove('sauce-loading');
                        ev.currentTarget.disabled = false;
                    }
                    $modal.dialog('destroy');
                    sauce.report.event('EditActivity', 'save', Object.keys(updates).join());
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
                    sauce.report.event('EditActivity', 'reimport');
                }
            }, {
                text: 'Delete', // XXX localize
                class: 'btn btn-secondary',
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
                    sauce.report.event('EditActivity', 'delete');
                }
            }]
        });
        return $modal;
    }


    function activitiesByDay(acts, start, end, atl=0, ctl=0) {
        // NOTE: Activities should be in chronological order
        if (!acts.length && !(start && end)) {
            return [];
        }
        const slots = [];
        start = start || acts[0].ts;
        // Acts starting at exactly midnight will be excluded by dayRange() without this..
        end = end || D.dayAfter(acts[acts.length - 1].ts);
        const startDay = D.toLocaleDayDate(start);
        let i = 0;
        for (const date of D.dayRange(startDay, new Date(end))) {
            let tss = 0;
            let duration = 0;
            let altGain = 0;
            let distance = 0;
            let kj = 0;
            const ts = date.getTime();
            const daily = [];
            if (i < acts.length - 1 && acts[i].ts < ts) {
                debugger;
                throw new Error('Internal Error');
            }
            while (i < acts.length && +D.toLocaleDayDate(acts[i].ts) === ts) {
                const a = acts[i++];
                daily.push(a);
                tss += sauce.model.getActivityTSS(a) || 0;
                duration += a.stats && a.stats.activeTime || 0;
                altGain += a.stats && a.stats.altitudeGain || 0;
                distance += a.stats && a.stats.distance || 0;
                kj += a.stats && a.stats.kj || 0;
            }
            atl = sauce.perf.calcATL([tss], atl);
            ctl = sauce.perf.calcCTL([tss], ctl);
            slots.push({
                date,
                days: 1,
                activities: daily,
                tss,
                duration,
                atl,
                ctl,
                altGain,
                distance,
                kj,
            });
        }
        // XXX remove this I think, it's okay if acts is a superset.
        if (i !== acts.length) {
            throw new Error('Internal Error');
        }
        return slots;
    }


    function aggregateActivitiesByFn(daily, indexFn, aggregateFn) {
        const metricData = [];
        function agg(entry) {
            entry.tss = entry.tssSum / entry.days;
            if (aggregateFn) {
                aggregateFn(entry);
            }
        }
        for (let i = 0; i < daily.length; i++) {
            const slot = daily[i];
            const index = indexFn(slot, i);
            if (!metricData[index]) {
                if (index) {
                    agg(metricData[index - 1]);
                }
                metricData[index] = {
                    date: slot.date,
                    tssSum: slot.tss,
                    duration: slot.duration,
                    altGain: slot.altGain,
                    distance: slot.distance,
                    kj: slot.kj,
                    days: 1,
                    activities: [...slot.activities],
                };
            } else {
                const entry = metricData[index];
                entry.tssSum += slot.tss;
                entry.duration += slot.duration;
                entry.altGain += slot.altGain;
                entry.distance += slot.distance;
                entry.kj += slot.kj;
                entry.days++;
                entry.activities.push(...slot.activities);
            }
        }
        if (metricData.length) {
            agg(metricData[metricData.length - 1]);
        }
        return metricData;
    }


    function aggregateActivitiesByWeek(daily, options={}) {
        let idx = null;
        return aggregateActivitiesByFn(daily, (x, i) => {
            if (options.isoWeekStart) {
                if (idx === null) {
                    idx = 0;
                } else if (x.date.getDay() === /*monday*/ 1) {
                    idx++;
                }
                return idx;
            } else {
                return Math.floor(i / 7);
            }
        });
    }


    function aggregateActivitiesByMonth(daily, options={}) {
        let idx = null;
        let curMonth;
        return aggregateActivitiesByFn(daily, x => {
            const m = x.date.getMonth();
            if (idx === null) {
                idx = 0;
            } else if (m !== curMonth) {
                idx++;
            }
            curMonth = m;
            return idx;
        });
    }


    function aggregateActivitiesByYear(daily, options={}) {
        let idx = null;
        let curYear;
        return aggregateActivitiesByFn(daily, x => {
            const y = x.date.getFullYear();
            if (idx === null) {
                idx = 0;
            } else if (y !== curYear) {
                idx++;
            }
            curYear = y;
            return idx;
        });
    }


    class ChartVisibilityPlugin {
        constructor(config, view) {
            const _this = this;
            setDefault(config, 'options.legend.onClick', function(...args) {
                _this.onLegendClick(this, ...args);
            });
            this.view = view;
        }

        onLegendClick(element, ev, item) {
            // WARNING: this code has been unused for a while.
            this.legendClicking = true;
            try {
                Chart.defaults.global.legend.onClick.call(element, ev, item);
            } finally {
                this.legendClicking = false;
            }
            const index = item.datasetIndex;
            this.view.toggleDataVisibility(element.chart.data.datasets[index].id);
        }

        beforeUpdate(chart) {
            // Skip setting the hidden state when the update is from the legend click.
            if (this.legendClicking) {
                return;
            }
            const displayStates = {};
            for (const ds of chart.data.datasets) {
                if (!ds.id) {
                    console.warn("Missing ID on dataset: visiblity state unmanaged");
                    continue;
                }
                ds.hidden = this.view.dataVisibility[ds.id] === false;
                displayStates[ds.yAxisID || 0] |= !ds.hidden;
            }
            for (const [id, display] of Object.entries(displayStates)) {
                if (typeof id === 'number') {
                    chart.options.scales.yAxes[id].display = display;
                } else {
                    for (const y of chart.options.scales.yAxes) {
                        if (y.id === id) {
                            y.display = !!display;
                            break;
                        }
                    }
                }
            }
        }
    }


    const betterTooltipPlugin = {
        beforeEvent: function(chart, event) {
            if (event.type !== 'mousemove' || chart.options.tooltips.intersect !== false) {
                return;
            }
            const box = chart.chartArea;
            if (event.x < box.left ||
                event.x > box.right ||
                event.y < box.top ||
                event.y > box.bottom) {
                return false;
            }
        }
    };


    const chartOverUnderFillPlugin = {
        _fillGradientSize: 100,

        _buildFillGradient: function(chart, startColor, endColor) {
            const size = this._fillGradientSize;
            const refCanvas = document.createElement('canvas');
            refCanvas.width = size;
            refCanvas.height = 2;
            const refContext = refCanvas.getContext('2d');
            const refGradient = refContext.createLinearGradient(0, 0, size, 0);
            refGradient.addColorStop(0, startColor);
            refGradient.addColorStop(1, endColor);
            refContext.fillStyle = refGradient;
            refContext.fillRect(0, 0, size, 2);
            return refContext;
        },

        _getFillGradientColor: function(ref, pct) {
            const size = this._fillGradientSize;
            pct = Math.max(0, Math.min(1, pct));
            const aPct = (Math.abs(ref.alphaMax - ref.alphaMin) * pct);
            const a = ref.alphaMax > ref.alphaMin ? aPct + ref.alphaMin : ref.alphaMin - aPct;
            const refOffset = Math.max(0, Math.min(size - 1, Math.round(pct * size)));
            const [r, g, b] = ref.gradient.getImageData(refOffset, 0, refOffset + 1, 1).data.slice(0, 3);
            return [r, g, b, a];
        },

        _safePct: function(pct) {
            // Return a value that won't blow up Canvas' addColorStop().
            return Math.min(1, Math.max(0, pct));
        },

        _getGradient: function(chart, ds, segment) {
            const scale = chart.scales[ds.yAxisID];
            const height = scale.maxHeight; // This is the canvas pixel value.
            if (height <= 0) {
                return;  // Ignore renders to nonvisible layouts (prob a transition)
            }
            const getStyle = x => segment.style[x] !== undefined ? segment.style[x] : ds[x];
            // We have to preserve the alpha components externally.
            const color = c => Chart.helpers.color(c);
            const overMax = color(getStyle('overBackgroundColorMax'));
            const overMin = color(getStyle('overBackgroundColorMin'));
            const underMin = color(getStyle('underBackgroundColorMin'));
            const underMax = color(getStyle('underBackgroundColorMax'));
            const overRef = {
                gradient: this._buildFillGradient(chart, overMin.rgbString(), overMax.rgbString()),
                alphaMin: overMin.alpha(),
                alphaMax: overMax.alpha(),
            };
            const underRef = {
                gradient: this._buildFillGradient(chart, underMin.rgbString(), underMax.rgbString()),
                alphaMin: underMin.alpha(),
                alphaMax: underMax.alpha(),
            };
            const zeroPct = this._safePct(scale.getPixelForValue(0) / height);
            const gFill = chart.ctx.createLinearGradient(0, 0, 0, height);
            const overMaxVal = getStyle('overBackgroundMax');
            const underMinVal = getStyle('underBackgroundMin');
            const max = overMaxVal != null ? overMaxVal : scale.max;
            const min = underMinVal != null ? underMinVal : scale.min;
            const midPointMarginPct = 0.001;
            if (scale.max > 0) {
                const overMaxColor = this._getFillGradientColor(overRef, scale.max / max);
                const overMinColor = this._getFillGradientColor(overRef, scale.min / max);
                const topPct = this._safePct(scale.getPixelForValue(max) / height);
                gFill.addColorStop(topPct, `rgba(${overMaxColor.join()}`);
                gFill.addColorStop(this._safePct(zeroPct - midPointMarginPct),
                    `rgba(${overMinColor.join()}`);
                gFill.addColorStop(zeroPct, `rgba(${overMinColor.slice(0, 3).join()}, 0)`);
            }
            if (scale.min < 0) {
                const underMinColor = this._getFillGradientColor(underRef, scale.max / min);
                const underMaxColor = this._getFillGradientColor(underRef, scale.min / min);
                const bottomPct = this._safePct(scale.getPixelForValue(min) / height);
                gFill.addColorStop(zeroPct, `rgba(${underMinColor.slice(0, 3).join()}, 0`);
                gFill.addColorStop(this._safePct(zeroPct + midPointMarginPct),
                    `rgba(${underMinColor.join()}`);
                gFill.addColorStop(bottomPct, `rgba(${underMaxColor.join()}`);
            }
            return gFill;
        },

        afterDatasetsUpdate: function(chart, options) {
            const metas = chart._getSortedVisibleDatasetMetas();
            for (const {dataset: element} of metas) {
                if (!element || !(element instanceof Chart.elements.Line)) {
                    continue;
                }
                const ds = chart.data.datasets[element._datasetIndex];
                if (!ds.overUnder) {
                    continue;
                }
                for (const segment of element.getSegments()) {
                    try {
                        segment.style.backgroundColor = this._getGradient(chart, ds, segment);
                    } catch(e) {/*no-pragma*/}
                }
            }
        },

    };


    const lineDrawSave = Chart.controllers.line.prototype.draw;
    Chart.controllers.line.prototype.draw = function(ease) {
        lineDrawSave.apply(this, arguments);
        if (!this.chart.options.tooltipLine) {
            return;
        }
        // TODO: support always show option.
        let active = this.chart.tooltip._active;
        if (!active && this.chart.options.tooltips.defaultIndex) {
            const idx = this.chart.options.tooltips.defaultIndex(this.chart);
            const metaData = this.chart.getDatasetMeta(0).data;
            if (idx != null && idx >= 0 && metaData && metaData[idx]) {
                active = [metaData[idx]];
            }
        }
        if (active && active.length) {
            const activePoint = active[0];
            const ctx = this.chart.ctx;
            const x = activePoint.tooltipPosition().x;
            const top = this.chart.chartArea.top - chartTopPad;
            const bottom = this.chart.chartArea.bottom;
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(x, top);
            ctx.lineTo(x, bottom);
            ctx.lineWidth = 1;
            ctx.strokeStyle = this.chart.options.tooltipLineColor || '#777';
            ctx.stroke();
            ctx.restore();
        }
    };


    class SauceChart extends Chart {
        constructor(ctx, view, config) {
            super(ctx, config);
            this.view = view;
        }

        destroy(...args) {
            super.destroy(...args);
            delete this.view;
        }

        getElementsAtEventForMode(ev, mode, options) {
            if (ev.chart && ev.chart.chartArea) {
                const box = ev.chart.chartArea;
                if (!box ||
                    ev.x < box.left ||
                    ev.x > box.right ||
                    ev.y < box.top ||
                    ev.y > box.bottom) {
                    return [];
                }
            }
            return super.getElementsAtEventForMode(ev, mode, options);
        }

        getBucketsAtIndexes(...tuples) {
            const datasets = this.data.datasets;
            if (!datasets || !datasets.length) {
                return [];
            }
            const buckets = new Set();
            for (const [dsIndex, index] of tuples) {
                const ds = datasets[dsIndex];
                if (ds && ds.data && ds.data[index]) {
                    if (ds.data[index].b == null) {
                        throw new Error("Missing bucket entry in dataset");
                    }
                    buckets.add(ds.data[index].b);
                }
            }
            return Array.from(buckets);
        }

        getActivitiesAtIndexes(...tuples) {
            const acts = new Set();
            for (const bucket of this.getBucketsAtIndexes(...tuples)) {
                for (const x of bucket.activities || []) {
                    acts.add(x);
                }
            }
            return Array.from(acts);
        }
    }


    class ActivityTimeRangeChart extends SauceChart {
        constructor(ctx, view, config) {
            let _this;
            config = config || {};
            setDefault(config, 'type', 'line');
            setDefault(config, 'plugins[]', new ChartVisibilityPlugin(config, view));
            setDefault(config, 'plugins[]', betterTooltipPlugin);
            setDefault(config, 'options.maintainAspectRatio', false);
            setDefault(config, 'options.elements.point.pointStyle', false);
            setDefault(config, 'options.layout.padding.top', chartTopPad);
            setDefault(config, 'options.tooltipLine', true);
            setDefault(config, 'options.tooltipLineColor', '#07c');
            setDefault(config, 'options.animation.duration', 200);
            setDefault(config, 'options.legend.display', false);
            setDefault(config, 'options.legend.position', 'bottom');
            setDefault(config, 'options.legend.labels.padding', 20);
            setDefault(config, 'options.legend.labels.usePointStyle', true);
            setDefault(config, 'options.scales.xAxes[0].id', 'days');
            setDefault(config, 'options.scales.xAxes[0].offset', true);
            setDefault(config, 'options.scales.xAxes[0].type', 'time');
            setDefault(config, 'options.scales.xAxes[0].distribution', 'series');
            setDefault(config, 'options.scales.xAxes[0].gridLines.display', true);
            setDefault(config, 'options.scales.xAxes[0].gridLines.drawOnChartArea', false);
            setDefault(config, 'options.scales.xAxes[0].afterUpdate', scale =>
                _this && _this.onAfterUpdateScale(scale));
            setDefault(config, 'options.scales.xAxes[0].afterBuildTicks', (axis, ticks) =>
                _this && _this.onAfterBuildTicks(axis, ticks));
            setDefault(config, 'options.scales.xAxes[0].ticks.sampleSize', 50);
            setDefault(config, 'options.scales.xAxes[0].ticks.padding', 4);
            setDefault(config, 'options.scales.xAxes[0].ticks.minRotation', 30);
            setDefault(config, 'options.scales.xAxes[0].ticks.maxRotation', 50);
            setDefault(config, 'options.scales.xAxes[0].ticks.autoSkipPadding', 20);
            setDefault(config, 'options.scales.xAxes[0].ticks.callback', (_, index, ticks) =>
                _this && _this.formatTickLabel(index, ticks));
            setDefault(config, 'options.scales.xAxes[0].ticks.major.enabled', true);
            setDefault(config, 'options.scales.xAxes[0].ticks.major.fontStyle', 'bold');
            setDefault(config, 'options.scales.xAxes[0].ticks.major.fontSize', 11);
            setDefault(config, 'options.scales.xAxes[0].ticks.minor.fontSize', 10);
            setDefault(config, 'options.scales.yAxes[0].type', 'linear');
            setDefault(config, 'options.scales.yAxes[0].scaleLabel.display', true);
            setDefault(config, 'options.scales.yAxes[0].ticks.min', 0);
            setDefault(config, 'options.tooltips.mode', 'index');
            setDefault(config, 'options.tooltips.enabled', false);  // Use custom html.
            setDefault(config, 'options.tooltips.activitiesFormatter', (...args) =>
                _this.activitiesTooltipFormatter(...args));
            setDefault(config, 'options.tooltips.custom', sauce.debounced(requestAnimationFrame, tt =>
                tt.dataPoints && tt.dataPoints.length &&
                _this.updateTooltips(...tt.dataPoints.map(x => [x.datasetIndex, x.index]))));
            setDefault(config, 'options.plugins.zoom.enabled', true);
            setDefault(config, 'options.plugins.zoom.callbacks.beforeZoom', (...args) =>
                _this.onBeforeZoom(...args));
            super(ctx, view, config);
            _this = this;
        }

        activitiesTooltipFormatter(acts) {
            if (acts.length === 1) {
                return acts[0].name;
            } else if (acts.length > 1) {
                return `<i>${acts.length} ${this.view.LM('activities')}</i>`;
            } else {
                return '-';
            }
        }

        update(...args) {
            super.update(...args);
            const idx = this.options.tooltips.defaultIndex ? this.options.tooltips.defaultIndex(this) : -1;
            if (this.data.datasets && this.data.datasets.length) {
                const tuples = Array.from(sauce.data.range(this.data.datasets.length)).map(i => [i, idx]);
                this.updateTooltips(...tuples);
            }
        }

        updateTooltips(...highlightedTuples) {
            const labels = [];
            const elements = [];
            let startDate = Infinity;
            let mostDays = -Infinity;
            const adjHiTuples = highlightedTuples.map(([dsIdx, i]) => {
                const ds = this.data.datasets[dsIdx];
                i = i >= 0 ? i : ds.data && ds.data.length && ds.data.length + i;
                return [ds, i];
            }).filter(([ds, i]) => ds && ds.data && ds.label && typeof i === 'number' && i >= 0);
            // Interrogate valid highlighted datasets first...
            for (let [ds, idx] of adjHiTuples) {
                const data = ds.data[idx];
                if (!data) {
                    continue;
                }
                startDate = data.b.date < startDate ? data.b.date : startDate;
                mostDays = data.b.days > mostDays ? data.b.days : mostDays;
            }
            const endDate = D.adjacentDay(startDate, mostDays);
            // Gather stats from all datasets (vis and hidden) in the range detected from visible...
            for (const ds of this.data.datasets) {
                if (!ds || !ds.data || !ds.label) {
                    continue;
                }
                const inRangeIndexes = ds.data
                    .map((x, i) => x.b.date >= startDate && x.b.date < endDate ? i : -1)
                    .filter(x => x !== -1);
                for (const i of inRangeIndexes) {
                    const data = ds.data[i];
                    const raw = data.y;
                    const value = ds.tooltipFormat ? ds.tooltipFormat(raw, i, ds) : raw;
                    const values = Array.isArray(value) ? value : [value];
                    if (!ds.hidden) {
                        for (const x of Object.values(ds._meta)) {
                            elements.push(x.data[i]);
                        }
                    }
                    labels.push(`
                        <div class="data-label ${ds.hidden ? "ds-hidden" : ''}" data-ds="${ds.id}"
                             style="--border-color: ${ds.borderColor};
                                    --bg-color: ${ds.backgroundColor};">
                            <key>${ds.label}${ds.hidden ? '' : ':'}</key>
                            ${ds.hidden ? '' : values.map(x => `<value>${x}</value>`).join('')}
                        </div>
                    `);
                }
            }

            let desc = '';
            if (this.options.tooltips.bucketsFormatter) {
                const buckets = this.getBucketsAtIndexes(...highlightedTuples);
                if (buckets.length) {
                    desc = this.options.tooltips.bucketsFormatter(buckets);
                }
            } else if (this.options.tooltips.activitiesFormatter) {
                const acts = this.getActivitiesAtIndexes(...highlightedTuples);
                if (acts.length) {
                    desc = this.options.tooltips.activitiesFormatter(acts);
                }
            }
            let title = '';
            if (mostDays === 1) {
                title = H.date(startDate, {style: 'weekdayYear'});
            } else if (startDate !== Infinity) {
                if (sauce.date.isMonthRange(startDate, endDate)) {
                    title = H.date(startDate, {style: 'monthYear'});
                } else if (sauce.date.isYearRange(startDate, endDate)) {
                    title = H.date(startDate, {style: 'year'});
                } else {
                    const from = H.date(startDate, {style: 'weekday'});
                    const to = H.date(D.adjacentDay(startDate, mostDays - 1), {style: 'weekdayYear'});
                    title = `${from} -> ${to}`;
                }
            }
            const caretX = sauce.data.avg(elements.map(x => x.getCenterPoint().x));
            const $tooltipEl = jQuery(this.canvas).closest('.sauce-panel').find('.chart-tooltip');
            $tooltipEl[0].classList.toggle('inactive', caretX == null);
            $tooltipEl[0].style.setProperty('--caret-left', `${caretX || 0}px`);
            $tooltipEl.html(`
                <div class="tt-labels axis">${labels.join('')}</div>
                <div class="tt-horiz axis">
                    <div class="tt-title">${title}</div>
                    <div class="tt-desc">${desc}</div>
                </div>
            `);
        }

        formatTickLabel(index, ticks) {
            const days = (ticks[ticks.length - 1].value - ticks[0].value) / DAY;
            const data = ticks[index];
            const d = new Date(data.value);
            if (days < 370) {
                if (data.showToday) {
                    return this.view.LM('today'); // XXX
                } else if (data.showYear) {
                    return [H.date(d, {style: 'month'}) + ' ', d.getFullYear()];
                } else if (data.showMonth) {
                    return H.date(d, {style: 'monthDay'});
                } else {
                    return H.date(d, {style: 'shortDay'});
                }
            } else {
                if (data.showToday) {
                    return this.view.LM('today');
                } else if (data.showYear) {
                    return [H.date(d, {style: 'month'}) + ' ', d.getFullYear()];
                } else {
                    return H.date(d, {style: 'month'});
                }
            }
        }

        onAfterBuildTicks(scale, ticks) {
            // This is used for doing fit calculations.  We don't actually use the label
            // value as it will get filtered down after layout determines which ticks will
            // fit and what step size to use.  However it's important to use the same basic
            // formatting so the size constraints are correct.
            if (!ticks) {
                return;
            }
            this._updateTicksConfig(ticks, scale);
            for (const x of ticks) {
                x.major = true;  // Use bold font for all sizing calcs, then correct with afterUpdate.
            }
            return ticks;
        }

        _updateTicksConfig(ticks, scale) {
            let lastMonth;
            let lastYear;
            const spans = (ticks[ticks.length - 1].value - ticks[0].value) / DAY;
            const today = D.today();
            let needTodayMark = scale.max > today;
            for (let i = 0; i < ticks.length; i++) {
                let tick = ticks[i];
                if (needTodayMark && (tick.value >= today || i === ticks.length - 1)) {
                    needTodayMark = false;
                    if (tick.value !== +today) {
                        // We have to hijack this or the previous tick.  Whichever is closest.
                        if (i && +today - ticks[i - 1].value < tick.value - +today) {
                            tick = ticks[--i];
                        }
                        tick.value = +today;
                    }
                    Object.assign(tick, {showToday: true, major: true});
                    tick.label = this.formatTickLabel(i, ticks);
                    continue;
                }
                const d = new Date(tick.value);
                const m = d.getMonth();
                const y = d.getFullYear();
                const showMonth = lastMonth != null && lastMonth != m;
                const showYear = lastYear != null && lastYear != y;
                lastMonth = m;
                lastYear = y;
                Object.assign(tick, {
                    showMonth,
                    showYear,
                    major: spans < 370 ? showMonth || showYear : showYear,
                });
                tick.label = this.formatTickLabel(i, ticks);
            }
            return ticks;
        }

        onAfterUpdateScale(scale) {
            // This runs after all the scale/ticks work is done.  We need to finally
            // patch up the final set of ticks with our desired label and major/minor
            // state.  Major == bold.
            if (scale._ticksToDraw.length) {
                this._updateTicksConfig(scale._ticksToDraw, scale);
            }
        }

        onBeforeZoom(start, end) {
            // Pad out the zoom to be inclusive of nearest metric unit.
            const data = this.data.datasets[0].data;
            let first = data.findIndex(x => x.b.date >= start);
            let last = data.findIndex(x => x.b.date > end);
            if (first === -1) {
                return;
            }
            first = first > 0 ? first - 1 : first;
            last = last > 0 ? last : data.length - 1;
            return [data[first].b.date, data[last].b.date];
        }
    }


    class ChartView extends PerfView {
        get events() {
            return {
                ...super.events,
                'click canvas': 'onChartClick',
            };
        }

        async init({pageView, id, ChartClass=SauceChart}) {
            if (!pageView || !id || !ChartClass) {
                throw new TypeError('missing args');
            }
            this.pageView = pageView;
            this.id = id;
            this._ChartClass = ChartClass;
            await super.init();
            this.listenTo(pageView, 'update-activities', this.onUpdateActivities);
        }

        setChartConfig(config) {
            this._chartConfig = config;
        }

        async render() {
            if (this.chart) {
                this.chart.destroy();
                delete this.chart.view;
                delete this.chart;
            }
            await super.render();
            if (this._chartConfig) {
                const ctx = this.$('canvas')[0].getContext('2d');
                this.chart = new this._ChartClass(ctx, this, this._chartConfig);
            }
        }

        async onChartClick(ev) {
            const box = this.chart.chartArea;
            if (!box ||
                ev.offsetX < box.left ||
                ev.offsetX > box.right ||
                ev.offsetY < box.top ||
                ev.offsetY > box.bottom) {
                return;
            }
            const {intersect, axis, mode = 'nearest'} = this.chart.options.tooltips;
            const elements = this.chart.getElementsAtEventForMode(ev, mode, {intersect, axis});
            if (elements.length) {
                const acts = this.chart.getActivitiesAtIndexes(...elements.map(x => [x._datasetIndex, x._index]));
                if (acts.length) {
                    this.pageView.trigger('select-activities', acts);
                }
            }
        }

        onUpdateActivities() { }
    }


    class ActiveDaysChartView extends ChartView {
        get localeKeys() {
            return ['inactive', '/time_weeks'];
        }

        async init(options) {
            const ttData = (item, obj) => obj.datasets[item.datasetIndex].data[item.index];
            await super.init({...options, id: 'active-days'});
            this.setChartConfig({
                type: 'bar',
                options: {
                    aspectRatio: 50 / 8,
                    maintainAspectRatio: true,
                    tooltips: {
                        intersect: false,
                        eventingAxis: 'y',
                        caretPadding: 16,
                        position: 'average',
                        callbacks: {
                            title: (items, obj) => items.map(x => H.date(ttData(x, obj).date, {style: 'weekdayYear'})),
                            label: (item, obj, _t) =>
                                (_t = ttData(item, obj), _t.active ? ` TSS: ${H.number(_t.tss)}` : this.LM('inactive')),
                            afterBody: ([item], obj, _t) => (_t = ttData(item, obj), _t.active ? '\n' + _t.actNames : ''),
                        },
                    },
                    animation: {
                        duration: 0
                    },
                    layout: {
                        padding: {
                            top: chartTopPad
                        }
                    },
                    legend: {
                        display: false,
                    },
                    elements: {
                        rectangle: {
                            borderWidth: 1,
                            borderColor: '#0003',
                            backgroundColor: ctx => ctx.dataset.data[ctx.dataIndex].bg,
                            borderSkipped: false,
                        }
                    },
                    scales: {
                        yAxes: [{
                            id: 'days',
                            type: 'linear',
                            position: 'right',
                            stacked: true,
                            barStackPadding: 2,
                            ticks: {display: false},
                            gridLines: {display: false},
                        }],
                        xAxes: [{
                            id: 'weeks',
                            type: 'time',
                            distribution: 'series',
                            position: 'bottom',
                            offset: true,
                            time: {unit: 'week'},
                            ticks: {display: false},
                            gridLines: {display: false}
                        }]
                    }
                }
            });
        }

        onUpdateActivities({daily, range}) {
            const weekDatasets = Array.from(sauce.data.range(7)).map(() => ({
                stack: 'days',
                barPercentage: 1,
                categoryPad: 2,
                data: []
            }));
            const maxTSS = sauce.data.max(daily.map(x => x.tss));
            // When the metric is months or less than weeks we need to pad it out.
            const firstMonday = -D.getISODay(range.start);
            const lastSunday = range.days + (6 - D.getISODay(D.dayBefore(range.end)));
            let offt = 0;
            for (let i = firstMonday; i < lastSunday; i++, offt++) {
                const day = daily[i] || {
                    days: 1,
                    activities: [],
                    date: D.adjacentDay(range.start, i),
                    tss: -10,
                };
                weekDatasets[6 - (offt % 7)].data.push({
                    b: day,
                    x: D.adjacentDay(day.date, -(offt % 7)),
                    y: 1,
                    bg: `rgba(10, 44, 122, ${(10 + day.tss) / maxTSS})`,
                    active: day.activities && day.activities.length,
                    date: day.date,
                    tss: day.tss,
                    actNames: day.activities ? day.activities.map(x => x.name).join('\n') : null,
                });
            }
            this.chart.data.datasets = weekDatasets;
            this.chart.update();
        }
    }


    class ActivityTimeRangeChartView extends ChartView {
        get events() {
            return {
                ...super.events,
                'click .chart-tooltip .data-label': 'onDataLabelClick',
            };
        }

        async init(options) {
            await super.init({ChartClass: ActivityTimeRangeChart, ...options});
            this._dataVisibilityKey = `perfChartDataVisibility-${this.id}`;
            this.dataVisibility = sauce.storage.getPrefFast(this._dataVisibilityKey) || {};
        }

        onDataLabelClick(ev) {
            const dataId = ev.currentTarget.dataset.ds;
            if (!dataId) {
                console.warn("No ID for dataset");
                return;
            }
            this.toggleDataVisibility(dataId);
        }

        toggleDataVisibility(dataId) {
            const index = this.chart.data.datasets.findIndex(x => x.id === dataId);
            this.dataVisibility[dataId] = !this.chart.isDatasetVisible(index);
            sauce.storage.setPref(this._dataVisibilityKey, this.dataVisibility);  // bg okay
            this.chart.update();
        }
    }


    class TrainingChartView extends ActivityTimeRangeChartView {
        get localeKeys() {
            return [
                'activities', 'predicted_tss', 'predicted_tss_tooltip', 'fitness',
                'fatigue', 'form', 'today',
            ];
        }

        async init(options) {
            await super.init({...options, id: 'training'});
            this.setChartConfig({
                plugins: [chartOverUnderFillPlugin],
                options: {
                    plugins: {
                        datalabels: {
                            display: ctx =>
                                !!(ctx.dataset.data[ctx.dataIndex] &&
                                ctx.dataset.data[ctx.dataIndex].showDataLabel === true),
                            formatter: (value, ctx) => {
                                const r = ctx.dataset.tooltipFormat(value.y);
                                return Array.isArray(r) ? r[0] : r;
                            },
                            backgroundColor: ctx => ctx.dataset.backgroundColor,
                            borderRadius: 2,
                            color: 'white',
                            padding: 4,
                            anchor: 'center',
                        },
                    },
                    scales: {
                        yAxes: [{
                            id: 'tss',
                            scaleLabel: {labelString: 'TSS'},
                            ticks: {min: 0, maxTicksLimit: 6},
                        }, {
                            id: 'tsb',
                            scaleLabel: {labelString: 'TSB', display: true},
                            ticks: {maxTicksLimit: 8},
                            position: 'right',
                            gridLines: {display: false},
                        }]
                    },
                    tooltips: {
                        intersect: false,
                        bucketsFormatter: this.bucketsTooltipFormatter.bind(this),
                        defaultIndex: chart => {
                            if (chart.data.datasets && chart.data.datasets.length) {
                                const data = chart.data.datasets[0].data;
                                if (data && data.length) {
                                    const today = D.today();
                                    for (let i = data.length - 1; i; i--) {
                                        if (data[i].x <= today) {
                                            return i;
                                        }
                                    }
                                }
                            }
                            return -1;
                        }
                    },
                }
            });
        }

        bucketsTooltipFormatter(buckets) {
            const day = buckets[0];
            let desc;
            if (day.future) {
                desc = `<i title="${this.LM('predicted_tss_tooltip')}">` +
                    `${this.LM('predicted_tss')}</i>`;
            } else if (day.activities.length > 1) {
                desc = `<i>${day.activities.length} ${this.LM('activities')}</i>`;
            } else if (day.activities.length === 1) {
                desc = day.activities[0].name;
            }
            return `${desc ? desc + ' ' : ''}(${day.future ? '~' : ''}${H.number(day.tss)} TSS)`;
        }

        onUpdateActivities({range, daily, metricData}) {
            const lineWidth = range.days > 366 ? 0.66 : range.days > 60 ? 1 : 1.25;
            const maxCTLIndex = sauce.data.max(daily.map(x => x.ctl), {index: true});
            const minTSBIndex = sauce.data.min(daily.map(x => x.ctl - x.atl), {index: true});
            let future = [];
            if (range.end >= Date.now() && daily.length) {
                const last = daily[daily.length - 1];
                const fDays = Math.floor(Math.min(range.days * 0.10, 62));
                const fStart = D.dayAfter(last.date);
                const fEnd = D.roundToLocaleDayDate(+fStart + fDays * DAY);
                const predictions = [];
                const tau = 1;
                const decay = 2;
                const tssSlope = (((last.atl / last.ctl) || 1) - 1) / tau;
                let tssPred = last.ctl;
                for (const [i, date] of Array.from(D.dayRange(fStart, fEnd)).entries()) {
                    tssPred *= 1 + (tssSlope * (1 / (i * decay + 1)));
                    predictions.push({ts: +date, tssOverride: tssPred});
                }
                future = activitiesByDay(predictions, fStart, fEnd, last.atl, last.ctl);
            }
            const buckets = daily.concat(future.map(x => (x.future = true, x)));
            const ifFuture = (yes, no) => ctx => buckets[ctx.p1DataIndex].future ? yes : no;
            this.chart.data.datasets = [{
                id: 'ctl',
                label: `CTL (${this.LM('fitness')})`,
                yAxisID: 'tss',
                borderWidth: lineWidth,
                backgroundColor: '#4c89d0e0',
                borderColor: '#2c69b0f0',
                pointStyle: ctx => ctx.dataIndex === maxCTLIndex ? 'circle' : false,
                pointRadius: ctx => ctx.dataIndex === maxCTLIndex ? 2 : 0,
                tooltipFormat: x => Math.round(x).toLocaleString(),
                segment: {
                    borderColor: ifFuture('4c89d0d0'),
                    borderDash: ifFuture([3, 3], []),
                },
                data: buckets.map((b, i) => ({
                    b,
                    x: b.date,
                    y: b.ctl,
                    showDataLabel: i === maxCTLIndex,
                })),
            }, {
                id: 'atl',
                label: `ATL (${this.LM('fatigue')})`,
                yAxisID: 'tss',
                borderWidth: lineWidth,
                backgroundColor: '#ff3730e0',
                borderColor: '#f02720f0',
                tooltipFormat: x => Math.round(x).toLocaleString(),
                segment: {
                    borderColor: ifFuture('#ff4740d0'),
                    borderDash: ifFuture([3, 3]),
                },
                data: buckets.map(b => ({
                    b,
                    x: b.date,
                    y: b.atl,
                }))
            }, {
                id: 'tsb',
                label: `TSB (${this.LM('form')})`,
                yAxisID: 'tsb',
                borderWidth: lineWidth,
                backgroundColor: '#bc714cc0',
                borderColor: '#0008',
                fill: true,
                overUnder: true,
                overBackgroundColorMax: '#7fe78a',
                overBackgroundColorMin: '#bfe58a22',
                underBackgroundColorMin: '#d9940422',
                underBackgroundColorMax: '#bc0000',
                overBackgroundMax: 50,
                underBackgroundMin: -50,
                pointStyle: ctx => ctx.dataIndex === minTSBIndex ? 'circle' : false,
                pointRadius: ctx => ctx.dataIndex === minTSBIndex ? 2 : 0,
                tooltipFormat: x => Math.round(x).toLocaleString(),
                segment: {
                    borderColor: ifFuture('#000a'),
                    borderDash: ifFuture([3, 3]),
                    overBackgroundColorMax: ifFuture('#afba'),
                    overBackgroundColorMin: ifFuture('#df82'),
                    underBackgroundColorMin: ifFuture('#f922'),
                    underBackgroundColorMax: ifFuture('#d22b'),
                },
                data: buckets.map((b, i) => ({
                    b,
                    x: b.date,
                    y: b.ctl - b.atl,
                    showDataLabel: i === minTSBIndex,
                }))
            }];
            this.chart.update();
        }
    }


    class ActivityVolumeChartView extends ActivityTimeRangeChartView {
        get localeKeys() {
            return ['predicted', '/analysis_time', '/analysis_distance', 'activities'];
        }

        async init(options) {
            await super.init({...options, id: 'activity-volume'});
            const distStepSize = L.distanceFormatter.unitSystem === 'imperial' ? 1609.344 * 10 : 10000;
            this.setChartConfig({
                type: 'bar',
                options: {
                    scales: {
                        xAxes: [{
                            stacked: true,
                        }],
                        yAxes: [{
                            id: 'tss',
                            scaleLabel: {labelString: 'TSS'},
                            ticks: {min: 0, maxTicksLimit: 6},
                        }, {
                            id: 'duration',
                            position: 'right',
                            gridLines: {display: false},
                            ticks: {
                                min: 0,
                                suggestedMax: 5 * 3600,
                                stepSize: 3600,
                                maxTicksLimit: 7,
                                callback: v => H.duration(v, {maxPeriod: 3600, minPeriod: 3600}),
                            }
                        }, {
                            id: 'distance',
                            position: 'right',
                            gridLines: {display: false},
                            ticks: {
                                min: 0,
                                stepSize: distStepSize,
                                maxTicksLimit: 7,
                                callback: v => H.distance(v, 0, {suffix: true}),
                            },
                        }]
                    },
                }
            });
        }

        onUpdateActivities({range, daily, metricData}) {
            let predictions;
            if (D.tomorrow() <= range.end && metricData.length) {
                const remaining = (range.end - Date.now()) / DAY;
                const days = Math.round((range.end - metricData[metricData.length - 1].date) / DAY);
                const weighting = Math.min(days, daily.length);
                const avgTSS = sauce.perf.expWeightedAvg(weighting, daily.map(x => x.tss));
                const avgDuration = sauce.perf.expWeightedAvg(weighting, daily.map(x => x.duration));
                const avgDistance = sauce.perf.expWeightedAvg(weighting, daily.map(x => x.distance));
                predictions = {
                    days,
                    tss: metricData.map((b, i) => ({
                        b,
                        x: b.date,
                        y: i === metricData.length - 1 ? avgTSS * remaining : null,
                    })),
                    duration: metricData.map((b, i) => ({
                        b,
                        x: b.date,
                        y: i === metricData.length - 1 ? avgDuration * remaining : null,
                    })),
                    distance: metricData.map((b, i) => ({
                        b,
                        x: b.date,
                        y: i === metricData.length - 1 ? avgDistance * remaining : null,
                    })),
                };
            }
            const commonOptions = {
                borderWidth: 1
            };
            this.chart.data.datasets = [{
                id: 'tss',
                label: 'TSS',
                backgroundColor: '#1d86cdd0',
                borderColor: '#0d76bdf0',
                hoverBackgroundColor: '#0d76bd',
                hoverBorderColor: '#0d76bd',
                yAxisID: 'tss',
                stack: 'tss',
                tooltipFormat: (x, i) => {
                    const tss = Math.round(x).toLocaleString();
                    const tssDay = Math.round(x / metricData[i].days).toLocaleString();
                    const tips = [`${tss} <small>(${tssDay}/d)</small>`];
                    if (predictions && i === metricData.length - 1) {
                        const ptssRaw = predictions.tss[i].y + x;
                        const ptss = Math.round(ptssRaw).toLocaleString();
                        const ptssDay = Math.round(ptssRaw / predictions.days).toLocaleString();
                        tips.push(`${this.LM('predicted')}: <b>~${ptss} <small>(${ptssDay}/d)</small></b>`);
                    }
                    return tips;
                },
                data: metricData.map((b, i) => ({b, x: b.date, y: b.tssSum})),
            }, {
                id: 'duration',
                label: this.LM('analysis_time'),
                backgroundColor: '#fc7d0bd0',
                borderColor: '#dc5d00f0',
                hoverBackgroundColor: '#ec6d00',
                hoverBorderColor: '#dc5d00',
                yAxisID: 'duration',
                stack: 'duration',
                tooltipFormat: (x, i) => {
                    const tips = [H.duration(x, {maxPeriod: 3600, minPeriod: 3600, digits: 1})];
                    if (predictions && i === metricData.length - 1) {
                        const pdur = H.duration(predictions.duration[i].y + x,
                            {maxPeriod: 3600, minPeriod: 3600, digits: 1});
                        tips.push(`${this.LM('predicted')}: <b>~${pdur}</b>`);
                    }
                    return tips;
                },
                data: metricData.map((b, i) => ({b, x: b.date, y: b.duration})),
            }, {
                id: 'distance',
                label: this.LM('analysis_distance'),
                backgroundColor: '#244d',
                borderColor: '#022f',
                hoverBackgroundColor: '#133',
                hoverBorderColor: '#022',
                yAxisID: 'distance',
                stack: 'distance',
                tooltipFormat: (x, i) => {
                    const tips = [L.distanceFormatter.formatShort(x)];
                    if (predictions && i === metricData.length - 1) {
                        const pdist = L.distanceFormatter.formatShort(predictions.distance[i].y + x, 0);
                        tips.push(`${this.LM('predicted')}: <b>~${pdist}</b>`);
                    }
                    return tips;
                },
                data: metricData.map((b, i) => ({b, x: b.date, y: b.distance})),
            }];
            if (predictions) {
                this.chart.data.datasets.push({
                    id: 'tss',
                    backgroundColor: '#1d86cd30',
                    borderColor: '#0d76bd50',
                    hoverBackgroundColor: '#0d76bd60',
                    hoverBorderColor: '#0d76bd60',
                    yAxisID: 'tss',
                    stack: 'tss',
                    data: predictions.tss,
                }, {
                    id: 'duration',
                    backgroundColor: '#fc7d0b30',
                    borderColor: '#dc5d0050',
                    hoverBackgroundColor: '#ec6d0060',
                    hoverBorderColor: '#dc5d0060',
                    yAxisID: 'duration',
                    stack: 'duration',
                    data: predictions.duration,
                }, {
                    id: 'distance',
                    backgroundColor: '#2443',
                    borderColor: '#0225',
                    hoverBackgroundColor: '#1336',
                    hoverBorderColor: '#0226',
                    yAxisID: 'distance',
                    stack: 'distance',
                    data: predictions.distance,
                });
            }
            for (const [i, x] of this.chart.data.datasets.entries()) {
                this.chart.data.datasets[i] = Object.assign({}, commonOptions, x);
            }
            this.chart.update();
        }
    }


    class ElevationChartView extends ActivityTimeRangeChartView {
        get localeKeys() {
            return ['/analysis_gain', 'activities'];
        }

        async init(options) {
            const thousandFeet = 1609.344 / 5280 * 100;
            const stepSize = L.elevationFormatter.unitSystem === 'imperial' ? thousandFeet : 1000;
            await super.init({...options, id: 'elevation'});
            this.setChartConfig({
                options: {
                    elements: {
                        line: {
                            fill: true,
                            backgroundColor: '#8f8782e0',
                            borderColor: '#6f6762f0',
                            cubicInterpolationMode: 'monotone',
                        }
                    },
                    scales: {
                        yAxes: [{
                            id: 'elevation',
                            scaleLabel: {labelString: this.LM('analysis_gain')},
                            ticks: {
                                min: 0,
                                maxTicksLimit: 8,
                                stepSize,
                                callback: v => H.elevation(v, {suffix: true}),
                            },
                        }]
                    },
                    tooltips: {
                        intersect: false,
                    },
                }
            });
        }

        onUpdateActivities({range, daily}) {
            let gain = 0;
            const days = range.days;
            const lineWidth = days > 366 ? 0.66 : days > 60 ? 1 : 1.25;
            this.chart.data.datasets = [{
                id: 'elevation',
                label: this.LM('analysis_gain'),
                borderWidth: lineWidth,
                yAxisID: 'elevation',
                tooltipFormat: x => H.elevation(x, {suffix: true}),
                data: daily.map(b => {
                    gain += b.altGain;
                    return {b, x: b.date, y: gain};
                }),
            }];
            this.chart.update();
        }
    }


    class SummaryView extends PerfView {
        get events() {
            return {
                ...super.events,
                'click a.collapser': 'onCollapserClick',
                'click a.expander': 'onExpanderClick',
                'click section.training a.missing-tss': 'onMissingTSSClick',
                'click section.highlights a[data-id]': 'onHighlightClick',
                'dblclick section > header': 'onDblClickHeader',
                'change select[name="type"]': 'onTypeChange',
            };
        }

        get tpl() {
            return 'performance-summary.html';
        }

        get localeKeys() {
            return ['rides', 'runs', 'swims', 'skis', 'workouts', 'ride', 'run', 'swim', 'ski', 'workout'];
        }

        async init({pageView}) {
            this.pageView = pageView;
            this.sync = {};
            this.daily = [];
            this.missingTSS = [];
            this.onSyncActive = this._onSyncActive.bind(this);
            this.onSyncStatus = this._onSyncStatus.bind(this);
            this.onSyncError = this._onSyncError.bind(this);
            this.onSyncProgress = this._onSyncProgress.bind(this);
            this.collapsed = sauce.storage.getPrefFast('perfSummarySectionCollapsed') || {};
            this.type = sauce.storage.getPrefFast('perfSummarySectionType') || 'power';
            if (pageView.athlete) {
                await this.setAthlete(pageView.athlete);
            }
            await super.init();
            this.listenTo(pageView, 'update-activities', this.onUpdateActivities);
        }

        async findPeaks() {
            const [start, end] = [this.start, this.end];
            if (start == null || end == null) {
                return [];
            }
            const ranges = peakRanges[getPeaksRangeTypeForStream(this.type)];
            const keyFormatter = getPeaksKeyFormatter(this.type);
            const valueFormatter = getPeaksValueFormatter(this.type);
            const peaks = await sauce.hist.getPeaksForAthlete(this.athlete.id, this.type,
                ranges.map(x => x.value), {limit: 1, start, end});
            return peaks.map(x => ({
                key: keyFormatter(x.period),
                prettyValue: valueFormatter(x.value),
                unit: getPeaksUnit(this.type),
                activity: x.activity,
            }));
        }

        async renderAttrs() {
            const weeks = this.daily.length / 7;
            const totalTime = sauce.data.sum(this.daily.map(x => x.duration));
            const totalDistance = sauce.data.sum(this.daily.map(x => x.distance));
            const totalAltGain = sauce.data.sum(this.daily.map(x => x.altGain));
            const r = {
                athlete: this.athlete,
                collapsed: this.collapsed,
                type: this.type,
                sync: this.sync,
                activeDays: this.daily.filter(x => x.activities.length).length,
                tssAvg: this.daily.length ? sauce.data.sum(this.daily.map(x =>
                    x.tss)) / this.daily.length : 0,
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
            return r;
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
            this.athlete = athlete;
            const id = athlete && athlete.id;
            if (this.syncController) {
                this.syncController.removeEventListener('active', this.onSyncActive);
                this.syncController.removeEventListener('status', this.onSyncStatus);
                this.syncController.removeEventListener('error', this.onSyncError);
                this.syncController.removeEventListener('progress', this.onSyncProgress);
            }
            if (id) {
                this.syncController = getSyncController(id);
                this.syncController.addEventListener('active', this.onSyncActive);
                this.syncController.addEventListener('status', this.onSyncStatus);
                this.syncController.addEventListener('error', this.onSyncError);
                this.syncController.addEventListener('progress', this.onSyncProgress);
                this.sync = await this.syncController.getState();
                this.sync.counts = await sauce.hist.activityCounts(id);
            } else {
                this.syncController = null;
            }
        }

        async onTypeChange(ev) {
            this.type = ev.currentTarget.value;
            await sauce.storage.setPref(`perfSummarySectionType`, this.type);
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

        async onUpdateActivities({athlete, activities, daily, range}) {
            if (this.athlete !== athlete) {
                await this.setAthlete(athlete);
            }
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
            await this.setCollapsed(ev.currentTarget.closest('section'), true);
        }

        async onExpanderClick(ev) {
            await this.setCollapsed(ev.currentTarget.closest('section'), false);
        }

        async onHighlightClick(ev) {
            const activity = await sauce.hist.getActivity(Number(ev.currentTarget.dataset.id));
            this.pageView.trigger('select-activities', [activity]);
        }

        async onMissingTSSClick(ev) {
            const bulkEditDialog = new BulkActivityEditDialog({
                activities: this.missingTSS,
                pageView: this.pageView
            });
            await bulkEditDialog.render();
            bulkEditDialog.show();
            sauce.report.event('PerfBulkActivityDialog', 'show');
        }

        async onDblClickHeader(ev) {
            const section = ev.currentTarget.closest('section');
            await this.setCollapsed(section, !section.classList.contains('collapsed'));
        }

        async setCollapsed(section, en) {
            const id = section.dataset.id;
            const collapsed = en !== false;
            section.classList.toggle('collapsed', collapsed);
            this.collapsed[id] = collapsed;
            await sauce.storage.setPref(`perfSummarySectionCollapsed.${id}`, collapsed);
        }
    }


    class DetailsView extends PerfView {
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
            };
        }

        get tpl() {
            return 'performance-details.html';
        }

        async init({pageView}) {
            this.onSyncProgress = this._onSyncProgress.bind(this);
            this.pageView = pageView;
            this.listenTo(pageView, 'change-athlete', this.onChangeAthlete);
            this.listenTo(pageView, 'select-activities', this.setActivities);
            this.listenTo(pageView, 'available-activities-changed', this.onAvailableChanged);
            this.setAthlete(pageView.athlete);
            await super.init();
        }

        setElement(el, ...args) {
            const r = super.setElement(el, ...args);
            const expanded = sauce.storage.getPrefFast('perfDetailsAsideVisible');
            this.setExpanded(expanded, {noSave: true});
            return r;
        }

        async renderAttrs() {
            let hasNewer;
            let hasOlder;
            if (this.activities && this.activities.length && this.pageView.newest) {
                const ourOldest = this.activities[0].ts;
                const ourNewest = this.activities[this.activities.length - 1].ts;
                hasNewer = ourNewest < this.pageView.newest;
                hasOlder = ourOldest > this.pageView.oldest;
            }
            return {
                daily: this.activities ? activitiesByDay(this.activities) : null,
                hasNewer,
                hasOlder,
                debug: !!location.search.match(/debug/),
            };
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

        async setExpanded(en, options={}) {
            const visible = en !== false;
            this.$el.toggleClass('expanded', visible);
            if (!options.noSave) {
                await sauce.storage.setPref('perfDetailsAsideVisible', visible);
            }
        }

        async setActivities(activities, options={}) {
            this.activities = Array.from(activities);
            this.activities.sort((a, b) => (a.ts || 0) - (b.ts || 0));
            await this.render();
            if (!options.noHighlight) {
                const expanded = this.$el.hasClass('expanded');
                await this.setExpanded();
                if (expanded) {
                    this.el.scrollIntoView({behavior: 'smooth'});
                } else {
                    this.$el.one('transitionend', () =>
                        this.el.scrollIntoView({behavior: 'smooth'}));
                }
            }
        }

        async onCollapserClick(ev) {
            await this.setExpanded(false);
        }

        async onEditActivityClick(ev) {
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
            const more = await sauce.hist.getActivitySiblings(oldest.id,
                {direction: 'prev', limit: 1});
            await this.setActivities(this.activities.concat(more), {noHighlight: true});
        }

        async onLoadNewerClick(ev) {
            if (!this.activities.length) {
                return;
            }
            const newest = this.activities[this.activities.length - 1];
            const more = await sauce.hist.getActivitySiblings(newest.id,
                {direction: 'next', limit: 1});
            await this.setActivities(this.activities.concat(more), {noHighlight: true});
        }

        async onLoadRecentClick(ev) {
            const range = this.pageView.getRangeSnapshot();
            const start = +range.start;
            const end = +range.end;
            const activities = await sauce.hist.getActivitiesForAthlete(this.pageView.athlete.id,
                {start, end, limit: 10, direction: 'prev'});
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
            const periods = new Set(peakRanges[getPeaksRangeTypeForStream(type)].map(x => x.value));
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
                    value.textContent = `${valueFormatter(x.value)}${getPeaksUnit(type)}`;
                    row.appendChild(key);
                    row.appendChild(value);
                    details.appendChild(row);
                }
                row.insertAdjacentElement('beforeend', details);
            }
        }

        async onCompressRowClick(ev) {
            ev.currentTarget.closest('row').classList.remove('expanded');
        }
    }


    class BulkActivityEditDialog extends PerfView {
        get events() {
            return {
                ...super.events,
                'click .edit-activity': 'onEditActivityClick',
            };
        }

        get tpl() {
            return 'performance-bulkedit.html';
        }

        async init({activities, pageView}) {
            this.activities = activities;
            this.pageView = pageView;
            this.athletes = new Set(activities.map(x => x.athlete));
            this.icon = await sauce.ui.getImage('fa/list-duotone.svg');
            await super.init();
        }

        renderAttrs() {
            return {
                activities: this.activities,
            };
        }

        show() {
            sauce.ui.modal({
                title: 'Edit Activities',
                el: this.$el,
                flex: true,
                width: '60em',
                icon: this.icon,
                dialogClass: 'sauce-edit-activities-dialog',
                extraButtons: [{
                    text: 'Save', // XXX localize
                    click: async ev => {
                        const updates = {};
                        for (const tr of this.$('table tbody tr')) {
                            updates[Number(tr.dataset.id)] = {
                                tssOverride: Number(tr.querySelector('input[name="tss_override"]').value) || null,
                                peaksExclude: tr.querySelector('input[name="peaks_exclude"]').checked,
                            };
                        }
                        ev.currentTarget.disabled = true;
                        ev.currentTarget.classList.add('sauce-loading');
                        try {
                            await sauce.hist.updateActivities(updates);
                            for (const id of Object.keys(updates)) {
                                await sauce.hist.invalidateActivitySyncState(Number(id), 'local',
                                    'training-load', {disableSync: true});
                                await sauce.hist.invalidateActivitySyncState(Number(id), 'local',
                                    'peaks', {disableSync: true});
                            }
                            await Promise.all([...this.athletes].map(x => sauce.hist.syncAthlete(x, {wait: true})));
                            await this.pageView.render();
                        } finally {
                            ev.currentTarget.classList.remove('sauce-loading');
                            ev.currentTarget.disabled = false;
                        }
                        this.$el.dialog('destroy');
                        sauce.report.event('PerfBulkActivityDialog', 'save');
                    }
                }]
            });
        }
    }


    class PeaksView extends PerfView {
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
            return 'performance-peaks.html';
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
            editActivityDialogXXX(activity, this.pageView);
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


    class MainView extends PerfView {
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
            return 'performance-main.html';
        }

        get localeKeys() {
            return ['weekly', 'monthly', 'yearly', 'activities', 'today'];
        }

        async init({pageView}) {
            this.pageView = pageView;
            this.activeDaysChartView = new ActiveDaysChartView({pageView});
            this.peaksView = new PeaksView({pageView});
            this.trainingChartView = new TrainingChartView({pageView});
            this.activityVolumeChartView = new ActivityVolumeChartView({pageView});
            this.elevationChartView = new ElevationChartView({pageView});
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
            this.activeDaysChartView.setElement(this.$('.active-days-chart-view'));
            this.peaksView.setElement(this.$('.peaks-view'));
            this.trainingChartView.setElement(this.$('.training-chart-view'));
            this.activityVolumeChartView.setElement(this.$('.activity-volume-chart-view'));
            this.elevationChartView.setElement(this.$('.elevation-chart-view'));
            await this.activeDaysChartView.render();
            await this.peaksView.render();
            await this.trainingChartView.render();
            await this.activityVolumeChartView.render();
            await this.elevationChartView.render();
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


    class PageView extends PerfView {
        get events() {
            return {
                ...super.events,
                'change nav select[name=athlete]': 'onAthleteChange',
                'click .onboarding-stack .btn.enable': 'onOnboardingEnableClick',
            };
        }

        get tpl() {
            return 'performance.html';
        }

        async init({athletes}) {
            this.onSyncProgress = this._onSyncProgress.bind(this);
            this.athletes = athletes;
            this.syncButtons = new Map();
            const f = router.filters;
            this.schedUpdateActivities = sauce.asyncDebounced(this._schedUpdateActivities);
            await this.setAthleteId(f.athleteId);
            this._setRangeFromRouter();
            this.summaryView = new SummaryView({pageView: this});
            this.mainView = new MainView({pageView: this});
            this.detailsView = new DetailsView({pageView: this});
            router.setFilters(this.athlete, this._range, {replace: true, all: this.allRange});
            router.on('route:onNav', this.onRouterNav.bind(this));
            router.on('route:onNavAll', this.onRouterNav.bind(this));
            await super.init();
        }

        _setRangeFromRouter() {
            const f = router.filters;
            const defaults = sauce.storage.getPrefFast('perfDefaultRange') || {};
            this.allRange = f.all || (f.all === undefined && defaults.all);
            if (this.allRange) {
                const [period, metric] = this.getAllRange();
                this._range = new D.CalendarRange(null, period, metric);
            } else {
                this._range = new D.CalendarRange(f.suggestedEnd,
                    f.period || defaults.period || 4,
                    f.metric || defaults.metric || 'weeks');
            }
        }

        renderAttrs() {
            return {
                athletes: Array.from(this.athletes.values()),
                athleteId: this.athlete && this.athlete.id,
            };
        }

        async render() {
            this.syncButtons.clear();  // Must not reuse on re-render() for DOM events.
            const syncBtnPromise = this.athlete && this.getSyncButton(this.athlete.id);
            await super.render();
            const range = this._range.snapshot;
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
                this.athlete = this.athletes.get(currentUser) || this.athletes.values().next().value;
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
            const rangeStart = +this._range.start - (42 * 86400 * 1000);
            if (done.oldest <= this._range.end && done.newest >= rangeStart) {
                await this.schedUpdateActivities();
                await this.refreshNewestAndOldest();
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
            const updated = wasNewest !== this.newest || wasOldest !== this.oldest;
            if (updated) {
                this.trigger('available-activities-changed',
                    {newest: this.newest, oldest: this.oldest});
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
            router.setFilters(this.athlete, this._range, {all: this.allRange});
            await this.schedUpdateActivities();
        }

        async onRouterNav() {
            // This func gets valid arguments but they are raw.  Use the filters object instead.
            const f = router.filters;
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
            const days = (this.newest - this.oldest) / 1000 / 86400;
            if (days > 3 * 365) {
                metric = 'years';
                period = Math.ceil(days / 365);
            } else if (days > 200) {
                metric = 'months';
                period = Math.ceil(days / 30.416);
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
            const endSeed = this._range.end > Date.now() ? D.tomorrow() : undefined;
            this._range.setRangePeriod(period, metric, endSeed);
            sauce.storage.setPref('perfDefaultRange', {period, metric, all: options.all});  // bg okay
        }

        getRangeSnapshot() {
            return this._range.snapshot;
        }

        async setRangePeriod(period, metric, options={}) {
            this._setRangePeriod(period, metric, options);
            router.setFilters(this.athlete, this._range, options);
            await this.schedUpdateActivities();
        }

        shiftRange(offset) {
            if (offset === Infinity) {
                this._range.setEndSeed(D.tomorrow());
            } else if (offset === -Infinity) {
                this._range.setStartSeed(this.oldest);
            } else {
                this._range.shift(offset);
            }
            router.setFilters(this.athlete, this._range);
            return this.schedUpdateActivities();
        }

        async _schedUpdateActivities() {
            const range = this._range.snapshot;
            this.trigger('before-update-activities', {athlete: this.athlete, range});
            this._updateActivities(await this._getActivities(range));
        }

        async _getActivities(range) {
            const start = +range.start;
            const end = +range.clippedEnd;
            const activities = await sauce.hist.getActivitiesForAthlete(this.athlete.id,
                {start, end, includeTrainingLoadSeed: true, excludeUpper: true});
            return {activities, range};
        }

        _updateActivities({activities, range}) {
            let atl = 0;
            let ctl = 0;
            if (activities.length) {
                ({atl, ctl} = activities[0].trainingLoadSeed);
            }
            const daily = activitiesByDay(activities, range.start, range.clippedEnd, atl, ctl);
            let metricData;
            if (range.metric === 'weeks') {
                metricData = aggregateActivitiesByWeek(daily, {isoWeekStart: true});
            } else if (range.metric === 'months') {
                metricData = aggregateActivitiesByMonth(daily);
            } else if (range.metric === 'years') {
                metricData = aggregateActivitiesByYear(daily);
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

        async onOnboardingEnableClick(ev) {
            ev.currentTarget.classList.add('sauce-loading');
            const athlete = await sauce.hist.addAthlete({
                id: currentAthlete.id,
                gender: currentAthlete.get('gender') === 'F' ? 'female' : 'male',
                name: currentAthlete.get('display_name'),
            });
            await sauce.hist.enableAthlete(athlete.id);
            location.reload();
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
            $page.addClass('onboarding');
            if (self.CSS && self.CSS.registerProperty) {
                $page.addClass('animate-hue');
                CSS.registerProperty({
                    name: '--colorwheel-conic-turn',
                    syntax: '<number>',
                    inherits: true,
                    initialValue: 0
                });
            }
        }
        self.pv = new PageView({athletes, el: $page});
        await self.pv.render();
    }


    Backbone.history.start({pushState: true});

    if (['interactive', 'complete'].indexOf(document.readyState) === -1) {
        addEventListener('DOMContentLoaded', () => load().catch(sauce.report.error));
    } else {
        load().catch(sauce.report.error);
    }
});
