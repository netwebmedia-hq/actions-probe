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
def home():
    return sh(['idb', 'ui', 'button', '--udid', UDID, 'HOME']).returncode


def tap_icon():
    """Find the Tasación icon on whichever home page it is; tap it by its own frame."""
    seen = []
    for attempt in range(6):
        els = elements()
        e = find(els, ['Tasaci'])
        if e:
            f = e['frame']
            tap(f['x'] + f['width'] / 2, f['y'] + f['height'] / 2)
            return {'found_on_attempt': attempt + 1, 'frame': f}
        seen.append(sorted({label_of(x)[:18] for x in els if label_of(x)})[:6] if isinstance(els, list) else 'no dump')
        if attempt in (1, 3):
            sh(['idb', 'ui', 'swipe', '--udid', UDID, '360', '500', '60', '500'])
        time.sleep(4)
    return {'found': False, 'seen': seen}


def end_web_processes():
    """Simulator apps are host processes: end the web app and WebKit's helpers so the next launch is cold."""
    before = sh(['pgrep', '-lf', 'Web']).stdout.decode('utf8', 'replace')
    lines = [l for l in before.split('\n') if 'CoreSimulator' in l or 'Web.app' in l or 'WebKit' in l]
    codes = [sh(['pkill', '-f', p]).returncode for p in ('Web.app/Web', 'com.apple.WebKit.WebContent', 'com.apple.WebKit.Networking')]
    return {'matched': [l[-110:] for l in lines][:12], 'pkill': codes}


step('home', action=home, wait=5)
step('launch-icon', action=tap_icon, wait=28)  # long wait: the worker saves its 13 files on this first launch
step('launched-online', wait=2)
step('cut-network', action=pf_block, wait=2)
step('home-again', action=home, wait=4)
step('end-web-processes', action=end_web_processes, wait=8)
step('home-before-relaunch', action=home, wait=4)
step('relaunch-offline', action=tap_icon, wait=25)
step('offline-state', wait=2)
step('restore-network', action=lambda: sh(['sudo', 'pfctl', '-d']).returncode, wait=1)
