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


def s1():
    launch(30); shot('hub'); open_tool(); shot('tool-first-frames')


def s_oficina():
    top(); tap(123, 508, 3); shot('oficina-top'); swipe(210, 760, 210, 360); shot('oficina-p1')
    top(); tap(123, 455, 3); shot('back-to-casa')


def s_comuna():
    top(); tap(210, 592, 3); text('La Serena'); time.sleep(1); shot('comuna-typed')
    tap(200, 598, 3); shot('comuna-after-tap')
    top(); shot('serena-p0'); swipe(210, 760, 210, 360); shot('serena-p1')
    top(); tap(334, 96, 1)    # nothing yet
    sh(['xcrun', 'simctl', 'terminate', UDID, BUNDLE]); time.sleep(2)


def s_relaunch_serena():
    launch(20); open_tool(); top(); shot('relaunch-serena-top'); swipe(210, 760, 210, 360); shot('relaunch-serena-p1')


def s_whatsapp():
    top()
    for i in range(3):
        swipe(210, 760, 210, 360)
    shot('before-whatsapp')
    tap(150, 414, 6); shot('after-whatsapp-tap')


def s_keyboard():
    launch(20); open_tool(); top(); tap(*BUILT, 2); swipe(210, 760, 210, 360); shot('kb-scrolled')
    tap(374, 877, 2); shot('kb-dismissed-with-check'); swipe(210, 760, 210, 560); shot('kb-dismissed-scrolled')


def pf_block():
    ips = sorted({ai[4][0] for h in ('fracmo.ai', 'tasacion.fracmo.ai', 'netwebmedia.com') for ai in socket.getaddrinfo(h, 443)})
    sh(['sudo', 'pfctl', '-f', '-'], input=('block return quick from any to { %s }\n' % ', '.join(ips)).encode())
    sh(['sudo', 'pfctl', '-e'])
    print('blocked', ips, flush=True)


def s8():
    pf_block(); launch(20); shot('offline-hub'); open_tool(); view('offline', 6)


try:
    for fn in (s1, s_oficina, s_comuna, s_relaunch_serena, s_whatsapp, s_keyboard):
        step(fn)
finally:
    sh(['sudo', 'pfctl', '-d'])
