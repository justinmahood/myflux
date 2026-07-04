# myflux

A Feedly-style three-pane web frontend for [Miniflux](https://miniflux.app), written in
plain HTML, CSS, and JavaScript. No frameworks, no build step, no dependencies.

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
- Star, read/unread toggle, "download full content" (Miniflux's original-page scraper)
- Feed management: subscribe by website or feed URL (with feed discovery),
  rename/re-categorize/unsubscribe feeds, create/rename/delete categories,
  OPML import/export
- Feedly-style keyboard shortcuts: `j`/`k`, `m`, `s`, `v`, `r`, `/`, `?`
- Light/dark theme (follows the system, manual override)
- Responsive: panes collapse to a drill-in flow on narrow screens
- Installable PWA: add it to your dock/home screen and it opens in its own
  window; the app shell loads offline
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

## Installing as an app (PWA)

Serve myflux over **HTTPS** (or localhost — service workers require a secure
context), then:

- **Desktop Chrome/Edge**: click the install icon in the address bar
- **Android**: browser menu → *Add to Home screen* / *Install app*
- **iOS Safari**: Share → *Add to Home Screen*

The service worker caches the app shell with a network-first strategy: while
online you always get the latest code, and when offline the app still starts
(reading needs the Miniflux server, whose API is never intercepted or cached).

## Notes

- Your server URL and API key are stored in the browser's `localStorage` and sent
  only to your Miniflux server. Use HTTPS.
- Miniflux refreshes feeds on its own schedule; the refresh button re-reads from the
  server, it does not trigger a crawl.
- Deleting a category also deletes its feeds and their entries (that is how the
  Miniflux API behaves); the app warns before doing it.
