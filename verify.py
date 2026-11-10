"""Check that today's fixes are live. One keep-alive session, 1 request a second."""
import sys
import time

import requests

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36")

# (url, expected status, strings that must be present, strings that must be absent)
# For a 301 the "present" strings are matched against the Location header.
CHECKS = [
    ("https://dongaston.com/privacy.html", 200, ["Don Gastón SpA", "Google Analytics"], []),
    ("https://dongaston.com/", 200, ['href="/privacy.html"'], []),
    ("https://dongaston.com/blog/zz-nope-nested", 404, ['"/css/app.css'], []),
    ("https://dongaston.com/billeterasmart/", 200, ["el dinero"], ["la plata"]),
    ("https://climalerta.com/", 200, ["https://climalerta.com/og-card.jpg", "summary_large_image"], []),
    ("https://climalerta.com/og-card.jpg", 200, [], []),
    ("https://climalerta.com/riesgos.html", 200, ["noindex"], []),
    ("https://climalerta.com/difundir.html", 200, ['rel="canonical"'], []),
    ("https://realiracing.com/blog/consistency-over-pace-spread-wins-races.html", 301,
     ["/blog/consistency-over-pace-lap-time-spread-wins.html"], []),
    ("https://realiracing.com/blog/motion-rigs-cost-benefit-analysis-iracing.html", 301,
     ["/blog/motion-rigs-cost-benefit-sim-racing.html"], []),
    ("https://realiracing.com/blog/pedal-spacing-setup-consistent-braking-technique.html", 301,
     ["/blog/pedal-spacing-angle-consistent-braking.html"], []),
    ("https://realiracing.com/blog/consistency-over-pace-lap-time-spread-wins.html", 200, [], []),
    ("https://realiracing.com/blog/motion-rigs-cost-benefit-sim-racing.html", 200, [], []),
    ("https://realiracing.com/blog/pedal-spacing-angle-consistent-braking.html", 200, [], []),
    ("https://realiracing.com/gear.html", 200, [], ["Photo coming soon"]),
    ("https://realiracing.com/merch.html", 200, ["noindex"], []),
    ("https://tapephoto.com/blog/fotos-de-producto-guia.html", 200, ["costando dinero"], ["costando plata"]),
    ("https://tapephoto.com/blog/fotografia-empresas-vale-la-pena.html", 200, ["dinero mal puesto"], ["plata mal puesta"]),
    ("https://golferos.com/terminos/", 200, ["rminos de uso"], []),
    ("https://golferos.com/", 200, ["terminos/"], []),
    ("https://golferos.com/guias/empezar-a-jugar-golf-en-chile.html", 200, [], ["plata ahorra"]),
    ("https://marpolis.com/terminos.html", 200, ["rminos de Uso"], []),
    ("https://marpolis.com/", 200, ["terminos.html"], []),
    ("https://entrepoker.com/es/terminos.html", 200, ["rminos de uso"], []),
    ("https://entrepoker.com/en/terms.html", 200, ["Terms"], []),
    ("https://entrepoker.com/es/salas.html", 200, ["/es/terminos.html"], [" plata "]),
    ("https://netwebmedia.com/industries/hospitality/hotels/", 200, ['property="og:image"', "summary_large_image"], []),
    ("https://netwebmedia.com/industries/wine-agriculture/wineries/", 200, ['property="og:image"', "summary_large_image"], []),
    ("https://fracmo.ai/sdr-ia.html", 200, ["https://fracmo.ai/assets/fracmo-og.png", "summary_large_image"], []),
    ("https://fracmo.ai/embajadores-virtuales.html", 200, ['property="og:image"', "summary_large_image"], []),
    ("https://fracmo.ai/golf-clubes.html", 200, ["summary_large_image"], []),
]


def main():
    s = requests.Session()
    s.headers.update({"User-Agent": UA, "Accept-Encoding": "gzip"})
    failed = 0
    for url, want, present, absent in CHECKS:
        time.sleep(1)
        try:
            r = s.get(url, allow_redirects=False, timeout=25)
            r.encoding = "utf-8"  # the host sends text/html with no charset
            hay =r.headers.get("location", "") if want in (301, 302) else r.text
            why = []
            if r.status_code != want:
                why.append(f"status {r.status_code}, wanted {want}")
            why += [f"missing {p!r}" for p in present if p not in hay]
            why += [f"still has {a!r}" for a in absent if a in hay]
        except requests.RequestException as e:
            why = [type(e).__name__]
        failed += bool(why)
        print(("FAIL " if why else "PASS ") + url + (" — " + "; ".join(why) if why else ""))
    print(f"VERIFY {len(CHECKS) - failed}/{len(CHECKS)} passed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
