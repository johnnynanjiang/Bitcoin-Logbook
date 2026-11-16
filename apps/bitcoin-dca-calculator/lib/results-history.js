/*
 * Results history: the list of previous calculations shown under the calculator,
 * so different strategies, amounts, frequencies and dates can be compared side by side.
 *
 * Pure functions (no DOM) so they are unit-tested like the strategies; the page only
 * renders the list. Saved in the browser's localStorage when available.
 *
 * Entry shape:
 *   {
 *     id:        'r1700000000000-1',
 *     createdAt: '2026-11-16T10:00:00.000Z',
 *     input:  { strategyId, strategyName, amount, feePct, frequency /* null if unused *\/, start, end },
 *     output: { purchases, invested, fees, btc, avgCost, endPrice, value, profit, roi }
 *   }
 */
(function (root) {
  'use strict';
  var core = root.BitcoinDCA || require('./core.js');

  var MAX_ENTRIES = 200;
  var STORAGE_KEY = 'bitcoinlogbook.dca-calculator.results.v1';
  var seq = 0;

  /** Columns for comparison; `get` reads the value used for display, sorting and CSV. */
  var COLUMNS = [
    { key: 'strategy', label: 'Strategy', group: 'input', type: 'text', get: function (e) { return e.input.strategyName; } },
    { key: 'amount', label: 'Amount', group: 'input', type: 'usd', get: function (e) { return e.input.amount; } },
    { key: 'frequency', label: 'Frequency', group: 'input', type: 'text', get: function (e) { return e.input.frequency ? core.FREQUENCIES[e.input.frequency] : '—'; } },
    { key: 'start', label: 'Start', group: 'input', type: 'date', get: function (e) { return e.input.start; } },
    { key: 'end', label: 'End', group: 'input', type: 'date', get: function (e) { return e.input.end; } },
    { key: 'feePct', label: 'Fee', group: 'input', type: 'pct-plain', get: function (e) { return e.input.feePct; } },
    { key: 'purchases', label: 'Buys', group: 'output', type: 'int', get: function (e) { return e.output.purchases; } },
    { key: 'invested', label: 'Invested', group: 'output', type: 'usd', get: function (e) { return e.output.invested; } },
    { key: 'btc', label: 'BTC', group: 'output', type: 'btc', get: function (e) { return e.output.btc; } },
    { key: 'avgCost', label: 'Avg cost', group: 'output', type: 'usd', get: function (e) { return e.output.avgCost; } },
    { key: 'value', label: 'Final value', group: 'output', type: 'usd', get: function (e) { return e.output.value; } },
    { key: 'profit', label: 'Profit', group: 'output', type: 'usd-signed', get: function (e) { return e.output.profit; } },
    { key: 'roi', label: 'Return', group: 'output', type: 'pct', get: function (e) { return e.output.roi; } }
  ];

  function column(key) {
    var c = COLUMNS.filter(function (x) { return x.key === key; })[0];
    if (!c) throw new Error('Unknown column "' + key + '"');
    return c;
  }

  /** Build a history entry from a strategy, the input it ran with, and its result. */
  function makeEntry(strategy, input, result, now) {
    var when = now || new Date();
    seq++;
    return {
      id: 'r' + when.getTime() + '-' + seq,
      createdAt: when.toISOString(),
      input: {
        strategyId: strategy.id,
        strategyName: strategy.name,
        amount: input.amount,
        feePct: input.feePct || 0,
        frequency: strategy.usesFrequency ? input.frequency : null,
        start: input.start,
        end: input.end
      },
      output: {
        purchases: result.purchases.length,
        invested: result.invested,
        fees: result.fees,
        btc: result.btc,
        avgCost: result.avgCost,
        endPrice: result.endPrice,
        value: result.value,
        profit: result.profit,
        roi: result.roi
      }
    };
  }

  /** Same inputs => same key (frequency ignored by strategies that do not use it). */
  function inputKey(input) {
    return [input.strategyId, input.amount, input.feePct || 0, input.frequency || '', input.start, input.end].join('|');
  }

  /**
   * Add an entry at the top. If the same input is already in the list, nothing is
   * added and the existing entry is returned (so the page can highlight it).
   * @returns {{ list: Array, entry: Object, added: boolean }}
   */
  function add(list, entry) {
    var key = inputKey(entry.input);
    var existing = list.filter(function (e) { return inputKey(e.input) === key; })[0];
    if (existing) return { list: list, entry: existing, added: false };
    var next = [entry].concat(list).slice(0, MAX_ENTRIES);
    return { list: next, entry: entry, added: true };
  }

  function remove(list, id) {
    return list.filter(function (e) { return e.id !== id; });
  }

  /** Sorted copy; dir = 'asc' | 'desc'. Ties keep the original order. */
  function sort(list, key, dir) {
    var get = column(key).get;
    var sign = dir === 'asc' ? 1 : -1;
    return list
      .map(function (e, i) { return { e: e, i: i }; })
      .sort(function (a, b) {
        var x = get(a.e), y = get(b.e);
        if (x < y) return -sign;
        if (x > y) return sign;
        return a.i - b.i;
      })
      .map(function (w) { return w.e; });
  }

  /** Id of the entry with the highest value in a column (first one on ties), or null. */
  function best(list, key) {
    if (list.length < 2) return null;
    var get = column(key).get, top = null;
    list.forEach(function (e) { if (top === null || get(e) > get(top)) top = e; });
    return top.id;
  }

  /** Re-run a saved row's inputs against the price data (rows only store summary numbers). */
  function rerun(entry, prices) {
    var i = entry.input;
    return core.getStrategy(i.strategyId).run({
      prices: prices, amount: i.amount, feePct: i.feePct, frequency: i.frequency || 'daily', start: i.start, end: i.end
    });
  }

  /** Every purchase of a result as CSV (same format as "Download purchases (CSV)"). */
  function purchasesCsv(result) {
    var lines = ['date,btc_price_usd,btc_bought,total_btc,total_invested_usd,value_usd'].concat(result.purchases.map(function (p) {
      return [p.date, p.price, p.btc.toFixed(8), p.totalBtc.toFixed(8), p.invested.toFixed(2), p.value.toFixed(2)].join(',');
    }));
    return lines.join('\n') + '\n';
  }

  /** e.g. bitcoin-dca-standard-dca-weekly-100usd-2023-11-15-to-2026-11-15.csv */
  function fileName(input) {
    return 'bitcoin-dca-' + input.strategyId + (input.frequency ? '-' + input.frequency : '') + '-' + input.amount + 'usd' +
      (input.feePct ? '-fee' + input.feePct + 'pct' : '') + '-' + input.start + '-to-' + input.end + '.csv';
  }

  function isEntry(e) {
    return e && typeof e.id === 'string' && e.input && e.output &&
      typeof e.input.strategyId === 'string' && typeof e.output.value === 'number';
  }

  /** Read the saved list; anything unreadable gives an empty list. */
  function load(storage) {
    try {
      var raw = storage && storage.getItem(STORAGE_KEY);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.filter(isEntry).slice(0, MAX_ENTRIES) : [];
    } catch (err) {
      return [];
    }
  }

  function save(storage, list) {
    try {
      if (storage) storage.setItem(STORAGE_KEY, JSON.stringify(list));
      return true;
    } catch (err) {
      return false; // storage full or blocked: the list still works for this visit
    }
  }

  core.history = {
    MAX_ENTRIES: MAX_ENTRIES,
    STORAGE_KEY: STORAGE_KEY,
    COLUMNS: COLUMNS,
    makeEntry: makeEntry,
    inputKey: inputKey,
    add: add,
    remove: remove,
    sort: sort,
    best: best,
    rerun: rerun,
    purchasesCsv: purchasesCsv,
    fileName: fileName,
    load: load,
    save: save
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = core.history;
})(typeof window !== 'undefined' ? window : globalThis);
