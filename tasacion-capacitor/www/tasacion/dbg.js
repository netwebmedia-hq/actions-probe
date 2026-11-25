(function () {
  // Debug readout for the P1 header-fix verification. Test copy only, never part of the product.
  try {
    var pr = document.createElement('div');
    pr.style.cssText = 'position:fixed;visibility:hidden;left:0;top:0;padding-top:env(safe-area-inset-top)';
    document.body.appendChild(pr);
    var b = document.createElement('div');
    b.style.cssText = 'position:fixed;left:4px;top:130px;z-index:99999;font:11px/1.2 monospace;background:#000;color:#0f0;padding:3px;pointer-events:none;white-space:pre';
    document.body.appendChild(b);
    var f = function (n) { return typeof n === 'number' ? Math.round(n * 10) / 10 : n; };
    setInterval(function () {
      var v = window.visualViewport, h = document.querySelector('header.top');
      var cm = document.getElementById('tComuna'); var r = h ? h.getBoundingClientRect() : null, cs = h ? getComputedStyle(h) : null;
      if (v) b.style.top = (v.offsetTop + 130) + 'px';
      b.textContent = [
        'vot ' + (v ? f(v.offsetTop) : '-'), 'vpt ' + (v ? f(v.pageTop) : '-'),
        'vh ' + (v ? f(v.height) : '-'), 'ih ' + innerHeight, 'sy ' + f(scrollY),
        'pp ' + getComputedStyle(pr).paddingTop,
        'ht ' + (r ? f(r.top) : '-'), 'hh ' + (r ? f(r.height) : '-'),
        'hpt ' + (cs ? cs.paddingTop : '-'), 'htr ' + (cs ? cs.transform : '-'),
        'cmh ' + (cm ? f(cm.getBoundingClientRect().height) : '-'), 'cmo ' + (cm ? cm.options.length : '-'), 'sel ' + ['tComuna','tBeds','tBaths','tPark','tEstado'].map(function (id) { var e = document.getElementById(id); return e ? getComputedStyle(e.parentElement).display.charAt(0) : '-'; }).join(' ')
      ].join('\n');
    }, 300);
  } catch (e) {}
})();
