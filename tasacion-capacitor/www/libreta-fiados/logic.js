/* Libreta de Fiados: saldos, recordatorio, teléfono y CSV. Pure functions, no DOM (tests/js/app-factory-libreta-fiados.test.js). */
(function (root) {
  'use strict';

  function clp(n) {
    n = Math.round(Number(n) || 0);
    return (n < 0 ? '-$' : '$') + String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }
  function isoDate(d) {
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }

  function fechaCL(iso) { return iso.slice(8, 10) + '-' + iso.slice(5, 7) + '-' + iso.slice(0, 4); }

  // movs: [{ tipo: 'fiado' | 'abono', monto, nota, fecha: 'YYYY-MM-DD' }]. Fiado adds debt, abono reduces it.
  function signed(m) {
    var v = Math.round(m.monto);
    if (!(v > 0)) return 0;
    return m.tipo === 'abono' ? -v : v;
  }
  function saldo(movs) {
    return movs.reduce(function (s, m) { return s + signed(m); }, 0);
  }

  // Oldest first (same day keeps the order they were entered), each with the balance after it.
  function conSaldos(movs) {
    var run = 0;
    return movs.map(function (m, i) { return { m: m, i: i }; })
      .sort(function (a, b) { return a.m.fecha < b.m.fecha ? -1 : a.m.fecha > b.m.fecha ? 1 : a.i - b.i; })
      .map(function (x) {
        run += signed(x.m);
        var out = {};
        Object.keys(x.m).forEach(function (k) { out[k] = x.m[k]; });
        out.saldo = run;
        return out;
      });
  }

  // What the shop is owed: only clients with a positive balance (a client who overpaid does not cancel another's debt).
  function totalPorCobrar(clientes) {
    return clientes.reduce(function (s, c) { var v = saldo(c.movs); return s + (v > 0 ? v : 0); }, 0);
  }

  // Chilean mobile -> 569XXXXXXXX for wa.me, or null when it is not clearly one.
  function telefonoWa(tel) {
    var d = String(tel == null ? '' : tel).replace(/\D/g, '');
    if (d.length === 9 && d.charAt(0) === '9') return '56' + d;
    if (d.length === 11 && d.indexOf('569') === 0) return d;
    return null;
  }

  function mensajeCobro(cliente, saldoActual, negocio) {
    return 'Hola ' + cliente.nombre + '.' + (negocio ? ' Te escribo de ' + negocio + '.' : '') +
      ' Te recuerdo que tienes un saldo pendiente de ' + clp(saldoActual) +
      '. Cuando puedas pasar o transferir, te lo agradezco mucho. ¡Gracias!';
  }

  function cell(v, guard) {
    var s = String(v == null ? '' : v);
    if (guard && /^[=+\-@\t\r]/.test(s)) s = "'" + s; // keeps spreadsheets from running a typed formula
    return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function csv(clientes) {
    var rows = [['cliente', 'telefono', 'fecha', 'tipo', 'monto', 'nota', 'saldo']];
    clientes.forEach(function (c) {
      conSaldos(c.movs).forEach(function (m) {
        rows.push([cell(c.nombre, true), cell(c.tel, true), cell(m.fecha), cell(m.tipo), Math.round(m.monto), cell(m.nota, true), m.saldo]);
      });
    });
    return rows.map(function (r) { return r.join(';'); }).join('\n');
  }

  var api = { clp: clp, isoDate: isoDate, fechaCL: fechaCL, saldo: saldo, conSaldos: conSaldos, totalPorCobrar: totalPorCobrar, telefonoWa: telefonoWa, mensajeCobro: mensajeCobro, csv: csv };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AppLogic = api;
})(this);
