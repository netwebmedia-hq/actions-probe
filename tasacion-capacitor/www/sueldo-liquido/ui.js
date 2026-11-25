/* Sueldo Líquido UI: DOM only. Rules live in logic.js. */
(function () {
  'use strict';
  var S = window.Shell, L = window.AppLogic, $ = S.$;
  var base = window.APP_DATA.indicadores, ind = base, ufNote = '', ufDate = '', ufSrc = '';

  function ref() {
    // One source per line: the values, Previred, and (only when the live UF replaced the baked one) the UF's own source.
    return S.esc('Indicadores de ' + S.mes(base.asOf) + '. UF ' + S.clp(ind.uf) + ufDate + ', UTM ' + S.clp(ind.utm) + '.') + '<br>' +
      S.fuente('Fuente: ' + String(base.source).replace(/\s*\(https?:[^)]*\)/, '') + '.') +
      (ufSrc ? '<br>' + S.fuente('UF actualizada' + ufDate + ', fuente ' + ufSrc + '.') : '') +
      (S.viejo(base.asOf) ? '<br>' + S.esc(S.viejo(base.asOf)) : '');
  }
  function mode() { return $('input[name=sMode]:checked').value; }
  function row(label, value, cls) { return '<tr><td>' + label + '</td><td class="n' + (cls ? ' ' + cls : '') + '">' + value + '</td></tr>'; }
  function opts() {
    return { noImponible: S.num($('#sNoImp').value), afp: $('#sAfp').value, salud: $('#sSalud').value,
      planUf: S.num($('#sPlan').value), contrato: $('#sContrato').value, mas11: $('#sMas11').checked };
  }

  var lvS = ['', 'Escribe tu sueldo bruto abajo', 'Tu líquido'], lvF = ['', 'Completa los datos abajo', 'Tu finiquito'];
  var lnS = '', lnF = '';
  // Form values right after "Usar el ejemplo" (null = not used). The result keeps its Ejemplo label only while the form still equals this; nothing is stored.
  var exS = null, exF = null;
  function snap(p) { return S.$$(p + ' input, ' + p + ' select').map(function (e) { return e.type === 'checkbox' || e.type === 'radio' ? e.checked : e.value; }).join('|'); }
  function paint() {
    var onS = $('#tabS').getAttribute('aria-selected') === 'true';
    S.live.apply(S, onS ? lvS : lvF);
    $('.live-ln').textContent = onS ? lnS : lnF;
    // Each example button sits above its own form and shows only while that form is not filled.
    $('#sEj').parentNode.hidden = S.num($('#sAmount').value) > 0;
    $('#fEj').parentNode.hidden = finiquitoCompleto();
    $('#fEj').setAttribute('aria-label', 'Usar el ejemplo: rellena el formulario con 3 años de servicio y ' + S.clp(EJ_F.sueldo) + ' de sueldo');
  }
  // Finiquito example: 3 años de servicio, necesidades de la empresa, $1.000.000, con aviso. Real function, never stored.
  var EJ_F = { sueldo: 1000000, ingreso: '2022-03-01', termino: '2025-03-01', causal: 'necesidades', avisoDado: true, diasVacaciones: 0 };
  function ejF() { return L.finiquito(EJ_F, ind); }
  function ejFTxt() { return '3 años de servicio, causal "Necesidades de la empresa", sueldo ' + S.clp(EJ_F.sueldo) + ', con aviso previo'; }
  function tablaF(f) {
    return row('Indemnización por años de servicio (' + f.anios + ' años)', S.clp(f.indemnizacion)) +
      row('Indemnización sustitutiva del aviso previo', S.clp(f.avisoPrevio)) +
      row('Vacaciones pendientes (' + S.dec(f.diasCorridos) + ' días corridos)', S.clp(f.vacaciones)) +
      row('<b>Total estimado</b>', '<b>' + S.clp(f.total) + '</b>');
  }
  // Until the person types a sueldo the hero shows a $1.000.000 example, computed by the real rules and never stored.
  function ejemplo(o, liquidoMode) {
    var d = L.sueldoLiquido(Object.assign({}, o, { bruto: 1000000 }), ind);
    return liquidoMode ? [S.clp(d.bruto), 'para recibir ' + S.clp(d.liquido) + ' líquidos. Escribe el tuyo abajo', 'Bruto necesario', true]
      : [S.clp(d.liquido), 'de ' + S.clp(d.bruto) + ' brutos. Escribe el tuyo abajo', 'Tu líquido', true];
  }

  // Amount that reproduces the hero example in the current mode ($1.000.000 bruto, or the líquido it gives).
  function montoEjemplo(o, liquidoMode) {
    return liquidoMode ? L.sueldoLiquido(Object.assign({}, o, { bruto: 1000000 }), ind).liquido : 1000000;
  }

  // Wide screens: the result column shows the example until the person types. Phones keep the card hidden (the hero carries the example).
  var wideMq = window.matchMedia ? window.matchMedia('(min-width:1000px)') : { matches: false };
  // Phones: when the result first appears it is scrolled into view, but only after a pause or when the field loses focus, never while keys are still coming in.
  var pendiente = false, timer = 0;
  function revelar() {
    clearTimeout(timer);
    if (!pendiente || $('#sOut').hidden || wideMq.matches) return;
    pendiente = false;
    var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    $('#sOut').scrollIntoView({ block: 'start', behavior: calm ? 'auto' : 'smooth' });
  }

  function calcS() {
    var o = opts(), amount = S.num($('#sAmount').value), liquidoMode = mode() === 'liquido', d, res;
    var wasHidden = $('#sOut').hidden, wasEj = $('#sOut').classList.contains('ejemplo');
    var ej = !(amount > 0) && wideMq.matches, isEx = amount > 0 && exS !== null && snap('#panS') === exS;
    $('#sEj').setAttribute('aria-label', 'Usar el ejemplo: rellena el formulario con ' + (liquidoMode ? S.clp(montoEjemplo(o, true)) + ' líquidos' : '$1.000.000 de bruto'));
    $('#sPlanWrap').hidden = o.salud !== 'isapre';
    $('#sAmountLabel').textContent = liquidoMode ? 'Líquido deseado' : 'Sueldo bruto';
    $('#sAmountHint').textContent = liquidoMode ? 'Lo que quieres recibir al mes.' : 'Imponible, al mes.';
    $('#sOut').hidden = !(amount > 0) && !ej;
    $('#sOut').classList.toggle('ejemplo', ej || isEx);
    if (!(amount > 0)) pendiente = false;
    lnS = '';
    lvS = ['', liquidoMode ? 'Escribe el líquido que quieres abajo' : 'Escribe tu sueldo bruto abajo', liquidoMode ? 'Bruto necesario' : 'Tu líquido'];
    if (!(amount > 0)) {
      lvS = ejemplo(o, liquidoMode);
      // Phones show the example as one line: "Ejemplo: $1.000.000 brutos → $809.600 líquidos" (the box is the same, never stored).
      var dEj = L.sueldoLiquido(Object.assign({}, o, { bruto: 1000000 }), ind);
      lnS = 'Ejemplo: ' + (liquidoMode ? S.clp(dEj.liquido) + ' líquidos \u2192 ' + S.clp(dEj.bruto) + ' brutos' : S.clp(dEj.bruto) + ' brutos \u2192 ' + S.clp(dEj.liquido) + ' líquidos');
      if (!ej) return;
    }
    if (ej) {
      // Same $1.000.000 example as the hero, labelled and never stored; the real result replaces it on the first keystroke.
      d = L.sueldoLiquido(Object.assign({}, o, { bruto: 1000000 }), ind);
      $('#sHead').innerHTML = '<span class="tag">Ejemplo</span> ' + S.esc('Con ' + S.clp(1000000) + ' brutos llegas a ' + S.clp(d.liquido) + ' líquidos.');
    } else if (liquidoMode) {
      res = L.brutoParaLiquido(amount, o, ind);
      if (!res) {
        $('#sHead').textContent = 'Monto fuera de rango. Prueba con un líquido menor.';
        $('#sBig').textContent = ''; $('#sBar').innerHTML = ''; $('#sLegend').innerHTML = '';$('#sTable').innerHTML = ''; $('#sNote').textContent = '';
        lvS = ['', 'Monto fuera de rango', 'Bruto necesario'];
        return;
      }
      d = res.detalle;
      $('#sHead').textContent = 'Así se llega al bruto que necesitas';
    } else {
      o.bruto = amount; d = L.sueldoLiquido(o, ind);
      $('#sHead').textContent = 'Así se llega a tu líquido de ' + S.clp(d.liquido);
    }
    if (isEx) $('#sHead').innerHTML = '<span class="tag">Ejemplo</span> ' + S.esc($('#sHead').textContent);
    // The hero leads with the answer (líquido, or the bruto needed); the card below holds the breakdown, so the big number is not repeated.
    var desc = d.afp + d.salud + d.cesantia + d.impuesto;
    $('#sBig').textContent = 'Descuentos del mes: ' + S.clp(desc);
    if (!ej) lvS = liquidoMode ? [S.clp(d.bruto), 'para recibir ' + S.clp(amount) + ' líquidos', 'Bruto necesario'] : [S.clp(d.liquido), 'de ' + S.clp(d.bruto) + ' brutos', 'Tu líquido'];
    if (isEx) {
      var AV = ' Cambia cualquier dato para ver el tuyo';
      lvS = liquidoMode ? [S.clp(d.bruto), 'para recibir ' + S.clp(amount) + ' líquidos.' + AV, 'Bruto necesario', true] : [S.clp(d.liquido), 'de ' + S.clp(d.bruto) + ' brutos.' + AV, 'Tu líquido', true];
      lnS = 'Ejemplo: ' + (liquidoMode ? S.clp(d.liquido) + ' líquidos \u2192 ' + S.clp(d.bruto) + ' brutos' : S.clp(d.bruto) + ' brutos \u2192 ' + S.clp(d.liquido) + ' líquidos');
    }
    $('#sTable').innerHTML =
      row('Sueldo bruto imponible', S.clp(d.bruto)) +
      row('AFP', '-' + S.clp(d.afp), 'bad') +
      row('Salud', '-' + S.clp(d.salud), 'bad') +
      row('Seguro de cesantía', '-' + S.clp(d.cesantia), 'bad') +
      row('Impuesto único', (d.impuesto ? '-' : '') + S.clp(d.impuesto), d.impuesto ? 'bad' : '') +
      (d.noImponible ? row('Haberes no imponibles', '+' + S.clp(d.noImponible), 'ok') : '') +
      row('<b>Líquido</b>', '<b>' + S.clp(d.liquido) + '</b>');
    // Share of the gross that goes to each deduction and what is left.
    var partes = L.barra(d).map(function (s) { return [s.label, s.value, s.cls, s.w]; });
    var pct = function (v) { return S.dec(Math.round(v / d.bruto * 1000) / 10) + '%'; };
    $('#sBar').innerHTML = partes.map(function (p) { return '<span class="' + p[2] + '" style="width:' + p[3] + '%">' + (p[2] === 'k1' && p[3] > 30 ? '<em>' + p[0] + ' ' + pct(p[1]) + '</em>' : '') + '</span>'; }).join('');
    // The fill animates only the first time the result appears, not on every keystroke (and never under reduced motion: see the CSS).
    $('#sBar').classList.toggle('grow', wasHidden || wasEj);
    $('#sBar').setAttribute('aria-label', partes.map(function (p) { return p[0] + ' ' + pct(p[1]); }).join(', '));
    $('#sLegend').innerHTML = partes.map(function (p) { return '<span><i class="' + p[2] + '"></i>' + p[0] + ' ' + pct(p[1]) + '</span>'; }).join('');
    $('#sNote').textContent = (ej ? 'Ejemplo de muestra: no se guarda. Escribe tu sueldo a la izquierda para ver el tuyo. ' : isEx ? 'Ejemplo de muestra: cambia cualquier dato para ver el tuyo. ' : '') + 'Referencial. No incluye gratificación, horas extra, APV ni otros descuentos.';
    if (!ej && wasHidden && !wideMq.matches) pendiente = true;
    if (pendiente) { clearTimeout(timer); timer = setTimeout(revelar, 1200); }
  }

  function finiquitoCompleto() {
    var ing = $('#fIng').value, ter = $('#fTer').value;
    return S.num($('#fSueldo').value) > 0 && !!ing && !!ter && ter >= ing;
  }
  function calcF() {
    var sueldo = S.num($('#fSueldo').value), ok = finiquitoCompleto(), ej = !ok && wideMq.matches, f, isEx = ok && exF !== null && snap('#panF') === exF;
    $('#fAvisoWrap').hidden = $('#fCausal').value !== 'necesidades';
    $('#fOut').hidden = !ok && !ej;
    $('#fOut').classList.toggle('ejemplo', ej || isEx);
    $('#fEjNote').hidden = !(ej || isEx);
    $('#fEjNote').textContent = isEx ? 'Ejemplo de muestra: cambia cualquier dato para ver el tuyo.' : 'Ejemplo de muestra: no se guarda. Completa tus datos a la izquierda para ver el tuyo.';
    if (!ok) {
      // Same example as the hero: computed by the real finiquito function, labelled, never stored.
      f = ejF();
      lvF = [S.clp(f.total), '3 años de servicio, necesidades de la empresa, ' + S.clp(EJ_F.sueldo) + '. Completa los tuyos abajo', 'Tu finiquito', true];
      lnF = 'Ejemplo: 3 años, necesidades de la empresa, ' + S.clp(EJ_F.sueldo) + ' → ' + S.clp(f.total) + ' de finiquito';
      if (!ej) return;
      $('#fHead').innerHTML = '<span class="tag">Ejemplo</span> ' + S.esc(ejFTxt());
    } else {
      f = L.finiquito({ sueldo: sueldo, ingreso: $('#fIng').value, termino: $('#fTer').value, causal: $('#fCausal').value,
        avisoDado: $('#fAviso').value === 'si', diasVacaciones: S.num($('#fVac').value) }, ind);
      lvF = [S.clp(f.total), 'estimado, referencial', 'Tu finiquito'];
      lnF = '';
      $('#fHead').textContent = 'Tu finiquito, estimado';
      if (isEx) {
        lvF = [S.clp(f.total), '3 años de servicio, necesidades de la empresa, ' + S.clp(EJ_F.sueldo) + '. Cambia cualquier dato para ver el tuyo', 'Tu finiquito', true];
        lnF = 'Ejemplo: 3 años, necesidades de la empresa, ' + S.clp(EJ_F.sueldo) + ' \u2192 ' + S.clp(f.total) + ' de finiquito';
        $('#fHead').innerHTML = '<span class="tag">Ejemplo</span> Tu finiquito, estimado';
      }
    }
    $('#fTable').innerHTML = tablaF(f);
    $('#fRef').textContent = 'El tope de 90 UF usa la UF' + (ufNote ? '' : ' de ' + base.asOf) + ' (' + S.clp(ind.uf) + ufNote + ').';
  }

  function calc() { calcS(); calcF(); paint(); $('#dataNote').innerHTML = ref(); }

  $('#sAfp').innerHTML = Object.keys(base.afpTrabajadorPct).map(function (a) {
    return '<option value="' + S.esc(a) + '">' + S.esc(a) + ' (' + S.dec(base.afpTrabajadorPct[a]) + '%)</option>';
  }).join('');

  function tab(s) {
    $('#tabS').setAttribute('aria-selected', s); $('#tabF').setAttribute('aria-selected', !s);
    $('#panS').hidden = !s; $('#panF').hidden = s;
    calcS();
    paint();
  }
  $('#tabS').addEventListener('click', function () { tab(true); });
  $('#tabF').addEventListener('click', function () { tab(false); });
  // One tap fills the form with the hero example. Nothing is stored: this app keeps no data.
  $('#fEj').addEventListener('click', function () {
    {
      $('#fSueldo').value = S.clp(EJ_F.sueldo).replace('$', ''); $('#fIng').value = EJ_F.ingreso; $('#fTer').value = EJ_F.termino;
      $('#fCausal').value = EJ_F.causal; $('#fAviso').value = EJ_F.avisoDado ? 'si' : 'no'; $('#fVac').value = '';
      exF = snap('#panF');
      calc();
      var calmF = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      $('#fOut').scrollIntoView({ block: 'start', behavior: calmF ? 'auto' : 'smooth' });
    }
  });
  $('#sEj').addEventListener('click', function () {
    $('#sAmount').value = S.clp(montoEjemplo(opts(), mode() === 'liquido')).replace('$', '');
    exS = snap('#panS');
    calc();
    pendiente = false; clearTimeout(timer);
    // The answer is the result card, not the form: bring it to the top, without motion if the person asked for none.
    var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    $('#sOut').scrollIntoView({ block: 'start', behavior: calm ? 'auto' : 'smooth' });
  });
  // /#finiquito (links from the finiquito pages) opens the Finiquito tab.
  if (location.hash === '#finiquito') tab(false);

  ['#fS', '#fF'].forEach(function (f) {
    $(f).addEventListener('submit', function (ev) { ev.preventDefault(); });
    $(f).addEventListener('input', calc);
    $(f).addEventListener('change', calc);
  });
  $('#sAmount').addEventListener('blur', revelar);
  if (wideMq.addEventListener) wideMq.addEventListener('change', calc);
  calc();

  // Live UF replaces the baked value only when the call works; failure is silent.
  fetch('https://netwebmedia.com/api/public/uf').then(function (res) { return res.json(); }).then(function (j) {
    // Sanity bound: a live UF more than 10% away from the baked one is a bad answer, not a new UF.
    if (!j || typeof j.value !== 'number' || !isFinite(j.value) || Math.abs(j.value / base.uf - 1) > 0.1) return;
    ind = Object.assign({}, base, { uf: j.value });
    ufDate = ' al ' + S.fecha(String(j.asOf || '')); ufSrc = j.source ? String(j.source) : '';
    ufNote = ufDate + (ufSrc ? ', fuente ' + ufSrc : '');
    calc();
  }).catch(function () {});
})();
