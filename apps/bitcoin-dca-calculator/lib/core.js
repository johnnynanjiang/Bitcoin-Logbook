/*
 * Bitcoin DCA calculator: shared core used by every strategy.
 * Plain JavaScript, no dependencies. Loaded by index.html as a classic <script>
 * (works from file:// too) and by the tests in Node via require().
 *
 * ---------------------------------------------------------------------------
 * STRATEGY INTERFACE
 * ---------------------------------------------------------------------------
 * A strategy is an object registered with BitcoinDCA.registerStrategy():
 *
 *   {
 *     id:             'standard-dca',             // unique, used in file/folder names
 *     name:           'Standard DCA',             // shown in the UI
 *     description:    'Buy the same amount ...',  // one line, shown in the UI
 *     usesFrequency:  true,                       // false = the UI disables the frequency field
 *     run: function (input) { ... return result; }
 *   }
 *
 * Every strategy's run() accepts the same input:
 *
 *   {
 *     prices:    { 'YYYY-MM-DD': close, ... },   // BTC/USD daily closes
 *     amount:    100,                           // amount per purchase (USD, fee included)
 *     feePct:    0.5,                           // fee per purchase, % of the purchase
 *     frequency: 'daily' | 'weekly' | 'fortnightly' | 'monthly',
 *     start:     'YYYY-MM-DD',                  // start date
 *     end:       'YYYY-MM-DD'                   // end date (valuation date)
 *   }
 *
 * and returns the result of BitcoinDCA.simulate() (see below). A strategy normally
 * just decides WHEN to buy and HOW MUCH, as a plan [{date, amount}], and lets
 * simulate() do the maths so all strategies are valued identically.
 *
 * Rules shared by all strategies
 *  - Dates are UTC calendar days; a purchase fills at that day's close.
 *  - Each purchase spends `amount`; (amount - fee) buys BTC.
 *  - Value = total BTC x the end date's close. Full precision; round only for display.
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

  /* ------------------------------------------------------------ input checks */

  /** Validate the common strategy input; throws a readable Error. */
  function validateInput(input, options) {
    var needsFrequency = !options || options.usesFrequency !== false;
    if (!input || typeof input !== 'object') throw new Error('Strategy input is required');
    if (!input.prices || typeof input.prices !== 'object') throw new Error('Price data is required');
    if (!(input.amount > 0) || !isFinite(input.amount)) throw new Error('Amount per purchase must be greater than 0');
    var fee = input.feePct == null ? 0 : input.feePct;
    if (!(fee >= 0 && fee < 100)) throw new Error('Fee per purchase must be between 0% and 99.99%');
    if (needsFrequency && !FREQUENCIES.hasOwnProperty(input.frequency)) throw new Error('Unknown frequency "' + input.frequency + '"');
    if (toMs(input.start) > toMs(input.end)) throw new Error('The start date must be on or before the end date');
    if (!(input.prices[input.start] > 0)) throw new Error('No price for ' + input.start);
    if (!(input.prices[input.end] > 0)) throw new Error('No price for ' + input.end);
  }

  /* ------------------------------------------------------------ simulation */

  /**
   * Execute a purchase plan and value it day by day.
   * @param {{prices:Object, start:string, end:string, feePct?:number, plan:{date:string, amount:number}[]}} o
   * @returns {{purchases, timeline, invested, fees, btc, avgCost, endPrice, value, profit, roi}}
   */
  function simulate(o) {
    var prices = o.prices, feeRate = (o.feePct || 0) / 100;
    var byDate = {};
    (o.plan || []).forEach(function (p) {
      if (p.date < o.start || p.date > o.end) throw new Error('Purchase on ' + p.date + ' is outside ' + o.start + ' to ' + o.end);
      if (!(p.amount > 0)) throw new Error('Purchase on ' + p.date + ' must have an amount greater than 0');
      byDate[p.date] = (byDate[p.date] || 0) + p.amount;
    });

    var invested = 0, fees = 0, btc = 0, purchases = [], timeline = [];
    for (var t = toMs(o.start); t <= toMs(o.end); t += DAY) {
      var d = toDate(t), price = prices[d];
      if (!(price > 0)) throw new Error('No price for ' + d);
      var spend = byDate[d];
      if (spend) {
        var fee = spend * feeRate;
        var bought = (spend - fee) / price;
        invested += spend;
        fees += fee;
        btc += bought;
        purchases.push({ date: d, price: price, amount: spend, fee: fee, btc: bought, totalBtc: btc, invested: invested, value: btc * price });
      }
      timeline.push({ date: d, price: price, invested: invested, btc: btc, value: btc * price });
    }

    var endPrice = prices[o.end];
    var value = btc * endPrice;
    return {
      purchases: purchases,
      timeline: timeline,
      invested: invested,
      fees: fees,
      btc: btc,
      avgCost: btc > 0 ? invested / btc : 0,
      endPrice: endPrice,
      value: value,
      profit: value - invested,
      roi: invested > 0 ? value / invested - 1 : 0
    };
  }

  /* ------------------------------------------------------------ strategy registry */

  var strategies = {};
  var order = [];

  function registerStrategy(strategy) {
    ['id', 'name', 'description'].forEach(function (k) {
      if (typeof strategy[k] !== 'string' || !strategy[k]) throw new Error('Strategy is missing "' + k + '"');
    });
    if (typeof strategy.run !== 'function') throw new Error('Strategy "' + strategy.id + '" is missing run()');
    if (typeof strategy.usesFrequency !== 'boolean') throw new Error('Strategy "' + strategy.id + '" must set usesFrequency');
    if (!strategies[strategy.id]) order.push(strategy.id);
    strategies[strategy.id] = strategy;
    return strategy;
  }

  function getStrategy(id) {
    var s = strategies[id];
    if (!s) throw new Error('Unknown strategy "' + id + '"');
    return s;
  }

  function listStrategies() {
    return order.map(function (id) { return strategies[id]; });
  }

  var api = {
    DAY: DAY,
    FREQUENCIES: FREQUENCIES,
    toMs: toMs,
    toDate: toDate,
    addDays: addDays,
    parseCsv: parseCsv,
    scheduleDates: scheduleDates,
    validateInput: validateInput,
    simulate: simulate,
    registerStrategy: registerStrategy,
    getStrategy: getStrategy,
    listStrategies: listStrategies
  };

  // Keep one shared instance even if the file is loaded twice.
  if (root.BitcoinDCA && root.BitcoinDCA.registerStrategy) api = root.BitcoinDCA;
  root.BitcoinDCA = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
