/*!
 * chartjs-plugin-crosshair v1.1.6
 * https://chartjs-plugin-crosshair.netlify.com
 * (c) 2020 Chart.js Contributors
 * Released under the MIT license
 */
(function () {
    'use strict';

    const Chart = self.Chart && Object.prototype.hasOwnProperty.call(self.Chart, 'default') ?
        self.Chart['default'] : self.Chart;

    const helpers = Chart.helpers;

    const defaultOptions = {
        enabled: false,
        zoomboxBackgroundColor: 'rgba(66,133,244,0.2)',
        zoomboxBorderColor: '#48F',
        callbacks: {
            beforeZoom: (start, end) => true,
            afterZoom: (start, end) => null
        }
    };

    Chart.plugins.register({
        id: 'zoom',

        afterInit: function(chart) {
            if (chart.config.options.scales.xAxes.length == 0) {
                return;
            }
            const xScaleType = chart.config.options.scales.xAxes[0].type;
            if (xScaleType !== 'linear' &&
                xScaleType !== 'time' &&
                xScaleType !== 'category' &&
                xScaleType !== 'logarithmic') {
                return;
            }
            if (chart.options.plugins.zoom === undefined) {
                chart.options.plugins.zoom = defaultOptions;
            }
            chart._zoomState = {
                enabled: false,
                x: null,
                originalData: [],
                originalXRange: {},
                dragStarted: false,
                dragStartX: null,
                dragEndX: null,
                suppressTooltips: false,
                reset: () => this.resetZoom(chart, false, false),
                resetButton: chart.canvas.closest('.sauce-panel').querySelector('.chart-reset-zoom'),
            };
            chart.panZoom = this.panZoom.bind(this, chart);
            chart._zoomState.resetButton.addEventListener('click', () => this.resetZoom(chart));
            chart.canvas.addEventListener('pointerdown', ev => {
                console.warn("down", ev);
                chart._zoomState.dragCallbacks = {
                    move: this.onPointerMove.bind(this, chart),
                    up: this.onPointerUp.bind(this, chart),
                    out: this.onPointerOut.bind(this, chart),
                };
                chart.canvas.addEventListener('pointermove', chart._zoomState.dragCallbacks.move);
                chart.canvas.addEventListener('pointerup', chart._zoomState.dragCallbacks.up);
                chart.canvas.addEventListener('pointerout', chart._zoomState.dragCallbacks.out);
            });
        },

        onPointerMove: function(chart, ev) {
            console.warn("MOVE");
        },

        onPointerUp: function(chart, ev) {
            console.warn("UP");
            chart.canvas.removeEventListener('pointerup', chart._zoomState.dragCallbacks.up);
            chart.canvas.removeEventListener('pointerout', chart._zoomState.dragCallbacks.out);
            chart.canvas.removeEventListener('pointermove', chart._zoomState.dragCallbacks.move);
        },

        onPointerOut: function(chart, ev) {
            console.warn("OUT");
            chart.canvas.removeEventListener('pointerup', chart._zoomState.dragCallbacks.up);
            chart.canvas.removeEventListener('pointerout', chart._zoomState.dragCallbacks.out);
            chart.canvas.removeEventListener('pointermove', chart._zoomState.dragCallbacks.move);
        },

        panZoom: function(chart, increment) {
            const state = chart._zoomState;
            if (!state.originalData.length) {
                return;
            }
            const diff = state.end - state.start;
            if (increment < 0) { // left
                state.start = Math.max(state.start + increment, state.min);
                state.end = state.start === state.min ? state.min + diff : state.end + increment;
            } else { // right
                state.end = Math.min(state.end + increment, state.max);
                state.start = state.end === state.max ? state.max - diff : state.start + increment;
            }
            this.doZoom(chart, state.start, state.end);
        },

        getOption: function(chart, name) {
            return helpers.getValueOrDefault(chart.options.plugins.zoom ? chart.options.plugins.zoom[name] : undefined, defaultOptions[name]);
        },

        getXScale: function(chart) {
            return chart.data.datasets.length ? chart.scales[chart.getDatasetMeta(0).xAxisID] : null;
        },

        getYScale: function(chart) {
            return chart.scales[chart.getDatasetMeta(0).yAxisID];
        },

        afterEvent: function(chart, e) {
            const state = chart._zoomState;
            if (chart.config.options.scales.xAxes.length == 0) {
                return;
            }
            const xScaleType = chart.config.options.scales.xAxes[0].type;
            if (xScaleType !== 'linear' &&
                xScaleType !== 'time' &&
                xScaleType !== 'category' &&
                xScaleType !== 'logarithmic') {
                return;
            }
            const xScale = this.getXScale(chart);
            if (!xScale) {
                return;
            }
            // fix for Safari
            let buttons = (e.native.buttons === undefined ? e.native.which : e.native.buttons);
            if (e.native.type === 'mouseup') {
                buttons = 0;
            }
            state.suppressTooltips = e.stop;
            state.enabled = (e.type !== 'mouseout' && (e.x > xScale.getPixelForValue(xScale.min) && e.x < xScale.getPixelForValue(xScale.max)));
            if (!state.enabled) {
                if (e.x > xScale.getPixelForValue(xScale.max)) {
                    chart.update();
                }
                return true;
            }
            // handle drag to zoom
            if (buttons === 1 && !state.dragStarted && this.getOption(chart, 'enabled')) {
                state.dragStartX = e.x;
                state.dragStarted = true;
            }
            // handle drag to zoom
            if (state.dragStarted && buttons === 0) {
                state.dragStarted = false;
                var start = xScale.getValueForPixel(state.dragStartX);
                var end = xScale.getValueForPixel(state.x);
                if (Math.abs(state.dragStartX - state.x) > 1) {
                    this.doZoom(chart, start, end);
                }
                chart.update();
            }
            state.x = e.x;
            chart.draw();
        },

        afterDraw: function(chart) {
            const state = chart._zoomState;
            if (!state.enabled) {
                return;
            }
            if (state.dragStarted) {
                this.drawZoombox(chart);
            }
            return true;
        },

        beforeTooltipDraw: function(chart) {
            // suppress tooltips on dragging
            const state = chart._zoomState;
            return !state.dragStarted && !state.suppressTooltips;
        },

        resetZoom: function(chart) {
            const state = chart._zoomState;
            state.resetButton.classList.add('hidden');
            var update = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : true;
            if (update) {
                for (var datasetIndex = 0; datasetIndex < chart.data.datasets.length; datasetIndex++) {
                    var dataset = chart.data.datasets[datasetIndex];
                    dataset.data = state.originalData.shift(0);
                }
                if (state.originalXRange.min) {
                    chart.options.scales.xAxes[0].ticks.min = state.originalXRange.min;
                    state.originalXRange.min = null;
                } else {
                    delete chart.options.scales.xAxes[0].ticks.min;
                }
                if (state.originalXRange.max) {
                    chart.options.scales.xAxes[0].ticks.max = state.originalXRange.max;
                    state.originalXRange.max = null;
                } else {
                    delete chart.options.scales.xAxes[0].ticks.max;
                }
            }
            if (state.button) {
                state.button.classList.add('hidden');
                state.button = false;
            }
            if (update) {
                var anim = chart.options.animation;
                chart.options.animation = false;
                chart.update();
                chart.options.animation = anim;
            }
        },

        doZoom: function(chart, start, end) {
            const state = chart._zoomState;
            // swap start/end if user dragged from right to left
            if (start > end) {
                [start, end] = [end, start];
            }
            const beforeZoomCallback = helpers.getValueOrDefault(chart.options.plugins.zoom.callbacks ?
                chart.options.plugins.zoom.callbacks.beforeZoom : undefined, defaultOptions.callbacks.beforeZoom);
            if (beforeZoomCallback(start, end) === false) {
                return false;
            }
            if (chart.options.scales.xAxes[0].ticks.min && state.originalData.length === undefined) {
                state.originalXRange.min = chart.options.scales.xAxes[0].ticks.min;
            }
            if (chart.options.scales.xAxes[0].ticks.max && state.originalData.length === undefined) {
                state.originalXRange.max = chart.options.scales.xAxes[0].ticks.max;
            }
            state.resetButton.classList.remove('hidden');
            chart.options.scales.xAxes[0].ticks.min = start;
            chart.options.scales.xAxes[0].ticks.max = end;
            const storeOriginals = state.originalData.length === 0;
            for (let i = 0; i < chart.data.datasets.length; i++) {
                const newData = [];
                let index = 0;
                let started;
                let stop;
                if (storeOriginals) {
                    state.originalData[i] = chart.data.datasets[i].data;
                }
                const sourceDataset = state.originalData[i];
                for (let j = 0; j < sourceDataset.length; j++) {
                    const oldData = sourceDataset[j];
                    const oldDataX = this.getXScale(chart).getRightValue(oldData);
                    // append one value outside of bounds
                    if (oldDataX >= start && !started && index > 0) {
                        newData.push(sourceDataset[index - 1]);
                        started = true;
                    }
                    if (oldDataX >= start && oldDataX <= end) {
                        newData.push(oldData);
                    }
                    if (oldDataX > end && !stop && index < sourceDataset.length) {
                        newData.push(oldData);
                        stop = true;
                    }
                    index += 1;
                }
                chart.data.datasets[i].data = newData;
            }
            state.start = start;
            state.end = end;
            if (storeOriginals) {
                const xAxes = this.getXScale(chart);
                state.min = xAxes.min;
                state.max = xAxes.max;
            }
            chart.update();
            const callbacks = this.getOption(chart, 'callbacks');
            callbacks.afterZoom(start, end);
        },

        drawZoombox: function(chart) {
            const state = chart._zoomState;
            const yScale = this.getYScale(chart);
            const borderColor = this.getOption(chart, 'zoomboxBorderColor');
            const fillColor = this.getOption(chart, 'zoomboxBackgroundColor');
            chart.ctx.beginPath();
            chart.ctx.rect(
                state.dragStartX,
                yScale.getPixelForValue(yScale.max),
                state.x - state.dragStartX,
                yScale.getPixelForValue(yScale.min) - yScale.getPixelForValue(yScale.max));
            chart.ctx.lineWidth = 1;
            chart.ctx.strokeStyle = borderColor;
            chart.ctx.fillStyle = fillColor;
            chart.ctx.fill();
            chart.ctx.fillStyle = '';
            chart.ctx.stroke();
            chart.ctx.closePath();
        },
    });
})();
