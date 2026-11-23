/*
 * Results history: the list of previous calculations shown under the calculator,
 * so any strategies, amounts, frequencies and dates can be compared side by side.
 *
 * Pure functions (no DOM) so they are unit-tested like the strategies; the page only
 * renders the list. Saved in the browser's localStorage when available.
 *
 * Entry shape (built from a lib/engine.js run output):
 *   {
 *     id:        'r1700000000000-1',
 *     createdAt: '2026-11-16T10:00:00.000Z',
 *     input:  { strategyId, strategyName, amount, fee, frequency, startDate, endDate },   // null = not used
 *     output: { trades, buys, sells, invested, received, fees, btcHeld, avgCost, endPrice,
 *               value, totalValue, profit, roi }
 *   }
 * Entries saved by the first version of the calculator (start/end/feePct/purchases/btc) are
 * converted when loaded.
 */
(function (root) {
  'use strict';
  var core = root.BitcoinDCA && root.BitcoinDCA.run ? root.BitcoinDCA : require('./engine.js');

  var MAX_ENTRIES = 200;
  var STORAGE_KEY = 'bitcoinlogbook.dca-calculator.results.v1';
  var seq = 0;

  /** Columns for comparison; `get` reads the value used for display, sorting and CSV (null = not used). */
  var COLUMNS = [
    { key: 'strategy', label: 'Strategy', group: 'input', type: 'text', get: function (e) { return e.input.strategyName; } },
    { key: 'amount', label: 'Amount', group: 'input', type: 'usd', get: function (e) { return e.input.amount; } },
    { key: 'frequency', label: 'Frequency', group: 'input', type: 'text', get: function (e) { return e.input.frequency ? core.FREQUENCIES[e.input.frequency] : null; } },
    { key: 'startDate', label: 'Start', group: 'input', type: 'date', get: function (e) { return e.input.startDate; } },
    { key: 'endDate', label: 'End', group: 'input', type: 'date', get: function (e) { return e.input.endDate; } },
    { key: 'fee', label: 'Fee', group: 'input', type: 'pct-plain', get: function (e) { return e.input.fee; } },
    { key: 'buys', label: 'Buys', group: 'output', type: 'int', get: function (e) { return e.output.buys; } },
    { key: 'sells', label: 'Sells', group: 'output', type: 'int', get: function (e) { return e.output.sells; } },
    { key: 'invested', label: 'Invested', group: 'output', type: 'usd', get: function (e) { return e.output.invested; } },
    { key: 'received', label: 'Received', group: 'output', type: 'usd', get: function (e) { return e.output.received; } },
    { key: 'btcHeld', label: 'BTC', group: 'output', type: 'btc', get: function (e) { return e.output.btcHeld; } },
    { key: 'avgCost', label: 'Avg cost', group: 'output', type: 'usd', get: function (e) { return e.output.avgCost; } },
    { key: 'totalValue', label: 'Final value', group: 'output', type: 'usd', get: function (e) { return e.output.totalValue; } },
    { key: 'profit', label: 'Profit', group: 'output', type: 'usd-signed', get: function (e) { return e.output.profit; } },
    { key: 'roi', label: 'Return', group: 'output', type: 'pct', get: function (e) { return e.output.roi; } }
  ];

  function column(key) {
    var c = COLUMNS.filter(function (x) { return x.key === key; })[0];
    if (!c) throw new Error('Unknown column "' + key + '"');
    return c;
  }

  /** Build a history entry from a run output (BitcoinDCA.run). */
  function makeEntry(result, now) {
    var when = now || new Date();
    var i = result.input, s = result.summary;
    seq++;
    return {
      id: 'r' + when.getTime() + '-' + seq,
      createdAt: when.toISOString(),
      input: {
        strategyId: i.strategyId,
        strategyName: i.strategyName,
        amount: i.amount,
        fee: i.fee,
        frequency: i.frequency,
        startDate: i.startDate,
        endDate: i.endDate
      },
      output: {
        trades: s.trades, buys: s.buys, sells: s.sells,
        invested: s.invested, received: s.received, fees: s.fees,
        btcHeld: s.btcHeld, avgCost: s.avgCost, endPrice: s.endPrice,
        value: s.value, totalValue: s.totalValue, profit: s.profit, roi: s.roi
      }
    };
  }

  /** Same inputs => same key (fields a strategy does not use are null, so they never differ). */
  function inputKey(input) {
    return [input.strategyId, input.amount, input.fee, input.frequency, input.startDate, input.endDate]
      .map(function (v) { return v == null ? '' : v; }).join('|');
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

  /** Sorted copy; dir = 'asc' | 'desc'. Rows without a value (null) go last. Ties keep the original order. */
  function sort(list, key, dir) {
    var get = column(key).get;
    var sign = dir === 'asc' ? 1 : -1;
    return list
      .map(function (e, i) { return { e: e, i: i }; })
      .sort(function (a, b) {
        var x = get(a.e), y = get(b.e);
        if (x == null || y == null) return x == null && y == null ? a.i - b.i : x == null ? 1 : -1;
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
    list.forEach(function (e) { if (get(e) != null && (top === null || get(e) > get(top))) top = e; });
    return top ? top.id : null;
  }

  /** Re-run a saved row's inputs against the price data (rows only store summary numbers). */
  function rerun(entry, prices) {
    var i = entry.input;
    return core.run({
      strategyId: i.strategyId, startDate: i.startDate, endDate: i.endDate,
      amount: i.amount, frequency: i.frequency, fee: i.fee
    }, prices);
  }

  /** Every trade of a result as CSV (same file as "Download trades (CSV)"). */
  function tradesCsv(result) {
    return core.tradesToCsv(result.trades);
  }

  /** e.g. bitcoin-dca-standard-dca-weekly-100usd-fee1pct-2023-11-15-to-2026-11-15.csv */
  function fileName(input) {
    return 'bitcoin-dca-' + input.strategyId + (input.frequency ? '-' + input.frequency : '') +
      (input.amount != null ? '-' + input.amount + 'usd' : '') + (input.fee ? '-fee' + input.fee + 'pct' : '') +
      '-' + input.startDate + '-to-' + input.endDate + '.csv';
  }

  /** Entries saved before the strategy model v2: { start, end, feePct } / { purchases, btc, value }. */
  function upgrade(e) {
    if (!e || !e.input || e.input.startDate || !e.input.start) return e;
    var i = e.input, o = e.output || {};
    var lump = i.strategyId === 'lump-sum';
    return {
      id: e.id,
      createdAt: e.createdAt,
      input: {
        strategyId: i.strategyId, strategyName: i.strategyName,
        amount: i.amount, fee: i.feePct || 0, frequency: lump ? null : i.frequency,
        startDate: i.start, endDate: i.end
      },
      output: {
        trades: o.purchases, buys: o.purchases, sells: 0,
        invested: o.invested, received: 0, fees: o.fees,
        btcHeld: o.btc, avgCost: o.avgCost, endPrice: o.endPrice,
        value: o.value, totalValue: o.value, profit: o.profit, roi: o.roi
      }
    };
  }

  function isEntry(e) {
    return !!(e && typeof e.id === 'string' && e.input && e.output && typeof e.input.strategyId === 'string' &&
      typeof e.input.startDate === 'string' && typeof e.output.totalValue === 'number');
  }

  /** Read the saved list; anything unreadable gives an empty list. */
  function load(storage) {
    try {
      var raw = storage && storage.getItem(STORAGE_KEY);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.map(upgrade).filter(isEntry).slice(0, MAX_ENTRIES) : [];
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
    tradesCsv: tradesCsv,
    fileName: fileName,
    upgrade: upgrade,
    load: load,
    save: save
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = core.history;
})(typeof window !== 'undefined' ? window : globalThis);
