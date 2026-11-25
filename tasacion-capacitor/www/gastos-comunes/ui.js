/* Gastos Comunes UI: DOM only. Prorrateo and morosos live in logic.js. */
(function () {
  'use strict';
  var S = window.Shell, L = window.AppLogic, $ = S.$;
  var st = L.limpiar(S.load('state', null));
  var mes = L.isoDate(new Date()).slice(0, 7);

  function month() {
    if (!st.meses[mes]) st.meses[mes] = { gastos: [], pct: 5, pagos: {} };
    return st.meses[mes];
  }
  // A month nobody touched (just navigated to) is not worth storing; render() drops it before saving.
  function vacio(x) { return !x.gastos.length && !Object.keys(x.pagos || {}).length && x.pct === 5; }

  function render() {
    var m = month();
    Object.keys(st.meses).forEach(function (k) { if (vacio(st.meses[k])) delete st.meses[k]; });
    // Freeze past or already-paid months so later unit changes don't rewrite them.
    Object.keys(st.meses).forEach(function (k) {
      var x = st.meses[k];
      if (!x.snap && (k < S.hoy().slice(0, 7) || Object.keys(x.pagos || {}).length)) x.snap = L.congelar(x, st.units);
    });
    $('#saveMsg').textContent = S.save('state', st) ? '' : 'No se pudo guardar en este teléfono. Libera espacio o revisa el modo privado.';
    $('#mes').value = mes;
    $('#units').innerHTML = st.units.map(function (u, i) {
      return '<li><span>' + S.esc(u.nombre) + ' <span class="mut">' + (u.alic > 0 ? 'alícuota ' + S.esc(L.pctCL(u.alic)) + '%' : 'sin alícuota') + '</span></span>' +
        '<button class="btn ghost small" data-del-unit="' + i + '" type="button">Quitar</button></li>';
    }).join('');
    $('#gastos').innerHTML = m.gastos.map(function (g, i) {
      return '<li><span><b>' + S.esc(g.concepto) + '</b> ' + S.clp(g.monto) + '</span>' +
        '<button class="btn ghost small" data-del-gasto="' + i + '" type="button">Quitar</button></li>';
    }).join('');
    var sa = L.sinAlic(st.units);
    $('#uWarn').textContent = sa ? sa + (sa === 1 ? ' unidad no tiene alícuota y pagará $0.' : ' unidades no tienen alícuota y pagarán $0.') : '';
    if (document.activeElement !== $('#pct')) $('#pct').value = String(m.pct).replace('.', ',');

    var c = L.cobros(m.gastos, m.pct, st.units);
    $('#result').hidden = !(c.total > 0 && c.items.length);
    $('#rTitle').textContent = 'Cobro de ' + L.mesLabel(mes);
    $('#rTotal').textContent = S.clp(c.total);
    $('#rReserva').textContent = S.clp(c.reserva);
    $('#rCobrar').textContent = S.clp(c.aCobrar);
    S.live(!$('#result').hidden ? S.clp(c.aCobrar) : '', !$('#result').hidden ? 'entre ' + c.items.length + (c.items.length === 1 ? ' unidad' : ' unidades') + ' · ' + L.mesLabel(mes) : 'Agrega unidades y gastos');
    $('#rows').innerHTML = c.items.map(function (it) {
      var pagado = m.pagos[it.id] || '';
      var txt = L.mensaje({ mes: mes, nombre: it.nombre, parte: it.parte, monto: it.monto, gastos: m.gastos, reserva: c.reserva, pct: m.pct, pagado: pagado });
      return '<tr><td>' + S.esc(it.nombre) + ' ' + (pagado ? '<span class="tag ok">Pagado ' + S.esc(L.fechaCL(pagado)) + '</span>' : '<span class="tag bad">Pendiente</span>') + '</td><td class="n">' + L.pctCL(it.parte) + '%</td><td class="n">' + S.clp(it.monto) + '</td></tr>' +
        // Buttons sit in their own row: as an extra column they fell off a phone screen.
        '<tr class="acts noprint"><td colspan="3"><div class="actions">' +
        '<button class="btn ghost small" data-pay="' + S.esc(it.id) + '" type="button">' + (pagado ? 'Deshacer' : 'Marcar pagado') + '</button>' +
        '<a class="btn wa small" target="_blank" rel="noopener" href="' + S.esc(S.wa(txt)) + '">WhatsApp</a></div></td></tr>';
    }).join('');

    var d = L.deudas(st.units, st.meses, S.hoy().slice(0, 7));
    $('#morosos').hidden = !d.length;
    $('#morososList').innerHTML = d.map(function (x) {
      return '<li><span><b>' + S.esc(x.nombre) + '</b><br><span class="mut">' + x.meses.map(function (y) { return S.esc(L.mesLabel(y.mes)); }).join(', ') + '</span></span><b>' + S.clp(x.total) + '</b></li>';
    }).join('');
    $('#mTotal').textContent = S.clp(d.reduce(function (s, x) { return s + x.total; }, 0));
  }

  $('#fUnit').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var nombre = $('#uName').value.trim();
    if (!nombre) return;
    st.units.push({ id: 'u' + st.nid++, nombre: nombre, alic: S.num($('#uAlic').value) });
    // Open months are split again with the new unit; closed months keep what was charged.
    Object.keys(st.meses).forEach(function (k) { if (k >= S.hoy().slice(0, 7)) delete st.meses[k].snap; });
    $('#uName').value = ''; $('#uAlic').value = '';
    render();
  });

  $('#fGasto').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var monto = Math.round(S.num($('#gMonto').value));
    if (!(monto > 0)) { $('#gMsg').textContent = 'Revisa el monto.'; return; }
    if (!(monto < L.MAX_LINEA)) { $('#gMsg').textContent = 'Revisa el monto: es demasiado grande.'; return; }
    $('#gMsg').textContent = '';
    delete month().snap;
    month().gastos.push({ concepto: $('#gConcepto').value.trim(), monto: monto });
    $('#gConcepto').value = ''; $('#gMonto').value = '';
    render();
  });

  $('#mes').addEventListener('change', function () { if (this.value) { mes = this.value; render(); } });
  $('#pct').addEventListener('input', function () { delete month().snap; month().pct = Math.min(100, Math.max(0, S.num(this.value))); render(); });

  document.addEventListener('click', function (ev) {
    var t = ev.target;
    if (t.dataset.delUnit) {
      var u = st.units[+t.dataset.delUnit];
      if (!window.confirm('¿Quitar ' + u.nombre + '? También se borran sus pagos marcados.')) return;
      Object.keys(st.meses).forEach(function (k) {
        if (st.meses[k].pagos) delete st.meses[k].pagos[u.id];
        if (st.meses[k].snap) delete st.meses[k].snap[u.id];
      });
      st.units.splice(+t.dataset.delUnit, 1); render();
    } else if (t.dataset.delGasto) {
      if (!window.confirm('¿Quitar este gasto?')) return;
      delete month().snap; // amounts changed: re-freeze from the new expenses
      month().gastos.splice(+t.dataset.delGasto, 1); render();
    } else if (t.dataset.pay) {
      var p = month().pagos;
      if (p[t.dataset.pay]) delete p[t.dataset.pay]; else p[t.dataset.pay] = S.hoy();
      render();
    } else if (t.id === 'imprimir') {
      S.print(t.closest('.card').innerText);
    }
  });
  render();
})();
