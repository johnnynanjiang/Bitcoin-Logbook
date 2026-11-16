/*
 * Standard DCA: buy the same amount on a fixed schedule from the start date to the end date.
 * Schedule: daily; weekly = every 7 days; fortnightly = every 14 days;
 * monthly = same day of the month (clamped to the month's last day).
 */
(function (root) {
  'use strict';
  var core = root.BitcoinDCA || require('../../lib/core.js');

  var strategy = {
    id: 'standard-dca',
    name: 'Standard DCA',
    description: 'Buy the same amount on a fixed schedule.',
    usesFrequency: true,
    run: function (input) {
      core.validateInput(input, { usesFrequency: true });
      var plan = core.scheduleDates(input.start, input.end, input.frequency).map(function (date) {
        return { date: date, amount: input.amount };
      });
      return core.simulate({ prices: input.prices, start: input.start, end: input.end, feePct: input.feePct, plan: plan });
    }
  };

  core.registerStrategy(strategy);
  if (typeof module !== 'undefined' && module.exports) module.exports = strategy;
})(typeof window !== 'undefined' ? window : globalThis);
