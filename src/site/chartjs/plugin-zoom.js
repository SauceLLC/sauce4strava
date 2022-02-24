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
            // beforeZoom: (start, end) => [true, end],
            // afterZoom: (start, end) => null
        }
    };

    Chart.plugins.register({
        id: 'zoom',

        afterInit: function(chart) {
            if (!this.getOption(chart, 'enabled')) {
                return;
            }
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
                originalData: [],
                originalXRange: {},
                dragActive: false,
                dragStartX: null,
                dragCurX: null,
                resetButton: chart.canvas.closest('.sauce-panel').querySelector('.chart-reset-zoom'),
            };
            chart._zoomState.resetButton.addEventListener('click', () => this.resetZoom(chart));
            chart.canvas.addEventListener('pointerdown', ev => {
                this.removePointerCallbacks(chart);
                if (ev.buttons !== /*primary*/ 1) {
                    return;
                }
                const xScale = this.getXScale(chart);
                if (ev.offsetX < xScale.getPixelForValue(xScale.min) ||
                    ev.offsetX > xScale.getPixelForValue(xScale.max)) {
                    return; // Out of bounds
                }
                ev.preventDefault();
                const state = chart._zoomState;
                state.dragCallbacks = {
                    move: this.onPointerMove.bind(this, chart, state),
                    done: this.onPointerDone.bind(this, chart, state),
                };
                chart.canvas.addEventListener('pointermove', state.dragCallbacks.move);
                document.addEventListener('pointerup', state.dragCallbacks.done);
                document.addEventListener('pointercancel', state.dragCallbacks.done);
                state.dragCurX = (state.dragStartX = ev.offsetX);
            });
        },

        onPointerMove: function(chart, state, ev) {
            if (!ev.buttons) {
                // It's possible for the window to lose focus and the pointercancel and pointerup events
                // are never sent. In this case we're listening for a move still but the primary button
                // is not pressed, so treat this like a cancel.
                state.dragActive = false;
                this.onPointerDone(chart, state, ev);
                return;
            }
            state.dragCurX = ev.offsetX;
            const delta = Math.abs(state.dragStartX - state.dragCurX);
            state.dragActive = delta > 2;
            chart.draw();
        },

        removePointerCallbacks: function(chart) {
            const state = chart._zoomState;
            if (state.dragCallbacks) {
                document.removeEventListener('pointerup', state.dragCallbacks.done);
                document.removeEventListener('pointercancel', state.dragCallbacks.done);
                chart.canvas.removeEventListener('pointermove', state.dragCallbacks.move);
                state.dragCallbacks = null;
            }
        },

        onPointerDone: function(chart, state, ev) {
            this.removePointerCallbacks(chart);
            if (state.dragActive) {
                const xScale = this.getXScale(chart);
                const start = xScale.getValueForPixel(state.dragStartX);
                const end = xScale.getValueForPixel(state.dragCurX);
                this.doZoom(chart, start, end);
            }
            state.dragActive = false;
            state.dragCurX = null;
            state.dragStartX = null;
            chart.update();
            chart.draw();
        },

        getOption: function(chart, name) {
            return helpers.getValueOrDefault(chart.options.plugins.zoom ?
                chart.options.plugins.zoom[name] : undefined, defaultOptions[name]);
        },

        getXScale: function(chart) {
            return chart.data.datasets.length ? chart.scales[chart.getDatasetMeta(0).xAxisID] : null;
        },

        getYScale: function(chart) {
            return chart.scales[chart.getDatasetMeta(0).yAxisID];
        },

        afterDraw: function(chart) {
            if (!this.getOption(chart, 'enabled')) {
                return;
            }
            const state = chart._zoomState;
            if (state.dragActive) {
                this.drawZoombox(chart);
            }
            return true;
        },

        resetZoom: function(chart) {
            const state = chart._zoomState;
            state.resetButton.classList.add('hidden');
            for (const x of chart.data.datasets) {
                x.data = state.originalData.shift(0);
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
            const save = chart.options.animation;
            chart.options.animation = false;
            try {
                chart.update();
            } finally {
                chart.options.animation = save;
            }
        },

        doZoom: function(chart, start, end) {
            const state = chart._zoomState;
            // swap start/end if user dragged from right to left
            if (start > end) {
                [start, end] = [end, start];
            }
            const callbacks = this.getOption(chart, 'callbacks');
            if (callbacks.beforeZoom) {
                const ret = callbacks.beforeZoom(start, end);
                if (ret === false) {
                    return false;
                } else if (ret) {
                    [start, end] = ret;
                }
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
            const xScale = this.getXScale(chart);
            for (const ds of chart.data.datasets) {
                const data = ds.data;
                if (storeOriginals) {
                    state.originalData.push(data);
                }
                const startIdx = data.findIndex(x => xScale.getRightValue(x) >= start);
                let endIdx = data.findIndex(x => xScale.getRightValue(x) > end);
                if (endIdx === -1) {
                    endIdx = data.length;
                }
                ds.data = data.slice(startIdx, endIdx);
            }
            state.start = start;
            state.end = end;
            if (storeOriginals) {
                state.min = xScale.min;
                state.max = xScale.max;
            }
            chart.update();
            if (callbacks.afterZoom) {
                callbacks.afterZoom(start, end);
            }
        },

        drawZoombox: function(chart) {
            const state = chart._zoomState;
            const xScale = this.getXScale(chart);
            const yScale = this.getYScale(chart);
            const borderColor = this.getOption(chart, 'zoomboxBorderColor');
            const fillColor = this.getOption(chart, 'zoomboxBackgroundColor');
            chart.ctx.beginPath();
            let [start, end] = state.dragStartX < state.dragCurX ?
                [state.dragStartX, state.dragCurX] : [state.dragCurX, state.dragStartX];
            start = Math.max(start, xScale.getPixelForValue(xScale.min));
            end = Math.min(end, xScale.getPixelForValue(xScale.max));
            chart.ctx.rect(
                start,
                yScale.getPixelForValue(yScale.max),
                end - start,
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
