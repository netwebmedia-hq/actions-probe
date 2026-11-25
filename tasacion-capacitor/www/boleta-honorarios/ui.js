/* Boleta Fácil UI: DOM only. Rules live in logic.js. */
(function () {
  'use strict';
  var S = window.Shell, L = window.AppLogic, $ = S.$;
  var ind = window.APP_DATA.indicadores;
  var thisYear = new Date().getFullYear();
  var st = L.limpiar(S.load('boletas', []));
  var tableYears = Object.keys(ind.retencionHonorariosPct);
  var year = L.defaultYear(ind, thisYear);
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  function row(label, value) { return '<tr><td>' + label + '</td><td class="n">' + value + '</td></tr>'; }
  function opt(v, sel) { return '<option' + (String(v) === String(sel) ? ' selected' : '') + '>' + S.esc(v) + '</option>'; }

  function calc() {
    var liq = $('#cMode').value === 'liquido', amount = S.num($('#cAmount').value), pct = ind.retencionHonorariosPct[$('#cYear').value], d;
    $('#cLabel').textContent = liq ? 'Líquido que quieres recibir' : 'Monto bruto';
    $('#cOut').hidden = !(amount > 0);
    if (!(amount > 0)) { S.live('', 'Escribe un monto abajo', 'Recibes'); return; }
    d = liq ? L.desdeLiquido(amount, pct) : L.desdeBruto(amount, pct);
    S.live(S.clp(liq ? d.bruto : d.liquido), liq ? 'para recibir ' + S.clp(d.liquido) + ' líquidos' : 'de ' + S.clp(d.bruto) + ' brutos', liq ? 'Emite la boleta por' : 'Recibes');
    $('#cTable').innerHTML = row('Monto bruto', S.clp(d.bruto)) + row('Retención ' + S.dec(pct) + '%', '-' + S.clp(d.retencion)) + row('<b>Líquido</b>', '<b>' + S.clp(d.liquido) + '</b>');
  }

  function render() {
    S.save('boletas', st);
    var years = {}, sel;
    st.forEach(function (b) { years[b.fecha.slice(0, 4)] = 1; });
    years[year] = 1;
    sel = Object.keys(years).sort().reverse();
    $('#yYear').innerHTML = sel.map(function (y) { return opt(y, year); }).join('');
    var res = L.resumenAnual(st, year, ind), t = res.total, renta = L.operacionRenta(t.bruto, t.retencion, ind);
    $('#yCard').hidden = !st.length;
    $('#rentaCard').hidden = !t.n;
    $('#yMonths').innerHTML = res.meses.filter(function (m) { return m.n; }).map(function (m) {
      return '<tr><td>' + MESES[m.mes - 1] + '</td><td class="n">' + m.n + '</td><td class="n">' + S.clp(m.bruto) + '</td><td class="n">' + S.clp(m.retencion) + '</td><td class="n">' + S.clp(m.liquido) + '</td></tr>';
    }).join('');
    $('#yTotal').innerHTML = '<tr><th>Total</th><th class="n">' + t.n + '</th><th class="n">' + S.clp(t.bruto) + '</th><th class="n">' + S.clp(t.retencion) + '</th><th class="n">' + S.clp(t.liquido) + '</th></tr>';
    $('#yRef').textContent = 'Retención ' + S.dec(res.pct) + '% según el calendario de la Ley 21.133.';
    $('#bList').innerHTML = st.map(function (b, i) { return { b: b, i: i }; })
      .filter(function (x) { return x.b.fecha.slice(0, 4) === String(year); })
      .sort(function (a, c) { return a.b.fecha < c.b.fecha ? 1 : -1; })
      .map(function (x) {
        return '<li><span><b>' + S.clp(x.b.bruto) + '</b> · ' + S.esc(x.b.cliente) + '<br><span class="mut">' + S.esc(S.fecha(x.b.fecha)) + '</span></span>' +
          '<button class="btn ghost small" data-del="' + x.i + '" type="button">Quitar</button></li>';
      }).join('');
    $('#nRenta').textContent = S.clp(renta.rentaImponible);
    $('#nTope').textContent = '(80% del bruto anual, con tope de ' + S.clp(renta.tope) + ')';
    $('#nRet').textContent = S.clp(renta.retencion);
    $('#dataNote').innerHTML = S.fuente('Indicadores de ' + S.mes(ind.asOf) + '. Referencial: confirma siempre en el SII.' + (S.viejo(ind.asOf) ? ' ' + S.viejo(ind.asOf) : ''));
  }

  $('#cYear').innerHTML = tableYears.map(function (y) { return opt(y, year); }).join('');
  $('#fCalc').addEventListener('submit', function (ev) { ev.preventDefault(); });
  $('#fCalc').addEventListener('input', calc);
  $('#fCalc').addEventListener('change', calc);

  $('#rFecha').value = S.hoy();
  $('#fBoleta').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var monto = Math.round(S.num($('#rMonto').value)), fecha = $('#rFecha').value, cliente = $('#rCliente').value.trim();
    if (!(monto > 0) || !fecha || !cliente) { $('#rMsg').textContent = 'Revisa la fecha, el cliente y el monto.'; return; }
    if (+fecha.slice(0, 4) < 2000 || +fecha.slice(0, 4) > thisYear + 1) { $('#rMsg').textContent = 'Revisa la fecha: el año debe estar entre 2000 y ' + (thisYear + 1) + '.'; return; }
    $('#rMsg').textContent = '';
    st.push({ fecha: fecha, cliente: cliente, bruto: monto });
    year = fecha.slice(0, 4);
    $('#rCliente').value = ''; $('#rMonto').value = '';
    render();
  });

  $('#yYear').addEventListener('change', function () { year = this.value; render(); });

  document.addEventListener('click', function (ev) {
    var t = ev.target;
    if (t.dataset.del) {
      var b = st[+t.dataset.del];
      if (b && window.confirm('¿Quitar la boleta de ' + b.cliente + ' por ' + S.clp(b.bruto) + '?')) { st.splice(+t.dataset.del, 1); render(); }
    } else if (t.id === 'yCsv') {
      S.download('boletas-' + year + '.csv', '﻿' + L.csv(st, year, ind), 'text/csv;charset=utf-8');
    }
  });

  render();
  calc();
})();
