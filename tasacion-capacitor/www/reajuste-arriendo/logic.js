/* Reajuste Arriendo: UF a pesos, reajuste y recibo. Pure functions, no DOM, no network (tests/js/app-factory-reajuste-arriendo.test.js). */
(function (root) {
  'use strict';

  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  function clp(n) {
    n = Math.round(Number(n) || 0);
    return (n < 0 ? '-$' : '$') + String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }
  function isoDate(d) {
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }
  function mesLabel(ym) { return MESES[+ym.slice(5, 7) - 1] + ' ' + ym.slice(0, 4); }
  function fechaCL(iso) { return iso.slice(8, 10) + '-' + iso.slice(5, 7) + '-' + iso.slice(0, 4); }

  // 'YYYY-MM' moved by n months (n may be negative).
  function shiftMes(ym, n) {
    var t = +ym.slice(0, 4) * 12 + (+ym.slice(5, 7) - 1) + n;
    var m = t % 12 + 1;
    return Math.floor(t / 12) + '-' + (m < 10 ? '0' : '') + m;
  }

  // live: {value, asOf, source} from the API (or anything else); base: indicadores.json.
  function ufHoy(live, base) {
    if (live && Number(live.value) > 0) return { value: Number(live.value), asOf: live.asOf, origen: 'en vivo' };
    return { value: base.uf, asOf: base.asOf, origen: 'respaldo mensual' };
  }

  function ufAPesos(uf, valor) { return Math.round(uf * valor); }

  // Variation (%) of the UF between two months, 2 decimals; null when either month is missing.
  function variacionPct(values, desde, hasta) {
    var a = values && values[desde], b = values && values[hasta];
    if (!(a > 0) || !(b > 0)) return null;
    return Math.round((b / a - 1) * 10000) / 100;
  }

  // IPC variation (%) between two months, 1 decimal like the INE. serie: { 'YYYY-MM': { i, v, v12 } }, i = index
  // points (base 2023=100), v / v12 = the monthly and 12-month variation the INE published. Exactly 12 or 1 month
  // apart uses that official figure (the INE computes it from unrounded indexes, so the points can be 0,1 off);
  // any other span is the ratio of the published points. null when a month is missing or "desde" is after "hasta".
  function ipcVariacion(serie, desde, hasta) {
    var a = serie && serie[desde], b = serie && serie[hasta];
    if (!a || !b || !(a.i > 0) || !(b.i > 0) || desde > hasta) return null;
    if (desde === hasta) return 0;
    if (shiftMes(desde, 12) === hasta && typeof b.v12 === 'number') return b.v12;
    if (shiftMes(desde, 1) === hasta && typeof b.v === 'number') return b.v;
    return Math.round((b.i / a.i - 1) * 1000 + 1e-9) / 10;
  }

  // Latest month in an IPC answer ({ last, values }), or null when it holds no usable month.
  function ipcUltimo(j) {
    if (!j || !j.values || typeof j.values !== 'object') return null;
    var ks = Object.keys(j.values).filter(function (k) { return /^\d{4}-\d{2}$/.test(k) && j.values[k] && j.values[k].i > 0; }).sort();
    return ks.length ? ks[ks.length - 1] : null;
  }

  // The device keeps the last IPC answer: a fresh one replaces it only when it reaches at least the same month,
  // so a failed or partial refresh never takes a published month away.
  function ipcMejor(guardado, nuevo) {
    var g = ipcUltimo(guardado), n = ipcUltimo(nuevo);
    if (!n) return g ? guardado : null;
    return !g || n >= g ? nuevo : guardado;
  }

  function reajustar(monto, pct) {
    var base = Math.round(monto), nuevo = Math.round(base * (1 + pct / 100));
    return { nuevo: nuevo, diferencia: nuevo - base };
  }

  // o: { arrendador, arrendatario, direccion, mes, monto, fecha, forma }; blank fields are left out.
  function recibo(o) {
    var rows = [
      ['Mes', o.mes ? mesLabel(o.mes) : ''],
      ['Arrendador', o.arrendador],
      ['Arrendatario', o.arrendatario],
      ['Propiedad', o.direccion],
      ['Monto recibido', o.monto > 0 ? clp(o.monto) : ''],
      ['Fecha de pago', o.fecha ? fechaCL(o.fecha) : ''],
      ['Forma de pago', o.forma],
    ];
    return ['Recibo de arriendo'].concat(rows.filter(function (r) { return r[1]; }).map(function (r) { return r[0] + ': ' + r[1]; })).join('\n');
  }

  var api = { clp: clp, isoDate: isoDate, mesLabel: mesLabel, fechaCL: fechaCL, shiftMes: shiftMes, ufHoy: ufHoy, ufAPesos: ufAPesos, variacionPct: variacionPct, ipcVariacion: ipcVariacion, ipcUltimo: ipcUltimo, ipcMejor: ipcMejor, reajustar: reajustar, recibo: recibo };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AppLogic = api;
})(this);
