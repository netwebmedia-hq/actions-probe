/* Cotiza Fácil UI: DOM only. Totals and message text live in logic.js. */
(function () {
  'use strict';
  var S = window.Shell, L = window.AppLogic, $ = S.$;
  var neg = S.load('negocio', { nombre: '', giro: '', rut: '', telefono: '' });
  var guardadas = S.load('cotizaciones', []);
  var siguiente = S.load('siguiente', 1);
  var cot;

  function hoy() { return S.hoy(); }

  // A reopened quote keeps its saved date.
  function fechaCot() { return cot.fecha || hoy(); }

  function hayBorrador() {
    return !!cot.cliente.trim() || cot.items.some(function (it) { return it.d.trim(); });
  }

  function nueva() {
    return { numero: siguiente, cliente: '', items: [{ d: '', c: '1', v: '' }], iva: 'sin', dias: '15', notas: '' };
  }

  // Items hold the raw typed strings; numbers are parsed only when computing.
  function limpia() {
    return {
      numero: cot.numero, cliente: cot.cliente, iva: cot.iva, dias: S.num(cot.dias) || 15, notas: cot.notas,
      items: cot.items.map(function (it) { return { d: it.d, c: S.num(it.c), v: S.num(it.v) }; })
    };
  }

  function fillForm() {
    $('#cCliente').value = cot.cliente; $('#cIva').value = cot.iva; $('#cDias').value = cot.dias; $('#cNotas').value = cot.notas;
    $('#items').innerHTML = cot.items.map(function (it, i) {
      return '<div class="item"><div class="row">' +
        '<label>Descripción<input class="it" data-f="d" data-i="' + i + '" autocomplete="off" maxlength="80" value="' + S.esc(it.d).replace(/"/g, '&quot;') + '"></label>' +
        '<label>Cantidad<input class="it" data-f="c" data-i="' + i + '" inputmode="decimal" autocomplete="off" value="' + S.esc(it.c).replace(/"/g, '&quot;') + '"></label>' +
        '<label>Valor unitario<input class="it" data-f="v" data-i="' + i + '" inputmode="numeric" autocomplete="off" placeholder="$" value="' + S.esc(it.v).replace(/"/g, '&quot;') + '"></label>' +
        '<button class="btn ghost small rm" type="button" data-rm="' + i + '" aria-label="Quitar ítem" title="Quitar ítem">✕</button></div></div>';
    }).join('');
  }

  function refresh() {
    var c = limpia(), t = L.totales(c.items, c.iva), h = fechaCot();
    $('#cNum').textContent = L.numero(c.numero);
    var nIt = c.items.filter(function (it) { return it.c * it.v > 0; }).length;
    S.live(t.total > 0 ? S.clp(t.total) : '', nIt ? nIt + (nIt === 1 ? ' ítem' : ' ítems') + ' · ' + (c.iva === 'incl' ? 'IVA incluido' : c.iva === 'sin' ? 'sin IVA' : 'más IVA 19%') : 'Agrega un ítem abajo');
    $('#save').textContent = 'Guardar';
    var noNum = function (v) { return String(v).trim() !== '' && !/\d/.test(v); };
    $('#cMsg').textContent = c.items.some(L.muyGrande) ? 'Revisa el monto: es demasiado grande.' :
      cot.items.some(function (it) { return noNum(it.c) || noNum(it.v); }) ? 'Cantidad y valor deben ser números. Ese ítem quedó en $0.' :
      c.items.some(function (it) { return it.c < 0 || it.v < 0; }) ? 'Cantidad y valor deben ser positivos. Los ítems con valores negativos no se suman.' : '';
    var mal = cot.items.some(function (it) { return noNum(it.c) || noNum(it.v); });
    $('#copy').disabled = $('#save').disabled = $('#print').disabled = mal;
    $('#wa').setAttribute('aria-disabled', mal ? 'true' : 'false');
    var filas = L.lineas(c.items).map(function (l) {
      return '<tr><td>' + S.esc(l.d) + '</td><td class="n">' + S.esc(String(l.c).replace('.', ',')) + '</td><td class="n">' + S.clp(l.v) + '</td><td class="n">' + S.clp(l.sub) + '</td></tr>';
    }).join('');
    var neto = c.iva === 'sin' ? '' : '<p class="tot mut">Neto ' + S.clp(t.neto) + ' · IVA 19% ' + S.clp(t.iva) + '</p>';
    var cab = [neg.nombre, neg.giro].filter(Boolean).map(S.esc).join(' · ');
    var contacto = [neg.rut ? 'RUT ' + neg.rut : '', neg.telefono].filter(Boolean).map(S.esc).join(' · ');
    $('#preview').innerHTML = '<h3>Cotización ' + S.esc(L.numero(c.numero)) + '</h3>' +
      (cab ? '<p><b>' + cab + '</b></p>' : '') + (contacto ? '<p class="mut">' + contacto + '</p>' : '') +
      '<p>' + (c.cliente ? 'Cliente: <b>' + S.esc(c.cliente) + '</b><br>' : '') + 'Fecha: ' + S.esc(L.fechaCL(h)) + '</p>' +
      (filas ? '<div class="scroll"><table class="t"><thead><tr><th>Descripción</th><th class="n">Cant.</th><th class="n">Unitario</th><th class="n">Subtotal</th></tr></thead><tbody>' + filas + '</tbody></table></div>' +
      neto + '<p class="tot big">' + S.clp(t.total) + '</p>' +
      '<p class="tot mut">' + (c.iva === 'incl' ? 'IVA incluido' : c.iva === 'sin' ? 'Sin IVA' : 'Más IVA 19%') + '</p>'
        : '<p class="vacio">Agrega un ítem con su valor y aquí aparece la cotización.</p>') +
      '<p>Válida hasta el ' + S.esc(L.fechaCL(L.validoHasta(h, c.dias))) + '.</p>' +
      (c.notas.trim() ? '<p>Notas: ' + S.esc(c.notas.trim()) + '</p>' : '') +
      '<p class="mut">Esto es una cotización, no una boleta ni una factura.</p>';
    $('#wa').href = S.wa(L.texto(c, neg, h));
  }

  function renderGuardadas() {
    $('#guardadasCard').hidden = !guardadas.length;
    $('#guardadas').innerHTML = guardadas.map(function (g, i) {
      var c = { items: g.items.map(function (it) { return { d: it.d, c: S.num(it.c), v: S.num(it.v) }; }) };
      return '<li><span><b>' + S.esc(L.numero(g.numero)) + '</b> ' + S.esc(g.cliente || 'Sin cliente') + '<br><span class="mut">' +
        S.clp(L.totales(c.items, g.iva).total) + ' · ' + S.esc(L.fechaCL(g.fecha)) + '</span></span>' +
        '<span class="actions"><button class="btn ghost small" type="button" data-open="' + i + '">Abrir</button>' +
        '<button class="btn ghost small" type="button" data-del="' + i + '">Borrar</button></span></li>';
    }).join('');
  }

  function all() { fillForm(); refresh(); renderGuardadas(); }

  document.addEventListener('input', function (ev) {
    var t = ev.target;
    if (t.classList.contains('it')) cot.items[+t.dataset.i][t.dataset.f] = t.value;
    else if (t.id === 'cCliente') cot.cliente = t.value;
    else if (t.id === 'cIva') cot.iva = t.value;
    else if (t.id === 'cDias') cot.dias = t.value;
    else if (t.id === 'cNotas') cot.notas = t.value;
    else if (/^n(Nombre|Giro|Rut|Tel)$/.test(t.id)) {
      neg = { nombre: $('#nNombre').value, giro: $('#nGiro').value, rut: $('#nRut').value, telefono: $('#nTel').value };
      S.save('negocio', neg);
    } else return;
    S.save('borrador', cot); // a reload or iOS dropping the tab must not lose a half-written quote
    refresh();
  });

  document.addEventListener('click', function (ev) {
    var t = ev.target;
    if (t.id === 'addItem') { cot.items.push({ d: '', c: '1', v: '' }); fillForm(); refresh(); }
    else if (t.dataset.rm) { cot.items.splice(+t.dataset.rm, 1); if (!cot.items.length) cot.items.push({ d: '', c: '1', v: '' }); fillForm(); refresh(); }
    else if (t.id === 'copy') S.copy(L.texto(limpia(), neg, fechaCot())).then(function (ok) { t.textContent = ok ? 'Copiado' : 'No se pudo copiar'; });
    else if (t.id === 'print') S.print(L.texto(limpia(), neg, fechaCot()));
    else if (t.id === 'save') {
      var c = limpia(), nuevo = { numero: c.numero, cliente: c.cliente, iva: c.iva, dias: c.dias, notas: c.notas, items: cot.items.map(function (it) { return { d: it.d, c: it.c, v: it.v }; }), fecha: fechaCot() };
      var i = guardadas.map(function (g) { return g.numero; }).indexOf(c.numero);
      if (i >= 0) guardadas[i] = nuevo; else guardadas.unshift(nuevo);
      var ok = true;
      if (c.numero >= siguiente) { siguiente = c.numero + 1; ok = S.save('siguiente', siguiente); }
      ok = S.save('cotizaciones', guardadas) && ok;
      renderGuardadas();
      t.textContent = ok ? 'Guardada' : 'No se pudo guardar en este dispositivo';
    } else if (t.id === 'nueva') {
      if (hayBorrador() && !confirm('¿Empezar una cotización nueva? Se pierde lo que no hayas guardado.')) return;
      cot = nueva(); S.save('borrador', null); all();
    }
    else if (t.dataset.open) {
      if (hayBorrador() && !confirm('¿Abrir esta cotización? Se pierde lo que no hayas guardado.')) return;
      var g = guardadas[+t.dataset.open];
      cot = { numero: g.numero, cliente: g.cliente, items: g.items.map(function (it) { return { d: it.d, c: it.c, v: it.v }; }), iva: g.iva, dias: String(g.dias), notas: g.notas, fecha: g.fecha };
      all(); window.scrollTo(0, 0);
    } else if (t.dataset.del && confirm('¿Borrar esta cotización?')) {
      guardadas.splice(+t.dataset.del, 1); S.save('cotizaciones', guardadas); renderGuardadas();
    }
  });

  $('#nNombre').value = neg.nombre; $('#nGiro').value = neg.giro; $('#nRut').value = neg.rut; $('#nTel').value = neg.telefono;
  cot = S.load('borrador', null) || nueva();
  all();
})();
