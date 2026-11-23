/*
 * Chart markers: one dot per trade on the "Over time" chart.
 * Buys are green, sells red. A dot's AREA is in proportion to the trade's amount (USD), so a
 * $3,000 trade covers 3× the area of a $1,000 one (radius × √3). The largest trade of the run gets
 * the largest radius; dots never shrink below MIN_RADIUS so small trades stay visible.
 * Pure function (no DOM), tested in tests/chart-markers.test.js; index.html draws the SVG.
 */
(function (root) {
  'use strict';
  var core = root.BitcoinDCA || require('./core.js');

  var MAX_RADIUS = 9;     // px, for the largest trade when there is room
  var MIN_RADIUS = 1.5;   // px, floor so tiny trades stay visible

  /**
   * @param {Array} trades   run output trades (tradeType, date, amount, ...)
   * @param {number} [width] plot width in px; with many trades the dots get smaller so they don't overlap
   * @returns {Array<{index, date, tradeType, amount, r}>} in trade order (index = position in trades)
   */
  function chartMarkers(trades, width) {
    if (!trades || !trades.length) return [];
    var maxAmount = 0;
    trades.forEach(function (t) { if (t.amount > maxAmount) maxAmount = t.amount; });
    var rMax = MAX_RADIUS;
    // Diameter at most ~70% of the average gap between trades, so a regular schedule never overlaps.
    if (width > 0) rMax = Math.min(MAX_RADIUS, Math.max(2, width / trades.length * 0.35));
    return trades.map(function (t, index) {
      var r = maxAmount > 0 ? rMax * Math.sqrt(t.amount / maxAmount) : rMax;
      return { index: index, date: t.date, tradeType: t.tradeType, amount: t.amount, r: Math.max(MIN_RADIUS, r) };
    });
  }

  core.chartMarkers = chartMarkers;
  core.chartMarkers.MAX_RADIUS = MAX_RADIUS;
  core.chartMarkers.MIN_RADIUS = MIN_RADIUS;
  if (typeof module !== 'undefined' && module.exports) module.exports = chartMarkers;
})(typeof window !== 'undefined' ? window : globalThis);
