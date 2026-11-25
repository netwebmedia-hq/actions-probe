/* Pensión de Alimentos: mínimos de la Ley 14.908. Pure functions, no DOM (tests/js/app-factory-pension-alimentos.test.js). */
(function (root) {
  'use strict';

  // Ley 14.908 (texto refundido DFL 1 de 2000), read 2026-11-16 at
  // https://www.leychile.cl/Consulta/obtxml?opt=7&idNorma=172986 :
  // art. 3: one child, at least 40% of the ingreso mínimo remuneracional "que corresponda según la edad del
  // alimentante"; two or more, at least 30% per child. art. 7: no more than 50% of the payer's income,
  // unless the court has founded reasons to go above it.
  var MIN_UN_HIJO = 0.4, MIN_VARIOS = 0.3, TOPE_INGRESO = 0.5;

  // -> { hijos, porHijo, total, tope (null without income), superaTope }
  // edadEspecial: the payer is under 18 or over 65, who has a lower ingreso mínimo.
  function minimo(hijos, ingresoPagador, ind, edadEspecial) {
    var base = edadEspecial ? ind.ingresoMinimoMenor18Mayor65 : ind.ingresoMinimo;
    var n = hijos >= 1 && hijos <= 20 && hijos % 1 === 0 ? hijos : 0; // anything else is invalid, not floored
    var porHijo = n === 0 ? 0 : Math.round(base * (n === 1 ? MIN_UN_HIJO : MIN_VARIOS));
    var total = porHijo * n;
    var tope = ingresoPagador > 0 ? Math.round(ingresoPagador * TOPE_INGRESO) : null;
    return { base: base, hijos: n, porHijo: porHijo, total: total, tope: tope, superaTope: tope !== null && total > ingresoPagador * TOPE_INGRESO };
  }

  // No interest or reajuste: the court sets them.
  function deuda(mensual, mesesImpagos, abonos) {
    var devengado = Math.round(Math.max(0, mensual || 0)) * Math.max(0, Math.floor(mesesImpagos || 0));
    var ab = Math.round(Math.max(0, abonos || 0));
    return { devengado: devengado, abonos: ab, saldo: Math.max(0, devengado - ab), aFavor: Math.max(0, ab - devengado) };
  }

  // Keeps only usable pagos from storage: an array of items with a valid fecha and a finite monto.
  function limpiar(raw) {
    return Array.isArray(raw) ? raw.filter(function (p) {
      return p && typeof p === 'object' && /^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(String(p.fecha)) && typeof p.monto === 'number' && isFinite(p.monto);
    }) : [];
  }

  function totalPagado(pagos) {
    return pagos.reduce(function (s, p) { return s + (Math.round(p.monto) > 0 ? Math.round(p.monto) : 0); }, 0);
  }

  var api = { minimo: minimo, deuda: deuda, limpiar: limpiar, totalPagado: totalPagado };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AppLogic = api;
})(this);
