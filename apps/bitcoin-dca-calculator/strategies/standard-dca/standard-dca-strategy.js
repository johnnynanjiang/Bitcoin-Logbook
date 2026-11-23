/*
 * Standard DCA (kind 'rule'): buy the same amount on a fixed schedule from the start date
 * to the end date. Schedule: daily; weekly = every 7 days; fortnightly = every 14 days;
 * monthly = same day of the month (clamped to the month's last day).
 * The rule only says when and how much; lib/engine.js fills in price, fee and BTC.
 */
(function (root) {
  'use strict';
  var engine = root.BitcoinDCA && root.BitcoinDCA.defineStrategy ? root.BitcoinDCA : require('../../lib/engine.js');

  var strategy = engine.defineStrategy({
    id: 'standard-dca',
    name: 'Standard DCA',
    description: 'Buy the same amount on a fixed schedule.',
    kind: 'rule',
    uses: { amount: true, frequency: true, fee: true, tradeData: false },
    rule: function (input, ctx) {
      return ctx.schedule(input.startDate, input.endDate, input.frequency).map(function (date) {
        return { tradeType: 'buy', date: date, amount: input.amount };
      });
    }
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = strategy;
})(typeof window !== 'undefined' ? window : globalThis);
