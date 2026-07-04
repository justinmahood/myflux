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
  per-feed favicons and unread counts
- Infinite scroll, unread-only ⇄ all toggle, full-text search, mark-all-as-read
- Star, read/unread toggle, "download full content" (Miniflux's original-page scraper)
- Feedly-style keyboard shortcuts: `j`/`k`, `m`, `s`, `v`, `r`, `/`, `?`
- Light/dark theme (follows the system, manual override)
- Responsive: panes collapse to a drill-in flow on narrow screens
- Feed content is sanitized with a strict allowlist before rendering

## Requirements

- A Miniflux instance, version **2.0.21 or newer** (the API has served CORS headers
  since then, which is what lets a browser app talk to it from another origin)
- An API key: in Miniflux, go to **Settings → API keys → Create a new API key**

## Running it

There is no build step. Either:

- open `index.html` directly in a browser, or
- serve the directory statically, e.g. `python3 -m http.server 8422`,
  or drop it behind any web server / static host

Then sign in with your Miniflux server URL (e.g. `https://miniflux.example.com`)
and your API key.

## Notes

- Your server URL and API key are stored in the browser's `localStorage` and sent
  only to your Miniflux server. Use HTTPS.
- This is a reader: subscriptions and categories are still managed in the Miniflux UI.
- Miniflux refreshes feeds on its own schedule; the refresh button re-reads from the
  server, it does not trigger a crawl.
