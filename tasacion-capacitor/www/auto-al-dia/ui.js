/* Auto al Día UI: DOM only. Date rules live in logic.js. */
(function () {
  'use strict';
  var S = window.Shell, L = window.AppLogic, $ = S.$;
  var st = S.load('state', { vehiculos: [] });
  // demo = the sample plate is on screen. Memory only: nothing is saved, and the first real input clears it.
  var demo = null;
  function lista() { return demo ? [demo] : st.vehiculos; }
  function calm() { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }

  var CAL = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/></svg>';

  // Today in Chile, not on the device clock; falls back to the device date if Intl or the zone is missing.
  function hoy() {
    try {
      var f = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      if (/^\d{4}-\d{2}-\d{2}$/.test(f)) return f;
    } catch (e) { /* use the device date */ }
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  function cuando(p) {
    if (p.dias < 0) return 'vencido hace ' + (-p.dias) + (p.dias === -1 ? ' día' : ' días');
    if (p.dias === 0) return 'vence hoy';
    return 'faltan ' + p.dias + (p.dias === 1 ? ' día' : ' días');
  }

  // Display only: "BBCL12" -> "BBCL · 12", "AB1234" -> "AB · 1234". The stored value and the validation stay plain.
  function placa(pat) { return String(pat).replace(/^([A-Z]{4})(\d{2})$/, '$1 · $2').replace(/^([A-Z]{2})(\d{4})$/, '$1 · $2'); }

  // Hero text for one deadline. Says what and when ("Permiso de circulación vencido hace 231 días"); the card below keeps the date and the notes.
  function paintHero(p, pat, label, ex) {
    S.live(p.dias < 0 ? 'Vencido' : p.dias === 0 ? 'Hoy' : p.dias + (p.dias === 1 ? ' día' : ' días'),
      p.dias < 0 ? p.label + ' ' + cuando(p) : p.label, label + ' · ' + placa(pat), ex);
  }

  // One tap in the hero marks the featured deadline as done: same data change as the card button.
  var hero = null;
  // The sample plate has its own rules (next cycle); a real vehicle uses the plain ones.
  // v.dos / v.sinRev: the person pays the permiso in two cuotas / revisión técnica does not apply. Both default to off.
  function plz(v, h) { return v === demo ? L.ejemplo(h, v.hechos) : L.plazos(v.pat, h, v.hechos, { dos: v.dos, sinRev: v.sinRev }); }
  function marcar(i, kind) {
    var v = lista()[i], p = plz(v, hoy()).filter(function (x) { return x.kind === kind; })[0];
    // Undo: p.year is done+1, so the previous done year is p.year-2. In the example, undo just forgets the tap.
    if (v === demo && p.hecho) delete v.hechos[p.kind];
    else v.hechos[p.kind] = p.hecho ? p.year - 2 : p.year;
    render();
  }

  function render() {
    if (!demo) S.save('state', st);
    var h = hoy(), best = null, vs = lista();
    hero = null;
    $('#demoNote').hidden = !demo;
    // One source for the example plate: the hint, the hero art and the input placeholder all read ejemploPat.
    var ep = placa(L.ejemploPat(h));
    $('#exHint').textContent = 'Mira los plazos de ' + ep + '.';
    $('#vPat').placeholder = ep;
    if ($('#adPlate')) $('#adPlate').textContent = ep.replace(' · ', '·');
    $('#exRow').hidden = !!demo || st.vehiculos.length > 0;
    vs.forEach(function (v, i) { plz(v, h).forEach(function (p) { if (!p.hecho && !p.na && (!best || p.dias < best.p.dias)) best = { p: p, pat: v.pat, i: i }; }); });
    if (best) {
      paintHero(best.p, best.pat, 'Lo más urgente');
      hero = { i: best.i, kind: best.p.kind };
    } else if (vs.length) S.live('Todo al día', 'Nada pendiente este año', 'Próximo plazo');
    // No vehicle yet: the same example the sample button opens (nothing marked as done), so hero and rows agree.
    else paintHero(L.ejemplo(h)[0], L.ejemploPat(h), 'Lo más urgente', true);
    var act = $('#liveDone');
    if (act) { act.hidden = !hero; if (hero) act.setAttribute('aria-label', 'Marcar como hecho: ' + best.p.label + ' de ' + best.pat); }
    // No vehicle yet: the hero already shows the example, so the list stays empty (its data-empty line explains).
    // Only the most urgent row (the one the hero shows) gets the filled button; the rest stay quiet text buttons.
    var topRef = best ? best.i + ':' + best.p.kind : '';
    $('#vehiculos').innerHTML = !vs.length ? '' : vs.map(function (v, i) {
      var items = plz(v, h).map(function (p) {
        var ref = i + ':' + p.kind;
        // Revisión técnica can be set to "No aplica" (new car): that row loses its date, its calendar button and its "Ya lo hice".
        var na = '<button class="btn small txt" type="button" data-na="' + i + '" aria-label="' + S.esc((p.na ? 'Deshacer no aplica' : 'Marcar como no aplica') + ': ' + p.label + ' de ' + v.pat) + '">' + (p.na ? 'Deshacer' : 'No aplica') + '</button>';
        return '<li><span class="dl"><b>' + S.esc(p.label) + '</b> <span class="tag ' + p.tag + '">' + S.esc(p.na ? 'no aplica' : cuando(p)) + '</span><br>' +
          '<span class="mut">' + (p.na ? '' : S.esc(L.fechaCorta(p.due)) + ' · ') + S.esc(p.nota) + '</span>' +
          '<span class="actions">' + (p.na ? na :
          '<button class="btn small' + (ref === topRef ? '' : ' txt') + '" type="button" data-hecho="' + S.esc(ref) + '" aria-label="' + S.esc((p.hecho ? 'Deshacer' : 'Marcar como hecho') + ': ' + p.label + ' de ' + v.pat) + '">' + (p.hecho ? 'Deshacer' : 'Ya lo hice') + '</button>' +
          (p.kind === 'rev' && !p.hecho && v !== demo ? na : '') +
          '<button class="calbtn" type="button" data-ics="' + S.esc(ref) + '" aria-label="' + S.esc('Agregar al calendario: ' + p.label + ' de ' + v.pat) + '" title="Al calendario">' + CAL + '</button>') +
          '</span></span></li>';
      }).join('');
      return '<section class="card"><h2><span class="plate">' + S.esc(placa(v.pat)) + '</span>' + (v.apodo ? ' <span class="apodo">' + S.esc(v.apodo) + '</span>' : '') + '</h2>' +
        '<p class="hint">Revisión técnica en ' + S.esc(L.mesRev(v.pat)) + '.</p>' +
        (v === demo ? '' : '<label class="check"><input type="checkbox" data-dos="' + i + '"' + (v.dos ? ' checked' : '') + '>Pago el permiso en dos cuotas</label>') +
        '<ul class="list">' + items + '</ul>' +
        '<div class="actions"><button class="btn ghost small" type="button" data-del="' + i + '" aria-label="' + S.esc('Quitar vehículo ' + v.pat) + '">Quitar vehículo</button></div></section>';
    }).join('');
  }

  $('#fVeh').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var pat = L.patente($('#vPat').value);
    if (!pat) { $('#vMsg').textContent = 'Revisa la patente: Auto al Día cubre autos particulares (formato BBCL12 o AB1234). Las motos todavía no están soportadas.'; return; }
    if (st.vehiculos.some(function (v) { return v.pat === pat; })) { $('#vMsg').textContent = 'Esa patente ya está en tu lista.'; return; }
    $('#vMsg').textContent = '';
    // Nothing is assumed paid: an unpaid permiso or SOAP shown as "al día" is worse than one extra tap.
    demo = null;
    st.vehiculos.push({ pat: pat, apodo: $('#vApodo').value.trim(), hechos: {} });
    $('#vPat').value = ''; $('#vApodo').value = '';
    render();
    verResultado();
  });

  // The result (dates with their urgency pills) is the point of adding a plate: bring the newest card into view.
  function verResultado() {
    var c = S.$$('#vehiculos > .card'), last = c[c.length - 1];
    if (!last) return;
    last.classList.remove('fresh'); void last.offsetWidth; last.classList.add('fresh');
    last.scrollIntoView({ block: 'start', behavior: calm() ? 'auto' : 'smooth' });
  }

  // Sample plate: the next cycle's deadlines (same data as the hero example). Never saved.
  function probar() {
    var pe = L.ejemploPat(hoy());
    demo = { pat: pe, apodo: '', hechos: {} };
    $('#vPat').value = pe; $('#vMsg').textContent = '';
    render();
    verResultado();
  }
  // First real input (typing in the plate or the nickname) drops the sample.
  $('#vPat').addEventListener('input', function () { if (demo) { demo = null; render(); } });
  $('#vApodo').addEventListener('input', function () { if (demo) { demo = null; render(); } });

  document.addEventListener('click', function (ev) {
    var t = ev.target;
    var parts, v, p;
    if (t.id === 'demoBtn') probar();
    else if (t.dataset.dos !== undefined) { st.vehiculos[+t.dataset.dos].dos = t.checked; render(); }
    else if (t.dataset.na) { v = st.vehiculos[+t.dataset.na]; v.sinRev = !v.sinRev; render(); }
    else if (t.id === 'demoClear') { demo = null; $('#vPat').value = ''; render(); }
    else if (t.dataset.del) {
      if (demo) { demo = null; $('#vPat').value = ''; render(); }
      else if (window.confirm('¿Quitar este vehículo?')) { st.vehiculos.splice(+t.dataset.del, 1); render(); }
    } else if (t.dataset.hecho || t.dataset.ics) {
      parts = (t.dataset.hecho || t.dataset.ics).split(':');
      v = lista()[+parts[0]];
      p = plz(v, hoy()).filter(function (x) { return x.kind === parts[1]; })[0];
      if (t.dataset.hecho) {
        marcar(+parts[0], p.kind);
      } else {
        S.download(p.kind + '-' + v.pat + '.ics', L.ics(v.pat, v.apodo, p, hoy()), 'text/calendar');
      }
    }
  });

  $('#liveDone').addEventListener('click', function () { if (hero) marcar(hero.i, hero.kind); });
  render();
})();
