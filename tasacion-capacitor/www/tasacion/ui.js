/* Tasación UI: DOM and the UF fetch only. The valuation lives in logic.js (the Marpolis engine). */
(function () {
  'use strict';
  var S = window.Shell, L = window.AppLogic, $ = S.$;
  var base = (window.APP_DATA || {}).indicadores;
  var KEY = 'tasacion';
  var st = S.load(KEY, {});          // last inputs, this device only
  var ufOrigen = 'de referencia';    // "de hoy" once the live value arrives
  var CONF = { high: ['Confianza alta', 'ok'], medium: ['Confianza media', ''], low: ['Confianza baja', 'bad'] };
  var TIPO = { casa: 'Casa', departamento: 'Departamento', oficina: 'Oficina', terreno: 'Terreno' };

  if (base && base.uf) L.setUF(base.uf, base.asOf, 'referencial');

  function uf0(n) { return Math.round(n).toLocaleString('en-US', { useGrouping: false }).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  // The reference UF is dated by month ("2026-11"), the live one by day.
  function cuando(asOf) { return /^\d{4}-\d{2}$/.test(asOf) ? S.mes(asOf) : S.fecha(asOf); }
  function opt(v, t) { var o = document.createElement('option'); o.value = v; o.textContent = t; return o; }
  function fill(sel, from, to, plus) { for (var i = from; i <= to; i++) sel.appendChild(opt(i, i === to && plus ? i + ' o más' : String(i))); }
  function tipo() { var r = document.querySelector('input[name="tTipo"]:checked'); return r ? r.value : 'casa'; }

  /* ---- fields that do not depend on the type ---- */
  L.comunaOptions().forEach(function (g) {
    var og = document.createElement('optgroup'); og.label = g.region;
    g.comunas.forEach(function (c) { og.appendChild(opt(c.value, c.label)); });
    $('#tComuna').appendChild(og);
  });
  fill($('#tBeds'), 0, 6, true); fill($('#tBaths'), 0, 5, true); fill($('#tPark'), 0, 4, true); fill($('#tBod'), 0, 3, true);
  Object.keys(L.CONDITION).forEach(function (k) { $('#tEstado').appendChild(opt(k, L.CONDITION[k].es)); });
  Object.keys(L.AMENITIES).forEach(function (k) {
    var lab = document.createElement('label'); lab.className = 'check';
    var box = document.createElement('input'); box.type = 'checkbox'; box.value = k;
    var sp = document.createElement('span'); sp.textContent = L.AMENITIES[k].es;
    lab.appendChild(box); lab.appendChild(sp); $('#tExtras').appendChild(lab);
  });

  /* ---- restore the last inputs ---- */
  (function () {
    var r = document.querySelector('input[name="tTipo"][value="' + (TIPO[st.tipo] ? st.tipo : 'casa') + '"]'); if (r) r.checked = true;
    $('#tComuna').value = st.comuna || 'santiago';
    if (!$('#tComuna').value) $('#tComuna').selectedIndex = 0;
    $('#tBuilt').value = st.built || ''; $('#tLot').value = st.lot || ''; $('#tTerr').value = st.terr || '';
    $('#tBeds').value = st.beds != null ? st.beds : 3; $('#tBaths').value = st.baths != null ? st.baths : 2;
    $('#tPark').value = st.park != null ? st.park : 1; $('#tBod').value = st.bod || 0;
    $('#tEstado').value = L.CONDITION[st.estado] ? st.estado : 'usado';
    (st.extras || []).forEach(function (k) { var b = document.querySelector('#tExtras input[value="' + k + '"]'); if (b) b.checked = true; });
  })();

  function sectores() {
    var list = L.sectorOptions($('#tComuna').value), sel = $('#tSector');
    sel.textContent = '';
    sel.appendChild(opt('', 'Todos'));
    list.forEach(function (s) { sel.appendChild(opt(s.value, s.label)); });
    $('#tSectorL').hidden = !list.length;
    sel.value = list.some(function (s) { return s.value === st.sector; }) ? st.sector : '';
  }

  // Each type asks only for what the engine uses for it.
  function campos() {
    var t = tipo(), depto = t === 'departamento', ofi = t === 'oficina', land = t === 'terreno';
    $('#tBuiltL').hidden = land;
    $('#tLotL').hidden = depto || ofi;
    $('#tTerrL').hidden = !depto;
    $('#tHab').hidden = ofi || land;
    $('#tBodL').hidden = !(depto || ofi);
    $('#tParkL').hidden = land; $('#tEstadoL').hidden = land;
    $('#tExtras').hidden = land;
    S.$$('#tExtras label').forEach(function (lab) {
      lab.hidden = ofi && L.OFFICE_AMENITIES.indexOf(lab.querySelector('input').value) < 0;
    });
  }

  function leer() {
    var t = tipo(), depto = t === 'departamento', ofi = t === 'oficina', land = t === 'terreno';
    var n = function (id) { return Math.max(0, S.num($(id).value)); };
    return {
      tipo: t, comuna: $('#tComuna').value, sector: $('#tSectorL').hidden ? '' : $('#tSector').value,
      builtM2: land ? 0 : n('#tBuilt'), lotM2: (depto || ofi) ? 0 : n('#tLot'),
      terrazaM2: depto ? n('#tTerr') : 0, bodegas: (depto || ofi) ? +$('#tBod').value || 0 : 0,
      beds: (ofi || land) ? 0 : +$('#tBeds').value || 0, baths: (ofi || land) ? 0 : +$('#tBaths').value || 0,
      parking: land ? 0 : +$('#tPark').value || 0, condition: $('#tEstado').value,
      amenities: land ? [] : S.$$('#tExtras label:not([hidden]) input:checked').map(function (b) { return b.value; })
    };
  }

  function guardar() {
    S.save(KEY, {
      tipo: tipo(), comuna: $('#tComuna').value, sector: $('#tSector').value,
      built: $('#tBuilt').value, lot: $('#tLot').value, terr: $('#tTerr').value,
      beds: +$('#tBeds').value, baths: +$('#tBaths').value, park: +$('#tPark').value, bod: +$('#tBod').value,
      estado: $('#tEstado').value,
      extras: S.$$('#tExtras input:checked').map(function (b) { return b.value; })
    });
  }

  function texto(inp, r) {
    var m2 = inp.tipo === 'terreno' ? inp.lotM2 : inp.builtM2;
    return TIPO[inp.tipo] + ' de ' + S.dec(m2) + ' m² en ' + r.location + '\n' +
      'Valor de mercado estimado: UF ' + uf0(r.ufMid) + ' (' + S.clp(r.clpMid) + ')\n' +
      'Rango: UF ' + uf0(r.ufLow) + ' a UF ' + uf0(r.ufHigh) + '\n' +
      'Estimación referencial, UF ' + ufOrigen + ' (' + cuando(r.ufClpAsOf) + ').';
  }

  function render() {
    var inp = leer(), r = L.estimate(inp);
    $('#tOut').hidden = !r.ok;
    if (!r.ok) { S.live('', inp.tipo === 'terreno' ? 'Escribe la superficie del terreno' : 'Escribe la superficie construida'); return; }
    var conf = CONF[r.confidence] || CONF.medium;
    $('#tUf').textContent = 'UF ' + uf0(r.ufMid);
    $('#tClp').textContent = 'Son ' + S.clp(r.clpMid) + ' con la UF ' + ufOrigen + '.';
    $('#tRango').textContent = 'Rango estimado: UF ' + uf0(r.ufLow) + ' a UF ' + uf0(r.ufHigh) + '.';
    $('#tConf').textContent = conf[0]; $('#tConf').className = 'tag' + (conf[1] ? ' ' + conf[1] : '');
    $('#tM2').textContent = S.dec(r.perM2) + ' UF por m²';
    $('#tTabla').innerHTML = r.breakdown.map(function (b) {
      return '<tr><td>' + S.esc(b.es) + '<br><span class="mut">' + S.esc(String(b.detail).replace(/(\d)\.(\d)/g, '$1,$2')) + '</span></td><td class="n">' +
        (b.uf < 0 ? '-' : '') + 'UF ' + uf0(Math.abs(b.uf)) + '</td></tr>';
    }).join('');
    $('#tFuente').textContent = 'Valor base de ' + r.location + ': ' + (r.source || 'modelo nacional') + '. UF ' + ufOrigen + ' de ' +
      S.clp(r.ufClp) + ' (' + cuando(r.ufClpAsOf) + ').' + (ufOrigen === 'de hoy' || !base ? '' : ' ' + S.viejo(base.asOf));
    $('#tWa').href = S.wa(texto(inp, r));
    S.live('UF ' + uf0(r.ufMid), S.clp(r.clpMid) + ' · ' + TIPO[inp.tipo] + ' en ' + r.location);
  }

  function cambio() { guardar(); render(); }
  $('#tForm').addEventListener('submit', function (e) { e.preventDefault(); });
  $('#tForm').addEventListener('input', cambio);
  $('#tForm').addEventListener('change', function (e) {
    if (e.target.id === 'tComuna') { st.sector = ''; sectores(); }
    if (e.target.name === 'tTipo') campos();
    cambio();
  });
  $('#tCopy').addEventListener('click', function () {
    var inp = leer(), r = L.estimate(inp), btn = this;
    if (!r.ok) return;
    S.copy(texto(inp, r)).then(function (ok) { btn.textContent = ok ? 'Copiado' : 'No se pudo copiar'; setTimeout(function () { btn.textContent = 'Copiar'; }, 2000); });
  });

  sectores(); campos(); render();

  // UF of the day: the value in pesos follows it. Without a connection the month's reference stays.
  (function () {
    var ctl = new AbortController(), timer = setTimeout(function () { ctl.abort(); }, 8000);
    fetch('https://netwebmedia.com/api/public/uf', { signal: ctl.signal })
      .then(function (x) { return x.ok ? x.json() : Promise.reject(new Error('http')); })
      .then(function (j) {
        if (!j || !(j.value > 1000)) return;
        L.setUF(j.value, String(j.asOf || '').slice(0, 10) || S.hoy(), 'live');
        ufOrigen = 'de hoy'; render();
      })
      .catch(function () { /* offline: the reference value is already in use */ })
      .then(function () { clearTimeout(timer); });
  })();
})();
