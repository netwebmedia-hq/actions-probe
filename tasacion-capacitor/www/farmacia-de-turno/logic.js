/* Farmacia de Turno: matching and formatting for the MINSAL feed. Pure functions, no DOM, no network
   (tests/js/app-factory-farmacia-de-turno.test.js). */
(function (root) {
  'use strict';

  // Uppercase, no accents, single spaces. Ñ folds to N too: "Ñuñoa", "ñuñoa " and "NUNOA" are the same comuna.
  function norm(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
  }

  var CHICAS = { DE: 1, DEL: 1, LA: 1, LAS: 1, LOS: 1, Y: 1, E: 1 };

  // "CRUZ VERDE" -> "Cruz Verde", "VIÑA DEL MAR" -> "Viña del Mar"
  function titulo(s) {
    return String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim().split(' ').map(function (w, i) {
      if (i && CHICAS[norm(w)]) return w;
      return w.replace(/(^|[-\/(])(\S)/g, function (m, a, b) { return a + b.toUpperCase(); });
    }).join(' ');
  }

  // Unique comunas, display name in title case, sorted for Spanish.
  function comunas(locales) {
    var seen = {}, out = [];
    locales.forEach(function (l) {
      var k = norm(l.comuna);
      if (k && !seen[k]) { seen[k] = 1; out.push(titulo(l.comuna)); }
    });
    return out.sort(function (a, b) { return a.localeCompare(b, 'es'); });
  }

  // Exact comuna first; when nothing matches exactly, comunas that contain the text ("vina" -> Viña del Mar).
  function porComuna(locales, query) {
    var q = norm(query);
    if (!q) return [];
    var exact = locales.filter(function (l) { return norm(l.comuna) === q; });
    var res = exact.length ? exact : locales.filter(function (l) { return norm(l.comuna).indexOf(q) >= 0; });
    return res.slice().sort(function (a, b) { return norm(a.comuna).localeCompare(norm(b.comuna)) || norm(a.nombre).localeCompare(norm(b.nombre)); });
  }

  function diaAnterior(hoy) {
    var p = String(hoy).split('-'), t = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] - 1));
    return t.getUTCFullYear() + '-' + ('0' + (t.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + t.getUTCDate()).slice(-2);
  }

  // Until 09:00 the feed still holds the duty list that started yesterday, so yesterday's asOf counts as current.
  function esAntiguo(asOf, hoy, hora) {
    if (!asOf) return true;
    if (asOf === hoy) return false;
    return !(asOf === diaAnterior(hoy) && hora < 9);
  }

  // Freshness chip: "hoy", "ayer", otherwise the date (dd-mm-yyyy).
  function relativo(asOf, hoy) {
    if (asOf && asOf === hoy) return 'hoy';
    if (asOf && asOf === diaAnterior(hoy)) return 'ayer';
    return fechaCL(asOf);
  }

  // The feed's own fetch time (turnos.json "revisado", ISO UTC) as Chile date and clock: { fecha: 'YYYY-MM-DD', hora: 'HH:MM' }; null when it is not a valid ISO time.
  function revisadoCL(iso) {
    var d = new Date(iso);
    if (typeof iso !== 'string' || isNaN(d.getTime())) return null;
    try {
      var p = {};
      new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).forEach(function (x) { p[x.type] = x.value; });
      return { fecha: p.year + '-' + p.month + '-' + p.day, hora: p.hour + ':' + p.minute };
    } catch (e) { return null; }
  }

  function mapaUrl(l) {
    var base = 'https://www.google.com/maps/search/?api=1&query=';
    if (typeof l.lat === 'number' && typeof l.lng === 'number' && isFinite(l.lat) && isFinite(l.lng)) return base + l.lat + ',' + l.lng;
    return base + encodeURIComponent([l.direccion, l.comuna, 'Chile'].filter(Boolean).join(', '));
  }

  // Only digits and a leading + survive, so nothing from the feed can smuggle a different scheme.
  function telHref(tel) {
    var t = String(tel == null ? '' : tel).replace(/[^\d+]/g, '');
    t = (t.charAt(0) === '+' ? '+' : '') + t.replace(/\+/g, '');
    return t.replace(/\D/g, '').length >= 6 ? 'tel:' + t : '';
  }

  function minutos(h) { var m = /^(\d{1,2}):(\d{2})$/.exec(String(h)); return m ? +m[1] * 60 + +m[2] : -1; }

  function horario(l) {
    if (!l.abre || !l.cierra) return '';
    var a = minutos(l.abre), c = minutos(l.cierra);
    if (a < 0 || c < 0) return l.abre + ' a ' + l.cierra;
    if (c === (a + 1439) % 1440) return '24 horas'; // closes one minute before it opens: never closes
    return l.abre + ' a ' + l.cierra + (c < a ? ' (día siguiente)' : '');
  }

  // Open at `min` (minutes since midnight, Chile time)? A closing time earlier than the opening one runs past midnight;
  // 24 horas (closes one minute before it opens) is open all day. No hours in the feed: null (unknown, never "closed").
  function abierta(l, min) {
    var a = minutos(l.abre), c = minutos(l.cierra);
    if (a < 0 || c < 0) return null;
    return a <= c ? min >= a && min <= c : min >= a || min <= c;
  }

  function fechaCL(s) { var p = String(s || '').split('-'); return p.length === 3 ? p[2] + '-' + p[1] + '-' + p[0] : String(s || ''); }

  var api = { norm: norm, titulo: titulo, comunas: comunas, porComuna: porComuna, esAntiguo: esAntiguo, relativo: relativo, revisadoCL: revisadoCL, mapaUrl: mapaUrl, telHref: telHref, horario: horario, abierta: abierta, fechaCL: fechaCL };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AppLogic = api;
})(this);
