/*
 * The one list of files the tests load, used by BOTH runners:
 *   - command line: node tests/run.js
 *   - browser:      open tests/index.html (no server needed)
 * Paths are relative to apps/bitcoin-dca-calculator/.
 *
 * Adding a strategy: add its .js to `sources` and its .test.js to `tests`.
 */
(function (root) {
  var manifest = {
    // calculator code (same files index.html loads), in load order
    sources: [
      'lib/core.js',
      'strategies/standard-dca/standard-dca-strategy.js',
      'strategies/lump-sum/lump-sum-strategy.js'
    ],
    // data as scripts so the browser can load it from file://
    // (Node reads the real .csv/.meta.json instead, see tests/test-lib.js)
    browserData: [
      'data/btc-usd-daily.js',
      'tests/fixtures/bitcoindata.js'
    ],
    tests: [
      'tests/core.test.js',
      'tests/strategy-interface.test.js',
      'strategies/standard-dca/standard-dca-strategy.test.js',
      'strategies/lump-sum/lump-sum-strategy.test.js',
      'tests/data.test.js',
      'tests/bitcoindata.test.js'
    ]
  };
  root.TEST_MANIFEST = manifest;
  if (typeof module !== 'undefined' && module.exports) module.exports = manifest;
})(typeof window !== 'undefined' ? window : globalThis);
