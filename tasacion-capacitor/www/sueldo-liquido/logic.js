/* Sueldo Líquido: bruto -> líquido y finiquito. Pure functions, no DOM (tests/js/app-factory-sueldo-liquido.test.js). */
(function (root) {
  'use strict';

  var r = Math.round;
  var TOPE_INDEMNIZACION_UF = 90; // art. 172 Código del Trabajo

  // o: { bruto, noImponible, afp: 'Habitat', salud: 'fonasa'|'isapre', planUf, contrato: 'indefinido'|'plazo', mas11: true if 11+ years with the same employer }
  function sueldoLiquido(o, ind) {
    var uf = ind.uf, utm = ind.utm;
    var bruto = Math.max(0, o.bruto || 0), noImp = Math.max(0, o.noImponible || 0);
    var base = Math.min(bruto, ind.topeImponibleUf * uf);
    var afp = r(base * (ind.afpTrabajadorPct[o.afp] || 0) / 100);
    var saludMin = base * ind.saludPct / 100;
    var saludRaw = o.salud === 'isapre' ? Math.max(saludMin, (o.planUf || 0) * uf) : saludMin;
    var salud = r(saludRaw);
    // Tax-exempt health: legal plus additional Isapre contribution, up to 7% of the tope imponible (not of this
    // person's pay). DFL 1 de 2005 (Salud) art. 187, ex art. 32 Ley 18.933; SII Oficio 2.988 de 2005.
    var saludDed = r(Math.min(saludRaw, ind.topeImponibleUf * uf * ind.saludPct / 100));
    // Ley 19.728: cesantía contributions run at most 11 years per employment relationship, so the worker's 0,6% stops.
    var ces = o.contrato === 'plazo' || o.mas11 ? 0
      : r(Math.min(bruto, ind.topeCesantiaUf * uf) * ind.cesantiaTrabajadorIndefinidoPct / 100);
    var baseTrib = Math.max(0, bruto - afp - saludDed - ces);
    var tramo = null, i, t;
    for (i = 0; i < ind.impuestoUnicoUtm.length; i++) {
      t = ind.impuestoUnicoUtm[i];
      if (t.hasta == null || baseTrib / utm <= t.hasta) { tramo = t; break; }
    }
    var impuesto = r(Math.max(0, baseTrib * tramo.factor - tramo.rebaja * utm));
    return {
      bruto: bruto, noImponible: noImp, baseCotizable: base, afp: afp, salud: salud, saludDeducible: saludDed,
      cesantia: ces, baseTributable: baseTrib, tramoFactor: tramo.factor, impuesto: impuesto,
      liquido: bruto - afp - salud - ces - impuesto + noImp
    };
  }

  // Smallest whole-peso bruto whose líquido reaches the target (bisection). null if out of range.
  function brutoParaLiquido(liquido, o, ind) {
    var lo = 0, hi = 100000000, mid;
    var f = function (b) { return sueldoLiquido(Object.assign({}, o, { bruto: b }), ind).liquido; };
    if (f(hi) < liquido) return null;
    while (lo < hi) {
      mid = Math.floor((lo + hi) / 2);
      if (f(mid) >= liquido) hi = mid; else lo = mid + 1;
    }
    return { bruto: lo, detalle: sueldoLiquido(Object.assign({}, o, { bruto: lo }), ind) };
  }

  function parse(s) { var p = String(s).split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function addMonths(ms, n) {
    var d = new Date(ms), y = d.getUTCFullYear(), m = d.getUTCMonth() + n, last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return Date.UTC(y, m, Math.min(d.getUTCDate(), last));
  }

  // Años de servicio: full years, +1 if the remainder is over 6 months, max 11, 0 if under 1 year.
  function aniosServicio(ingreso, termino) {
    var a = parse(ingreso), b = parse(termino), n = 0;
    while (addMonths(a, 12 * (n + 1)) <= b) n++;
    if (n < 1) return 0;
    return Math.min(11, n + (b > addMonths(a, 12 * n + 6) ? 1 : 0));
  }

  // Calendar days that cover `habiles` Mon-Fri days, counting from the day after `termino` (holidays ignored).
  // Feriado proporcional is rarely whole (1,25 days a month): the whole days are counted on the calendar
  // and the fraction is added as is, so 7,5 hábiles is never rounded to 8.
  function diasCorridos(termino, habiles) {
    var h = Math.max(0, Number(habiles) || 0), whole = Math.floor(h), frac = Math.round((h - whole) * 100) / 100;
    var d = parse(termino), dias = 0, left = whole, wd;
    while (left > 0) {
      d += 86400000; dias++;
      wd = new Date(d).getUTCDay();
      if (wd !== 0 && wd !== 6) left--;
    }
    return dias + frac;
  }

  // o: { sueldo, ingreso, termino, causal: 'necesidades'|'renuncia'|'mutuo'|'plazo', avisoDado, diasVacaciones }
  function finiquito(o, ind) {
    // 90 UF is the art. 172 Código del Trabajo cap on the indemnity; not the tope imponible, which only equals it today.
    var sueldo = Math.max(0, o.sueldo || 0), tope = ind.uf * TOPE_INDEMNIZACION_UF, art161 = o.causal === 'necesidades';
    var anios = art161 ? aniosServicio(o.ingreso, o.termino) : 0;
    var indem = r(anios * Math.min(sueldo, tope));
    var aviso = art161 && !o.avisoDado ? r(Math.min(sueldo, tope)) : 0;
    var dias = diasCorridos(o.termino, o.diasVacaciones);
    var vac = r(sueldo / 30 * dias);
    return {
      anios: anios, indemnizacion: indem, avisoPrevio: aviso, diasCorridos: dias, vacaciones: vac,
      total: indem + aviso + vac
    };
  }

  // Segments of the breakdown bar. w is the exact share of the bruto in percent (no minimum, no rounding), so the bar never
  // distorts the numbers; the parts always add up to 100. Zero parts are left out.
  function barra(d) {
    return [['Líquido', d.liquido - d.noImponible, 'k1'], ['AFP', d.afp, 'k2'], ['Salud', d.salud, 'k3'], ['Cesantía', d.cesantia, 'k4'], ['Impuesto', d.impuesto, 'k5']]
      .filter(function (p) { return p[1] > 0; })
      .map(function (p) { return { label: p[0], value: p[1], cls: p[2], w: p[1] / d.bruto * 100 }; });
  }

  var api = { barra: barra, sueldoLiquido: sueldoLiquido, brutoParaLiquido: brutoParaLiquido, aniosServicio: aniosServicio, diasCorridos: diasCorridos, finiquito: finiquito };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AppLogic = api;
})(this);
