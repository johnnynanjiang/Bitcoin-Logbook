/*
 * Bitcoin DCA calculator: the strategy model.
 * Plain JavaScript, no dependencies; classic script (works from file://) and Node require().
 *
 *   Input (JSON) ──► trades ──► fill + value (this file) ──► Output (JSON) + trades CSV
 *
 * ---------------------------------------------------------------------------
 * KINDS OF STRATEGY: where a strategy's trades come from
 * ---------------------------------------------------------------------------
 *   'trades'     Real trades with no rule (e.g. Bitcoin Logbook). The trades are input.tradeData,
 *                by default a CSV bundled with the strategy. No rule() in code.
 *   'rule'       Logic in code (Standard DCA, Lump sum): rule(input, ctx) returns the trades.
 *   'rule+data'  Logic in code that also reads the strategy's own data (ctx.data). Reserved for
 *                future strategies; supported and tested, none shipped yet.
 * Any strategy's trades may include buys, sells or both. After the trades exist, every kind is
 * filled, valued and displayed the same way, so any two runs can be compared.
 *
 * ---------------------------------------------------------------------------
 * INPUT
 * ---------------------------------------------------------------------------
 *   {
 *     strategyId:   'standard-dca',     // or strategyName: 'Standard DCA'
 *     startDate:    'YYYY-MM-DD',
 *     endDate:      'YYYY-MM-DD',       // valuation date (its daily close)
 *     amount:       100,                // USD per generated buy, fee included
 *     frequency:    'weekly',           // daily | weekly | fortnightly | monthly
 *     fee:          0.5,                // % of each generated trade
 *     tradeData:    [trade, ...]        // 'trades' strategies
 *   }
 * A strategy declares which fields it uses; unused fields become null.
 *
 * ---------------------------------------------------------------------------
 * TRADE (an input.tradeData item = what a rule returns = one CSV row)
 * ---------------------------------------------------------------------------
 *   tradeType  'buy' | 'sell'
 *   date       'YYYY-MM-DD'
 *   amount     USD that left your account (buy) or arrived in it (sell); fee included
 *   amountBTC  BTC that arrived (buy) or left (sell); fee already accounted for
 *   atPrice    price of the trade; missing = that day's close
 *   fee        USD; already inside amount/amountBTC, never deducted again
 *   platform, feeEstimated, note   optional, passed through
 * Only missing fields are computed. A rule's {buy, date, amount: 100} with a 1% fee becomes
 * atPrice = close, fee = 1, amountBTC = 99 / close. A recorded trade with both amount and
 * amountBTC is kept exactly as recorded.
 *
 * ---------------------------------------------------------------------------
 * OUTPUT (run)
 * ---------------------------------------------------------------------------
 *   {
 *     schema, input,
 *     summary: { trades, buys, sells, invested, received, fees, btcBought, btcSold, btcHeld,
 *                avgCost, endPrice, value, totalValue, profit, roi },
 *     trades:   [ filled trade + { close, source, btcHeld, invested, received, value } ],
 *     timeline: [ { date, price, invested, received, btcHeld, value, totalValue } ],  // every day
 *     warnings: [ '...' ]
 *   }
 *   invested = Σ buy amount, received = Σ sell amount, value = BTC held × end-date close,
 *   totalValue = value + received, profit = totalValue − invested, roi = profit / invested.
 *   Full precision; round only for display.
 */
(function (root) {
  'use strict';
  var core = root.BitcoinDCA || require('./core.js');

  var SCHEMA_INPUT = 'bitcoin-dca/input@2';
  var SCHEMA_OUTPUT = 'bitcoin-dca/output@2';
  var KINDS = { trades: 'Real trades', rule: 'Rule', 'rule+data': 'Rule + data' };
  var USES = ['amount', 'frequency', 'fee', 'tradeData'];
  var TRADE_FIELDS = ['tradeType', 'date', 'amount', 'amountBTC', 'atPrice', 'fee'];
  var TRADE_EXTRA = ['platform', 'feeEstimated', 'note'];

  /* ------------------------------------------------------------ registry */

  var strategies = {}, order = [];

  /**
   * {
   *   id, name, description,
   *   kind:     'trades' | 'rule' | 'rule+data',
   *   uses:     { amount, frequency, fee, tradeData },  // booleans: input fields the strategy reads
   *   defaults: { ... },                                // optional default input (e.g. bundled tradeData)
   *   data:     { name: rows[] },                       // 'rule+data' only
   *   meta:     { ... },                                // optional: source, sha256, ... of bundled files
   *   rule:     function (input, ctx) -> trade[]        // 'rule' and 'rule+data'; pure (no DOM/fetch/Date.now)
   * }
   */
  function defineStrategy(s) {
    ['id', 'name', 'description'].forEach(function (k) {
      if (typeof s[k] !== 'string' || !s[k]) throw new Error('Strategy is missing "' + k + '"');
    });
    if (!/^[a-z0-9-]+$/.test(s.id)) throw new Error('Strategy id "' + s.id + '" must be kebab-case');
    if (!KINDS.hasOwnProperty(s.kind)) throw new Error('Strategy "' + s.id + '": kind must be one of ' + Object.keys(KINDS).join(', '));
    USES.forEach(function (k) {
      if (typeof (s.uses || {})[k] !== 'boolean') throw new Error('Strategy "' + s.id + '" must set uses.' + k);
    });
    if (s.kind === 'trades') {
      if (s.rule) throw new Error('Strategy "' + s.id + '": kind "trades" has no rule; its trades are the data');
      if (!s.uses.tradeData) throw new Error('Strategy "' + s.id + '": kind "trades" must use tradeData');
      s.rule = function (input) { return input.tradeData; };
    } else if (typeof s.rule !== 'function') {
      throw new Error('Strategy "' + s.id + '" is missing rule()');
    }
    var hasData = !!(s.data && Object.keys(s.data).length);
    if (s.kind === 'rule+data' && !hasData) throw new Error('Strategy "' + s.id + '": kind "rule+data" needs data');
    if (s.kind !== 'rule+data' && s.data) throw new Error('Strategy "' + s.id + '": only kind "rule+data" has data');
    if (!strategies[s.id]) order.push(s.id);
    strategies[s.id] = s;
    return s;
  }

  /** By id ('standard-dca') or by name ('Standard DCA', any case). */
  function getStrategy(key) {
    if (strategies.hasOwnProperty(key)) return strategies[key];
    var k = String(key).toLowerCase();
    for (var i = 0; i < order.length; i++) if (strategies[order[i]].name.toLowerCase() === k) return strategies[order[i]];
    throw new Error('Unknown strategy "' + key + '"');
  }

  function listStrategies() { return order.map(function (id) { return strategies[id]; }); }

  /** Remove a strategy (used by tests to clean up fixture strategies). */
  function removeStrategy(id) {
    delete strategies[id];
    order = order.filter(function (x) { return x !== id; });
  }

  /* ------------------------------------------------------------ input */

  /** Apply strategy defaults, null the fields it does not use, validate. Returns { strategy, input }. */
  function normaliseInput(raw, prices) {
    if (!raw || typeof raw !== 'object') throw new Error('Strategy input is required');
    if (!prices || typeof prices !== 'object') throw new Error('Price data is required');
    var s = getStrategy(raw.strategyId || raw.strategyName);
    var d = s.defaults || {};
    var pick = function (k, fallback) { return raw[k] != null ? raw[k] : d[k] != null ? d[k] : fallback; };
    var input = {
      schema: SCHEMA_INPUT,
      strategyId: s.id,
      strategyName: s.name,
      strategyKind: s.kind,
      startDate: pick('startDate'),
      endDate: pick('endDate'),
      amount: s.uses.amount ? Number(pick('amount')) : null,
      frequency: s.uses.frequency ? pick('frequency') : null,
      fee: s.uses.fee ? Number(pick('fee', 0)) : null,
      tradeData: s.uses.tradeData ? (pick('tradeData', []) || []).map(normaliseTrade) : null
    };
    if (s.uses.amount && !(input.amount > 0 && isFinite(input.amount))) throw new Error('Amount per purchase must be greater than 0');
    if (s.uses.fee && !(input.fee >= 0 && input.fee < 100)) throw new Error('Fee per purchase must be between 0% and 99.99%');
    if (s.uses.frequency && !core.FREQUENCIES.hasOwnProperty(input.frequency)) throw new Error('Unknown frequency "' + input.frequency + '"');
    if (core.toMs(input.startDate) > core.toMs(input.endDate)) throw new Error('The start date must be on or before the end date');
    if (!(prices[input.startDate] > 0)) throw new Error('No price for ' + input.startDate);
    if (!(prices[input.endDate] > 0)) throw new Error('No price for ' + input.endDate);
    return { strategy: s, input: input };
  }

  /** Check one trade and convert numbers; returns a new object. */
  function normaliseTrade(t, i) {
    var where = 'Trade ' + ((i || 0) + 1) + (t && t.date ? ' (' + t.date + ')' : '');
    if (!t || typeof t !== 'object') throw new Error(where + ': not a trade');
    var o = { tradeType: String(t.tradeType || '').toLowerCase() };
    if (o.tradeType !== 'buy' && o.tradeType !== 'sell') throw new Error(where + ': tradeType must be "buy" or "sell"');
    core.toMs(t.date);
    o.date = t.date;
    ['amount', 'amountBTC', 'atPrice', 'fee'].forEach(function (k) {
      if (t[k] == null || t[k] === '') { o[k] = null; return; }
      var v = Number(t[k]);
      if (!(v >= 0) || !isFinite(v)) throw new Error(where + ': ' + k + ' must be a number ≥ 0');
      o[k] = v;
    });
    if (!(o.amount > 0) && !(o.amountBTC > 0)) throw new Error(where + ': needs an amount or amountBTC greater than 0');
    if (o.atPrice === 0) throw new Error(where + ': atPrice must be greater than 0');
    TRADE_EXTRA.forEach(function (k) { if (t[k] != null && t[k] !== '') o[k] = t[k]; });
    return o;
  }

  /* ------------------------------------------------------------ fill */

  /** Complete a trade's missing fields. feePct applies only where the trade has no fee of its own. */
  function fillTrade(t, feePct, close) {
    if (!(close > 0)) throw new Error('No price for ' + t.date);
    var f = (feePct || 0) / 100;
    var o = {};
    for (var k in t) o[k] = t[k];
    o.atPrice = t.atPrice != null ? t.atPrice : close;
    o.close = close;
    var recorded = t.amount != null && t.amountBTC != null;
    if (recorded) {
      o.fee = t.fee != null ? t.fee : 0;
    } else if (t.tradeType === 'buy') {
      if (t.amount != null) {                              // spend USD
        o.fee = t.fee != null ? t.fee : t.amount * f;
        o.amountBTC = (t.amount - o.fee) / o.atPrice;
      } else {                                             // receive a given amount of BTC
        var cost = t.amountBTC * o.atPrice;
        o.fee = t.fee != null ? t.fee : cost / (1 - f) * f;
        o.amount = cost + o.fee;
      }
    } else if (t.amountBTC != null) {                      // sell a given amount of BTC
      var gross = t.amountBTC * o.atPrice;
      o.fee = t.fee != null ? t.fee : gross * f;
      o.amount = gross - o.fee;
    } else {                                               // sell enough BTC to receive USD
      o.fee = t.fee != null ? t.fee : t.amount / (1 - f) * f;
      o.amountBTC = (t.amount + o.fee) / o.atPrice;
    }
    if (o.tradeType === 'buy' && !(o.amountBTC > 0)) throw new Error('Buy on ' + t.date + ' receives no BTC (fee too high)');
    o.source = recorded ? 'recorded' : 'generated';
    return o;
  }

  /* ------------------------------------------------------------ run */

  /** All a rule may read besides its input. ctx.data is a copy, so a run can't change the strategy. */
  function makeContext(s, prices) {
    return {
      data: s.data ? JSON.parse(JSON.stringify(s.data)) : {},
      price: function (date) {
        var p = prices[date];
        if (!(p > 0)) throw new Error('No price for ' + date);
        return p;
      },
      schedule: core.scheduleDates,
      addDays: core.addDays
    };
  }

  /**
   * Run a strategy: input + prices -> output (see the top of this file).
   * Trades of a 'trades' strategy outside the dates are left out with a warning;
   * a rule that returns a trade outside the dates is a bug and throws.
   */
  function run(rawInput, prices) {
    var n = normaliseInput(rawInput, prices);
    var s = n.strategy, input = n.input, warnings = [];
    var planned = (s.rule(input, makeContext(s, prices)) || []).map(normaliseTrade);

    var inside = planned.filter(function (t) { return t.date >= input.startDate && t.date <= input.endDate; });
    if (inside.length < planned.length) {
      if (s.kind !== 'trades') throw new Error('Strategy "' + s.id + '" returned a trade outside ' + input.startDate + ' to ' + input.endDate);
      var before = planned.filter(function (t) { return t.date < input.startDate; }).length;
      var after = planned.length - inside.length - before;
      warnings.push((before ? before + ' trade' + (before === 1 ? '' : 's') + ' before the start date' : '') +
        (before && after ? ' and ' : '') + (after ? after + ' trade' + (after === 1 ? '' : 's') + ' after the end date' : '') + ' left out.');
    }
    // Stable sort by date: same-day trades keep their order.
    var byDate = {};
    inside.map(function (t, i) { return { t: t, i: i }; })
      .sort(function (a, b) { return a.t.date < b.t.date ? -1 : a.t.date > b.t.date ? 1 : a.i - b.i; })
      .forEach(function (x) { (byDate[x.t.date] = byDate[x.t.date] || []).push(x.t); });

    var trades = [], timeline = [];
    var invested = 0, received = 0, fees = 0, btcBought = 0, btcSold = 0, btc = 0, buys = 0, sells = 0;
    var feePct = input.fee || 0;
    for (var ms = core.toMs(input.startDate), endMs = core.toMs(input.endDate); ms <= endMs; ms += core.DAY) {
      var d = core.toDate(ms), close = prices[d];
      if (!(close > 0)) throw new Error('No price for ' + d);
      (byDate[d] || []).forEach(function (t) {
        var x = fillTrade(t, feePct, close);
        if (x.tradeType === 'buy') {
          invested += x.amount; btcBought += x.amountBTC; btc += x.amountBTC; buys++;
        } else {
          if (x.amountBTC > btc + 1e-12) throw new Error('Sell on ' + d + ' of ' + x.amountBTC + ' BTC is more than the ' + +btc.toFixed(8) + ' BTC held');
          received += x.amount; btcSold += x.amountBTC; btc = Math.max(0, btc - x.amountBTC); sells++;
        }
        fees += x.fee;
        x.btcHeld = btc; x.invested = invested; x.received = received; x.value = btc * close;
        trades.push(x);
      });
      timeline.push({ date: d, price: close, invested: invested, received: received, btcHeld: btc, value: btc * close, totalValue: btc * close + received });
    }

    var endPrice = prices[input.endDate], value = btc * endPrice, totalValue = value + received;
    return {
      schema: SCHEMA_OUTPUT,
      input: input,
      summary: {
        trades: trades.length, buys: buys, sells: sells,
        invested: invested, received: received, fees: fees,
        btcBought: btcBought, btcSold: btcSold, btcHeld: btc,
        avgCost: btcBought > 0 ? invested / btcBought : 0,
        endPrice: endPrice,
        value: value,
        totalValue: totalValue,
        profit: totalValue - invested,
        roi: invested > 0 ? totalValue / invested - 1 : 0
      },
      trades: trades,
      timeline: timeline,
      warnings: warnings
    };
  }

  /* ------------------------------------------------------------ trades CSV */

  /** Columns of "Download trades (CSV)": the tradeData fields first, so the file can be fed back in. */
  var CSV_COLUMNS = TRADE_FIELDS.concat(['btcHeld', 'invested', 'received', 'value'], TRADE_EXTRA);
  var CSV_FORMAT = {
    amountBTC: 8, btcHeld: 8,                 // BTC to the satoshi
    invested: 2, received: 2, value: 2        // running USD totals to the cent
  };

  function csvCell(v, col) {
    if (v == null) return '';
    if (typeof v === 'number') return CSV_FORMAT[col] != null ? v.toFixed(CSV_FORMAT[col]) : String(+v.toFixed(8));
    var s = String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function tradesToCsv(trades, columns) {
    var cols = columns || CSV_COLUMNS;
    return [cols.join(',')].concat(trades.map(function (t) {
      return cols.map(function (c) { return csvCell(t[c], c); }).join(',');
    })).join('\n') + '\n';
  }

  /** Split one CSV line (quoted cells supported, no newlines inside cells). */
  function splitCsvLine(line) {
    var out = [], cur = '', q = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (q) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch;
    }
    out.push(cur);
    return out;
  }

  /** CSV with a tradeData header (extra columns ignored) -> tradeData array. */
  function tradesFromCsv(text) {
    var lines = String(text).replace(/^\uFEFF/, '').replace(/\r/g, '').trim().split('\n');
    var head = splitCsvLine(lines[0]).map(function (h) { return h.trim(); });
    ['tradeType', 'date'].forEach(function (k) { if (head.indexOf(k) < 0) throw new Error('Trade CSV needs a "' + k + '" column'); });
    var keep = TRADE_FIELDS.concat(TRADE_EXTRA);
    return lines.slice(1).filter(function (l) { return l.trim(); }).map(function (line, i) {
      var cells = splitCsvLine(line), o = {};
      head.forEach(function (h, j) { if (keep.indexOf(h) >= 0 && cells[j] != null && cells[j] !== '') o[h] = cells[j]; });
      try { return normaliseTrade(o, i); } catch (e) { throw new Error('Trade CSV line ' + (i + 2) + ': ' + e.message); }
    });
  }

  var api = {
    SCHEMA_INPUT: SCHEMA_INPUT, SCHEMA_OUTPUT: SCHEMA_OUTPUT, KINDS: KINDS,
    TRADE_FIELDS: TRADE_FIELDS, TRADE_EXTRA: TRADE_EXTRA, CSV_COLUMNS: CSV_COLUMNS,
    defineStrategy: defineStrategy, getStrategy: getStrategy, listStrategies: listStrategies, removeStrategy: removeStrategy,
    normaliseInput: normaliseInput, normaliseTrade: normaliseTrade, fillTrade: fillTrade,
    makeContext: makeContext, run: run,
    tradesToCsv: tradesToCsv, tradesFromCsv: tradesFromCsv
  };
  for (var k in api) core[k] = api[k];
  if (typeof module !== 'undefined' && module.exports) module.exports = core;
})(typeof window !== 'undefined' ? window : globalThis);
