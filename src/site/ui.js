/* global sauce */

sauce.ns('ui', ns => {
    'use strict';

    const L = sauce.locale;
    const LM = x => L.getMessage(x);
    const H = L.human;


    ns.zoneColors = [
        {h: 200, s: 0,   l: 40},
        {h: 230, s: 73,  l: 50},
        {h: 120, s: 43,  l: 53},
        {h: 60,  s: 71,  l: 53},
        {h: 40,  s: 100, l: 50},
        {h: 0,   s: 70,  l: 43},
        {h: 295, s: 100, l: 37},
    ];


    ns.throttledAnimationFrame = function() {
        let nextFrame;
        return function(callback) {
            if (nextFrame) {
                cancelAnimationFrame(nextFrame);
            }
            nextFrame = requestAnimationFrame(() => {
                nextFrame = null;
                callback();
            });
        };
    };


    ns.downloadBlob = function(blob, name) {
        const url = URL.createObjectURL(blob);
        try {
            ns.downloadURL(url, name || blob.name);
        } finally {
            URL.revokeObjectURL(url);
        }
    };


    ns.downloadURL = function(url, name) {
        const link = document.createElement('a');
        link.href = url;
        link.download = name;
        link.style.display = 'none';
        document.body.appendChild(link);
        try {
            link.click();
        } finally {
            link.remove();
        }
    };


    const _textCache = new Map();
    const _textFetching = new Map();
    ns.getImage = async function(path) {
        if (!_textCache.has(path)) {
            try {
                if (!_textFetching.has(path)) {
                    _textFetching.set(path, (async () => {
                        const resp = await sauce.fetch(sauce.getURL(`images/${path.replace(/^\/+/, '')}`));
                        _textCache.set(path, resp.ok ? await resp.text() : undefined);
                        _textFetching.delete(path);
                    })());
                }
                await _textFetching.get(path);
            } catch(e) {
                console.warn("Failed to fetch image:", path, e);
                _textCache.set(path, '');
            }
        }
        return _textCache.get(path);
    };


    let _dialogClose = 'x';
    ns.getImage('fa/times-light.svg').then(x => _dialogClose = x);
    ns.dialog = function(options={}) {
        const $dialog = options.el || self.jQuery(`<div>${options.body || ''}</div>`);
        const dialogClass = `sauce-dialog ${options.dialogClass || ''}`;
        if (options.flex) {
            $dialog.addClass('flex');
        }
        // Assign default button(s) (will be clobbered if options.buttons is defined)
        const defaultClass = 'btn';
        const buttons = [{
            html: _dialogClose,
            click: () => $dialog.dialog('close'),
            class: 'btn btn-icon-only',
        }];
        if (Array.isArray(options.extraButtons)) {
            for (const x of options.extraButtons) {
                if (!x.class) {
                    x.class = defaultClass;
                }
                buttons.push(x);
            }
        } else if (options.extraButtons && typeof options.extraButtons === 'object') {
            for (const [text, click] of Object.entries(options.extraButtons)) {
                buttons.push({text, click, class: defaultClass});
            }
        }
        $dialog.dialog(Object.assign({buttons}, options, {dialogClass}));
        $dialog.on('click', 'a.help-info', ev => {
            const helpFor = ev.currentTarget.dataset.help;
            ev.currentTarget.classList.add('hidden');
            $dialog.find(`.help[data-for="${helpFor}"]`).toggleClass('visible');
        });
        $dialog.on('click', '.help a.sauce-dismiss', ev => {
            const help = ev.currentTarget.closest('.help');
            help.classList.remove('visible');
            $dialog.find(`a.help-info[data-help="${help.dataset.for}"]`).removeClass('hidden');
        });
        if (options.autoDestroy) {
            $dialog.on('dialogclose', ev => void $dialog.dialog('destroy'));
        }
        if (options.closeOnMobileBack) {
            const dialogId = Math.random();
            history.pushState({dialogId}, null);
            const onPop = ev => $dialog.dialog('close');
            window.addEventListener('popstate', onPop);
            $dialog.on('dialogclose', ev => {
                window.removeEventListener('popstate', onPop);
                if (history.state.dialogId === dialogId) {
                    history.go(-1);
                }
            });
        }
        return $dialog;
    };


    ns.modal = function(options={}) {
        return ns.dialog({
            modal: true,
            ...options,
        });
    };


    ns.hslValueGradientSteps = function(thresholds, {hStart, hEnd, sStart, sEnd, lStart, lEnd}) {
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
    };


    function smoothVelocity(distType, streams) {
        return sauce.data.smooth(5, streams.time.map((x, i) => i ?
            (streams[distType][i] - streams[distType][i - 1]) / ((x - streams.time[i - 1]) || 1) :
            0));
    }


    ns.createStreamGraphs = async function($el, {streams, graphs, width, height, paceType, activityType}) {
        const specs = [];
        for (const g of graphs) {
            if (g === 'power' || g === 'power_wkg') {
                const label = await LM('power');
                const formatter = g === 'power_wkg' ?
                    x => `${label}: ${x.toFixed(1)} <abbr class="unit short">w/kg</abbr>` :
                    x => `${label}: ${H.number(x)} <abbr class="unit short">w</abbr>`;
                specs.push({
                    data: g === 'power_wkg' ? streams.watts_kg : (streams.watts || streams.watts_calc),
                    formatter,
                    colorSteps: ns.hslValueGradientSteps([0, 100, 400, 1200],
                        {hStart: 360, hEnd: 280, sStart: 40, sEnd: 100, lStart: 60, lEnd: 20})
                });
            } else if (g === 'sp') {
                const label = await LM('sea_power');
                specs.push({
                    data: streams.watts_seapower,
                    formatter: x => `${label}: ${H.number(x)} <abbr class="unit short">w</abbr>`,
                    colorSteps: ns.hslValueGradientSteps([0, 100, 400, 1200],
                        {hStart: 208, hEnd: 256, sStart: 0, sEnd: 100, lStart: 80, lEnd: 40})
                });
            } else if (g === 'pace') {
                const thresholds = {
                    ride: [4, 12, 20, 28],
                    run: [0.5, 2, 5, 10],
                    swim: [0.5, 0.85, 1.1, 1.75],
                }[activityType] || [0.5, 10, 15, 30];
                const label = await LM(paceType === 'speed' ? 'speed' : 'pace');
                specs.push({
                    data: streams.velocity_smooth || smoothVelocity('distance', streams),
                    formatter: x =>
                        `${label}: ${H.pace(x, {velocity: true, html: true, suffix: true, type: paceType})}`,
                    colorSteps: ns.hslValueGradientSteps(thresholds,
                        {hStart: 216, sStart: 100, lStart: 84, lEnd: 20}),
                });
            } else if (g === 'cadence') {
                const unit = L.cadenceFormatter.shortUnitKey();
                const format = x => L.cadenceFormatter.format(x);
                const label = await LM('cadence');
                const thresholds = {
                    ride: [40, 80, 120, 150],
                    run: [50, 80, 90, 100],
                    swim: [20, 25, 30, 35],
                }[activityType] || [10, 50, 100, 160];
                specs.push({
                    data: streams.cadence,
                    formatter: x => `${label}: ${format(x)} <abbr class="unit short">${unit}</abbr>`,
                    colorSteps: ns.hslValueGradientSteps(thresholds,
                        {hStart: 60, hEnd: 80, sStart: 95, lStart: 50}),
                });
            } else if (g === 'gap') {
                const label = await LM('gap');
                specs.push({
                    data: smoothVelocity('grade_adjusted_distance', streams),
                    formatter: x =>
                        `${label}: ${H.pace(x, {velocity: true, html: true, suffix: true, type: paceType})}`,
                    colorSteps: ns.hslValueGradientSteps([0.5, 2, 5, 10], {
                        hStart: 216, // XXX Change a bit
                        sStart: 100,
                        lStart: 84,
                        lEnd: 20,
                    }),
                });
            } else if (g === 'hr') {
                const unit = L.hrFormatter.shortUnitKey();
                const label = await LM('heartrate');
                specs.push({
                    data: streams.heartrate,
                    formatter: x => `${label}: ${H.number(x)} <abbr class="unit short">${unit}</abbr>`,
                    colorSteps: ns.hslValueGradientSteps([40, 100, 150, 200],
                        {hStart: 0, sStart: 50, sEnd: 100, lStart: 50})
                });
            } else if (g === 'vam') {
                specs.push({
                    data: sauce.geo.createVAMStream(streams.time, streams.altitude).slice(1),
                    formatter: x => `VAM: ${H.number(x)} <abbr class="unit short">Vm/h</abbr>`,
                    colorSteps: ns.hslValueGradientSteps([-500, 500, 1000, 2000],
                        {hStart: 261, sStart: 65, sEnd: 100, lStart: 75, lend: 50}),
                });
            } else if (g === 'elevation') {
                const unit = L.elevationFormatter.shortUnitKey();
                const label = await LM('elevation');
                specs.push({
                    data: streams.altitude,
                    formatter: x => `${label}: ${H.elevation(x)} <abbr class="unit short">${unit}</abbr>`,
                    colorSteps: ns.hslValueGradientSteps([0, 1000, 2000, 4000],
                        {hStart: 0, sStart: 0, lStart: 60, lEnd: 20}),
                });
            } else {
                throw new TypeError(`Invalid graph: ${g}`);
            }
        }
        if (!specs.length) {
            $el.empty();
        } else {
            const opacityLimit = 0.25;
            const maxMarginLimit = 2;
            const minMarginLimit = 0.8;
            let opacity = 0.85;
            let maxMargin = 0;
            let minMargin = minMarginLimit + 0.1;
            let composite = false;
            for (const spec of specs) {
                let data = spec.data;
                if (!data) {
                    const id = Array.from(graphs)[specs.indexOf(spec)];
                    console.error(`Invalid info graph data for: ${id}`);
                    continue;
                }
                if (data.length > 120) {
                    data = sauce.data.resample(data, 120);
                }
                const dataMin = sauce.data.min(data);
                const dataMax = sauce.data.max(data);
                const range = (dataMax - dataMin) || 1;
                minMargin -= minMarginLimit / specs.length;
                $el.sparkline(data, {
                    type: 'line',
                    width,
                    height,
                    lineColor: '#EA400DA0',
                    composite,
                    disableHiddenCheck: true,  // Fix issue with detached composite render
                    fillColor: {
                        type: 'gradient',
                        opacity,
                        steps: spec.colorSteps
                    },
                    chartRangeMin: dataMin - (range * minMargin),
                    chartRangeMax: dataMax + (range * maxMargin),
                    tooltipFormatter: (_, __, data) => {
                        const idx = Math.floor(data.fillColor.steps.length / 2);
                        const legendColor = data.fillColor.steps[idx].color;
                        return `
                            <div class="jqs-legend" style="background-color: ${legendColor};"></div>
                            ${spec.formatter(data.y)}
                        `;
                    }
                });
                composite = true;
                opacity -= opacityLimit / specs.length;
                maxMargin += maxMarginLimit / specs.length;
            }
        }
    };
});
