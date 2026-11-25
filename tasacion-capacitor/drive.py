"""Tasación inside the Capacitor iOS shell (iOS Simulator), driven through idb.
Usage: python drive.py <simulator-udid> <bundle-id>
Each step: one JSON line + screenshot + full accessibility dump (out-cap/). A failed step never stops the run.
"""
import json, os, re, socket, subprocess, sys, time

from PIL import Image

UDID, BUNDLE = sys.argv[1], sys.argv[2]
OUT = 'out-cap'
os.makedirs(OUT, exist_ok=True)
LOG = open(os.path.join(OUT, 'steps.jsonl'), 'w', encoding='utf8')
N = [0]
SHORT = {}      # tappable controls shorter than 44 pt: (label, type) -> (h, w)
OVER = {}       # elements that stick out past the screen's right edge
TAPPABLE = re.compile(r'button|link|radio|textfield|text field|popup|pop up|checkbox|switch|picker|combo', re.I)
W, H = 420, 912


def sh(args, **kw):
    try:
        return subprocess.run(args, capture_output=True, timeout=kw.pop('timeout', 60), **kw)
    except subprocess.TimeoutExpired:
        return subprocess.CompletedProcess(args, 124, b'', b'timeout')


def elements():
    r = sh(['idb', 'ui', 'describe-all', '--udid', UDID], timeout=45)
    try:
        v = json.loads(r.stdout.decode('utf8', 'replace'))
        return v if isinstance(v, list) else []
    except Exception:
        return []


def lab(e):
    l, v = str(e.get('AXLabel') or e.get('title') or ''), str(e.get('AXValue') or '')
    return (l + (' = ' + v if v and v != l else '')).strip()


def typ(e):
    return str(e.get('type') or e.get('role') or e.get('role_description') or '')


def cy(e):
    f = e['frame']
    return f['y'] + f['height'] / 2


def on_screen(e):
    f = e.get('frame')
    return bool(f) and f['width'] > 0 and 0 < cy(e) < H - 30


def find(pattern, els=None, visible=True):
    for e in (els if els is not None else elements()):
        if re.search(pattern, lab(e), re.I) and e.get('frame') and (not visible or on_screen(e)):
            return e
    return None


def sh_tap(x, y):
    return sh(['idb', 'ui', 'tap', '--udid', UDID, str(int(x)), str(int(y))]).returncode


def tap_el(e):
    f = e['frame']
    return sh_tap(f['x'] + f['width'] / 2, f['y'] + f['height'] / 2)


def swipe(x1, y1, x2, y2, d='0.35'):
    return sh(['idb', 'ui', 'swipe', '--udid', UDID, '--duration', d, str(x1), str(y1), str(x2), str(y2)]).returncode


def scroll_top():
    for _ in range(4):
        swipe(210, 250, 210, 800); time.sleep(0.6)


def tap_find(pattern, scroll=True, tries=9):
    """Re-read the dump before every tap; scroll down until the control is on screen."""
    for i in range(tries):
        e = find(pattern)
        if e:
            tap_el(e); time.sleep(1.5)
            return {'tapped': lab(e)[:60], 'frame': e['frame'], 'attempt': i + 1}
        if not scroll:
            break
        swipe(210, 720, 210, 330); time.sleep(1.2)
    return {'tapped': None, 'pattern': pattern}


def wait_dump(seconds=150):
    end = time.time() + seconds
    while time.time() < end:
        if any(lab(e) for e in elements()):
            return round(seconds - (end - time.time()))
        time.sleep(4)
    return None


def shot(name):
    p = os.path.join(OUT, name + '.png')
    sh(['xcrun', 'simctl', 'io', UDID, 'screenshot', p])
    return p


def note_sizes(els):
    for e in els:
        f = e.get('frame')
        if not f or not on_screen(e):
            continue
        t = typ(e)
        if TAPPABLE.search(t) and f['height'] < 44 and lab(e):
            SHORT[(lab(e)[:40], t)] = (round(f['height'], 1), round(f['width'], 1))
        if f['x'] + f['width'] > W + 1 or f['x'] < -1:
            OVER[(lab(e)[:40], t)] = (round(f['x'], 1), round(f['width'], 1))


def snap(name, keep=None, **data):
    """Dump + screenshot + one log line. `keep` = regex for the texts worth printing (else the first 40)."""
    N[0] += 1
    name = '%02d-%s' % (N[0], name)
    els = elements()
    note_sizes(els)
    ls = [lab(e) for e in els if lab(e)]
    json.dump([{'l': lab(e), 't': typ(e), 'f': e.get('frame')} for e in els],
              open(os.path.join(OUT, name + '.dump.json'), 'w', encoding='utf8'), ensure_ascii=False)
    shot(name)
    texts = [l[:110] for l in ls if re.search(keep, l, re.I)] if keep else [l[:60] for l in ls][:40]
    rec = dict(step=name, n_elements=len(els), texts=texts[:40], **data)
    LOG.write(json.dumps(rec, ensure_ascii=False) + '\n'); LOG.flush()
    print(json.dumps(rec, ensure_ascii=True)[:1200], flush=True)
    return els


def step(fn):
    try:
        return fn()
    except Exception as ex:
        N[0] += 1
        rec = {'step': '%02d-error-%s' % (N[0], fn.__name__), 'error': repr(ex)[:300]}
        LOG.write(json.dumps(rec) + '\n'); LOG.flush(); print(rec, flush=True)


def launch():
    sh(['xcrun', 'simctl', 'terminate', UDID, BUNDLE]); time.sleep(2)
    rc = sh(['xcrun', 'simctl', 'launch', UDID, BUNDLE]).returncode
    return rc, wait_dump()


def kill():
    sh(['xcrun', 'simctl', 'terminate', UDID, BUNDLE]); time.sleep(3)


def type_text(pattern, text):
    r = tap_find(pattern)
    time.sleep(1.5)
    sh(['idb', 'ui', 'text', '--udid', UDID, text]); time.sleep(1.5)
    return r


def dismiss_keyboard():
    e = find(r'^Tu propiedad') or find(r'Cuánto vale tu casa')
    if e:
        tap_el(e); time.sleep(1)


RES = r'UF\s?[\d.,]+|Son \$|Rango|Confianza|confianza|Valor base|\bm²\b|UF por|Referencial|Estimación'
KEY = 'built=110 lot=250'

# ---- 1 hub
def s1():
    rc, t = launch()
    els = snap('hub', keep=r'Tasaci|Sueldo|Boleta|Cotiz|Libreta|Gastos|Reajuste|Pensi|Vaquita|Auto|Farmacia|Apps Chile',
               launch_rc=rc, dump_wait_s=t)
    names = ['Sueldo', 'Boleta', 'Cotiz', 'Libreta', 'Gastos', 'Reajuste', 'Tasaci', 'Pensi', 'Vaquita', 'Auto al', 'Farmacia']
    found = {n: bool(find(n, els, visible=False)) for n in names}
    N[0] += 0
    LOG.write(json.dumps({'hub_cards_in_dump': found, 'count': sum(found.values())}) + '\n'); LOG.flush()
    print('hub cards', found, flush=True)
    r = tap_find(r'Tasaci')
    time.sleep(4)
    snap('tool-opened', keep=r'Tasaci|Compartir|Más apps|Valor estimado|Tu propiedad|Cuánto vale', tap=r)

# ---- 2 header / safe area
def s2():
    els = snap('tool-top', keep=r'Tasaci|Compartir|Más apps|Valor estimado|Tu propiedad|Cuánto vale')
    hdr = [(lab(e)[:30], e['frame']) for e in els if e.get('frame') and re.search(r'^(Tasaci|Compartir|Más apps)', lab(e))]
    LOG.write(json.dumps({'header_frames': hdr, 'min_header_y': min([f['y'] for _, f in hdr] or [None])}) + '\n'); LOG.flush()
    print('header', hdr, flush=True)

# ---- 3 type surfaces
def s3():
    type_text(r'construida', '110')
    dismiss_keyboard()
    snap('built-110', keep=RES)
    type_text(r'Superficie de terreno', '250')
    dismiss_keyboard()
    time.sleep(6)                       # the UF fetch may take a moment
    scroll_top(); swipe(210, 720, 210, 330); time.sleep(1)
    snap('lot-250-a', keep=RES + r'|Tasación|Valor estimado')
    swipe(210, 720, 210, 330); time.sleep(1)
    snap('lot-250-b', keep=RES)
    swipe(210, 720, 210, 330); time.sleep(1)
    els = snap('lot-250-c', keep=RES + r'|UF de hoy|UF de referencia|WhatsApp|Copiar')
    # ---- 4 UF source line, read from whatever dump shows it
    for e in els:
        m = re.search(r'UF (de hoy|de referencia)', lab(e))
        if m:
            LOG.write(json.dumps({'uf_source': m.group(0), 'text': lab(e)[:200]}, ensure_ascii=False) + '\n'); LOG.flush()
            print('UF SOURCE', m.group(0), flush=True)
            break

# ---- 5 types
def s5():
    for tipo, pat in (('depto', r'^Depto'), ('oficina', r'^Oficina'), ('terreno', r'^Terreno')):
        scroll_top()
        r = tap_find(pat, scroll=False)
        time.sleep(2)
        snap('tipo-' + tipo + '-form', keep=r'construida|terreno|Terraza|Bodega|Dormitor|Baños|Estacion|Estado|Sector|Comuna', tap=r)
        swipe(210, 720, 210, 330); time.sleep(1)
        snap('tipo-' + tipo + '-form2', keep=r'construida|terreno|Terraza|Bodega|Dormitor|Baños|Estacion|Estado|Sector')
        swipe(210, 720, 210, 330); time.sleep(1)
        snap('tipo-' + tipo + '-result', keep=RES)
    scroll_top()
    tap_find(r'^Casa', scroll=False); time.sleep(2)

# ---- 6 comuna
def s6():
    scroll_top()
    r = tap_find(r'Comuna')
    time.sleep(2)
    snap('comuna-picker-open', tap=r)
    for i in range(30):                 # wheel or list: look for the option, else nudge the picker
        e = find(r'La Serena')
        if e and 'Comuna' not in lab(e)[:7]:
            tap_el(e); time.sleep(1.5)
            break
        swipe(210, 780, 210, 700, '0.25'); time.sleep(0.8)
    snap('comuna-after-pick', keep=r'Comuna|Serena|Sector|Valor')
    done = find(r'^(Done|Listo|OK)$')
    if done:
        tap_el(done); time.sleep(2)
    scroll_top()
    snap('comuna-top', keep=r'Comuna|Serena|Sector|UF|Son \$')

# ---- 9 share
def s9():
    scroll_top()
    r = tap_find(r'^Compartir', scroll=False)
    time.sleep(5)
    snap('share-tapped', tap=r)
    c = find(r'^(Close|Cancel|Cerrar|Cancelar)$')
    if c:
        tap_el(c)
    else:
        sh_tap(210, 60)
    time.sleep(3)
    snap('share-after-close')
    for _ in range(4):
        swipe(210, 720, 210, 330)
    r2 = tap_find(r'WhatsApp', scroll=True)
    time.sleep(6)
    snap('whatsapp-tapped', tap=r2)

# ---- 7 relaunch
def s7():
    kill()
    rc, t = launch()
    snap('relaunch-hub', launch_rc=rc, dump_wait_s=t)
    r = tap_find(r'Tasaci')
    time.sleep(4)
    scroll_top()
    snap('relaunch-tool-top', keep=r'construida|terreno|Comuna|Serena|^Casa|^Depto|Valor|UF', tap=r)
    swipe(210, 720, 210, 330); time.sleep(1)
    snap('relaunch-tool-mid', keep=r'construida|terreno|Comuna|Serena|Dormitor|' + RES)

# ---- 8 offline
def pf_block():
    ips = sorted({ai[4][0] for h in ('fracmo.ai', 'tasacion.fracmo.ai', 'netwebmedia.com') for ai in socket.getaddrinfo(h, 443)})
    sh(['sudo', 'pfctl', '-f', '-'], input=('block return quick from any to { %s }\n' % ', '.join(ips)).encode())
    sh(['sudo', 'pfctl', '-e'])
    return ips


def s8():
    ips = pf_block()
    LOG.write(json.dumps({'blocked_ips': ips}) + '\n'); LOG.flush()
    kill()
    rc, t = launch()
    snap('offline-hub', launch_rc=rc, dump_wait_s=t, ips=len(ips))
    r = tap_find(r'Tasaci')
    time.sleep(8)
    scroll_top()
    snap('offline-tool-top', keep=r'construida|terreno|Comuna|Serena|^Casa|Valor|UF', tap=r)
    for k in range(3):
        swipe(210, 720, 210, 330); time.sleep(1)
        snap('offline-tool-%d' % k, keep=RES + r'|UF de hoy|UF de referencia')


try:
    for fn in (s1, s2, s3, s5, s6, s9, s7, s8):
        step(fn)
finally:
    sh(['sudo', 'pfctl', '-d'])
    summary = {'under_44pt': {'%s|%s' % k: v for k, v in SHORT.items()},
               'outside_right_edge': {'%s|%s' % k: v for k, v in OVER.items()}}
    json.dump(summary, open(os.path.join(OUT, 'summary.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    print(json.dumps(summary, ensure_ascii=False)[:1500])
