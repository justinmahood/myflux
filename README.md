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
  (the order is remembered in the browser)
- Infinite scroll, unread-only ⇄ all toggle, full-text search, mark-all-as-read
- Star, read/unread toggle, "download full content" (Miniflux's original-page scraper)
- Feed management: subscribe by website or feed URL (with feed discovery),
  rename/re-categorize/unsubscribe feeds, create/rename/delete categories,
  OPML import/export
- Feedly-style keyboard shortcuts: `j`/`k`, `m`, `s`, `v`, `r`, `/`, `?`
- Light/dark theme (follows the system, manual override)
- Responsive: panes collapse to a drill-in flow on narrow screens
- Feed content is sanitized with a strict allowlist before rendering

## Requirements

- A Miniflux instance, version **2.0.21 or newer** (the API has served CORS headers
  since then, which is what lets a browser app talk to it from another origin)
- An API key: in Miniflux, go to **Settings → API keys → Create a new API key**

## Running it

There is no build step, but the app uses ES modules, so it must be served
over HTTP (browsers block module imports from `file://`). Any static server
works:

- `python3 -m http.server 8422` in this directory, or
- drop it behind any web server / static host

Then sign in with your Miniflux server URL (e.g. `https://miniflux.example.com`)
and your API key.

## Testing

The test suite is as dependency-free as the app: it's a plain web page that
imports the real ES modules and runs assertions in the browser (the sanitizer
needs a real DOM anyway).

Serve the directory and open [`/tests/`](tests/index.html) — results render on
the page, the tab title shows pass/fail, and `window.__testResults` holds a
machine-readable summary for headless runs. The suite covers the HTML
sanitizer's XSS vectors, the API client (auth header, URL/param building,
error mapping, OPML raw bodies), state derivations and persistence, category
ordering, and entry-list query building and row rendering. Tests snapshot and
restore the app's `myflux.*` localStorage keys, so running them won't touch
your login or preferences.

## Notes

- Your server URL and API key are stored in the browser's `localStorage` and sent
  only to your Miniflux server. Use HTTPS.
- Miniflux refreshes feeds on its own schedule; the refresh button re-reads from the
  server, it does not trigger a crawl.
- Deleting a category also deletes its feeds and their entries (that is how the
  Miniflux API behaves); the app warns before doing it.
