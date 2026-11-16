/*
 * Capture a fixture from https://bitcoindata.science/dca-calculator for tests/bitcoindata.test.js.
 *
 * How to refresh:
 *   1. Open https://bitcoindata.science/dca-calculator and wait for the results to load.
 *   2. Open the browser console, paste this whole file and press Enter.
 *   3. Save the text that is copied to your clipboard (and printed in the console) as
 *      tests/fixtures/bitcoindata.js
 *
 * The scenarios use dates where both calculators buy on the same days:
 *   - daily = daily
 *   - monthly starting on the 1st (theirs always buys on the 1st)
 *   - weekly starting on a Monday (theirs always buys on Mondays)
 */
(function () {
  var SCENARIOS = [
    { id: 'daily-10-2021', amount: 10, freqCode: '1', frequency: 'daily', start: '2021-01-01', end: '2021-12-31' },
    { id: 'daily-50-q1-2024', amount: 50, freqCode: '1', frequency: 'daily', start: '2024-01-01', end: '2024-03-31' },
    { id: 'monthly-500-2020-2024', amount: 500, freqCode: '30', frequency: 'monthly', start: '2020-01-01', end: '2024-12-31' },
    { id: 'monthly-100-2013-2025', amount: 100, freqCode: '30', frequency: 'monthly', start: '2013-01-01', end: '2025-12-31' },
    { id: 'weekly-100-2022-2025', amount: 100, freqCode: '7', frequency: 'weekly', start: '2022-01-03', end: '2025-06-30' },
    { id: 'weekly-25-2015-2019', amount: 25, freqCode: '7', frequency: 'weekly', start: '2015-06-01', end: '2019-12-30' }
  ];

  var $ = function (id) { return document.getElementById(id); };
  var num = function (id) { return Number($(id).textContent.replace(/[^0-9.\-]/g, '')); };
  var day = function (ms) { return new Date(ms).toISOString().slice(0, 10); };

  /* global priceHistory, spotPrice, simulateDCA, simResults */
  var fixture = {
    capturedAt: new Date().toISOString(),
    page: location.href.split('#')[0],
    spotPrice: spotPrice,
    // their full price series exactly as their calculator uses it: [date, price]
    history: priceHistory.map(function (p) { return [day(p[0]), p[1]]; }),
    scenarios: SCENARIOS.map(function (s) {
      $('investAmount').value = s.amount;
      $('investAmountRange').value = s.amount;
      $('frequency').value = s.freqCode;
      $('startDate').value = s.start;
      $('endDate').value = s.end;
      simulateDCA();
      return {
        id: s.id, amount: s.amount, frequency: s.frequency, start: s.start, end: s.end,
        theirs: {
          purchases: num('numPurchases'),
          invested: num('totalInvested'),
          btc: num('btcAccumulated'),
          avgCost: num('avgPrice'),
          value: num('portfolioValue'),
          roiPct: num('roiPercent'),
          spot: num('currentBtcPrice'),
          buyDates: simResults.map(function (r) { return r.date; })
        }
      };
    })
  };

  var js = '/* Captured from https://bitcoindata.science/dca-calculator with tests/capture-bitcoindata.js. */\n' +
    "(typeof window !== 'undefined' ? window : globalThis).BITCOINDATA_FIXTURE = " + JSON.stringify(fixture) + ';\n';
  console.log(js);
  if (navigator.clipboard) navigator.clipboard.writeText(js).catch(function () {});
  return js;
})();
