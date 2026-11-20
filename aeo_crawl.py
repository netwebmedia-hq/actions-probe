"""Search + AI-crawler audit: what Google, Bing and the AI bots get from each site.

Same politeness rules as crawl.py: ONE keep-alive session, sites in sequence, a delay
before every request, no sensitive-path probes (they trip the shared host's firewall).
Per site: host redirects, robots.txt rules per crawler token, sitemaps, llms.txt,
the home page fetched with each crawler's user agent, and on-page signals of a sample
of pages. Writes out/aeo/<site>/* and out/aeo/summary.json.
"""
import json
import os
import re
import time
import urllib.robotparser
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse

import requests

DELAY = float(os.environ.get("DELAY", "1.0"))
SITES = os.environ.get("SITES", "").split()
BROWSER = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
           "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
UAS = {
    "Googlebot": "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "bingbot": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/131.0.0.0 Safari/537.36",
    "GPTBot": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)",
    "OAI-SearchBot": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)",
    "ChatGPT-User": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot",
    "PerplexityBot": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)",
    "Perplexity-User": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user)",
    "ClaudeBot": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
    "Claude-SearchBot": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-SearchBot/1.0; +https://www.anthropic.com)",
    "Applebot": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)",
    "CCBot": "CCBot/2.0 (https://commoncrawl.org/faq/)",
}
# robots.txt tokens to evaluate (some are rule-only tokens with no fetcher of their own)
TOKENS = ["Googlebot", "Google-Extended", "bingbot", "GPTBot", "OAI-SearchBot", "ChatGPT-User",
          "PerplexityBot", "Perplexity-User", "ClaudeBot", "Claude-SearchBot", "Claude-User",
          "anthropic-ai", "Applebot", "Applebot-Extended", "CCBot", "meta-externalagent", "Bytespider"]
KEY_PAGES = {
    "dongaston.com": ["billeterasmart/"],
    "netwebmedia.com": ["pricing.html", "services.html", "faq.html", "blog/"],
    "fracmo.ai": ["sdr-ia.html", "pricing.html"],
    "golferos.com": ["noticias/", "tienda/"],
    "marpolis.com": ["tasacion.html"],
    "entrepoker.com": ["es/", "es/salas.html"],
    "climalerta.com": ["kit-productos.html", "riesgos.html"],
    "realiracing.com": ["gear.html", "blog/"],
    "tapephoto.com": ["licensing.html", "services.html"],
}

S = requests.Session()


def get(url, ua=BROWSER, redirects=True):
    time.sleep(DELAY)
    t = time.time()
    try:
        r = S.get(url, headers={"User-Agent": ua, "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                                "Accept-Language": "es-CL,es;q=0.9,en;q=0.8"},
                  timeout=30, allow_redirects=redirects)
        return r, round(time.time() - t, 2), None
    except Exception as e:  # network errors are data here
        return None, round(time.time() - t, 2), str(e)[:200]


class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title, self.meta, self.links, self.alts = "", {}, [], [0, 0]
        self.hreflang, self.canon, self.h1, self.heads, self.jsonld = [], [], [], [], []
        self.lang, self.text, self._stack, self._buf, self._script = "", [], [], [], None

    def handle_starttag(self, tag, a):
        a = dict(a)
        if tag == "html":
            self.lang = a.get("lang", "")
        elif tag == "meta":
            k = (a.get("name") or a.get("property") or "").lower()
            if k:
                self.meta[k] = a.get("content", "")
        elif tag == "link":
            rel = (a.get("rel") or "").lower()
            if rel == "canonical":
                self.canon.append(a.get("href", ""))
            elif rel == "alternate" and a.get("hreflang"):
                self.hreflang.append(a.get("hreflang"))
        elif tag == "a" and a.get("href"):
            self.links.append(a["href"])
        elif tag == "img":
            self.alts[0] += 1
            self.alts[1] += 0 if (a.get("alt") or "").strip() else 1
        elif tag == "script":
            self._script = (a.get("type") or "").lower()
            self._buf = []
        if tag in ("title", "h1", "h2", "h3"):
            self._stack.append(tag)
            self._buf = []

    def handle_endtag(self, tag):
        if tag == "script":
            if self._script == "application/ld+json":
                self.jsonld.append("".join(self._buf))
            self._script = None
        elif self._stack and tag == self._stack[-1]:
            self._stack.pop()
            txt = " ".join("".join(self._buf).split())
            if tag == "title" and not self.title:
                self.title = txt
            elif tag == "h1":
                self.h1.append(txt)
            elif tag in ("h2", "h3"):
                self.heads.append(txt)

    def handle_data(self, d):
        if self._script is not None:
            if self._script == "application/ld+json":
                self._buf.append(d)
            return
        if self._stack:
            self._buf.append(d)
        self.text.append(d)


def ld_types(blobs):
    types, bad = set(), 0

    def walk(o):
        if isinstance(o, dict):
            t = o.get("@type")
            for x in (t if isinstance(t, list) else [t] if t else []):
                types.add(str(x))
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)
    for b in blobs:
        try:
            walk(json.loads(b))
        except Exception:
            bad += 1
    return sorted(types), bad


def analyse(html, url, headers):
    p = Page()
    try:
        p.feed(html)
    except Exception:
        pass
    words = len(re.findall(r"\w+", " ".join(p.text)))
    types, bad = ld_types(p.jsonld)
    host = urlparse(url).netloc
    internal = [l for l in p.links if urlparse(urljoin(url, l)).netloc == host]
    q = [h for h in p.heads if h.endswith("?") or h.startswith("¿") or re.match(r"(?i)(how|what|why|when|where|which|who|can|is|are|do|does|cómo|qué|cuál|cuánto|dónde|por qué)\b", h)]
    m = p.meta
    return {
        "title": p.title, "title_len": len(p.title),
        "desc": m.get("description", ""), "desc_len": len(m.get("description", "")),
        "canonical": p.canon, "robots_meta": m.get("robots", ""), "x_robots": headers.get("x-robots-tag", ""),
        "lang": p.lang, "hreflang": p.hreflang, "og_title": bool(m.get("og:title")), "og_image": bool(m.get("og:image")),
        "twitter_card": m.get("twitter:card", ""), "h1": p.h1[:3], "h1_count": len(p.h1),
        "h2h3": len(p.heads), "question_heads": len(q), "question_examples": q[:4],
        "words": words, "jsonld_types": types, "jsonld_bad": bad,
        "imgs": p.alts[0], "imgs_no_alt": p.alts[1], "internal_links": len(internal),
        "date_meta": {k: m[k] for k in m if k in ("article:published_time", "article:modified_time", "date", "last-modified")},
        "author": m.get("author", ""), "bing_verify": "msvalidate.01" in m, "google_verify": "google-site-verification" in m,
    }


def sitemap_urls(xml):
    locs = re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", xml)
    mods = re.findall(r"<lastmod>\s*([^<\s]+)\s*</lastmod>", xml)
    return locs, mods, "<sitemapindex" in xml


def audit(site):
    out = f"out/aeo/{site}"
    os.makedirs(out, exist_ok=True)
    base = f"https://{site}/"
    res = {"site": site, "errors": []}

    # host / protocol redirects
    res["redirects"] = {}
    for u in (f"http://{site}/", f"https://www.{site}/"):
        r, s, e = get(u, redirects=False)
        res["redirects"][u] = e or f"{r.status_code} -> {r.headers.get('location', '')}"

    # robots.txt
    r, s, e = get(base + "robots.txt")
    robots = r.text if r is not None and r.status_code == 200 else ""
    res["robots_status"] = e or r.status_code
    open(f"{out}/robots.txt", "w", encoding="utf-8").write(robots)
    rp = urllib.robotparser.RobotFileParser()
    rp.parse(robots.splitlines())
    res["robots_allow_home"] = {t: rp.can_fetch(t, base) for t in TOKENS}
    res["robots_named_tokens"] = sorted({m.strip() for m in re.findall(r"(?im)^\s*user-agent:\s*(.+)$", robots)})
    res["robots_has_content_signal"] = bool(re.search(r"(?im)^\s*content-signal:", robots))
    sm_decl = re.findall(r"(?im)^\s*sitemap:\s*(\S+)", robots)
    res["sitemaps_declared"] = sm_decl

    # sitemaps (index -> up to 6 children)
    urls, mods, fetched = [], [], []
    queue = sm_decl or [base + "sitemap.xml"]
    while queue and len(fetched) < 8:
        u = queue.pop(0)
        r, s, e = get(u)
        fetched.append([u, e or r.status_code])
        if r is None or r.status_code != 200:
            continue
        locs, lm, is_index = sitemap_urls(r.text)
        if is_index:
            queue.extend(locs[:6])
        else:
            urls.extend(locs)
            mods.extend(lm)
    res["sitemaps_fetched"] = fetched
    res["sitemap_url_count"] = len(set(urls))
    res["sitemap_latest_lastmod"] = max(mods) if mods else ""
    res["sitemap_other_host"] = sum(1 for u in urls if urlparse(u).netloc not in (site, "www." + site))

    # llms.txt
    for f in ("llms.txt", "llms-full.txt"):
        r, s, e = get(base + f)
        ok = r is not None and r.status_code == 200 and "<html" not in r.text[:500].lower()
        res[f] = {"status": e or r.status_code, "bytes": len(r.content) if r is not None else 0, "real_text": ok}
        if ok:
            open(f"{out}/{f}", "w", encoding="utf-8").write(r.text)

    # soft-404 check
    r, s, e = get(base + "zz-search-audit-missing-page-2026")
    res["missing_page_status"] = e or r.status_code

    # sample pages: home, key pages, spread of sitemap URLs
    picks = [base] + [base + p for p in KEY_PAGES.get(site, [])]
    su = sorted(set(u for u in urls if urlparse(u).netloc in (site, "www." + site)))
    if su:
        step = max(1, len(su) // 5)
        picks += su[::step][:5]
    seen, pages = set(), []
    for i, u in enumerate(picks):
        if u in seen:
            continue
        seen.add(u)
        r, s, e = get(u)
        row = {"url": u, "secs": s, "error": e}
        if r is not None:
            row.update(status=r.status_code, final=r.url, bytes=len(r.content))
            if r.status_code == 200 and "html" in r.headers.get("content-type", ""):
                fn = f"{out}/page{i:02d}.html"
                open(fn, "w", encoding="utf-8").write(r.text)
                row["file"] = fn
                row.update(analyse(r.text, r.url, {k.lower(): v for k, v in r.headers.items()}))
        pages.append(row)
    res["pages"] = pages

    # the home page as each crawler sees it (browser first as the baseline)
    home = pages[0] if pages else {}
    res["bots"] = {"browser": {"status": home.get("status"), "bytes": home.get("bytes"), "title": home.get("title")}}
    for name, ua in UAS.items():
        r, s, e = get(base, ua)
        if r is None:
            res["bots"][name] = {"error": e}
            continue
        t = re.search(r"(?is)<title[^>]*>(.*?)</title>", r.text)
        res["bots"][name] = {"status": r.status_code, "bytes": len(r.content), "secs": s,
                             "title": " ".join(t.group(1).split()) if t else "",
                             "server": r.headers.get("server", "")}
    # an inner page as the AI search fetchers see it
    inner = next((p["url"] for p in pages[1:] if p.get("status") == 200), None)
    if inner:
        res["bots_inner"] = {"url": inner}
        for name in ("GPTBot", "OAI-SearchBot", "PerplexityBot", "ClaudeBot"):
            r, s, e = get(inner, UAS[name])
            res["bots_inner"][name] = e or r.status_code
    # did the bot run get us blocked? one more browser fetch
    r, s, e = get(base)
    res["browser_after"] = e or r.status_code
    return res


def main():
    os.makedirs("out/aeo", exist_ok=True)
    allres = []
    for site in SITES:
        print(f"== {site}", flush=True)
        try:
            res = audit(site)
        except Exception as e:
            res = {"site": site, "fatal": str(e)[:300]}
        allres.append(res)
        b = res.get("bots", {})
        print(json.dumps({"site": site, "robots": res.get("robots_status"), "sitemap_urls": res.get("sitemap_url_count"),
                          "llms": res.get("llms.txt", {}).get("status"),
                          "bots": {k: v.get("status", v.get("error")) for k, v in b.items()},
                          "after": res.get("browser_after")}), flush=True)
        json.dump(allres, open("out/aeo/summary.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
