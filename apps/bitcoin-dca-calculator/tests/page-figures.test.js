/*
 * The numbers written into index.html (prefilled example, history table, fee table, FAQ)
 * come from the real price file. If a price revision changes them, these tests fail:
 * update the page text, then the expected values here.
 */
(function () {
  'use strict';
  var test = T.test, assert = T.assert, DCA = BitcoinDCA;
  T.section('Figures on the page', 'index.html');

  var prices = null;
  function run(strategyId, input) {
    if (!prices) prices = DCA.parseCsv(T.priceData().csvText).prices;
    return DCA.getStrategy(strategyId).run({
      prices: prices, amount: input.amount, feePct: input.feePct || 0,
      frequency: input.frequency, start: input.start, end: input.end
    });
  }
  function check(r, e) {
    if ('buys' in e) assert.equal(r.purchases.length, e.buys, 'number of purchases');
    if ('invested' in e) assert.close(r.invested, e.invested, 0.005, 'invested (USD)');
    if ('fees' in e) assert.close(r.fees, e.fees, 0.005, 'fees (USD)');
    if ('btc' in e) assert.close(r.btc, e.btc, 5e-9, 'BTC');
    if ('avgCost' in e) assert.close(r.avgCost, e.avgCost, 0.005, 'average cost (USD)');
    if ('value' in e) assert.close(r.value, e.value, 0.005, 'final value (USD)');
    if ('roiPct' in e) assert.close(r.roi * 100, e.roiPct, 0.005, 'return (%)');
    if ('endPrice' in e) assert.close(r.endPrice, e.endPrice, 0.005, 'end price (USD)');
  }
  var END = '2026-11-15';

  test('prefilled example: $100 weekly, 1 Aug 2025 → 1 Aug 2026', function () {
    T.note('Shown', 'static metrics in index.html and the "How to use" section');
    check(run('standard-dca', { amount: 100, frequency: 'weekly', start: '2025-08-01', end: '2026-08-01' }),
      { buys: 53, invested: 5300, btc: 0.0646696, avgCost: 81955.05, value: 4058.14, roiPct: -23.43, endPrice: 62751.88 });
    check(run('lump-sum', { amount: 5300, start: '2025-08-01', end: '2026-08-01' }),
      { btc: 0.04678584, value: 2935.90, roiPct: -44.61 });
  });

  [
    ['2015-01-01', { buys: 143, invested: 14300, btc: 8.18359919, avgCost: 1747.40, value: 533481.55, roiPct: 3630.64, endPrice: 65189.11 }, 2961480.18],
    ['2018-01-01', { buys: 107, invested: 10700, btc: 0.65324985, avgCost: 16379.64, value: 42584.78, roiPct: 297.99 }, 51804.04],
    ['2021-01-01', { buys: 71, invested: 7100, btc: 0.16472225, avgCost: 43102.86, value: 10738.10, roiPct: 51.24 }, 15753.29]
  ].forEach(function (row) {
    test('history table: $100 monthly from ' + row[0] + ' to ' + END, function () {
      var r = run('standard-dca', { amount: 100, frequency: 'monthly', start: row[0], end: END });
      check(r, row[1]);
      assert.close(run('lump-sum', { amount: r.invested, start: row[0], end: END }).value, row[2], 0.005, 'lump sum of the same total (USD)');
    });
  });

  [
    ['monthly', 100, { buys: 71, fees: 70.29, value: 10631.79, roiPct: 49.74 }],
    ['weekly', 23, { buys: 307, invested: 7061, fees: 303.93, value: 10219.38, roiPct: 44.73 }],
    ['daily', 3.3, { buys: 2145, invested: 7078.5, fees: 2123.55, value: 7484.49, roiPct: 5.74 }]
  ].forEach(function (row) {
    test('fee table: ' + row[0] + ' $' + row[1] + ' with a $0.99 flat fee, 2021 → ' + END, function () {
      check(run('standard-dca', { amount: row[1], frequency: row[0], start: '2021-01-01', end: END, feePct: 0.99 / row[1] * 100 }), row[2]);
    });
  });

  test('fee table: fee-free returns and the FAQ daily/weekly/monthly answer', function () {
    var perMonth = { daily: 100 / 30.4375, weekly: 100 * 12 / 52.1786, monthly: 100 };
    [['2021-01-01', { daily: 51.05, weekly: 51.24, monthly: 51.24 }],
     ['2018-01-01', { daily: 298.93, weekly: 299.15, monthly: 297.99 }]].forEach(function (c) {
      Object.keys(c[1]).forEach(function (f) {
        var r = run('standard-dca', { amount: perMonth[f], frequency: f, start: c[0], end: END });
        assert.close(r.roi * 100, c[1][f], 0.005, f + ' return from ' + c[0] + ' (%)');
      });
    });
    assert.close(run('standard-dca', { amount: 23, frequency: 'weekly', start: '2021-01-01', end: END }).roi * 100, 51.24, 0.005, 'weekly $23, no fee (%)');
    assert.close(run('standard-dca', { amount: 3.3, frequency: 'daily', start: '2021-01-01', end: END }).roi * 100, 51.05, 0.005, 'daily $3.30, no fee (%)');
  });
})();
