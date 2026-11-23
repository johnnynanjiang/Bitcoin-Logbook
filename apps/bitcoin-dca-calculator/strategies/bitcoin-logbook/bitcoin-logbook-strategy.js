/*
 * Bitcoin Logbook (kind 'trades'): the real buys and sells recorded in the Bitcoin Logbook.
 * No rule: the trades are the strategy. They come from bitcoin-logbook-trades.csv, loaded
 * through the generated bitcoin-logbook-trades.data.js so the page also works from file://.
 * Amount, frequency and fee are not used: every trade carries its own amount, BTC and fee.
 *
 * Source: /blog/bitcoin-dca-vs-lump-sum/trades.csv. Regenerate the copy with
 *   python3 .github/scripts/build_trade_data.py      (from the website repo root)
 */
(function (root) {
  'use strict';
  var engine = root.BitcoinDCA && root.BitcoinDCA.defineStrategy ? root.BitcoinDCA : require('../../lib/engine.js');
  var bundle = (root.STRATEGY_DATA || {})['bitcoin-logbook'] || require('./bitcoin-logbook-trades.data.js');
  var trades = engine.tradesFromCsv(bundle.csv);

  var strategy = engine.defineStrategy({
    id: 'bitcoin-logbook',
    name: 'Bitcoin Logbook',
    description: 'My real Bitcoin buys and sells, as recorded.',
    kind: 'trades',
    uses: { amount: false, frequency: false, fee: false, tradeData: true },
    defaults: { startDate: trades[0].date, tradeData: trades },
    meta: bundle.meta
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = strategy;
})(typeof window !== 'undefined' ? window : globalThis);
