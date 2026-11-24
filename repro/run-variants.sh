#!/bin/bash
# Installs the same simulator build once per (page, ios.contentInset) pair and screenshots it
# as fast as simctl allows for the first seconds after launch, then at about 8 s and 12 s.
# The config and web files are read from the app bundle at runtime, so they are swapped without rebuilding.
set -u
APP_SRC="$1"   # built App.app
OUT="$2"       # screenshot folder
BID=com.example.insetrepro
mkdir -p "$OUT" work

for dir in www-*; do
  page="${dir#www-}"
  for mode in automatic never; do
    rm -rf work/App.app
    cp -R "$APP_SRC" work/App.app
    cp -R "$dir/." work/App.app/public/
    python3 - "$mode" <<'PY'
import json, sys
p = 'work/App.app/capacitor.config.json'
c = json.load(open(p))
c.setdefault('ios', {})['contentInset'] = sys.argv[1]
json.dump(c, open(p, 'w'))
PY
    xcrun simctl terminate "$UDID" $BID 2>/dev/null
    xcrun simctl uninstall "$UDID" $BID 2>/dev/null
    xcrun simctl install "$UDID" work/App.app
    start=$(python3 -c 'import time; print(time.time())')
    xcrun simctl launch "$UDID" $BID >/dev/null
    for i in $(seq 1 14); do
      t=$(python3 -c "import time; print('%04.1f' % (time.time() - $start))")
      xcrun simctl io "$UDID" screenshot "$OUT/$page-$mode-$t.png" >/dev/null 2>&1
      sleep 0.2
    done
    for target in 9 13; do
      now=$(python3 -c "import time; print(int(time.time() - $start))")
      [ "$now" -lt "$target" ] && sleep $((target - now))
      t=$(python3 -c "import time; print('%04.1f' % (time.time() - $start))")
      xcrun simctl io "$UDID" screenshot "$OUT/$page-$mode-$t.png" >/dev/null 2>&1
    done
    echo "done $page $mode"
  done
done
ls "$OUT" | wc -l
