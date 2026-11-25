(function () {
  // Debug harness for the WhatsApp / Copiar / share probe. Test copy only, never part of the product.
  try {
    var st = { vc: 0, ph: 0, ps: 0, bl: 0, fo: 0, cw: 0, cc: 0, cs: 0 };
    var $ = function (id) { return document.getElementById(id); };
    var f = function (n) { return Math.round(n); };
    document.addEventListener('visibilitychange', function () { st.vc++; });
    addEventListener('pagehide', function () { st.ph++; });
    addEventListener('pageshow', function () { st.ps++; });
    addEventListener('blur', function () { st.bl++; });
    addEventListener('focus', function () { st.fo++; });
    document.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('#tWa,#tCopy,#share') : null;
      if (t) st[t.id === 'tWa' ? 'cw' : t.id === 'tCopy' ? 'cc' : 'cs']++;
    }, true);

    var b = document.createElement('div');
    b.style.cssText = 'position:fixed;left:4px;top:130px;max-width:190px;word-break:break-all;z-index:99999;font:10px/1.2 monospace;background:#000;color:#0f0;padding:3px;pointer-events:none;white-space:pre-wrap';
    document.body.appendChild(b);
    var rect = function (el) { if (!el) return '-'; var r = el.getBoundingClientRect(); return f(r.left) + ',' + f(r.top) + ',' + f(r.width) + ',' + f(r.height); };

    var auto = false;
    setTimeout(function () {
      var bu = $('tBuilt'), lo = $('tLot');
      bu.value = '110'; bu.dispatchEvent(new Event('input', { bubbles: true }));
      lo.value = '250'; lo.dispatchEvent(new Event('input', { bubbles: true }));
      auto = true;
    }, 4000);
    setInterval(function () { if (auto && $('tWa')) $('tWa').scrollIntoView({ block: 'center' }); }, 3000);

    setInterval(function () {
      var v = window.visualViewport;
      if (v) b.style.top = (v.offsetTop + 130) + 'px';
      b.textContent = [
        'wa ' + rect($('tWa')), 'cp ' + rect($('tCopy')),
        'hr ' + ($('tWa') ? $('tWa').href.slice(0, 80) : '-'),
        'url ' + location.href.slice(-30), 'vis ' + document.visibilityState,
        'vc' + st.vc + ' ph' + st.ph + ' ps' + st.ps + ' bl' + st.bl + ' fo' + st.fo,
        'clk wa' + st.cw + ' cp' + st.cc + ' sh' + st.cs,
        'clip ' + (navigator.clipboard ? 'y' : 'n') + (window.isSecureContext ? 's' : '-'),
        'vot ' + (v ? f(v.offsetTop) : '-') + ' sy ' + f(scrollY) + ' cpt ' + ($('tCopy') ? $('tCopy').textContent.trim() : '-')
      ].join('\n');
    }, 300);
  } catch (e) {}
})();
