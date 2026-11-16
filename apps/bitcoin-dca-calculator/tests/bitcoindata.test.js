/*
 * Comparison with https://bitcoindata.science/dca-calculator
 * Fixture: tests/fixtures/bitcoindata.js, captured from their live page with
 * tests/capture-bitcoindata.js (their displayed results, buy dates and the full
 * price series their calculator used).
 *
 * Part 1: same prices and same buy dates. Our engine must reproduce every number they
 *         display, within their rounding (they round BTC to 8 decimals on each purchase
 *         and show whole dollars).
 * Part 2: our own price file. Only the data differs here, so results should be close but
 *         not identical.
 *
 * Known convention differences (not bugs, so not tested as equal):
 *  - They value holdings at today's spot price; we use the end date's close.
 *  - Their weekly = Mondays, "biweekly" = 1st & 15th, monthly = 1st; ours count from the start date.
 *  - Their recent daily prices are the previous day's close.
 */
(function () {
  'use strict';
  var test = T.test, assert = T.assert, DCA = BitcoinDCA;
  var dca = DCA.getStrategy('standard-dca');
  T.section('Comparison with bitcoindata.science', 'tests/fixtures/bitcoindata.js');

  var cache = {};
  function fixture() {
    if (!cache.fixture) {
      var f = T.bitcoindataFixture();
      f.prices = {};
      f.history.forEach(function (p) { f.prices[p[0]] = p[1]; });
      cache.fixture = f;
    }
    return cache.fixture;
  }
  function ourData() {
    if (!cache.ours) cache.ours = DCA.parseCsv(T.priceData().csvText);
    return cache.ours;
  }

  // Scenario ids are listed here so each gets its own test line.
  var IDS = ['daily-10-2021', 'daily-50-q1-2024', 'monthly-500-2020-2024', 'monthly-100-2013-2025', 'weekly-100-2022-2025', 'weekly-25-2015-2019'];

  function scenario(f, id) {
    var s = f.scenarios.filter(function (x) { return x.id === id; })[0];
    if (!s) throw new Error('Scenario ' + id + ' missing from fixture');
    return s;
  }

  IDS.forEach(function (id) {
    test('same prices: ' + id, function () {
      var f = fixture();
      var s = scenario(f, id), t = s.theirs;
      T.note('Scenario', { amount: s.amount, frequency: s.frequency, start: s.start, end: s.end, feePct: 0 });
      T.note('Prices used', 'bitcoindata.science\'s own price history (' + f.history.length + ' rows), captured ' + f.capturedAt);
      T.note('bitcoindata.science displayed', { purchases: t.purchases, invested: t.invested, btc: t.btc, avgCost: t.avgCost, value: t.value, roiPct: t.roiPct, spot: t.spot });
      T.note('How values are compared', 'They value holdings at their live spot price, so our value = our BTC × their spot. Tolerances allow for their rounding: BTC to 8 decimals on every purchase, whole dollars on screen.');
      (function () {
        var r = dca.run({ prices: f.prices, amount: s.amount, feePct: 0, frequency: s.frequency, start: s.start, end: s.end });

        assert.deepEqual(r.purchases.map(function (p) { return p.date; }), t.buyDates, 'buy dates');
        assert.equal(r.purchases.length, t.purchases, 'number of purchases');
        assert.equal(r.invested, t.invested, 'total invested');

        var btcTol = t.purchases * 5e-9 + 5e-9;          // their per-purchase 8 dp rounding
        assert.close(r.btc, t.btc, btcTol, 'BTC accumulated');

        var value = r.btc * t.spot;                       // they value at spot
        assert.close(value, t.value, 0.5 + btcTol * t.spot, 'portfolio value');
        assert.close(r.avgCost, t.avgCost, 0.005 + t.avgCost * btcTol / t.btc, 'average cost');
        assert.close((value / r.invested - 1) * 100, t.roiPct, 0.005 + (btcTol / t.btc) * (100 + t.roiPct), 'ROI %');
      })();
    });
  });

  IDS.forEach(function (id) {
    test('our price file: ' + id + ' (BTC within 3%)', function () {
      var s = scenario(fixture(), id), ours = ourData();
      T.note('Scenario', { amount: s.amount, frequency: s.frequency, start: s.start, end: s.end, feePct: 0 });
      T.note('Prices used', 'our data/btc-usd-daily.csv (' + ours.count + ' rows, ' + ours.firstDate + ' → ' + ours.lastDate + ')');
      T.note('bitcoindata.science BTC', s.theirs.btc);
      (function () {
        var r = dca.run({ prices: ours.prices, amount: s.amount, feePct: 0, frequency: s.frequency, start: s.start, end: s.end });
        assert.equal(r.purchases.length, s.theirs.purchases, 'number of purchases');
        var diffPct = (r.btc / s.theirs.btc - 1) * 100;
        assert.ok(Math.abs(diffPct) <= 3, 'BTC differs by ' + diffPct.toFixed(2) + '% (ours ' + r.btc.toFixed(8) + ', theirs ' + s.theirs.btc + ')');
      })();
    });
  });
})();
