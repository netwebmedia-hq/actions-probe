"""Polite one-connection crawl of a list of sites; saves responses for offline audit.

All sites share one server that flood-blocks bursts, so: ONE keep-alive session,
sites in sequence, a delay before every request, and stop a site after 5 errors in a row.
"""
import csv
import json
import os
import re
import sys
import time
from urllib.parse import urljoin, urlparse

import requests

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36")
DELAY = float(os.environ.get("DELAY", "0.35"))
MAX_PAGES, MAX_ASSETS, MAX_LINKS, MAX_SITEMAP, MAX_SUBS = 20, 50, 30, 12, 16
HDRS = ["content-type", "content-encoding", "content-length", "cache-control",
        "strict-transport-security", "content-security-policy",
        "x-content-type-options", "referrer-policy", "permissions-policy",
        "x-frame-options", "last-modified", "location", "server"]
COLS = ["kind", "url", "status", "final", "secs", "bytes", "file", "error"] + HDRS
ASSET_RE = re.compile(r"\.(css|js|png|jpe?g|webp|avif|svg|gif|ico|woff2?|mp4|webm|json|xml|txt|pdf|zip)(\?|$)", re.I)

# Pages worth fetching even if the home page does not link them.
EXTRA = {
    "dongaston.com": ["privacy.html", "blog/", "billeterasmart/", "blog/zz-nope-nested-404"],
    "netwebmedia.com": ["pricing.html", "contact.html", "about.html", "blog/", "services.html",
                        "privacy.html", "terms.html", "whatsapp.html", "industries/", "aeo-check.html"],
    "fracmo.ai": ["pricing.html", "privacy.html", "terms.html", "login.html"],
    "golferos.com": ["tienda/", "comunidad/", "noticias/", "privacidad/", "para-clubes/"],
    "marpolis.com": ["tasacion.html", "arriendo-temporal.html", "blog/", "privacidad.html"],
    "entrepoker.com": ["es/", "en/", "es/salas.html", "es/blog/", "es/noticias/"],
    "climalerta.com": ["en/", "riesgos.html", "difundir.html", "kit-productos.html", "privacidad.html"],
    "realiracing.com": ["gear.html", "merch.html", "blog/", "forum/", "go/", "privacy.html"],
    "tapephoto.com": ["licensing.html", "services.html", "contact.html", "about.html", "blog/", "privacy.html"],
}
# Fetched without following redirects: where do these go?
NOFOLLOW = {
    "entrepoker.com": ["go/ggpoker", "go/888poker"],
}

session = requests.Session()
session.headers.update({"User-Agent": UA, "Accept-Encoding": "gzip, br",
                        "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
                        "Accept-Language": "es-CL,es;q=0.9,en;q=0.8"})


class Blocked(Exception):
    pass


class Site:
    def __init__(self, host, out_root):
        self.host = host
        self.out = os.path.join(out_root, host)
        os.makedirs(os.path.join(self.out, "pages"), exist_ok=True)
        self.rows, self.errors_in_a_row, self.n = [], 0, 0

    def same_site(self, url):
        h = (urlparse(url).hostname or "").lower()
        return h == self.host or h == "www." + self.host

    def fetch(self, kind, url, method="GET", follow=True, save=None):
        if self.errors_in_a_row >= 5:
            raise Blocked(self.host)
        time.sleep(DELAY)
        row = dict.fromkeys(COLS, "")
        row.update(kind=kind, url=url)
        started = time.time()
        resp = None
        try:
            resp = session.request(method, url, allow_redirects=follow, timeout=25)
            body = resp.content if method == "GET" else b""
            row.update(status=resp.status_code, final=resp.url,
                       secs=round(resp.elapsed.total_seconds(), 3), bytes=len(body))
            for h in HDRS:
                row[h] = resp.headers.get(h, "")
            if save and body:
                with open(os.path.join(self.out, save), "wb") as f:
                    f.write(body)
                row["file"] = save
            self.errors_in_a_row = 0
        except requests.RequestException as e:
            row.update(status=0, secs=round(time.time() - started, 3), error=type(e).__name__)
            self.errors_in_a_row += 1
        self.rows.append(row)
        return resp

    def links(self, html, base):
        """(pages, assets) found in html, same site only, in document order, no duplicates."""
        pages, assets = {}, {}
        found = re.findall(r"""(?:href|src|poster)\s*=\s*["']([^"'#\s]+)""", html, re.I)
        found += re.findall(r"""property=["']og:image["'][^>]*content=["']([^"']+)""", html, re.I)
        for raw in found:
            if raw.startswith(("mailto:", "tel:", "javascript:", "data:", "whatsapp:")):
                continue
            url = urljoin(base, raw.replace("&amp;", "&"))
            if not url.startswith("http") or not self.same_site(url):
                continue
            (assets if ASSET_RE.search(urlparse(url).path) else pages)[url] = 1
        return list(pages), list(assets)

    def crawl(self):
        base = f"https://{self.host}/"
        for u in (f"http://{self.host}/", f"http://www.{self.host}/", f"https://www.{self.host}/", base):
            self.fetch("redirect", u, follow=False)
        home = self.fetch("home", base, save="pages/000.html")
        if home is None:
            return
        home_url, home_html = home.url, home.text
        self.fetch("meta", urljoin(base, "robots.txt"), save="robots.txt")
        sm = self.fetch("meta", urljoin(base, "sitemap.xml"), save="sitemap.xml")
        for p in ("zz-nope-404-check", ".git/config", ".env", "composer.json"):
            self.fetch("probe", urljoin(base, p), save="pages/404.html" if p.startswith("zz") else None)
        for p in NOFOLLOW.get(self.host, []):
            self.fetch("nofollow", urljoin(base, p), follow=False)

        pages, assets = self.links(home_html, home_url)
        wanted = [urljoin(base, p) for p in EXTRA.get(self.host, [])] + pages
        wanted = [u for u in dict.fromkeys(wanted) if u.rstrip("/") != home_url.rstrip("/")][:MAX_PAGES]
        seen_pages, more_links = {home_url, base}, {}
        for i, u in enumerate(wanted, 1):
            r = self.fetch("page", u, save=f"pages/{i:03d}.html")
            seen_pages.add(u)
            if r is not None and "html" in r.headers.get("content-type", ""):
                seen_pages.add(r.url)
                p2, a2 = self.links(r.text, r.url)
                more_links.update(dict.fromkeys(p2 + a2))

        for u in assets[:MAX_ASSETS]:
            self.fetch("asset", u, method="HEAD")
        unseen = [u for u in more_links if u not in seen_pages and u not in assets and u not in wanted]
        for u in unseen[:MAX_LINKS]:
            self.fetch("linkcheck", u, method="HEAD")

        locs = re.findall(r"<loc>\s*([^<\s]+)", sm.text) if sm is not None and sm.status_code == 200 else []
        if sm is not None and "<sitemapindex" in sm.text and locs:
            child = self.fetch("meta", locs[0], save="sitemap-child.xml")
            locs = re.findall(r"<loc>\s*([^<\s]+)", child.text) if child is not None else []
        step = max(1, len(locs) // MAX_SITEMAP)
        for u in locs[::step][:MAX_SITEMAP]:
            self.fetch("sitemap", u, method="HEAD")

        subs = {}
        for raw in re.findall(r"""href\s*=\s*["'](https?://[^"'#\s]+)""", home_html, re.I):
            h = (urlparse(raw).hostname or "").lower()
            if h.endswith("." + self.host) and h != "www." + self.host:
                subs[h] = 1
        for h in list(subs)[:MAX_SUBS]:
            self.fetch("subdomain", f"https://{h}/", save=f"pages/sub-{h}.html")
        self.summary = {"host": self.host, "sitemap_urls": len(locs), "home_final_url": home_url}

    def write(self, blocked):
        with open(os.path.join(self.out, "index.tsv"), "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, COLS, delimiter="\t", extrasaction="ignore")
            w.writeheader()
            w.writerows(self.rows)
        s = getattr(self, "summary", {"host": self.host})
        s.update(requests=len(self.rows), failed=sum(1 for r in self.rows if r["status"] == 0),
                 stopped_early=blocked)
        with open(os.path.join(self.out, "summary.json"), "w") as f:
            json.dump(s, f, indent=1)
        return s


def main():
    hosts = os.environ.get("SITES", "").split() or list(EXTRA)
    out_root = os.environ.get("OUT", "out")
    bad = False
    for host in hosts:
        site, blocked = Site(host, out_root), False
        try:
            site.crawl()
        except Blocked:
            blocked = True
        s = site.write(blocked)
        print(json.dumps(s))
        assert s["requests"] >= 1
        bad = bad or blocked or s["requests"] == s["failed"]
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
