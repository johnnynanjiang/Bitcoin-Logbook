/*
 * Bitcoin DCA calculator: shared helpers (dates, price CSV, schedules).
 * Plain JavaScript, no dependencies. Loaded by index.html as a classic <script>
 * (works from file:// too) and by the tests in Node via require().
 *
 * The strategy model (strategies, trades, valuation) is in lib/engine.js.
 * Dates are UTC calendar days, written 'YYYY-MM-DD'.
 */
(function (root) {
  'use strict';

  var DAY = 86400000;

  var FREQUENCIES = {
    daily: 'Daily',
    weekly: 'Weekly',
    fortnightly: 'Fortnightly',
    monthly: 'Monthly'
  };

  /* ------------------------------------------------------------ dates */

  function toMs(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) throw new Error('Invalid date "' + date + '"');
    var ms = Date.parse(date + 'T00:00:00Z');
    if (isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== date) throw new Error('Invalid date "' + date + '"');
    return ms;
  }

  function toDate(ms) {
    return new Date(ms).toISOString().slice(0, 10);
  }

  function addDays(date, days) {
    return toDate(toMs(date) + days * DAY);
  }

  /* ------------------------------------------------------------ price data */

  /** Parse "date,close" CSV into { prices: {date: close}, dates, firstDate, lastDate, count }. */
  function parseCsv(text) {
    var lines = String(text).replace(/\r/g, '').trim().split('\n');
    if (lines[0].trim() !== 'date,close') throw new Error('Price CSV must start with the header "date,close"');
    var prices = {};
    var dates = [];
    for (var i = 1; i < lines.length; i++) {
      var parts = lines[i].split(',');
      var date = parts[0];
      var close = Number(parts[1]);
      toMs(date); // throws on a bad date
      if (!(close > 0)) throw new Error('Price CSV line ' + (i + 1) + ': invalid close "' + parts[1] + '"');
      prices[date] = close;
      dates.push(date);
    }
    if (!dates.length) throw new Error('Price CSV has no rows');
    return { prices: prices, dates: dates, firstDate: dates[0], lastDate: dates[dates.length - 1], count: dates.length };
  }

  /* ------------------------------------------------------------ schedules */

  /**
   * Purchase dates from start to end (inclusive), counted from the start date:
   * daily; weekly = every 7 days; fortnightly = every 14 days;
   * monthly = same day of the month, clamped to the month's last day.
   */
  function scheduleDates(start, end, frequency) {
    if (!FREQUENCIES.hasOwnProperty(frequency)) throw new Error('Unknown frequency "' + frequency + '"');
    var s = toMs(start), e = toMs(end), dates = [];
    if (frequency === 'monthly') {
      var d0 = new Date(s), day = d0.getUTCDate();
      for (var k = 0; ; k++) {
        var y = d0.getUTCFullYear(), m = d0.getUTCMonth() + k;
        var lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
        var t = Date.UTC(y, m, Math.min(day, lastDay));
        if (t > e) break;
        dates.push(toDate(t));
      }
      return dates;
    }
    var step = { daily: 1, weekly: 7, fortnightly: 14 }[frequency];
    for (var t2 = s; t2 <= e; t2 += step * DAY) dates.push(toDate(t2));
    return dates;
  }

  var api = {
    DAY: DAY,
    FREQUENCIES: FREQUENCIES,
    toMs: toMs,
    toDate: toDate,
    addDays: addDays,
    parseCsv: parseCsv,
    scheduleDates: scheduleDates
  };

  // Keep one shared instance even if the file is loaded twice.
  if (root.BitcoinDCA && root.BitcoinDCA.parseCsv) api = root.BitcoinDCA;
  root.BitcoinDCA = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
