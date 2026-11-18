#!/bin/bash
# Installs the same simulator build four times (page: min|real, ios.contentInset: automatic|never)
# and screenshots it at fixed times after launch. The config and web files are read from the app
# bundle at runtime, so they can be swapped without rebuilding.
set -u
APP_SRC="$1"   # built App.app
OUT="$2"       # screenshot folder
BID=com.example.insetrepro
mkdir -p "$OUT" work

for page in min real; do
  [ -d "www-$page" ] || { echo "skip $page: no www-$page"; continue; }
  for mode in automatic never; do
    rm -rf work/App.app
    cp -R "$APP_SRC" work/App.app
    cp -R "www-$page/." work/App.app/public/
    python3 - "$mode" <<'PY'
import json, sys
p = 'work/App.app/capacitor.config.json'
c = json.load(open(p))
c.setdefault('ios', {})['contentInset'] = sys.argv[1]
json.dump(c, open(p, 'w'))
print('config', c['ios'])
PY
    xcrun simctl terminate "$UDID" $BID 2>/dev/null
    xcrun simctl uninstall "$UDID" $BID 2>/dev/null
    xcrun simctl install "$UDID" work/App.app
    xcrun simctl launch "$UDID" $BID
    prev=0
    for t in 1 2 3 5 8 12; do
      sleep $((t - prev)); prev=$t
      xcrun simctl io "$UDID" screenshot "$OUT/$page-$mode-t$(printf %02d $t).png" >/dev/null 2>&1
    done
    if [ "$page" = min ] && command -v idb >/dev/null; then
      # focus the field (header 56 + hero 100 + padding 32 + label 20 + half input 26 = 234, plus the 68 pt inset)
      idb ui tap 210 302 --udid "$UDID"; sleep 2
      idb ui text 12 --udid "$UDID"; sleep 2
      xcrun simctl io "$UDID" screenshot "$OUT/$page-$mode-focus.png" >/dev/null 2>&1
      idb ui swipe 210 600 210 200 --duration 0.5 --udid "$UDID"; sleep 2
      xcrun simctl io "$UDID" screenshot "$OUT/$page-$mode-scrolled.png" >/dev/null 2>&1
    fi
    echo "done $page $mode"
  done
done
ls -la "$OUT"
