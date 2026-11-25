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


def teal_button(path):
    """Bounding box (px) of the first teal block 420-620 px wide and 90-200 px tall below y=700 px: 'Enviar por WhatsApp'."""
    from PIL import Image
    im = Image.open(path).convert('RGB'); w, h = im.size
    rows = []
    for y in range(700, h - 100, 4):
        xs = [x for x in range(0, w, 4) if (lambda p: abs(p[0] - 15) < 20 and abs(p[1] - 118) < 25 and abs(p[2] - 110) < 25)(im.getpixel((x, y)))]
        rows.append((y, min(xs), max(xs)) if xs and max(xs) - min(xs) > 380 else None)
    run = []
    for r in rows + [None]:
        if r:
            run.append(r)
        elif run:
            hh = run[-1][0] - run[0][0]
            ww = max(a[2] for a in run) - min(a[1] for a in run)
            if 80 <= hh <= 200 and 380 <= ww <= 900:
                return (min(a[1] for a in run) + max(a[2] for a in run)) / 2, (run[0][0] + run[-1][0]) / 2
            run = []
    return None


def has_text(box):
    from PIL import Image
    p = os.path.join(OUT, 'probe.png')
    sh(['xcrun', 'simctl', 'io', UDID, 'screenshot', p])
    im = Image.open(p).convert('L').crop(box)
    return sum(1 for v in im.getdata() if v < 110) > 150


def fill(pt, value, box):
    for k in range(4):
        top(); tap(*pt, 3); text(value); time.sleep(1.5)
        if has_text(box):
            tap(374, 877, 2); return k + 1
        tap(374, 877, 2)
    return 0


def s1():
    launch(30); shot('hub'); open_tool(); top()
    print('built tries', fill(BUILT, '110', (105, 2010, 600, 2130)), flush=True)
    top(); tap(*LOT, 3); text('250'); tap(374, 877, 2)
    time.sleep(6); top(); shot('santiago-casa-top')


def s_oficina():
    top(); tap(123, 508, 3); top(); shot('oficina-top'); swipe(210, 760, 210, 360); shot('oficina-p1')
    top(); tap(123, 455, 3); top(); shot('back-to-casa')


def s_comuna():
    top(); tap(210, 592, 3); text('La Serena'); time.sleep(1); shot('comuna-typed')
    tap(200, 598, 3); time.sleep(3); top(); shot('serena-top'); swipe(210, 760, 210, 360); shot('serena-p1')


def s_whatsapp():
    top()
    for i in range(1, 8):
        swipe(210, 760, 210, 360)
        p = os.path.join(OUT, 'probe.png')
        sh(['xcrun', 'simctl', 'io', UDID, 'screenshot', p])
        b = teal_button(p)
        print('scroll', i, 'button', b, flush=True)
        if b:
            shot('whatsapp-visible')
            tap(b[0] / 3, b[1] / 3, 6); shot('after-whatsapp-tap')
            time.sleep(6); shot('after-whatsapp-tap-12s')
            return
    shot('whatsapp-not-found')


def pf_block():
    ips = sorted({ai[4][0] for h in ('fracmo.ai', 'tasacion.fracmo.ai', 'netwebmedia.com') for ai in socket.getaddrinfo(h, 443)})
    sh(['sudo', 'pfctl', '-f', '-'], input=('block return quick from any to { %s }\n' % ', '.join(ips)).encode())
    sh(['sudo', 'pfctl', '-e'])
    print('blocked', ips, flush=True)


def s8():
    pf_block(); launch(20); shot('offline-hub'); open_tool(); view('offline', 6)


try:
    for fn in (s1, s_whatsapp):
        step(fn)
finally:
    sh(['sudo', 'pfctl', '-d'])
