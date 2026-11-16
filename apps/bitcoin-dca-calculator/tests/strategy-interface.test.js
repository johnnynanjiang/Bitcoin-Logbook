/*
 * Every registered strategy must follow the common interface:
 * same input (amount, fee, frequency, start, end), same result shape, same validation.
 * New strategies are checked automatically once they are in tests/manifest.js.
 */
(function () {
  'use strict';
  var test = T.test, assert = T.assert, core = BitcoinDCA;

  var P = {};
  [100, 200, 100, 50, 100, 100, 100, 100, 100, 400].forEach(function (c, i) { P[core.addDays('2024-01-01', i)] = c; });
  var INPUT = { prices: P, amount: 100, feePct: 1, frequency: 'weekly', start: '2024-01-01', end: '2024-01-10' };

  function copy(extra) {
    var o = {};
    for (var k in INPUT) o[k] = INPUT[k];
    for (var j in extra) o[j] = extra[j];
    return o;
  }

  T.section('Core', 'lib/core.js');
  test('strategy registry has the standard DCA and lump sum strategies', function () {
    var ids = core.listStrategies().map(function (s) { return s.id; });
    assert.ok(ids.indexOf('standard-dca') >= 0, 'standard-dca registered');
    assert.ok(ids.indexOf('lump-sum') >= 0, 'lump-sum registered');
  });

  // The common-interface checks are listed inside each strategy's own section.
  core.listStrategies().forEach(function (s) {
    T.section(s.name + ' strategy', 'strategies/' + s.id + '/');
    test('common interface: has id, name, description, usesFrequency and run()', function () {
      assert.ok(/^[a-z0-9-]+$/.test(s.id), 'id is kebab-case');
      assert.ok(s.name.length > 0 && s.description.length > 0, 'name and description');
      assert.equal(typeof s.usesFrequency, 'boolean', 'type of usesFrequency');
      assert.equal(typeof s.run, 'function', 'type of run');
    });

    test('common interface: returns the common result shape', function () {
      var r = s.run(copy({}));
      ['invested', 'fees', 'btc', 'avgCost', 'endPrice', 'value', 'profit', 'roi'].forEach(function (k) {
        assert.ok(typeof r[k] === 'number' && isFinite(r[k]), k + ' is a finite number');
      });
      assert.ok(Array.isArray(r.purchases) && r.purchases.length > 0, 'purchases');
      assert.equal(r.timeline.length, 10, 'one timeline point per day');
      assert.equal(r.endPrice, 400, 'valued at the end date close');
    });

    test('common interface: result is internally consistent', function () {
      var r = s.run(copy({}));
      var spent = 0, fees = 0, btc = 0;
      r.purchases.forEach(function (p) {
        spent += p.amount; fees += p.fee; btc += p.btc;
        assert.ok(p.date >= INPUT.start && p.date <= INPUT.end, 'purchase inside the window');
        assert.close(p.btc, (p.amount - p.fee) / p.price, 1e-12, 'BTC bought = (amount - fee) / price');
      });
      assert.close(r.invested, spent, 1e-9, 'invested = sum of purchases');
      assert.close(r.fees, fees, 1e-9, 'fees = sum of fees');
      assert.close(r.btc, btc, 1e-12, 'BTC = sum of BTC bought');
      assert.close(r.value, r.btc * r.endPrice, 1e-9, 'value = BTC x end price');
      assert.close(r.profit, r.value - r.invested, 1e-9, 'profit');
    });

    test('common interface: every purchase uses the amount per purchase', function () {
      s.run(copy({})).purchases.forEach(function (p) { assert.equal(p.amount, INPUT.amount, 'amount spent on ' + p.date); });
    });

    test('common interface: rejects invalid input', function () {
      assert.throws(function () { s.run(copy({ amount: 0 })); }, /Amount/);
      assert.throws(function () { s.run(copy({ feePct: 100 })); }, /Fee/);
      assert.throws(function () { s.run(copy({ start: '2024-01-05', end: '2024-01-04' })); }, /start date/);
      assert.throws(function () { s.run(copy({ end: '2024-02-01' })); }, /2024-02-01/);
      if (s.usesFrequency) assert.throws(function () { s.run(copy({ frequency: 'yearly' })); }, /frequency/);
    });
  });
})();
