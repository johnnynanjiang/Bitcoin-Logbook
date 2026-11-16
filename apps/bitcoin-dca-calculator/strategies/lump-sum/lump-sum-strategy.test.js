/* Tests for strategies/lump-sum/lump-sum-strategy.js. */
(function () {
  'use strict';
  var test = T.test, assert = T.assert, core = BitcoinDCA;
  var lump = core.getStrategy('lump-sum');
  T.section(lump.name + ' strategy', 'strategies/lump-sum/');

  var P = {};
  [100, 200, 100, 50, 100, 100, 100, 100, 100, 400].forEach(function (c, i) { P[core.addDays('2024-01-01', i)] = c; });

  function run(extra) {
    var o = { prices: P, amount: 400, feePct: 0, frequency: 'daily', start: '2024-01-01', end: '2024-01-04' };
    for (var k in extra) o[k] = extra[k];
    return lump.run(o);
  }

  test('buys once and only once, on the start date', function () {
    var r = run({});
    assert.equal(r.purchases.length, 1, 'number of purchases');
    assert.equal(r.purchases[0].date, '2024-01-01', 'purchase date = start date');
  });

  test('spends the amount per purchase once, worked by hand', function () {
    var r = run({});
    // $400 at $100 = 4 BTC; value 4 x 50 = $200
    assert.close(r.invested, 400, 0, 'invested');
    assert.close(r.btc, 4, 1e-12, 'BTC');
    assert.close(r.value, 200, 1e-9, 'value');
    assert.close(r.roi, -0.5, 1e-12, 'roi');
    assert.close(r.avgCost, 100, 1e-9, 'cost = start date close');
  });

  test('fee per purchase is charged once', function () {
    var r = run({ feePct: 1 });
    // $396 at $100 = 3.96 BTC
    assert.close(r.fees, 4, 1e-12, 'fees');
    assert.close(r.btc, 3.96, 1e-12, 'BTC');
  });

  test('frequency does not change the result', function () {
    var base = run({ end: '2024-01-10' });
    ['daily', 'weekly', 'fortnightly', 'monthly', undefined].forEach(function (f) {
      var r = run({ end: '2024-01-10', frequency: f });
      assert.equal(r.purchases.length, 1, String(f));
      assert.equal(r.btc, base.btc, String(f));
    });
  });

  test('holds the BTC through the whole window', function () {
    var r = run({ end: '2024-01-10' });
    assert.equal(r.timeline.length, 10, 'timeline days');
    r.timeline.forEach(function (p) { assert.close(p.btc, 4, 1e-12, p.date); });
    assert.close(r.value, 1600, 1e-9, '4 BTC x 400 on the end date');
  });

  test('start date equal to end date works', function () {
    var r = run({ start: '2024-01-04', end: '2024-01-04' });
    assert.close(r.btc, 8, 1e-12, '$400 at $50');
    assert.close(r.value, 400, 1e-9, 'no change in value');
  });
})();
