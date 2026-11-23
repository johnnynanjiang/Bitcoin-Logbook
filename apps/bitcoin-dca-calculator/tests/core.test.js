/* Tests for lib/core.js: price CSV parsing, dates, schedules. The strategy model is tested in tests/engine.test.js. */
(function () {
  'use strict';
  var test = T.test, assert = T.assert, core = BitcoinDCA;
  T.section('Core', 'lib/core.js');

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
})();
