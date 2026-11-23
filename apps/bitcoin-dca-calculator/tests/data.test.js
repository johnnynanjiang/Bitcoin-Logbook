/* Checks the real price file the calculator ships with. */
(function () {
  'use strict';
  var test = T.test, assert = T.assert, DCA = BitcoinDCA;
  T.section('Price data', 'data/btc-usd-daily.csv');

  var cached = null;
  function load() {
    if (!cached) {
      var d = T.priceData();
      cached = { csv: DCA.parseCsv(d.csvText), meta: d.meta };
    }
    T.note('Price file', (T.isNode ? 'data/btc-usd-daily.csv' : 'data/btc-usd-daily.js (copy of the .csv)') + ': ' + cached.csv.count + ' rows, ' + cached.csv.firstDate + ' → ' + cached.csv.lastDate);
    return cached;
  }

  test('price file starts on the first traded day, 2010-07-18', function () {
    assert.equal(load().csv.firstDate, '2010-07-18', 'first date');
  });

  test('price file has one row for every day, no gaps or duplicates', function () {
    var dates = load().csv.dates;
    for (var i = 1; i < dates.length; i++) {
      assert.equal(dates[i], DCA.addDays(dates[i - 1], 1), 'row ' + (i + 2));
    }
  });

  test('price file ends on a finished UTC day', function () {
    var today = new Date().toISOString().slice(0, 10);
    var last = load().csv.lastDate;
    assert.ok(last < today, 'last row ' + last + ' must be before today (' + today + ')');
  });

  test('metadata matches the price file', function () {
    var d = load();
    assert.equal(d.meta.rows, d.csv.count, 'rows');
    assert.equal(d.meta.firstDate, d.csv.firstDate, 'firstDate');
    assert.equal(d.meta.lastDate, d.csv.lastDate, 'lastDate');
  });

  test('known closes are in the file (spot checks)', function () {
    var p = load().csv.prices;
    assert.equal(p['2010-07-18'], 0.08584, 'close on 2010-07-18');
    assert.ok(p['2017-12-17'] > 18000 && p['2017-12-17'] < 20000, '2017 peak about $19k');
    assert.ok(p['2021-11-10'] > 60000, 'November 2021 above $60k');
  });

  test('the whole history runs through every strategy', function () {
    var c = load().csv;
    DCA.listStrategies().forEach(function (s) {
      var m = DCA.run({ strategyId: s.id, amount: 100, fee: 0, frequency: 'monthly', startDate: c.firstDate, endDate: c.lastDate }, c.prices).summary;
      assert.ok(m.totalValue > 0 && isFinite(m.roi), s.id + ': finite result');
    });
    var m = DCA.run({ strategyId: 'standard-dca', amount: 100, fee: 0, frequency: 'monthly', startDate: c.firstDate, endDate: c.lastDate }, c.prices).summary;
    assert.ok(m.buys > 190, 'monthly buys since 2010');
  });

  // The browser tests read data/btc-usd-daily.js; make sure it is an exact copy of the real files.
  if (T.isNode) {
    test('data/btc-usd-daily.js is an exact copy of the .csv and .meta.json (command line only)', function () {
      var real = T.priceData();
      delete globalThis.BTC_USD_DAILY;
      require('../data/btc-usd-daily.js');
      var copy = globalThis.BTC_USD_DAILY;
      assert.ok(copy, 'btc-usd-daily.js defines BTC_USD_DAILY');
      assert.ok(copy.csv === real.csvText, 'CSV text differs; regenerate with: python3 .github/scripts/update_btc_prices.py --js-only');
      assert.deepEqual(copy.meta, real.meta, 'metadata');
    });
  }
})();
