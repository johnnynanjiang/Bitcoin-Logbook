/* Tests for lib/core.js: CSV parsing, dates, schedules, input validation, simulation, registry. */
(function () {
  'use strict';
  var test = T.test, assert = T.assert, core = BitcoinDCA;
  T.section('Core', 'lib/core.js');

  function series(start, closes) {
    var prices = {};
    closes.forEach(function (c, i) { prices[core.addDays(start, i)] = c; });
    return prices;
  }
  var P = series('2024-01-01', [100, 200, 100, 50, 100, 100, 100, 100, 100, 400]);

  /* ---------------- parseCsv ---------------- */

  test('parseCsv reads rows, first/last date and count', function () {
    var d = core.parseCsv('date,close\n2020-01-01,7200.17\n2020-01-02,6985.47\n');
    assert.deepEqual(d.prices, { '2020-01-01': 7200.17, '2020-01-02': 6985.47 }, 'prices');
    assert.equal(d.firstDate, '2020-01-01', 'first date');
    assert.equal(d.lastDate, '2020-01-02', 'last date');
    assert.equal(d.count, 2, 'row count');
  });

  test('parseCsv accepts Windows line endings', function () {
    assert.equal(core.parseCsv('date,close\r\n2020-01-01,1\r\n').count, 1, 'row count');
  });

  test('parseCsv rejects a missing header', function () {
    assert.throws(function () { core.parseCsv('2020-01-01,1\n'); }, /header/);
  });

  test('parseCsv rejects bad dates and prices', function () {
    assert.throws(function () { core.parseCsv('date,close\n2020-1-1,5\n'); }, /Invalid date/);
    assert.throws(function () { core.parseCsv('date,close\n2020-02-30,5\n'); }, /Invalid date/);
    assert.throws(function () { core.parseCsv('date,close\n2020-01-01,0\n'); }, /line 2/);
    assert.throws(function () { core.parseCsv('date,close\n2020-01-01,abc\n'); }, /line 2/);
  });

  /* ---------------- dates ---------------- */

  test('addDays crosses month, year and leap day', function () {
    assert.equal(core.addDays('2024-02-28', 1), '2024-02-29', '2024-02-28 + 1 day');
    assert.equal(core.addDays('2024-02-29', 1), '2024-03-01', '2024-02-29 + 1 day');
    assert.equal(core.addDays('2023-12-31', 1), '2024-01-01', '2023-12-31 + 1 day');
    assert.equal(core.addDays('2024-03-10', -10), '2024-02-29', '2024-03-10 − 10 days');
  });

  /* ---------------- scheduleDates ---------------- */

  test('frequencies are daily, weekly, fortnightly, monthly', function () {
    assert.deepEqual(Object.keys(core.FREQUENCIES), ['daily', 'weekly', 'fortnightly', 'monthly'], 'frequency ids');
    assert.equal(core.FREQUENCIES.fortnightly, 'Fortnightly', 'fortnightly label');
  });

  test('daily schedule includes the start and end date', function () {
    assert.deepEqual(core.scheduleDates('2024-01-30', '2024-02-02', 'daily'), ['2024-01-30', '2024-01-31', '2024-02-01', '2024-02-02'], 'buy dates');
  });

  test('weekly schedule counts every 7 days from the start date (a Wednesday here)', function () {
    assert.deepEqual(core.scheduleDates('2024-01-03', '2024-01-31', 'weekly'), ['2024-01-03', '2024-01-10', '2024-01-17', '2024-01-24', '2024-01-31'], 'buy dates');
  });

  test('fortnightly schedule counts every 14 days', function () {
    assert.deepEqual(core.scheduleDates('2024-01-01', '2024-02-15', 'fortnightly'), ['2024-01-01', '2024-01-15', '2024-01-29', '2024-02-12'], 'buy dates');
  });

  test('monthly schedule keeps the same day of the month', function () {
    assert.deepEqual(core.scheduleDates('2024-01-15', '2024-04-15', 'monthly'), ['2024-01-15', '2024-02-15', '2024-03-15', '2024-04-15'], 'buy dates');
  });

  test('monthly from the 31st uses each month\'s last day and does not drift', function () {
    assert.deepEqual(core.scheduleDates('2023-12-31', '2024-05-31', 'monthly'),
      ['2023-12-31', '2024-01-31', '2024-02-29', '2024-03-31', '2024-04-30', '2024-05-31'], 'buy dates');
  });

  test('monthly from the 29th handles a non-leap February', function () {
    assert.deepEqual(core.scheduleDates('2023-01-29', '2023-03-29', 'monthly'), ['2023-01-29', '2023-02-28', '2023-03-29'], 'buy dates');
  });

  test('same start and end gives one date; reversed dates give none', function () {
    assert.deepEqual(core.scheduleDates('2024-05-05', '2024-05-05', 'weekly'), ['2024-05-05'], 'same start and end');
    assert.deepEqual(core.scheduleDates('2024-05-06', '2024-05-05', 'daily'), [], 'start after end');
  });

  test('unknown frequency (including the old "biweekly") is rejected', function () {
    assert.throws(function () { core.scheduleDates('2024-01-01', '2024-02-01', 'hourly'); }, /frequency/);
    assert.throws(function () { core.scheduleDates('2024-01-01', '2024-02-01', 'biweekly'); }, /frequency/);
  });

  /* ---------------- validateInput ---------------- */

  function input(extra) {
    var o = { prices: P, amount: 100, feePct: 0, frequency: 'daily', start: '2024-01-01', end: '2024-01-04' };
    for (var k in extra) o[k] = extra[k];
    return o;
  }

  test('validateInput accepts a valid input', function () {
    core.validateInput(input({}));
  });

  test('validateInput rejects bad amount, fee, frequency and dates', function () {
    assert.throws(function () { core.validateInput(input({ amount: 0 })); }, /Amount/);
    assert.throws(function () { core.validateInput(input({ amount: NaN })); }, /Amount/);
    assert.throws(function () { core.validateInput(input({ feePct: -1 })); }, /Fee/);
    assert.throws(function () { core.validateInput(input({ feePct: 100 })); }, /Fee/);
    assert.throws(function () { core.validateInput(input({ frequency: 'yearly' })); }, /frequency/);
    assert.throws(function () { core.validateInput(input({ start: '2024-01-05', end: '2024-01-04' })); }, /start date/);
    assert.throws(function () { core.validateInput(input({ start: '2023-12-31' })); }, /2023-12-31/);
    assert.throws(function () { core.validateInput(input({ end: '2024-02-01' })); }, /2024-02-01/);
  });

  test('validateInput skips the frequency check for strategies that do not use it', function () {
    core.validateInput(input({ frequency: undefined }), { usesFrequency: false });
  });

  /* ---------------- simulate ---------------- */

  test('simulate executes a plan, worked by hand', function () {
    var r = core.simulate({ prices: P, start: '2024-01-01', end: '2024-01-04', feePct: 0,
      plan: [{ date: '2024-01-01', amount: 100 }, { date: '2024-01-02', amount: 300 }] });
    // 100/100 + 300/200 = 2.5 BTC; invested 400; value 2.5 x 50 = 125
    assert.close(r.btc, 2.5, 1e-12, 'BTC');
    assert.close(r.invested, 400, 0, 'invested');
    assert.close(r.value, 125, 1e-9, 'value');
    assert.close(r.roi, 125 / 400 - 1, 1e-12, 'roi');
    assert.equal(r.purchases.length, 2, 'number of purchases');
    assert.equal(r.timeline.length, 4, 'timeline days');
  });

  test('simulate takes the fee out of each purchase', function () {
    var r = core.simulate({ prices: P, start: '2024-01-01', end: '2024-01-02', feePct: 1, plan: [{ date: '2024-01-01', amount: 100 }] });
    assert.close(r.btc, 0.99, 1e-12, 'BTC');
    assert.close(r.fees, 1, 1e-12, 'fees');
    assert.close(r.invested, 100, 0, 'invested includes the fee');
  });

  test('simulate rejects purchases outside the window and gaps in prices', function () {
    assert.throws(function () { core.simulate({ prices: P, start: '2024-01-02', end: '2024-01-03', plan: [{ date: '2024-01-01', amount: 1 }] }); }, /outside/);
    var gappy = series('2024-01-01', [1, 2, 3]);
    delete gappy['2024-01-02'];
    assert.throws(function () { core.simulate({ prices: gappy, start: '2024-01-01', end: '2024-01-03', plan: [] }); }, /2024-01-02/);
  });

  test('simulate with no purchases returns zeros, not NaN', function () {
    var r = core.simulate({ prices: P, start: '2024-01-01', end: '2024-01-02', plan: [] });
    assert.equal(r.btc, 0, 'BTC');
    assert.equal(r.avgCost, 0, 'average cost');
    assert.equal(r.roi, 0, 'roi');
  });

  /* ---------------- registry ---------------- */

  test('registerStrategy rejects strategies that do not follow the interface', function () {
    assert.throws(function () { core.registerStrategy({ id: 'x', name: 'X', description: 'd', usesFrequency: true }); }, /run/);
    assert.throws(function () { core.registerStrategy({ id: 'x', name: 'X', description: 'd', run: function () {} }); }, /usesFrequency/);
    assert.throws(function () { core.registerStrategy({ name: 'X', description: 'd', usesFrequency: true, run: function () {} }); }, /id/);
  });

  test('getStrategy finds registered strategies and rejects unknown ids', function () {
    assert.equal(core.getStrategy('standard-dca').id, 'standard-dca', 'standard-dca found');
    assert.equal(core.getStrategy('lump-sum').id, 'lump-sum', 'lump-sum found');
    assert.throws(function () { core.getStrategy('nope'); }, /Unknown strategy/);
  });
})();
