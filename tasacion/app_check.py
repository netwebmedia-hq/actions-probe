"""Apps Chile "Tasación" (https://tasacion.fracmo.ai/) in real Mobile Safari (iOS Simulator), driven by safaridriver.

Public page only; nothing is submitted. Each step logs one JSON line to out-app/steps.jsonl and saves a
simulator screenshot, and a failed step never stops the later ones.
Usage: python app_check.py <simulator-udid>
"""
import json, os, socket, subprocess, sys, time

from selenium import webdriver

UDID = sys.argv[1]
URL = 'https://tasacion.fracmo.ai/'
OUT = 'out-app'
os.makedirs(OUT, exist_ok=True)
LOG = open(os.path.join(OUT, 'steps.jsonl'), 'w', encoding='utf8')


def shot(name):
    try:
        subprocess.run(['xcrun', 'simctl', 'io', UDID, 'screenshot', os.path.join(OUT, name + '.png')],
                       capture_output=True, timeout=60)
    except Exception:
        pass


def step(name, fn):
    try:
        res = {'step': name, 'ok': True, 'result': fn()}
    except Exception as e:
        res = {'step': name, 'ok': False, 'error': repr(e)[:600]}
    LOG.write(json.dumps(res, ensure_ascii=False) + '\n'); LOG.flush()
    print(json.dumps(res, ensure_ascii=True)[:1500], flush=True)
    shot(name)
    return res


def pf(ips):
    rule = 'block return quick from any to { %s }\n' % ', '.join(ips)
    subprocess.run(['sudo', 'pfctl', '-f', '-'], input=rule.encode(), capture_output=True)
    subprocess.run(['sudo', 'pfctl', '-e'], capture_output=True)
    return subprocess.run(['sudo', 'pfctl', '-sr'], capture_output=True).stdout.decode()


opts = webdriver.SafariOptions()
opts.set_capability('platformName', 'iOS')
opts.set_capability('safari:useSimulator', True)
opts.set_capability('safari:deviceUDID', UDID)
d = None
for attempt in range(4):
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

JS_ENV = """return {ua: navigator.userAgent, title: document.title, w: innerWidth, h: innerHeight,
  h1: (document.querySelector('h1')||{}).innerText, comunas: document.querySelectorAll('#tComuna option').length,
  comuna: document.querySelector('#tComuna').value, logic: typeof window.AppLogic, shell: typeof window.Shell,
  overflow: document.documentElement.scrollWidth > innerWidth,
  sw: !!(navigator.serviceWorker && navigator.serviceWorker.controller)};"""

# Set the inputs the way a person does (value + input/change events), then read the result card.
JS_FILL = """const done = arguments[arguments.length - 1], a = arguments[0];
(async () => {
  const out = {};
  try {
    const ev = (el, t) => el.dispatchEvent(new Event(t, {bubbles: true}));
    const q = s => document.querySelector(s);
    const r = q('input[name="tTipo"][value="' + a.tipo + '"]'); r.checked = true; ev(r, 'change');
    q('#tComuna').value = a.comuna; ev(q('#tComuna'), 'change');
    for (const [id, v] of Object.entries(a.fields)) { const el = q(id); el.value = v; ev(el, 'input'); }
    await new Promise(res => setTimeout(res, a.wait || 3500));
    const show = id => { const e = q(id); return !!e && !e.hidden && getComputedStyle(e).display !== 'none'; };
    const vis = id => { const e = q(id); return !!e && !e.hidden; };
    out.shown = show('#tOut');
    out.live = q('.live-v').innerText + ' | ' + q('.live-s').innerText;
    out.uf = q('#tUf').innerText; out.clp = q('#tClp').innerText; out.rango = q('#tRango').innerText;
    out.conf = q('#tConf').innerText; out.m2 = q('#tM2').innerText; out.fuente = q('#tFuente').innerText;
    out.tabla = [...document.querySelectorAll('#tTabla tr')].map(t => t.innerText.replace(/\\s+/g, ' ')).slice(0, 8);
    out.campos = {built: vis('#tBuiltL'), lot: vis('#tLotL'), terr: vis('#tTerrL'), hab: vis('#tHab'), bod: vis('#tBodL'),
      park: vis('#tParkL'), estado: vis('#tEstadoL'), sector: vis('#tSectorL'),
      extras: [...document.querySelectorAll('#tExtras label:not([hidden])')].length};
    out.wa = decodeURIComponent(q('#tWa').href).slice(0, 220);
    out.overflow = document.documentElement.scrollWidth > innerWidth;
    q('#tOut').scrollIntoView({block: 'start'}); window.scrollBy(0, -80);
  } catch (e) { out.error = String(e); }
  done(out);
})();"""

JS_SMALL = """const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
return [...document.querySelectorAll('header a,header button,main button,main select,main input:not([type=checkbox]):not([type=radio]),main a.btn,main .seg label,main label.check,nav a,.tabs button')]
  .filter(vis).map(e => ({t: (e.innerText || e.getAttribute('aria-label') || e.id || e.tagName).trim().slice(0, 28),
    h: Math.round(e.getBoundingClientRect().height * 10) / 10, w: Math.round(e.getBoundingClientRect().width)})).filter(x => x.h < 44);"""

JS_CLIP = """const out = [];
for (const s of document.querySelectorAll('main select')) { const r = s.getBoundingClientRect(); if (!r.width) continue;
  const cs = getComputedStyle(s); out.push({id: s.id, h: Math.round(r.height), w: Math.round(r.width), font: cs.fontSize, lh: cs.lineHeight,
    pad: cs.paddingTop + '/' + cs.paddingBottom, text: (s.selectedOptions[0] || {}).text}); }
return out;"""

JS_STATE = """const q = s => document.querySelector(s);
return {tipo: (q('input[name="tTipo"]:checked')||{}).value, comuna: q('#tComuna').value, built: q('#tBuilt').value, lot: q('#tLot').value,
  shown: !q('#tOut').hidden, uf: q('#tUf').innerText, fuente: q('#tFuente').innerText, title: document.title,
  body: document.body.innerText.slice(0, 160)};"""

casa = {'tipo': 'casa', 'comuna': 'la-serena', 'fields': {'#tBuilt': '110', '#tLot': '250'}}


def load(url):
    d.get(url); time.sleep(5)
    return {'title': d.title, 'url': d.current_url}


step('01-load', lambda: load(URL))
step('02-env', lambda: d.execute_script(JS_ENV))
step('03-small-targets-empty', lambda: d.execute_script(JS_SMALL))
step('04-casa-la-serena', lambda: d.execute_async_script(JS_FILL, casa))
step('05-small-targets-result', lambda: d.execute_script(JS_SMALL))
step('06-selects', lambda: d.execute_script(JS_CLIP))
step('07-depto', lambda: d.execute_async_script(JS_FILL, {'tipo': 'departamento', 'comuna': 'nunoa', 'fields': {'#tBuilt': '70', '#tTerr': '8'}, 'wait': 1200}))
step('08-oficina', lambda: d.execute_async_script(JS_FILL, {'tipo': 'oficina', 'comuna': 'providencia', 'fields': {'#tBuilt': '60'}, 'wait': 1200}))
step('09-terreno', lambda: d.execute_async_script(JS_FILL, {'tipo': 'terreno', 'comuna': 'la-serena', 'fields': {'#tLot': '500'}, 'wait': 1200}))
step('10-casa-again', lambda: d.execute_async_script(JS_FILL, dict(casa, wait=1200)))
step('11-reload-restores', lambda: (load(URL), d.execute_script(JS_STATE))[1])
step('12-guide', lambda: (load(URL + 'guias/como-se-calcula-el-valor-de-una-propiedad/'),
                         d.execute_script("return {h1: document.querySelector('h1').innerText, overflow: document.documentElement.scrollWidth > innerWidth, len: document.body.innerText.length}"))[1])
step('13-back-to-tool', lambda: (load(URL), d.execute_script(JS_ENV))[1])

ips = sorted({ai[4][0] for host in ('tasacion.fracmo.ai', 'netwebmedia.com') for ai in socket.getaddrinfo(host, 443)})
step('14-cut-network', lambda: {'ips': ips, 'rules': pf(ips)})
step('15-offline-open', lambda: (load(URL), d.execute_script(JS_STATE))[1])
step('16-offline-valuation', lambda: d.execute_async_script(JS_FILL, dict(casa, wait=9500)))
step('17-restore-network', lambda: subprocess.run(['sudo', 'pfctl', '-d'], capture_output=True).returncode)
try:
    d.quit()
except Exception:
    pass
