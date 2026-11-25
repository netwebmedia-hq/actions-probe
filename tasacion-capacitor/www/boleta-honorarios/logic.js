/* Boleta Fácil: retención de honorarios y registro anual. Pure functions, no DOM (tests/js/app-factory-boleta-honorarios.test.js). */
(function (root) {
  'use strict';

  var r = Math.round;

  // Year to preselect: the current one if the table has it, else the last one.
  function defaultYear(ind, nowYear) {
    var ys = Object.keys(ind.retencionHonorariosPct).map(Number).sort();
    return ys.indexOf(nowYear) >= 0 ? nowYear : ys[ys.length - 1];
  }

  // Percentage for a year; a year outside the table uses the nearest one.
  function pctFor(year, ind) {
    var ys = Object.keys(ind.retencionHonorariosPct).map(Number), best = ys[0];
    ys.forEach(function (y) { if (Math.abs(y - year) < Math.abs(best - year)) best = y; });
    return ind.retencionHonorariosPct[best];
  }

  function desdeBruto(bruto, pct) {
    var b = r(bruto), liquido = r(b * (100 - pct) / 100);
    return { bruto: b, retencion: b - liquido, liquido: liquido };
  }

  function desdeLiquido(liquido, pct) { return desdeBruto(r(liquido * 100 / (100 - pct)), pct); }

  function fechaOk(f) { return /^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(String(f)); }

  // Keeps only usable boletas from storage: an array of items with a valid fecha and a finite bruto.
  function limpiar(raw) {
    return Array.isArray(raw) ? raw.filter(function (b) {
      return b && typeof b === 'object' && fechaOk(b.fecha) && typeof b.bruto === 'number' && isFinite(b.bruto);
    }) : [];
  }

  // boletas: [{ fecha: 'YYYY-MM-DD', cliente, bruto }]. Retention per boleta at its own year's rate.
  function resumenAnual(boletas, year, ind) {
    var pct = pctFor(year, ind), meses = [], tot = { n: 0, bruto: 0, retencion: 0, liquido: 0 }, i;
    for (i = 0; i < 12; i++) meses.push({ mes: i + 1, n: 0, bruto: 0, retencion: 0, liquido: 0 });
    boletas.forEach(function (b) {
      if (!fechaOk(b.fecha) || String(b.fecha).slice(0, 4) !== String(year)) return;
      var d = desdeBruto(b.bruto, pct), m = meses[+String(b.fecha).slice(5, 7) - 1];
      [m, tot].forEach(function (x) { x.n++; x.bruto += d.bruto; x.retencion += d.retencion; x.liquido += d.liquido; });
    });
    return { pct: pct, total: tot, meses: meses };
  }

  // Annual taxable income = 80% of annual bruto, capped at 12 x tope imponible. No refund estimate.
  function operacionRenta(brutoAnual, retencion, ind) {
    var tope = r(12 * ind.topeImponibleUf * ind.uf);
    return { rentaImponible: Math.min(r(brutoAnual * 0.8), tope), tope: tope, retencion: retencion };
  }

  function cell(s) {
    s = String(s == null ? '' : s);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // spreadsheet formula injection
    return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function csv(boletas, year, ind) {
    var pct = pctFor(year, ind);
    var rows = boletas.filter(function (b) { return String(b.fecha).slice(0, 4) === String(year); })
      .sort(function (a, b) { return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0; })
      .map(function (b) {
        var d = desdeBruto(b.bruto, pct);
        return [b.fecha, cell(b.cliente), d.bruto, d.retencion, d.liquido].join(';');
      });
    // Semicolons: Excel in Chile splits on ; (same as Libreta de Fiados).
    return ['fecha;cliente;bruto;retencion;liquido'].concat(rows).join('\n');
  }

  var api = { limpiar: limpiar, defaultYear: defaultYear, pctFor: pctFor, desdeBruto: desdeBruto, desdeLiquido: desdeLiquido, resumenAnual: resumenAnual, operacionRenta: operacionRenta, csv: csv };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AppLogic = api;
})(this);
