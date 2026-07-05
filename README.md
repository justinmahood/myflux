# myflux

A Feedly-style three-pane static web frontend for [Miniflux](https://miniflux.app), written in
plain HTML, CSS, and JavaScript. No frameworks, no dependencies.  

```
┌──────────┬───────────────┬──────────────────────┐
│ feeds &  │ article list  │ reading pane         │
│ folders  │ (magazine)    │                      │
└──────────┴───────────────┴──────────────────────┘
```

## Features

- Three-pane layout: sources sidebar, magazine-style article list, reading pane
- Smart feeds: **All**, **Today**, **Starred**, plus collapsible categories with
  per-feed favicons and unread counts — drag a category header to reorder
  (the order is remembered in the browser), or drag a feed onto another
  category to move it there
- Infinite scroll, unread-only ⇄ all toggle, full-text search, mark-all-as-read
- Star, read/unread toggle, "download full content" (Miniflux's original-page scraper),
  save to a third-party service (Pocket, Wallabag, Readwise, … — whichever
  integration is configured in Miniflux; the button appears only if one is)
- Share: native share sheet on mobile, copy-to-clipboard on desktop. Uses the
  entry's public Miniflux share page when one exists; otherwise the original
  article link (the Miniflux API can't create share links — that's web-UI-only)
- Feed management: subscribe by website or feed URL (with feed discovery),
  rename/re-categorize/unsubscribe feeds, create/rename/delete categories,
  OPML import/export — plus a bulk manager (sidebar gear → Feeds) with
  filtering, multi-select, move-to-category, and mass unsubscribe
- Feedly-style keyboard shortcuts: `j`/`k`, `m`, `s`, `S`, `v`, `r`, `/`, `?`
- Light/dark theme (follows the system, manual override)
- Responsive: panes collapse to a drill-in flow on narrow screens, and the
  platform back gesture (Android back swipe/button, iOS edge swipe) walks
  back down the hierarchy — article → list → sources → exit, like a
  native app
- Installable PWA: add it to your dock/home screen and it opens in its own
  window; the app shell loads offline
- Real offline reading: recent articles are cached locally (everything you
  browse plus the ~100 newest unread), and read/star changes made offline
  sync back automatically when the connection returns
- Feed content is sanitized with a strict allowlist before rendering

## Requirements

- A Miniflux instance, version **2.0.21 or newer** (the API has served CORS headers
  since then, which is what lets a browser app talk to it from another origin)
- An API key: in Miniflux, go to **Settings → API keys → Create a new API key**

## Running it

The app has **no runtime dependencies and needs no build**: it's plain ES
modules, so any static HTTP server can host this directory as-is (browsers
block module imports from `file://`). For a smaller optimized deployment,
`npm run build` emits a bundled `dist/`.

Sign in with your Miniflux server URL (e.g. `https://miniflux.example.com`)
and your API key.

## Development

Dev tooling (Vite + Vitest) is the only place npm is involved:

```sh
npm install
npm run dev        # Vite dev server with HMR on http://localhost:8422
npm test           # Vitest (jsdom) — the whole suite runs in well under a second
npm run test:watch # re-run tests on change
npm run build      # optimized production bundle in dist/
npm run preview    # serve the production build locally
```

The tests in `tests/` import the real modules and cover the HTML sanitizer's
XSS vectors, the API client (auth header, URL/param building, error mapping,
OPML raw bodies, abort signals), state derivations and persistence, category
ordering, and entry-list query building and row rendering.

To try the UI without a real Miniflux instance, run the bundled mock server
(`python3 tools/mock_miniflux.py`) and sign in with `http://127.0.0.1:8423` /
API key `test-key`. See [CLAUDE.md](CLAUDE.md) for the full contributor and
agent guide.

## Deploying (Docker / Google Cloud Run)

The included `Dockerfile` builds the optimized bundle and serves it with
nginx, listening on whatever `PORT` the platform injects (Cloud Run's
contract). Sensible cache headers are set: hashed assets cache forever,
`index.html`/`sw.js`/manifest are always revalidated.

```sh
# Local smoke test
docker build -t myflux .
docker run --rm -p 8080:8080 myflux    # http://localhost:8080

# Cloud Run (uses Cloud Build; no local docker needed)
gcloud run deploy myflux --source . --allow-unauthenticated --region us-central1
```

Cloud Run serves over HTTPS, so the PWA install and service worker work out
of the box. Note that `--allow-unauthenticated` makes the page itself public
(your Miniflux credentials stay in each browser's localStorage, never on this
server) — keep the URL private or put your own auth in front if that bothers
you.

## Installing as an app (PWA)

Serve myflux over **HTTPS** (or localhost — service workers require a secure
context), then:

- **Desktop Chrome/Edge**: click the install icon in the address bar
- **Android**: browser menu → *Add to Home screen* / *Install app*
- **iOS Safari**: Share → *Add to Home Screen*

The service worker caches the app shell with a network-first strategy: while
online you always get the latest code, and when offline the app still starts
(the Miniflux API itself is never intercepted or cached by the service
worker — article data is handled separately, below).

## Offline

myflux keeps a local copy of recent articles in the browser (IndexedDB):
every page you browse while online, plus the ~100 newest unread articles
fetched in the background on each load. When the server is unreachable — or
you have no connection at all — the app starts from this cache and shows an
"Offline" banner.

What works offline:

- Reading cached articles in every view (All/Today/Starred, feeds,
  categories), including search (local, over cached articles only)
- Marking read/unread and starring: changes apply immediately, are queued
  locally (the banner shows the pending count), and sync to Miniflux
  automatically when the connection returns — the refresh button / `r` is
  the manual "try to reconnect" action
- Sharing (copy link / share sheet)

What doesn't: article images (not cached), feed management, mark-all-as-read,
"download full content", and save-to-third-party — those buttons disable
until you're back online.

Notes: logging out wipes the local cache (cached articles are private data).
On iOS, install the app to your Home Screen if you rely on offline reading —
Safari evicts storage for ordinary sites after 7 days of disuse, but
installed apps are exempt.

## Notes

- Your server URL and API key are stored in the browser's `localStorage` and sent
  only to your Miniflux server. Use HTTPS.
- Miniflux refreshes feeds on its own schedule; the refresh button re-reads from the
  server, it does not trigger a crawl.
- Deleting a category also deletes its feeds and their entries (that is how the
  Miniflux API behaves); the app warns before doing it.
