/* Tests for strategies/standard-dca/standard-dca-strategy.js. Expected values worked out by hand. */
(function () {
  'use strict';
  var test = T.test, assert = T.assert, core = BitcoinDCA;
  var dca = core.getStrategy('standard-dca');
  T.section(dca.name + ' strategy', 'strategies/standard-dca/');

  function series(start, closes) {
    var prices = {};
    closes.forEach(function (c, i) { prices[core.addDays(start, i)] = c; });
    return prices;
  }
  // 2024-01-01 .. 2024-01-10
  var P = series('2024-01-01', [100, 200, 100, 50, 100, 100, 100, 100, 100, 400]);

  function run(extra) {
    var o = { prices: P, amount: 100, feePct: 0, frequency: 'daily', start: '2024-01-01', end: '2024-01-04' };
    for (var k in extra) o[k] = extra[k];
    return dca.run(o);
  }

  test('daily, worked by hand', function () {
    var r = run({});
    // BTC = 100/100 + 100/200 + 100/100 + 100/50 = 4.5 ; invested 400 ; value 4.5 x 50 = 225
    assert.equal(r.purchases.length, 4, 'number of purchases');
    assert.close(r.btc, 4.5, 1e-12, 'BTC');
    assert.close(r.invested, 400, 0, 'invested');
    assert.close(r.value, 225, 1e-9, 'value');
    assert.close(r.profit, -175, 1e-9, 'profit');
    assert.close(r.roi, -0.4375, 1e-12, 'roi');
    assert.close(r.avgCost, 400 / 4.5, 1e-9, 'average cost');
  });

  test('fee per purchase comes out of each purchase', function () {
    var r = run({ feePct: 1, end: '2024-01-02' });
    // $99 buys BTC each day: 99/100 + 99/200 = 1.485
    assert.close(r.btc, 1.485, 1e-12, 'BTC');
    assert.close(r.fees, 2, 1e-12, 'fees');
    assert.close(r.invested, 200, 0, 'invested includes fees');
  });

  test('weekly buys every 7 days from the start date', function () {
    var r = run({ amount: 70, frequency: 'weekly', start: '2024-01-02', end: '2024-01-10' });
    assert.deepEqual(r.purchases.map(function (p) { return p.date; }), ['2024-01-02', '2024-01-09'], 'buy dates');
    assert.close(r.btc, 70 / 200 + 70 / 100, 1e-12, 'BTC');
    assert.close(r.value, (70 / 200 + 70 / 100) * 400, 1e-9, 'value at the end date close (400)');
  });

  test('fortnightly buys every 14 days', function () {
    var prices = series('2024-01-01', new Array(40).fill(100));
    var r = dca.run({ prices: prices, amount: 10, feePct: 0, frequency: 'fortnightly', start: '2024-01-01', end: '2024-02-09' });
    assert.deepEqual(r.purchases.map(function (p) { return p.date; }), ['2024-01-01', '2024-01-15', '2024-01-29'], 'buy dates');
  });

  test('monthly from the 31st clamps to month end', function () {
    var prices = series('2023-12-31', new Array(160).fill(50));
    var r = dca.run({ prices: prices, amount: 10, feePct: 0, frequency: 'monthly', start: '2023-12-31', end: '2024-05-31' });
    assert.deepEqual(r.purchases.map(function (p) { return p.date; }),
      ['2023-12-31', '2024-01-31', '2024-02-29', '2024-03-31', '2024-04-30', '2024-05-31'], 'buy dates');
  });

  test('keeps full precision (no rounding per purchase)', function () {
    var r = dca.run({ prices: series('2024-01-01', [30000, 30000, 30000]), amount: 10, feePct: 0, frequency: 'daily', start: '2024-01-01', end: '2024-01-03' });
    assert.close(r.btc, 0.001, 1e-18, 'BTC');
  });

  test('timeline has one point per day', function () {
    var r = run({ frequency: 'weekly', end: '2024-01-10' });
    assert.equal(r.timeline.length, 10, 'timeline days');
    assert.close(r.timeline[3].value, 50, 1e-9, 'day 4 value = 1 BTC x 50');
    assert.close(r.timeline[3].invested, 100, 0, 'day 4 invested');
  });
})();
