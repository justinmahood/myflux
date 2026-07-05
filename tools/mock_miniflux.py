#!/usr/bin/env python3
"""Mock Miniflux API server for testing the myflux frontend.

Mimics the real CORS middleware, X-Auth-Token auth (key: "test-key"),
and the endpoints myflux uses. State is in-memory per process run.
"""
import base64
import json
import os
import random
import re
import time
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

PORT = int(os.environ.get("PORT", 8423))
API_KEY = "test-key"
# INTEGRATIONS=0 simulates a user with no save-to-third-party integration
# configured (myflux should hide its save button and refuse the S shortcut).
HAS_INTEGRATIONS = os.environ.get("INTEGRATIONS", "1") != "0"

random.seed(42)

# ---------- fixtures ----------

CAT_NAMES = ["Tech", "News", "Science", "Business", "Design", "Gaming",
             "Music", "Photography", "Cooking", "Travel", "Sports", "Comics"]
CATEGORIES = [{"id": i + 1, "title": name, "user_id": 1}
              for i, name in enumerate(CAT_NAMES)]

FEED_DEFS = []
_fid = 0
for cat in CATEGORIES:
    for n in range(2):
        _fid += 1
        color = f"hsl({(_fid * 37) % 360},60%,45%)"
        FEED_DEFS.append((_fid, f"{cat['title']} Feed {n + 1}", cat["id"], color,
                          2 if _fid == 3 else 0))


def make_icon_svg(color):
    svg = (f"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'>"
           f"<rect width='16' height='16' rx='3' fill='{color}'/>"
           f"<circle cx='8' cy='8' r='4' fill='white'/></svg>")
    return base64.b64encode(svg.encode()).decode()


ICONS = {i: make_icon_svg(color) for (i, _, _, color, _) in FEED_DEFS}

FEEDS = []
for (fid, title, cat_id, color, errs) in FEED_DEFS:
    cat = next(c for c in CATEGORIES if c["id"] == cat_id)
    FEEDS.append({
        "id": fid,
        "user_id": 1,
        "title": title,
        "site_url": f"https://example{fid}.com",
        "feed_url": f"https://example{fid}.com/feed.xml",
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "parsing_error_count": errs,
        "category": {"id": cat["id"], "title": cat["title"]},
        "icon": {"feed_id": fid, "icon_id": fid},
    })

TITLES = [
    "The quiet revolution in {topic} nobody is talking about",
    "Why {topic} is harder than it looks",
    "A deep dive into {topic}: what we learned after a year",
    "{topic} considered helpful",
    "Ask HN-ish: has {topic} peaked?",
    "New research upends what we thought about {topic}",
    "The {topic} stack in 2026",
    "How we cut our {topic} costs by 90 percent",
    "An oral history of {topic}",
    "{topic}: a postmortem",
]
TOPICS = ["static sites", "RSS readers", "e-ink displays", "battery chemistry",
          "type systems", "coral reefs", "urban transit", "espresso machines",
          "container escapes", "dark matter", "sourdough", "keyboards",
          "protein folding", "compilers", "bird migration", "sleep science"]

LOREM = ("Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer nec "
         "odio in massa vehicula luctus. Praesent posuere, sapien in commodo "
         "ultricies, mi eros pulvinar nisl, non fermentum urna magna vitae elit. "
         "Suspendisse potenti. Vivamus laoreet arcu at ligula pretium, sed "
         "vestibulum nisl volutpat.")


def make_image(seed, w=640, h=360):
    hue = (seed * 47) % 360
    svg = (f"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 {w} {h}'>"
           f"<rect width='{w}' height='{h}' fill='hsl({hue},55%,62%)'/>"
           f"<circle cx='{w*0.3:.0f}' cy='{h*0.4:.0f}' r='{h*0.28:.0f}' fill='hsl({(hue+40)%360},60%,72%)'/>"
           f"<rect x='{w*0.55:.0f}' y='{h*0.5:.0f}' width='{w*0.3:.0f}' height='{h*0.34:.0f}' rx='12' "
           f"fill='hsl({(hue+80)%360},50%,52%)'/></svg>")
    return "data:image/svg+xml;base64," + base64.b64encode(svg.encode()).decode()


def make_content(i, title):
    img = f"<p><img src=\"{make_image(i)}\" alt=\"illustration\"></p>" if i % 3 else ""
    extra = ""
    if i % 5 == 0:
        extra = ("<blockquote><p>The best reader is the one that gets out of "
                 "your way.</p></blockquote>")
    if i % 7 == 0:
        extra += ("<pre><code>def read(feed):\n    for entry in feed:\n"
                  "        yield entry.title</code></pre>")
    if i % 4 == 0:
        extra += ("<ul><li>First takeaway from the piece</li>"
                  "<li>Second, more surprising takeaway</li>"
                  "<li>A third thing worth remembering</li></ul>")
    return (f"<h2>{title}</h2>{img}<p>{LOREM}</p><p>{LOREM[:180]} "
            f"Read the <a href=\"https://example.com/more/{i}\">full analysis</a> "
            f"for details.</p>{extra}<p>{LOREM[80:]}</p>")


ENTRIES = []
now = datetime.now(timezone.utc)
eid = 100
for i in range(140):
    feed = FEEDS[i % len(FEEDS)]
    topic = TOPICS[i % len(TOPICS)]
    title = TITLES[i % len(TITLES)].format(topic=topic)
    age_hours = (i ** 1.35) * 1.7  # a few today, tail over weeks
    published = now - timedelta(hours=age_hours)
    status = "read" if (i % 6 == 4) else "unread"
    ENTRIES.append({
        "id": eid,
        "user_id": 1,
        "feed_id": feed["id"],
        "status": status,
        "hash": f"hash{eid}",
        "title": title,
        "url": f"https://example{feed['id']}.com/posts/{eid}",
        "published_at": published.isoformat(),
        "created_at": published.isoformat(),
        "changed_at": published.isoformat(),
        "content": make_content(i, title),
        "author": random.choice(["Ada L.", "Grace H.", "Alan T.", "", "Edsger D."]),
        "share_code": "",
        "starred": (i % 9 == 2),
        "reading_time": 1 + (i % 11),
        "enclosures": [],
        "feed": {"id": feed["id"], "title": feed["title"],
                 "category": feed["category"], "icon": feed["icon"]},
        "tags": [],
    })
    eid += 1

# One malicious entry to exercise the sanitizer
ENTRIES[1]["title"] = "XSS test entry: this content is hostile"
ENTRIES[1]["content"] = (
    "<p>Before script.</p><script>document.title='PWNED'</script>"
    "<p><img src=x onerror=\"document.title='PWNED-IMG'\"></p>"
    f"<p><img src=\"{make_image(99)}\" alt=\"legit image\" style=\"border:9px solid red\" onclick=\"alert(1)\"></p>"
    "<p><a href=\"javascript:alert(1)\">evil link</a> and "
    "<a href=\"https://example.com/ok\">good link</a></p>"
    "<iframe src=\"https://evil.example\"></iframe>"
    "<form action=\"https://evil.example\"><input name=\"x\"><button>go</button></form>"
    "<style>body{display:none}</style>"
    "<p onmouseover=\"alert(1)\">After. If the page title is not PWNED, sanitization held.</p>")

# One removed entry (should never show up)
ENTRIES[3]["status"] = "removed"

# A few entries "shared from the Miniflux web UI" — the REST API cannot
# create share codes, so only these carry a public share link.
for _e in (ENTRIES[0], ENTRIES[10], ENTRIES[25]):
    _e["share_code"] = f"mockshare{_e['id']}"

FULL_CONTENT = ("<h2>Full scraped content</h2><p>This came from fetch-content. "
                f"</p><p>{LOREM}</p><p>{LOREM}</p><p>{LOREM}</p>")


# ---------- server ----------

class Handler(BaseHTTPRequestHandler):
    # No keep-alive: aborted browser requests (AbortController) otherwise
    # poison pooled connections and hang subsequent fetches.
    protocol_version = "HTTP/1.0"

    def log_message(self, fmt, *args):
        print("%s %s" % (self.command or "?", self.path))

    def handle_one_request(self):
        try:
            super().handle_one_request()
        except (BrokenPipeError, ConnectionResetError):
            self.close_connection = True  # client went away mid-response

    def cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers",
                         "X-Auth-Token, Authorization, Content-Type, Accept")

    def reply(self, code, payload=None):
        body = json.dumps(payload).encode() if payload is not None else b""
        self.send_response(code)
        self.cors()
        if body:
            self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if body:
            self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.cors()
        self.send_header("Access-Control-Max-Age", "3600")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def authed(self):
        if self.headers.get("X-Auth-Token") == API_KEY:
            return True
        self.reply(401, {"error_message": "Access Unauthorized"})
        return False

    def read_body(self):
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            return json.loads(raw)
        except ValueError:
            return {}

    # --- entry filtering ---
    def filter_entries(self, qs, feed_id=None, category_id=None):
        entries = ENTRIES
        if feed_id is not None:
            entries = [e for e in entries if e["feed_id"] == feed_id]
        if category_id is not None:
            entries = [e for e in entries if e["feed"]["category"]["id"] == category_id]
        if "status" in qs:
            entries = [e for e in entries if e["status"] == qs["status"][0]]
        if "starred" in qs:
            want = qs["starred"][0] == "true"
            entries = [e for e in entries if e["starred"] == want]
        if "published_after" in qs:
            cutoff = datetime.fromtimestamp(int(qs["published_after"][0]), timezone.utc)
            entries = [e for e in entries
                       if datetime.fromisoformat(e["published_at"]) > cutoff]
        if "search" in qs:
            q = qs["search"][0].lower()
            entries = [e for e in entries
                       if q in e["title"].lower() or q in e["content"].lower()]
        direction = qs.get("direction", ["desc"])[0]
        entries = sorted(entries, key=lambda e: e["published_at"],
                         reverse=(direction == "desc"))
        total = len(entries)
        offset = int(qs.get("offset", ["0"])[0])
        limit = int(qs.get("limit", ["100"])[0])
        return {"total": total, "entries": entries[offset:offset + limit]}

    def do_GET(self):
        parsed = urlparse(self.path)
        path, qs = parsed.path, parse_qs(parsed.query)
        if not self.authed():
            return

        if path == "/v1/me":
            time.sleep(0.15)
            return self.reply(200, {"id": 1, "username": "justin", "is_admin": True,
                                    "theme": "system", "language": "en_US"})
        if path == "/v1/categories":
            return self.reply(200, CATEGORIES)
        if path == "/v1/feeds":
            return self.reply(200, FEEDS)
        if path == "/v1/feeds/counters":
            unreads, reads = {}, {}
            for e in ENTRIES:
                key = str(e["feed_id"])
                if e["status"] == "unread":
                    unreads[key] = unreads.get(key, 0) + 1
                elif e["status"] == "read":
                    reads[key] = reads.get(key, 0) + 1
            return self.reply(200, {"reads": reads, "unreads": unreads})

        m = re.fullmatch(r"/v1/icons/(\d+)", path)
        if m:
            icon_id = int(m.group(1))
            if icon_id in ICONS:
                return self.reply(200, {"id": icon_id, "mime_type": "image/svg+xml",
                                        "data": "image/svg+xml;base64," + ICONS[icon_id]})
            return self.reply(404, {"error_message": "Icon not found"})

        if path == "/v1/export":
            outlines = "".join(
                f'<outline text="{f["title"]}" xmlUrl="{f["feed_url"]}"/>'
                for f in FEEDS)
            xml = f'<?xml version="1.0"?><opml version="2.0"><body>{outlines}</body></opml>'
            body = xml.encode()
            self.send_response(200)
            self.cors()
            self.send_header("Content-Type", "text/x-opml")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if path == "/v1/entries":
            return self.reply(200, self.filter_entries(qs))
        m = re.fullmatch(r"/v1/feeds/(\d+)/entries", path)
        if m:
            return self.reply(200, self.filter_entries(qs, feed_id=int(m.group(1))))
        m = re.fullmatch(r"/v1/categories/(\d+)/entries", path)
        if m:
            return self.reply(200, self.filter_entries(qs, category_id=int(m.group(1))))
        m = re.fullmatch(r"/v1/entries/(\d+)/fetch-content", path)
        if m:
            time.sleep(0.4)
            return self.reply(200, {"content": FULL_CONTENT})

        if path == "/v1/integrations/status":  # Miniflux >= 2.2.2
            return self.reply(200, {"has_integrations": HAS_INTEGRATIONS})

        self.reply(404, {"error_message": "Not found: " + path})

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if not self.authed():
            return

        m = re.fullmatch(r"/v1/entries/(\d+)/save", path)
        if m:
            if not HAS_INTEGRATIONS:
                return self.reply(400, {"error_message":
                                        "no third-party integration enabled"})
            # Real Miniflux answers 202 with a JSON content-type but an EMPTY
            # body — mimic that exactly; the client must tolerate it.
            time.sleep(0.2)
            self.send_response(202)
            self.cors()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return

        if path == "/v1/discover":
            body = self.read_body()
            url = (body.get("url") or "").rstrip("/")
            if "nofeed" in url:
                return self.reply(200, [])
            results = [{"url": url + "/feed.xml", "title": "Main feed", "type": "rss"}]
            if "blog" in url:
                results.append({"url": url + "/comments.xml",
                                "title": "Comments feed", "type": "atom"})
            time.sleep(0.3)
            return self.reply(200, results)

        if path == "/v1/feeds":
            body = self.read_body()
            feed_url = body.get("feed_url") or ""
            if "broken" in feed_url:
                return self.reply(400, {"error_message": "Unable to fetch this feed"})
            cat = next((c for c in CATEGORIES if c["id"] == body.get("category_id")),
                       CATEGORIES[0])
            new_id = max(f["id"] for f in FEEDS) + 1
            ICONS[new_id] = make_icon_svg("#2bb24c")
            feed = {
                "id": new_id, "user_id": 1,
                "title": feed_url.split("//")[-1].split("/")[0],
                "site_url": feed_url, "feed_url": feed_url,
                "checked_at": datetime.now(timezone.utc).isoformat(),
                "parsing_error_count": 0,
                "category": {"id": cat["id"], "title": cat["title"]},
                "icon": {"feed_id": new_id, "icon_id": new_id},
            }
            FEEDS.append(feed)
            global eid
            for n in range(3):
                published = datetime.now(timezone.utc) - timedelta(hours=n * 5)
                title = f"Fresh article {n + 1} from the new feed"
                ENTRIES.append({
                    "id": eid, "user_id": 1, "feed_id": new_id, "status": "unread",
                    "hash": f"hash{eid}", "title": title,
                    "url": f"{feed_url}/{eid}",
                    "published_at": published.isoformat(),
                    "created_at": published.isoformat(),
                    "changed_at": published.isoformat(),
                    "content": make_content(eid, title),
                    "author": "New Author", "share_code": "", "starred": False,
                    "reading_time": 3, "enclosures": [],
                    "feed": {"id": new_id, "title": feed["title"],
                             "category": feed["category"], "icon": feed["icon"]},
                    "tags": [],
                })
                eid += 1
            time.sleep(0.3)
            return self.reply(201, {"feed_id": new_id})

        if path == "/v1/categories":
            body = self.read_body()
            title = (body.get("title") or "").strip()
            if not title:
                return self.reply(400, {"error_message": "Category title is required"})
            if any(c["title"] == title for c in CATEGORIES):
                return self.reply(400, {"error_message": "This category already exists"})
            new_id = max(c["id"] for c in CATEGORIES) + 1
            cat = {"id": new_id, "title": title, "user_id": 1}
            CATEGORIES.append(cat)
            return self.reply(201, cat)

        if path == "/v1/import":
            length = int(self.headers.get("Content-Length") or 0)
            xml = self.rfile.read(length).decode("utf-8", "replace")
            if "<opml" not in xml:
                return self.reply(400, {"error_message": "Invalid OPML file"})
            return self.reply(201, {"message": "Feeds imported successfully"})

        self.reply(404, {"error_message": "Not found: " + path})

    def do_DELETE(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if not self.authed():
            return

        m = re.fullmatch(r"/v1/feeds/(\d+)", path)
        if m:
            fid = int(m.group(1))
            FEEDS[:] = [f for f in FEEDS if f["id"] != fid]
            ENTRIES[:] = [e for e in ENTRIES if e["feed_id"] != fid]
            return self.reply(204)

        m = re.fullmatch(r"/v1/categories/(\d+)", path)
        if m:
            cid = int(m.group(1))
            # feeds cascade like the real schema (ON DELETE CASCADE)
            gone = {f["id"] for f in FEEDS if f["category"]["id"] == cid}
            CATEGORIES[:] = [c for c in CATEGORIES if c["id"] != cid]
            FEEDS[:] = [f for f in FEEDS if f["id"] not in gone]
            ENTRIES[:] = [e for e in ENTRIES if e["feed_id"] not in gone]
            return self.reply(204)

        self.reply(404, {"error_message": "Not found: " + path})

    def do_PUT(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if not self.authed():
            return

        if path == "/v1/entries":
            body = self.read_body()
            ids = set(body.get("entry_ids") or [])
            status = body.get("status")
            for e in ENTRIES:
                if e["id"] in ids:
                    e["status"] = status
            return self.reply(204)

        m = re.fullmatch(r"/v1/entries/(\d+)/bookmark", path)
        if m:
            entry_id = int(m.group(1))
            for e in ENTRIES:
                if e["id"] == entry_id:
                    e["starred"] = not e["starred"]
                    return self.reply(204)
            return self.reply(404, {"error_message": "Entry not found"})

        m = re.fullmatch(r"/v1/feeds/(\d+)", path)
        if m:
            fid = int(m.group(1))
            feed = next((f for f in FEEDS if f["id"] == fid), None)
            if not feed:
                return self.reply(404, {"error_message": "Feed not found"})
            body = self.read_body()
            if body.get("title"):
                feed["title"] = body["title"]
            if body.get("feed_url"):
                feed["feed_url"] = body["feed_url"]
            if body.get("category_id"):
                cat = next((c for c in CATEGORIES if c["id"] == body["category_id"]), None)
                if cat:
                    feed["category"] = {"id": cat["id"], "title": cat["title"]}
            for e in ENTRIES:
                if e["feed_id"] == fid:
                    e["feed"] = {"id": fid, "title": feed["title"],
                                 "category": feed["category"], "icon": feed["icon"]}
            return self.reply(201, feed)

        m = re.fullmatch(r"/v1/categories/(\d+)", path)
        if m:
            cid = int(m.group(1))
            cat = next((c for c in CATEGORIES if c["id"] == cid), None)
            if not cat:
                return self.reply(404, {"error_message": "Category not found"})
            body = self.read_body()
            if body.get("title"):
                cat["title"] = body["title"]
                for f in FEEDS:
                    if f["category"]["id"] == cid:
                        f["category"]["title"] = cat["title"]
            return self.reply(201, cat)

        m = re.fullmatch(r"/v1/feeds/(\d+)/refresh", path)
        if m:
            return self.reply(204)

        m = re.fullmatch(r"/v1/feeds/(\d+)/mark-all-as-read", path)
        if m:
            fid = int(m.group(1))
            for e in ENTRIES:
                if e["feed_id"] == fid and e["status"] == "unread":
                    e["status"] = "read"
            return self.reply(204)
        m = re.fullmatch(r"/v1/categories/(\d+)/mark-all-as-read", path)
        if m:
            cid = int(m.group(1))
            for e in ENTRIES:
                if e["feed"]["category"]["id"] == cid and e["status"] == "unread":
                    e["status"] = "read"
            return self.reply(204)
        m = re.fullmatch(r"/v1/users/(\d+)/mark-all-as-read", path)
        if m:
            for e in ENTRIES:
                if e["status"] == "unread":
                    e["status"] = "read"
            return self.reply(204)

        self.reply(404, {"error_message": "Not found: " + path})


if __name__ == "__main__":
    print(f"Mock Miniflux listening on http://127.0.0.1:{PORT} (API key: {API_KEY})")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
