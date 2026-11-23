/*
 * The one list of files the tests load, used by BOTH runners:
 *   - command line: node tests/run.js
 *   - browser:      open tests/index.html (no server needed)
 * Paths are relative to apps/bitcoin-dca-calculator/.
 *
 * Adding a strategy: add its .js (and any generated .data.js before it) to `sources`
 * and its .test.js to `tests`.
 */
(function (root) {
  var manifest = {
    // calculator code (same files index.html loads), in load order
    sources: [
      'lib/core.js',
      'lib/engine.js',
      'lib/results-history.js',
      'lib/chart-markers.js',
      'strategies/standard-dca/standard-dca-strategy.js',
      'strategies/lump-sum/lump-sum-strategy.js',
      'strategies/bitcoin-logbook/bitcoin-logbook-trades.data.js',
      'strategies/bitcoin-logbook/bitcoin-logbook-strategy.js'
    ],
    // data as scripts so the browser can load it from file://
    // (Node reads the real .csv/.meta.json instead, see tests/test-lib.js)
    browserData: [
      'data/btc-usd-daily.js',
      'tests/fixtures/bitcoindata.js'
    ],
    tests: [
      'tests/core.test.js',
      'tests/engine.test.js',
      'tests/strategy-interface.test.js',
      'strategies/standard-dca/standard-dca-strategy.test.js',
      'strategies/lump-sum/lump-sum-strategy.test.js',
      'strategies/bitcoin-logbook/bitcoin-logbook-strategy.test.js',
      'tests/results-history.test.js',
      'tests/chart-markers.test.js',
      'tests/data.test.js',
      'tests/page-figures.test.js',
      'tests/bitcoindata.test.js'
    ]
  };
  root.TEST_MANIFEST = manifest;
  if (typeof module !== 'undefined' && module.exports) module.exports = manifest;
})(typeof window !== 'undefined' ? window : globalThis);
