/* Pensión de Alimentos UI: DOM only. Rules live in logic.js. */
(function () {
  'use strict';
  var S = window.Shell, L = window.AppLogic, $ = S.$;
  var ind = window.APP_DATA.indicadores;
  var pagos = L.limpiar(S.load('pagos', []));

  function minimo() { return L.minimo(S.num($('#nHijos').value), S.num($('#nIngreso').value), ind, $('#nEdad').checked); }
  function deuda() { return L.deuda(S.num($('#dMonto').value), S.num($('#dMeses').value), S.num($('#dAbonos').value)); }

  function summary() {
    var m = minimo(), d = deuda(), lines = ['Pensión de alimentos (referencial, no es asesoría legal)'];
    if (m.hijos) lines.push('Mínimo legal con ' + m.hijos + (m.hijos === 1 ? ' hijo: ' : ' hijos: ') + S.clp(m.total) + ' al mes');
    if (d.devengado) lines.push('Deuda: ' + S.clp(d.devengado) + ' menos abonos ' + S.clp(d.abonos) + ' = saldo ' + S.clp(d.saldo));
    lines.push('Total pagado según mi registro: ' + S.clp(L.totalPagado(pagos)));
    pagos.slice().sort(function (a, b) { return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0; }).forEach(function (p) {
      lines.push(S.fecha(p.fecha) + ' ' + S.clp(p.monto) + (p.nota ? ' ' + p.nota : ''));
    });
    return lines.join('\n');
  }

  function calc() {
    var m = minimo(), d = deuda();
    $('#nOut').hidden = !m.hijos;
    if (!m.hijos) S.live('', 'Escribe cuántos hijos');
    $('#nMsg').textContent = m.hijos ? '' : 'Ingresa un número entero de hijos, de 1 a 20.';
    if (m.hijos) {
      S.live(S.clp(m.total), 'para ' + m.hijos + (m.hijos === 1 ? ' hijo' : ' hijos'));
      $('#nDetail').textContent = m.hijos === 1 ? 'Mínimo mensual para 1 hijo (40% del ingreso mínimo).'
        : 'Mínimo mensual para ' + m.hijos + ' hijos: ' + S.clp(m.porHijo) + ' por cada uno (30% del ingreso mínimo).';
      $('#nTope').textContent = m.tope === null ? ''
        : 'Tope: la pensión no puede pasar del 50% del ingreso de quien paga, ' + S.clp(m.tope) + '.' +
          (m.superaTope ? ' Ojo: el mínimo legal queda por sobre ese tope; el juez puede rebajarla si quien paga acredita ante el tribunal que no tiene los medios (Ley 14.908, art. 3).' : '');
      $('#nTope').className = m.superaTope ? 'bad' : '';
      $('#nRef').innerHTML = S.fuente('Ingreso mínimo ' + S.clp(m.base) + ' (' + S.mes(ind.asOf) + '). Fuente: ' + String(ind.source).replace(/\s*\(https?:[^)]*\)/, '') + '. Ley 14.908.' + (S.viejo(ind.asOf) ? ' ' + S.viejo(ind.asOf) : ''));
    }
    $('#dOut').hidden = !d.devengado && !d.abonos;
    $('#dBig').textContent = S.clp(d.saldo);
    $('#dDetail').textContent = 'Adeudado ' + S.clp(d.devengado) + ' menos abonos ' + S.clp(d.abonos) + '.' +
      (d.aFavor ? ' Los abonos superan lo adeudado por ' + S.clp(d.aFavor) + '.' : '');
    $('#cWa').href = S.wa(summary());
  }

  function renderPagos() {
    S.save('pagos', pagos);
    $('#pTotal').textContent = S.clp(L.totalPagado(pagos));
    $('#pList').innerHTML = pagos.map(function (p, i) { return { p: p, i: i }; })
      .sort(function (a, b) { return a.p.fecha < b.p.fecha ? 1 : a.p.fecha > b.p.fecha ? -1 : b.i - a.i; })
      .map(function (x) {
        return '<li><span><b>' + S.clp(x.p.monto) + '</b> · ' + S.esc(S.fecha(x.p.fecha)) + (x.p.nota ? '<br><span class="mut">' + S.esc(x.p.nota) + '</span>' : '') + '</span>' +
          '<button class="btn ghost small" data-del="' + x.i + '" type="button">Quitar</button></li>';
      }).join('');
    $('#cWa').href = S.wa(summary());
  }

  ['#fMin', '#fDeuda'].forEach(function (f) {
    $(f).addEventListener('submit', function (ev) { ev.preventDefault(); });
    $(f).addEventListener('input', calc);
  });

  $('#pFecha').value = S.hoy();
  $('#fPago').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var monto = Math.round(S.num($('#pMonto').value)), fecha = $('#pFecha').value;
    if (!(monto > 0) || !fecha) { $('#pMsg').textContent = 'Revisa la fecha y el monto.'; return; }
    $('#pMsg').textContent = '';
    pagos.push({ fecha: fecha, monto: monto, nota: $('#pNota').value.trim() });
    $('#pMonto').value = ''; $('#pNota').value = '';
    renderPagos();
  });

  document.addEventListener('click', function (ev) {
    var t = ev.target;
    if (t.dataset.del) {
      var p = pagos[+t.dataset.del];
      if (p && window.confirm('¿Quitar el pago de ' + S.clp(p.monto) + ' del ' + S.fecha(p.fecha) + '?')) { pagos.splice(+t.dataset.del, 1); renderPagos(); }
    }
    else if (t.id === 'cResumen') S.copy(summary()).then(function (ok) { t.textContent = ok ? 'Copiado' : 'No se pudo copiar'; });
  });

  calc();
  renderPagos();
})();
