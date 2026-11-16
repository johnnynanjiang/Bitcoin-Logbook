/*
 * Lump sum: spend the amount per purchase once, and only once, on the start date,
 * then hold until the end date. Frequency is accepted (common interface) but not used.
 */
(function (root) {
  'use strict';
  var core = root.BitcoinDCA || require('../../lib/core.js');

  var strategy = {
    id: 'lump-sum',
    name: 'Lump sum',
    description: 'Buy once on the start date and hold.',
    usesFrequency: false,
    run: function (input) {
      core.validateInput(input, { usesFrequency: false });
      return core.simulate({
        prices: input.prices,
        start: input.start,
        end: input.end,
        feePct: input.feePct,
        plan: [{ date: input.start, amount: input.amount }]
      });
    }
  };

  core.registerStrategy(strategy);
  if (typeof module !== 'undefined' && module.exports) module.exports = strategy;
})(typeof window !== 'undefined' ? window : globalThis);
