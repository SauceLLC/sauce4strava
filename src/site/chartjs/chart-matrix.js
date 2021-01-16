/*!
 * chartjs-chart-matrix v0.1.3
 * https://github.com/kurkle/chartjs-chart-matrix#readme
 * (c) 2019 Jukka Kurkela
 * Released under the MIT license
 */
(function (global, factory) {
typeof exports === 'object' && typeof module !== 'undefined' ? factory(require('chart.js')) :
typeof define === 'function' && define.amd ? define(['chart.js'], factory) :
(global = global || self, factory(global.Chart));
}(this, function (Chart) { 'use strict';

Chart = Chart && Chart.hasOwnProperty('default') ? Chart['default'] : Chart;

var resolve = Chart.helpers.options.resolve;

var Controller = Chart.DatasetController.extend({

	dataElementType: Chart.elements.Rectangle,

	update: function(reset) {
		var me = this;
		var meta = me.getMeta();
		var data = meta.data || [];
		var i, ilen;

		me._xScale = me.getScaleForId(meta.xAxisID);
		me._yScale = me.getScaleForId(meta.yAxisID);

		for (i = 0, ilen = data.length; i < ilen; ++i) {
			me.updateElement(data[i], i, reset);
		}
	},

	updateElement: function(item, index, reset) {
		var me = this;
		var dataset = me.getDataset();
		var datasetIndex = me.index;
		var value = dataset.data[index];
		var xScale = me._xScale;
		var yScale = me._yScale;
		var options = me._resolveElementOptions(item, index);
		var x = reset ? xScale.getBasePixel() : xScale.getPixelForValue(value, index, datasetIndex);
		var y = reset ? yScale.getBasePixel() : yScale.getPixelForValue(value, index, datasetIndex);
		var h = options.height;
		var w = options.width;
		var halfH = h / 2;

		item._xScale = xScale;
		item._yScale = yScale;
		item._options = options;
		item._datasetIndex = datasetIndex;
		item._index = index;

		item._model = {
			x: x,
			base: y - halfH,
			y: y + halfH,
			width: w,
			height: h,
			backgroundColor: options.backgroundColor,
			borderColor: options.borderColor,
			borderSkipped: options.borderSkipped,
			borderWidth: options.borderWidth
		};

		item.pivot();
	},

	draw: function() {
		var me = this;
		var data = me.getMeta().data || [];
		var i, ilen;

		for (i = 0, ilen = data.length; i < ilen; ++i) {
			data[i].draw();
		}
	},

	/**
	 * @private
	 */
	_resolveElementOptions: function(rectangle, index) {
		var me = this;
		var chart = me.chart;
		var datasets = chart.data.datasets;
		var dataset = datasets[me.index];
		var options = chart.options.elements.rectangle;
		var values = {};
		var i, ilen, key;

		// Scriptable options
		var context = {
			chart: chart,
			dataIndex: index,
			dataset: dataset,
			datasetIndex: me.index
		};

		var keys = [
			'backgroundColor',
			'borderColor',
			'borderSkipped',
			'borderWidth',
			'width',
			'height'
		];

		for (i = 0, ilen = keys.length; i < ilen; ++i) {
			key = keys[i];
			values[key] = resolve([
				dataset[key],
				options[key]
			], context, index);
		}

		return values;
	}

});

Chart.controllers.matrix = Controller;
Chart.defaults.matrix = {
	hover: {
		mode: 'nearest',
		intersect: true
	},
	tooltips: {
		mode: 'nearest',
		intersect: true
	},
	scales: {
		xAxes: [{
			type: 'linear'
		}],
		yAxes: [{
			type: 'linear'
		}]
	},
	elements: {
		rectangle: {
			borderSkipped: false,
			width: 20,
			height: 20
		}
	}
};

}));
