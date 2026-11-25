/* Cotiza Fácil: quote totals and WhatsApp text. Pure functions, no DOM (tests/js/app-factory-cotizador.test.js). */
(function (root) {
  'use strict';

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function parse(s) { var p = s.split('-'); return { y: +p[0], m: +p[1], d: +p[2] }; }
  function clp(n) { return (n < 0 ? '-$' : '$') + String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function fechaCL(s) { var p = parse(s); return pad(p.d) + '-' + pad(p.m) + '-' + p.y; }

  // Default 15 days when `dias` is not a positive whole number.
  function validoHasta(hoy, dias) {
    dias = Math.floor(Number(dias));
    if (!(dias > 0)) dias = 15;
    var p = parse(hoy);
    var t = new Date(Date.UTC(p.y, p.m - 1, p.d) + dias * 864e5);
    return t.getUTCFullYear() + '-' + pad(t.getUTCMonth() + 1) + '-' + pad(t.getUTCDate());
  }

  // A line this big is rejected, so any realistic total stays far below 1e12 (no "$1e+21").
  var MAX_LINEA = 1e9;
  function muyGrande(it) { var c = Number(it.c), v = Number(it.v); return c > 0 && v > 0 && !(c * v < MAX_LINEA); }

  function lineas(items) {
    return items.map(function (it) {
      var c = Number(it.c), v = Number(it.v);
      return { d: String(it.d || '').trim(), c: c, v: v, sub: c > 0 && v > 0 && !muyGrande(it) ? Math.round(c * v) : 0 };
    }).filter(function (l) { return l.d || l.sub; });
  }

  // ivaMode: 'sin' (no IVA) | 'mas' (+19%) | 'incl' (prices already include IVA). Whole pesos.
  function totales(items, ivaMode) {
    var suma = lineas(items).reduce(function (s, l) { return s + l.sub; }, 0);
    if (ivaMode === 'mas') { var iva = Math.round(suma * 0.19); return { neto: suma, iva: iva, total: suma + iva }; }
    if (ivaMode === 'incl') { var neto = Math.round(suma / 1.19); return { neto: neto, iva: suma - neto, total: suma }; }
    return { neto: suma, iva: 0, total: suma };
  }

  function numero(n) { var s = String(Math.max(1, Math.floor(Number(n)) || 1)); while (s.length < 4) s = '0' + s; return 'N° ' + s; }

  function texto(cot, neg, hoy) {
    var t = totales(cot.items, cot.iva);
    var out = ['*Cotización ' + numero(cot.numero) + '*'];
    var cab = [neg.nombre, neg.giro].filter(Boolean).join(' · ');
    if (cab) out.push(cab);
    var contacto = [neg.rut ? 'RUT ' + neg.rut : '', neg.telefono].filter(Boolean).join(' · ');
    if (contacto) out.push(contacto);
    out.push('');
    if (cot.cliente) out.push('Cliente: ' + cot.cliente);
    out.push('Fecha: ' + fechaCL(hoy), '');
    lineas(cot.items).forEach(function (l, i) {
      out.push((i + 1) + '. ' + (l.d || 'Ítem') + ': ' + String(l.c).replace('.', ',') + ' x ' + clp(l.v) + ' = ' + clp(l.sub));
    });
    out.push('');
    if (cot.iva === 'mas' || cot.iva === 'incl') out.push('Neto: ' + clp(t.neto), 'IVA 19%: ' + clp(t.iva));
    out.push('*Total: ' + clp(t.total) + '*' + (cot.iva === 'incl' ? ' (IVA incluido)' : cot.iva === 'mas' ? '' : ' (sin IVA)'));
    out.push('Válida hasta el ' + fechaCL(validoHasta(hoy, cot.dias)) + '.');
    if (cot.notas && cot.notas.trim()) out.push('Notas: ' + cot.notas.trim());
    return out.join('\n');
  }

  var api = { totales: totales, validoHasta: validoHasta, texto: texto, numero: numero, lineas: lineas, muyGrande: muyGrande, clp: clp, fechaCL: fechaCL };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AppLogic = api;
})(this);
