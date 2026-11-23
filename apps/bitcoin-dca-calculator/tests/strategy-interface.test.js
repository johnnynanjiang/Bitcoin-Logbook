/*
 * Every registered strategy, whatever its kind, must follow the common model:
 * same input, same output shape, trades that add up, unused fields ignored, no look-ahead.
 * New strategies are checked automatically once they are in tests/manifest.js.
 */
(function () {
  'use strict';
  var test = T.test, assert = T.assert, DCA = BitcoinDCA;

  var P = {};
  [100, 200, 100, 50, 100, 100, 100, 100, 100, 400].forEach(function (c, i) { P[DCA.addDays('2024-01-01', i)] = c; });

  // Trade-record strategies get these trades (a buy, a sell, a recorded buy) so every kind has trades to check.
  var TRADES = [
    { tradeType: 'buy', date: '2024-01-01', amount: 100 },
    { tradeType: 'sell', date: '2024-01-02', amountBTC: 0.25 },
    { tradeType: 'buy', date: '2024-01-04', amount: 60, amountBTC: 1.1, atPrice: 52, fee: 2 }
  ];
  var INPUT = { startDate: '2024-01-01', endDate: '2024-01-10', amount: 100, frequency: 'weekly', fee: 1, tradeData: TRADES };

  function input(s, extra) {
    var o = { strategyId: s.id };
    for (var k in INPUT) o[k] = INPUT[k];
    for (var j in extra) o[j] = extra[j];
    return o;
  }

  T.section('Engine', 'lib/engine.js');
  test('strategy registry has Standard DCA, Lump sum and Bitcoin Logbook', function () {
    assert.deepEqual(DCA.listStrategies().map(function (s) { return s.id; }), ['standard-dca', 'lump-sum', 'bitcoin-logbook'], 'strategies, in menu order');
  });

  test('the no-look-ahead check catches a rule that reads a future price', function () {
    DCA.defineStrategy({ id: 'test-cheat', name: 'Cheat', description: 'Test only.', kind: 'rule',
      uses: { amount: true, frequency: false, fee: false, tradeData: false },
      rule: function (i, ctx) { return [{ tradeType: 'buy', date: i.startDate, amount: ctx.price(i.endDate) > 300 ? i.amount : 1 }]; } });
    try {
      var later = {};
      for (var d in P) later[d] = d > '2024-01-05' ? P[d] / 3 : P[d];
      var i = { strategyId: 'test-cheat', startDate: '2024-01-01', endDate: '2024-01-10', amount: 100 };
      assert.ok(DCA.run(i, P).trades[0].amount !== DCA.run(i, later).trades[0].amount, 'the cheating rule changes an early trade');
    } finally {
      DCA.removeStrategy('test-cheat');
    }
  });

  // The common checks are listed inside each strategy's own section.
  DCA.listStrategies().forEach(function (s) {
    T.section(s.name + ' strategy', 'strategies/' + s.id + '/');

    test('common model: has id, name, description, kind and uses', function () {
      assert.ok(/^[a-z0-9-]+$/.test(s.id), 'id is kebab-case');
      assert.ok(s.name.length > 0 && s.description.length > 0, 'name and description');
      assert.ok(DCA.KINDS.hasOwnProperty(s.kind), 'kind ' + s.kind);
      ['amount', 'frequency', 'fee', 'tradeData'].forEach(function (k) { assert.equal(typeof s.uses[k], 'boolean', 'uses.' + k); });
      assert.equal(typeof s.rule, 'function', 'rule (the engine supplies it for trade records)');
    });

    test('common model: returns the common output shape', function () {
      var r = DCA.run(input(s), P);
      ['trades', 'buys', 'sells', 'invested', 'received', 'fees', 'btcBought', 'btcSold', 'btcHeld', 'avgCost', 'endPrice', 'value', 'totalValue', 'profit', 'roi'].forEach(function (k) {
        assert.ok(typeof r.summary[k] === 'number' && isFinite(r.summary[k]), k + ' is a finite number');
      });
      assert.ok(Array.isArray(r.trades) && r.trades.length > 0, 'trades');
      assert.equal(r.timeline.length, 10, 'one timeline point per day');
      assert.equal(r.summary.endPrice, 400, 'valued at the end date close');
      assert.ok(Array.isArray(r.warnings), 'warnings');
      assert.equal(r.input.strategyId, s.id, 'input echoed');
    });

    test('common model: trades add up to the summary', function () {
      var r = DCA.run(input(s), P), m = r.summary;
      var sum = { buy: { usd: 0, btc: 0, n: 0 }, sell: { usd: 0, btc: 0, n: 0 } }, fees = 0;
      r.trades.forEach(function (t) {
        assert.ok(t.date >= INPUT.startDate && t.date <= INPUT.endDate, 'trade on ' + t.date + ' inside the dates');
        assert.ok(t.amount > 0 && t.amountBTC > 0 && t.atPrice > 0 && t.fee >= 0, 'trade on ' + t.date + ' is complete');
        sum[t.tradeType].usd += t.amount; sum[t.tradeType].btc += t.amountBTC; sum[t.tradeType].n++;
        fees += t.fee;
      });
      assert.equal(m.buys, sum.buy.n, 'buys');
      assert.equal(m.sells, sum.sell.n, 'sells');
      assert.close(m.invested, sum.buy.usd, 1e-9, 'invested = Σ buy amounts');
      assert.close(m.received, sum.sell.usd, 1e-9, 'received = Σ sell amounts');
      assert.close(m.fees, fees, 1e-9, 'fees = Σ fees');
      assert.close(m.btcHeld, sum.buy.btc - sum.sell.btc, 1e-12, 'BTC held = bought − sold');
      assert.close(m.value, m.btcHeld * m.endPrice, 1e-9, 'value = BTC held × end price');
      assert.close(m.totalValue, m.value + m.received, 1e-9, 'total value = value + received');
      assert.close(m.profit, m.totalValue - m.invested, 1e-9, 'profit');
    });

    test('common model: input fields it does not use are null and change nothing', function () {
      var a = DCA.run(input(s), P);
      var other = {};
      if (!s.uses.amount) other.amount = 12345;
      if (!s.uses.frequency) other.frequency = 'daily';
      if (!s.uses.fee) other.fee = 50;
      if (!s.uses.tradeData) other.tradeData = [{ tradeType: 'buy', date: '2024-01-05', amount: 999 }];
      var b = DCA.run(input(s, other), P);
      Object.keys(other).forEach(function (k) { assert.equal(b.input[k], null, k + ' is null'); });
      assert.close(b.summary.totalValue, a.summary.totalValue, 0, 'same final value');
    });

    test('common model: rejects invalid input for the fields it uses', function () {
      if (s.uses.amount) assert.throws(function () { DCA.run(input(s, { amount: 0 }), P); }, /Amount/);
      if (s.uses.fee) assert.throws(function () { DCA.run(input(s, { fee: 100 }), P); }, /Fee/);
      if (s.uses.frequency) assert.throws(function () { DCA.run(input(s, { frequency: 'yearly' }), P); }, /frequency/);
      if (s.uses.tradeData) assert.throws(function () { DCA.run(input(s, { tradeData: [{ tradeType: 'gift', date: '2024-01-02', amount: 1 }] }), P); }, /tradeType/);
      assert.throws(function () { DCA.run(input(s, { startDate: '2024-01-05', endDate: '2024-01-04' }), P); }, /start date/);
      assert.throws(function () { DCA.run(input(s, { endDate: '2024-02-01' }), P); }, /2024-02-01/);
    });

    test('common model: no look-ahead (later prices never change earlier trades)', function () {
      var later = {};
      for (var d in P) later[d] = d > '2024-01-05' ? P[d] * 3 : P[d];
      var early = function (r) {
        return JSON.stringify(r.trades.filter(function (t) { return t.date <= '2024-01-05'; }).map(function (t) { return [t.tradeType, t.date, t.amount, t.amountBTC]; }));
      };
      assert.equal(early(DCA.run(input(s), later)), early(DCA.run(input(s), P)), 'trades up to 2024-01-05');
    });

    test('common model: same input, same output', function () {
      assert.equal(JSON.stringify(DCA.run(input(s), P)), JSON.stringify(DCA.run(input(s), P)), 'output');
    });
  });
})();
