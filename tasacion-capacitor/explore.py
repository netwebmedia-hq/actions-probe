"""Exploration: does the accessibility tree expose the web content once app accessibility is on? Else screenshots only."""
import json, os, subprocess, sys, time

UDID, BUNDLE = sys.argv[1], sys.argv[2]
OUT = 'out-cap'
os.makedirs(OUT, exist_ok=True)
N = [0]


def sh(a, **kw):
    try:
        return subprocess.run(a, capture_output=True, timeout=kw.pop('timeout', 60), **kw)
    except subprocess.TimeoutExpired:
        return subprocess.CompletedProcess(a, 124, b'', b'timeout')


def dump():
    r = sh(['idb', 'ui', 'describe-all', '--udid', UDID], timeout=45)
    try:
        return json.loads(r.stdout.decode('utf8', 'replace'))
    except Exception:
        return []


def snap(name):
    N[0] += 1
    n = '%02d-%s' % (N[0], name)
    sh(['xcrun', 'simctl', 'io', UDID, 'screenshot', os.path.join(OUT, n + '.png')])
    d = dump()
    json.dump(d, open(os.path.join(OUT, n + '.dump.json'), 'w', encoding='utf8'), ensure_ascii=False)
    print(n, 'elements', len(d), [str(e.get('AXLabel'))[:30] for e in d][:12], flush=True)


def tap(x, y):
    sh(['idb', 'ui', 'tap', '--udid', UDID, str(x), str(y)])


def swipe(a, b, c, d):
    sh(['idb', 'ui', 'swipe', '--udid', UDID, '--duration', '0.4', str(a), str(b), str(c), str(d)])


for key in ('ApplicationAccessibilityEnabled', 'AccessibilityEnabled'):
    for dom in ('com.apple.Accessibility', 'com.apple.universalaccess'):
        print(key, dom, sh(['xcrun', 'simctl', 'spawn', UDID, 'defaults', 'write', dom, key, '-bool', 'true']).returncode)
sh(['xcrun', 'simctl', 'terminate', UDID, BUNDLE]); time.sleep(2)
sh(['xcrun', 'simctl', 'launch', UDID, BUNDLE])
time.sleep(30)
snap('hub-a11y-on')
tap(367, 412)                       # Tasación icon in the hub's quick row (pt)
time.sleep(5)
snap('tool-top')
for i in range(1, 7):
    swipe(210, 760, 210, 360); time.sleep(1.5)
    snap('tool-scroll-%d' % i)
