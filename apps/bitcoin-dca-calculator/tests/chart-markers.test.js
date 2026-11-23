/* Tests for lib/chart-markers.js: one dot per trade, colour by type, area in proportion to the amount. */
(function () {
  'use strict';
  var test = T.test, assert = T.assert, DCA = BitcoinDCA, M = DCA.chartMarkers;
  T.section('Chart markers', 'lib/chart-markers.js');

  var TRADES = [
    { tradeType: 'buy', date: '2024-01-01', amount: 1000 },
    { tradeType: 'buy', date: '2024-01-02', amount: 3000 },
    { tradeType: 'sell', date: '2024-01-03', amount: 750 }
  ];

  test('one marker per trade, in order, keeping type, date and amount', function () {
    var m = M(TRADES);
    assert.deepEqual(m.map(function (x) { return x.index + ' ' + x.tradeType + ' ' + x.date + ' ' + x.amount; }),
      ['0 buy 2024-01-01 1000', '1 buy 2024-01-02 3000', '2 sell 2024-01-03 750'], 'markers');
  });

  test('area is in proportion to the amount; the largest trade gets the largest radius', function () {
    var m = M(TRADES);
    T.note('Radii', m.map(function (x) { return x.r; }));
    assert.close(m[1].r, M.MAX_RADIUS, 1e-12, 'largest trade');
    assert.close(m[1].r * m[1].r / (m[0].r * m[0].r), 3, 1e-12, '$3,000 dot has 3× the area of the $1,000 dot');
    assert.close(m[2].r * m[2].r / (m[0].r * m[0].r), 0.75, 1e-12, 'sells sized the same way ($750 = 0.75×)');
  });

  test('equal amounts give equal dots', function () {
    var m = M([{ tradeType: 'buy', date: '2024-01-01', amount: 100 }, { tradeType: 'buy', date: '2024-01-08', amount: 100 }]);
    assert.equal(m[0].r, m[1].r, 'same radius');
  });

  test('tiny trades stay visible', function () {
    var m = M([{ tradeType: 'buy', date: '2024-01-01', amount: 1 }, { tradeType: 'buy', date: '2024-01-02', amount: 1e6 }]);
    assert.equal(m[0].r, M.MIN_RADIUS, 'floor');
  });

  test('many trades in a narrow chart get smaller dots, still in proportion', function () {
    var many = [];
    for (var i = 0; i < 700; i++) many.push({ tradeType: 'buy', date: DCA.addDays('2024-01-01', i), amount: i % 2 ? 400 : 100 });
    var m = M(many, 700);
    assert.close(m[1].r, 2, 1e-12, 'largest dot shrinks to 2px for 700 trades in 700px');
    assert.close(m[0].r, 1.5, 1e-12, 'smaller dot: 2 × √(100/400) = 1, floored to 1.5');
    assert.close(M(TRADES, 700)[1].r, M.MAX_RADIUS, 1e-12, 'few trades keep the full size');
    var weekly = M(many.slice(0, 53).map(function (t) { return { tradeType: 'buy', date: t.date, amount: 100 }; }), 700);
    assert.close(weekly[0].r, 700 / 53 * 0.35, 1e-12, '53 buys in 700px: radius 35% of the gap, so dots do not touch');
  });

  test('no trades, no markers', function () {
    assert.deepEqual(M([]), [], 'empty');
    assert.deepEqual(M(null), [], 'missing');
  });

  test('Bitcoin Logbook: 14 green buys and 4 red sells, $3,000 buys largest', function () {
    var prices = DCA.parseCsv(T.priceData().csvText).prices;
    var m = M(DCA.run({ strategyId: 'bitcoin-logbook', startDate: '2026-02-28', endDate: '2026-11-15' }, prices).trades, 700);
    assert.equal(m.filter(function (x) { return x.tradeType === 'buy'; }).length, 14, 'buys');
    assert.equal(m.filter(function (x) { return x.tradeType === 'sell'; }).length, 4, 'sells');
    var big = m.filter(function (x) { return x.amount === 3000; });
    assert.ok(big.length === 3 && big.every(function (x) { return x.r === M.MAX_RADIUS; }), 'the three $3,000 buys are the largest dots');
    var sell680 = m.filter(function (x) { return x.amount === 680; })[0];
    assert.close(sell680.r, M.MAX_RADIUS * Math.sqrt(680 / 3000), 1e-12, '$680 sell radius');
  });
})();
