/*
 * Lump sum (kind 'rule'): the input becomes one trade. Spend the amount once, on the start
 * date, and hold until the end date. Frequency is not used.
 */
(function (root) {
  'use strict';
  var engine = root.BitcoinDCA && root.BitcoinDCA.defineStrategy ? root.BitcoinDCA : require('../../lib/engine.js');

  var strategy = engine.defineStrategy({
    id: 'lump-sum',
    name: 'Lump sum',
    description: 'Buy once on the start date and hold.',
    kind: 'rule',
    uses: { amount: true, frequency: false, fee: true, tradeData: false },
    rule: function (input) {
      return [{ tradeType: 'buy', date: input.startDate, amount: input.amount }];
    }
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = strategy;
})(typeof window !== 'undefined' ? window : globalThis);
