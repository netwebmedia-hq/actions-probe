"""Coordinate-driven run (the WKWebView content is not in idb's accessibility tree: only 'Application').
Positions are points (420x912) read from the first exploratory screenshots. Evidence = screenshots, read by a human."""
import os, socket, subprocess, sys, time

UDID, BUNDLE = sys.argv[1], sys.argv[2]
OUT = 'out-cap'
os.makedirs(OUT, exist_ok=True)
N = [0]


def sh(a, **kw):
    try:
        return subprocess.run(a, capture_output=True, timeout=kw.pop('timeout', 60), **kw)
    except subprocess.TimeoutExpired:
        return subprocess.CompletedProcess(a, 124, b'', b'timeout')


def shot(name):
    N[0] += 1
    n = '%02d-%s' % (N[0], name)
    sh(['xcrun', 'simctl', 'io', UDID, 'screenshot', os.path.join(OUT, n + '.png')])
    print(n, flush=True)


def tap(x, y, wait=1.5):
    sh(['idb', 'ui', 'tap', '--udid', UDID, str(x), str(y)]); time.sleep(wait)


def swipe(a, b, c, d, dur='0.4'):
    sh(['idb', 'ui', 'swipe', '--udid', UDID, '--duration', dur, str(a), str(b), str(c), str(d)]); time.sleep(1.3)


def text(t):
    sh(['idb', 'ui', 'text', '--udid', UDID, t]); time.sleep(1.5)


def top():
    for _ in range(5):
        swipe(210, 250, 210, 820, '0.3')


def view(name, n):
    top(); shot(name + '-p0')
    for i in range(1, n + 1):
        swipe(210, 760, 210, 360); shot('%s-p%d' % (name, i))


def launch(wait=25):
    sh(['xcrun', 'simctl', 'terminate', UDID, BUNDLE]); time.sleep(3)
    sh(['xcrun', 'simctl', 'launch', UDID, BUNDLE]); time.sleep(wait)


def open_tool():
    tap(367, 412, 8)          # Tasación icon in the hub's quick row


def step(fn):
    try:
        fn()
    except Exception as ex:
        print('ERROR', fn.__name__, repr(ex), flush=True)


CASA, DEPTO, OFICINA, TERRENO = (123, 447), (297, 447), (123, 497), (297, 497)
COMUNA, BUILT, LOT, HEAD = (210, 592), (119, 690), (301, 690), (91, 370)


def bash_out(args):
    r = sh(args)
    return (r.stdout or b'').decode('utf8', 'replace') + (r.stderr or b'').decode('utf8', 'replace')


def front_label():
    r = sh(['idb', 'ui', 'describe-all', '--udid', UDID], timeout=30)
    t = (r.stdout or b'').decode('utf8', 'replace')
    import re as _re
    return _re.findall(r'"AXLabel":\s*"([^"]*)"', t)[:3]


def scen():
    launch(30); open_tool(); time.sleep(12); shot('1-ready')
    print('front before tap', front_label(), flush=True)
    tap(148, 456, 0.2)
    t0 = time.time()
    for k in (1, 2, 3, 5, 8, 12, 20):
        time.sleep(max(0, k - (time.time() - t0)))
        shot('2-after-wa-%ds' % k)
        print('t+%ds front' % k, front_label(), flush=True)
    print('simctl launch:', bash_out(['xcrun', 'simctl', 'launch', UDID, BUNDLE]), flush=True)
    time.sleep(5); shot('3-back-after-launch'); print('front after launch', front_label(), flush=True)


try:
    step(scen)
finally:
    sh(['sudo', 'pfctl', '-d'])
