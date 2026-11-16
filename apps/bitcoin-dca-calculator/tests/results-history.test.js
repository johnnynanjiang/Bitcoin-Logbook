/* Tests for lib/results-history.js: the list of previous calculations used for comparison. */
(function () {
  'use strict';
  var test = T.test, assert = T.assert, core = BitcoinDCA, H = core.history;
  T.section('Results history', 'lib/results-history.js');

  var P = {};
  [100, 200, 100, 50, 100, 100, 100, 100, 100, 400].forEach(function (c, i) { P[core.addDays('2024-01-01', i)] = c; });

  /** Run a strategy and turn the result into a history entry. */
  function entry(strategyId, extra, when) {
    var input = { prices: P, amount: 100, feePct: 0, frequency: 'daily', start: '2024-01-01', end: '2024-01-04' };
    for (var k in extra) input[k] = extra[k];
    var s = core.getStrategy(strategyId);
    return H.makeEntry(s, input, s.run(input), when || new Date('2026-11-16T10:00:00Z'));
  }

  /** A fake localStorage. */
  function memoryStorage() {
    var data = {};
    return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
      setItem: function (k, v) { data[k] = String(v); },
      raw: data
    };
  }

  test('an entry records the input and the output of a calculation', function () {
    var e = entry('standard-dca', { feePct: 1 });
    T.note('Entry', e);
    assert.deepEqual(e.input, { strategyId: 'standard-dca', strategyName: 'Standard DCA', amount: 100, feePct: 1, frequency: 'daily', start: '2024-01-01', end: '2024-01-04' }, 'input');
    assert.equal(e.output.purchases, 4, 'purchases');
    assert.close(e.output.invested, 400, 0, 'invested');
    assert.close(e.output.btc, 4.455, 1e-12, 'BTC (99/100 + 99/200 + 99/100 + 99/50)');
    assert.close(e.output.value, 4.455 * 50, 1e-9, 'final value');
    assert.equal(e.createdAt, '2026-11-16T10:00:00.000Z', 'time of calculation');
  });

  test('an entry stores no frequency for strategies that do not use one', function () {
    assert.equal(entry('lump-sum', { frequency: 'weekly' }).input.frequency, null, 'lump-sum frequency');
  });

  test('each calculation is added to the top of the list', function () {
    var list = [];
    list = H.add(list, entry('standard-dca')).list;
    list = H.add(list, entry('lump-sum')).list;
    list = H.add(list, entry('standard-dca', { frequency: 'weekly' })).list;
    assert.equal(list.length, 3, 'rows');
    assert.deepEqual(list.map(function (e) { return e.input.strategyId + '/' + e.input.frequency; }),
      ['standard-dca/weekly', 'lump-sum/null', 'standard-dca/daily'], 'newest first');
  });

  test('the same input is not added twice; the existing row is returned', function () {
    var first = H.add([], entry('standard-dca'));
    var again = H.add(first.list, entry('standard-dca'));
    assert.equal(again.added, false, 'added');
    assert.equal(again.list.length, 1, 'rows');
    assert.equal(again.entry.id, first.entry.id, 'returns the existing row');
  });

  test('a different amount, fee, frequency, strategy or date makes a new row', function () {
    var list = H.add([], entry('standard-dca')).list;
    [{ amount: 50 }, { feePct: 0.5 }, { frequency: 'weekly' }, { start: '2024-01-02' }, { end: '2024-01-05' }].forEach(function (change) {
      var r = H.add(list, entry('standard-dca', change));
      assert.equal(r.added, true, 'new row for ' + JSON.stringify(change));
      list = r.list;
    });
    assert.equal(H.add(list, entry('lump-sum')).added, true, 'new row for another strategy');
  });

  test('lump sum with a different frequency counts as the same input', function () {
    var list = H.add([], entry('lump-sum', { frequency: 'daily' })).list;
    assert.equal(H.add(list, entry('lump-sum', { frequency: 'monthly' })).added, false, 'added');
  });

  test('the list keeps at most ' + H.MAX_ENTRIES + ' rows, dropping the oldest', function () {
    var list = [];
    for (var i = 1; i <= H.MAX_ENTRIES + 5; i++) list = H.add(list, entry('lump-sum', { amount: i })).list;
    assert.equal(list.length, H.MAX_ENTRIES, 'rows');
    assert.equal(list[0].input.amount, H.MAX_ENTRIES + 5, 'newest kept');
    assert.equal(list[list.length - 1].input.amount, 6, 'oldest 5 dropped');
  });

  test('a row can be removed', function () {
    var a = entry('standard-dca'), b = entry('lump-sum');
    var list = H.add(H.add([], a).list, b).list;
    assert.deepEqual(H.remove(list, a.id).map(function (e) { return e.id; }), [b.id], 'remaining rows');
  });

  test('rows can be sorted by any column, both directions, without changing the list', function () {
    var list = [entry('standard-dca', { amount: 50 }), entry('standard-dca', { amount: 300 }), entry('standard-dca', { amount: 100 })];
    var amounts = function (l) { return l.map(function (e) { return e.input.amount; }); };
    assert.deepEqual(amounts(H.sort(list, 'amount', 'asc')), [50, 100, 300], 'amount ascending');
    assert.deepEqual(amounts(H.sort(list, 'value', 'desc')), [300, 100, 50], 'final value descending');
    assert.deepEqual(amounts(list), [50, 300, 100], 'original list unchanged');
    assert.throws(function () { H.sort(list, 'colour', 'asc'); }, /Unknown column/);
  });

  test('best() finds the row with the highest final value or return', function () {
    var dca = entry('standard-dca', { end: '2024-01-10' });   // ends at 400
    var lump = entry('lump-sum', { end: '2024-01-10' });      // bought at 100, ends at 400 => +300%
    var list = [dca, lump];
    T.note('Returns', { 'standard-dca': dca.output.roi, 'lump-sum': lump.output.roi });
    assert.equal(H.best(list, 'roi'), lump.id, 'best return');
    assert.equal(H.best([dca], 'roi'), null, 'no "best" with a single row');
  });

  test('a row can be re-run from its saved inputs and gives the same results', function () {
    [entry('standard-dca', { feePct: 1, end: '2024-01-10' }), entry('lump-sum', { frequency: 'weekly' }), entry('standard-dca', { frequency: 'weekly', end: '2024-01-10' })]
      .forEach(function (e) {
        var r = H.rerun(e, P);
        var label = e.input.strategyId + '/' + e.input.frequency;
        assert.equal(r.purchases.length, e.output.purchases, label + ' purchases');
        assert.close(r.btc, e.output.btc, 0, label + ' BTC');
        assert.close(r.value, e.output.value, 0, label + ' final value');
      });
  });

  test('a row downloads as a CSV of every purchase', function () {
    var e = entry('standard-dca', { feePct: 1 });
    var csv = H.purchasesCsv(H.rerun(e, P));
    T.note('CSV', csv);
    assert.deepEqual(csv.trim().split('\n'), [
      'date,btc_price_usd,btc_bought,total_btc,total_invested_usd,value_usd',
      '2024-01-01,100,0.99000000,0.99000000,100.00,99.00',
      '2024-01-02,200,0.49500000,1.48500000,200.00,297.00',
      '2024-01-03,100,0.99000000,2.47500000,300.00,247.50',
      '2024-01-04,50,1.98000000,4.45500000,400.00,222.75'
    ], 'CSV lines');
  });

  test('CSV file names describe the row', function () {
    assert.equal(H.fileName(entry('standard-dca', { feePct: 1 }).input), 'bitcoin-dca-standard-dca-daily-100usd-fee1pct-2024-01-01-to-2024-01-04.csv', 'standard DCA with fee');
    assert.equal(H.fileName(entry('lump-sum').input), 'bitcoin-dca-lump-sum-100usd-2024-01-01-to-2024-01-04.csv', 'lump sum (no frequency, no fee)');
  });

  test('the list is saved and loaded back', function () {
    var storage = memoryStorage();
    var list = H.add(H.add([], entry('standard-dca')).list, entry('lump-sum')).list;
    assert.equal(H.save(storage, list), true, 'saved');
    assert.deepEqual(H.load(storage), list, 'loaded');
  });

  test('broken or missing saved data loads as an empty list', function () {
    assert.deepEqual(H.load(memoryStorage()), [], 'nothing saved');
    var bad = memoryStorage();
    bad.setItem(H.STORAGE_KEY, '{not json');
    assert.deepEqual(H.load(bad), [], 'invalid JSON');
    var junk = memoryStorage();
    junk.setItem(H.STORAGE_KEY, JSON.stringify([{ id: 1 }, null, 'x']));
    assert.deepEqual(H.load(junk), [], 'invalid rows are skipped');
    assert.deepEqual(H.load(null), [], 'no storage available');
  });

  test('saving never throws, even if storage is full or blocked', function () {
    var full = { setItem: function () { throw new Error('QuotaExceededError'); } };
    assert.equal(H.save(full, []), false, 'reports failure');
  });
})();
