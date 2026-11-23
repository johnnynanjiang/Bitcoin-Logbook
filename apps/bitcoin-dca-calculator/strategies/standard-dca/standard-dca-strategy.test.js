/* Tests for strategies/standard-dca/standard-dca-strategy.js. Expected values worked out by hand. */
(function () {
  'use strict';
  var test = T.test, assert = T.assert, DCA = BitcoinDCA;
  T.section('Standard DCA strategy', 'strategies/standard-dca/');

  function series(start, closes) {
    var prices = {};
    closes.forEach(function (c, i) { prices[DCA.addDays(start, i)] = c; });
    return prices;
  }
  // 2024-01-01 .. 2024-01-10
  var P = series('2024-01-01', [100, 200, 100, 50, 100, 100, 100, 100, 100, 400]);

  function run(extra, prices) {
    var o = { strategyId: 'standard-dca', amount: 100, fee: 0, frequency: 'daily', startDate: '2024-01-01', endDate: '2024-01-04' };
    for (var k in extra) o[k] = extra[k];
    return DCA.run(o, prices || P);
  }
  var dates = function (r) { return r.trades.map(function (t) { return t.date; }); };

  test('is a rule: amount, frequency and fee are used; no trade data', function () {
    var s = DCA.getStrategy('standard-dca');
    assert.equal(s.kind, 'rule', 'kind');
    assert.deepEqual(s.uses, { amount: true, frequency: true, fee: true, tradeData: false }, 'uses');
  });

  test('daily, worked by hand', function () {
    var m = run({}).summary;
    // BTC = 100/100 + 100/200 + 100/100 + 100/50 = 4.5 ; invested 400 ; value 4.5 x 50 = 225
    assert.equal(m.buys, 4, 'buys');
    assert.equal(m.sells, 0, 'sells');
    assert.close(m.btcHeld, 4.5, 1e-12, 'BTC');
    assert.close(m.invested, 400, 0, 'invested');
    assert.close(m.totalValue, 225, 1e-9, 'final value');
    assert.close(m.profit, -175, 1e-9, 'profit');
    assert.close(m.roi, -0.4375, 1e-12, 'return');
    assert.close(m.avgCost, 400 / 4.5, 1e-9, 'average cost');
  });

  test('every trade is a buy of the amount per purchase at that day\'s close', function () {
    run({ endDate: '2024-01-10' }).trades.forEach(function (t) {
      assert.equal(t.tradeType + ' ' + t.amount + ' @' + t.atPrice, 'buy 100 @' + P[t.date], t.date);
    });
  });

  test('fee per purchase comes out of each purchase', function () {
    var m = run({ fee: 1, endDate: '2024-01-02' }).summary;
    // $99 buys BTC each day: 99/100 + 99/200 = 1.485
    assert.close(m.btcHeld, 1.485, 1e-12, 'BTC');
    assert.close(m.fees, 2, 1e-12, 'fees');
    assert.close(m.invested, 200, 0, 'invested includes fees');
  });

  test('weekly buys every 7 days from the start date', function () {
    var r = run({ amount: 70, frequency: 'weekly', startDate: '2024-01-02', endDate: '2024-01-10' });
    assert.deepEqual(dates(r), ['2024-01-02', '2024-01-09'], 'buy dates');
    assert.close(r.summary.btcHeld, 70 / 200 + 70 / 100, 1e-12, 'BTC');
    assert.close(r.summary.totalValue, (70 / 200 + 70 / 100) * 400, 1e-9, 'value at the end date close (400)');
  });

  test('fortnightly buys every 14 days', function () {
    var r = run({ amount: 10, frequency: 'fortnightly', endDate: '2024-02-09' }, series('2024-01-01', new Array(40).fill(100)));
    assert.deepEqual(dates(r), ['2024-01-01', '2024-01-15', '2024-01-29'], 'buy dates');
  });

  test('monthly from the 31st clamps to month end', function () {
    var r = run({ amount: 10, frequency: 'monthly', startDate: '2023-12-31', endDate: '2024-05-31' }, series('2023-12-31', new Array(160).fill(50)));
    assert.deepEqual(dates(r), ['2023-12-31', '2024-01-31', '2024-02-29', '2024-03-31', '2024-04-30', '2024-05-31'], 'buy dates');
  });

  test('keeps full precision (no rounding per purchase)', function () {
    var r = run({ amount: 10, endDate: '2024-01-03' }, series('2024-01-01', [30000, 30000, 30000]));
    assert.close(r.summary.btcHeld, 0.001, 1e-18, 'BTC');
  });

  test('timeline has one point per day', function () {
    var r = run({ frequency: 'weekly', endDate: '2024-01-10' });
    assert.equal(r.timeline.length, 10, 'timeline days');
    assert.close(r.timeline[3].value, 50, 1e-9, 'day 4 value = 1 BTC x 50');
    assert.close(r.timeline[3].invested, 100, 0, 'day 4 invested');
  });
})();
