/* global Strava, sauce, jQuery, pageView */

sauce.ns('analysis', ns => {
    'use strict';

    let _resolvePrepared;
    ns.ready = false;
    ns.prepared = new Promise(resolve => {
        _resolvePrepared = () => {
            ns.ready = true;
            resolve();
        };
    });

    const tplUrl = sauce.getURL('templates');
    const L = sauce.locale;
    const H = sauce.locale.human;
    const LM = m => L.getMessage(m[0] === '/' ? m.substr(1) : `analysis_${m}`);
    const _localeInit = sauce.locale.init();  // preload micro opt.

    const minVAMTime = 60;
    const minPowerPotentialTime = 300;
    const minWattEstTime = 300;
    const minSeaPowerElevation = 328;  // About 1000ft or 1% power
    const prefetchStreams = [
        'time', 'heartrate', 'altitude', 'distance', 'moving',
        'velocity_smooth', 'cadence', 'latlng', 'watts', 'watts_calc',
        'grade_adjusted_distance'
    ];
    const sourcePeakTypes = {
        peak_power: 'power',
        peak_power_wkg: 'power_wkg',
        peak_hr: 'hr',
        peak_pace: 'pace',
        peak_gap: 'gap',
        peak_np: 'np',
        peak_xp: 'xp',
    };
    // Preload our food data so we're not waiting around later.
    const foodsPromise = sauce.fetch(sauce.getURL('src/site/foods.json')).then(r => r.json());
    const mobileMedia = window.matchMedia('(max-width: 768px)');


    let _fullActivity;
    async function fetchFullActivity() {
        // The initial activity object is not fully loaded for owned' activities.  This routine
        // will return a full activity object if the activity is from the page owner. Note that
        // there are small differences, so only use this if needed.
        if (_fullActivity !== undefined) {
            return _fullActivity;
        }
        if (pageView.isOwner()) {
            const activity = new Strava.Labs.Activities.TrainingActivity({id: pageView.activity().id});
            await new Promise((success, error) => activity.fetch({success, error}));
            if (activity) {
                // Handle 10-30-2024 change..
                activity.set('type', activity.get('sport_type'));
            }
            _fullActivity = activity;
        } else {
            _fullActivity = null;
        }
        return _fullActivity;
    }


    class ThrottledNetworkError extends Error {
        constructor() {
            super('Strava returned API throttle response: 429');
        }
    }


    const _attemptedFetch = new Set();
    const _pendingFetches = new Map();
    async function fetchStreams(streamTypes) {
        if (pageView.streamsRequest.pending) {
            // We must wait until the pageView.streamsRequest has completed.
            // Stream transform functions fail otherwise.
            await pageView.streamsRequest.pending;
        }
        const streams = pageView.streams();
        const attempted = _attemptedFetch;
        const pending = _pendingFetches;
        const available = new Set(Object.keys(streams.availableStreams()));
        const fetched = new Set(streams.requestedTypes);
        const todo = streamTypes.filter(x => !attempted.has(x) && !available.has(x) && !fetched.has(x));
        if (todo.length) {
            const waitfor = [];
            const fetching = [];
            for (const x of todo) {
                if (pending.has(x)) {
                    // This stream is in flight, wait for existing promise.
                    waitfor.push(pending.get(x));
                } else {
                    fetching.push(x);
                }
            }
            if (fetching.length) {
                const p = new Promise((resolve, reject) => {
                    streams.fetchStreams(fetching, {
                        success: resolve,
                        error: (streams, ajax) => {
                            let e;
                            if (ajax.status === 429) {
                                e = new ThrottledNetworkError();
                            } else {
                                e = new Error(`Fetch streams failed: ${ajax.status} ${ajax.statusText}`);
                            }
                            reject(e);
                        }
                    });
                });
                for (const x of fetching) {
                    pending.set(x, p);
                }
                try {
                    await p;
                } finally {
                    for (const x of fetching) {
                        pending.delete(x);
                    }
                }
                for (const x of fetching) {
                    attempted.add(x);
                }
            }
            if (waitfor.length) {
                await Promise.all(waitfor);
            }
        }
        return streamTypes.map(x => streams.getStream(x));
    }


    async function fetchStream(name, start, end) {
        await fetchStreams([name]);
        return _getStream(name, start, end);
    }


    async function fetchSmoothStream(name, period, start, end) {
        period = period || 15;
        const fqName = `${name}_smooth_${period}`;
        const stream = _getStream(fqName, start, end);
        if (stream) {
            return stream;
        }
        await fetchStreams([name]);
        const rawStream = _getStream(name);
        if (rawStream && rawStream.length > period * 2) {
            const smooth = sauce.data.smooth(period, rawStream);
            pageView.streams().streamData.add(fqName, smooth);
            return _getStream(fqName, start, end);
        }
    }


    function _getStream(name, startIndex, endIndex) {
        const s = pageView.streams().getStream(name);
        if (s && startIndex != null) {
            return s.slice(startIndex, endIndex + 1);
        } else {
            return s;
        }
    }


    function getStreamTimeIndex(time) {
        const timeStream = _getStream('time');
        const idx = timeStream.indexOf(time);
        if (idx !== -1) {
            return idx;
        }
    }


    function getStreamIndexTime(index) {
        const timeStream = _getStream('time');
        return timeStream[index];
    }


    async function fetchStreamTimeRange(name, startTime, endTime) {
        const startIndex = getStreamTimeIndex(startTime);
        const endIndex = getStreamTimeIndex(endTime);
        return await fetchStream(name, startIndex, endIndex);
    }


    async function fetchSmoothStreamTimeRange(name, period, startTime, endTime) {
        const startIndex = getStreamTimeIndex(startTime);
        const endIndex = getStreamTimeIndex(endTime);
        return await fetchSmoothStream(name, period, startIndex, endIndex);
    }


    function editableField($field, options) {
        const $input = $field.find('input');
        const $link = $field.find('a');
        $input.on('keyup', async ev => {
            if (ev.keyCode === 27 /* escape */) {
                $field.removeClass('editing');
                return;
            } else if (ev.keyCode !== 13 /* enter */) {
                return;
            }
            let cleanValue;
            try {
                cleanValue = options.validator($input.val());
            } catch(e) {
                if (e.reason) {
                    sauce.ui.modal({
                        title: e.reason.title,
                        body: e.reason.message
                    });
                }
                return;
            }
            $link.text('...');
            $field.removeClass('editing');
            if (options.onSubmit) {
                await options.onSubmit(cleanValue);
            }
        });
        $input.on('blur', async ev => {
            if (!$field.hasClass('editing')) {
                return;  // ignore if not editing (e.g. escape key was pressed)
            }
            // Save valid value but don't reload page..
            let cleanValue;
            try {
                cleanValue = options.validator($input.val());
            } catch(e) {
                return;
            }
            if (options.onBlur) {
                await options.onBlur(cleanValue);
            }
            $link.text(cleanValue);
            $field.addClass('dirty');
        });
        $link.on('click', () => {
            $field.addClass('editing');
            const padding = $input.outerWidth() - $input.innerWidth();
            $input.css('width', `calc(${padding}px + ${$input.data('width')})`);
            $input.focus();
        });
    }


    function createPolylineMap(latlngStream, $el) {
        const bounds = sauce.geo.boundingBox(latlngStream);
        const mbr = [[bounds.swc[0], bounds.swc[1]], [bounds.nec[0], bounds.nec[1]]];
        const context = new Strava.Maps.MapContext();
        context.activityId(pageView.activityId());
        context.latlngStream(new Strava.Maps.LatLngStream(latlngStream));
        return new Strava.Maps.Mapbox.Construction.MapFactory(context, $el, null, mbr);
    }


    async function updateAthleteInfo(updates) {
        const athlete = pageView.activityAthlete();
        await sauce.storage.updateAthleteInfo(athlete.id, {
            name: athlete.get('display_name'),
            ...updates
        });
    }


    function attachEditableFTP($parent) {
        const $field = $parent.find('.sauce-editable-field.ftp');
        async function save(ftp_override) {
            await updateAthleteInfo({ftp_override});
        }
        editableField($field, {
            validator: rawValue => {
                if (rawValue === '') {
                    return null;  // Reset to default value.
                }
                const n = parseInt(rawValue);
                if (!n || n <= 0 || n > 600) {
                    const e = new Error('invalid');
                    e.reason = {
                        title: 'Invalid FTP Wattage',
                        message: `
                            <b>${rawValue} is not a valid FTP.</b><br/>
                            <br/>
                            Acceptable range: 1 - 600 watts.
                        `
                    };
                    throw e;
                } else {
                    return n;
                }
            },
            onBlur: save,
            onSubmit: async v => {
                await save(v);
                sauce.ui.modal({
                    title: 'Reloading...',
                    body: '<b>Reloading page to reflect FTP change.</b>'
                });
                location.reload();
            }
        });
    }


    function attachEditableWeight($parent) {
        const $field = $parent.find('.sauce-editable-field.weight');
        async function save(v) {
            const weight_override = L.weightUnconvert(v);
            await updateAthleteInfo({weight_override});
        }
        editableField($field, {
            validator: rawValue => {
                if (rawValue === '') {
                    return null;  // Reset to default value.
                }
                const n = Number(rawValue);
                if (!n || n <= 0 || n > 10000) {
                    const e = new Error('invalid');
                    e.reason = {
                        title: 'Invalid Weight',
                        message: `
                            <b>${rawValue} is not a valid weight.</b><br/>
                            <br/>
                            Acceptable range: 1 - 10000.
                        `
                    };
                    throw e;
                } else {
                    return n;
                }
            },
            onBlur: save,
            onSubmit: async v => {
                await save(v);
                sauce.ui.modal({
                    title: 'Reloading...',
                    body: '<b>Reloading page to reflect weight change.</b>'
                });
                location.reload();
            }
        });
    }


    function attachEditableTSS($parent) {
        const $field = $parent.find('.sauce-editable-field.tss');
        async function save(tssOverride) {
            await sauce.hist.updateActivity(pageView.activityId(), {tssOverride});
        }
        editableField($field, {
            validator: rawValue => {
                if (rawValue === '') {
                    return null;  // Reset to default value.
                }
                const n = parseInt(rawValue);
                if (isNaN(n) || n < 0) {
                    const e = new Error('invalid');
                    e.reason = {
                        title: 'Invalid TSS',
                        message: `<b>${rawValue} is not a valid TSS.</b>`
                    };
                    throw e;
                } else {
                    return n;
                }
            },
            onBlur: save,
            onSubmit: async v => {
                await save(v);
                sauce.ui.modal({
                    title: 'Reloading...',
                    body: '<b>Reloading page to reflect TSS change.</b>'
                });
                location.reload();
            }
        });
    }


    function navHeightAdjustments() {
        // The main site's side nav is absolute positioned, so if the primary view is too short
        // the footer will overflow and mess everything up.  Add a min-height to the view to
        // prevent the footer from doing this.
        const sidenav = document.querySelector('nav.sidenav');
        const minHeight = sidenav.offsetHeight;
        document.querySelector('.view > .page.container').style.minHeight = `${minHeight}px`;
        adjustSlideMenu();
    }


    async function renderTertiaryStats(attrs) {
        const template = await getTemplate('tertiary-stats.html');
        if (attrs.kj && !sauce.options['analysis-disable-food-reward']) {
            attrs.foodReward = await getFoodReward(attrs.kj);
        }
        const $stats = jQuery(await template(attrs));
        if (ns.syncAthlete) {
            $stats.on('click', '.sauce-editable-field.ftp,.sauce-editable-field.weight', async ev => {
                const {FTPHistoryView, WeightHistoryView} =
                    await import(sauce.getURL('/src/site/data-views.mjs'));
                const isFTP = ev.currentTarget.classList.contains('ftp');
                let view;
                if (isFTP) {
                    view = new FTPHistoryView({athlete: ns.syncAthlete});
                } else {
                    view = new WeightHistoryView({athlete: ns.syncAthlete});
                }
                await view.render();
                const $modal = sauce.ui.modal({
                    title: `Edit Athlete ${isFTP ? 'FTP': 'Weight'}`, // XXX locale
                    dialogClass: 'no-pad',
                    el: view.$el,
                    width: '25em',
                    height: 250,
                });
                $modal.on('dialogclose', () => {
                    if (!view.edited) {
                        return;
                    }
                    sauce.ui.modal({
                        title: 'Reloading...',
                        body: '<b>Reloading page to reflect change.</b>'
                    });
                    location.reload();
                });
            });
            attachEditableTSS($stats);
        } else {
            attachEditableFTP($stats);
            attachEditableWeight($stats);
        }
        jQuery('.activity-stats .inline-stats').last().after($stats);
        $stats.on('click', 'li.sauce-food[data-url]', ev =>
            void window.open(ev.currentTarget.dataset.url, '_blank'));
        $stats.on('click', 'li.sauce-food .sauce-next-food', async ev => {
            ev.stopPropagation();
            attrs.foodReward = await rotateFoodReward(attrs.kj);
            $stats.html(jQuery(await template(attrs)).children());
            if (!ns.syncAthlete) {
                // Only editable fields nest event listeners on dom nodes we just replaced..
                attachEditableFTP($stats);
                attachEditableWeight($stats);
            } else {
                attachEditableTSS($stats);
            }
        });
    }


    class PeakEffortsPanel {
        constructor({menu, renderAttrs}) {
            this.$el = jQuery(`<ul id="sauce-infopanel" class="pagenav"/>`);
            this.menu = menu;
            this.sourceKey = `${ns.activityType}_source`;
            this.renderAttrs = renderAttrs;
            this.$el.on('click', '.group tr[data-range-value]', async ev => {
                ev.stopPropagation();  // prevent click-away detection from closing dialog.
                const row = ev.currentTarget;
                await showInfoDialog({
                    startTime: Number(row.dataset.startTime),
                    endTime: Number(row.dataset.endTime),
                    wallStartTime: Number(row.dataset.wallStartTime),
                    wallEndTime: Number(row.dataset.wallEndTime),
                    label: row.dataset.rangeLabel,
                    range: Number(row.dataset.rangeValue),
                    icon: row.dataset.rangeIcon,
                    source: this._selectedSource,
                    originEl: row,
                    isDistanceRange: !!row.dataset.distanceRange,
                });
            });
            this.$el.on('click', '.drop-down-menu .options li[data-source]', async ev => {
                await this.setSelectedSource(ev.currentTarget.dataset.source);
                await this.render();
            });
            this.$el.on('click', '.drop-down-menu .options li.sauce-peaks-settings',
                showPeaksSettingsDialog);
        }

        async render() {
            const source = await this.getSelectedSource();
            const template = await getTemplate('peak-efforts.html');
            const attrs = this.renderAttrs(source);
            this.$el.html(await template({
                menuInfo: await Promise.all(this.menu.map(async x => ({
                    source: x,
                    icon: await sauce.ui.getImage(ns.peakIcons[x]),
                    tooltip: x + '_tooltip'
                }))),
                source,
                sourceTooltip: source + '_tooltip',
                sourceIcon: await sauce.ui.getImage(ns.peakIcons[source]),
                ...attrs,
            }));
            addPeaksRanks(source, attrs.rows, this.$el);  // bg okay;
            navHeightAdjustments();
        }

        async getSelectedSource() {
            let lastKnown;
            if (!this._selectedSource) {
                const ranges = await sauce.storage.get('analysis_peak_ranges');
                lastKnown = ranges && ranges[this.sourceKey];
            } else {
                lastKnown = this._selectedSource;
            }
            if (!lastKnown || this.menu.indexOf(lastKnown) === -1) {
                this._selectedSource = this.menu[0];
            } else {
                this._selectedSource = lastKnown;
            }
            return this._selectedSource;
        }

        async setSelectedSource(source) {
            this._selectedSource = source;
            await sauce.storage.update('analysis_peak_ranges', {[this.sourceKey]: source});
        }
    }


    function _rangeRollToRow({range, roll, native, value, unit, style}) {
        return {
            rangeValue: range.value,
            rangeLabel: range.label,
            rangeLabelHTML: range.labelHTML,
            value,
            unit,
            startTime: roll.firstTime({noPad: true}),
            endTime: roll.lastTime({noPad: true}),
            wallStartTime: roll.firstTime(),
            wallEndTime: roll.lastTime(),
            style,
            roll,
            native,
        };
    }


    async function assignTrailforksToSegments() {
        if (!sauce.options['analysis-trailforks']) {
            return;
        }
        const latlngStream = await fetchStream('latlng');
        const distStream = await fetchStream('distance');
        if (!latlngStream || !latlngStream.length || !distStream || !distStream.length) {
            return;
        }
        //const intersections = await sauce.trailforks.intersections(latlngStream, distStream); // DEBUG
        const intersections = await sauce.trailforks.intersections(latlngStream, distStream);
        const segmentTrailDescs = new Map();
        for (const intersect of intersections) {
            for (const match of intersect.matches) {
                for (const x of getOverlappingSegments(match.streamStart, match.streamEnd)) {
                    let descs = segmentTrailDescs.get(x.segment);
                    if (!descs) {
                        descs = new Map();
                        segmentTrailDescs.set(x.segment, descs);
                    }
                    let desc = descs.get(intersect);
                    if (!desc) {
                        desc = {
                            trail: intersect.trail,
                            segmentCorrelation: 0,
                            _trailIndexes: new Set()
                        };
                        descs.set(intersect, desc);
                    }
                    const [segStart, segEnd] = pageView.chartContext()
                        .convertStreamIndices(x.segment.indices());
                    for (let i = segStart; i <= segEnd; i++) {
                        const trailIndex = match.streamPathMap[i];
                        if (trailIndex != null) {
                            desc._trailIndexes.add(trailIndex);
                        }
                    }
                    desc.trailCorrelation = desc._trailIndexes.size / intersect.path.length;
                    desc.segmentCorrelation += x.correlation;
                }
            }
        }
        for (const [segment, descsMap] of segmentTrailDescs.entries()) {
            const descs = [];
            for (const x of descsMap.values()) {
                if (x.trailCorrelation > 0.10) {
                    descs.push(x);
                }
                delete x._trailIndexes;
            }
            if (descs.length) {
                segment.set('tfDescs', descs);
            }
        }
    }


    // XXX Transition to using our Athlete record for this.
    const _hrZonesCache = new sauce.cache.TTLCache('hr-zones', 1 * 86400 * 1000);
    async function getHRZones() {
        const zonesEntry = await _hrZonesCache.getEntry(ns.athlete.id);
        if (!zonesEntry) {
            const zones = await sauce.perf.fetchHRZones(pageView.activity().id);
            await _hrZonesCache.set(ns.athlete.id, zones);
            return zones;
        }
        return zonesEntry.value;
    }


    async function addPeaksRanks(source, rows, $el) {
        const type = sourcePeakTypes[source];
        if (!ns.syncAthlete || !ns.syncAthlete.sync || !rows.length ||
            !supportsPeaksRanks(type)) {
            return;
        }
        const periods = rows.map(x => x.rangeValue);
        const options = {limit: 3, filterTS: getActivityTS()};
        const [all, year, recent] = await Promise.all([
            sauce.hist.getPeaksForAthlete(ns.athlete.id, type, periods, options),
            sauce.hist.getPeaksForAthlete(ns.athlete.id, type, periods, {filter: 'year', ...options}),
            sauce.hist.getPeaksForAthlete(ns.athlete.id, type, periods, {filter: 90, ...options}),
        ]);
        const categories = [{
            icon: 'pepper-solid',
            peaks: all,
            class: 'all',
        }, {
            icon: 'pepper-light',
            peaks: year,
            class: 'year',
        }, {
            icon:  'star-shooting-regular',
            peaks: recent,
            class: 'recent',
        }];
        const ourId = pageView.activity().id;
        const ranked = new Map();
        for (const x of categories) {
            for (const p of x.peaks) {
                if (!ranked.has(p.period) && p.activity === ourId) {
                    ranked.set(p.period, {rank: p.rank, icon: x.icon, class: x.class});
                }
            }
        }
        if (!ranked.size) {
            // Scan based on value as a last resort in case we haven't synced this activity yet.
            const betterOrEqual = ['pace', 'gap'].includes(type) ?
                (a, b) => (a || 0) <= (b || 0) :
                (a, b) => (a || 0) >= (b || 0);
            for (const row of rows) {
                const range = row.rangeValue;
                for (const x of categories) {
                    for (const p of x.peaks) {
                        if (p.period === range && betterOrEqual(row.native, p.value)) {
                            ranked.set(range, {rank: p.rank, icon: x.icon, class: x.class});
                            break;
                        }
                    }
                    if (ranked.has(range)) {
                        break;
                    }
                }
            }
        }
        for (const [range, x] of ranked.entries()) {
            const $rank = $el.find(`[data-range-value="${range}"] .sauce-peak-rank`);
            $rank.addClass(x.class);
            $rank[0].dataset.rank = x.rank;
            $rank.append(await sauce.ui.getImage(`fa/${x.icon}.svg`));
            $rank.find('.place').text(await LM(`rank_place_${x.rank}`));
            $rank.find('.category').text(await LM(`rank_cat_${x.class}`));
        }
    }


    async function rotateFoodReward(kj) {
        const foods = await foodsPromise;
        const id = await sauce.storage.getPref('rewardFoodId');
        const prevIdx = foods.findIndex(x => x.id === id) || 0;
        const nextFood = foods[prevIdx + 1] || foods[0];
        await sauce.storage.setPref('rewardFoodId', nextFood.id);
        if (kj) {
            return _makeFoodReward(nextFood, kj);
        }
    }


    async function getFoodReward(kj) {
        const foods = await foodsPromise;
        const id = await sauce.storage.getPref('rewardFoodId');
        const food = foods.find(x => x.id === id) || foods[0];
        return _makeFoodReward(food, kj);
    }


    function _makeFoodReward(food, kj) {
        const kcals = kj / 1.045;
        const count = kcals / food.kcals;
        return {
            count,
            kcals,
            labelLocaleKey: `/food_${food.id}_${count === 1 ? '1' : 'n'}`,
            descLocaleKey: `/food_${food.id}_desc`,
            ...food,
        };
    }


    async function startActivity() {
        const realWattsStream = await fetchStream('watts');
        const isWattEstimate = !realWattsStream;
        const wattsStream = realWattsStream || await fetchStream('watts_calc');
        const timeStream = _getStream('time');
        const hrStream = await fetchStream('heartrate');
        const altStream = await fetchSmoothStream('altitude');
        const distStream = await fetchStream('distance');
        const gradeDistStream = distStream && await fetchGradeDistStream();
        const cadenceStream = await fetchStream('cadence');
        const activeStream = _getStream('active');
        const distance = streamDelta(distStream);
        const activeTime = getActiveTime();
        let tss;
        let tssType;
        let localTss, localTrimpTss, np, intensity, power;
        let kj = pageView.activity().get('kilojoules');
        if (wattsStream) {
            const powerRoll = sauce.power.correctedPower(timeStream, wattsStream, {activeStream});
            if (powerRoll) {
                kj = powerRoll.joules() / 1000;
                power = powerRoll.avg({active: true});
                np = supportsNP() ? powerRoll.np() : null;
                if (ns.ftp) {
                    localTss = sauce.power.calcTSS(np || power, activeTime, ns.ftp);
                    intensity = (np || power) / ns.ftp;
                }
            }
        }
        if (hrStream) {
            const zones = await getHRZones();
            if (zones) {
                const ltHR = (zones.z4 + zones.z3) / 2;
                const maxHR = sauce.perf.estimateMaxHR(zones);
                const restingHR = ns.ftp ? sauce.perf.estimateRestingHR(ns.ftp) : 60;
                localTrimpTss = sauce.perf.tTSS(hrStream, timeStream, activeStream, ltHR,
                    restingHR, maxHR, ns.gender);
            }
        }
        if (ns.syncActivity?.tssOverride != null) {
            tss = ns.syncActivity.tssOverride;
            tssType = 'override';
        } else if (localTss != null) {
            if (isWattEstimate && !sauce.options['analysis-prefer-estimated-power-tss'] && localTrimpTss) {
                tss = localTrimpTss;
                tssType = 'trimp';
            } else {
                tss = localTss;
                tssType = isWattEstimate ? 'estimate' : 'power';
            }
        } else if (localTrimpTss != null) {
            tss = localTrimpTss;
            tssType = 'trimp';
        }
        assignTrailforksToSegments().catch(console.error);
        const localeWeight = ns.weight ? L.weightFormatter.convert(ns.weight) : undefined;
        renderTertiaryStats({
            weight: localeWeight && Number(localeWeight.toFixed(2)),
            weightUnit: L.weightFormatter.shortUnitKey(),
            weightNorm: ns.weight && H.weight(ns.weight).replace(/0+$/, '').replace(/\.$/, ''),
            weightOrigin: ns.weightOrigin || 'default',
            ftp: ns.ftp,
            ftpOrigin: ns.ftpOrigin || 'default',
            intensity,
            tss,
            tssType,
            np,
            kj,
            power,
            isSyncAthlete: !!ns.syncAthlete,
        }).catch(console.error);
        if (sauce.options['analysis-cp-chart']) {
            const menu = [/*locale keys*/];
            if (wattsStream) {
                menu.push('peak_power');
                if (ns.weight) {
                    menu.push('peak_power_wkg');
                }
                if (supportsNP()) {
                    menu.push('peak_np');
                }
                if (supportsXP()) {
                    menu.push('peak_xp');
                }
                if (supportsSP()) {
                    menu.push('peak_sp');
                }
            }
            if (distStream) {
                if (gradeDistStream) {
                    menu.unshift('peak_gap');  // At top because its a run
                }
                if (ns.activityType === 'run' || ns.activityType === 'swim') {
                    menu.unshift('peak_pace');  // Place at top (above gap too)
                } else {
                    menu.push('peak_pace');
                }
            }
            if (hrStream) {
                menu.push('peak_hr');
            }
            if (cadenceStream) {
                menu.push('peak_cadence');
            }
            if (altStream && distance) {
                menu.push('peak_vam');
            }
            if (!menu.length) {
                return;
            }
            const panel = new PeakEffortsPanel({
                menu,
                renderAttrs: source => {
                    const rows = [];
                    const attrs = {};
                    const periodRanges = ns.allPeriodRanges.filter(x => x.value <= activeTime);
                    const distRanges = ns.allDistRanges.filter(x => x.value <= distance);
                    if (['peak_power', 'peak_sp', 'peak_power_wkg'].includes(source)) {
                        let dataStream;
                        if (source === 'peak_sp') {
                            dataStream = _getStream('watts_sealevel');
                            attrs.isWattEstimate = true;
                        } else {
                            dataStream = wattsStream;
                            attrs.isWattEstimate = isWattEstimate;
                        }
                        const prefix = attrs.isWattEstimate ? '~' : '';
                        const ranges = periodRanges.filter(x =>
                            !attrs.isWattEstimate || x.value >= minWattEstTime);
                        for (const range of ranges) {
                            const roll = sauce.power.peakPower(range.value, timeStream, dataStream,
                                {activeStream});
                            if (roll) {
                                if (source === 'peak_power_wkg') {
                                    const native = roll.avg() / ns.weight;
                                    const value = prefix + native.toFixed(1);
                                    rows.push(_rangeRollToRow({range, roll, native, value, unit: 'w/kg'}));
                                } else {
                                    const native = roll.avg();
                                    const value = prefix + H.number(native);
                                    rows.push(_rangeRollToRow({range, roll, native, value, unit: 'w'}));
                                }
                            }
                        }
                    } else if (source === 'peak_pace' || source === 'peak_gap') {
                        attrs.isDistanceRange = true;
                        const dataStream = {
                            peak_pace: distStream,
                            peak_gap: gradeDistStream
                        }[source];
                        const unit = ns.paceFormatter.shortUnitKey();
                        for (const range of distRanges) {
                            const roll = sauce.pace.bestPace(range.value, timeStream, dataStream);
                            if (roll) {
                                const native = roll.avg();
                                const value = humanPace(native);
                                rows.push(_rangeRollToRow({range, roll, native, value, unit}));
                            }
                        }
                    } else if (source === 'peak_np' || source === 'peak_xp') {
                        const calcs = {
                            peak_np: {peakSearch: sauce.power.peakNP, rollMethod: 'np'},
                            peak_xp: {peakSearch: sauce.power.peakXP, rollMethod: 'xp'},
                        }[source];
                        for (const range of periodRanges.filter(x => x.value >= minPowerPotentialTime)) {
                            const roll = calcs.peakSearch(range.value, timeStream, wattsStream,
                                {activeStream});
                            // Use external NP/XP method for consistency.  There are tiny differences because
                            // the peak functions use a continuous rolling avg vs the external method that
                            // only examines the trimmed date set.
                            const native = roll && roll[calcs.rollMethod].call(roll, {external: true});
                            if (native) {
                                const value = H.number(native);
                                rows.push(_rangeRollToRow({range, roll, native, value, unit: 'w'}));
                            }
                        }
                    } else if (source === 'peak_hr') {
                        const unit = L.hrFormatter.shortUnitKey();
                        for (const range of periodRanges) {
                            const roll = sauce.data.peakAverage(range.value, timeStream, hrStream,
                                {ignoreZeros: true, active: true, activeStream});
                            if (roll) {
                                const native = roll.avg();
                                const value = H.number(native);
                                rows.push(_rangeRollToRow({range, roll, native, value, unit}));
                            }
                        }
                    } else if (source === 'peak_cadence') {
                        const unit = ns.cadenceFormatter.shortUnitKey();
                        for (const range of periodRanges) {
                            const roll = sauce.data.peakAverage(range.value, timeStream, cadenceStream,
                                {ignoreZeros: true, active: true, activeStream});
                            if (roll) {
                                const native = roll.avg();
                                const value = ns.cadenceFormatter.format(native);
                                rows.push(_rangeRollToRow({range, roll, native, value, unit}));
                            }
                        }
                    } else if (source === 'peak_vam') {
                        const vamStream = sauce.geo.createVAMStream(timeStream, altStream);
                        for (const range of periodRanges.filter(x => x.value >= minVAMTime)) {
                            const roll = sauce.data.peakAverage(range.value, timeStream, vamStream,
                                {active: true, activeStream});
                            if (roll) {
                                const native = roll.avg();
                                const value = H.number(native);
                                rows.push(_rangeRollToRow({range, roll, native, value, unit: 'Vm/h'}));
                            }
                        }
                    }
                    return {rows, ...attrs};
                }
            });
            attachInfo(panel.$el);
            await panel.render();
            ns.afterSyncActivity.then(() => panel.render());  // Only runs if we needed a sync.
        }
    }


    function onMobileNavClickaway(ev) {
        if (!ev.target.closest('nav.sidenav')) {
            ev.stopImmediatePropagation();  // noops menu-expander listener.
            ev.preventDefault();  // Prevent background page from taking action
        } else if (!ev.target.closest('a')) {
            return;  // ignore non link clicks in the menu.
        }
        toggleMobileNavMenu();
    }


    function toggleMobileNavMenu() {
        const expandedClass = 'sauce-nav-expanded';
        const expanded = document.body.classList.contains(expandedClass);
        const evOptions = {capture: true, passive: false};
        if (expanded) {
            removeEventListener('click', onMobileNavClickaway, evOptions);
            document.body.classList.remove(expandedClass);
        } else {
            document.body.classList.add(expandedClass);
            addEventListener('click', onMobileNavClickaway, evOptions);
        }
    }


    function attachInfo($el) {
        function placeInfo(isMobile) {
            if (isMobile) {
                const parent = document.getElementById('heading');
                parent.insertAdjacentElement('afterend', $el[0]);
            } else {
                const before = document.getElementById('pagenav');
                before.insertAdjacentElement('afterend', $el[0]);
            }
        }
        if (!sauce.options['responsive']) {
            placeInfo(false);
        } else {
            // Monitor for window resize with a media query that matches the mobile
            // css media query..
            mobileMedia.addListener(ev => void placeInfo(ev.matches));
            placeInfo(mobileMedia.matches);
        }
    }


    async function attachSyncToggle($el) {
        const $btn = await sauce.sync.createSyncButton(ns.athlete.id, {
            gender: ns.athlete.get('gender') === 'F' ? 'female' : 'male',
            name: ns.athlete.get('display_name'),
        });
        $btn.addClass('button').removeClass('btn');
        jQuery('#heading header .social').prepend($btn);
    }


    function humanPace(raw, options={}) {
        return H.pace(raw, {type: ns.paceType, ...options});
    }


    function changeToAnalysisView(startTime, endTime) {
        const startIdx = getStreamTimeIndex(startTime);
        const endIdx = getStreamTimeIndex(endTime);
        if (startIdx != null && endIdx != null) {
            pageView.router().changeMenuTo(`analysis/${startIdx}/${endIdx}`);
        } else {
            pageView.router().changeMenuTo(`analysis`);
        }
        const chart = document.querySelector('#basic-analysis section.chart');
        if (chart) {
            const $collapsables = jQuery('.collapsable');
            if ($collapsables.queue().length) {
                // Run after animation completes..
                $collapsables.queue(next => {
                    next();
                    chart.scrollIntoView({behavior: 'smooth', block: 'center'});
                });
            } else {
                chart.scrollIntoView({behavior: 'smooth', block: 'center'});
            }
        }
    }


    let _currentInfoDialog;
    async function createInfoDialog(options) {
        if (_currentInfoDialog) {
            closeCurrentInfoDialog();
        } else if (_currentInfoDialog === undefined) {
            /* First usage; wire click-away detection to close open dialog. */
            jQuery(document).on('pointerdown', ev => {
                if (_currentInfoDialog && ev.target.isConnected) {
                    const $root = _currentInfoDialog.closest('.ui-dialog');
                    if (!jQuery(ev.target).closest($root).length) {
                        closeCurrentInfoDialog();
                    }
                }
            });
        }
        const $dialog = sauce.ui.dialog({
            title: `${options.heading}: ${options.label}`,
            icon: await sauce.ui.getImage(ns.peakIcons[options.source]),
            dialogClass: 'sauce-info-dialog',
            body: options.body,
            flex: true,
            resizable: false,
            autoOpen: false, // Defer till after graph render so position is correct
            closeOnMobileBack: ns.isMobile,
            position: {
                my: 'left center',
                at: 'right center',
                of: options.originEl
            },
            extraButtons: [{
                text: await LM('title'),
                click: () => {
                    $dialog.dialog('close');
                    changeToAnalysisView(options.start, options.end);
                },
            }]
        });
        $dialog.find('.start_time_link').on('click',() => {
            $dialog.dialog('close');
            changeToAnalysisView(options.start, options.end);
        });
        $dialog.on('dialogclose', () => {
            options.originEl.classList.remove('selected');
            if ($dialog === _currentInfoDialog) {
                _currentInfoDialog = null;
            }
            $dialog.dialog('destroy');
        });
        _currentInfoDialog = $dialog;
        options.originEl.classList.add('selected');
        return $dialog;
    }


    function closeCurrentInfoDialog() {
        const $d = _currentInfoDialog;
        if ($d) {
            _currentInfoDialog = null;
            $d.dialog('close');
        }
    }


    async function fetchGradeDistStream(options) {
        options = options || {};
        if (ns.activityType !== 'run') {
            return;
        }
        if (options.startTime != null && options.endTime != null) {
            return await fetchStreamTimeRange('grade_adjusted_distance', options.startTime,
                options.endTime);
        } else {
            return await fetchStream('grade_adjusted_distance', options.start, options.end);
        }
    }


    const _correctedRolls = new Map();
    async function correctedRollTimeRange(stream, wallStartTime, wallEndTime, options) {
        const key = stream;
        if (!_correctedRolls.has(key)) {
            let fullStream = await fetchStream(stream);
            if (!fullStream && stream === 'watts') {
                stream = 'watts_calc';
                fullStream = await fetchStream(stream);
            }
            if (fullStream) {
                let roll;
                const timeStream = _getStream('time');
                const activeStream = _getStream('active');
                if (stream.startsWith('watts')) {
                    roll = sauce.power.correctedPower(timeStream, fullStream,
                        {activeStream, ...options});
                } else {
                    roll = sauce.data.correctedAverage(timeStream, fullStream,
                        {activeStream, ...options});
                }
                if (roll) {
                    roll.isEstimate = ['watts_calc', 'watts_sealevel'].includes(stream);
                    _correctedRolls.set(key, roll);
                }
            }
        }
        if (_correctedRolls.has(key)) {
            const roll = _correctedRolls.get(key);
            const range = roll.slice(wallStartTime, wallEndTime);
            range.isEstimate = roll.isEstimate;
            return range;
        }
    }


    function isVirtual() {
        const type = pageView.activity().get('detailedType');
        return type && !!type.match(/Virtual/);
    }


    function getOverlappingSegments(start, end, threshold=0.1) {
        const segEfforts = pageView.segmentEfforts && pageView.segmentEfforts();
        if (!segEfforts) {
            return [];
        }
        const overlapping = [];
        for (const segment of segEfforts.models) {
            const [segStart, segEnd] = pageView.chartContext().convertStreamIndices(segment.indices());
            const overlap = sauce.data.overlap([start, end], [segStart, segEnd]);
            if (overlap) {
                const segLength = segEnd - segStart + 1;
                const correlation = overlap / segLength;
                if (correlation >= threshold) {
                    overlapping.push({overlap, correlation, segment});
                }
            }
        }
        overlapping.sort((a, b) => b.correlation === a.correlation ?
            (b.overlap < a.overlap ? -1 : 1) : (b.correlation < a.correlation ? -1 : 1));
        overlapping.sort((a, b) => b.segment.get('start_index') < a.segment.get('start_index') ? 1 : -1);
        return overlapping;
    }


    function hslValueGradientSteps(thresholds, {hStart, hEnd, sStart, sEnd, lStart, lEnd}) {
        const steps = [];
        if (hStart == null || sStart == null || lStart == null) {
            throw new Error("HSL start args required");
        }
        hEnd = hEnd == null ? hStart : hEnd;
        sEnd = sEnd == null ? sStart : sEnd;
        lEnd = lEnd == null ? lStart : lEnd;
        const count = thresholds.length;
        for (let i = 0; i < count; i++) {
            const pct = i / (count - 1);
            const h = Math.round(hStart + ((hEnd - hStart) * pct));
            const s = Math.round(sStart + ((sEnd - sStart) * pct));
            const l = Math.round(lStart + ((lEnd - lStart) * pct));
            steps.push({
                value: thresholds[i],
                color: `hsl(${h}deg, ${s}%, ${l}%)`
            });
        }
        return steps;
    }


    const _activeGraphs = new Set();
    let _lastInfoDialogSource;
    async function showInfoDialog({startTime, endTime, wallStartTime, wallEndTime, label, range,
        source, originEl, isDistanceRange}) {
        const powerRoll = await correctedRollTimeRange('watts', wallStartTime, wallEndTime);
        const elapsedTime = wallEndTime - wallStartTime;
        const streams = {
            time: await fetchStreamTimeRange('time', startTime, endTime),
            distance: await fetchStreamTimeRange('distance', startTime, endTime),
            altitude: await fetchSmoothStreamTimeRange('altitude', null, startTime, endTime),
            velocity_smooth: await fetchStreamTimeRange('velocity_smooth', startTime, endTime),
        };
        if (!streams.velocity_smooth) {
            const paceStream = await fetchStreamTimeRange('pace', startTime, endTime);
            streams.velocity_smooth = paceStream.map(x => 1 / x);
        }
        const cadenceRoll = await correctedRollTimeRange('cadence', wallStartTime, wallEndTime,
            {active: true, ignoreZeros: true});
        const hrRoll = await correctedRollTimeRange('heartrate', wallStartTime, wallEndTime,
            {active: true, ignoreZeros: true});
        const tempStream = await fetchStreamTimeRange('temp', startTime, endTime);
        const distance = streamDelta(streams.distance);
        const startIdx = getStreamTimeIndex(startTime);
        const endIdx = getStreamTimeIndex(endTime);
        if (ns.activityType === 'run') {
            streams.grade_adjusted_distance = streams.distance &&
                await fetchGradeDistStream({startTime, endTime});
        }
        const heading = await LM(source);
        const template = await getTemplate('info-dialog.html');
        const cadence = cadenceRoll && cadenceRoll.avg();
        const activeTime = getActiveTime(startIdx, endIdx);
        let stride;
        if (cadence &&
            (ns.cadenceFormatter.key === 'step_cadence' ||
             ns.cadenceFormatter.key === 'swim_cadence')) {
            stride = distance / activeTime / (cadence * 2 / 60);
        }
        const supportsRanks = ns.syncAthlete && sourcePeakTypes[source] &&
            (!['peak_pace', 'peak_gap'].includes(source) || pageView.isRun());
        const overlappingSegments = getOverlappingSegments(startIdx, endIdx);
        const hasSegments = overlappingSegments && overlappingSegments.length;
        const body = await template({
            startsAt: wallStartTime,
            elapsed: elapsedTime,
            power: powerRoll && powerData(powerRoll, streams.altitude, {
                max: sauce.data.max(powerRoll.values()),
                np: supportsNP() ? powerRoll.np() : null,
                xp: supportsXP() ? powerRoll.xp() : null,
                estimate: powerRoll.isEstimate,
                activeTime,
            }),
            pace: distance && {
                avg: 1 / (distance / elapsedTime),
                max: 1 / sauce.data.max(streams.velocity_smooth),
                gap: streams.grade_adjusted_distance &&
                    (1 / (streamDelta(streams.grade_adjusted_distance) / elapsedTime)),
            },
            hr: hrRoll && {
                min: sauce.data.min(hrRoll.values().filter(x => +x)),
                avg: hrRoll.avg(),
                max: sauce.data.max(hrRoll.values()),
            },
            elevation: elevationData(streams.altitude, elapsedTime, distance),
            cadence,
            distance,
            stride,
            temp: sauce.data.avg(tempStream), // XXX check gap handling
            hrUnit: L.hrFormatter.shortUnitKey(),
            elevationUnitLong: L.elevationFormatter.longUnitKey(),
            paceUnit: ns.paceFormatter.shortUnitKey(),
            source,
            supportsRanks,
            isSpeed: ns.paceMode === 'speed',
            isDistanceRange,
            overlappingSegments,
            hasSegments,
        });
        const $dialog = await createInfoDialog({heading, label, source, body, originEl,
            start: startTime, end: endTime});
        const $sparkline = $dialog.find('.sauce-sparkline');
        async function renderGraphs() {
            const graphs = [];
            for (const x of _activeGraphs) {
                if (x === 'power') {
                    const watts = powerRoll.values();
                    if (source === 'peak_power_wkg') {
                        graphs.push('power_wkg');
                        streams['watts_kg'] = watts.map(x => x / ns.weight);
                    } else {
                        graphs.push('power');
                        streams['watts'] = watts;
                    }
                } else if (x === 'sp') {
                    graphs.push('sp');
                    const spRoll = await correctedRollTimeRange('watts_sealevel', wallStartTime, wallEndTime);
                    streams.watts_seapower = spRoll.values();
                } else if (x === 'pace') {
                    graphs.push('pace');
                } else if (x === 'cadence') {
                    graphs.push('cadence');
                    streams.cadence = cadenceRoll.values();
                } else if (x === 'gap') {
                    graphs.push('gap');
                } else if (x === 'hr') {
                    graphs.push('hr');
                    streams.heartrate = hrRoll.values();
                } else if (x === 'vam') {
                    graphs.push('vam');
                } else if (x === 'elevation') {
                    graphs.push('elevation');
                }
            }
            await sauce.ui.createStreamGraphs($sparkline, {
                streams,
                graphs,
                width: 300,
                height: 64,
                paceType: ns.paceType,
                activityType: ns.activityType,
            });
        }
        let ranksLoaded;
        async function loadRanks(filter) {
            ranksLoaded = true;
            const id = pageView.activity().id;
            const type = sourcePeakTypes[source];
            const [getPeaks, actArg] = ns.syncActivity ?
                [sauce.hist.getPeaksRelatedToActivity, ns.syncActivity] :
                [sauce.hist.getPeaksRelatedToActivityId, id];
            const peaks = await getPeaks(actArg, type, [range],
                {filter, limit: 10, expandActivities: true});
            if (!peaks || !peaks.length || !supportsPeaksRanks(type)) {
                if (!hasSegments) {
                    $dialog.find('.empty-message').removeClass('hidden');
                }
                return false;
            }
            const paceUnit = L.paceFormatter.shortUnitKey();
            const locale = {
                power_wkg: {unit: 'w/kg', fmt: x => x.toFixed(1)},
                power: {unit: 'w', fmt: H.number},
                np: {unit: 'w', fmt: H.number},
                xp: {unit: 'w', fmt: H.number},
                hr: {unit: L.hrFormatter.shortUnitKey(), fmt: H.number},
                pace: {unit: paceUnit, fmt: H.pace},
                gap: {unit: paceUnit, fmt: H.pace},
            }[type];
            let split;
            const $section = $dialog.find('section.ranks');
            $section.find('table tbody').html(peaks.map((x, i) => {
                let markSplit;
                if (!split && i !== x.rank - 1) {
                    markSplit = (split = true);
                }
                const titleExtra = x.activity.description ? '\n\n' + x.activity.description : '';
                return `
                    <tr class="${markSplit ? 'split' : ''} ${x.activity.id === id ? 'self' : ''}">
                        <td class="rank">${x.rank}</td>
                        <td>${locale.fmt(x.value)}<abbr class="short unit">${locale.unit}</abbr></td>
                        <td class="activity-name">
                            <a href="/activities/${x.activity.id}/analysis/${x.start}/${x.end}"
                               title="${x.activity.name}${titleExtra}">${x.activity.name}</a>
                        </td>
                        <td class="date">${H.date(x.activity.ts)}</td>
                    </tr>
                `;
            }).join(''));
            $section.removeClass('hidden');
        }
        if ((await sauce.storage.getPref('expandInfoDialog')) || ns.isMobile) {
            $dialog.addClass('expanded');
            if (supportsRanks) {
                loadRanks('all');  // bg okay
            }
        }
        $dialog.on('click', '.expander', async () => {
            const expanded = $dialog[0].classList.toggle('expanded');
            await sauce.storage.setPref('expandInfoDialog', expanded);
            if (expanded && supportsRanks && !ranksLoaded) {
                await loadRanks('all');
            }
        });
        $dialog.on('click', 'section.ranks .btn-group.rank-filter .btn', async ev => {
            const $btn = jQuery(ev.currentTarget);
            $btn.siblings().removeClass('btn-secondary');
            $btn.addClass('btn-secondary');
            await loadRanks($btn.data('filter'));
        });
        $dialog.on('click', '.selectable', async ev => {
            const graph = ev.currentTarget.dataset.graph;
            const selected = ev.currentTarget.classList.toggle('selected');
            if (selected) {
                _activeGraphs.add(graph);
            } else {
                _activeGraphs.delete(graph);
            }
            await renderGraphs();
        });
        $dialog.on('click', '.segments a[data-id]', ev => {
            $dialog.dialog('close');
            pageView.router().changeMenuTo(`segments/${ev.currentTarget.dataset.id}`);
        });
        if (source !== _lastInfoDialogSource) {
            _activeGraphs.clear();
            _activeGraphs.add({
                peak_power: 'power',
                peak_power_wkg: 'power',
                peak_np: 'power',
                peak_xp: 'power',
                peak_sp: 'sp',
                peak_pace: 'pace',
                peak_gap: 'gap',
                peak_hr: 'hr',
                peak_cadence: 'cadence',
                peak_vam: 'vam',
            }[source]);
            _lastInfoDialogSource = source;
        }
        for (const x of $dialog.find('.selectable[data-graph]')) {
            if (_activeGraphs.has(x.dataset.graph)) {
                x.classList.add('selected');
            }
        }
        await renderGraphs();
        $dialog.dialog('open');
        return $dialog;
    }


    async function showPeaksSettingsDialog() {
        const {PeaksPeriodsView, PeaksDistancesView} = await import(sauce.getURL('/src/site/data-views.mjs'));
        const periods = new PeaksPeriodsView({ranges: await sauce.peaks.getRanges('periods')});
        const dists = new PeaksDistancesView({ranges: await sauce.peaks.getRanges('distances')});
        let reload;
        periods.on('save', () => void (reload = true));
        dists.on('save', () => void (reload = true));
        const template = await getTemplate('peaks-settings.html');
        const $modal = await sauce.ui.modal({
            title: await LM('peaks_settings_dialog_title'),
            flex: true,
            autoOpen: false,
            width: '45em',
            dialogClass: 'sauce-peaks-settings-dialog',
            body: await template({
                isPeriodsDefault: await sauce.peaks.isCustom('periods'),
                isDistsDefault: await sauce.peaks.isCustom('distances'),
            }),
        });
        await periods.render();
        await dists.render();
        $modal.find('.periods').prepend(periods.$el);
        $modal.find('.dists').prepend(dists.$el);
        $modal.on('click', '.btn.reset', async ev => {
            if (ev.currentTarget.dataset.id === 'periods') {
                periods.ranges = sauce.peaks.defaults.periods;
                periods.$el.removeClass('dirty');
                await sauce.peaks.resetRanges('periods');
                await periods.render();
            } else {
                dists.ranges = sauce.peaks.defaults.distances;
                dists.$el.removeClass('dirty');
                await sauce.peaks.resetRanges('distances');
                await dists.render();
            }
            ev.currentTarget.classList.add('hidden');
            reload = true;
        });
        $modal.on('dialogclose', ev => {
            if (reload) {
                if (ns.syncAthlete) {
                    sauce.hist.invalidateSyncState('local', 'peaks');  // bg required
                }
                sauce.ui.modal({
                    title: 'Reloading...',
                    body: '<b>Reloading page to reflect changes.</b>'
                });
                location.reload();
            }
        });
        $modal.dialog('open');
    }


    async function updateSideNav() {
        const pageNav = document.querySelector('ul#pagenav');
        // Add an analysis link to the nav if not there already.
        if (pageNav.querySelector('li:not(.sauce-stub) [data-menu="analysis"]')) {
            return;
        }
        const id = pageView.activity().id;
        const a = pageNav.querySelector('[data-menu="analysis"]');
        a.setAttribute('href', `/activities/${id}/analysis`);
        a.textContent = await LM('title');
        a.parentNode.classList.remove('sauce-stub');
        a.parentNode.style.display = null;
        const premiumGroup = pageNav.querySelector('#premium-views');
        if (premiumGroup) {
            // This is were things get tricky...
            // Strava shows the word "Subscription" (localized) for the menu heading of
            // premium member's activities ONLY for rides.  For runs, it uses the locale
            // translation of "Analysis".  This makes our job of re-adding the analysis
            // link more difficult because we don't want the menu to repeat the word "Analysis".
            // So for Runs we make their menu structure look like a rides, and add our analysis
            // menu entry as if it was born there.  If Strava changes their menu structure this will
            // surely be a problem.
            if (pageView.activity().isRun()) {
                const titleEl = premiumGroup.querySelector('.title');
                titleEl.classList.add('small');
                titleEl.innerText = await L.getMessage('subscription');
            }
        }
    }


    async function getTemplate(filename, localeKey) {
        return await sauce.template.getTemplate(filename, localeKey || 'analysis');
    }


    async function attachActionMenuItems() {
        const exportLocale = await L.getMessage('export');
        const $menu = jQuery('nav.sidenav .actions-menu .drop-down-menu ul.options');
        if (!$menu.length) {
            console.warn('Side nav menu not found: Probably a flagged activity');
            return;
        }
        jQuery("body").append(jQuery(`
            <dialog id="sauce-export-dialog">
                <div>
                    Activity start time:
                </div>
                <input type="datetime-local" class="export-time-picker"/>
                <button class="sauce-export-dialog-export">Export</button>
                <button autofocus class="sauce-export-dialog-close">Close</button>
            </dialog>
        `));
        const $exportDialog = jQuery("#sauce-export-dialog");
        $exportDialog.find(".sauce-export-dialog-close").on("click", async () => {
            $exportDialog[0].close();
        });
        
        $menu.append(jQuery(`
            <li class="sauce-group">
                <div class="sauce-header">
                    <div class="sauce-title">SAUCE</div>
                    <img src="${sauce.getURL('images/logo_horiz_320x120.png')}"/>
                </div>
                <ul>
                    <li><a title="TCX files are best for activities with power data (watts)."
                           class="tcx">${exportLocale} TCX</a></li>
                    <li><a title="FIT files are compact binary files for advanced use-cases."
                           class="fit">${exportLocale} FIT</a></li>
                </ul>
            </li>
        `));

        async function handleExportDialog(exportFn) {
            $exportDialog[0].showModal();
            $exportDialog.find(".sauce-export-dialog-export").off().on("click", async () => {
                const $timePicker = $exportDialog.find(".export-time-picker");
                const pickerStartTime = new Date($timePicker[0].value);
                exportFn(pickerStartTime);
                $exportDialog[0].close();
            });
        }

        async function getLaps() {
            const lapEfforts = pageView.lapEfforts();
            if (lapEfforts && !lapEfforts.length) {
                await new Promise(resolve => lapEfforts.fetch().always(resolve));
            }
            const context = pageView.chartContext();
            return (lapEfforts && lapEfforts.length) ?
                lapEfforts.models.map(x => context.convertStreamIndices(x.indices())) :
                null;
        }
        $menu.find('a.tcx').on('click', async () => {
            handleExportDialog(async function(pickerStartTime){
                const laps = await getLaps();
                exportActivity('tcx', {laps, pickerStartTime}).catch(console.error);
            });
        });
        $menu.find('a.fit').on('click', async () => {
            handleExportDialog(async function(pickerStartTime){
                const laps = await getLaps();
                exportActivity('fit', {laps, pickerStartTime}).catch(console.error);
            });
        });
        $menu.find('.sauce-group ul').append(jQuery(`
            <li><a title="NOTE: GPX files do not support power data (watts)."
                   class="gpx">${exportLocale} GPX</a></li>
        `));
        $menu.find('a.gpx').on('click', async () => {
            handleExportDialog(async function(pickerStartTime){
                const laps = await getLaps();
                exportActivity('gpx', {laps, pickerStartTime}).catch(console.error);
            });
        });
    }


    function attachRankBadgeDialog() {
        jQuery('body').on('click', 'img.sauce-rank', async ev => {
            closeCurrentInfoDialog();
            const powerProfileTpl = await getTemplate('power-profile-help.html');
            const $dialog = sauce.ui.modal({
                title: 'Power Profile Badges Explained',
                body: await powerProfileTpl(),
                closeOnMobileBack: ns.isMobile,
                width: 700
            });
            const times = [];
            for (let i = 5; i < 3 * 3600; i *= 1.005) {
                times.push(i);
            }
            const requirements = {
                male: times.map(x => sauce.power.rankRequirements(x, 'male')),
                female: times.map(x => sauce.power.rankRequirements(x, 'female'))
            };
            const $levelSelect = $dialog.find('select#sauce-rank-level');
            const $genderSelect = $dialog.find('select#sauce-rank-gender');
            const $graph = $dialog.find('.rank-graph');
            const wattsTooltip = wkg =>
                ns.weight ? ` | ${H.number(wkg * ns.weight)}<abbr class="unit short">W</abbr>` : '';
            function drawGraph() {
                const gender = $genderSelect.val();
                const level = Number($levelSelect.val());
                const minPct = level / 8;
                const maxPct = (level + 1) / 8;
                const maxData = requirements[gender].map(x => x.high);
                const chartRangeMax = sauce.data.max(maxData);
                const width = '100%';
                const height = 150;
                const chartRangeMin = 1.5;
                $graph.sparkline(requirements[gender].map(x => x.high), {
                    type: 'line',
                    width: '100%',
                    height: 150,
                    chartRangeMin,
                    chartRangeMax,
                    tooltipFormatter: (_, __, data) => {
                        const t = times[data.x];
                        const r = [`Duration: ${H.timer(t)}`];
                        const npRatio = sauce.power.rankWeightedRatio(t);
                        if (npRatio) {
                            r.push(`NP® weight: ${H.number(npRatio * 100)}%`);
                        }
                        return r.join('<br/>');
                    },
                });
                $graph.sparkline(requirements[gender].map(({high, low}) => (maxPct * (high - low)) + low), {
                    composite: true,
                    type: 'line',
                    width,
                    height,
                    lineColor: 'black',
                    fillColor: '#0007',
                    chartRangeMin,
                    chartRangeMax,
                    tooltipFormatter: (_, __, data) => {
                        const k = H.number(data.y, {fixed: true, precision: 1});
                        return `Top level: ${k}<abbr class="unit short">W/kg</abbr> ` +
                            wattsTooltip(data.y);
                    }
                });
                $graph.sparkline(requirements[gender].map(({high, low}) => (minPct * (high - low)) + low), {
                    composite: true,
                    type: 'line',
                    width,
                    height,
                    lineColor: 'black',
                    chartRangeMin,
                    chartRangeMax,
                    tooltipFormatter: (_, __, data) => {
                        const k = H.number(data.y, {fixed: true, precision: 1});
                        return `Bottom level: ${k}<abbr class="unit short">W/kg</abbr> ` +
                            wattsTooltip(data.y);
                    }
                });

            }
            const cat = ev.currentTarget.dataset.cat;
            const levelOption = $levelSelect.find(`option[data-cat="${cat}"]`)[0];
            if (levelOption) {
                levelOption.selected = true;
            }
            const genderOption = $genderSelect.find(`option[value="${ns.gender}"]`)[0];
            if (genderOption) {
                genderOption.selected = true;
            }
            $levelSelect.on('change', drawGraph);
            $genderSelect.on('change', drawGraph);
            $dialog.on('dialogresize', drawGraph);
            drawGraph();
        });
    }


    async function getEstimatedActivityStart() {
        // Activity start time is sadly complicated.  Despite being visible in the header
        // for all activities we only have access to it for rides and self-owned runs.  Trying
        // to parse the html might work for english rides but will fail for non-english users.
        const localTime = pageView.activity().get('startDateLocal') * 1000;
        if (localTime) {
            // Do a very basic tz correction based on the longitude of any geo data we can find.
            // Using a proper timezone API is too expensive for this use case.
            const geoStream = await fetchStream('latlng');
            let longitude;
            if (geoStream) {
                for (const [, lng] of geoStream) {
                    if (lng != null) {
                        longitude = lng;
                        console.info('Getting longitude of activity based on latlng stream');
                        break;
                    }
                }
            }
            if (longitude == null) {
                // Take a wild guess that the activity should match the geo location of the athlete.
                const athleteGeo = ns.athlete.get('geo');
                if (athleteGeo && athleteGeo.lat_lng) {
                    longitude = athleteGeo.lat_lng[1];
                    console.info('Getting longitude of activity based on athlete\'s location');
                }
            }
            let offset = 0;
            if (longitude != null) {
                offset = Math.round((longitude / 180) * (24 / 2)) * 3600000;
                console.info('Using laughably bad timezone correction:', offset);
            }
            return new Date(localTime - offset);  // Subtract offset to counteract the localtime.
        }
        // Sadly we would have to resort to HTML scraping here. Which for now, I won't..
        console.info('No activity start date could be acquired');
        return new Date();
    }

    async function exportActivity(type, {pickerStartTime, start, end, laps}) {
        const streamTypes = ['time', 'watts', 'heartrate', 'altitude', 'active',
                             'cadence', 'temp', 'latlng', 'distance', 'velocity_smooth'];
        const streams = (await fetchStreams(streamTypes)).reduce((acc, x, i) =>
            (acc[streamTypes[i]] = x && x.slice(start, end != null ? end + 1 : end), acc), {});
        if (!streams.watts) {
            streams.watts = await fetchStream('watts_calc');
        }
        const fullActivity = await fetchFullActivity();
        const realStartTime = fullActivity && fullActivity.get('start_time');
        let date;
        if (realStartTime) {
            date = new Date(realStartTime);
        } else if (!isNaN(pickerStartTime)) {
            date = pickerStartTime;
        } else {
            date = await getEstimatedActivityStart();
        }
        // Name and description are not available in the activity model for other users..
        let name = document.querySelector('#heading .activity-name').textContent.trim();
        if (start) {
            name += ` [selection ${start}-${end}]`;
        }
        const descEl = document.querySelector('#heading .activity-description .content');
        const desc = descEl && descEl.textContent;
        const exportModule = await import(sauce.getURL('/src/common/export.mjs'));
        const Serializer = {
            tcx: exportModule.TCXSerializer,
            gpx : exportModule.GPXSerializer,
            fit : exportModule.FITSerializer,
        }[type];
        const a = pageView.activityAthlete();
        const athlete =  {
            name: a.get('display_name'),
            weight: ns.weight,
            gender: ns.gender,
        };
        const serializer = new Serializer({name, desc, type: ns.activityType, date, laps, athlete});
        serializer.start();
        serializer.loadStreams(streams);
        sauce.ui.downloadBlob(serializer.toFile());
    }


    async function attachComments() {
        const commentsTpl = await getTemplate('comments.html');
        const feedTpl = await getTemplate('comments-feed.html');
        const newCommentsHack = [];
        const $comments = jQuery(await commentsTpl());
        async function render() {
            let comments;
            const reactNode = document.querySelector('[data-react-class="ADPKudosAndComments"]');
            if (reactNode) {
                for (const [k, v] of Object.entries(reactNode)) {
                    if (k.startsWith('__reactContainere$')) {
                        if (v && v.alternate && v.alternate.child && v.alternate.child.memoizedProps) {
                            comments = v.alternate.child.memoizedProps.comments;
                        }
                        break;
                    }
                }
            } else {
                // Legacy method.  Still kinda works but I expect it to disappear.
                comments = pageView.commentsController().hash;
            }
            comments = (comments || []).concat(newCommentsHack);
            if (comments.length) {
                const data = comments.map(x => ({
                    comment: x.comment,
                    athlete: x.athlete,
                    date: new Date(jQuery(x.timestamp).attr('datetime')),
                }));
                $comments.find('.sauce-comments-feed').html((await feedTpl({comments: data})).trim());
            }
        }
        pageView.commentsController().on('commentCreated', async comment => {
            // Convert legacy format to a html string.
            newCommentsHack.push({
                comment: comment.comment.reduce((agg, x) => {
                    if (x.type === 'mention_token') {
                        return agg + `<a href="${x.path}">${x.text}</a>`;
                    } else {
                        return agg + x.text;
                    }
                }, ''),
                athlete: comment.athlete,
                timestamp: comment.timestamp,
            });
            await render();
        });
        jQuery('.activity-summary').append($comments);
        // Inject the react based mentionable-comment component...
        $comments.on('submit', 'form', ev => {
            ev.preventDefault();
            const $input = $comments.find('form input[name="comment"]');
            const comment = $input.val();
            if (!comment) {
                return;
            }
            pageView.commentsController().comment('Activity', pageView.activity().id, comment);
            $input.val('');
        });
        await render();
    }


    function attachSegmentToolHandlers() {
        const segView = '.segment-effort-detail-view';
        jQuery(document).on('click', `${segView} .sauce-button.live-segment`, async ev => {
            const id = ev.currentTarget.dataset.segmentId;
            const details = pageView.segmentEffortDetails().get(id);
            await showLiveSegmentDialog(details);
        });
        jQuery(document).on('click', `${segView} .sauce-button.perf-predictor`, ev => {
            const id = ev.currentTarget.dataset.segmentId;
            const details = pageView.segmentEffortDetails().get(id);
            const [start, end] = pageView.chartContext().convertStreamIndices(details.indices());
            showPerfPredictor(start, end);
        });
    }


    async function showLiveSegmentDialog(details, useTrial) {
        const locale = await L.getMessagesObject([
            'create', 'success_create_title', 'success_create_body1', 'success_create_body2',
            'success_create_body3', 'become_patron', 'remaining', 'use_trial', 'creator'
        ], 'live_segment');
        const template = await getTemplate('live-segment.html', 'live_segment');
        const athlete = pageView.activityAthlete();
        const [start, end] = pageView.chartContext().convertStreamIndices(details.indices());
        const timeStream = await fetchStream('time', start, end);
        let timeMultiplier = 1;
        const hasPatronRequirement = sauce.patronLevel >= 10;
        if (!hasPatronRequirement && sauce.isSafari()) {
            return;  // Apple Mac App Store requirement.
        }
        const trialCount = (!hasPatronRequirement &&
            await sauce.storage.get('live_segment_trial_count', {sync: true})) || 0;
        const maxTrials = 3;
        const icon = await sauce.ui.getImage('fa/trophy-duotone.svg');
        const body = await template({
            segmentName: details.get('name'),
            leaderName: athlete.get('display_name'),
            isSelf: athlete.id === pageView.currentAthlete().id,
            leaderTime: H.timer(streamDelta(timeStream)),
            hasPatronRequirement,
            useTrial,
        });
        let $dialog = undefined;
        const extraButtons = [];
        if (hasPatronRequirement || useTrial) {
            extraButtons.push({
                text: `${locale.create} Live Segment`,
                class: 'btn btn-primary',
                click: async () => {
                    const $form = $dialog.find('form');
                    await createLiveSegment({
                        // Avoid collision with strava ids so we can coexist
                        uuid: `sauce-${details.get('segment_id')}-${pageView.activity().id}`,
                        start,
                        end,
                        segmentName: $form.find('[name="segment-name"]').val(),
                        leaderName: $form.find('[name="leader-name"]').val(),
                        leaderType: $form.find('[name="leader-type"]').val(),
                        timeMultiplier
                    });
                    if (useTrial) {
                        await sauce.storage.set('live_segment_trial_count', trialCount + 1, {sync: true});
                    }
                    $dialog.dialog('destroy');
                    sauce.ui.modal({
                        title: locale.success_create_title,
                        icon,
                        body: `
                            ${locale.success_create_body1}<br/>
                            <br/>
                            ${locale.success_create_body2}<br/>
                            <br/>
                            <i>${locale.success_create_body3}</i>
                        `
                    });
                }
            });
        } else {
            if (trialCount < maxTrials) {
                extraButtons.push({
                    text: `${locale.use_trial} (${maxTrials - trialCount} ${locale.remaining})`,
                    class: 'btn btn-primary btn-outline',
                    click: async () => {
                        $dialog.dialog('destroy');
                        await showLiveSegmentDialog(details, /*useTrial*/ true);
                    }
                });
            }
            extraButtons.push({
                text: locale.become_patron,
                class: 'btn btn-primary',
                click: () => window.open('https://www.patreon.com/bePatron?u=32064618', '_blank')
            });
        }
        const trialTitle = useTrial ? ` - Trial ${trialCount + 1} / ${maxTrials}` : '';
        $dialog = sauce.ui.modal({
            title: `Live Segment ${locale.creator}${trialTitle}`,
            icon,
            body,
            flex: true,
            width: '40em',
            dialogClass: 'sauce-live-segment no-pad',
            extraButtons,
        });
        $dialog.on('input', 'input', () => {
            const speedAdj = Number($dialog.find(`[name="speed-adjust"]`).val());
            timeMultiplier = 1 - (speedAdj / 100);
            const adjustedTime = timeMultiplier * streamDelta(timeStream);
            $dialog.find('.leader-time').text(H.timer(adjustedTime));
        });
    }


    function addSegmentBadge(row) {
        const markCls = 'sauce-badge-mark';
        if (!ns.weight || row.classList.contains(markCls)) {
            return;
        }
        row.classList.add(markCls);
        const segment = pageView.segmentEfforts().getEffort(row.dataset.segmentEffortId);
        if (!segment) {
            console.warn('Segment data not found for:', row.dataset.segmentEffortId);
            return;
        }
        const rank = sauce.power.rank(segment.get('elapsed_time_raw'),
            segment.get('avg_watts_raw'), null, ns.weight, ns.gender);
        if (!rank || !rank.badge) {
            return;  // Too slow/weak
        }
        const targetTD = row.querySelector('.local-legend-col');
        const badgeHTML = `<img src="${rank.badge}" data-cat="${rank.cat}" class="sauce-rank" ` +
            `title="${rank.tooltip}"/>`;
        if (targetTD.innerHTML) {
            jQuery(targetTD).html(`<div class="sauce-rank-holder">${targetTD.innerHTML}${badgeHTML}</div>`);
        } else {
            jQuery(targetTD).html(badgeHTML);
        }
    }


    function addSegmentScore(row) {
        const markCls = 'sauce-score-mark';
        if (row.classList.contains(markCls)) {
            return;
        }
        row.classList.add(markCls);
        const segment = pageView.segmentEfforts().getEffort(row.dataset.segmentEffortId);
        if (!segment) {
            console.warn('Segment data not found for:', row.dataset.segmentEffortId);
            return;
        }
        const score = segment.get('score');
        if (typeof score === 'number') {
            jQuery(row.querySelector(':scope > td.starred-col')).append(
                `<div class="sauce-segment-score"
                      title="Segment popularity score">${score.toLocaleString()}</div>`);
        }
    }


    async function addSegmentBadges() {
        if (!ns.weight) {
            return;
        }
        await _localeInit;
        const rows = Array.from(document.querySelectorAll('table.segments tr[data-segment-effort-id]'));
        rows.push.apply(rows, document.querySelectorAll('table.hidden-segments tr[data-segment-effort-id]'));
        for (const row of rows) {
            try {
                addSegmentBadge(row);
            } catch(e) {
                console.error('Add segment badge error:', e);
            }
        }
    }


    function addSegmentScores() {
        const rows = Array.from(document.querySelectorAll('table.segments tr[data-segment-effort-id]'));
        rows.push.apply(rows, document.querySelectorAll('table.hidden-segments tr[data-segment-effort-id]'));
        for (const row of rows) {
            try {
                addSegmentScore(row);
            } catch(e) {
                console.error('Add segment score error:', e);
            }
        }
    }


    function addTrailforksOverlay() {
        if (!document.querySelector('table.segments thead th.sauce-tf-col')) {
            const th = document.createElement('th');
            th.classList.add('sauce-tf-col');
            th.setAttribute('colspan', '2');
            const suffix = (document.documentElement.classList.contains('sauce-theme-dark')) ?
                '_darkmode.svg' : '.svg';
            sauce.ui.getImage(`trailforks_logo_horiz${suffix}`).then(x => jQuery(th).html(x));
            const nameCol = document.querySelector('table.segments thead th.name-col');
            if (!nameCol) {
                return;  // Unsupported activity type such as (https://www.strava.com/activities/4381573410)
            }
            nameCol.setAttribute('colspan', '1');
            nameCol.insertAdjacentElement('afterend', th);
        }
        const rows = Array.from(document.querySelectorAll(
            'table.segments > tbody > tr[data-segment-effort-id]'));
        for (const row of rows) {
            addTrailforksRow(row).catch(console.error);
        }
    }


    async function addTrailforksRow(row) {
        let tfCol = row.querySelector('td.sauce-tf-col');
        if (!tfCol) {
            tfCol = document.createElement('td');
            tfCol.classList.add('sauce-tf-col');
            const nameCol = row.querySelector('td.name-col');
            nameCol.insertAdjacentElement('afterend', tfCol);
        } else if (tfCol.dataset.done) {
            return;
        }
        const segment = pageView.segmentEfforts().getEffort(row.dataset.segmentEffortId);
        if (!segment) {
            console.warn('Segment data not found for:', row.dataset.segmentEffortId);
            return;
        }
        const descs = segment.get('tfDescs');
        if (!descs || !descs.length) {
            return;
        }
        tfCol.dataset.done = true;
        const tpl = await getTemplate('tf-segment-col.html');
        // Extract aggregate mappings of icons we will add so they can be sorted and stacked.
        // Otherwise the visual clutter is very bad for segments matching many trails.
        const aggDifMap = new Map();
        const aggCondMap = new Map();
        const aggStatusMap = new Map();
        for (const x of descs) {
            const t = x.trail;
            const tt = [`${t.title}`];
            if (t.expanded.difficulty) {
                aggDifMap.set(t.difficulty, [t.difficulty, t.expanded.difficulty]);
                tt.push(`   Difficulty: ${x.trail.expanded.difficulty.title}`);
            }
            if (t.expanded.condition) {
                aggCondMap.set(t.condition, [t.condition, t.expanded.condition]);
                tt.push(`   Condition: ${x.trail.expanded.condition.title}`);
            }
            if (t.expanded.status && t.expanded.status.class !== 'clear') {
                aggStatusMap.set(t.status, [t.status, t.expanded.status]);
                tt.push(`   Status: ${x.trail.expanded.status.title}`);
            }
            x.tooltip = tt.join('\n');
        }
        // Sort by prio and reduce to just the pretty values.
        const aggDif = Array.from(aggDifMap.values()).sort(([a], [b]) => b - a).map(x => x[1]);
        const aggCond = Array.from(aggCondMap.values()).sort(([a], [b]) => b - a).map(x => x[1]);
        const aggStatus = Array.from(aggStatusMap.values()).sort(([a], [b]) => a - b).map(x => x[1]);
        const $tf = jQuery(await tpl({
            mostDifficult: aggDif[0],
            worstCondition: aggCond[0],
            worstStatus: aggStatus[0],
            descs,
        }));
        $tf.on('click', async ev => {
            ev.stopPropagation();
            await showTrailforksModal(descs);
        });
        jQuery(tfCol).append($tf);
    }


    async function showTrailforksModal(descs) {
        const extUrlIcon = await sauce.ui.getImage('fa/external-link-duotone.svg');
        let tabs = undefined;
        function selectedTab() {
            for (const t of tabs) {
                if (t.selected) {
                    return t;
                }
            }
            throw new Error("No Selected Tab");
        }
        const $tfModal = sauce.ui.modal({
            title: `Trailforks Overviews`,
            dialogClass: 'trailforks-overviews no-pad',
            icon: `<img src="${sauce.getURL('images/trailforks-250x250.png')}"/>`,
            body: `
                <ul class="tabs">
                    ${descs.map(x => `
                        <li class="trail-${x.trail.id}">
                            <a class="tab">${x.trail.title}</a>
                        </li>
                    `).join('')}
                </ul>
                <div class="tf-overview"></div>
            `,
            width: 'min(80vw, 70em)',
            height: 600,
            flex: true,
            closeOnMobileBack: ns.isMobile,
            extraButtons: [{
                text: 'Refresh',
                click: () => selectedTab().renderer.refresh(),
            }, {
                html: `Add Trail Report ${extUrlIcon}`,
                click: () => {
                    const id = selectedTab().trailId;
                    window.open(`https://www.trailforks.com/contribute/report/?trailid=${id}`, '_blank');
                }
            }]
        });
        tabs = descs.map((desc, i) => ({
            selector: `li.trail-${desc.trail.id}`,
            trailId: desc.trail.id,
            renderer: new (self.Backbone.View.extend({
                select: () => void 0,
                unselect: () => void 0,
                show: async function(options) {
                    this.$el.children().detach();
                    if (!this.$reportEl) {
                        this.$reportEl = await this.asyncRender(options);
                    } else {
                        this.$el.append(this.$reportEl);
                    }
                },
                refresh: async function() {
                    const $old = this.$reportEl;
                    this.$reportEl = null;
                    await this.show({noCache: true});
                    $old.remove();
                },
                asyncRender: async function(options) {
                    const docClasses = document.documentElement.classList;
                    docClasses.add('sauce-loading');
                    try {
                        return await renderTFDetailedReport(desc.trail.id, this.$el, options);
                    } finally {
                        docClasses.remove('sauce-loading');
                    }
                }
            }))({el: $tfModal.find('.tf-overview')}),
            selected: i === 0
        }));
        const tc = new Strava.Ui.TabController(tabs, $tfModal.find('ul.tabs'), '.tf-overview');
        tc.render();
    }


    async function renderTFDetailedReport(id, $into, options) {
        const [trail, photos, videos, reports] = await Promise.all([
            sauce.trailforks.trail(id, options),
            sauce.trailforks.photos(id, Object.assign({maxCount: 20}, options)),
            sauce.trailforks.videos(id, Object.assign({maxCount: 20}, options)),
            sauce.trailforks.reports(id, Object.assign({maxAge: 182.5 * 86400 * 1000, maxCount: 6}, options))
        ]);
        const template = await getTemplate('tf-detailed-report.html', 'trailforks');
        const $el = jQuery(await template({
            trail,
            photos,
            videos,
            reports,
            distanceUnit: L.distanceFormatter.shortUnitKey(),
        }));
        $into.html($el);
        const altStream = trail.track.altitude.split(',').map(Number);
        const distStream = trail.track.distance.split(',').map(Number);
        const lats = trail.track.latitude.split(',');
        const lngs = trail.track.longitude.split(',');
        const latlngStream = lats.map((x, i) => [Number(x), Number(lngs[i])]);
        const map = createPolylineMap(latlngStream, $el.find('.map'));
        map.showGpxDownload(false);
        map.showCreateRoute(false);
        map.showPrivacyToggle(false);
        map.showFullScreenToggle(false);
        map.initializeMap();
        $el.on('dialogresize', () => void map.map.resize());
        $el.find('.elevation.sparkline').sparkline(altStream.map((x, i) => [distStream[i], x]), {
            type: 'line',
            width: '100%',
            height: '5em',
            lineColor: '#EA400DA0',
            fillColor: {
                type: 'gradient',
                opacity: 0.8,
                steps: hslValueGradientSteps([0, 3000],
                    {hStart: 120, hEnd: 160, sStart: 40, sEnd: 100, lStart: 60, lEnd: 20})
            },
            tooltipFormatter: (_, __, data) => {
                const [lat, lng] = latlngStream[data.offset];
                map.map.getRabbit(lat, lng);
                return [
                    // XXX localize
                    `Altitude: ${H.elevation(data.y, {suffix: true})}`,
                    `Distance: ${H.distance(data.x, {precision: 2})} ${L.distanceFormatter.shortUnitKey()}`
                ].join('<br/>');
            }
        });
        $el.on('click', 'a.tf-media.video', ev => {
            const id = ev.currentTarget.dataset.id;
            function videoModal({title, body}) {
                return sauce.ui.modal({
                    title,
                    body,
                    dialogClass: 'no-pad',
                    flex: true,
                    width: '80vw', // occlude cur dialog
                    height: 600,   // occlude cur dialog
                    autoDestroy: true  // Be sure to stop video playback.
                });
            }
            for (const v of videos) {
                if (v.id === id) {
                    if (v.video_type === 'pb') {
                        const sources = Object.entries(v.media).map(([res, url]) =>
                            `<source src="${url}"/>`);
                        videoModal({
                            title: v.title || trail.title,
                            body: `<video style="width: 100%; height: 100%;"
                                          controls>${sources.join('')}</video>`,
                        });
                    } else if (v.source === 'youtube') {
                        videoModal({
                            title: v.title || trail.title,
                            body: `
                                <iframe frameborder="0" allow="fullscreen" width="100%" height="100%"
                                        src="https://www.youtube.com/embed/${v.source_id}"></iframe>
                            `,
                        });
                    } else {
                        throw new TypeError('unsupported video type: ' + v.video_type);
                    }
                }
            }
        });
        let photosCollection;
        $el.on('click', 'a.tf-media.photo', async ev => {
            const id = ev.currentTarget.dataset.id;
            if (!photosCollection) {
                photosCollection = new Strava.Models.Photos(photos.map((x, i) => ({
                    caption_escaped: `${trail.title} (${i + 1}/${photos.length})`,
                    large: x.thumbs.l,
                    thumbnail: x.thumbs.s,
                    photo_id: x.id,
                    viewing_athlete_id: -1  // makes caption uneditable
                })));
            }
            if (!self.JST['#photo-lightbox-template']) {
                // Workaround for missing templates when activity doesn't have photos of its own.
                const tplResp = await sauce.fetch(`${tplUrl}/photo-lightbox-template-backup.html`);
                self.JST['#photo-lightbox-template'] = self._.template(await tplResp.text());
                self.JST['#reporting-modal-template'] =
                    self._.template('<div style="display: none;" id="reporting-modal"><form/></div>');
            }
            let selected;
            for (const photo of photosCollection.models) {
                if (photo.id === id) {
                    selected = photo;
                    break;
                }
            }
            const photoView = Strava.ExternalPhotos.Views.PhotoLightboxView.show(selected);
            photoView.$el.addClass('sauce-over-modal');
        });
        return $el;
    }


    function getActivityTS() {
        return (ns.syncActivity && ns.syncActivity.ts) ||
            pageView.activity().get('startDateLocal') * 1000;
    }


    let _loadingPowerCtrl = null;
    function loadPowerController() {
        if (_loadingPowerCtrl !== null) {
            return _loadingPowerCtrl;
        }
        const powerCtrl = (pageView.powerController && pageView.powerController()) ||
            (pageView.estPowerController && pageView.estPowerController());
        if (!powerCtrl) {
            _loadingPowerCtrl = undefined;
        } else {
            // Note: be careful with Deferred objects which have a `.then()` return value.
            _loadingPowerCtrl = new Promise(resolve =>
                powerCtrl.deferred.always(() => resolve())).then(() => {
                if (!powerCtrl.has('athlete_ftp') && !powerCtrl.has('athlete_weight')) {
                    powerCtrl.set(sauce.perf.inferPowerDataAthleteInfo(powerCtrl.attributes));
                }
                return powerCtrl;
            });
        }
        return _loadingPowerCtrl;
    }


    let _loadingAthletePowerData = null;
    function loadAthletePowerData(athleteId) {
        if (_loadingAthletePowerData !== null) {
            return _loadingAthletePowerData;
        }
        let ts = pageView.activity().get('startDateLocal');
        if (!ts) {
            const activityData = getActivityValuesViaSimilar(pageView.activityId());
            ts = activityData?.start_date;
        }
        if (!ts) {
            ts = Date.now() / 1000 | 0;
        }
        _loadingAthletePowerData = sauce.perf.fetchAthletePowerData(athleteId, ts).then(powerData =>
            powerData && sauce.perf.inferPowerDataAthleteInfo(powerData));
        return _loadingAthletePowerData;
    }


    async function getFTPInfo(athleteInfo) {
        if (ns.syncAthlete) {
            // XXX this is a weak integration for now.  Will need complete overhaul...
            const dbFTP = ns.syncAthlete.getFTPAt(getActivityTS());
            if (dbFTP) {
                return {
                    ftp: dbFTP,
                    ftpOrigin: 'sauce',
                };
            }
        }
        const info = {};
        const override = athleteInfo.ftp_override;
        if (override) {
            info.ftp = override;
            info.ftpOrigin = 'sauce';
        } else {
            let stravaFtp;
            const powerCtrl = await loadPowerController();
            if (powerCtrl) {
                stravaFtp = powerCtrl.get('athlete_ftp');
            }
            if (stravaFtp == null) {
                stravaFtp = pageView.activity().get('ftp');
            }
            if (stravaFtp == null && ns.athlete.id === pageView.currentAthlete().id) {
                const powerData = await loadAthletePowerData(ns.athlete.id);
                if (powerData && powerData.athlete_ftp) {
                    stravaFtp = powerData.athlete_ftp;
                }
            }
            if (stravaFtp) {
                info.ftp = stravaFtp;
                info.ftpOrigin = 'strava';
                // Runs never display ftp, so if the athlete is multisport and
                // we've seen one activity (ride) with ftp, remember it for looking
                // at runs later.
                await updateAthleteInfo({ftp_lastknown: stravaFtp});
            } else {
                const lastKnown = athleteInfo.ftp_lastknown;
                if (lastKnown) {
                    info.ftp = lastKnown;
                    info.ftpOrigin = 'sauce';
                }
            }
        }
        return info;
    }


    function getActivityValuesViaSimilar(id) {
        if (!pageView.similarActivitiesData || !pageView.similarActivitiesData()) {
            return;
        }
        const efforts = pageView.similarActivitiesData().efforts || [];
        const match = efforts.find(x => x.activity_id === id);
        // This object is all sorts of weird, and it might be changing (10-30-2024).. :(
        if (match && match.activity_values) {
            return {
                ...match,
                ...match.activity_values,
                ...match.activity_values.values,
            };
        } else if (match) {
            console.warn("Unhandled 'similarActivityData' format:", match);
        }
    }


    async function getWeightInfo(athleteInfo) {
        if (ns.syncAthlete) {
            // XXX this is a weak integration for now.  Will need complete overhaul...
            const dbWeight = ns.syncAthlete.getWeightAt(getActivityTS());
            if (dbWeight) {
                return {
                    weight: dbWeight,
                    weightOrigin: 'sauce',
                };
            }
        }
        const info = {};
        const override = athleteInfo.weight_override;
        const activityId = pageView.activityId();
        if (override) {
            info.weight = override;
            info.weightOrigin = 'sauce';
        } else {
            // Start with techniqueu for self cycling activity...
            let stravaWeight = sauce.stravaAthleteWeight;
            if (stravaWeight == null) {
                const activityData = getActivityValuesViaSimilar(activityId);
                if (activityData) {
                    // XXX Looks to be gone now, not seeing in any context...
                    stravaWeight = activityData.athlete_weight;
                    if (stravaWeight) {
                        console.warn("I'm not dead yet...");
                    }
                }
            }
            if (stravaWeight == null) {
                const powerCtrl = await loadPowerController();
                if (powerCtrl) {
                    stravaWeight = powerCtrl.get('athlete_weight');
                }
            }
            if (stravaWeight == null && ns.athlete.id === pageView.currentAthlete().id) {
                const powerData = await loadAthletePowerData(ns.athlete.id);
                if (powerData && powerData.athlete_weight) {
                    stravaWeight = powerData.athlete_weight;
                }
            }
            if (stravaWeight) {
                info.weight = stravaWeight;
                info.weightOrigin = 'strava';
                // Runs never display weight, so if the athlete is multisport and
                // we've seen one activity (ride) with weight, remember it for looking
                // at runs later.
                await updateAthleteInfo({weight_lastknown: stravaWeight});
            } else {
                const lastKnown = athleteInfo.weight_lastknown;
                if (lastKnown) {
                    info.weight = lastKnown;
                    info.weightOrigin = 'sauce';
                }
            }
        }
        return info;
    }


    function streamDelta(stream) {
        if (stream) {
            if (stream.length < 2) {
                return 0;
            } else {
                return stream[stream.length - 1] - stream[0];
            }
        }
    }


    function getActiveTime(start, end) {
        const activeStream = _getStream('active', start, end);
        const timeStream = _getStream('time', start, end);
        return sauce.data.activeTime(timeStream, activeStream);
    }


    function getStopCount(start, end) {
        let stops = 0;
        let wasActive = false;
        const activeStream = _getStream('active', start, end);
        for (const x of activeStream) {
            if (!x && wasActive) {
                stops++;
            }
            wasActive = x;
        }
        return stops;
    }


    function elevationData(altStream, elapsed, distance) {
        if (altStream && elapsed && distance) {
            const {gain, loss} = sauce.geo.altitudeChanges(altStream);
            return {
                gain: gain > 1 ? gain : null,
                loss: loss > 1 ? loss : null,
                grade: ((gain - loss) / distance),
                vam: elapsed >= minVAMTime ? (gain / elapsed) * 3600 : null,
                avg: sauce.data.avg(altStream)
            };
        }
    }


    function powerData(powerRoll, altStream, extra={}) {
        const activeAvg = powerRoll.avg({active: true});
        const elapsedAvg = powerRoll.avg({active: false});
        let activeSP;
        let elapsedSP;
        if (supportsSP()) {
            const avgEl = sauce.data.avg(altStream);
            if (avgEl >= minSeaPowerElevation) {
                activeSP = activeAvg && sauce.power.seaLevelPower(activeAvg, avgEl);
                elapsedSP = elapsedAvg && sauce.power.seaLevelPower(elapsedAvg, avgEl);
            }
        }
        return {
            activeAvg,
            elapsedAvg,
            activeSP,
            elapsedSP,
            activeSPAdjust: activeSP && activeSP / activeAvg,
            elapsedSPAdjust: elapsedSP && elapsedSP / elapsedAvg,
            activeWKg: (ns.weight && activeAvg != null) && activeAvg / ns.weight,
            elapsedWKg: (ns.weight && elapsedAvg != null) && elapsedAvg / ns.weight,
            rank: (ns.weight && elapsedAvg) &&
                sauce.power.rank(extra.activeTime || powerRoll.active(), elapsedAvg,
                    extra.np, ns.weight, ns.gender),
            ...extra
        };
    }


    function hasRealWatts() {
        return !!(_getStream('watts'));
    }


    function hasAccurateWatts() {
        // Only trust real watts and watts_calc for runs.  Rides esp are very inaccurate.
        return !!(hasRealWatts() || (ns.activityType === 'run' && _getStream('watts_calc')));
    }


    function supportsNP() {
        return !!(hasRealWatts() && !sauce.options['analysis-disable-np']);
    }


    function supportsXP() {
        return !!(hasRealWatts() && !sauce.options['analysis-disable-xp']);
    }


    function supportsSP() {
        return !sauce.options['analysis-disable-sp'] &&
            !isVirtual() &&
            !!_getStream('altitude') &&
            !!(_getStream('watts') || _getStream('watts_calc'));
    }


    function supportsPeaksRanks(type) {
        return !!(type && (
            ['np', 'xp', 'hr'].includes(type) ||
            (type.startsWith('power') && (hasAccurateWatts() || true)) ||
            (['pace', 'gap'].includes(type) && pageView.isRun())
        ));
    }


    async function _updateAnalysisStats(start, end) {
        const activeStream = await fetchStream('active', start, end);
        const timeStream = await fetchStream('time', start, end);
        const distStream = await fetchStream('distance', start, end);
        const hrStream = await fetchStream('heartrate', start, end);
        const altStream = await fetchSmoothStream('altitude', null, start, end);
        const powerRoll = await correctedRollTimeRange('watts', getStreamIndexTime(start),
            getStreamIndexTime(end));  // Can be watts_calc too
        const activeTime = getActiveTime(start, end);
        const elapsedTime = streamDelta(timeStream);
        const distance = streamDelta(distStream);
        const tplData = {
            logo: sauce.getURL('images/logo_vert_48x128.png'),
            supportsRankBadge: pageView.activity().isRide(),
            supportsPerfPredictor: !!(pageView.activity().isRide() && distance && altStream),
            elapsed: elapsedTime,
            active: activeTime,
            stops: getStopCount(start, end),
            weight: ns.weight,
            isSpeed: ns.paceMode === 'speed',
            samples: timeStream.length,
            elevation: elevationData(altStream, elapsedTime, distance)
        };
        let kj, tss, tTss, intensity, pwhr;
        if (powerRoll) {
            tplData.power = powerData(powerRoll, altStream, {
                np: supportsNP() ? powerRoll.np() : null,
                xp: supportsXP() ? powerRoll.xp() : null,
                activeTime,
                estimate: !hasRealWatts(),
            });
            if (ns.ftp) {
                const power = tplData.power.np || tplData.power.activeAvg;
                tss = sauce.power.calcTSS(power, activeTime, ns.ftp);
                intensity = power / ns.ftp;
            }
            if (hasAccurateWatts() && hrStream) {
                pwhr = sauce.power.calcPwHrDecouplingFromRoll(powerRoll, hrStream);
            }
            kj = powerRoll.joules() / 1000;
        }
        if (hrStream) {
            const zones = await getHRZones();
            if (zones) {
                const ltHR = (zones.z4 + zones.z3) / 2;
                const maxHR = sauce.perf.estimateMaxHR(zones);
                const restingHR = ns.ftp ? sauce.perf.estimateRestingHR(ns.ftp) : 60;
                tTss = sauce.perf.tTSS(hrStream, timeStream, activeStream, ltHR, restingHR, maxHR,
                    ns.gender);
            }
        }
        if (kj || tTss) {
            tplData.energy = {
                kj,
                kjHour: kj && (kj / activeTime * 3600),
                tss,
                tTss,
                intensity,
                pwhr
            };
        }
        if (distance) {
            const gradeDistStream = await fetchGradeDistStream({start, end});
            const gradeDistance = gradeDistStream && streamDelta(gradeDistStream);
            tplData.pace = {
                elapsed: 1 / (distance / elapsedTime),
                active: 1 / (distance / activeTime),
                gap: gradeDistance && (1 / (gradeDistance / activeTime)),
            };
        }
        const tpl = await getTemplate('analysis-stats.html');
        const html = await tpl(tplData);
        ns.$analysisStats.data({start, end});
        ns.$analysisStats.html(html);
    }


    let _schedUpdateAnalysisPromise;
    let _schedUpdateAnalysisHash = null;
    let _schedUpdateAnalysisPending = null;
    let _schedUpdateAnalysisId = 0;
    let _schedUpdateErrorTS;
    function schedUpdateAnalysisStats(start, end) {
        if (start === null) {
            // rescheduled invocation.
            [start, end] = _schedUpdateAnalysisPending;
        }
        const hash = `${start}-${end}`;
        if (_schedUpdateAnalysisHash === hash) {
            return;  // dedup
        }
        _schedUpdateAnalysisPending = [start, end];
        if (!ns.ready) {
            if (!ns.unsupported) {
                ns.prepared.then(() => schedUpdateAnalysisStats(null));
            }
            return;
        }
        if (!ns.$analysisStats) {
            const $el = jQuery('#basic-analysis section.chart');
            if (!$el.length) {
                setTimeout(() => schedUpdateAnalysisStats(null), 200);
                return;
            }
            attachAnalysisStats($el);
        }
        const id = ++_schedUpdateAnalysisId;
        _schedUpdateAnalysisHash = hash;
        (async () => {
            try {
                await _schedUpdateAnalysisPromise;
            } catch(e) {/*no-pragma*/}
            // Throttle invocations to the device framerate.  Note this does not run
            // the DOM updates in the animation frame context.
            await new Promise(resolve => requestAnimationFrame(resolve));
            if (id !== _schedUpdateAnalysisId) {
                return; // debounce
            }
            await (_schedUpdateAnalysisPromise = _updateAnalysisStats(start, end));
        })().catch(e => {
            const now = Date.now();
            if (!_schedUpdateErrorTS || (now - _schedUpdateErrorTS) > 5000) {
                _schedUpdateErrorTS = now;
                console.error(e);
            }
        });
    }


    function _rawStreamsInfo() {
        return [
            {name: 'time'},
            {name: 'timer_time'},
            {name: 'active'},
            {name: 'moving'},
            {name: 'distance'},
            {name: 'grade_adjusted_distance', label: 'gap_distance'},
            {name: 'watts'},
            {name: 'watts_calc'},
            {name: 'watts_sealevel'},
            {name: 'heartrate'},
            {name: 'cadence', formatter: x => ns.cadenceFormatter.format(x)},
            {name: 'velocity_smooth'},
            {name: 'pace'},
            {name: 'grade_adjusted_pace', label: 'gap'},
            {name: 'latlng', label: 'lat', formatter: x => x[0]},
            {name: 'latlng', label: 'lng', formatter: x => x[1]},
            {name: 'temp'},
            {name: 'altitude'},
            {name: 'altitude_smooth_15', label: 'altitude_smooth'},
            {name: 'grade_smooth'},
        ].map(x => ({
            name: x.name,
            label: x.label || x.name,
            formatter: x.formatter,
        }));
    }


    async function _fetchDataSamples(skip, start, end) {
        const streams = _rawStreamsInfo();
        const samples = {};
        const filtered = streams.filter(x => !skip || !skip.has(x.label));
        await fetchStreams(filtered.map(x => x.name));  // bulk prefetch for perf
        for (const x of filtered) {
            const data = await fetchStream(x.name, start, end);
            if (!data) {
                samples[x.label] = null;
            } else {
                samples[x.label] = x.formatter ? data.map(x.formatter) : data;
            }
        }
        return samples;
    }


    async function _dataViewStreamSelector() {
        const prefetch = await _fetchDataSamples();
        const unavailable = new Set(Object.keys(prefetch).filter(x => !prefetch[x]));
        const defaultSkip = new Set(['watts_calc', 'watts_sealevel', 'lat', 'lng', 'pace', 'gap',
            'timer_time', 'gap_distance', 'grade_smooth', 'active', 'moving', 'altitude_smooth', 'temp']);
        const streams = _rawStreamsInfo();
        const checks = streams.filter(x => !unavailable.has(x.label)).map(x => `
            <label>
                <input ${defaultSkip.has(x.label) ? '' : 'checked'}
                       type="checkbox" name="samples"
                       value="${x.label}"/>
                ${x.label}
            </label>
        `);
        const $header = jQuery(`<header>${checks.join(' ')}</header>`);
        const $checks = $header.find('input[name="samples"]');
        let skip = defaultSkip;
        $checks.on('change', () => {
            skip = new Set($checks.filter(':not(:checked)').map((_, x) => x.value));
            $header.trigger('update', skip);
        });
        $header.skip = () => {
            for (const x of unavailable) {
                skip.add(x);
            }
            return skip;
        };
        return $header;
    }


    async function showRawData() {
        const start = ns.$analysisStats.data('start');
        const end = ns.$analysisStats.data('end');
        const $selector = await _dataViewStreamSelector();
        async function renderData() {
            const samples = await _fetchDataSamples($selector.skip(), start, end);
            const csvData = sauce.data.tabulate(samples, {pretty: true});
            const sep = ', ';
            const width = Math.max(sauce.data.sum(csvData[0].map(x => x.length + sep.length)), 68);
            return [csvData.map(x => x.join(sep)).join('\n'), width];
        }
        const [initialData, initialWidth] = await renderData();
        let currentData = initialData;
        const $dialog = sauce.ui.modal({
            title: await LM('raw_data'),
            body: `<pre class="overflow">${initialData}</pre>`,
            flex: true,
            width: `calc(${initialWidth}ch + 4em)`,
            dialogClass: 'sauce-big-data',
            extraButtons: [{
                text: await LM('/download'),
                click: () => {
                    const range = start && end ? `-${start}-${end}` : '';
                    const name = `${pageView.activity().id}${range}.csv`;
                    sauce.ui.downloadBlob(new Blob([currentData + '\n'], {type: 'text/csv'}), name);
                }
            }]
        });
        $dialog.prepend($selector);
        $selector.on('update', async () => {
            const [data, width] = await renderData();
            currentData = data;
            $dialog.find('pre').html(data);
            $dialog.dialog('option', 'width', `calc(${width}ch + 4em)`);
        });
    }


    async function showGraphData() {
        const start = ns.$analysisStats.data('start');
        const end = ns.$analysisStats.data('end');
        const $selector = await _dataViewStreamSelector();
        const $dialog = sauce.ui.modal({
            title: await LM('graphed_data'),
            body: '<div class="graphs padded-info overflow"></div>',
            flex: true,
            width: '80vw',
            dialogClass: 'sauce-big-data',
            position: {at: 'center top+100'}
        });
        $dialog.prepend($selector);
        const $graphs = $dialog.find('.graphs');
        async function renderGraphs() {
            const samples = await _fetchDataSamples($selector.skip(), start, end);
            $graphs.empty();
            for (const [label, data] of Object.entries(samples)) {
                const $row = jQuery(`
                    <div>
                        <small><b>${label}</b></small>
                        <div class="graph"></div>
                    <div/>
                `);
                $graphs.append($row);
                $row.find('.graph').sparkline(data, {
                    type: 'line',
                    width: '100%',
                    height: 40,
                });
            }
        }
        $selector.on('update', renderGraphs);
        await renderGraphs();
    }


    async function getAthleteBike() {
        const bikeEl = document.querySelector('.gear-name');
        const bikeName = (bikeEl && bikeEl.textContent.trim()) || '_default_';
        const athleteInfo = (await sauce.storage.getAthleteInfo(ns.athlete.id)) || {};
        const bikes = athleteInfo.bikes;
        return bikes && bikes[bikeName];
    }


    async function updateAthleteBike(settings) {
        const bikeEl = document.querySelector('.gear-name');
        const bikeName = (bikeEl && bikeEl.textContent.trim()) || '_default_';
        const athleteInfo = (await sauce.storage.getAthleteInfo(ns.athlete.id)) || {};
        const bikes = athleteInfo.bikes || {};
        if (!bikes[bikeName]) {
            bikes[bikeName] = {};
        }
        Object.assign(bikes[bikeName], settings);
        await updateAthleteInfo({bikes});
    }


    async function createLiveSegment({start, end, uuid, segmentName, leaderName, leaderType,
        timeMultiplier}) {
        const {FitParser} = await import(sauce.getURL('src/common/jsfit/fit.mjs'));
        const timeStreamOrig = await fetchStream('time', start, end);
        const timeStream = (timeMultiplier && timeMultiplier !== 1) ?
            timeStreamOrig.map(x => x * timeMultiplier) : timeStreamOrig;
        const distStream = await fetchStream('distance', start, end);
        const altStream = await fetchSmoothStream('altitude', null, start, end);
        const latlngStream = await fetchStream('latlng', start, end);
        const points = [];
        const distOfft = distStream[0];
        const timeOfft = timeStream[0];
        const bounds = sauce.geo.boundingBox(latlngStream);
        for (let i = 0; i < altStream.length; i++) {
            points.push({
                altitude: altStream[i],
                distance: distStream[i] - distOfft,
                position_lat: latlngStream[i][0],
                position_long: latlngStream[i][1],
                leader_time: [timeStream[i] - timeOfft],
                message_index: {flags: [], value: i}
            });
        }
        const fitParser = new FitParser();
        fitParser.addMessage('file_id', {
            manufacturer: 'strava',
            type: 'segment',
            time_created: new Date()
        });
        fitParser.addMessage('segment_id', {
            name: segmentName.substr(0, 40),
            enabled: true,
            sport: pageView.isRide() ? 'cycling' : pageView.isRun() ? 'running' : null,
            selection_type: 'starred',
            uuid,
            default_race_leader: 0,
        });
        fitParser.addMessage('segment_lap', {
            uuid,
            total_distance: streamDelta(distStream),
            total_ascent: sauce.geo.altitudeChanges(altStream).gain,
            start_position_lat: latlngStream[0][0],
            start_position_long: latlngStream[0][1],
            end_position_lat: latlngStream[latlngStream.length - 1][0],
            end_position_long: latlngStream[latlngStream.length - 1][1],
            swc_lat: bounds.swc[0],
            swc_long: bounds.swc[1],
            nec_lat: bounds.nec[0],
            nec_long: bounds.nec[1],
            message_index: {flags: [], value: 0}
        });
        fitParser.addMessage('segment_leaderboard_entry', {
            activity_id_string: pageView.activity().id.toString(),
            segment_time: streamDelta(timeStream),
            type: leaderType,
            name: leaderName,
            message_index: {flags: [], value: 0}
        });
        for (const x of points) {
            fitParser.addMessage('segment_point', x);
        }
        const buf = fitParser.encode();
        const leaderInitials = leaderName.trim().split(/\s+/).map(x => x.substr(0, 1)).join('');
        const fname = `SauceLiveSegment-${segmentName.substr(0, 22)}-${leaderInitials}`;
        sauce.ui.downloadBlob(new File([buf],
            fname.trim().replace(/\s/g, '_').replace(/[^\w_-]/g, '') + '.fit'));
    }


    async function showPerfPredictor(start, end) {
        const timeStream = await fetchStream('time', start, end);
        const distStream = await fetchStream('distance', start, end);
        const altStream = await fetchSmoothStream('altitude', null, start, end);
        const powerRoll = await correctedRollTimeRange('watts', getStreamIndexTime(start),
            getStreamIndexTime(end));
        const origTime = streamDelta(timeStream);
        const origDistance = streamDelta(distStream);
        const origVelocity = origDistance / origTime;
        const el = sauce.data.avg(altStream);
        const template = await getTemplate('perf-predictor.html', 'perf_predictor');
        const power = powerRoll && powerRoll.avg();
        const slope = streamDelta(altStream) / origDistance;
        const powerColors = {
            gravity: '#36c',
            aero: '#dc3912',
            rr: '#f90'
        };
        const bikeDefaults = {
            cda: 0.40,
            crr: 0.0050,
            gearWeight: 13,
            bike: 'road',
            terrain: 'asphalt',
        };
        const bike = await getAthleteBike();
        if (bike) {
            Object.assign(bikeDefaults, bike.perf_predictor_defaults);
        }
        const body = await template({
            power: power && Math.round(power),
            hasWeight: !!ns.weight,
            wkg: power && ns.weight && H.number(power / ns.weight, {fixed: true, precision: 1}),
            bodyWeight: ns.weight && L.weightFormatter.convert(ns.weight).toFixed(1),
            gearWeight: L.weightFormatter.convert(bikeDefaults.gearWeight).toFixed(1),
            slope: (slope * 100).toFixed(1),
            distance: L.distanceFormatter.convert(origDistance).toFixed(3),
            cda: bikeDefaults.cda,
            crr: bikeDefaults.crr,
            bike: bikeDefaults.bike,
            terrain: bikeDefaults.terrain,
            wind: 0,
            elevation: Math.round(L.elevationFormatter.convert(el)),
            speed: humanPace(origVelocity, {velocity: true}),
            time: H.timer(origTime),
            weightUnit: L.weightFormatter.shortUnitKey(),
            speedUnit: ns.paceFormatter.shortUnitKey(),
            elevationUnit: L.elevationFormatter.shortUnitKey(),
            distanceUnit: L.distanceFormatter.shortUnitKey(),
            powerColors
        });
        const $dialog = sauce.ui.modal({
            title: 'Performance Predictor',
            icon: await sauce.ui.getImage('fa/analytics-duotone.svg'),
            body,
            flex: true,
            width: '62em',
            dialogClass: 'sauce-perf-predictor no-pad',
            closeOnMobileBack: ns.isMobile,
        });
        function fget(name) {
            const $el = $dialog.find(`[name="${name}"]`);
            if ($el.attr('type') === 'checkbox') {
                return $el.is(':checked');
            } else {
                return Number($el.val());
            }
        }
        const locale = await L.getMessagesObject([
            'faster', 'slower', 'power_details_rr', 'power_details_gravity', 'power_details_aero',
            'position', '/time', '/power',
        ], 'perf_predictor');
        let lazySaveTimeout;
        const $output = $dialog.find('.output');
        const $pred = $output.find('.predicted');
        const $powerDetails = $output.find('.power-details');
        const $cdaPositions = $dialog.find('span.cda-position');
        const $draftRiders = $dialog.find('span.draft-riders');
        const $draftPosition = $dialog.find('span.draft-position');
        const $draftWork = $dialog.find('span.draft-work');
        const $draftRiderIcons = $dialog.find('.draft-rider-icon');
        const $draftGroupPower = $output.find('.drafting-output .group-power');
        const $draftPowerVariance = $output.find('.drafting-output .power-variance');
        function recalc(initial) {
            const crr = fget('crr');
            const cda = fget('cda');
            for (const x of $cdaPositions) {
                if (cda >= Number(x.dataset.min) && cda < Number(x.dataset.max)) {
                    if (!x.classList.contains('visible')) {
                        $cdaPositions.removeClass('visible');
                        x.classList.add('visible');
                    }
                    break;
                }
            }
            const power = fget('power');
            const bodyWeight = L.weightUnconvert(fget('body-weight'));
            const gearWeight = L.weightUnconvert(fget('gear-weight'));
            const weight = bodyWeight + gearWeight;
            const slope = fget('slope') / 100;
            const distance = L.distanceUnconvert(fget('distance'));
            const el = L.elevationUnconvert(fget('elevation'));
            const wind = L.velocityUnconvert(fget('wind'), {type: ns.paceType});
            let est;
            const drafting = fget('drafting');
            if (drafting) {
                const useSameWeight = fget('group-use-athlete-weight');
                const groupWeight = useSameWeight ?
                    weight :
                    L.weightUnconvert(fget('group-body-weight')) + gearWeight;
                const riders = fget('riders');
                $draftRiders.text(riders < 8 ? riders.toLocaleString() : '8+');
                const rotating = fget('rotating');
                const positions = new Map();
                const position = fget('position');
                if (!rotating) {
                    $draftPosition.text(position.toLocaleString());
                    positions.set(position, 1);
                    const dr = sauce.power.cyclingDraftDragReduction(riders, position);
                    est = sauce.power.cyclingPowerFastestVelocitySearch({power, slope, weight, crr,
                        cda: cda * dr, el, wind});
                } else {
                    const work = fget('work');
                    $draftWork.text(Math.round(work * 100).toLocaleString());
                    for (let i = work ? 0 : 1; i < riders; i++) {
                        const pct = i === 0 ? work : (1 / (riders - 1)) * (1 - work);
                        if (pct) {
                            positions.set(i + 1, pct);
                        }
                    }
                    est = sauce.power.cyclingPowerVelocitySearchMultiPosition(riders,
                        Array.from(positions).map(x => ({position: x[0], pct: x[1]})),
                        {power, slope, weight, crr, cda, el, wind});
                }
                if (est) {
                    let minP = Infinity;
                    let maxP = -Infinity;
                    let joules = 0;
                    const time = distance / est.velocity;
                    for (let i = 0; i < $draftRiderIcons.length; i++) {
                        const icon = $draftRiderIcons[i];
                        icon.classList.toggle('hidden', i >= riders);
                        if (i < riders) {
                            const draftCda = cda * sauce.power.cyclingDraftDragReduction(riders, i + 1);
                            const pct = positions.get(i + 1) || 0;
                            if (rotating) {
                                const youPosEst = sauce.power.cyclingPowerEstimate({velocity: est.velocity,
                                    slope, weight, crr, cda: draftCda, el, wind});
                                const themPosEst = sauce.power.cyclingPowerEstimate({velocity: est.velocity,
                                    slope, weight: groupWeight, crr, cda: draftCda, el, wind});
                                minP = Math.min(youPosEst.watts, themPosEst.watts, minP);
                                maxP = Math.max(youPosEst.watts, themPosEst.watts, maxP);
                                const j = (youPosEst.watts * time * pct) +
                                    (themPosEst.watts * time * (1 - pct));
                                joules += j;
                                jQuery(icon.querySelector('label')).html(
                                    `${Math.round(youPosEst.watts).toLocaleString()}w` +
                                    (useSameWeight ?
                                        '' :
                                        '<br/><small>(' +
                                        Math.round(themPosEst.watts).toLocaleString() +
                                        'w)</small>'
                                    )
                                );
                                icon.style.setProperty('--draft-power', j / time);
                                icon.setAttribute('title', [
                                    `${locale.position}: ${i + 1}`,
                                    `${locale.time}: ${H.timer(time * pct)} (${Math.round(pct * 100)}%)`,
                                    `${locale.power} (You): ${Math.round(youPosEst.watts)}w`,
                                    `${locale.power} (Them): ${Math.round(themPosEst.watts)}w`,
                                ].join('\n'));
                                icon.style.setProperty('--draft-pct', Math.min(1, pct));
                            } else {
                                const w = (i + 1) === position ? weight : groupWeight;
                                const posEst = sauce.power.cyclingPowerEstimate({velocity: est.velocity,
                                    slope, weight: w, crr, cda: draftCda, el, wind});
                                minP = Math.min(posEst.watts, minP);
                                maxP = Math.max(posEst.watts, maxP);
                                joules += posEst.watts * time;

                                icon.querySelector('label').textContent =
                                    `${Math.round(posEst.watts).toLocaleString()}w`;
                                icon.style.setProperty('--draft-power', posEst.watts);
                                icon.setAttribute('title', [
                                    `${locale.position}: ${i + 1}`,
                                    `${locale.time}: ${H.timer(time * pct)} (${Math.round(pct * 100)}%)`,
                                    `${locale.power}: ${Math.round(posEst.watts)}w`,
                                ].join('\n'));
                                icon.style.setProperty('--draft-pct', Math.min(1, pct));
                            }
                        }
                    }
                    const groupPower = joules / riders / time;
                    const variance = (maxP - minP) / groupPower;
                    $draftGroupPower.text(Math.round(groupPower).toLocaleString());
                    $draftPowerVariance.text(Math.round(variance * 100).toLocaleString());
                    $dialog[0].style.setProperty('--draft-variance', variance);
                    $dialog[0].style.setProperty('--draft-power-min', minP);
                    $dialog[0].style.setProperty('--draft-power-max', maxP);
                    $dialog[0].style.setProperty('--draft-riders', riders);
                    $dialog.toggleClass('draft-rotating', rotating);
                }
            } else {
                est = sauce.power.cyclingPowerFastestVelocitySearch({power, slope, weight, crr,
                    cda, el, wind});
            }
            $dialog.toggleClass('drafting', drafting);
            $output.toggleClass('valid', !!est);
            if (!est) {
                return;
            }
            const time = Math.round(distance / est.velocity);
            const $timeAhead = $pred.find('.time + .ahead-behind');
            if (est.velocity && time < origTime) {
                const pct = (origTime / time - 1) * 100;
                $timeAhead.text(`${H.number(pct, {precision: 1})}% ${locale.faster}`);
                $timeAhead.addClass('sauce-positive').removeClass('sauce-negative');
            } else if (est.velocity && time > origTime) {
                const pct = (time / origTime - 1) * 100;
                $timeAhead.text(`${H.number(pct, {precision: 1})}% ${locale.slower}`);
                $timeAhead.addClass('sauce-negative').removeClass('sauce-positive');
            } else {
                $timeAhead.empty();
            }
            $pred.find('.speed').text(humanPace(est.velocity, {velocity: true}));
            $pred.find('.time').text(H.timer(time));
            $pred.find('.distance').text(H.distance(distance));
            $pred.find('.wkg').text(H.number(power / bodyWeight, {fixed: true, precision: 1}));
            const watts = [est.gWatts, est.aWatts, est.rWatts];
            const wattRange = sauce.data.sum(watts.map(Math.abs));
            const pcts = {
                gravity: est.gWatts / wattRange * 100,
                aero: est.aWatts / wattRange * 100,
                rr: est.rWatts / wattRange * 100
            };
            const $gravity = $powerDetails.find('.gravity');
            $gravity.find('.power').text(H.number(est.gWatts));
            $gravity.find('.pct').text(H.number(pcts.gravity));
            const $aero = $powerDetails.find('.aero');
            $aero.find('.power').text(H.number(est.aWatts));
            $aero.find('.pct').text(H.number(pcts.aero));
            const $rr = $powerDetails.find('.rr');
            $rr.find('.power').text(H.number(est.rWatts));
            $rr.find('.pct').text(H.number(pcts.rr));
            $powerDetails.find('.sparkline').sparkline(
                watts,
                {
                    type: 'bar',
                    width: '100%',
                    height: '100%',
                    barWidth: 38,
                    disableHiddenCheck: true,
                    chartRangeMin: sauce.data.min(watts.concat([0])),
                    colorMap: [powerColors.gravity, powerColors.aero, powerColors.rr],
                    tooltipFormatter: (_, __, data) => {
                        const key = ['gravity', 'aero', 'rr'][data[0].offset];
                        const force = est[['g', 'a', 'r'][data[0].offset] + 'Force'];
                        return `
                            <b>${locale[`power_details_${key}`]}: ${H.number(pcts[key])}%</b>
                            <ul>
                                <li>&nbsp;&nbsp;${Math.round(data[0].value)} Watts</li>
                                <li>&nbsp;&nbsp;${H.number(force)} Newtons</li>
                            </ul>
                        `;
                    }
                });
            if (!initial) {
                clearTimeout(lazySaveTimeout);
                lazySaveTimeout = setTimeout(async () => {
                    await updateAthleteBike({
                        perf_predictor_defaults: {
                            cda,
                            crr,
                            gearWeight,
                            bike: $dialog.find('[name="bike"]:checked').val(),
                            terrain: $dialog.find('[name="terrain"]').val()
                        }
                    });
                }, 200);
            }
        }
        $dialog.on('input', '[name="bike"],[name="terrain"]', ev => {
            const terrain = $dialog.find('[name="terrain"]').val();
            const bike = $dialog.find('[name="bike"]:checked').val();
            const crr = {
                road: {asphalt: 0.0050, gravel: 0.0060, grass: 0.0070, offroad: 0.0200, sand: 0.0300},
                mtb: {asphalt: 0.0065, gravel: 0.0075, grass: 0.0090, offroad: 0.0255, sand: 0.0380}
            }[bike][terrain];
            if (crr) {
                $dialog.find('[name="crr"]').val(crr);
            }
            setTimeout(recalc, 0);
        });
        $dialog.on('input', '[name="crr"]', ev => {
            $dialog.find('select[name="terrain"]').val('custom');
            setTimeout(recalc, 0);  // Only required to save bike defaults.
        });
        $dialog.on('input', '[name="aero"]', ev => {
            ev.currentTarget.nextElementSibling.value = ev.currentTarget.value;
            setTimeout(recalc, 0);
        });
        $dialog.on('input', '[name="cda"]', ev => {
            ev.currentTarget.previousElementSibling.value = ev.currentTarget.value;
            setTimeout(recalc, 0);
        });
        $dialog.on('input', '[name="riders"]', ev => {
            const riders = Number(ev.currentTarget.value);
            $dialog.find('input[name="work"]').val(1 / riders);
            $dialog.find('input[name="position"]').attr('max', riders);
            setTimeout(recalc, 0);
        });
        $dialog.on('input', '[name="body-weight"]', ev => {
            if (fget('group-use-athlete-weight')) {
                const $el = $dialog.find('input[name="group-body-weight"]');
                $el.val(ev.currentTarget.value);
            }
        });
        $dialog.on('input', '[name="group-use-athlete-weight"]', ev => {
            const $el = $dialog.find('input[name="group-body-weight"]');
            const disabled = ev.currentTarget.checked;
            $el[0].disabled = disabled;
            if (disabled) {
                $el.val(fget('body-weight'));
            }
        });
        $dialog.on('input', 'input', () => setTimeout(recalc, 0));
        recalc(/*initial*/ true);
    }


    function attachAnalysisStats($el) {
        if (!ns.$analysisStats) {
            ns.$analysisStats = jQuery(`<div class="sauce-analysis-stats"></div>`);
            ns.$analysisKeyboardHint = jQuery(`<div class="sauce-analysis-keyboard-hint"></div>`);
            sauce.proxy.connected.then(async () => {
                const expanded = await sauce.storage.getPref('expandAnalysisStats');
                ns.$analysisStats.toggleClass('expanded', !!expanded);
                ns.$analysisKeyboardHint.attr('title', await LM('keyboard_tooltip'));
                ns.$analysisKeyboardHint.html(await sauce.ui.getImage('fa/keyboard-regular.svg'));
            });
        }
        $el.find('#stacked-chart').before(ns.$analysisKeyboardHint);
        $el.find('#stacked-chart').before(ns.$analysisStats);
        $el.on('click', 'a.sauce-raw-data', showRawData);
        $el.on('click', 'a.sauce-graph-data', showGraphData);
        $el.on('click', 'a.sauce-perf-predictor', async () => {
            const start = ns.$analysisStats.data('start');
            const end = ns.$analysisStats.data('end');
            await showPerfPredictor(start, end);
        });
        $el.on('click', 'a.sauce-export', async ev => {
            const start = ns.$analysisStats.data('start');
            const end = ns.$analysisStats.data('end');
            const format = ev.currentTarget.dataset.format;
            await exportActivity(format, {start, end});
        });
        $el.on('click', '.expander', async ev => {
            const el = ev.currentTarget.closest('.sauce-analysis-stats');
            const expanded = el.classList.toggle('expanded');
            await sauce.storage.setPref('expandAnalysisStats', expanded);
        });
    }


    function adjustSlideMenu() {
        // We expand the sidenav, so we need to modify this routine to make the menu
        // work properly in all conditions.
        const sidenav = document.querySelector('nav.sidenav');
        if (!sidenav) {
            return;
        }
        const navHeight = sidenav.offsetHeight;
        const slideMenu = sidenav.querySelector('.slide-menu');
        if (!slideMenu) {
            console.warn('Slide menu not found: Probably a flagged activity');
            return;
        }
        // Must use jQuery since it's hidden and they do the magic..
        const slideMenuHeight = jQuery(slideMenu.querySelector('.options')).height();
        const top = slideMenuHeight > navHeight;
        requestAnimationFrame(() => {
            slideMenu.classList.remove('align-top');  // Never seems to be a good idea.
            slideMenu.classList.toggle('align-bottom', !top);
        });
    }


    async function pageViewAssembled() {
        if (!pageView.factory().page()) {
            const pf = pageView.factory();
            const setget = pf.page;
            await new Promise(resolve => {
                pf.page = function(v) {
                    try {
                        return setget.apply(this, arguments);
                    } finally {
                        if (v) {
                            pf.page = setget;
                            resolve();
                        }
                    }
                };
            });
        }
    }


    class SyncAthlete {
        constructor(data) {
            Object.assign(this, data);
        }

        getFTPAt(ts) {
            return sauce.model.getAthleteFTPAt(this, ts, ns.activityType);
        }

        getWeightAt(ts) {
            return sauce.model.getAthleteWeightAt(this, ts);
        }
    }


    async function initSyncActivity(activity, athleteId) {
        let setSyncDone;
        const ret = {
            afterSyncActivity: new Promise(resolve => void (setSyncDone = resolve))
        };
        if (!(sauce.patronLevel >= 10)) {
            return ret;
        }
        const athleteData = await sauce.hist.getAthlete(athleteId);
        if (!athleteData || !athleteData.sync) {
            return ret;
        }
        ret.syncAthlete = new SyncAthlete(athleteData);
        ret.syncActivity = await sauce.hist.getActivity(activity.id);
        if (!ret.syncActivity) {
            sauce.sleep(100).then(async () => {
                await sauce.hist.syncAthlete(ret.syncAthlete.id, {wait: true});
                ret.syncActivity = await sauce.hist.getActivity(activity.id);
                setSyncDone();
            });
        } else {
            // Check for updates out of band to disaffect page load.
            sauce.sleep(2000).then(async () => {
                const fullAct = await fetchFullActivity();
                let actData;
                if (!fullAct) {
                    actData = {};
                    // Hacks from here...
                    if (self.lightboxData) {
                        if (self.lightboxData.title) {
                            actData.name = self.lightboxData.title;
                        }
                        if (self.lightboxData.activity_type) {
                            actData.type = self.lightboxData.activity_type;
                        }
                    }
                    const descEl = document.querySelector('.activity-description .content');
                    if (descEl) {
                        actData.description = descEl.textContent;
                    }
                } else {
                    actData = fullAct.attributes;
                }
                const updates = {};
                for (const x of ['type', 'name', 'description']) {
                    const val = actData[x];
                    if (val && val !== ret.syncActivity[x]) {
                        updates[x] = val;
                    }
                }
                if (updates.type) {
                    const basetype = sauce.model.getActivityBaseType(updates.type);
                    if (basetype && basetype !== ret.syncActivity.basetype) {
                        updates.basetype = basetype;
                    } else {
                        // The detailed activity type info is better from the feed data (sync).  To
                        // avoid losing this granularity, only update 'type' if 'basetype' is also
                        // changed (i.e. the user actually changed it).
                        delete updates.type;
                    }
                }
                if (Object.keys(updates).length) {
                    const origValues = Object.fromEntries(Object.keys(updates).map(x =>
                        [x, ret.syncActivity[x]]));
                    console.info("Updating activity DB entry:", JSON.stringify(origValues),
                        JSON.stringify(updates));
                    await sauce.hist.updateActivity(activity.id, updates);
                    Object.assign(ret.syncActivity, updates);
                    if (updates.basetype) {
                        await sauce.hist.deletePeaksForActivity(activity.id); // XXX might be redundant now
                        await sauce.hist.invalidateActivitySyncState(activity.id, 'local', null,
                            {wait: true});
                        setSyncDone();
                    }
                }
            });
        }
        const athleteUpdates = {};
        const name = ns.athlete.get('display_name');
        const gender = ns.gender;
        if (name && name !== ret.syncAthlete.name) {
            athleteUpdates.name = name;
        }
        if (gender && gender !== ret.syncAthlete.gender) {
            athleteUpdates.gender = gender;
        }
        if (Object.keys(athleteUpdates).length) {
            await sauce.hist.updateAthlete(ns.athlete.id, athleteUpdates);
        }
        return ret;
    }


    async function prepare() {
        const activity = pageView.activity();
        ns.athlete = pageView.activityAthlete();
        ns.gender = ns.athlete.get('gender') === 'F' ? 'female' : 'male';
        await Promise.all([sauce.proxy.connected, _localeInit]);
        Object.assign(ns, await initSyncActivity(activity, ns.athlete.id));
        const athleteInfo = (await sauce.storage.getAthleteInfo(ns.athlete.id)) || {};
        try {
            Object.assign(ns, await getWeightInfo(athleteInfo));
            Object.assign(ns, await getFTPInfo(athleteInfo));
        } catch(e) {
            // Have had a regression with these before and I don't trust them to not fail
            // in the future due to upstream changes..
            console.error('Error while looking for weight of FTP:', e);
        }
        if (athleteInfo.gender !== ns.gender) {
            updateAthleteInfo({gender: ns.gender});  // bg okay
        }
        ns.wPrime = athleteInfo.wPrime || 20000;
        ns.cadenceFormatter = activity.isRun() ?
            L.cadenceFormatterRun :
            activity.isSwim() ?
                L.cadenceFormatterSwim :
                L.cadenceFormatter;
        ns.speedUnit = activity.get('speedUnit') || (activity.isRide() ? 'mph' : 'mpm');
        ns.paceType = {mp100m: 'swim', mph: 'speed', mpm: 'pace'}[ns.speedUnit];
        ns.paceFormatter = L.getPaceFormatter({type: ns.paceType});
        ns.paceMode = ns.speedUnit === 'mph' ? 'speed' : 'pace';
        ns.peakIcons = {
            peak_power: 'fa/bolt-duotone.svg',
            peak_power_wkg: 'fa/bolt-duotone.svg',
            peak_np: 'fa/atom-alt-duotone.svg',
            peak_xp: 'fa/atom-duotone.svg',
            peak_sp: 'fa/ship-duotone.svg',
            peak_hr: 'fa/heartbeat-duotone.svg',
            peak_vam: 'fa/rocket-launch-duotone.svg',
            peak_gap: 'fa/hiking-duotone.svg',
            peak_pace: 'fa/rabbit-fast-duotone.svg',
            peak_cadence: 'fa/solar-system-duotone.svg',
        };
        if (activity.isRun()) {
            ns.peakIcons.peak_pace = 'fa/running-duotone.svg';
            ns.peakIcons.peak_cadence = 'fa/shoe-prints-duotone.svg';
        } else if (activity.isSwim()) {
            ns.peakIcons.peak_pace = 'fa/swimmer-duotone.svg';
        }
        updateSideNav();  // bg okay
        attachActionMenuItems();  // bg okay
        attachComments();  // bg okay
        attachSegmentToolHandlers();  // bg okay
        ns.allPeriodRanges = await sauce.peaks.getForActivityType('periods', ns.activityType);
        ns.allDistRanges = await sauce.peaks.getForActivityType('distances', ns.activityType);
        for (const range of ns.allPeriodRanges) {
            range.label = H.peakPeriod(range.value);
            range.labelHTML = H.peakPeriod(range.value, {html: true});
        }
        for (const range of ns.allDistRanges) {
            range.label = H.raceDistance(range.value);
            range.labelHTML = H.raceDistance(range.value, {html: true});
        }
        const timeStream = await fetchStream('time');
        const streamData = pageView.streams().streamData;
        if (ns.activityType === 'run') {
            if (sauce.options['analysis-disable-run-watts'] ||
                (ns.syncAthlete && ns.syncAthlete.disableRunWatts)) {
                Object.defineProperty(streamData.data, 'watts', {get: () => null});
            }
            if (ns.weight) {
                const gad = await fetchGradeDistStream();
                if (gad) {
                    streamData.add('watts_calc', sauce.pace.createWattsStream(timeStream, gad, ns.weight));
                }
            }
        }
        const wattsStream = (await fetchStream('watts')) || (await fetchStream('watts_calc'));
        if (wattsStream && supportsSP()) {
            const altStream = await fetchStream('altitude');
            streamData.add('watts_sealevel', wattsStream.map((x, i) =>
                Math.round(sauce.power.seaLevelPower(x, altStream[i]))));
        }
        if (hasAccurateWatts() && ns.ftp && ns.wPrime) {
            streamData.add('w_prime_balance',
                sauce.power.calcWPrimeBalDifferential(wattsStream, timeStream, ns.ftp, ns.wPrime));
        }
        const isTrainer = pageView.activity().isTrainer();
        const isSwim = ns.activityType === 'swim';
        const cadenceStream = await fetchStream('cadence');
        const distStream = await fetchStream('distance');
        streamData.add('active', sauce.data.createActiveStream({
            time: timeStream,
            moving: await fetchStream('moving'),
            cadence: cadenceStream,
            watts: hasAccurateWatts() && wattsStream,
            distance: distStream,
        }, {isTrainer, isSwim}));
        _resolvePrepared();
    }


    // Using mutation observers on the entire document leads to perf issues in chrome.
    let _pageMonitorsBackoff = 10;
    let _pageMonitorsTimeout;
    function startPageMonitors() {
        const segments = document.querySelector('table.segments');
        if (segments) {
            if (sauce.options['analysis-segment-badges']) {
                addSegmentBadges();  // bg okay
            }
            if (!sauce.options['analysis-disable-segment-score']) {
                addSegmentScores();
            }
            if (sauce.options['analysis-trailforks']) {
                addTrailforksOverlay();
            }
        }
        if (sauce.options['responsive']) {
            maintainScalableSVG();
        }
        _pageMonitorsBackoff *= 1.25;
        _pageMonitorsTimeout = setTimeout(startPageMonitors, _pageMonitorsBackoff);
    }


    function resetPageMonitors() {
        _pageMonitorsBackoff = 10;
        clearTimeout(_pageMonitorsTimeout);
        startPageMonitors();
    }


    function maintainScalableSVG() {
        const candidates = document.querySelectorAll('svg[width][height]:not([data-sauce-mark])');
        for (const el of candidates) {
            el.dataset.sauceMark = true;
            if (!el.hasAttribute('viewBox') && el.parentNode &&
                el.parentNode.classList.contains('base-chart')) {
                const width = Number(el.getAttribute('width'));
                const height = Number(el.getAttribute('height'));
                if (!isNaN(width) && !isNaN(height)) {
                    el.setAttribute('viewBox', `0 0 ${width} ${height}`);
                    el.removeAttribute('width');
                    el.removeAttribute('height');
                    const mo = new MutationObserver(mutations => {
                        const vb = el.getAttribute('viewBox').split(/\s/);
                        let changed;
                        for (const m of mutations) {
                            if (m.attributeName === 'width') {
                                const width = el.getAttribute('width');
                                if (width) {
                                    vb[2] = width;
                                    changed = true;
                                }
                                el.removeAttribute('width');
                            }
                            if (m.attributeName === 'height') {
                                const height = el.getAttribute('height');
                                if (height) {
                                    vb[3] = height;
                                    changed = true;
                                }
                                el.removeAttribute('height');
                            }
                        }
                        if (changed) {
                            el.setAttribute('viewBox', vb.join(' '));
                        }
                    });
                    mo.observe(el, {attributes: true});
                }
            }
        }
    }


    async function attachMobileMenuExpander() {
        const svg = await sauce.ui.getImage('fa/bars-regular.svg');
        const $navHeader = jQuery('#global-header > nav');
        $navHeader.prepend(jQuery(`<div style="display: none" class="menu-expander">${svg}</div>`));
        $navHeader.find('.menu-expander').on('click', toggleMobileNavMenu);
        const globNavGroup = document.querySelector('#container-nav ul.global-nav');
        const globNavItems = globNavGroup.querySelectorAll(':scope > li.nav-item');
        const pageNav = document.querySelector('#pagenav');
        function handleLinkClick(ev) {
            if (ev.target.closest('a[href]')) {
                ev.stopPropagation();  // Prevent it from being eaten in-page router.
            }
        }
        function transplantGlobNav() {
            for (const el of globNavItems) {
                el.classList.remove('nav-item', 'drop-down-menu');
                el.classList.add('sauce-transplanted-glob-nav-item');
                el.addEventListener('click', handleLinkClick);
                pageNav.appendChild(el);
            }
        }
        if (mobileMedia.matches) {
            transplantGlobNav();
        }
        mobileMedia.addListener(ev => {
            if (ev.matches) {
                transplantGlobNav();
            } else {
                for (const el of globNavItems) {
                    el.removeEventListener('click', handleLinkClick);
                    el.classList.add('nav-item', 'drop-down-menu');
                    el.classList.remove('sauce-transplanted-glob-nav-item');
                    globNavGroup.appendChild(el);
                }
            }
        });
    }


    async function checkIfUpdated() {
        await sauce.proxy.connected;
        const recentUpdate = await sauce.storage.get('recentUpdate');
        if (!recentUpdate) {
            return;
        }
        const resp = await sauce.fetch('https://www.sauce.llc/release_notes.json');
        let releases = await resp.json();
        releases.reverse();
        const bigIntVersion = v => {
            const ints = v.split('.').map(BigInt);
            if (ints.length > 4) {
                throw new TypeError("Invalid version format: " + v);
            }
            let n = BigInt(0);
            const bits = 10;  // 1024 max revisions for each.
            for (let i = 0; i < ints.length; i++) {
                const x = ints[i];
                if (x > 1 << bits) {
                    throw new TypeError("Invalid version element: " + x);
                }
                n |= ints[i] << BigInt((3 - i) * bits);
            }
            return n;
        };
        const prevBigVer = bigIntVersion(recentUpdate.previousVersion);
        releases = releases.filter(x => bigIntVersion(x.version) > prevBigVer);
        if (!releases.length) {
            // No releases to show.
            await sauce.storage.remove('recentUpdate');
            return;
        }
        const template = await getTemplate('release-notes.html');
        const entryTpl = await getTemplate('release-notes-entry.html');
        const $dialog = sauce.ui.dialog({
            title: 'Good news - Sauce was just upgraded!', // XXX localize
            width: 500,
            autoDestroy: true,
            dialogClass: 'sauce-updated',
            body: `
                Sauce for Strava™ was recently updated and you are now running version
                <b>${sauce.version}</b>.  Thanks for being awesome!
                <br/></br/>
                What's New...<br/><br/>
                ${await template({releases, entryTpl})}
            `,  // XXX localize
        });
        $dialog.on('dialogclose', async () => {
            await sauce.storage.remove('recentUpdate');
        });
    }


    async function load() {
        await sauce.propDefined('pageView', {once: true});
        if (sauce.options['responsive']) {
            attachMobileMenuExpander().catch(console.error);
            pageView.unbindScrollListener();
            document.body.classList.add('sauce-disabled-scroll-listener');
            pageView.handlePageScroll = function() {};
            // Disable animations for mobile screens (reduces jank and works better for some nav changes)
            mobileMedia.addListener(ev => {
                jQuery.fx.off = ev.matches;
                ns.isMobile = ev.matches;
            });
            jQuery.fx.off = mobileMedia.matches;
            ns.isMobile = mobileMedia.matches;
        }
        await pageViewAssembled();
        const activity = pageView.activity();
        const type = activity.get('type');
        ns.activityType = {
            'Ride': 'ride',
            'Run': 'run',
            'Swim': 'swim',
            'Other': 'other',
            'StationaryOther': 'other',
        }[type];
        if (ns.activityType) {
            // Start network load early..
            fetchStreams(prefetchStreams).catch(console.error);
            const pageRouter = pageView.router();
            pageRouter.on('route', page => {
                document.body.dataset.route = page;
                resetPageMonitors();
            });
            document.body.dataset.route = pageRouter.context.startMenu();
            startPageMonitors();
            document.documentElement.addEventListener('sauceResetPageMonitor', resetPageMonitors);
            attachRankBadgeDialog();
            await prepare();
            if (sauce.patronLevel >= 10) {
                attachSyncToggle();
            }
            // Make sure this is last thing before start..
            if (!_schedUpdateAnalysisPending) {
                if (sauce.analysisStatsIntent) {
                    const {start, end} = sauce.analysisStatsIntent;
                    schedUpdateAnalysisStats(start, end);
                } else if (ns.activityType === 'swim') {
                    schedUpdateAnalysisStats();
                }
            }
            let keyAnimationDone;
            const keyAnimation = sauce.ui.throttledAnimationFrame();
            const onChartKeyDown = ev => {
                const ed = pageView.eventDispatcher();
                const bView = sauce.basicAnalysisView;
                const elChart = bView.elevationChart;
                const stackedChart = bView.stackedChart;
                const xAxisType = stackedChart.xAxisType();
                let adj = {
                    ArrowLeft: -1,
                    ArrowRight: 1,
                    ArrowUp: -60,
                    ArrowDown: 60,
                }[ev.code];
                if (!adj) {
                    return;
                }
                ev.preventDefault();
                const lastIndex = pageView.streams().getStream('time').length - 1;
                let detailsIndex = ed.mouseIndexes[xAxisType] || 0;
                const hasSelection = stackedChart.zoomStart != null;
                let [start, end] = [
                    hasSelection ? Number(stackedChart.zoomStart) : detailsIndex,
                    hasSelection ? Number(stackedChart.zoomEnd) : detailsIndex];
                const sizeSel = ev.shiftKey;
                const sizeSelType = (ev.ctrlKey || ev.metaKey) ? 'shrink' : 'grow';
                const moveSel = (ev.ctrlKey || ev.metaKey);
                const clamp = (min, desired, max) => Math.min(max, Math.max(min, desired));
                if (sizeSel) {
                    if (adj > 0) {
                        if (sizeSelType === 'grow') {
                            end = clamp(0, end + adj, lastIndex);
                            detailsIndex = end;
                        } else {
                            start = clamp(0, start + adj, end);
                            detailsIndex = start;
                        }
                    } else {
                        if (sizeSelType === 'grow') {
                            start = clamp(0, start + adj, lastIndex);
                            detailsIndex = start;
                        } else {
                            end = clamp(start, end + adj, lastIndex);
                            detailsIndex = end;
                        }
                    }
                } else if (moveSel) {
                    if (start + adj < 0) {
                        adj = -start;
                    } else if (end + adj > lastIndex) {
                        adj = lastIndex - end;
                    }
                    start = clamp(0, start + adj, lastIndex);
                    end = clamp(0, end + adj, lastIndex);
                    detailsIndex = adj > 0 ? end : start;
                } else {
                    detailsIndex = hasSelection ?
                        clamp(start, detailsIndex + adj, end) :
                        clamp(0, detailsIndex + adj, lastIndex);
                }
                if (hasSelection &&
                    (start === end || end < start || end < 0 ||
                     start < 0 || end > lastIndex)) {
                    return;
                }
                keyAnimation(() => {
                    if (adj && (sizeSel || moveSel)) {
                        ed.dispatchUnconditionalHover(null, xAxisType, start, end);
                        if (elChart) {
                            elChart.setSelection([start, end]);
                            const details = elChart.displayDetails(start, end);
                            elChart.$$(elChart.detailSelector()).html(details);
                            elChart.trigger("brushChange");
                        }
                        if (keyAnimationDone) {
                            clearTimeout(keyAnimationDone);
                        }
                        keyAnimationDone = setTimeout(() => {
                            keyAnimationDone = null;
                            ed.dispatchZoomSelect(null, xAxisType, start, end);
                        }, 400);
                    }
                    ed.dispatchMouseOver(null, xAxisType, detailsIndex);
                });
            };
            const $view = jQuery('#view');
            $view.on('mouseenter', '#basic-analysis section.chart', ev => {
                if (document.activeElement !== ev.currentTarget) {
                    ev.currentTarget.classList.add('sauce-keyboard-events');
                    // dedup from focus..
                    document.removeEventListener('keydown', onChartKeyDown, {capture: true});
                    document.addEventListener('keydown', onChartKeyDown, {capture: true});
                }
            });
            $view.on('mouseleave', '#basic-analysis section.chart', ev => {
                if (document.activeElement !== ev.currentTarget) {
                    document.removeEventListener('keydown', onChartKeyDown, {capture: true});
                    ev.currentTarget.classList.remove('sauce-keyboard-events');
                }
            });
            $view.on('blur', '#basic-analysis section.chart', ev => {
                document.removeEventListener('keydown', onChartKeyDown, {capture: true});
                ev.currentTarget.classList.remove('sauce-keyboard-events');
            });
            $view.on('focus', '#basic-analysis section.chart', ev => {
                document.removeEventListener('keydown', onChartKeyDown, {capture: true}); // dedup from mouse
                document.addEventListener('keydown', onChartKeyDown, {capture: true});
                ev.currentTarget.classList.add('sauce-keyboard-events');
            });
            try {
                await startActivity();
            } catch(e) {
                if (e instanceof ThrottledNetworkError) {
                    attachInfo(jQuery(`
                        <div class="pagenav sauce-error">
                            <b>Unable to load Sauce:</b><br/>
                            Strava Network Error:
                            Too many requests, try again later.
                        </div>`));
                }
                throw e;
            }
        } else {
            ns.unsupported = true;
            console.info('Unsupported activity type:', type);
        }
    }


    async function handleGraphOptionsClick(btn, view) {
        const smoothing = sauce.options['analysis-graph-smoothing'] || 0;
        const template = await getTemplate('graph-options.html', 'graph_options');
        const $dialog = sauce.ui.dialog({
            width: '26em',
            autoDestroy: true,
            flex: true,
            title: `Analysis Graph Options`,
            body: await template({
                smoothing,
                options: sauce.options,
                wprime: ns.wPrime,
            }),
            icon: await sauce.ui.getImage('fa/cog-duotone.svg'),
            position: {
                my: 'right top',
                at: 'right-2 top+2',
                of: btn[0][0].closest('svg')
            },
            dialogClass: 'sauce-analysis-graph-options no-pad sauce-small',
            resizable: false,
        });
        const smoothAnimation = sauce.ui.throttledAnimationFrame();
        $dialog.on('input', 'input[name="smoothing"]', async ev => {
            const el = ev.currentTarget;
            const smoothing = Number(el.value);
            el.nextElementSibling.textContent = smoothing ? H.timer(smoothing) : '--';
            sauce.options['analysis-graph-smoothing'] = Number(el.value);
            smoothAnimation(() => {
                const start = view.zoomStart != null ? view.zoomStart : undefined;
                const end = view.zoomEnd != null ? view.zoomEnd : undefined;
                const updates = [];
                view.builder.iterateGraphs((id, graph) => {
                    view.smoothStreamData(id);
                    const [min, max] = view.streamExtent(id);
                    graph.yScale().domain([min, max]).nice();
                    graph.data(view.context.data(view.xAxisType(), id)).update(/*animate*/ true);
                    const fmtr = view.context.formatter(id);
                    updates.push({
                        streamType: id,
                        avgY: graph.yScale()(view.context.streamsContext.data.getIntervalAverage(
                            id, start, end)),
                        min: fmtr.format(min),
                        max: fmtr.format(max),
                    });
                });
                // An equiv of buildOrUpdateAvgLines but with animation.
                const lines = view.builder.mainGroup.selectAll('line.avg-line');
                lines.data(updates).transition().duration(500).attr({
                    y1: x => x.avgY,
                    y2: x => x.avgY,
                });
                const labelBox = view.labelGroup._labelBox;
                // Updates Max/Avg text...
                labelBox.handleStreamHover(null, start, end);
                labelBox.groups.selectAll("text.static-label-box.top").text(data =>
                    updates.find(x => x.streamType === data.streamType).max);
                labelBox.groups.selectAll("text.static-label-box.bottom").text(data =>
                    updates.find(x => x.streamType === data.streamType).min);
            });
            await sauce.storage.update(`options`, sauce.options);
        });
        $dialog.on('input', 'input[type="checkbox"]', async ev => {
            const id = ev.currentTarget.name;
            sauce.options[`analysis-graph-${id}`] = ev.currentTarget.checked;
            const $el = jQuery('#stacked-chart');
            resetPageMonitors();  // make svg resizing faster for responsive mode.
            $el.find('.base-chart').empty();
            view.render($el);
            view.handleStreamsReady();
            await sauce.storage.update(`options`, sauce.options);
        });
        let reloadNeeded;
        $dialog.on('input', 'input[name="wprime"]', async ev => {
            const wPrime = Number(ev.currentTarget.value * 1000);
            ns.wPrime = wPrime;
            $dialog.addClass('reload-needed');
            reloadNeeded = true;
            await updateAthleteInfo({wPrime});
        });
        $dialog.on('dialogclose', () => {
            if (reloadNeeded) {
                location.reload();
            }
        });
    }


    return {
        load,
        fetchStream,
        fetchStreams,
        humanPace,
        schedUpdateAnalysisStats,
        attachAnalysisStats,
        ThrottledNetworkError,
        checkIfUpdated,
        fetchFullActivity,
        handleGraphOptionsClick,
        getActiveTime,
    };
});


(async function() {
    if (sauce.testing) {
        return;
    }
    await sauce.analysis.load();
    sauce.analysis.checkIfUpdated();
})();
