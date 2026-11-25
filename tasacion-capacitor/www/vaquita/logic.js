/* Vaquita: who owes whom. Pure functions, no DOM (tests/js/app-factory.test.js). */
(function (root) {
  'use strict';

  var PROPINA = 10; // percent offered by the "Sumar propina" box; the person can leave it off

  // Whole pesos in proportion to weights; leftover pesos go to the biggest remainders (ties: list order).
  function repartir(total, weights) {
    var sum = weights.reduce(function (a, w) { return a + w; }, 0);
    if (!(sum > 0) || !(total > 0)) return weights.map(function () { return 0; });
    var raw = weights.map(function (w) { return total * w / sum; });
    var out = raw.map(Math.floor);
    var left = total - out.reduce(function (a, v) { return a + v; }, 0);
    raw.map(function (v, i) { return { i: i, f: v - out[i] }; })
      .sort(function (a, b) { return b.f - a.f || a.i - b.i; })
      .slice(0, left).forEach(function (x) { out[x.i]++; });
    return out;
  }

  // Item split total: whole-peso items plus the tip (a percent of the items).
  function montoItems(items, tip) {
    var sub = (items || []).reduce(function (s, it) { var a = Math.round(it.amount); return s + (a > 0 ? a : 0); }, 0);
    var propina = Math.round(sub * (tip > 0 ? tip : 0) / 100);
    return { subtotal: sub, propina: propina, total: sub + propina };
  }

  // What each person owes for expense number idx: { owe: { name: pesos }, total }. total is what the payer gets back.
  // Plain expense: amount split equally among `among` (everyone if empty). Item expense ({ items, tip }): each item split
  // equally among the people who had it, then the tip shared in proportion to what each one had.
  // Whole pesos: the leftover of an uneven split starts at person (index mod people), so it is not always the same one.
  function cuotas(people, e, idx) {
    var owe = Object.create(null), total = 0;
    var en = function (list) { return (list || []).filter(function (p) { return people.indexOf(p) >= 0; }); };
    var dividir = function (amount, among, start) {
      var share = Math.floor(amount / among.length), extra = amount - share * among.length;
      among.forEach(function (p, i) { owe[p] = (owe[p] || 0) + share + ((i - start + among.length) % among.length < extra ? 1 : 0); });
      total += amount;
    };
    if (Array.isArray(e.items) && e.items.length) {
      e.items.forEach(function (it, j) {
        var a = Math.round(it.amount), among = en(it.among);
        if (a > 0 && among.length) dividir(a, among, (idx + j) % among.length);
      });
      var names = Object.keys(owe), tip = Math.round(total * (e.tip > 0 ? e.tip : 0) / 100);
      repartir(tip, names.map(function (n) { return owe[n]; })).forEach(function (v, i) { owe[names[i]] += v; });
      total += tip;
    } else {
      var among = en(e.among && e.among.length ? e.among : people), amount = Math.round(e.amount);
      if (among.length && amount > 0) dividir(amount, among, idx % among.length);
    }
    return { owe: owe, total: total };
  }

  // expenses: [{ payer, amount, among: [names] }] or [{ payer, items: [{ what, amount, among }], tip }] -> { name: balance }, positive = is owed money.
  function balances(people, expenses) {
    // No prototype, so a name like "__proto__" or "constructor" is just a key.
    var bal = Object.create(null), out = {};
    people.forEach(function (p) { bal[p] = 0; });
    expenses.forEach(function (e, idx) {
      if (!(e.payer in bal)) return;
      var c = cuotas(people, e, idx);
      if (!(c.total > 0)) return;
      bal[e.payer] += c.total;
      Object.keys(c.owe).forEach(function (p) { bal[p] -= c.owe[p]; });
    });
    // defineProperty, because out["__proto__"] = 0 would set the prototype instead of a key.
    Object.keys(bal).forEach(function (p) {
      Object.defineProperty(out, p, { value: bal[p], enumerable: true, writable: true, configurable: true });
    });
    return out;
  }

  // Everyone who had at least one item, in order of first appearance.
  function quienes(items) {
    var out = [];
    items.forEach(function (it) { it.among.forEach(function (p) { if (out.indexOf(p) < 0) out.push(p); }); });
    return out;
  }

  // Greedy: biggest debtor pays biggest creditor. At most n-1 transfers.
  function settle(bal) {
    var debt = [], cred = [], out = [];
    Object.keys(bal).forEach(function (p) {
      if (bal[p] < 0) debt.push({ p: p, v: -bal[p] });
      if (bal[p] > 0) cred.push({ p: p, v: bal[p] });
    });
    var by = function (a, b) { return b.v - a.v || (a.p < b.p ? -1 : 1); };
    while (debt.length && cred.length) {
      debt.sort(by); cred.sort(by);
      var d = debt[0], c = cred[0], x = Math.min(d.v, c.v);
      out.push({ from: d.p, to: c.p, amount: x });
      d.v -= x; c.v -= x;
      if (!d.v) debt.shift();
      if (!c.v) cred.shift();
    }
    return out;
  }

  function total(expenses) {
    return expenses.reduce(function (s, e) { return s + (Math.round(e.amount) > 0 ? Math.round(e.amount) : 0); }, 0);
  }

  // Trim and collapse inner spaces: " Ana   María " -> "Ana María".
  function limpiar(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }

  // True when `name` is already in `people` ignoring case and extra spaces.
  function existe(people, name) {
    var k = limpiar(name).toLowerCase();
    return people.some(function (p) { return limpiar(p).toLowerCase() === k; });
  }

  // Expense list after removing a person: their expenses go, they leave the other splits,
  // and an expense whose split becomes empty goes too (an empty split would mean "everyone").
  // Item expenses: they leave each item, an item nobody else had goes, and the total (with tip) is recomputed.
  function sinPersona(expenses, name) {
    var out = [];
    expenses.forEach(function (e) {
      if (e.payer === name) return;
      if (Array.isArray(e.items) && e.items.length) {
        var items = [];
        e.items.forEach(function (it) {
          var am = (it.among || []).filter(function (p) { return p !== name; });
          if (am.length) items.push({ what: it.what, amount: it.amount, among: am });
        });
        if (!items.length) return;
        out.push({ what: e.what, amount: montoItems(items, e.tip).total, payer: e.payer, among: quienes(items), items: items, tip: e.tip });
        return;
      }
      var among = (e.among || []).filter(function (p) { return p !== name; });
      if (e.among && e.among.length && !among.length) return;
      out.push({ what: e.what, amount: e.amount, payer: e.payer, among: among });
    });
    return out;
  }

  // Saved state from localStorage may lack fields or hold junk: fall back to defaults field by field.
  function estado(saved) {
    saved = saved && typeof saved === 'object' ? saved : {};
    return {
      people: Array.isArray(saved.people) ? saved.people.filter(function (p) { return typeof p === 'string'; }) : [],
      expenses: Array.isArray(saved.expenses) ? saved.expenses.filter(function (e) {
        return e && typeof e === 'object' && Array.isArray(e.among) && (e.items === undefined ||
          (Array.isArray(e.items) && e.items.length > 0 && e.items.every(function (it) { return it && typeof it === 'object' && Array.isArray(it.among); })));
      }) : [],
      bank: typeof saved.bank === 'string' ? saved.bank : ''
    };
  }

  var api = { PROPINA: PROPINA, repartir: repartir, montoItems: montoItems, cuotas: cuotas, quienes: quienes, balances: balances, settle: settle, total: total, limpiar: limpiar, existe: existe, sinPersona: sinPersona, estado: estado };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AppLogic = api;
})(this);
