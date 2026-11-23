/* Tests for lib/results-history.js: the list of previous calculations used for comparison. */
(function () {
  'use strict';
  var test = T.test, assert = T.assert, DCA = BitcoinDCA, H = DCA.history;
  T.section('Results history', 'lib/results-history.js');

  var P = {};
  [100, 200, 100, 50, 100, 100, 100, 100, 100, 400].forEach(function (c, i) { P[DCA.addDays('2024-01-01', i)] = c; });
  var TRADES = [{ tradeType: 'buy', date: '2024-01-01', amount: 100 }, { tradeType: 'sell', date: '2024-01-02', amountBTC: 0.5 }];

  /** Run a strategy and turn the output into a history entry. */
  function entry(strategyId, extra, when) {
    var input = { strategyId: strategyId, amount: 100, fee: 0, frequency: 'daily', startDate: '2024-01-01', endDate: '2024-01-04', tradeData: TRADES };
    for (var k in extra) input[k] = extra[k];
    return H.makeEntry(DCA.run(input, P), when || new Date('2026-11-16T10:00:00Z'));
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
    var e = entry('standard-dca', { fee: 1 });
    T.note('Entry', e);
    assert.deepEqual(e.input, { strategyId: 'standard-dca', strategyName: 'Standard DCA', amount: 100, fee: 1, frequency: 'daily', startDate: '2024-01-01', endDate: '2024-01-04' }, 'input');
    assert.equal(e.output.buys, 4, 'buys');
    assert.equal(e.output.sells, 0, 'sells');
    assert.close(e.output.invested, 400, 0, 'invested');
    assert.close(e.output.btcHeld, 4.455, 1e-12, 'BTC (99/100 + 99/200 + 99/100 + 99/50)');
    assert.close(e.output.totalValue, 4.455 * 50, 1e-9, 'final value');
    assert.equal(e.createdAt, '2026-11-16T10:00:00.000Z', 'time of calculation');
  });

  test('an entry stores null for inputs a strategy does not use', function () {
    assert.equal(entry('lump-sum', { frequency: 'weekly' }).input.frequency, null, 'lump-sum frequency');
    var rec = entry('bitcoin-logbook').input;
    assert.deepEqual([rec.amount, rec.fee, rec.frequency], [null, null, null], 'trade record: amount, fee, frequency');
  });

  test('an entry with sells records them and the cash received', function () {
    var o = entry('bitcoin-logbook').output;
    assert.equal(o.buys, 1, 'buys');
    assert.equal(o.sells, 1, 'sells');
    assert.close(o.received, 100, 1e-12, 'received (0.5 BTC at 200)');
    assert.close(o.totalValue, 125, 1e-9, 'final value = 0.5 × 50 + 100');
  });

  test('each calculation is added to the top of the list', function () {
    var list = [];
    list = H.add(list, entry('standard-dca')).list;
    list = H.add(list, entry('lump-sum')).list;
    list = H.add(list, entry('bitcoin-logbook')).list;
    list = H.add(list, entry('standard-dca', { frequency: 'weekly' })).list;
    assert.equal(list.length, 4, 'rows');
    assert.deepEqual(list.map(function (e) { return e.input.strategyId + '/' + e.input.frequency; }),
      ['standard-dca/weekly', 'bitcoin-logbook/null', 'lump-sum/null', 'standard-dca/daily'], 'newest first');
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
    [{ amount: 50 }, { fee: 0.5 }, { frequency: 'weekly' }, { startDate: '2024-01-02' }, { endDate: '2024-01-05' }].forEach(function (change) {
      var r = H.add(list, entry('standard-dca', change));
      assert.equal(r.added, true, 'new row for ' + JSON.stringify(change));
      list = r.list;
    });
    assert.equal(H.add(list, entry('lump-sum')).added, true, 'new row for another strategy');
  });

  test('inputs a strategy does not use never make a new row', function () {
    var list = H.add([], entry('lump-sum', { frequency: 'daily' })).list;
    assert.equal(H.add(list, entry('lump-sum', { frequency: 'monthly' })).added, false, 'lump sum, other frequency');
    list = H.add([], entry('bitcoin-logbook')).list;
    assert.equal(H.add(list, entry('bitcoin-logbook', { amount: 5, fee: 3, frequency: 'weekly' })).added, false, 'trade record, other amount/fee/frequency');
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
    assert.deepEqual(amounts(H.sort(list, 'totalValue', 'desc')), [300, 100, 50], 'final value descending');
    assert.deepEqual(amounts(list), [50, 300, 100], 'original list unchanged');
    assert.throws(function () { H.sort(list, 'colour', 'asc'); }, /Unknown column/);
  });

  test('rows without a value in the sorted column (not used) go last, both directions', function () {
    var list = [entry('bitcoin-logbook'), entry('lump-sum', { amount: 300 }), entry('lump-sum', { amount: 50 })];
    var ids = function (l) { return l.map(function (e) { return e.input.strategyId + ':' + e.input.amount; }); };
    assert.deepEqual(ids(H.sort(list, 'amount', 'asc')), ['lump-sum:50', 'lump-sum:300', 'bitcoin-logbook:null'], 'ascending');
    assert.deepEqual(ids(H.sort(list, 'amount', 'desc')), ['lump-sum:300', 'lump-sum:50', 'bitcoin-logbook:null'], 'descending');
  });

  test('best() finds the row with the highest final value or return', function () {
    var dca = entry('standard-dca', { endDate: '2024-01-10' });   // ends at 400
    var lump = entry('lump-sum', { endDate: '2024-01-10' });      // bought at 100, ends at 400 => +300%
    var list = [dca, lump];
    T.note('Returns', { 'standard-dca': dca.output.roi, 'lump-sum': lump.output.roi });
    assert.equal(H.best(list, 'roi'), lump.id, 'best return');
    assert.equal(H.best(list, 'totalValue'), dca.id, 'best final value ($1,000 in, $3,900 out)');
    assert.equal(H.best([dca], 'roi'), null, 'no "best" with a single row');
  });

  test('a row can be re-run from its saved inputs and gives the same results', function () {
    [entry('standard-dca', { fee: 1, endDate: '2024-01-10' }), entry('lump-sum', { frequency: 'weekly' }), entry('standard-dca', { frequency: 'weekly', endDate: '2024-01-10' })]
      .forEach(function (e) {
        var r = H.rerun(e, P).summary;
        var label = e.input.strategyId + '/' + e.input.frequency;
        assert.equal(r.buys, e.output.buys, label + ' buys');
        assert.close(r.btcHeld, e.output.btcHeld, 0, label + ' BTC');
        assert.close(r.totalValue, e.output.totalValue, 0, label + ' final value');
      });
  });

  test('a trade-record row re-runs against its bundled trades', function () {
    var prices = DCA.parseCsv(T.priceData().csvText).prices;
    var e = H.makeEntry(DCA.run({ strategyId: 'bitcoin-logbook', startDate: '2026-02-28', endDate: '2026-11-15' }, prices));
    var r = H.rerun(e, prices).summary;
    assert.equal(r.trades, 18, 'trades');
    assert.close(r.totalValue, e.output.totalValue, 0, 'final value');
  });

  test('a row downloads as a CSV of every trade', function () {
    var e = entry('standard-dca', { fee: 1 });
    var csv = H.tradesCsv(H.rerun(e, P));
    T.note('CSV', csv);
    assert.deepEqual(csv.trim().split('\n'), [
      'tradeType,date,amount,amountBTC,atPrice,fee,btcHeld,invested,received,value,platform,feeEstimated,note',
      'buy,2024-01-01,100,0.99000000,100,1,0.99000000,100.00,0.00,99.00,,,',
      'buy,2024-01-02,100,0.49500000,200,1,1.48500000,200.00,0.00,297.00,,,',
      'buy,2024-01-03,100,0.99000000,100,1,2.47500000,300.00,0.00,247.50,,,',
      'buy,2024-01-04,100,1.98000000,50,1,4.45500000,400.00,0.00,222.75,,,'
    ], 'CSV lines');
  });

  test('CSV file names describe the row', function () {
    assert.equal(H.fileName(entry('standard-dca', { fee: 1 }).input), 'bitcoin-dca-standard-dca-daily-100usd-fee1pct-2024-01-01-to-2024-01-04.csv', 'standard DCA with fee');
    assert.equal(H.fileName(entry('lump-sum').input), 'bitcoin-dca-lump-sum-100usd-2024-01-01-to-2024-01-04.csv', 'lump sum (no frequency, no fee)');
    assert.equal(H.fileName(entry('bitcoin-logbook').input), 'bitcoin-dca-bitcoin-logbook-2024-01-01-to-2024-01-04.csv', 'trade record (no amount)');
  });

  test('the list is saved and loaded back', function () {
    var storage = memoryStorage();
    var list = H.add(H.add([], entry('standard-dca')).list, entry('bitcoin-logbook')).list;
    assert.equal(H.save(storage, list), true, 'saved');
    assert.deepEqual(H.load(storage), list, 'loaded');
  });

  test('rows saved by the previous version are converted when loaded', function () {
    var old = {
      id: 'r1-1', createdAt: '2026-11-16T10:00:00.000Z',
      input: { strategyId: 'lump-sum', strategyName: 'Lump sum', amount: 5300, feePct: 0.5, frequency: 'weekly', start: '2025-08-01', end: '2026-08-01' },
      output: { purchases: 1, invested: 5300, fees: 26.5, btc: 0.0465, avgCost: 113978, endPrice: 62751.88, value: 2918, profit: -2382, roi: -0.449 }
    };
    var storage = memoryStorage();
    storage.setItem(H.STORAGE_KEY, JSON.stringify([old]));
    var e = H.load(storage)[0];
    T.note('Converted', e);
    assert.deepEqual(e.input, { strategyId: 'lump-sum', strategyName: 'Lump sum', amount: 5300, fee: 0.5, frequency: null, startDate: '2025-08-01', endDate: '2026-08-01' }, 'input');
    assert.equal(e.output.buys, 1, 'buys');
    assert.equal(e.output.sells, 0, 'sells');
    assert.equal(e.output.btcHeld, 0.0465, 'BTC');
    assert.equal(e.output.totalValue, 2918, 'final value');
    assert.equal(H.inputKey(e.input), 'lump-sum|5300|0.5||2025-08-01|2026-08-01', 'same key as a new run of the same input');
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
