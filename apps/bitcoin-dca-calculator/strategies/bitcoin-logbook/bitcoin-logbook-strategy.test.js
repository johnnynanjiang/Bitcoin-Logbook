/*
 * Tests for strategies/bitcoin-logbook/: the real Bitcoin Logbook trades (kind 'trades').
 * Source of the trades: /blog/bitcoin-dca-vs-lump-sum/trades.csv, copied into tradeData columns by
 * .github/scripts/build_trade_data.py.
 */
(function () {
  'use strict';
  var test = T.test, assert = T.assert, DCA = BitcoinDCA;
  T.section('Bitcoin Logbook strategy', 'strategies/bitcoin-logbook/');

  var s = DCA.getStrategy('bitcoin-logbook');
  var bundle = (typeof window !== 'undefined' ? window : globalThis).STRATEGY_DATA['bitcoin-logbook'];
  var prices = null;
  function run(extra) {
    if (!prices) prices = DCA.parseCsv(T.priceData().csvText).prices;
    var o = { strategyId: 'bitcoin-logbook', startDate: '2026-02-28', endDate: '2026-11-15' };
    for (var k in extra) o[k] = extra[k];
    return DCA.run(o, prices);
  }

  test('is a trade record: no rule in code, trade data only', function () {
    assert.equal(s.kind, 'trades', 'kind');
    assert.deepEqual(s.uses, { amount: false, frequency: false, fee: false, tradeData: true }, 'uses');
  });

  test('bundles 18 real trades: 14 buys and 4 sells, 28 Feb → 21 Aug 2026', function () {
    var t = s.defaults.tradeData;
    T.note('First trade', t[0]);
    assert.equal(t.length, 18, 'trades');
    assert.equal(t.filter(function (x) { return x.tradeType === 'buy'; }).length, 14, 'buys');
    assert.equal(t.filter(function (x) { return x.tradeType === 'sell'; }).length, 4, 'sells');
    assert.equal(t[0].date, '2026-02-28', 'first trade');
    assert.equal(t[t.length - 1].date, '2026-08-21', 'last trade');
    assert.equal(s.defaults.startDate, '2026-02-28', 'default start date = first trade');
    t.forEach(function (x) { assert.ok(x.amount > 0 && x.amountBTC > 0, x.date + ' has amount and BTC'); });
  });

  test('metadata matches the bundled trades', function () {
    var m = bundle.meta;
    assert.equal(m.rows, 18, 'rows');
    assert.equal(m.buys, 14, 'buys');
    assert.equal(m.sells, 4, 'sells');
    assert.equal(m.firstDate, '2026-02-28', 'first date');
    assert.equal(m.lastDate, '2026-08-21', 'last date');
    assert.equal(m.source, '/blog/bitcoin-dca-vs-lump-sum/trades.csv', 'source');
  });

  test('the whole record, valued at the 15 Nov 2026 close', function () {
    var r = run({}), m = r.summary;
    T.note('Summary', m);
    assert.deepEqual(r.warnings, [], 'no trades left out');
    assert.equal(m.buys, 14, 'buys');
    assert.equal(m.sells, 4, 'sells');
    assert.close(m.invested, 23000, 1e-9, 'invested = Σ buys (USD)');
    assert.close(m.received, 3919.64, 1e-9, 'received = Σ sells (USD)');
    assert.close(m.fees, 91.1741589, 1e-9, 'fees (USD), already inside the amounts');
    assert.close(m.btcHeld, 0.30861485, 1e-12, 'BTC held = 0.36261485 bought − 0.054 sold');
    assert.close(m.endPrice, 65189.11071, 1e-6, 'end price (USD)');
    assert.close(m.value, 20118.33, 0.005, 'BTC value (USD)');
    assert.close(m.totalValue, 24037.97, 0.005, 'final value = BTC value + received (USD)');
    assert.close(m.profit, 1037.97, 0.005, 'profit (USD)');
    assert.close(m.roi * 100, 4.51, 0.005, 'return (%)');
  });

  test('recorded trades are used exactly as recorded; fees are not deducted again', function () {
    var t = run({}).trades[0];
    assert.equal(t.amount, 1000, 'amount');
    assert.equal(t.amountBTC, 0.015206, 'BTC received, not (1000 − 10) / 65015 = 0.015227');
    assert.equal(t.atPrice, 65015, 'recorded price');
    assert.equal(t.fee, 10, 'recorded fee');
    assert.equal(t.platform, 'CoinSpot', 'platform kept');
    assert.equal(t.source, 'recorded', 'source');
  });

  test('amount, frequency and fee in the input change nothing', function () {
    var a = run({}), b = run({ amount: 5, frequency: 'daily', fee: 50 });
    assert.equal(b.input.amount, null, 'amount');
    assert.close(b.summary.totalValue, a.summary.totalValue, 0, 'final value');
  });

  test('narrower dates leave trades out, with a warning', function () {
    var r = run({ endDate: '2026-08-01' });
    assert.equal(r.summary.trades, 16, 'trades up to 1 Aug');
    assert.deepEqual(r.warnings, ['2 trades after the end date left out.'], 'warning');
    var late = run({ startDate: '2026-06-01' });
    assert.equal(late.summary.trades, 13, 'trades from 1 Jun');
    assert.deepEqual(late.warnings, ['5 trades before the start date left out.'], 'warning');
  });

  test('a start date that leaves out the buys behind a sell is an error', function () {
    assert.throws(function () { run({ startDate: '2026-07-01' }); }, /Sell on 2026-07-22 .* more than the 0 BTC held/);
  });

  test('any other trade record can be run by passing its trades as tradeData', function () {
    var r = run({ startDate: '2026-01-01', endDate: '2026-11-15', tradeData: [
      { tradeType: 'buy', date: '2026-02-28', amount: 100.00, amountBTC: 0.0001, atPrice: 123456.00, fee: 0 },
      { tradeType: 'sell', date: '2026-08-21', amount: 100.00, amountBTC: 0.00005, atPrice: 123456.00, fee: 0 }
    ] });
    assert.equal(r.summary.trades, 2, 'trades');
    assert.close(r.summary.btcHeld, 0.00005, 1e-15, 'BTC held');
    assert.close(r.summary.received, 100, 0, 'received');
  });

  if (T.isNode) {
    test('bitcoin-logbook-trades.data.js is an exact copy of the .csv and .meta.json (command line only)', function () {
      var dir = 'strategies/bitcoin-logbook/bitcoin-logbook-trades';
      var csv = T.nodeRead(dir + '.csv'), meta = JSON.parse(T.nodeRead(dir + '.meta.json'));
      assert.ok(bundle.csv === csv, 'CSV text differs; regenerate with: python3 .github/scripts/build_trade_data.py');
      assert.deepEqual(bundle.meta, meta, 'metadata');
      var sha = require('crypto').createHash('sha256').update(csv).digest('hex');
      assert.equal(meta.sha256, sha, 'sha256 of the CSV');
    });

    test('the bundled trades match the source, /blog/bitcoin-dca-vs-lump-sum/trades.csv (command line only)', function () {
      var src = T.nodeRead('../../blog/bitcoin-dca-vs-lump-sum/trades.csv');
      var sha = require('crypto').createHash('sha256').update(src).digest('hex');
      assert.equal(bundle.meta.sourceSha256, sha, 'source changed since the copy was made; regenerate with: python3 .github/scripts/build_trade_data.py');
      var rows = src.replace(/\r/g, '').trim().split('\n').slice(1).map(function (l) { return l.split(','); });
      var mine = s.defaults.tradeData;
      assert.equal(mine.length, rows.length, 'rows');
      rows.forEach(function (r, i) {
        var t = mine[i];
        assert.equal(t.date + ' ' + t.tradeType, r[0] + ' ' + r[1].toLowerCase(), 'row ' + (i + 2) + ' date and side');
        assert.ok(t.amount === +r[2] && t.amountBTC === +r[3] && t.atPrice === +r[4] && t.fee === +r[5] && t.platform === r[6],
          'row ' + (i + 2) + ' amount, BTC, price, fee and platform');
      });
    });
  }
})();
