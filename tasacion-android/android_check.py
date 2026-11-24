"""Marpolis tasación app in real Chrome on an Android emulator (adb + Chrome DevTools over a forwarded socket).

Public page only. The lead/contact form is never touched. Each step logs one JSON line to out/steps.jsonl
and saves a screenshot, and a failed step never stops the later ones.
"""
import json, os, re, subprocess, sys, time, urllib.request
import xml.etree.ElementTree as ET

import websocket

URL = 'https://marpolis.com/tasacion.html'
PKG = 'com.android.chrome'
OUT = 'tasacion-android/out'
os.makedirs(OUT, exist_ok=True)
LOG = open(os.path.join(OUT, 'steps.jsonl'), 'w', encoding='utf8')
STATE = {'installed': False, 'icon': None}


def adb(*a, timeout=90, raw=False):
    r = subprocess.run(['adb'] + list(a), capture_output=True, timeout=timeout)
    return r.stdout if raw else r.stdout.decode('utf8', 'replace')


def sh(cmd, timeout=90):
    return adb('shell', cmd, timeout=timeout).strip()


def shot(name):
    try:
        open(os.path.join(OUT, name + '.png'), 'wb').write(adb('exec-out', 'screencap', '-p', raw=True))
    except Exception as e:
        print('screenshot failed', name, e, flush=True)


def step(name, fn, screenshot=True):
    try:
        res = {'step': name, 'ok': True, 'result': fn()}
    except Exception as e:  # keep going: later steps still tell us something
        res = {'step': name, 'ok': False, 'error': repr(e)[:700]}
    LOG.write(json.dumps(res, ensure_ascii=False) + '\n'); LOG.flush()
    print(json.dumps(res, ensure_ascii=False)[:1800], flush=True)
    if screenshot:
        shot(name)
    return res


# ---------- uiautomator ----------
def ui(save=None):
    for _ in range(4):
        adb('shell', 'uiautomator', 'dump', '/sdcard/ui.xml', timeout=60)
        x = adb('exec-out', 'cat', '/sdcard/ui.xml', timeout=30)
        if '<hierarchy' in x:
            if save:
                open(os.path.join(OUT, save + '.xml'), 'w', encoding='utf8').write(x)
            nodes = []
            for n in ET.fromstring(x[x.index('<hierarchy'):]).iter('node'):
                m = re.match(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', n.get('bounds', ''))
                if m:
                    x1, y1, x2, y2 = map(int, m.groups())
                    nodes.append({'text': n.get('text', ''), 'desc': n.get('content-desc', ''), 'id': n.get('resource-id', ''),
                                  'pkg': n.get('package', ''), 'cx': (x1 + x2) // 2, 'cy': (y1 + y2) // 2, 'w': x2 - x1, 'h': y2 - y1})
            return nodes
        time.sleep(2)
    return []


def find(nodes, pat):
    rx = re.compile(pat, re.I)
    return [n for n in nodes if rx.search(n['text']) or rx.search(n['desc'])]


def tap_text(pat, save=None, nodes=None):
    nodes = nodes or ui(save)
    hits = [n for n in find(nodes, pat) if n['h'] > 0]
    if not hits:
        return None
    n = hits[-1] if 'Install' in pat else hits[0]
    sh('input tap %d %d' % (n['cx'], n['cy']))
    return {'text': n['text'] or n['desc'], 'xy': [n['cx'], n['cy']]}


DIALOG = r'^(Use without an account|No,? thanks|Not now|Skip|Got it|Don.t allow|Accept & continue|Accept and continue|Dismiss|Maybe later)$'


def dialogs(tag):
    tapped = []
    for i in range(3):
        nodes = ui('ui-%s-%d' % (tag, i))
        hit = [n for n in nodes if re.search(DIALOG, n['text'].strip(), re.I) or re.search(DIALOG, n['desc'].strip(), re.I)]
        if not hit:
            break
        shot('dialog-%s-%d' % (tag, i))
        tapped.append(hit[0]['text'] or hit[0]['desc'])
        sh('input tap %d %d' % (hit[0]['cx'], hit[0]['cy']))
        time.sleep(2)
    return tapped


# ---------- CDP ----------
class Page:
    def __init__(self, ws_url, timeout=70):
        self.ws = websocket.create_connection(ws_url, timeout=timeout, suppress_origin=True)
        self.n = 0

    def call(self, method, **params):
        self.n += 1
        i = self.n
        self.ws.send(json.dumps({'id': i, 'method': method, 'params': params}))
        while True:
            m = json.loads(self.ws.recv())
            if m.get('id') == i:
                if 'error' in m:
                    raise RuntimeError('%s: %s' % (method, m['error']))
                return m['result']

    def ev(self, expr, wait=False, gesture=False):
        r = self.call('Runtime.evaluate', expression=expr, returnByValue=True, awaitPromise=wait, userGesture=gesture)
        if 'exceptionDetails' in r:
            raise RuntimeError(json.dumps(r['exceptionDetails'])[:500])
        return r['result'].get('value')

    def close(self):
        try:
            self.ws.close()
        except Exception:
            pass


def targets():
    return [t for t in json.load(urllib.request.urlopen('http://127.0.0.1:9222/json', timeout=15)) if t.get('type') == 'page']


def page(match='marpolis.com', tries=30):
    last = None
    for _ in range(tries):
        try:
            ts = [t for t in targets() if match in t['url']]
            last = [t['url'] for t in ts]
            for t in reversed(ts):  # restored background tabs never answer: take the visible one
                try:
                    pg = Page(t['webSocketDebuggerUrl'], timeout=8)
                    if pg.ev('document.visibilityState') == 'visible':
                        pg.ws.settimeout(70)
                        return pg
                    pg.close()
                except Exception as e:
                    last.append(repr(e)[:80])
        except Exception as e:
            last = repr(e)
            adb('forward', 'tcp:9222', 'localabstract:chrome_devtools_remote')  # re-arm after a Chrome crash
        time.sleep(2)
    raise RuntimeError('no page target for %s; saw %s' % (match, last))


def with_page(fn, match='marpolis.com'):
    p = page(match)
    try:
        return fn(p)
    finally:
        p.close()


def navigate(p, url, settle=5):
    p.call('Page.navigate', url=url)
    time.sleep(settle)


JS_ENV = r"""({ua: navigator.userAgent, url: location.href, title: document.title, sw: 'serviceWorker' in navigator, caches: 'caches' in window,
  standalone: matchMedia('(display-mode: standalone)').matches, onLine: navigator.onLine, w: innerWidth, h: innerHeight, dpr: devicePixelRatio,
  manifest: (document.querySelector('link[rel=manifest]')||{}).href,
  overflow: document.documentElement.scrollWidth > innerWidth})"""

JS_SW = r"""(async () => {
  const out = {};
  try {
    const reg = await Promise.race([navigator.serviceWorker.ready, new Promise(r => setTimeout(() => r(null), 25000))]);
    out.scope = reg && reg.scope; out.state = reg && reg.active && reg.active.state;
    for (let i = 0; i < 20 && !navigator.serviceWorker.controller; i++) await new Promise(r => setTimeout(r, 500));
    out.controller = navigator.serviceWorker.controller && navigator.serviceWorker.controller.scriptURL;
    const c = await caches.open('tasacion-v1'); const k = await c.keys();
    out.nkeys = k.length; out.keys = k.map(r => new URL(r.url).pathname + new URL(r.url).search);
    out.cacheNames = await caches.keys();
  } catch (e) { out.error = String(e); }
  return out;
})()"""

JS_BTN = r"""(() => { const b = document.getElementById('installBtn'); if (!b) return {exists: false};
  const r = b.getBoundingClientRect(); const cs = getComputedStyle(b);
  return {exists: true, hiddenAttr: b.hidden, display: cs.display, visible: r.width > 0 && r.height > 0 && cs.visibility !== 'hidden',
          text: b.innerText.trim(), w: Math.round(r.width), h: Math.round(r.height)}; })()"""

JS_SMALL = r"""(() => { const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
return [...document.querySelectorAll('button,select,summary,a.btn,.chip,.ix-nav a,.topbar a,.ix-link a,#misList a')]
  .filter(vis).map(e => ({t: (e.innerText || e.getAttribute('aria-label') || e.id || e.tagName).trim().slice(0, 30),
    h: Math.round(e.getBoundingClientRect().height * 10) / 10})).filter(x => x.h < 44); })()"""

JS_CALC = r"""(async () => {
  const out = {comunas: document.getElementById('fComuna').options.length};
  try {
    document.getElementById('fBuilt').value = 110;
    const l = document.getElementById('fLot'); if (l) l.value = 250;
    const a = document.getElementById('fAddress'); if (a) a.value = 'Calle Prueba QA 123';
    document.querySelector('.vfoot button[type=submit]').click();
    await new Promise(r => setTimeout(r, 6000));
    const g = id => document.getElementById(id);
    const show = id => { const e = g(id); return !!e && !e.hidden && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0; };
    out.resultOn = g('resultSec').classList.contains('on');
    out.text = g('resultSec').innerText.replace(/\s+/g, ' ').slice(0, 220);
    out.search = location.search; out.onLine = navigator.onLine;
    out.offTip = show('offTip'); out.offRes = show('offRes');
    out.mis = [...document.querySelectorAll('#misList a')].map(x => x.innerText.replace(/\n/g, ' | '));
    out.misRows = out.mis.length;
    out.overflow = document.documentElement.scrollWidth > innerWidth;
  } catch (e) { out.error = String(e); }
  return out;
})()"""

JS_NOTICES = r"""(() => { const show = id => { const e = document.getElementById(id); return !!e && !e.hidden && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0; };
  return {offTip: show('offTip'), offRes: show('offRes'), onLine: navigator.onLine, comunas: document.getElementById('fComuna') && document.getElementById('fComuna').options.length}; })()"""


# ---------- steps ----------
def s_device():
    d = {k: sh('getprop ' + p) for k, p in [('release', 'ro.build.version.release'), ('sdk', 'ro.build.version.sdk'),
                                            ('model', 'ro.product.model'), ('abi', 'ro.product.cpu.abi'), ('fingerprint', 'ro.build.fingerprint')]}
    d['chrome'] = sh('dumpsys package %s | grep -m1 versionName' % PKG)
    d['gms'] = sh('dumpsys package com.google.android.gms | grep -m1 versionName')
    d['playstore'] = bool(sh('pm list packages com.android.vending'))
    d['webview'] = sh('dumpsys package com.google.android.webview | grep -m1 versionName')
    d['screen'] = sh('wm size') + ' / ' + sh('wm density')
    if not sh('pm list packages %s' % PKG):
        raise RuntimeError('image has no Chrome: ' + str(d))
    return d


def s_launch():
    sh("echo '_ --disable-fre --no-default-browser-check --no-first-run --enable-remote-debugging' > /data/local/tmp/chrome-command-line")
    sh('chmod 755 /data/local/tmp/chrome-command-line')
    sh('am set-debug-app --persistent %s' % PKG)
    sh('am force-stop %s' % PKG)
    adb('forward', 'tcp:9222', 'localabstract:chrome_devtools_remote')
    sh('am start -a android.intent.action.VIEW -d %s %s' % (URL, PKG))
    time.sleep(8)
    tapped = dialogs('launch')
    p = page()
    p.close()
    return {'dialogs': tapped}


def s_env():
    return with_page(lambda p: p.ev(JS_ENV))


def s_sw():
    return with_page(lambda p: p.ev(JS_SW, wait=True))


def s_sw_reload():
    def f(p):
        navigate(p, URL)
        p2 = page()
        p.close()
        try:
            return p2.ev(JS_SW, wait=True)
        finally:
            p2.close()
    return with_page(f)


def s_manifest():
    def f(p):
        out = {}
        p.call('Page.enable')
        m = p.call('Page.getAppManifest')
        out['manifestUrl'] = m.get('url'); out['manifestErrors'] = m.get('errors')
        try:
            out['manifest'] = json.loads(m.get('data') or '{}')
        except Exception:
            out['manifestRaw'] = (m.get('data') or '')[:500]
        out['installabilityErrors'] = p.call('Page.getInstallabilityErrors').get('installabilityErrors')
        return out
    return with_page(f)


def s_btn():
    def f(p):
        for _ in range(15):
            r = p.ev(JS_BTN)
            if r.get('visible'):
                return r
            time.sleep(2)
        return r
    return with_page(f)


def s_small():
    return with_page(lambda p: p.ev(JS_SMALL))


def s_calc():
    return with_page(lambda p: p.ev(JS_CALC, wait=True))


def install_ui():
    """After the page's own button (or the Chrome menu) opened an install dialog: confirm it."""
    time.sleep(3)
    nodes = ui('ui-install-dialog')
    shot('install-dialog')
    texts = sorted({(n['text'] or n['desc']) for n in nodes if (n['text'] or n['desc'])})[:40]
    tapped = tap_text(r'^(Install|Add|Install app)$', nodes=nodes)
    return tapped, texts


def s_install():
    out = {}

    def f(p):
        navigate(p, URL)
        p2 = page()
        p.close()
        try:
            for _ in range(15):
                b = p2.ev(JS_BTN)
                if b.get('visible'):
                    break
                time.sleep(2)
            out['btnBefore'] = b
            if b.get('visible'):
                p2.ev("document.getElementById('installBtn').click()", gesture=True)
                out['via'] = 'page button'
        finally:
            p2.close()
    with_page(f)
    if 'via' not in out:
        out['via'] = 'chrome menu'
        out['menu'] = tap_text(r'Customize and control|More options')
        time.sleep(2)
        out['menuItem'] = tap_text(r'^(Install app|Add to Home screen)$', save='ui-menu')
        shot('menu-open')
    out['tapped'], out['dialogTexts'] = install_ui()
    # add-to-home dialogs from the launcher/Chrome: confirm "Add" if it appears
    time.sleep(8)
    out['second'] = tap_text(r'^(Add to home screen|Add automatically|Add)$', save='ui-install-2')
    shot('after-add-tap')
    time.sleep(10)
    out['webapk'] = sh('pm list packages | grep -i webapk')
    STATE['installed'] = True
    return out


def find_icon():
    for attempt in range(4):
        sh('input keyevent KEYCODE_HOME')
        time.sleep(4)
        nodes = ui('ui-home-%d' % attempt)
        hit = find(nodes, r'Tasaci')
        if hit:
            return nodes, hit
    sh('input swipe 540 1900 540 500 300')
    time.sleep(3)
    nodes = ui('ui-drawer')
    return nodes, find(nodes, r'Tasaci')


def s_find_icon():
    nodes, hit = find_icon()
    shot('home-icon-search')
    STATE['icon'] = bool(hit)
    if hit:
        STATE['xy'] = (hit[0]['cx'], hit[0]['cy'])
    open(os.path.join(OUT, 'dumpsys-shortcut.txt'), 'w', encoding='utf8').write(sh('dumpsys shortcut', timeout=60))
    diag = ''
    time.sleep(12)
    late = [n['text'] for n in ui('ui-home-late') if n['text']]
    return {'diag': diag[:1500], 'late': late, 'found': [(n['text'], n['desc'], n['cx'], n['cy']) for n in hit],
            'labels': sorted({n['text'] or n['desc'] for n in nodes if (n['text'] or n['desc'])})[:60]}


def s_launch_icon():
    # no HOME press here: step 10 left the launcher on the page that shows the icon
    if not STATE.get('xy'):
        raise RuntimeError('no icon coordinates from step 10')
    nodes = ui('ui-before-icon-tap')
    sh('input tap %d %d' % STATE['xy'])
    time.sleep(8)
    return {'xy': STATE['xy'], 'iconStillThere': bool(find(nodes, r'Tasaci'))}


def s_standalone():
    nodes = ui('ui-launched')
    out = {'resumed': sh('dumpsys activity activities | grep -m3 -E "mResumedActivity|topResumedActivity"'),
           'hasUrlBar': any('url_bar' in n['id'] or 'toolbar' in n['id'] for n in nodes),
           'ids': sorted({n['id'] for n in nodes if n['id']})[:25]}
    res = []
    for t in targets():
        if 'marpolis.com' in t['url']:
            p = Page(t['webSocketDebuggerUrl'])
            try:
                res.append({'url': t['url'], 'standalone': p.ev("matchMedia('(display-mode: standalone)').matches"),
                            'ref': p.ev("document.referrer")})
            finally:
                p.close()
    out['targets'] = res
    return out


def s_offline_on():
    sh('svc wifi disable'); sh('svc data disable')
    sh('cmd connectivity airplane-mode enable')
    time.sleep(6)
    return {'ping': sh('ping -c1 -W3 8.8.8.8; echo rc=$?'), 'wifi': sh('dumpsys wifi | grep -m1 "Wi-Fi is"')}


def s_offline_open():
    how = None
    sh('am force-stop %s' % PKG)
    time.sleep(4)  # killing the app drops the launcher to its home page without a HOME key (a 2nd HOME press loses the icon)
    nodes = ui('ui-offline-home')
    hit = find(nodes, r'Tasaci')
    shot('offline-home')
    if STATE['icon'] and hit:
        sh('input tap %d %d' % (hit[0]['cx'], hit[0]['cy']))
        how = 'installed icon'
    else:
        labels = [n['text'] for n in nodes if n['text']][:15]
        sh('am start -a android.intent.action.VIEW -d "%s?source=pwa" %s' % (URL, PKG))
        how = 'chrome url (icon not on home: %s)' % labels
    time.sleep(10)
    tapped = dialogs('offline')
    with_page(lambda p: None)
    return {'how': how, 'dialogs': tapped}


def s_offline_env():
    return with_page(lambda p: p.ev(JS_ENV))


def s_offline_calc():
    return with_page(lambda p: p.ev(JS_CALC, wait=True))


def s_offline_unvisited():
    def f(p):
        navigate(p, 'https://marpolis.com/pagina-nunca-vista.html', settle=6)
        p2 = page('')  # url may be chrome-error
        p.close()
        try:
            return p2.ev(r"""({url: location.href, title: document.title, text: document.body.innerText.replace(/\s+/g,' ').slice(0,300),
              btn: [...document.querySelectorAll('a,button')].map(e => e.innerText.trim()).filter(t => /Abrir la tasaci/i.test(t)),
              dino: !!document.querySelector('.offline, #main-frame-error')})""")
        finally:
            p2.close()
    return with_page(f)


def s_online():
    sh('cmd connectivity airplane-mode disable'); sh('svc wifi enable'); sh('svc data enable')
    time.sleep(8)
    return {'ping': sh('ping -c1 -W3 8.8.8.8; echo rc=$?')}


def s_logcat():
    open(os.path.join(OUT, 'logcat-chrome.txt'), 'w', encoding='utf8').write(
        adb('logcat', '-d', '-t', '800', 'chromium:I', 'WebApk:V', 'WebApkInstaller:V', 'cr_WebApk:V', '*:S', timeout=60))
    return 'saved'


step('00-device', s_device, screenshot=False)
step('01-chrome-launch', s_launch)
step('02-env', s_env)
step('03-worker-and-cache', s_sw)
step('03b-after-reload', s_sw_reload)
step('04-manifest-installability', s_manifest, screenshot=False)
step('05-install-button', s_btn)
step('06-small-targets-form', s_small, screenshot=False)
step('07-valuation-online', s_calc)
step('08-small-targets-result', s_small, screenshot=False)
step('09-install', s_install)
step('10-find-icon', s_find_icon)
step('11-launch-from-icon', s_launch_icon)
step('12-standalone', s_standalone)
step('13-network-off', s_offline_on)
step('14-offline-open', s_offline_open)
step('15-offline-env', s_offline_env)
step('16-offline-valuation', s_offline_calc)
step('17-offline-unvisited-page', s_offline_unvisited)
step('18-network-on', s_online)
step('19-logcat', s_logcat, screenshot=False)
