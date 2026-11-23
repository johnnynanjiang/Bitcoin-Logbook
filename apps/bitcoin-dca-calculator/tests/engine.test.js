/* Tests for lib/engine.js: strategy kinds and registry, input, trades, fill, valuation, trades CSV. */
(function () {
  'use strict';
  var test = T.test, assert = T.assert, DCA = BitcoinDCA;
  T.section('Engine', 'lib/engine.js');

  var P = {};
  [100, 200, 100, 50, 100, 100, 100, 100, 100, 400].forEach(function (c, i) { P[DCA.addDays('2024-01-01', i)] = c; });

  /** Run a list of trades through the engine (Bitcoin Logbook is a 'trades' strategy, so it takes any tradeData). */
  function runTrades(tradeData, start, end) {
    return DCA.run({ strategyId: 'bitcoin-logbook', startDate: start || '2024-01-01', endDate: end || '2024-01-04', tradeData: tradeData }, P);
  }

  function rule(extra) {
    var o = { id: 'test-fixture', name: 'Test fixture', description: 'Test only.', kind: 'rule',
      uses: { amount: true, frequency: false, fee: true, tradeData: false }, rule: function () { return []; } };
    for (var k in extra) o[k] = extra[k];
    return o;
  }

  /** Define a strategy for one test only. */
  function withStrategy(def, fn) {
    DCA.defineStrategy(def);
    try { fn(DCA.getStrategy(def.id)); } finally { DCA.removeStrategy(def.id); }
  }

  /* ---------------- kinds and registry ---------------- */

  test('three kinds of strategy: trades, rule, rule+data', function () {
    assert.deepEqual(Object.keys(DCA.KINDS), ['trades', 'rule', 'rule+data'], 'kinds');
    assert.equal(DCA.getStrategy('standard-dca').kind, 'rule', 'Standard DCA');
    assert.equal(DCA.getStrategy('lump-sum').kind, 'rule', 'Lump sum');
    assert.equal(DCA.getStrategy('bitcoin-logbook').kind, 'trades', 'Bitcoin Logbook');
  });

  test('defineStrategy rejects definitions that do not fit their kind', function () {
    assert.throws(function () { DCA.defineStrategy(rule({ kind: 'magic' })); }, /kind must be one of/);
    assert.throws(function () { DCA.defineStrategy(rule({ rule: undefined })); }, /missing rule/);
    assert.throws(function () { DCA.defineStrategy(rule({ uses: { amount: true } })); }, /uses\.frequency/);
    assert.throws(function () { DCA.defineStrategy(rule({ id: 'Not Kebab' })); }, /kebab-case/);
    assert.throws(function () { DCA.defineStrategy(rule({ name: '' })); }, /name/);
    assert.throws(function () { DCA.defineStrategy(rule({ kind: 'trades', uses: { amount: false, frequency: false, fee: false, tradeData: true } })); }, /has no rule/);
    assert.throws(function () { DCA.defineStrategy(rule({ kind: 'trades', rule: undefined })); }, /must use tradeData/);
    assert.throws(function () { DCA.defineStrategy(rule({ kind: 'rule+data' })); }, /needs data/);
    assert.throws(function () { DCA.defineStrategy(rule({ data: { x: [] } })); }, /only kind "rule\+data"/);
    assert.throws(function () { DCA.getStrategy('test-fixture'); }, /Unknown strategy/);
  });

  test('getStrategy finds a strategy by id or by name', function () {
    assert.equal(DCA.getStrategy('standard-dca').name, 'Standard DCA', 'by id');
    assert.equal(DCA.getStrategy('Standard DCA').id, 'standard-dca', 'by name');
    assert.equal(DCA.getStrategy('bitcoin logbook').id, 'bitcoin-logbook', 'by name, any case');
    assert.throws(function () { DCA.getStrategy('nope'); }, /Unknown strategy/);
  });

  /* ---------------- input ---------------- */

  test('input: fields a strategy does not use become null', function () {
    var i = DCA.normaliseInput({ strategyName: 'Lump sum', startDate: '2024-01-01', endDate: '2024-01-04', amount: 100, frequency: 'weekly', fee: 1, tradeData: [{}] }, P).input;
    T.note('Normalised input', i);
    assert.deepEqual(i, { schema: DCA.SCHEMA_INPUT, strategyId: 'lump-sum', strategyName: 'Lump sum', strategyKind: 'rule',
      startDate: '2024-01-01', endDate: '2024-01-04', amount: 100, frequency: null, fee: 1, tradeData: null }, 'lump sum input');
    var r = DCA.normaliseInput({ strategyId: 'bitcoin-logbook', startDate: '2024-01-01', endDate: '2024-01-04', amount: 5, fee: 50, frequency: 'daily', tradeData: [] }, P).input;
    assert.equal(r.amount, null, 'trade record: amount');
    assert.equal(r.fee, null, 'trade record: fee');
    assert.equal(r.frequency, null, 'trade record: frequency');
  });

  test('input: the fee defaults to 0 and a strategy can supply default values', function () {
    assert.equal(DCA.normaliseInput({ strategyId: 'lump-sum', startDate: '2024-01-01', endDate: '2024-01-04', amount: 100 }, P).input.fee, 0, 'fee');
    var logbook = DCA.getStrategy('bitcoin-logbook');
    var i = DCA.normaliseInput({ strategyId: 'bitcoin-logbook', endDate: '2026-11-15' }, BitcoinDCA.parseCsv(T.priceData().csvText).prices).input;
    assert.equal(i.startDate, logbook.defaults.startDate, 'start date defaults to the first trade');
    assert.equal(i.tradeData.length, logbook.defaults.tradeData.length, 'trades default to the bundled record');
  });

  test('input: invalid values are rejected with readable messages', function () {
    var base = { strategyId: 'standard-dca', startDate: '2024-01-01', endDate: '2024-01-04', amount: 100, frequency: 'daily', fee: 0 };
    function bad(extra) { var o = {}; for (var k in base) o[k] = base[k]; for (var j in extra) o[j] = extra[j]; return function () { DCA.normaliseInput(o, P); }; }
    assert.throws(bad({ amount: 0 }), /Amount/);
    assert.throws(bad({ amount: NaN }), /Amount/);
    assert.throws(bad({ fee: -1 }), /Fee/);
    assert.throws(bad({ fee: 100 }), /Fee/);
    assert.throws(bad({ frequency: 'biweekly' }), /frequency/);
    assert.throws(bad({ startDate: '2024-01-05', endDate: '2024-01-04' }), /start date/);
    assert.throws(bad({ startDate: '2023-12-31' }), /No price for 2023-12-31/);
    assert.throws(bad({ endDate: '2024-02-01' }), /No price for 2024-02-01/);
    assert.throws(bad({ startDate: '2024-1-1' }), /Invalid date/);
    assert.throws(bad({ strategyId: 'nope' }), /Unknown strategy/);
  });

  /* ---------------- trades ---------------- */

  test('trade data is checked: type, date, numbers, amount or BTC', function () {
    var ok = { tradeType: 'Buy', date: '2024-01-01', amount: '100' };
    assert.deepEqual(DCA.normaliseTrade(ok), { tradeType: 'buy', date: '2024-01-01', amount: 100, amountBTC: null, atPrice: null, fee: null }, 'normalised');
    assert.throws(function () { DCA.normaliseTrade({ tradeType: 'hold', date: '2024-01-01', amount: 1 }); }, /tradeType/);
    assert.throws(function () { DCA.normaliseTrade({ tradeType: 'buy', date: '2024-13-01', amount: 1 }); }, /Invalid date/);
    assert.throws(function () { DCA.normaliseTrade({ tradeType: 'buy', date: '2024-01-01', amount: -5 }); }, /amount must be a number/);
    assert.throws(function () { DCA.normaliseTrade({ tradeType: 'sell', date: '2024-01-01' }); }, /needs an amount or amountBTC/);
    assert.throws(function () { DCA.normaliseTrade({ tradeType: 'buy', date: '2024-01-01', amount: 1, atPrice: 0 }); }, /atPrice/);
  });

  /* ---------------- fill ---------------- */

  test('fill: a buy of USD gets the close, the fee and the BTC', function () {
    var t = DCA.fillTrade({ tradeType: 'buy', date: '2024-01-02', amount: 100 }, 1, 200);
    assert.close(t.atPrice, 200, 0, 'price = close');
    assert.close(t.fee, 1, 1e-12, 'fee = 1% of 100');
    assert.close(t.amountBTC, 99 / 200, 1e-15, 'BTC = (100 − 1) / 200');
    assert.equal(t.source, 'generated', 'source');
  });

  test('fill: a buy of BTC works out the USD spent', function () {
    var t = DCA.fillTrade({ tradeType: 'buy', date: '2024-01-02', amountBTC: 0.99 }, 1, 100);
    assert.close(t.amount, 100, 1e-9, 'USD = 0.99 × 100 / (1 − 1%)');
    assert.close(t.fee, 1, 1e-9, 'fee');
  });

  test('fill: a sell of BTC receives the USD after the fee', function () {
    var t = DCA.fillTrade({ tradeType: 'sell', date: '2024-01-02', amountBTC: 0.5 }, 1, 200);
    assert.close(t.fee, 1, 1e-12, 'fee = 1% of 0.5 × 200');
    assert.close(t.amount, 99, 1e-12, 'received = 100 − 1');
  });

  test('fill: a sell for USD works out the BTC sent', function () {
    var t = DCA.fillTrade({ tradeType: 'sell', date: '2024-01-02', amount: 99 }, 1, 200);
    assert.close(t.amountBTC, 0.5, 1e-12, 'BTC = (99 + 1) / 200');
  });

  test('fill: a recorded trade (amount and BTC) is kept exactly; its fee is never deducted again', function () {
    var rec = { tradeType: 'buy', date: '2024-01-02', amount: 1000, amountBTC: 0.015206, atPrice: 65015, fee: 10 };
    var t = DCA.fillTrade(rec, 1, 200);
    assert.equal(t.amount, 1000, 'amount');
    assert.equal(t.amountBTC, 0.015206, 'BTC as recorded, not (1000 − 10) / price');
    assert.equal(t.atPrice, 65015, 'recorded price, not the close');
    assert.equal(t.fee, 10, 'recorded fee');
    assert.equal(t.close, 200, 'close kept for reference');
    assert.equal(t.source, 'recorded', 'source');
    assert.equal(DCA.fillTrade({ tradeType: 'sell', date: '2024-01-02', amount: 10, amountBTC: 0.1 }, 0, 100).fee, 0, 'missing fee on a recorded trade = 0');
  });

  test('fill: a trade\'s own fee or price wins over the input fee and the close', function () {
    var t = DCA.fillTrade({ tradeType: 'buy', date: '2024-01-02', amount: 100, fee: 3, atPrice: 97 }, 1, 200);
    assert.close(t.fee, 3, 0, 'fee');
    assert.close(t.amountBTC, 1, 1e-12, '(100 − 3) / 97');
  });

  /* ---------------- run ---------------- */

  test('run: buys and sells, worked by hand', function () {
    // Buy $100 at 100 = 1 BTC. Sell 0.5 BTC at 200 = $100 received. Hold 0.5 BTC; end close 50.
    var r = runTrades([{ tradeType: 'buy', date: '2024-01-01', amount: 100 }, { tradeType: 'sell', date: '2024-01-02', amountBTC: 0.5 }]);
    var m = r.summary;
    assert.equal(m.buys, 1, 'buys');
    assert.equal(m.sells, 1, 'sells');
    assert.close(m.invested, 100, 0, 'invested');
    assert.close(m.received, 100, 1e-12, 'received');
    assert.close(m.btcHeld, 0.5, 1e-12, 'BTC held');
    assert.close(m.value, 25, 1e-9, 'value = 0.5 × 50');
    assert.close(m.totalValue, 125, 1e-9, 'total value = value + received');
    assert.close(m.profit, 25, 1e-9, 'profit = 125 − 100');
    assert.close(m.roi, 0.25, 1e-12, 'return');
    assert.close(m.avgCost, 100, 1e-9, 'average cost = invested / BTC bought');
    assert.equal(r.schema, DCA.SCHEMA_OUTPUT, 'schema');
  });

  test('run: running totals on each trade and one timeline point per day', function () {
    var r = runTrades([{ tradeType: 'buy', date: '2024-01-01', amount: 100 }, { tradeType: 'sell', date: '2024-01-02', amountBTC: 0.5 }]);
    var sell = r.trades[1];
    assert.close(sell.btcHeld, 0.5, 1e-12, 'BTC held after the sell');
    assert.close(sell.invested, 100, 0, 'invested so far');
    assert.close(sell.received, 100, 1e-12, 'received so far');
    assert.equal(r.timeline.length, 4, 'days');
    assert.close(r.timeline[3].totalValue, 125, 1e-9, 'last day total value');
    assert.close(r.timeline[0].value, 100, 1e-9, 'day 1 value = 1 BTC × 100');
  });

  test('run: same-day trades keep their order; trades are sorted by date', function () {
    var r = runTrades([
      { tradeType: 'sell', date: '2024-01-03', amountBTC: 0.2, note: 'b' },
      { tradeType: 'buy', date: '2024-01-03', amount: 100, note: 'a' },
      { tradeType: 'buy', date: '2024-01-01', amount: 100, note: 'first' }
    ]);
    assert.deepEqual(r.trades.map(function (t) { return t.note; }), ['first', 'b', 'a'], 'order');
  });

  test('run: a sell larger than the BTC held is an error', function () {
    assert.throws(function () { runTrades([{ tradeType: 'buy', date: '2024-01-01', amount: 100 }, { tradeType: 'sell', date: '2024-01-02', amountBTC: 1.5 }]); }, /Sell on 2024-01-02 .* more than the 1 BTC held/);
  });

  test('run: trade-record trades outside the dates are left out with a warning', function () {
    var r = runTrades([{ tradeType: 'buy', date: '2024-01-01', amount: 100 }, { tradeType: 'buy', date: '2024-01-02', amount: 100 }, { tradeType: 'buy', date: '2024-01-09', amount: 100 }], '2024-01-02', '2024-01-04');
    assert.equal(r.summary.buys, 1, 'buys inside the window');
    assert.deepEqual(r.warnings, ['1 trade before the start date and 1 trade after the end date left out.'], 'warning');
  });

  test('run: a rule that returns a trade outside the dates is a bug and throws', function () {
    withStrategy(rule({ rule: function () { return [{ tradeType: 'buy', date: '2024-01-09', amount: 1 }]; } }), function () {
      assert.throws(function () { DCA.run({ strategyId: 'test-fixture', startDate: '2024-01-01', endDate: '2024-01-04', amount: 1 }, P); }, /outside/);
    });
  });

  test('run: no trades gives zeros, not NaN', function () {
    var m = runTrades([]).summary;
    assert.equal(m.btcHeld, 0, 'BTC');
    assert.equal(m.avgCost, 0, 'average cost');
    assert.equal(m.roi, 0, 'return');
  });

  test('run: a gap in the prices is an error', function () {
    var gappy = {};
    for (var d in P) gappy[d] = P[d];
    delete gappy['2024-01-02'];
    assert.throws(function () { DCA.run({ strategyId: 'lump-sum', startDate: '2024-01-01', endDate: '2024-01-03', amount: 1 }, gappy); }, /2024-01-02/);
  });

  /* ---------------- rule + data ---------------- */

  test('rule+data: a rule reads its own data; sells go through the same engine', function () {
    withStrategy(rule({
      kind: 'rule+data', uses: { amount: true, frequency: true, fee: true, tradeData: false },
      data: { weights: [{ date: '2024-01-02', weight: 0 }, { date: '2024-01-03', weight: 3 }], sells: [{ date: '2024-01-04', amountBTC: 1 }] },
      rule: function (input, ctx) {
        var w = {};
        ctx.data.weights.forEach(function (r) { w[r.date] = r.weight; });
        ctx.data.weights.length = 0; // changing ctx.data must not change the strategy
        return ctx.schedule(input.startDate, input.endDate, input.frequency)
          .filter(function (d) { return w[d] !== 0; })
          .map(function (d) { return { tradeType: 'buy', date: d, amount: input.amount * (w[d] == null ? 1 : w[d]) }; })
          .concat(ctx.data.sells.map(function (s) { return { tradeType: 'sell', date: s.date, amountBTC: s.amountBTC }; }));
      }
    }), function () {
      var input = { strategyId: 'test-fixture', startDate: '2024-01-01', endDate: '2024-01-04', amount: 100, frequency: 'daily', fee: 0 };
      var a = DCA.run(input, P), b = DCA.run(input, P);
      // buys: 100 @100 = 1, skip 01-02, 300 @100 = 3, 100 @50 = 2 → 6 BTC; sell 1 BTC @50 = $50
      assert.deepEqual(a.trades.map(function (t) { return t.tradeType + ' ' + t.amount; }), ['buy 100', 'buy 300', 'buy 100', 'sell 50'], 'trades');
      assert.close(a.summary.btcHeld, 5, 1e-12, 'BTC held');
      assert.close(b.summary.invested, a.summary.invested, 0, 'second run unchanged (data is read-only)');
    });
  });

  test('ctx.price reads a close and refuses a missing day', function () {
    var ctx = DCA.makeContext(DCA.getStrategy('standard-dca'), P);
    assert.equal(ctx.price('2024-01-02'), 200, 'close');
    assert.throws(function () { ctx.price('2030-01-01'); }, /No price/);
  });

  /* ---------------- trades CSV ---------------- */

  test('trades CSV: tradeData columns first, then running totals', function () {
    var r = runTrades([{ tradeType: 'buy', date: '2024-01-01', amount: 100, platform: 'Kraken, US' }, { tradeType: 'sell', date: '2024-01-02', amountBTC: 0.5 }]);
    var csv = DCA.tradesToCsv(r.trades);
    T.note('CSV', csv);
    assert.deepEqual(csv.trim().split('\n'), [
      'tradeType,date,amount,amountBTC,atPrice,fee,btcHeld,invested,received,value,platform,feeEstimated,note',
      'buy,2024-01-01,100,1.00000000,100,0,1.00000000,100.00,0.00,100.00,"Kraken, US",,',
      'sell,2024-01-02,100,0.50000000,200,0,0.50000000,100.00,100.00,100.00,,,'
    ], 'lines');
  });

  test('trades CSV round trip: any run\'s CSV, fed back as tradeData, gives the same result', function () {
    var dca = DCA.run({ strategyId: 'standard-dca', startDate: '2024-01-01', endDate: '2024-01-10', amount: 70, frequency: 'daily', fee: 1.5 }, P);
    var replay = runTrades(DCA.tradesFromCsv(DCA.tradesToCsv(dca.trades)), '2024-01-01', '2024-01-10');
    assert.equal(replay.summary.trades, dca.summary.trades, 'trades');
    assert.close(replay.summary.invested, dca.summary.invested, 1e-9, 'invested');
    assert.close(replay.summary.btcHeld, dca.summary.btcHeld, 1e-7, 'BTC held (CSV keeps 8 decimals)');
    assert.close(replay.summary.fees, dca.summary.fees, 1e-8, 'fees');
  });

  test('tradesFromCsv reads quoted cells, ignores unknown columns and reports bad lines', function () {
    var t = DCA.tradesFromCsv('\uFEFFdate,tradeType,amount,extra,note\r\n2024-01-01,buy,100,x,"a, ""b"""\r\n');
    assert.deepEqual(t, [{ tradeType: 'buy', date: '2024-01-01', amount: 100, amountBTC: null, atPrice: null, fee: null, note: 'a, "b"' }], 'trades');
    assert.throws(function () { DCA.tradesFromCsv('date,amount\n2024-01-01,1\n'); }, /tradeType/);
    assert.throws(function () { DCA.tradesFromCsv('tradeType,date,amount\nbuy,2024-01-01,1\nhold,2024-01-02,1\n'); }, /line 3/);
  });
})();
