/*
 * Tiny test harness that runs unchanged in the browser (open tests/index.html, no server
 * needed) and on the command line (node tests/run.js). No dependencies.
 *
 * Every test result carries `details` so each test can be expanded to see:
 *   calls   - every call the test made into the calculator (core functions and strategy.run),
 *             with its input and output (big values such as price tables are summarised)
 *   checks  - every assertion: what was expected, what came out, tolerance, pass/fail
 *   notes   - extra context a test adds with T.note(label, value)
 *
 * Data access
 *  - Browser: data comes from <script> files, which browsers allow even from file://:
 *      ../data/btc-usd-daily.js       (same CSV text + metadata, written by the daily updater)
 *      fixtures/bitcoindata.js        (bitcoindata.science capture)
 *  - Node: reads the real data/btc-usd-daily.csv and .meta.json, and also checks that
 *    data/btc-usd-daily.js is an exact copy of them.
 */
(function (root) {
  'use strict';

  var isNode = typeof window === 'undefined';
  var tests = [];
  var sections = [];          // [{ title, path }] in first-seen order
  var current = null;         // current section while files register tests
  var active = null;          // details of the test that is running
  var MAX_CHECKS = 25;        // keep the first N passing checks per test (failures always kept)
  var MAX_CALLS = 12;

  /* ------------------------------------------------------------ registration */

  /** Start (or switch back to) a section; following tests belong to it. */
  function section(title, path) {
    current = sections.filter(function (s) { return s.title === title; })[0];
    if (!current) { current = { title: title, path: path || '' }; sections.push(current); }
    if (path && !current.path) current.path = path;
  }

  function test(name, fn) {
    tests.push({ name: name, fn: fn, section: current ? current.title : 'Other' });
  }

  /* ------------------------------------------------------------ describing values */

  var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  function isPriceTable(v) {
    var keys = Object.keys(v);
    return keys.length > 0 && keys.every(function (k) { return DATE_RE.test(k) && typeof v[k] === 'number'; });
  }

  function pad(n) { return new Array(n + 1).join('  '); }

  /** Human-readable summary of any value; large data is shortened. */
  function describe(v, depth) {
    depth = depth || 0;
    if (v === undefined) return 'undefined';
    if (v === null) return 'null';
    if (typeof v === 'number') return isFinite(v) ? String(v) : String(v);
    if (typeof v === 'boolean') return String(v);
    if (typeof v === 'function') return 'function';
    if (v instanceof RegExp) return String(v);
    if (v instanceof Error) return 'Error: ' + v.message;
    if (typeof v === 'string') {
      if (v.length <= 140) return JSON.stringify(v);
      var lines = v.split('\n').length;
      return JSON.stringify(v.slice(0, 90)) + ' … (' + v.length.toLocaleString('en-US') + ' characters, ' + lines.toLocaleString('en-US') + ' lines)';
    }
    if (Array.isArray(v)) {
      if (!v.length) return '[]';
      if (depth >= 3) return '[… ' + v.length + ' items]';
      var shown = v.length > 6 ? v.slice(0, 3) : v;
      var items = shown.map(function (x) { return describe(x, depth + 1); });
      if (v.length > 6) items.push('… ' + (v.length - 4) + ' more …', describe(v[v.length - 1], depth + 1));
      var flat = '[' + items.join(', ') + ']';
      var label = v.length > 6 ? ' (' + v.length + ' items)' : '';
      if (flat.length <= 100) return flat + label;
      return '[' + label + '\n' + items.map(function (s) { return pad(depth + 1) + s; }).join(',\n') + '\n' + pad(depth) + ']';
    }
    if (typeof v === 'object') {
      if (isPriceTable(v)) {
        var keys = Object.keys(v).sort();
        var list = keys.length <= 6 ? keys : keys.slice(0, 3);
        var parts = list.map(function (k) { return k + ': ' + v[k]; });
        if (keys.length > 6) parts.push('…', keys[keys.length - 1] + ': ' + v[keys[keys.length - 1]]);
        return '{ ' + keys.length.toLocaleString('en-US') + ' daily prices, ' + keys[0] + ' → ' + keys[keys.length - 1] + ' | ' + parts.join(', ') + ' }';
      }
      if (depth >= 3) return '{…}';
      var entries = Object.keys(v).map(function (k) { return k + ': ' + describe(v[k], depth + 1); });
      var one = '{ ' + entries.join(', ') + ' }';
      // Small records (e.g. one purchase) stay on one line; top-level objects list one field per line.
      if (one.indexOf('\n') < 0 && (one.length <= 100 || (depth > 0 && one.length <= 170))) return one;
      return '{\n' + entries.map(function (s) { return pad(depth + 1) + s; }).join(',\n') + '\n' + pad(depth) + '}';
    }
    return String(v);
  }

  /* ------------------------------------------------------------ recording */

  function record(check) {
    if (!active) return;
    active.checkCount++;
    if (!check.ok || active.checks.length < MAX_CHECKS) active.checks.push(check);
    else active.hiddenChecks++;
  }

  /** Add context to the running test's details (e.g. reference values). */
  function note(label, value) {
    // Plain-text notes are shown in full; data is summarised like call inputs/outputs.
    if (active) active.notes.push({ label: label, value: typeof value === 'string' ? value : describe(value) });
  }

  // Trace top-level calls into the calculator code while a test runs.
  var depthNow = 0;
  function wrap(owner, key, label) {
    var fn = owner[key];
    if (typeof fn !== 'function' || fn.__traced) return;
    var traced = function () {
      var args = Array.prototype.slice.call(arguments);
      var top = depthNow === 0 && active;
      depthNow++;
      try {
        var out = fn.apply(this, args);
        if (top) logCall(label, args, out, null);
        return out;
      } catch (err) {
        if (top) logCall(label, args, null, err);
        throw err;
      } finally {
        depthNow--;
      }
    };
    traced.__traced = true;
    owner[key] = traced;
  }

  function logCall(label, args, out, err) {
    if (active.calls.length >= MAX_CALLS) { active.hiddenCalls++; return; }
    active.calls.push({
      fn: label,
      input: args.length === 1 ? describe(args[0]) : describe(args),
      output: err ? null : describe(out),
      threw: err ? err.message : null
    });
  }

  function instrument() {
    var core = root.BitcoinDCA;
    if (!core) return;
    ['parseCsv', 'scheduleDates', 'validateInput', 'simulate', 'registerStrategy'].forEach(function (k) {
      wrap(core, k, 'core.' + k);
    });
    core.listStrategies().forEach(function (s) { wrap(s, 'run', s.id + '.run'); });
  }

  /* ------------------------------------------------------------ assertions */

  function fail(message) {
    throw new Error(message);
  }

  function check(kind, label, expected, actual, ok, extra) {
    var c = { kind: kind, label: label || kind, expected: expected, actual: actual, ok: ok };
    if (extra) for (var k in extra) c[k] = extra[k];
    record(c);
    return c;
  }

  var assert = {
    ok: function (value, message) {
      check('ok', message || 'is true', 'true', describe(value), !!value);
      if (!value) fail(message || 'expected a truthy value');
    },
    equal: function (actual, expected, message) {
      var ok = actual === expected;
      check('equal', message || 'equals', describe(expected), describe(actual), ok);
      if (!ok) fail((message ? message + ': ' : '') + 'expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
    },
    deepEqual: function (actual, expected, message) {
      var a = JSON.stringify(actual), e = JSON.stringify(expected);
      check('deepEqual', message || 'equals', describe(expected), describe(actual), a === e);
      if (a !== e) fail((message ? message + ': ' : '') + 'expected ' + e + ', got ' + a);
    },
    close: function (actual, expected, tolerance, message) {
      var ok = Math.abs(actual - expected) <= tolerance;
      check('close', message || 'is close to', String(expected), String(actual), ok, { tolerance: String(tolerance), diff: String(actual - expected) });
      if (!ok) fail((message ? message + ': ' : '') + 'expected ' + expected + ' ± ' + tolerance + ', got ' + actual + ' (diff ' + (actual - expected) + ')');
    },
    throws: function (fn, pattern, message) {
      var expected = 'an error' + (pattern ? ' matching ' + pattern : '');
      try {
        fn();
      } catch (err) {
        var ok = !pattern || pattern.test(err.message);
        check('throws', message || 'throws', expected, 'Error: ' + err.message, ok);
        if (!ok) fail((message ? message + ': ' : '') + 'error "' + err.message + '" does not match ' + pattern);
        return;
      }
      check('throws', message || 'throws', expected, 'no error', false);
      fail(message || 'expected an error');
    }
  };

  /* ------------------------------------------------------------ running */

  /** Run all registered tests in order; report(result) is called once per test. */
  function run(report) {
    instrument();
    var results = [];
    return tests.reduce(function (chain, t) {
      return chain.then(function () {
        var started = Date.now();
        active = { calls: [], checks: [], notes: [], checkCount: 0, hiddenChecks: 0, hiddenCalls: 0 };
        var details = active;
        return Promise.resolve()
          .then(function () { return t.fn(); })
          .then(function () { return { name: t.name, section: t.section, ok: true }; },
            function (err) { return { name: t.name, section: t.section, ok: false, error: (err && err.message) || String(err) }; })
          .then(function (r) {
            active = null;
            r.ms = Date.now() - started;
            r.details = details;
            results.push(r);
            if (report) report(r);
          });
      });
    }, Promise.resolve()).then(function () { return results; });
  }

  /* ------------------------------------------------------------ data access */

  function nodeRead(relativePath) {
    var fs = require('fs');
    var path = require('path');
    return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
  }

  /** The shipped price data: { csvText, meta }. */
  function priceData() {
    if (isNode) {
      return { csvText: nodeRead('data/btc-usd-daily.csv'), meta: JSON.parse(nodeRead('data/btc-usd-daily.meta.json')) };
    }
    var d = root.BTC_USD_DAILY;
    if (!d) fail('data/btc-usd-daily.js was not loaded. Regenerate it with: python3 .github/scripts/update_btc_prices.py --js-only');
    return { csvText: d.csv, meta: d.meta };
  }

  /** The bitcoindata.science capture (tests/fixtures/bitcoindata.js). */
  function bitcoindataFixture() {
    if (isNode && !root.BITCOINDATA_FIXTURE) require('./fixtures/bitcoindata.js');
    if (!root.BITCOINDATA_FIXTURE) fail('tests/fixtures/bitcoindata.js was not loaded');
    return root.BITCOINDATA_FIXTURE;
  }

  root.T = {
    test: test, section: section, sections: sections, assert: assert, run: run, note: note, describe: describe,
    isNode: isNode, priceData: priceData, bitcoindataFixture: bitcoindataFixture, nodeRead: nodeRead
  };
})(typeof window !== 'undefined' ? window : globalThis);
