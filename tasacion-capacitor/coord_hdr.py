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


def selects_present():
    from PIL import Image
    p = os.path.join(OUT, 'probe.png')
    sh(['xcrun', 'simctl', 'io', UDID, 'screenshot', p])
    r, g, b = Image.open(p).convert('RGB').getpixel((630, 1776))   # (210,592) pt: grey if the Comuna select is there
    print('pixel at comuna spot', r, g, b, flush=True)
    return r < 250


def scen_tasacion():
    for k in (1,):
        launch(30 if k == 1 else 20); open_tool(); top(); time.sleep(3); shot('A-rest-launch%d' % k)
    pt = (119, 690) if selects_present() else (118, 600)
    print('built field tap at', pt, flush=True)
    tap(*pt, 3); shot('B-keyboard-up')
    text('110'); shot('B2-typed-110')
    swipe(210, 760, 210, 360); time.sleep(1); shot('C-scrolled-380')
    tap(374, 877, 3); shot('E-dismissed')
    time.sleep(2); shot('E1b-dismissed-2s')
    top(); time.sleep(1); shot('E2-top-result')
    for i in range(3):
        swipe(210, 760, 210, 360)
    shot('E3-result-card')


def scen_sueldo():
    launch(25); tap(210, 572, 7); shot('F0-sueldo-open')
    tap(209, 543, 3); shot('F1-sueldo-keyboard-up')
    swipe(210, 760, 210, 360); time.sleep(1); shot('F2-sueldo-scrolled-380')
    tap(376, 559, 3); shot('F4-sueldo-dismissed')


def scen_other():
    launch(25); tap(210, 287, 7); shot('G0-cotiza-open')
    swipe(210, 760, 210, 460); time.sleep(1); shot('G1-cotiza-scrolled')


def pf_block():
    ips = sorted({ai[4][0] for h in ('fracmo.ai', 'tasacion.fracmo.ai', 'netwebmedia.com') for ai in socket.getaddrinfo(h, 443)})
    sh(['sudo', 'pfctl', '-f', '-'], input=('block return quick from any to { %s }\n' % ', '.join(ips)).encode())
    sh(['sudo', 'pfctl', '-e'])
    print('blocked', ips, flush=True)


def s8():
    pf_block(); launch(20); shot('offline-hub'); open_tool(); view('offline', 6)


try:
    for fn in (scen_tasacion,):
        step(fn)
finally:
    sh(['sudo', 'pfctl', '-d'])
