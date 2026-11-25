/* Shared helpers for every factory app (window.Shell). No app logic here. */
(function () {
  'use strict';
  var app = document.documentElement.getAttribute('data-app') || 'app';
  var meta = function (sel, attr) { var e = document.querySelector(sel); return e ? e.getAttribute(attr) : ''; };
  var name = meta('meta[property="og:site_name"]', 'content') || document.title;
  // The canonical URL, not location: inside the iOS shell location is capacitor://localhost.
  var url = meta('link[rel=canonical]', 'href') || location.href;
  // Inside the iOS app (Capacitor) the web view has no downloads and no print dialog:
  // files and printable text go out through the native share sheet instead.
  var cap = window.Capacitor, native = !!(cap && cap.isNativePlatform && cap.isNativePlatform());
  var plug = (native && cap.Plugins) || {};
  var quiet = function () {};
  var firmaOn = false;
  function numLee(s) {
    s = String(s == null ? '' : s).replace(/[^\d.,-]/g, '');
    if (!/\d/.test(s)) return { n: 0, mal: false };
    var t;
    if (/^-?\d+$/.test(s)) t = s;
    else if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) t = s.replace(/\./g, '').replace(',', '.');
    else if (/^-?\d{1,3}(,\d{3}){2,}(\.\d+)?$/.test(s)) t = s.replace(/,/g, '');
    else if (/^-?\d+,\d+$/.test(s)) t = s.replace(',', '.');
    else if (/^-?\d*\.\d{1,2}$/.test(s)) t = s;
    var n = parseFloat(t);
    return isFinite(n) ? { n: n, mal: false } : { n: 0, mal: true };
  }
  var Shell = {
    // 1234567.8 -> "$1.234.568"
    clp: function (n) {
      n = Math.round(Number(n) || 0);
      // toLocaleString, not String(): String(1e21) is "1e+21".
      return (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 0 }).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    },
    // "1.234.567", "$ 12.990", "0,5" -> number (Chilean format: dot = thousands, comma = decimal).
    // A single dot before 1 or 2 digits ("4.2", "12.50") is a decimal typed the phone-keyboard way,
    // and "1,234,567" (two or more comma groups) is a US-style paste. Anything else that fits no
    // pattern ("1.000.5", "1.2345") reads as 0, the same as an empty field, and Shell.numMal flags it.
    num: function (s) { return numLee(s).n; },
    // true when the text has digits but fits no number format above: the caller shows a hint instead of a silent 0.
    numMal: function (s) { return numLee(s).mal; },
    // 15.25 -> "15,25": decimal comma for numbers people read.
    dec: function (n) { return String(n).replace('.', ','); },
    // Live result in the hero band: S.live(value, sub, label, ex). No value = the idle text in data-idle.
    // ex = true marks the result as a worked example (not the person's data): dashed box, label starts with "Ejemplo".
    live: function (v, sub, label, ex) {
      var box = document.querySelector('.live'); if (!box) return;
      var q = function (c) { return box.querySelector(c); };
      q('.live-v').textContent = v || box.getAttribute('data-idle') || '';
      if (q('.live-s') && sub != null) q('.live-s').textContent = sub;
      var k = q('.live-k');
      if (k) { if (!k.getAttribute('data-k0')) k.setAttribute('data-k0', k.textContent); k.textContent = (ex ? 'Ejemplo · ' : '') + (label || k.getAttribute('data-k0')); }
      box.classList.toggle('idle', !v);
      box.classList.toggle('ex', !!ex);
    },
    // Today in Chile as YYYY-MM-DD. Not toISOString (UTC): after 21:00 in Santiago that is already tomorrow.
    hoy: function () {
      try {
        var f = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
        if (/^\d{4}-\d{2}-\d{2}$/.test(f)) return f;
      } catch (e) { /* use the device date */ }
      var d = new Date();
      return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    },
    // "1000000" or "1.000.0000" -> "1.000.000" / "10.000.000": thousands dots for an amount being typed.
    miles: function (v) { return String(v).replace(/\D/g, '').replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.'); },
    // The line a tool shows next to its source when the rates are from an earlier month than today (Chile time); '' when current.
    viejo: function (asOf) {
      var ym = String(asOf == null ? '' : asOf);
      return /^\d{4}-\d{2}$/.test(ym) && ym < Shell.hoy().slice(0, 7) ? 'Datos de ' + Shell.mes(ym) + '. Pueden estar desactualizados.' : '';
    },
    // "2026-11" -> "noviembre 2026" (the month the rates are from).
    mes: function (ym) {
      var p = String(ym == null ? '' : ym).split('-'), m = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][+p[1] - 1];
      return m && p[0] ? m + ' ' + p[0] : String(ym == null ? '' : ym);
    },
    // "2026-11-17" -> "17-11-2026"
    fecha: function (iso) { var p = String(iso == null ? '' : iso).split('-'); return p.length === 3 ? p[2] + '-' + p[1] + '-' + p[0] : String(iso == null ? '' : iso); },
    // Official pages the tools cite, each the page its data really comes from (data/indicadores.json "source", api-php/lib/uf_rate.php, the SII guide links).
    fuentes: { 'Previred': 'https://www.previred.com/indicadores-previsionales/', 'mindicador.cl': 'https://mindicador.cl/', 'SII': 'https://www.sii.cl/' },
    // Escaped text where the first mention of each official source is a link that opens in a new tab.
    fuente: function (text) {
      var h = Shell.esc(text);
      Object.keys(Shell.fuentes).forEach(function (k) {
        h = h.replace(new RegExp('(^|[^\\w.])(' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')(?![\\w])'), function (m, pre, name) {
          return pre + '<a href="' + Shell.fuentes[k] + '" target="_blank" rel="noopener">' + name + '</a>';
        });
      });
      return h;
    },
    esc: function (s) {
      var d = document.createElement('div');
      d.textContent = s == null ? '' : String(s);
      return d.innerHTML.replace(/"/g, '&quot;');
    },
    // localStorage, namespaced per app; private mode or a full disk must not break the page.
    load: function (key, def) {
      try { var v = localStorage.getItem(app + '.' + key); return v == null ? def : JSON.parse(v); } catch (e) { return def; }
    },
    save: function (key, val) {
      try { localStorage.setItem(app + '.' + key, JSON.stringify(val)); return true; } catch (e) { return false; }
    },
    // Every message the app writes carries one quiet line with its link: that is how the next person finds it.
    firma: function (text) { return firmaOn ? text + '\n\n' + name + ', gratis: ' + url : text; },
    wa: function (text) { return 'https://wa.me/?text=' + encodeURIComponent(Shell.firma(text)); },
    copy: function (text) {
      return navigator.clipboard ? navigator.clipboard.writeText(text).then(function () { return true; }, function () { return false; }) : Promise.resolve(false);
    },
    // Save a text file. iOS (Safari and the app's web view) ignores <a download>, so there the
    // file goes to the share sheet: Save to Files, Mail, WhatsApp, or Calendar for an .ics.
    download: function (name, text, type) {
      var file = null, ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      if (plug.Filesystem && plug.Share) {
        plug.Filesystem.writeFile({ path: name, data: text, directory: 'CACHE', encoding: 'utf8' })
          .then(function (r) { return plug.Share.share({ title: name, files: [r.uri] }); }).catch(quiet);
        return;
      }
      try { file = new File([text], name, { type: type }); } catch (e) { /* old browser: anchor below */ }
      if (ios && file && navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file] }).catch(function () {});
        return;
      }
      // iOS web without file sharing: the download attribute is ignored, so show the content in a tab to read or copy.
      if (ios && !(file && navigator.canShare && navigator.canShare({ files: [file] }))) {
        window.open(URL.createObjectURL(new Blob([text], { type: type })), '_blank');
        return;
      }
      var a = document.createElement('a'), url = URL.createObjectURL(new Blob([text], { type: type }));
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    },
    // Print the page; in the iOS app, share `text` (Mail, Notes, WhatsApp, or Print from there).
    print: function (text) {
      if (!native) window.print();
      else if (plug.Share) plug.Share.share({ text: text }).catch(quiet);
      else if (navigator.share) navigator.share({ text: text }).catch(quiet);
    },
    $: function (sel, root) { return (root || document).querySelector(sel); },
    $$: function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); },
  };
  window.Shell = Shell;
  // The person can keep the app's link out of their messages. Read before any app script runs.
  // Off unless the person turned it on: a saved choice (either way) is always honoured.
  firmaOn = Shell.load('firma', false) === true;
  var sw = document.getElementById('firma');
  if (sw) {
    sw.checked = firmaOn;
    // Links already on the page were built with the old setting: add or strip the line in place
    // (a reload would wipe what the person typed).
    sw.addEventListener('change', function () {
      var tail = encodeURIComponent('\n\n' + name + ', gratis: ' + url);
      Shell.save('firma', firmaOn = sw.checked);
      Shell.$$('a[href*="wa.me/"]').forEach(function (a) {
        var h = a.getAttribute('href'), has = h.slice(-tail.length) === tail;
        if (firmaOn !== has) a.setAttribute('href', firmaOn ? h + tail : h.slice(0, -tail.length));
      });
    });
  }
  document.addEventListener('input', function (ev) {
    var t = ev.target, v = t.value;
    // Only plain amounts, and only while typing at the end: never move the caret under the person's finger.
    if (t.placeholder !== '$' || !/^[\d.]+$/.test(v) || t.selectionStart !== v.length) return;
    var f = Shell.miles(v);
    if (f !== v) t.value = f;
  }, true);
  // A number field with text that is neither Chilean nor plain format gets one line saying so, instead of a result built on a silent 0.
  // Flagged when the field is left (change), not on every key: "1.500." on the way to "1.500.000" is not an error.
  function numHint(ev) {
    var t = ev.target, lab = t.parentNode, e;
    if (!t.matches || !t.matches('input[inputmode=decimal],input[inputmode=numeric]') || !lab || lab.tagName !== 'LABEL') return;
    e = lab.querySelector('.nerr');
    if (!Shell.numMal(t.value)) { if (e) e.remove(); t.removeAttribute('aria-invalid'); return; }
    if (ev.type !== 'change') return;
    if (!e) { e = document.createElement('small'); e.className = 'nerr bad'; e.setAttribute('role', 'alert'); lab.appendChild(e); }
    e.textContent = 'No entendí ese número. Usa punto para los miles y coma para los decimales.';
    t.setAttribute('aria-invalid', 'true');
  }
  document.addEventListener('input', numHint);
  document.addEventListener('change', numHint);
  // Backup: everything an app keeps lives in this browser only (Safari may clear it after a week
  // unused, and a home-screen install starts empty), so the person can carry it in a file.
  var bkOut = document.getElementById('bkOut');
  if (bkOut) {
    var bkFile = document.getElementById('bkFile'), bkMsg = document.getElementById('bkMsg'), pre = app + '.';
    bkOut.addEventListener('click', function () {
      var d = {};
      try {
        for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k.indexOf(pre) === 0) d[k.slice(pre.length)] = localStorage.getItem(k); }
      } catch (e) { /* private mode: nothing stored */ }
      if (!Object.keys(d).length) { bkMsg.textContent = 'Todavía no hay nada guardado en este dispositivo.'; return; }
      bkMsg.textContent = '';
      Shell.download(app + '-respaldo-' + Shell.hoy() + '.json', JSON.stringify({ app: app, fecha: Shell.hoy(), datos: d }), 'application/json');
    });
    document.getElementById('bkIn').addEventListener('click', function () { bkFile.click(); });
    bkFile.addEventListener('change', function () {
      var f = bkFile.files[0], r = new FileReader();
      if (!f) return;
      r.onload = function () {
        try {
          var j = JSON.parse(r.result), keys = Object.keys(j.datos);
          if (j.app !== app || !keys.length || keys.some(function (k) { return typeof j.datos[k] !== 'string'; })) throw new Error('otro');
          if (!window.confirm('¿Restaurar el respaldo del ' + Shell.fecha(j.fecha) + '? Reemplaza lo que hay ahora en este dispositivo.')) return;
          keys.forEach(function (k) { localStorage.setItem(pre + k, j.datos[k]); });
          location.reload();
        } catch (e) { bkMsg.textContent = 'Ese archivo no es un respaldo de esta app, o no se pudo guardar.'; }
      };
      r.readAsText(f); bkFile.value = '';
    });
  }
  // iOS app: the rates in the bundle are frozen at build time. Fetch this month's copy from the
  // site and keep it; data.js picks it up on the next open when it is newer than the baked one.
  // dongaston.com serves the same data.js as <app>.fracmo.ai and is already in the app's CSP, so the app talks to one host for this.
  if (native && document.querySelector('script[src^="data.js"]')) {
    fetch('https://dongaston.com/apps/' + app + '/data.js?d=' + Shell.hoy()).then(function (r) { return r.ok ? r.text() : ''; }).then(function (t) {
      var ind = JSON.parse(t.slice(t.indexOf('{'), t.indexOf(';\n'))).indicadores;
      if (ind && /^\d{4}-\d{2}$/.test(ind.asOf) && ind.uf > 0) localStorage.setItem('appdata.indicadores', JSON.stringify(ind));
    }).catch(quiet);
  }
  // Opt-in notice list. The only thing an app ever sends to a server, and only on submit.
  var lead = document.getElementById('leadForm');
  if (lead) lead.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var done = function () {
      var p = document.createElement('p'); p.className = 'ok'; p.textContent = 'Listo. Te escribimos solo cuando haya novedades.';
      lead.textContent = ''; lead.appendChild(p);
    };
    // Honeypot filled: a bot. Look successful, send nothing.
    if (document.getElementById('leadHp').value) return done();
    var btn = lead.querySelector('button[type=submit]'), msg = document.getElementById('leadMsg');
    msg.textContent = ''; btn.disabled = true; btn.textContent = 'Enviando…';
    fetch('https://netwebmedia.com/api/public/forms/submit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ form_id: 'apps-chile', data: {
        email: document.getElementById('leadEmail').value.trim(), app: app, consent: 'yes',
        negocio: document.getElementById('leadBiz').checked ? 'si' : 'no',
        lead_type: 'apps-chile', source: 'dongaston/apps/' + app, lang: 'es', landing_page: url,
        nwm_website: document.getElementById('leadHp').value
      } })
    }).then(function (r) {
      if (!r.ok) throw new Error('http ' + r.status);
      // A 200 can still carry an error body; a body that is not JSON or has no marker counts as success.
      return r.json().catch(function () { return null; });
    }).then(function (j) {
      if (j && (j.error || j.ok === false || j.success === false)) throw new Error('rejected');
      done();
    }).catch(function () {
      btn.disabled = false; btn.textContent = 'Avísame';
      msg.textContent = 'No pudimos guardar tu correo. Revisa tu conexión e inténtalo de nuevo.';
    });
  });
  if (native) {
    Shell.$$('button').forEach(function (b) { if (/^Imprimir/.test(b.textContent.trim())) b.textContent = 'Compartir para imprimir'; });
  }
  var share = document.getElementById('share');
  if (share) {
    share.addEventListener('click', function () {
      var text = meta('meta[property="og:title"]', 'content');
      if (plug.Share) plug.Share.share({ title: name, text: text, url: url }).catch(quiet);
      else if (navigator.share) navigator.share({ title: name, text: text, url: url }).catch(quiet);
      else window.open('https://wa.me/?text=' + encodeURIComponent(text + ' ' + url), '_blank', 'noopener');
    });
  }
  // Android and desktop Chrome offer an install prompt; iOS has none (Share > Add to Home Screen).
  var btn = document.getElementById('install'), prompt = null;
  if (btn) {
    window.addEventListener('beforeinstallprompt', function (ev) { ev.preventDefault(); prompt = ev; btn.hidden = false; });
    btn.addEventListener('click', function () { if (prompt) { prompt.prompt(); prompt = null; btn.hidden = true; } });
    window.addEventListener('appinstalled', function () { btn.hidden = true; });
  }
  if ('serviceWorker' in navigator && !native && document.documentElement.hasAttribute('data-app')) {
    // Absolute path from the canonical folder: "sw.js" would resolve to /apps/sw.js without the trailing slash.
    // Skipped in the iOS app (capacitor:// origin, and build-www strips sw.js).
    var dir = url.replace(/^https?:\/\/[^\/]+/, '').replace(/[^\/]*$/, '');
    navigator.serviceWorker.register(dir + 'sw.js', { scope: dir }).catch(function () {});
  }
})();
