/* Reajuste Arriendo UI: DOM and fetch only. Numbers live in logic.js. */
(function () {
  'use strict';
  var S = window.Shell, L = window.AppLogic, $ = S.$;
  var base = window.APP_DATA.indicadores;
  var API = 'https://netwebmedia.com/api/public/';
  var uf = L.ufHoy(null, base);   // replaced when the live value arrives
  var hist = null;                // null = not loaded or unavailable
  var histState = 'cargando';     // cargando | ok | error
  // IPC of the INE: the last answer is kept on the device, so the tool works offline and a failed refresh keeps it.
  var ipc = L.ipcMejor(S.load('ipc', null), null);
  var ipcState = 'cargando';      // cargando | ok | error (error with a saved copy = offline)
  var mesesTocados = false;       // once the person picks months, a mode switch or a refresh never moves them
  var now = L.isoDate(new Date()).slice(0, 7);
  var cur = 'pUf', lv = {};
  function paint() { S.live.apply(S, lv[cur] || ['', '']); }
  var saved = S.load('recibo', { arrendador: '', arrendatario: '', direccion: '' });

  function getJson(path) {
    var ctl = new AbortController();
    var timer = setTimeout(function () { ctl.abort(); }, 8000);
    return fetch(API + path, { signal: ctl.signal }).finally(function () { clearTimeout(timer); }).then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('http')); });
  }

  function renderUf() {
    $('#ufLead').textContent = uf.origen === 'en vivo' ? 'Hoy son' : 'Con la UF de referencia del mes son';
    $('#ufPesos').textContent = S.clp(L.ufAPesos(uf.value, S.num($('#ufMonto').value)));
    $('#ufOut').hidden = !(S.num($('#ufMonto').value) > 0);
    lv.pUf = $('#ufOut').hidden ? ['', 'Escribe el monto en UF abajo', 'En pesos'] : [$('#ufPesos').textContent, S.dec(S.num($('#ufMonto').value)) + ' UF · UF a ' + S.clp(uf.value), 'En pesos']; paint();
    $('#ufFuente').textContent = 'UF ' + uf.value.toLocaleString('es-CL', { minimumFractionDigits: 2 }) + ' (' + uf.origen + ', ' + uf.asOf + '). Valor referencial.' + (uf.origen !== 'en vivo' && S.viejo(base.asOf) ? ' ' + S.viejo(base.asOf) : '');
  }

  function modoIpc() { var r = document.querySelector('input[name="reFuente"]:checked'); return !r || r.value === 'ipc'; }
  function pctTxt(n) { return String(n).replace('.', ','); }
  // Untouched months follow the mode: IPC ends at the last month the INE published (the current one never is), UF at this month.
  function mesesPorDefecto() {
    if (mesesTocados) return;
    var fin = modoIpc() && L.ipcUltimo(ipc) ? L.ipcUltimo(ipc) : now;
    $('#reHasta').value = fin;
    $('#reDesde').value = L.shiftMes(fin, -12);
  }

  function renderRe() {
    var desde = $('#reDesde').value, hasta = $('#reHasta').value;
    var orden = desde > hasta; // YYYY-MM strings compare in date order
    var conIpc = modoIpc(), ult = L.ipcUltimo(ipc);
    var auto = orden ? null : conIpc ? (ipc ? L.ipcVariacion(ipc.values, desde, hasta) : null) : (hist ? L.variacionPct(hist, desde, hasta) : null);
    var msg;
    $('#reIpcInfo').hidden = !(conIpc && ult);
    if (ult) $('#reIpcInfo').textContent = 'Último IPC publicado por el INE: ' + L.mesLabel(ult) + '.' + (ipcState === 'error' ? ' Sin conexión: se usa la copia guardada en este dispositivo.' : '');
    if (orden) msg = 'El mes "Desde" debe ser anterior al mes "Hasta".';
    else if (conIpc) {
      var primero = ipc ? Object.keys(ipc.values).sort()[0] : null;
      if (!ipc) msg = ipcState === 'cargando' ? 'Buscando el IPC del INE…' : 'No pudimos traer el IPC del INE. Escribe el % a mano o usa la variación de la UF.';
      else if (hasta > ult) msg = 'El INE aún no publica el IPC de ' + L.mesLabel(hasta) + '. El último es el de ' + L.mesLabel(ult) + '.';
      else if (auto === null) msg = 'Aquí está el IPC desde ' + L.mesLabel(primero) + '. Para meses anteriores, escribe el % a mano.';
      else msg = 'Variación del IPC entre ' + L.mesLabel(desde) + ' y ' + L.mesLabel(hasta) + ': ' + pctTxt(auto) + '% (INE).';
    }
    else if (histState === 'cargando') msg = 'Buscando la UF de esos meses…';
    else if (histState === 'error') msg = 'No pudimos traer la UF histórica, así que el reajuste automático no está disponible. Escribe el % a mano.';
    else if (auto === null) msg = 'No hay UF para uno de esos meses. Escribe el % a mano.';
    else msg = 'Variación de la UF entre ' + L.mesLabel(desde) + ' y ' + L.mesLabel(hasta) + ': ' + String(auto).replace('.', ',') + '%.';
    $('#reAuto').textContent = msg;
    var manual = $('#reManual').value.trim();
    var pct = manual !== '' ? S.num(manual) : auto;
    var monto = Math.round(S.num($('#reMonto').value));
    $('#reOut').hidden = orden || pct === null || !(monto > 0);
    lv.pRe = ['', 'Escribe tu arriendo actual abajo', 'Arriendo nuevo']; paint();
    if (!$('#reOut').hidden) {
      var r = L.reajustar(monto, pct);
      var segun = conIpc ? 'IPC del INE' : 'variación de la UF';
      $('#rePct').textContent = String(pct).replace('.', ',') + '%' + (manual !== '' ? ' (el que escribiste)' : ' (según ' + (conIpc ? 'el ' : 'la ') + segun + ')');
      $('#reNuevo').textContent = S.clp(r.nuevo);
      lv.pRe = [S.clp(r.nuevo), 'reajuste de ' + String(pct).replace('.', ',') + '%' + (manual !== '' ? '' : ' · ' + segun), 'Arriendo nuevo']; paint();
      $('#reDif').textContent = S.clp(r.diferencia);
      $('#reTabla').innerHTML = [['Arriendo actual', S.clp(monto)], ['Reajuste', String(pct).replace('.', ',') + '%'], ['Diferencia al mes', S.clp(r.diferencia)],
        ['Diferencia en 12 meses', S.clp(r.diferencia * 12)], ['Arriendo nuevo', S.clp(r.nuevo)]]
        .map(function (x) { return '<tr><td>' + x[0] + '</td><td class="n">' + x[1] + '</td></tr>'; }).join('');
    }
  }

  function reciboTexto() {
    return L.recibo({
      arrendador: $('#rcArrendador').value.trim(), arrendatario: $('#rcArrendatario').value.trim(), direccion: $('#rcDir').value.trim(),
      mes: $('#rcMes').value, monto: Math.round(S.num($('#rcMonto').value)), fecha: $('#rcFecha').value, forma: $('#rcForma').value.trim()
    });
  }
  function renderRec() {
    saved = { arrendador: $('#rcArrendador').value, arrendatario: $('#rcArrendatario').value, direccion: $('#rcDir').value };
    S.save('recibo', saved);
    var t = reciboTexto();
    $('#rcTexto').textContent = t;
    $('#rcWa').href = S.wa(t);
    var rm = Math.round(S.num($('#rcMonto').value));
    lv.pRec = [rm > 0 ? S.clp(rm) : '', rm > 0 ? 'recibo' + ($('#rcMes').value ? ' de ' + L.mesLabel($('#rcMes').value) : '') : 'Escribe el monto abajo', 'Recibo de arriendo']; paint();
  }

  function tab(id) {
    S.$$('.tabs button').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.tab === id)); });
    ['pUf', 'pRe', 'pRec'].forEach(function (p) { $('#' + p).hidden = p !== id; });
    cur = id; paint();
  }

  mesesPorDefecto();
  $('#rcMes').value = now;
  $('#rcFecha').value = L.isoDate(new Date());
  $('#rcArrendador').value = saved.arrendador;
  $('#rcArrendatario').value = saved.arrendatario;
  $('#rcDir').value = saved.direccion;

  document.addEventListener('click', function (ev) {
    var t = ev.target;
    if (t.dataset.tab) tab(t.dataset.tab);
    else if (t.id === 'rcCopy') S.copy(reciboTexto()).then(function (ok) { t.textContent = ok ? 'Copiado' : 'No se pudo copiar'; });
    else if (t.id === 'rcPrint') S.print(reciboTexto());
  });
  $('#pUf').addEventListener('input', renderUf);
  ['#reDesde', '#reHasta'].forEach(function (sel) { $(sel).addEventListener('input', function () { mesesTocados = true; }); });
  S.$$('input[name="reFuente"]').forEach(function (r) { r.addEventListener('change', function () { mesesPorDefecto(); renderRe(); }); });
  $('#pRe').addEventListener('input', renderRe);
  $('#pRec').addEventListener('input', renderRec);

  renderUf(); renderRe(); renderRec();

  getJson('uf').then(function (j) { uf = L.ufHoy(j, base); renderUf(); }, function () { renderUf(); });
  getJson('ipc').then(function (j) {
    var mejor = L.ipcMejor(ipc, j);
    if (mejor === j) S.save('ipc', j);
    ipc = mejor;
    ipcState = L.ipcUltimo(j) ? 'ok' : 'error';
    mesesPorDefecto(); renderRe();
  }, function () { ipcState = 'error'; renderRe(); });
  getJson('uf-history').then(function (j) {
    hist = j && j.values ? j.values : null;
    histState = hist ? 'ok' : 'error';
    renderRe();
  }, function () { histState = 'error'; renderRe(); });
})();
