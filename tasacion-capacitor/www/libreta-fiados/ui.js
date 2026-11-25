/* Libreta de Fiados UI: DOM only. Saldos, teléfono and CSV live in logic.js. */
(function () {
  'use strict';
  var S = window.Shell, L = window.AppLogic, $ = S.$;
  var st = S.load('state', { negocio: '', clientes: [], nid: 1 });
  var sel = null; // id of the client whose detail is open

  function cliente() {
    return st.clientes.filter(function (c) { return c.id === sel; })[0] || null;
  }

  function render() {
    $('#saveMsg').textContent = S.save('state', st) ? '' : 'No se pudo guardar en este dispositivo. Descarga el CSV ahora para no perder tu libreta.';
    $('#waMsg').textContent = '';
    S.live(S.clp(L.totalPorCobrar(st.clientes)), st.clientes.length + (st.clientes.length === 1 ? ' cliente' : ' clientes'));
    var rows = st.clientes.map(function (c) { return { c: c, s: L.saldo(c.movs) }; })
      .sort(function (a, b) { return b.s - a.s; });
    $('#clientes').innerHTML = rows.map(function (r) {
      return '<li><span><b>' + S.esc(r.c.nombre) + '</b><br><span class="' + (r.s > 0 ? 'bad' : 'ok') + '">' + S.clp(r.s) + '</span></span>' +
        '<button class="btn ghost small" data-open="' + S.esc(r.c.id) + '" type="button">Abrir</button></li>';
    }).join('');

    var c = cliente();
    $('#detalle').hidden = !c;
    if (!c) return;
    var s = L.saldo(c.movs);
    $('#dNombre').textContent = c.nombre;
    $('#dSaldo').textContent = S.clp(s);
    $('#hist').innerHTML = L.conSaldos(c.movs).reverse().map(function (m) {
      return '<li><span><span class="tag ' + (m.tipo === 'abono' ? 'ok' : 'bad') + '">' + (m.tipo === 'abono' ? 'Abono' : 'Fiado') + '</span> ' +
        S.clp(m.monto) + ' <span class="mut">' + S.esc(L.fechaCL(m.fecha)) + (m.nota ? ' · ' + S.esc(m.nota) : '') + '<br>Saldo: ' + S.clp(m.saldo) + '</span></span>' +
        '<button class="btn ghost small" data-del-mov="' + S.esc(m.id) + '" type="button">Quitar</button></li>';
    }).join('');
    var txt = L.mensajeCobro(c, s, st.negocio.trim());
    var n = L.telefonoWa(c.tel);
    $('#dWa').hidden = !(s > 0);
    $('#dWa').href = n ? 'https://wa.me/' + n + '?text=' + encodeURIComponent(S.firma(txt)) : S.wa(txt);
  }

  $('#fCliente').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var nombre = $('#cNombre').value.trim();
    if (!nombre) return;
    var c = { id: 'c' + st.nid++, nombre: nombre, tel: $('#cTel').value.trim(), movs: [] };
    st.clientes.push(c);
    sel = c.id;
    $('#cNombre').value = ''; $('#cTel').value = '';
    $('#mFecha').value = L.isoDate(new Date());
    render();
  });

  $('#fMov').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var c = cliente(), monto = Math.round(S.num($('#mMonto').value));
    if (!c) return;
    if (!(monto > 0)) { $('#mMsg').textContent = 'Revisa el monto.'; return; }
    var debe = L.saldo(c.movs);
    if ($('#mTipo').value === 'abono' && monto > debe) {
      $('#mMsg').textContent = debe > 0 ? 'El abono es mayor que la deuda (' + S.clp(debe) + '). Revisa el monto.' : 'Este cliente no debe nada. Anota primero el fiado.';
      return;
    }
    $('#mMsg').textContent = '';
    c.movs.push({ id: 'm' + st.nid++, tipo: $('#mTipo').value, monto: monto, nota: $('#mNota').value.trim(), fecha: $('#mFecha').value || L.isoDate(new Date()) });
    $('#mMonto').value = ''; $('#mNota').value = '';
    render();
  });

  $('#negocio').addEventListener('input', function () { st.negocio = this.value; render(); });

  document.addEventListener('click', function (ev) {
    var t = ev.target, c = cliente();
    if (t.dataset.open) {
      sel = t.dataset.open; $('#mFecha').value = L.isoDate(new Date()); render();
      $('#detalle').scrollIntoView();
    } else if (t.dataset.delMov && c) {
      if (!confirm('¿Quitar este movimiento?')) return;
      c.movs = c.movs.filter(function (m) { return m.id !== t.dataset.delMov; }); render();
    } else if (t.id === 'dWa' && c && !L.telefonoWa(c.tel)) {
      ev.preventDefault();
      $('#waMsg').textContent = 'El teléfono de este cliente no sirve para WhatsApp. Usa un celular chileno, por ejemplo 9 1234 5678.';
    } else if (t.id === 'dCerrar') {
      sel = null; render();
    } else if (t.id === 'dQuitar' && c && confirm('¿Quitar a ' + c.nombre + ' y todo su historial?')) {
      st.clientes = st.clientes.filter(function (x) { return x !== c; }); sel = null; render();
    } else if (t.id === 'csv') {
      S.download('fiados-' + L.isoDate(new Date()) + '.csv', '﻿' + L.csv(st.clientes), 'text/csv;charset=utf-8');
    } else if (t.id === 'borrar' && confirm('¿Borrar todos los clientes y movimientos? No se puede deshacer.')) {
      st = { negocio: st.negocio, clientes: [], nid: 1 }; sel = null; render();
    }
  });

  $('#negocio').value = st.negocio;
  $('#mFecha').value = L.isoDate(new Date());
  render();
})();
