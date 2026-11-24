"""Marpolis tasación: add to the home screen from real Mobile Safari (iOS Simulator), launch it, go offline.

Taps go through idb. Each step logs one JSON line (labels seen on screen included) and saves a
screenshot, so a wrong tap shows up in the artifact and the next run can be corrected.
Usage: python install_explore.py <simulator-udid>
"""
import json, os, re, socket, subprocess, sys, time

UDID = sys.argv[1]
URL = 'https://marpolis.com/tasacion.html'
OUT = 'out-install'
os.makedirs(OUT, exist_ok=True)
LOG = open(os.path.join(OUT, 'steps.jsonl'), 'w', encoding='utf8')
N = [0]


def sh(args, **kw):
    return subprocess.run(args, capture_output=True, timeout=kw.pop('timeout', 90), **kw)


def shot(name):
    sh(['xcrun', 'simctl', 'io', UDID, 'screenshot', os.path.join(OUT, name + '.png')])


def elements():
    try:
        r = sh(['idb', 'ui', 'describe-all', '--udid', UDID], timeout=40)
    except Exception as ex:
        return {'error': repr(ex)[:200]}
    try:
        return json.loads(r.stdout.decode('utf8', 'replace'))
    except Exception:
        return {'error': (r.stderr or r.stdout).decode('utf8', 'replace')[:300]}


def label_of(e):
    return ' '.join(str(e.get(k) or '') for k in ('AXLabel', 'title', 'AXValue')).strip()


def find(els, patterns):
    if not isinstance(els, list):
        return None
    for p in patterns:
        for e in els:
            if re.search(p, label_of(e), re.I) and e.get('frame'):
                return e
    return None


def tap(x, y):
    return sh(['idb', 'ui', 'tap', '--udid', UDID, str(int(x)), str(int(y))]).returncode


def step(name, patterns=None, fallback=None, wait=3, action=None):
    """Tap the first element whose label matches; else the fallback point; log what was on screen."""
    N[0] += 1
    name = '%02d-%s' % (N[0], name)
    res = {'step': name}
    try:
        els = elements()
        res['labels'] = sorted({label_of(e)[:40] for e in els if label_of(e)})[:80] if isinstance(els, list) else els
        if action:
            res['action'] = action()
        elif patterns:
            e = find(els, patterns)
            if e:
                f = e['frame']
                res['tapped'] = [label_of(e)[:40], f]
                tap(f['x'] + f['width'] / 2, f['y'] + f['height'] / 2)
            elif fallback:
                res['tapped'] = ['fallback', fallback]
                tap(*fallback)
            else:
                res['tapped'] = None
    except Exception as ex:
        res['error'] = repr(ex)[:400]
    time.sleep(wait)
    shot(name)
    LOG.write(json.dumps(res, ensure_ascii=False) + '\n'); LOG.flush()
    print(json.dumps(res, ensure_ascii=False)[:1200], flush=True)
    return res


def pf_block():
    ips = sorted({ai[4][0] for h in ('marpolis.com', 'netwebmedia.com') for ai in socket.getaddrinfo(h, 443)})
    sh(['sudo', 'pfctl', '-f', '-'], input=('block return quick from any to { %s }\n' % ', '.join(ips)).encode())
    sh(['sudo', 'pfctl', '-e'])
    return ips


print('openurl', sh(['xcrun', 'simctl', 'openurl', UDID, URL]).returncode, flush=True)
time.sleep(15)
for _ in range(8):  # the accessibility service needs a while after Safari's first launch
    if isinstance(elements(), list):
        break
    time.sleep(8)
step('safari-open', wait=1)
step('system-dialog', [r"^Don.t Allow$", r'^Not Now$'], None, wait=2)
step('close-safari-tip', [r'^Close$', r'^dismiss popup$'], (383, 659), wait=3)
# The page's own consent bar sits over the bottom of the page: refuse, so it is out of the screenshots.
step('page-consent', [r'^Rechazar', r'Solo necesarias', r'^Aceptar'], None, wait=2)
step('page-install-pill', [r'^Instalar'], None, wait=2)
step('safari-more', [r'^More$', r'^Page Menu$'], (362, 855), wait=4)
step('share', [r'^Share$', r'^Share\W', r'^Compartir'], None, wait=5)
step('share-sheet-scroll', action=lambda: sh(['idb', 'ui', 'swipe', '--udid', UDID, '210', '760', '210', '300']).returncode, wait=3)
step('add-to-home', [r'Add to Home Screen', r'Agregar a inicio'], None, wait=4)
step('confirm-add', [r'^Add$', r'^Agregar$'], None, wait=6)
step('home', action=lambda: sh(['idb', 'ui', 'button', '--udid', UDID, 'HOME']).returncode, wait=4)
step('launch-icon', [r'Tasaci'], None, wait=12)
step('launched', wait=2)
step('cut-network', action=pf_block, wait=2)
step('home-again', action=lambda: sh(['idb', 'ui', 'button', '--udid', UDID, 'HOME']).returncode, wait=3)
step('end-web-app', action=lambda: [sh(['xcrun', 'simctl', 'terminate', UDID, b]).returncode
                                    for b in ('com.apple.webapp', 'com.apple.mobilesafari')], wait=3)
step('relaunch-offline', [r'Tasaci'], None, wait=15)
step('offline-state', wait=2)
step('restore-network', action=lambda: sh(['sudo', 'pfctl', '-d']).returncode, wait=1)
