/* Farmacia de Turno UI: DOM only. The feed is third-party data: every field goes through Shell.esc(). */
(function () {
  'use strict';
  var S = window.Shell, L = window.AppLogic, $ = S.$;
  // Published a few times a day by .github/workflows/apps-farmacias-turno.yml. Absolute so the iOS app reads the live file too.
  // Web (dongaston.com or fracmo.ai, each host gets its own copy): same origin. iOS app: the bundle has no live feed.
  var API = location.protocol === 'https:' ? 'turnos.json' : 'https://dongaston.com/apps/farmacia-de-turno/turnos.json';
  var OFICIAL = '<a href="https://www.minsal.cl/farmanet/" target="_blank" rel="noopener">minsal.cl/farmanet</a>';
  var data = null;    // { asOf, revisado, locales }
  var fallo = false;  // true when the data on screen is cached because the fetch failed

  // Chile date and hour (Shell.hoy / ahoraMin), not the device clock: a phone abroad would call fresh data old, or the reverse.
  function hoy() { return S.hoy(); }

  function aviso(cls, html) { $('#estado').innerHTML = '<p class="' + cls + '">' + html + '</p>'; }

  function estado() {
    var chip = $('#chip');
    if (!data) { chip.hidden = true; aviso('bad', 'No hay conexión y todavía no hay datos guardados en este dispositivo. Revisa la lista oficial en ' + OFICIAL + '.'); return; }
    var viejo = L.esAntiguo(data.asOf, hoy(), Math.floor(ahoraMin() / 60));
    // Small chip next to the search: amber when the data is not today's, green when it is.
    chip.hidden = false; chip.className = 'stamp ' + (viejo || fallo ? 'warn' : 'ok');
    // "a las HH:MM" is the feed's real fetch time (Chile clock), shown only when that fetch happened on the data's own day.
    var rv = L.revisadoCL(data.revisado);
    chip.textContent = 'Actualizado ' + L.relativo(data.asOf, hoy()) + (rv && rv.fecha === data.asOf ? ' a las ' + rv.hora : '');
    if (fallo) aviso('warn', 'No se pudo actualizar. Datos del ' + S.esc(L.fechaCL(data.asOf)) + (viejo ? ', pueden estar desactualizados. Revisa ' + OFICIAL + '.' : '.'));
    else if (viejo) aviso('warn', 'Estos datos no son de hoy (son del ' + S.esc(L.fechaCL(data.asOf)) + '). Revisa ' + OFICIAL + '.');
    else $('#estado').innerHTML = '';
  }

  // "+5626313704" -> "+56 2 6313 704": readable, same digits.
  function telLabel(t) {
    var d = String(t == null ? '' : t).replace(/\D/g, '').replace(/^56/, '');
    return d.length >= 8 && d.length <= 9 ? '+56 ' + d.charAt(0) + ' ' + d.slice(1, 5) + ' ' + d.slice(5) : String(t);
  }

  // Minutes since midnight in Chile; the device clock only when Intl or the zone is missing.
  function ahoraMin() {
    try {
      var p = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()), h = 0, m = 0;
      p.forEach(function (x) { if (x.type === 'hour') h = +x.value; else if (x.type === 'minute') m = +x.value; });
      return h * 60 + m;
    } catch (e) { var d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
  }

  // Every card that is open now carries the green accent; the label only when the cards differ (the header already says "todas abiertas") (there is no geolocation, so never "the closest").
  function card(l, min, uniform) {
    var tel = L.telHref(l.telefono), hr = L.horario(l), on = L.abierta(l, min) === true;
    return '<section class="card far' + (on ? ' open' : '') + '">' + (on && !uniform ? '<p class="now">Abierta ahora</p>' : '') + '<div class="fh"><h2>' + S.esc(L.titulo(l.nombre)) + '</h2>' +
      (hr ? '<span class="hrs' + (on ? ' on' : '') + '">' + S.esc(hr === '24 horas' ? 'Turno de 24 horas' : 'Turno ' + hr) + (on ? '<span class="sr"> (abierta ahora)</span>' : '') + '</span>' : '') + '</div>' +
      '<p class="adr">' + S.esc(L.titulo(l.direccion)) + ', ' + S.esc(L.titulo(l.comuna)) + '</p>' +
      '<div class="actions">' +
      // No phone published: no call slot at all, only the map button.
      (tel ? '<a class="btn small" href="' + S.esc(tel) + '">Llamar ' + S.esc(telLabel(l.telefono)) + '</a>' : '') +
      '<a class="btn ghost small" href="' + S.esc(L.mapaUrl(l)) + '" target="_blank" rel="noopener">Cómo llegar</a>' +
      '</div></section>';
  }

  var POP = ['Santiago', 'Providencia', 'Las Condes', 'Ñuñoa', 'Maipú', 'Puente Alto', 'La Serena', 'Valparaíso', 'Concepción'];
  // Empty state: a friendly picture and one-tap comunas that exist in the feed.
  function vacio() {
    var have = {}; L.comunas(data.locales).forEach(function (c) { have[L.norm(c)] = c; });
    var btn = function (c, cls) { return '<button type="button" class="' + cls + '" data-c="' + S.esc(c) + '">' + S.esc(c) + '</button>'; };
    // Two tidy rows of frequent comunas (3 per row); the rest of the feed sits behind "Ver todas".
    var chips = POP.filter(function (c) { return have[L.norm(c)]; }).slice(0, 6).map(function (c) { return btn(c, 'pick'); }).join('');
    var todas = L.comunas(data.locales);
    return '<div class="empty"><p class="picksh">Comunas frecuentes</p>' + (chips ? '<span class="picks">' + chips + '</span>' : '') +
      (todas.length ? '<details class="allc"><summary>Ver todas las comunas (' + todas.length + ')</summary><div class="allg">' + todas.map(function (c) { return btn(c, 'pickl'); }).join('') + '</div></details>' : '') + '</div>';
  }

  function buscar() {
    var q = $('#comuna').value;
    $('#comunaX').hidden = !q;
    if (!data) { $('#lista').innerHTML = ''; S.live('', 'Sin datos todavía'); return; }
    var res = L.porComuna(data.locales, q);
    // Phones: once a comuna has results, the illustration folds away so the first card starts on the first screen.
    document.documentElement.classList.toggle('con-comuna', !!q.trim() && !!res.length);
    if (!q.trim()) {
      // One real line from the feed, only while the data is current (same staleness check as the chip): never a count from an old list.
      var n = data.locales.length, fresco = !L.esAntiguo(data.asOf, hoy(), Math.floor(ahoraMin() / 60));
      S.live('', fresco && n ? 'Hoy hay ' + S.miles(n) + (n === 1 ? ' farmacia de turno' : ' farmacias de turno') + ' en Chile' : 'Con teléfono y cómo llegar');
      $('#lista').innerHTML = vacio(); return;
    }
    if (!res.length) { S.live('0', 'en ' + L.titulo(q.trim())); $('#lista').innerHTML = '<div class="empty"><svg class="ill" viewBox="0 0 64 64" width="64" height="64" aria-hidden="true" focusable="false"><circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="5 5"/><path d="M22 40l20-16M22 24l20 16" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity=".0"/><circle cx="32" cy="32" r="7" fill="currentColor" opacity=".25"/></svg><b>No hay farmacias de turno en esa comuna.</b>Prueba con otra comuna cercana.</div>'; return; }
    S.save('comuna', q.trim());
    var min = ahoraMin(), con = res.filter(function (l) { return L.abierta(l, min) !== null; }), ab = con.filter(function (l) { return L.abierta(l, min); }).length;
    // Counted only among locales with hours in the feed; none with hours: just the count.
    // The dot only joins two parts, and a no-break space keeps it on the first line when the sentence wraps.
    // "3 farmacias ... 3 abiertas" repeats the number: when every one is open (or none is), say so instead of counting again.
    var estado = !con.length ? '' : ab === res.length ? (ab === 1 ? 'abierta ahora' : 'todas abiertas ahora') : ab === 0 ? 'ninguna abierta ahora' : ab + (ab === 1 ? ' abierta ahora' : ' abiertas ahora');
    var cab = (res.length === 1 ? 'farmacia' : 'farmacias') + ' en ' + L.titulo(q.trim());
    S.live(String(res.length), estado && ab === res.length ? cab + ', ' + estado : [cab, estado].filter(Boolean).join(' · '));
    $('#lista').innerHTML = res.map(function (l) { return card(l, min, con.length > 0 && ab === res.length); }).join('');
  }

  function usar(d, huboFallo) {
    data = d; fallo = huboFallo;
    $('#comunas').innerHTML = L.comunas(d.locales).map(function (c) { return '<option value="' + S.esc(c).replace(/"/g, '&quot;') + '"></option>'; }).join('');
    estado(); buscar();
  }

  function cargar() {
    aviso('mut', 'Buscando datos…');
    fetch(API + '?h=' + new Date().toISOString().slice(0, 13)).then(function (r) { if (!r.ok) throw new Error('http'); return r.json(); }).then(function (j) {
      if (!j || !Array.isArray(j.locales) || !j.locales.length || !j.asOf) throw new Error('formato'); // empty = the server could not reach MINSAL
      var d = { asOf: String(j.asOf), revisado: typeof j.revisado === 'string' ? j.revisado : '', locales: j.locales };
      S.save('cache', d);
      usar(d, false);
    }).catch(function () {
      var c = S.load('cache', null);
      if (c && Array.isArray(c.locales)) usar(c, true);
      else { data = null; estado(); $('#lista').innerHTML = ''; S.live('', 'Sin conexión'); }
    });
  }

  $('#fBuscar').addEventListener('submit', function (ev) { ev.preventDefault(); buscar(); });
  $('#comuna').addEventListener('input', buscar);
  $('#comunaX').addEventListener('click', function () { $('#comuna').value = ''; buscar(); $('#comuna').focus(); });
  $('#lista').addEventListener('click', function (ev) { var c = ev.target.getAttribute && ev.target.getAttribute('data-c'); if (c) { $('#comuna').value = c; buscar(); } });
  $('#comuna').value = S.load('comuna', '');
  $('#comunaX').hidden = !$('#comuna').value;
  S.live('', 'Buscando datos…');
  cargar();
})();
