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
NEVER = ['never-matches-any-label']  # fixed points: the label dump lags behind the screen
step('close-safari-tip', NEVER, (383, 659), wait=5)
step('safari-more', NEVER, (362, 855), wait=5)
step('share', NEVER, (222, 581), wait=7)
step('share-sheet-scroll', action=lambda: sh(['idb', 'ui', 'swipe', '--udid', UDID, '210', '760', '210', '300']).returncode, wait=5)
# The share sheet is not in the accessibility dump: after the swipe "Add to Home Screen" sits at (160, 655) pt.
step('add-to-home', NEVER, (160, 655), wait=6)
step('add-dialog', wait=1)
step('confirm-add', NEVER, (368, 120), wait=8)  # the blue Add button of the dialog
step('home', action=lambda: sh(['idb', 'ui', 'button', '--udid', UDID, 'HOME']).returncode, wait=4)
step('home-page-2', action=lambda: sh(['idb', 'ui', 'swipe', '--udid', UDID, '360', '500', '60', '500']).returncode, wait=4)
step('home-screen', wait=1)
step('launch-icon', ['Tasaci'], (259, 235), wait=28)  # long wait: the worker saves its 13 files now
step('launched', wait=2)
step('cut-network', action=pf_block, wait=2)
step('home-again', action=lambda: sh(['idb', 'ui', 'button', '--udid', UDID, 'HOME']).returncode, wait=3)
def reboot():
    # A cold start is the honest offline test: nothing of the web app is left in memory.
    a = sh(['xcrun', 'simctl', 'shutdown', UDID], timeout=120).returncode
    b = sh(['xcrun', 'simctl', 'boot', UDID], timeout=120).returncode
    c = sh(['xcrun', 'simctl', 'bootstatus', UDID, '-b'], timeout=240).returncode
    return [a, b, c]
step('reboot-simulator', action=reboot, wait=25)
step('home-after-reboot', wait=20)
step('home-page-2-again', action=lambda: sh(['idb', 'ui', 'swipe', '--udid', UDID, '360', '500', '60', '500']).returncode, wait=4)
step('home-page-2-retry', action=lambda: (0 if any('Tasaci' in label_of(e) for e in (elements() if isinstance(elements(), list) else [])) else sh(['idb', 'ui', 'swipe', '--udid', UDID, '360', '500', '60', '500']).returncode), wait=5)
step('home-screen-again', wait=1)
step('relaunch-offline', ['Tasaci'], (259, 235), wait=25)
step('offline-state', wait=2)
step('restore-network', action=lambda: sh(['sudo', 'pfctl', '-d']).returncode, wait=1)
