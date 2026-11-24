"""Marpolis tasación app in real Mobile Safari (iOS Simulator), driven by safaridriver.

Public page only, no form with personal data is sent. Each step logs one JSON line to out/steps.jsonl
and saves a simulator screenshot, and a failed step never stops the later ones.
Usage: python safari_check.py <simulator-udid>
"""
import json, os, socket, subprocess, sys, time

from selenium import webdriver

UDID = sys.argv[1]
URL = 'https://marpolis.com/tasacion.html'
OUT = 'out'
os.makedirs(OUT, exist_ok=True)
LOG = open(os.path.join(OUT, 'steps.jsonl'), 'w', encoding='utf8')


def shot(name):
    subprocess.run(['xcrun', 'simctl', 'io', UDID, 'screenshot', os.path.join(OUT, name + '.png')],
                   capture_output=True, timeout=60)


def step(name, fn):
    try:
        res = {'step': name, 'ok': True, 'result': fn()}
    except Exception as e:  # keep going: the next steps still tell us something
        res = {'step': name, 'ok': False, 'error': repr(e)[:600]}
    LOG.write(json.dumps(res, ensure_ascii=False) + '\n'); LOG.flush()
    print(json.dumps(res, ensure_ascii=False)[:1500], flush=True)
    shot(name)
    return res


def pf(ips):
    """Cut the simulator (it shares the host network) off from the site: every packet is refused."""
    rule = 'block return quick from any to { %s }\n' % ', '.join(ips)
    subprocess.run(['sudo', 'pfctl', '-f', '-'], input=rule.encode(), capture_output=True)
    subprocess.run(['sudo', 'pfctl', '-e'], capture_output=True)
    return subprocess.run(['sudo', 'pfctl', '-sr'], capture_output=True).stdout.decode()


opts = webdriver.SafariOptions()
opts.set_capability('platformName', 'iOS')
opts.set_capability('safari:useSimulator', True)
opts.set_capability('safari:deviceUDID', UDID)
d = None
for attempt in range(4):  # launching Safari in a cold simulator can time out
    try:
        d = webdriver.Safari(options=opts)
        break
    except Exception as e:
        print('session attempt', attempt + 1, 'failed:', repr(e)[:200], flush=True)
        time.sleep(20)
if d is None:
    sys.exit('no Safari session after 4 attempts')
d.set_script_timeout(40)
d.set_page_load_timeout(60)

JS_ENV = """return {ua: navigator.userAgent, sw: 'serviceWorker' in navigator, caches: 'caches' in window,
  standalone: navigator.standalone, onLine: navigator.onLine, w: innerWidth, h: innerHeight,
  manifest: (document.querySelector('link[rel=manifest]')||{}).href,
  overflow: document.documentElement.scrollWidth > innerWidth};"""

JS_SW = """const done = arguments[arguments.length - 1];
(async () => {
  const out = {};
  try {
    const reg = await Promise.race([navigator.serviceWorker.ready, new Promise(r => setTimeout(() => r(null), 25000))]);
    out.scope = reg && reg.scope; out.state = reg && reg.active && reg.active.state;
    for (let i = 0; i < 20 && !navigator.serviceWorker.controller; i++) await new Promise(r => setTimeout(r, 500));
    out.controller = navigator.serviceWorker.controller && navigator.serviceWorker.controller.scriptURL;
    const c = await caches.open('tasacion-v1'); const k = await c.keys();
    out.keys = k.map(r => new URL(r.url).pathname + new URL(r.url).search);
  } catch (e) { out.error = String(e); }
  done(out);
})();"""

JS_INSTALL = """const b = document.getElementById('installBtn'), t = document.getElementById('iosTip');
const r = b.getBoundingClientRect(); const before = getComputedStyle(t).display; b.click();
return {hidden: b.hidden, text: b.innerText.trim(), w: Math.round(r.width), h: Math.round(r.height),
  tipBefore: before, tipAfter: getComputedStyle(t).display, tip: t.innerText.trim()};"""

JS_SMALL = """const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
return [...document.querySelectorAll('button,select,summary,a.btn,.chip,.ix-nav a,.topbar a,.ix-link a,#misList a')]
  .filter(vis).map(e => ({t: (e.innerText || e.getAttribute('aria-label') || e.id || e.tagName).trim().slice(0, 30),
    h: Math.round(e.getBoundingClientRect().height * 10) / 10})).filter(x => x.h < 44);"""

JS_CALC = """const done = arguments[arguments.length - 1];
(async () => {
  const out = {comunas: document.getElementById('fComuna').options.length};
  try {
    document.getElementById('fBuilt').value = 110;
    const l = document.getElementById('fLot'); if (l) l.value = 250;
    const a = document.getElementById('fAddress'); if (a) a.value = 'Calle Prueba QA 123';
    document.querySelector('.vfoot button[type=submit]').click();
    await new Promise(r => setTimeout(r, 6000));
    const g = id => document.getElementById(id);
    const show = id => { const e = g(id); return !!e && !e.hidden && getComputedStyle(e).display !== 'none'; };
    out.resultOn = g('resultSec').classList.contains('on');
    out.value = (document.querySelector('#resultSec .ix-big, #resultSec .big, #rValue') || {}).innerText || '';
    out.text = g('resultSec').innerText.replace(/\\s+/g, ' ').slice(0, 220);
    out.search = location.search; out.onLine = navigator.onLine;
    out.offTip = show('offTip'); out.offRes = show('offRes');
    out.mis = [...document.querySelectorAll('#misList a')].map(x => x.innerText.replace(/\\n/g, ' | '));
    out.tabs = document.querySelectorAll('#ixNav a').length;
    out.overflow = document.documentElement.scrollWidth > innerWidth;
  } catch (e) { out.error = String(e); }
  done(out);
})();"""


def load(url):
    d.get(url); time.sleep(4)
    return {'title': d.title, 'url': d.current_url}


step('01-online-load', lambda: load(URL))
step('02-env', lambda: d.execute_script(JS_ENV))
step('03-worker-and-cache', lambda: d.execute_async_script(JS_SW))
step('04-install-pill-and-tip', lambda: d.execute_script(JS_INSTALL))
step('05-small-targets-form', lambda: d.execute_script(JS_SMALL))
step('06-valuation-online', lambda: d.execute_async_script(JS_CALC))
step('07-small-targets-result', lambda: d.execute_script(JS_SMALL))
step('08-reload-controlled', lambda: (load(URL), d.execute_async_script(JS_SW))[1])

ips = sorted({ai[4][0] for host in ('marpolis.com', 'netwebmedia.com') for ai in socket.getaddrinfo(host, 443)})
step('09-cut-network', lambda: {'ips': ips, 'rules': pf(ips)})
step('10-offline-open', lambda: load(URL + '?source=pwa'))
step('11-offline-env', lambda: d.execute_script(JS_ENV))
step('12-offline-valuation', lambda: d.execute_async_script(JS_CALC))
step('13-offline-unvisited-page', lambda: (load('https://marpolis.com/propiedades-nunca-vista.html'),
                                           d.execute_script("return document.body.innerText.slice(0,200)"))[1])
step('14-restore-network', lambda: subprocess.run(['sudo', 'pfctl', '-d'], capture_output=True).returncode)
step('15-online-again', lambda: (load(URL), d.execute_script(JS_ENV))[1])
try:
    d.quit()
except Exception:
    pass
