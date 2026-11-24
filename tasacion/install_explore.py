"""Marpolis tasación: add to the home screen from real Mobile Safari (iOS Simulator), launch it, go offline.

Taps go through idb. Safari's own controls are found by their accessibility label and waited for;
the share sheet is not in the label dump, so those taps use fixed points and a pixel check tells
whether the "Add to Home Screen" dialog really opened. Each step logs one JSON line and a screenshot.
Usage: python install_explore.py <simulator-udid>
"""
import json, os, re, socket, subprocess, sys, time

from PIL import Image

UDID = sys.argv[1]
URL = 'https://marpolis.com/tasacion.html'
OUT = 'out-install'
os.makedirs(OUT, exist_ok=True)
LOG = open(os.path.join(OUT, 'steps.jsonl'), 'w', encoding='utf8')
N = [0]


def sh(args, **kw):
    try:
        return subprocess.run(args, capture_output=True, timeout=kw.pop('timeout', 60), **kw)
    except subprocess.TimeoutExpired:
        return subprocess.CompletedProcess(args, 124, b'', b'timeout')


def shot(name):
    path = os.path.join(OUT, name + '.png')
    sh(['xcrun', 'simctl', 'io', UDID, 'screenshot', path])
    return path


def elements():
    r = sh(['idb', 'ui', 'describe-all', '--udid', UDID], timeout=40)
    try:
        v = json.loads(r.stdout.decode('utf8', 'replace'))
        return v if isinstance(v, list) else []
    except Exception:
        return []


def label_of(e):
    return ' '.join(str(e.get(k) or '') for k in ('AXLabel', 'title', 'AXValue')).strip()


def labels():
    return sorted({label_of(e)[:28] for e in elements() if label_of(e)})[:14]


def find(pattern, els=None):
    for e in (els if els is not None else elements()):
        if re.search(pattern, label_of(e), re.I) and e.get('frame'):
            return e
    return None


def tap(x, y):
    return sh(['idb', 'ui', 'tap', '--udid', UDID, str(int(x)), str(int(y))]).returncode


def tap_el(e):
    f = e['frame']
    return tap(f['x'] + f['width'] / 2, f['y'] + f['height'] / 2)


def wait_for(pattern, seconds=60):
    end = time.time() + seconds
    while time.time() < end:
        e = find(pattern)
        if e:
            return e
        time.sleep(3)
    return None


def log(name, **data):
    N[0] += 1
    name = '%02d-%s' % (N[0], name)
    data = dict(step=name, **data)
    data['shot'] = os.path.basename(shot(name))
    LOG.write(json.dumps(data, ensure_ascii=False) + '\n'); LOG.flush()
    print(json.dumps(data, ensure_ascii=True)[:900], flush=True)
    return data


def home():
    return sh(['idb', 'ui', 'button', '--udid', UDID, 'HOME']).returncode


def swipe(x1, y1, x2, y2):
    return sh(['idb', 'ui', 'swipe', '--udid', UDID, str(x1), str(y1), str(x2), str(y2)]).returncode


def add_dialog_open(path):
    """The dialog's "Open as Web App" switch is green at (349, 328) pt = (1048, 984) px; other sheets are grey there."""
    try:
        r, g, b = Image.open(path).convert('RGB').getpixel((1048, 984))
        return bool(g > 150 and r < 130 and b < 160), [r, g, b]
    except Exception as ex:
        return False, repr(ex)[:80]


def open_share_sheet():
    """Close Safari's first-run tip if it is up, then More -> Share, each waited for by label."""
    seen = {}
    e = wait_for(r'^(Close|More)$', 90)
    seen['first'] = e and label_of(e)
    if e and re.match('Close', label_of(e)):
        tap_el(e); time.sleep(3)
    e = wait_for(r'^More$', 40)
    if not e:
        return dict(seen, error='no More button', labels=labels())
    tap_el(e)
    e = wait_for(r'^Share$', 30)
    if not e:
        return dict(seen, error='menu did not open', labels=labels())
    tap_el(e)
    # The sheet belongs to another process: it is up once Safari's own controls leave the dump.
    end = time.time() + 30
    while time.time() < end and find(r'^(Share|More)$'):
        time.sleep(2)
    time.sleep(4)
    return dict(seen, ok=True)


def install():
    for attempt in range(3):
        t = {'attempt': attempt + 1, 'sheet': open_share_sheet()}
        log('share-sheet-%d' % (attempt + 1), **t)
        if t['sheet'].get('ok'):
            swipe(210, 760, 210, 300); time.sleep(5)
            log('sheet-expanded-%d' % (attempt + 1))
            tap(160, 655); time.sleep(6)          # "Add to Home Screen" in the expanded sheet
            opened, px = add_dialog_open(shot('probe'))
            log('after-add-to-home-%d' % (attempt + 1), dialog=opened, pixel=px)
            if opened:
                tap(368, 120); time.sleep(8)      # the blue Add button
                log('after-add')
                return {'installed_on_attempt': attempt + 1}
        # Wrong sheet, or none: close whatever is up (its X is at 41, 120) and start again.
        tap(41, 120); time.sleep(4)
        tap(41, 120); time.sleep(3)
    return {'installed': False}


def tap_icon():
    """Find the Tasación icon on whichever home page it is; tap it by its own frame."""
    seen = []
    for attempt in range(8):
        e = find('Tasaci')
        if e:
            tap_el(e)
            return {'found_on_attempt': attempt + 1, 'frame': e['frame']}
        seen.append(labels()[:5])
        # Next home page: a slow drag over the empty wallpaper, clear of widgets and icons.
        rc = sh(['idb', 'ui', 'swipe', '--udid', UDID, '--duration', '0.4', '380', '650', '40', '650']).returncode
        seen.append('swipe rc %s' % rc)
        time.sleep(4)
    return {'found': False, 'seen': seen}


def end_web_processes():
    """Simulator apps are host processes: end the web app and WebKit's helpers so the next launch is cold."""
    codes = [sh(['pkill', '-f', p]).returncode for p in ('Web.app/Web', 'com.apple.WebKit.WebContent', 'com.apple.WebKit.Networking')]
    return {'pkill': codes}


def pf_block():
    ips = sorted({ai[4][0] for h in ('marpolis.com', 'netwebmedia.com') for ai in socket.getaddrinfo(h, 443)})
    sh(['sudo', 'pfctl', '-f', '-'], input=('block return quick from any to { %s }\n' % ', '.join(ips)).encode())
    sh(['sudo', 'pfctl', '-e'])
    return ips


print('openurl', sh(['xcrun', 'simctl', 'openurl', UDID, URL]).returncode, flush=True)
time.sleep(15)
log('safari-open', labels=labels())
res = install()
log('install-result', **res)
if res.get('installed_on_attempt'):
    home(); time.sleep(5)
    log('launch-icon', **tap_icon())
    time.sleep(30)                                # the worker saves its 13 files on this first launch
    log('launched-online', labels=labels())
    log('cut-network', ips=pf_block())
    home(); time.sleep(4)
    log('end-web-processes', **end_web_processes())
    time.sleep(8)
    home(); time.sleep(4)
    log('relaunch-offline', **tap_icon())
    time.sleep(25)
    log('offline-state', labels=labels())
    sh(['sudo', 'pfctl', '-d'])
