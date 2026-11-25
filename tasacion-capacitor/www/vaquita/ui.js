/* Vaquita UI: DOM only. Money rules live in logic.js. */
(function () {
  'use strict';
  var S = window.Shell, L = window.AppLogic, $ = S.$;
  var saved = S.load('state', null);
  var st = L.estado(saved);
  // demo = the asado example is on screen. It lives in memory only and never reaches storage.
  // The form always opens as the person's own (empty or saved) list: the example is the hero teaser and the "Ver un ejemplo" chip.
  var demo = false;
  // Nothing is written to storage until the person edits (adds, removes or resets), so opening the page and trying the example leave no trace.
  var dirty = saved !== null;
  // Items of the bill being entered in "Dividir por ítem". In memory only until "Agregar gasto".
  var draft = [];

  // Small bounce on the cow in the hero when a split is calculated (CSS ignores it with reduced motion).
  function moo() {
    var c = document.querySelector('.hero-art'); if (!c) return;
    c.classList.remove('moo'); void c.offsetWidth; c.classList.add('moo');
  }
  function ejemplo() {
    var people = ['Ana', 'Beto', 'Caro', 'Dani'];
    return { people: people, bank: st.bank, expenses: [
      { what: 'Carne', amount: 48000, payer: 'Ana', among: people.slice() },
      { what: 'Bebidas', amount: 20000, payer: 'Beto', among: people.slice() },
      { what: 'Pan y ensaladas', amount: 12000, payer: 'Caro', among: people.slice() },
      { what: 'Carbón y hielo', amount: 8000, payer: 'Dani', among: people.slice() }] };
  }

  function summary() {
    var lines = ['Vaquita: total ' + S.clp(L.total(st.expenses))];
    // An item split shows what each person had, so the group can check it before paying.
    st.expenses.forEach(function (e, i) {
      if (!e.items) return;
      var c = L.cuotas(st.people, e, i);
      lines.push((e.what || 'Cuenta') + ' por ítem' + (e.tip > 0 ? ' (con propina ' + e.tip + '%)' : '') + ': ' +
        Object.keys(c.owe).map(function (p) { return p + ' ' + S.clp(c.owe[p]); }).join(', '));
    });
    L.settle(L.balances(st.people, st.expenses)).forEach(function (t) {
      lines.push(t.from + ' le transfiere ' + S.clp(t.amount) + ' a ' + t.to);
    });
    if (st.bank.trim()) lines.push('', 'Datos de transferencia:', st.bank.trim());
    return lines.join('\n');
  }

  // The hero answers the question: who pays whom. The total is the quiet second line.
  // The sentence is long, so it wraps (class "verdict") instead of using the big one-line number.
  function veredicto(transfers, resto, ex) {
    var t = transfers[0], n = transfers.length - 1;
    var sub = (n > 0 ? 'y ' + n + (n === 1 ? ' pago más' : ' pagos más') + ' · ' : '') + resto;
    document.querySelector('.live').classList.add('verdict');
    S.live(t ? t.from + ' le paga ' + S.clp(t.amount) + ' a ' + t.to : 'Nadie debe nada', sub, 'Cuentas claras', ex);
  }
  function numero(v, sub) { document.querySelector('.live').classList.remove('verdict'); S.live(v, sub, 'Total gastado'); }

  // Worked example for the hero until the person enters anything. Computed by the real rules, never stored.
  // Same data as "Probar con un ejemplo" (ejemplo()), so the teaser and the loaded example always agree.
  function example() {
    var ex = ejemplo();
    veredicto(L.settle(L.balances(ex.people, ex.expenses)), 'Asado de ' + ex.people.length + ', total ' + S.clp(L.total(ex.expenses)), true);
  }
  var X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  function render() {
    if (!demo && dirty) S.save('state', st);
    $('#demoNote').hidden = !demo;
    // Whenever there is a result (the example or the person's own expenses) the answer is the first card under the hero, on desktop and phone; with none it stays at step 3.
    var res = $('#result'), first = $('#st1').closest('section');
    if (st.expenses.length) { if (first.previousElementSibling !== res) first.parentNode.insertBefore(res, first); }
    else if (first.previousElementSibling === res) $('.side.pair').after(res);
    $('#resNote').hidden = !demo;
    $('#people').innerHTML = st.people.map(function (p, i) {
      return '<li><span><span class="av" aria-hidden="true">' + S.esc(p.trim().charAt(0).toUpperCase()) + '</span>' + S.esc(p) + '</span><button class="xbtn" data-del-person="' + i + '" type="button" aria-label="Quitar ' + S.esc(p) + '" title="Quitar ' + S.esc(p) + '">' + X + '</button></li>';
    }).join('');
    $('#ePayer').innerHTML = st.people.map(function (p) { return '<option>' + S.esc(p) + '</option>'; }).join('');
    $('#eAmong').innerHTML = st.people.map(function (p, i) {
      return '<label><input type="checkbox" value="' + i + '" checked>' + S.esc(p) + '</label>';
    }).join('');
    // Items start with nobody ticked: most dishes belong to one person.
    $('#iAmong').innerHTML = st.people.map(function (p, i) {
      return '<label><input type="checkbox" value="' + i + '">' + S.esc(p) + '</label>';
    }).join('');
    renderDraft();
    $('#expenses').innerHTML = st.expenses.map(function (e, i) {
      var who = e.among.length === st.people.length ? 'todos' : e.among.join(', ');
      var how = e.items ? 'por ítem (' + e.items.length + (e.items.length === 1 ? ' ítem' : ' ítems') + (e.tip > 0 ? ', propina ' + e.tip + '%' : '') + ')' : 'entre ' + S.esc(who);
      return '<li><span><b>' + S.esc(e.what) + '</b> ' + S.clp(e.amount) + '<br><span class="mut">Pagó ' + S.esc(e.payer) + ' · ' + how + '</span></span>' +
        '<button class="xbtn" data-del-exp="' + i + '" type="button" aria-label="Quitar gasto ' + S.esc(e.what) + '" title="Quitar gasto ' + S.esc(e.what) + '">' + X + '</button></li>';
    }).join('');
    var transfers = L.settle(L.balances(st.people, st.expenses));
    $('#result').hidden = !st.expenses.length;
    $('#rTotal').textContent = S.clp(L.total(st.expenses));
    $('#rTransfers').innerHTML = transfers.length
      ? transfers.map(function (t) { return '<li><span><span class="av" aria-hidden="true">' + S.esc(String(t.from).trim().charAt(0).toUpperCase()) + '</span>' + S.esc(t.from) + ' → <span class="av" aria-hidden="true">' + S.esc(String(t.to).trim().charAt(0).toUpperCase()) + '</span>' + S.esc(t.to) + '</span><b>' + S.clp(t.amount) + '</b></li>'; }).join('')
      : '<li>Nadie debe nada.</li>';
    // Summary strip, from the same split as the list: how many payments and how much money moves.
    var movido = transfers.reduce(function (a, t) { return a + t.amount; }, 0);
    $('#rStrip').hidden = !transfers.length;
    $('#rStrip').textContent = transfers.length + (transfers.length === 1 ? ' transferencia' : ' transferencias') + ' · ' + S.clp(movido);
    $('#rWa').href = S.wa(summary());
    // With the person's own result the card below already says who pays whom: the hero keeps just the tagline. The example stays in the hero.
    document.querySelector('.live').style.display = st.expenses.length && !demo ? 'none' : '';
    if (st.expenses.length) veredicto(transfers, 'Total gastado ' + S.clp(L.total(st.expenses)) + ' entre ' + st.people.length + (st.people.length === 1 ? ' persona' : ' personas'));
    else if (st.people.length) numero(S.clp(0), st.people.length + (st.people.length === 1 ? ' persona' : ' personas') + ' · falta el primer gasto');
    else example();
    // Step 2 stays locked until step 1 has two people: a split needs at least two.
    var falta = Math.max(0, 2 - st.people.length);
    $('#expFs').disabled = falta > 0;
    $('#expLock').hidden = falta === 0;
    $('#expLock').textContent = 'Agrega al menos 2 personas para anotar gastos';
    $('#st2').closest('section').classList.toggle('lockd', falta > 0);
    $('#st1').classList.toggle('done', st.people.length >= 2);
    $('#st2').classList.toggle('done', st.expenses.length > 0);
    $('#st3').classList.toggle('done', st.expenses.length > 0);
  }

  // Item mode swaps the single amount and "entre todos" ticks for a list of items with their own people.
  function modo() {
    var on = $('#eModo').checked;
    $('#eItemsBox').hidden = !on;
    $('#eSimple').hidden = on;
    $('#eAmountWrap').hidden = on;
    $('#eAmount').required = !on;
  }
  function renderDraft() {
    $('#eItems').innerHTML = draft.map(function (it, i) {
      return '<li><span><b>' + S.esc(it.what || 'Ítem') + '</b> ' + S.clp(it.amount) + '<br><span class="mut">' + S.esc(it.among.join(', ')) + '</span></span>' +
        '<button class="xbtn" data-del-item="' + i + '" type="button" aria-label="Quitar ítem ' + S.esc(it.what || '') + '" title="Quitar ítem">' + X + '</button></li>';
    }).join('');
    var m = L.montoItems(draft, $('#eTip').checked ? L.PROPINA : 0);
    $('#iSum').textContent = draft.length
      ? 'Ítems ' + S.clp(m.subtotal) + (m.propina ? ' + propina ' + S.clp(m.propina) : '') + ' = ' + S.clp(m.total)
      : 'Anota cada ítem de la boleta y marca quiénes lo consumieron.';
  }
  // Adds the item in the item fields to the draft. Returns false (with a message) when it is incomplete.
  function agregarItem() {
    var amount = S.num($('#iAmount').value);
    var among = S.$$('#iAmong input:checked').map(function (c) { return st.people[+c.value]; });
    if (!(amount > 0) || !among.length) { $('#eMsg').textContent = 'Para el ítem, escribe el monto y marca quién lo consumió.'; return false; }
    $('#eMsg').textContent = '';
    draft.push({ what: L.limpiar($('#iWhat').value), amount: amount, among: among });
    $('#iWhat').value = ''; $('#iAmount').value = '';
    S.$$('#iAmong input').forEach(function (c) { c.checked = false; });
    renderDraft();
    $('#iWhat').focus();
    return true;
  }
  $('#eModo').addEventListener('change', modo);
  $('#eTip').addEventListener('change', renderDraft);
  // Enter in an item field adds the item instead of the whole expense.
  ['#iWhat', '#iAmount'].forEach(function (sel) {
    $(sel).addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); agregarItem(); } });
  });

  $('#fPerson').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var name = L.limpiar($('#pName').value);
    if (L.existe(st.people, name)) { $('#pMsg').textContent = 'Ya hay alguien llamado así en la lista.'; return; }
    $('#pMsg').textContent = '';
    // Typing a name while the example is on screen starts the person's own list; the example's people are not kept.
    if (demo) st = { people: [], expenses: [], bank: st.bank };
    demo = false; dirty = true;
    if (name) st.people.push(name);
    $('#pName').value = '';
    render();
  });

  $('#fExp').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var amount = S.num($('#eAmount').value);
    var among = S.$$('#eAmong input:checked').map(function (c) { return st.people[+c.value]; });
    if (demo) { $('#eMsg').textContent = 'Estás viendo un ejemplo. Toca "Empezar la mía" y agrega a tu gente primero.'; return; }
    if (st.people.length < 2) { $('#eMsg').textContent = 'Agrega al menos dos personas.'; return; }
    var gasto;
    if ($('#eModo').checked) {
      // An item still in the fields counts: people often type the last one and tap "Agregar gasto".
      if ((S.num($('#iAmount').value) > 0 || S.$$('#iAmong input:checked').length) && !agregarItem()) return;
      if (!draft.length) { $('#eMsg').textContent = 'Agrega al menos un ítem.'; return; }
      var tip = $('#eTip').checked ? L.PROPINA : 0;
      gasto = { what: $('#eWhat').value.trim(), amount: L.montoItems(draft, tip).total, payer: $('#ePayer').value, among: L.quienes(draft), items: draft, tip: tip };
    } else {
      if (!(amount > 0) || !among.length) { $('#eMsg').textContent = 'Revisa el monto y marca al menos una persona.'; return; }
      gasto = { what: $('#eWhat').value.trim(), amount: amount, payer: $('#ePayer').value, among: among };
    }
    $('#eMsg').textContent = '';
    demo = false; dirty = true;
    var primero = !st.expenses.length;
    st.expenses.push(gasto);
    draft = [];
    $('#eWhat').value = ''; $('#eAmount').value = '';
    render(); moo();
    // Only the first result: the card appears at the top, so bring it into view (no scroll on later edits).
    if (primero) { var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; $('#result').scrollIntoView({ block: 'start', behavior: calm ? 'auto' : 'smooth' }); }
  });

  document.addEventListener('click', function (ev) {
    var t = ev.target.closest ? ev.target.closest('button,a') || ev.target : ev.target;
    if (t.dataset.delPerson) {
      var name = st.people[+t.dataset.delPerson];
      var rest = L.sinPersona(st.expenses, name);
      var paid = st.expenses.filter(function (e) { return e.payer === name; }).length;
      var solo = st.expenses.length - rest.length - paid;
      var used = paid || solo || st.expenses.some(function (e) { return e.among.indexOf(name) >= 0; });
      var cosas = [];
      if (paid) cosas.push(paid + (paid === 1 ? ' gasto que pagó' : ' gastos que pagó'));
      if (solo) cosas.push(solo + (solo === 1 ? ' gasto que era solo para esa persona' : ' gastos que eran solo para esa persona'));
      if (used && !window.confirm(cosas.length ? 'Quitar a ' + name + ' borrará ' + cosas.join(' y ') + '. ¿Seguir?' : '¿Quitar a ' + name + '?')) return;
      demo = false; dirty = true;
      st.people.splice(+t.dataset.delPerson, 1);
      st.expenses = rest;
      draft = draft.map(function (it) { return { what: it.what, amount: it.amount, among: it.among.filter(function (p) { return p !== name; }) }; })
        .filter(function (it) { return it.among.length; });
      render();
    } else if (t.dataset.delExp) {
      if (window.confirm('¿Quitar este gasto?')) { demo = false; dirty = true; st.expenses.splice(+t.dataset.delExp, 1); render(); }
    } else if (t.dataset.delItem) {
      draft.splice(+t.dataset.delItem, 1); renderDraft();
    } else if (t.id === 'iAdd') {
      agregarItem();
    } else if (t.id === 'rCopy') {
      S.copy(summary()).then(function (ok) { t.textContent = ok ? 'Copiado' : 'No se pudo copiar'; });
    } else if (t.id === 'demoBtn') {
      st = ejemplo(); demo = true; draft = []; render(); moo();
      // The answer (who pays whom) is below the lists: bring it into view, without motion if the person asked for none.
      var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      $('#result').scrollIntoView({ block: 'start', behavior: calm ? 'auto' : 'smooth' });
    } else if (t.id === 'demoClear' || (t.id === 'reset' && window.confirm('¿Borrar todo y empezar de nuevo?'))) {
      demo = false; draft = []; st = { people: [], expenses: [], bank: st.bank }; render();
    }
  });

  modo();
  $('#bank').value = st.bank;
  $('#bank').addEventListener('input', function () { st.bank = this.value; S.save('state', demo ? { people: [], expenses: [], bank: st.bank } : st); $('#rWa').href = S.wa(summary()); });
  render();
})();
