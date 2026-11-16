#!/usr/bin/env node
/*
 * Command-line test runner:  node tests/run.js   (from apps/bitcoin-dca-calculator/)
 * Needs only Node.js, no npm install. Runs the same files as tests/index.html,
 * listed once in tests/manifest.js, and prints them in the same sections.
 */
'use strict';

var path = require('path');
var manifest = require('./manifest.js');
var app = path.join(__dirname, '..');

require('./test-lib.js');
manifest.sources.forEach(function (f) { require(path.join(app, f)); });
manifest.tests.forEach(function (f) { require(path.join(app, f)); });

T.run().then(function (results) {
  var verbose = process.argv.indexOf('--verbose') >= 0 || process.argv.indexOf('-v') >= 0;
  var indent = function (text, by) { return String(text).split('\n').map(function (l) { return by + l; }).join('\n'); };

  T.sections.forEach(function (s) {
    var rows = results.filter(function (r) { return r.section === s.title; });
    var passed = rows.filter(function (r) { return r.ok; }).length;
    console.log('\n' + s.title + (s.path ? '  (' + s.path + ')' : '') + '  ' + passed + '/' + rows.length + ' passed');
    rows.forEach(function (r) {
      console.log((r.ok ? '  ✓ ' : '  ✗ ') + r.name + (r.ok ? '' : '\n      ' + r.error));
      // Details for every test with --verbose, and always for failures.
      if (!verbose && r.ok) return;
      var d = r.details;
      d.notes.forEach(function (n) { console.log('      note    ' + n.label + ':\n' + indent(n.value, '              ')); });
      d.calls.forEach(function (c) {
        console.log('      call    ' + c.fn + '(…)');
        console.log('        input:\n' + indent(c.input, '          '));
        console.log(c.threw ? '        threw: Error: ' + c.threw : '        output:\n' + indent(c.output, '          '));
      });
      if (d.hiddenCalls) console.log('      … and ' + d.hiddenCalls + ' more calls');
      d.checks.forEach(function (c) {
        console.log('      ' + (c.ok ? 'check ✓ ' : 'check ✗ ') + c.label + ': expected ' + c.expected +
          (c.tolerance != null ? ' ± ' + c.tolerance : '') + ', actual ' + c.actual);
      });
      if (d.hiddenChecks) console.log('      … and ' + d.hiddenChecks + ' more checks, all passed');
    });
  });
  var failed = results.filter(function (r) { return !r.ok; }).length;
  console.log('\n' + (results.length - failed) + ' passed, ' + failed + ' failed');
  process.exitCode = failed ? 1 : 0;
});
