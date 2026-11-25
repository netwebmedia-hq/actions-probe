/* Gastos Comunes: prorrateo, morosos y mensaje. Pure functions, no DOM (tests/js/app-factory-gastos-comunes.test.js). */
(function (root) {
  'use strict';

  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  function clp(n) {
    n = Math.round(Number(n) || 0);
    // toLocaleString, not String(): String(1e21) is "1e+21".
    return (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 0 }).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }
  // One gasto this big is rejected (same bound as cotizador), so a total of a few hundred of them stays far below 1e21.
  var MAX_LINEA = 1e9;
  function sum(a) { return a.reduce(function (s, x) { return s + x; }, 0); }

  function isoDate(d) {
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }
  function mesLabel(ym) { return MESES[+ym.slice(5, 7) - 1] + ' ' + ym.slice(0, 4); }
  function fechaCL(iso) { return iso.slice(8, 10) + '-' + iso.slice(5, 7) + '-' + iso.slice(0, 4); }

  // Weights per unit. A blank/zero alicuota counts as 0, unless every unit is blank: then all are equal.
  function weights(unidades) {
    var w = unidades.map(function (u) { var a = Number(u.alic); return a > 0 ? a : 0; });
    return sum(w) > 0 ? w : w.map(function () { return 1; });
  }

  // Whole pesos that add up to exactly `monto`: floor each share, then hand the leftover
  // out one peso at a time to the biggest fractional remainders (ties: first unit first).
  function prorratear(monto, w) {
    var s = sum(w);
    var exact = w.map(function (x) { return monto * x / s; });
    var base = exact.map(function (e) { return Math.floor(e + 1e-9); });
    var left = monto - sum(base);
    var order = base.map(function (_, i) { return i; }).sort(function (a, b) {
      return (exact[b] - base[b]) - (exact[a] - base[a]) || a - b;
    });
    for (var k = 0; k < left && k < order.length; k++) base[order[k]]++;
    return base;
  }

  // gastos: [{concepto, monto}], pct: fondo de reserva %, unidades: [{id, nombre, alic}]
  function cobros(gastos, pct, unidades) {
    var total = sum(gastos.map(function (g) { return Math.round(g.monto) > 0 ? Math.round(g.monto) : 0; }));
    var reserva = Math.round(total * (pct > 0 ? pct : 0) / 100);
    var aCobrar = total + reserva;
    var items = [];
    if (unidades.length) {
      var w = weights(unidades), s = sum(w), montos = prorratear(aCobrar, w);
      items = unidades.map(function (u, i) {
        return { id: u.id, nombre: u.nombre, parte: Math.round(w[i] / s * 10000) / 100, monto: montos[i] };
      });
    }
    return { total: total, reserva: reserva, aCobrar: aCobrar, items: items };
  }

  // The saved state ({ units, meses, nid }) back from storage: anything of the wrong shape is dropped,
  // and a state that is not an object at all becomes the empty default. Never throws.
  function limpiar(raw) {
    var num = function (x) { return typeof x === 'number' && isFinite(x); };
    var out = { units: [], meses: {}, nid: 1 };
    if (!raw || typeof raw !== 'object') return out;
    if (Array.isArray(raw.units)) out.units = raw.units.filter(function (u) { return u && typeof u === 'object' && typeof u.id === 'string' && typeof u.nombre === 'string' && num(u.alic) && u.alic >= 0; })
      .map(function (u) { return { id: u.id, nombre: u.nombre, alic: u.alic }; });
    var m = raw.meses && typeof raw.meses === 'object' && !Array.isArray(raw.meses) ? raw.meses : {};
    Object.keys(m).forEach(function (ym) {
      var x = m[ym];
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ym) || !x || typeof x !== 'object' || !Array.isArray(x.gastos) || !num(x.pct) || x.pct < 0 || x.pct > 100) return;
      var mes = { gastos: x.gastos.filter(function (g) { return g && typeof g === 'object' && typeof g.concepto === 'string' && num(g.monto) && g.monto > 0 && g.monto < MAX_LINEA; })
        .map(function (g) { return { concepto: g.concepto, monto: g.monto }; }), pct: x.pct, pagos: {} };
      if (x.pagos && typeof x.pagos === 'object') Object.keys(x.pagos).forEach(function (id) { if (typeof x.pagos[id] === 'string') mes.pagos[id] = x.pagos[id]; });
      if (x.snap && typeof x.snap === 'object') {
        mes.snap = {};
        Object.keys(x.snap).forEach(function (id) { if (num(x.snap[id]) && x.snap[id] >= 0) mes.snap[id] = x.snap[id]; });
      }
      out.meses[ym] = mes;
    });
    out.nid = out.units.reduce(function (n, u) { var k = /^u(\d+)$/.exec(u.id); return k && +k[1] >= n ? +k[1] + 1 : n; }, num(raw.nid) && raw.nid >= 1 ? Math.floor(raw.nid) : 1);
    return out;
  }

  // Decimal comma for people-facing percentages.
  function pctCL(n) { return String(n).replace('.', ','); }

  // How many units have no alicuota while at least one does (those silently pay $0).
  function sinAlic(unidades) {
    var w = unidades.map(function (u) { return Number(u.alic) > 0 ? 1 : 0; });
    return sum(w) > 0 ? w.length - sum(w) : 0;
  }

  // Freeze a month: { unitId: monto } as computed now.
  function congelar(m, unidades) {
    var snap = {};
    cobros(m.gastos || [], m.pct, unidades).items.forEach(function (x) { snap[x.id] = x.monto; });
    return snap;
  }

  // meses: { 'YYYY-MM': { gastos, pct, pagos: { unitId: 'YYYY-MM-DD' }, snap? } } -> units that owe, oldest month first.
  // hoyMes ('YYYY-MM'): only months before it count as deuda; the current month is still open.
  function deudas(unidades, meses, hoyMes) {
    var keys = Object.keys(meses).sort().filter(function (ym) { return !hoyMes || ym < hoyMes; });
    return unidades.map(function (u) {
      var debe = [];
      keys.forEach(function (ym) {
        var m = meses[ym];
        var monto = m.snap ? m.snap[u.id] : (cobros(m.gastos || [], m.pct, unidades).items.filter(function (x) { return x.id === u.id; })[0] || {}).monto;
        if (monto > 0 && !(m.pagos && m.pagos[u.id])) debe.push({ mes: ym, monto: monto });
      });
      return { id: u.id, nombre: u.nombre, meses: debe, total: sum(debe.map(function (d) { return d.monto; })) };
    }).filter(function (d) { return d.total > 0; });
  }

  // o: { mes, nombre, parte, monto, gastos, reserva, pct, pagado (ISO date or '') }
  function mensaje(o) {
    var lines = ['Gastos comunes ' + mesLabel(o.mes), o.nombre, ''];
    o.gastos.forEach(function (g) { lines.push('- ' + g.concepto + ': ' + clp(g.monto)); });
    if (o.reserva > 0) lines.push('- Fondo de reserva (' + pctCL(o.pct) + '%): ' + clp(o.reserva));
    lines.push('', 'Tu alícuota: ' + pctCL(o.parte) + '%', 'Monto a pagar: ' + clp(o.monto),
      'Estado: ' + (o.pagado ? 'pagado el ' + fechaCL(o.pagado) : 'pendiente'));
    return lines.join('\n');
  }

  var api = { MAX_LINEA: MAX_LINEA, limpiar: limpiar, clp: clp, isoDate: isoDate, mesLabel: mesLabel, fechaCL: fechaCL, prorratear: prorratear, weights: weights, pctCL: pctCL, sinAlic: sinAlic, congelar: congelar, cobros: cobros, deudas: deudas, mensaje: mensaje };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AppLogic = api;
})(this);
