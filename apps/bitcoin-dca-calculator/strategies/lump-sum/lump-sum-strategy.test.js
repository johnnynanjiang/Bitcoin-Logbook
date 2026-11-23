/* Tests for strategies/lump-sum/lump-sum-strategy.js. */
(function () {
  'use strict';
  var test = T.test, assert = T.assert, DCA = BitcoinDCA;
  T.section('Lump sum strategy', 'strategies/lump-sum/');

  var P = {};
  [100, 200, 100, 50, 100, 100, 100, 100, 100, 400].forEach(function (c, i) { P[DCA.addDays('2024-01-01', i)] = c; });

  function run(extra) {
    var o = { strategyId: 'lump-sum', amount: 400, fee: 0, frequency: 'daily', startDate: '2024-01-01', endDate: '2024-01-04' };
    for (var k in extra) o[k] = extra[k];
    return DCA.run(o, P);
  }

  test('is a rule: amount and fee are used; frequency and trade data are not', function () {
    var s = DCA.getStrategy('lump-sum');
    assert.equal(s.kind, 'rule', 'kind');
    assert.deepEqual(s.uses, { amount: true, frequency: false, fee: true, tradeData: false }, 'uses');
  });

  test('the input becomes one trade: a buy of the amount on the start date', function () {
    var r = run({});
    assert.equal(r.trades.length, 1, 'trades');
    assert.equal(r.trades[0].tradeType, 'buy', 'type');
    assert.equal(r.trades[0].date, '2024-01-01', 'date = start date');
    assert.equal(r.trades[0].amount, 400, 'amount');
  });

  test('spends the amount once, worked by hand', function () {
    var m = run({}).summary;
    // $400 at $100 = 4 BTC; value 4 x 50 = $200
    assert.close(m.invested, 400, 0, 'invested');
    assert.close(m.btcHeld, 4, 1e-12, 'BTC');
    assert.close(m.totalValue, 200, 1e-9, 'final value');
    assert.close(m.roi, -0.5, 1e-12, 'return');
    assert.close(m.avgCost, 100, 1e-9, 'cost = start date close');
  });

  test('fee is charged once', function () {
    var m = run({ fee: 1 }).summary;
    // $396 at $100 = 3.96 BTC
    assert.close(m.fees, 4, 1e-12, 'fees');
    assert.close(m.btcHeld, 3.96, 1e-12, 'BTC');
  });

  test('frequency does not change the result', function () {
    var base = run({ endDate: '2024-01-10' });
    ['daily', 'weekly', 'fortnightly', 'monthly', undefined].forEach(function (f) {
      var r = run({ endDate: '2024-01-10', frequency: f });
      assert.equal(r.trades.length, 1, String(f));
      assert.equal(r.summary.btcHeld, base.summary.btcHeld, String(f));
    });
  });

  test('holds the BTC through the whole window', function () {
    var r = run({ endDate: '2024-01-10' });
    assert.equal(r.timeline.length, 10, 'timeline days');
    r.timeline.forEach(function (p) { assert.close(p.btcHeld, 4, 1e-12, p.date); });
    assert.close(r.summary.totalValue, 1600, 1e-9, '4 BTC x 400 on the end date');
  });

  test('start date equal to end date works', function () {
    var m = run({ startDate: '2024-01-04', endDate: '2024-01-04' }).summary;
    assert.close(m.btcHeld, 8, 1e-12, '$400 at $50');
    assert.close(m.totalValue, 400, 1e-9, 'no change in value');
  });
})();
