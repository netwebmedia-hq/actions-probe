/* Auto al Día: Chilean car paperwork deadlines. Pure functions, no DOM (tests/js/app-factory-auto-al-dia.test.js). */
(function (root) {
  'use strict';

  // Revisión técnica: month of preference by last digit of the patente.
  // Source: ChileAtiende, ficha "Revisión técnica de vehículos motorizados" (updated 2026-04-28),
  // https://www.chileatiende.gob.cl/fichas/23978-revision-tecnica-de-vehiculos-motorizados
  // Checked 2026-11-16. The ficha does not split the calendar by vehicle class and says nothing
  // specific about motos, so motos are NOT supported here.
  var MES_REV = { 9: 1, 0: 2, 1: 4, 2: 5, 3: 6, 4: 7, 5: 8, 6: 9, 7: 10, 8: 11 };
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var TIPOS = {
    rev: { label: 'Revisión técnica', nota: 'Mes según el último dígito de la patente.' },
    permiso: { label: 'Permiso de circulación', nota: 'Puedes pagarlo en dos cuotas: la segunda vence el 31 de agosto.' },
    permiso2: { label: 'Permiso de circulación, segunda cuota', nota: 'Solo si pagas el permiso en dos cuotas: la segunda vence el 31 de agosto.' },
    soap: { label: 'SOAP', nota: 'Se necesita para pagar el permiso de circulación.' }
  };

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(y, m, d) { return y + '-' + pad(m) + '-' + pad(d); }
  function parse(s) { var p = s.split('-'); return { y: +p[0], m: +p[1], d: +p[2] }; }
  function utc(s) { var p = parse(s); return Date.UTC(p.y, p.m - 1, p.d); }
  function addDays(s, n) {
    var t = new Date(utc(s) + n * 864e5);
    return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  }
  function diasEntre(a, b) { return Math.round((utc(b) - utc(a)) / 864e5); }
  function ultimoDia(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
  function fechaCL(s) { var p = parse(s); return pad(p.d) + '-' + pad(p.m) + '-' + p.y; }
  // "2027-03-31" -> "31 mar 2027": the date as people say it, for the rows on screen.
  function fechaCorta(s) { var p = parse(s); return p.d + ' ' + MESES[p.m - 1].slice(0, 3) + ' ' + p.y; }

  // "ab-cd 12" -> "ABCD12". Returns '' when it is not ABCD12 or AB1234.
  function patente(s) {
    var p = String(s == null ? '' : s).toUpperCase().replace(/[\s.\-·]/g, '');
    return /^([A-Z]{4}\d{2}|[A-Z]{2}\d{4})$/.test(p) ? p : '';
  }

  function vencimiento(kind, pat, year) {
    if (kind === 'rev') {
      var m = MES_REV[+pat.charAt(pat.length - 1)];
      return iso(year, m, ultimoDia(year, m));
    }
    if (kind === 'permiso2') return iso(year, 8, 31);
    return iso(year, 3, 31);
  }

  // hechos: { kind: lastYearDone }. A deadline done for this year moves to next year.
  // opts.dos: the person pays the permiso in two cuotas, so the second one (permiso2) is a deadline; one payment, no permiso2 row.
  // opts.sinRev: revisión técnica does not apply (new car): the row stays, marked na, and never counts as pending.
  // Not done and already past this year -> tag 'bad' (negative days). Rows come back in due-date order
  // (ties keep the order permiso, SOAP), so the first one not done is the one the hero names.
  function plazos(pat, hoy, hechos, opts) {
    var y0 = parse(hoy).y;
    hechos = hechos || {};
    opts = opts || {};
    return ['rev', 'permiso', 'soap', 'permiso2'].filter(function (kind) { return kind !== 'permiso2' || opts.dos; }).map(function (kind) {
      var done = hechos[kind];
      var hecho = typeof done === 'number' && done >= y0;
      var year = hecho ? done + 1 : y0;
      var due = vencimiento(kind, pat, year);
      var dias = diasEntre(hoy, due);
      var na = kind === 'rev' && !!opts.sinRev;
      return {
        kind: kind, label: TIPOS[kind].label, nota: na ? 'No aplica: por ejemplo, un auto nuevo todavía exento.' : TIPOS[kind].nota, due: due, year: year,
        dias: dias, tag: na ? 'ok' : dias < 0 ? 'bad' : dias <= 30 ? 'warn' : 'ok', hecho: hecho, na: na
      };
    }).sort(function (a, b) { return a.due < b.due ? -1 : a.due > b.due ? 1 : 0; });
  }

  // The sample plate: the next cycle. This year's past deadlines count as handled and show next year's date, so
  // the rows are all upcoming and all read "Ya lo hice". The last digit is picked so the revisión técnica falls
  // within 30 days of today (one amber pill among green ones); if none does, the nearest one still ahead.
  function ejemploPat(hoy) {
    var best = 0, bd = 1e9, y = parse(hoy).y;
    for (var d = 0; d <= 9; d++) {
      var n = diasEntre(hoy, vencimiento('rev', 'BBCL1' + d, y));
      if (n >= 0 && n < bd) { bd = n; best = d; }
    }
    return 'BBCL1' + best;
  }
  // hechos = what the person tapped in the example (memory only). hecho is true only for those taps.
  // The example always shows the second cuota too, so it shows every kind of row the tool can have.
  function ejemplo(hoy, hechos) {
    var y = parse(hoy).y, pat = ejemploPat(hoy), mine = hechos || {}, eff = {}, dos = { dos: true };
    plazos(pat, hoy, {}, dos).forEach(function (p) { if (p.dias < 0) eff[p.kind] = y; });
    Object.keys(mine).forEach(function (k) { eff[k] = mine[k]; });
    return plazos(pat, hoy, eff, dos).map(function (p) {
      p.hecho = typeof mine[p.kind] === 'number';
      return p;
    });
  }

  function esc(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }

  // RFC 5545 line folding: 75 octets per line, continuation lines start with one space.
  function fold(line) {
    var out = [], cur = '', n = 0, i, ch, b;
    for (i = 0; i < line.length; i++) {
      ch = line.charAt(i);
      b = line.charCodeAt(i);
      if (b >= 0xD800 && b < 0xDC00 && i + 1 < line.length) { ch += line.charAt(++i); b = 4; }
      else b = b < 0x80 ? 1 : b < 0x800 ? 2 : 3;
      if (n + b > 75) { out.push(cur); cur = ' '; n = 1; }
      cur += ch; n += b;
    }
    out.push(cur);
    return out.join('\r\n');
  }

  // .ics with the due date (with a VALARM 15 days before) and, as a visible marker for calendars
  // that ignore VALARM on import (Google), an all-day event 15 days before, with no alarm of its own.
  function ics(pat, apodo, plazo, hoy) {
    var who = pat + (apodo ? ' (' + apodo + ')' : '');
    var stamp = hoy.replace(/-/g, '') + 'T000000Z';
    function ev(id, fecha, titulo, desc, alarm) {
      return ['BEGIN:VEVENT', 'UID:' + plazo.kind + '-' + pat + '-' + plazo.due + id + '@dongaston.com', 'DTSTAMP:' + stamp,
        'DTSTART;VALUE=DATE:' + fecha.replace(/-/g, ''), 'DTEND;VALUE=DATE:' + addDays(fecha, 1).replace(/-/g, ''),
        'SUMMARY:' + esc(titulo), 'DESCRIPTION:' + esc(desc)]
        .concat(alarm ? ['BEGIN:VALARM', 'TRIGGER:-P15D', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc('En 15 días vence ' + titulo), 'END:VALARM'] : [], ['END:VEVENT']);
    }
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Auto al Dia//ES', 'CALSCALE:GREGORIAN']
      .concat(ev('', plazo.due, plazo.label + ' ' + who, plazo.nota, true));
    // A reminder dated before today would land in the past, so skip it.
    if (diasEntre(hoy, plazo.due) >= 15) {
      lines = lines.concat(ev('-aviso', addDays(plazo.due, -15), 'Aviso: en 15 días vence ' + plazo.label + ' ' + who, 'Vence el ' + fechaCL(plazo.due) + '. ' + plazo.nota));
    }
    return lines.concat(['END:VCALENDAR']).map(fold).join('\r\n') + '\r\n';
  }

  var api = {
    patente: patente, plazos: plazos, ejemplo: ejemplo, ejemploPat: ejemploPat, ics: ics, addDays: addDays, fechaCL: fechaCL, fechaCorta: fechaCorta,
    mesRev: function (pat) { return MESES[MES_REV[+pat.charAt(pat.length - 1)] - 1]; }
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AppLogic = api;
})(this);
