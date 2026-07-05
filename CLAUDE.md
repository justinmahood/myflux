# CLAUDE.md — myflux

Feedly-style three-pane web frontend for a self-hosted [Miniflux](https://miniflux.app)
instance. Pure HTML/CSS/vanilla-JS ES modules; installable PWA. This file is the
orientation guide for agentic changes — update it when an invariant changes.

## Hard constraints (do not violate)

1. **Zero runtime dependencies.** No frameworks, no runtime npm packages, no CDN
   scripts. npm exists for dev tooling only (Vite dev server/build, Vitest).
2. **The build is optional.** The app must keep working unbundled — any static
   HTTP server serving the repo root runs it as-is. Never import from
   `node_modules` in `js/`, never use Vite-only syntax (`import.meta.env`,
   aliases) in app code, never move the PWA files (`sw.js`,
   `manifest.webmanifest`, `icons/`) into `public/` — they live at the repo
   root precisely so unbundled serving works; a plugin in `vite.config.js`
   copies them into `dist/` at build time.
3. **All feed content is hostile.** HTML from the Miniflux API renders only
   through `sanitizeHtml()` in [js/sanitize.js](js/sanitize.js). Never assign
   untrusted strings to `innerHTML`. New content surfaces must go through the
   sanitizer; extend its `ALLOWED`/`DROP` tables rather than bypassing it.
4. **Prefer modern Baseline platform features over hand-rolled code** — the
   house style already uses: EventTarget/CustomEvent, AbortController,
   `<dialog>`, the Popover API, `method="dialog"` close buttons, CSS
   `light-dark()`, `Map.groupBy`, `URL.canParse`, IntersectionObserver.
   Check cross-engine Baseline status before adopting anything newer.

## Architecture

One page ([index.html](index.html)), three singleton panes, one entry module.

| File | Owns |
|------|------|
| `js/app.js` | Entry point: boot, login flow, theme cycling, SW registration. Assigns `window.App` (console/debug handle only — and the browser-verification harness uses it) |
| `js/api.js` | Miniflux REST client. `X-Auth-Token` auth, base-URL normalization, every endpoint as a method, `ApiError`, abort-signal support, **connectivity classification** (`isNetworkError`, `setConnectivity` hooks) |
| `js/state.js` | `AppState extends EventTarget` singleton: creds/prefs (localStorage), feeds/categories/counters, selection, entries, `IconCache`, `offline` flag + `setConnectivity()` |
| `js/db.js` | Promise wrapper over IndexedDB (`myflux` DB: `entries`/`meta`/`queue` stores). Reads the `indexedDB` global lazily so tests can stub it |
| `js/offline.js` | Offline data layer: cached-entry persistence, snapshots, **the pending-op queue + replay rules**, `filterCached()`, prefetch/prune, the offline banner. Imports only leaf modules (api/state/db/ui) |
| `js/sanitize.js` | Allowlist sanitizer (builds a fresh tree; unknown tags unwrap, dangerous tags drop), `textOf()` snippets, `firstImage()` thumbnails |
| `js/sidebar.js` | Left pane: smart feeds, category tree, unread badges, favicons, drag-and-drop (category reorder + feed→category move) with edge auto-scroll |
| `js/entrylist.js` | Middle pane: magazine rows, infinite scroll, **the optimistic read/star mutations** (`setStatus`/`toggleStar`) shared with the reader |
| `js/reader.js` | Right pane: sanitized article rendering, star/read/save-to-third-party/share/fetch-content/open actions |
| `js/manage.js` | All dialogs: add feed (discover flow), edit feed, tabbed Manage (bulk feed manager, category CRUD, OPML), `moveFeed()` |
| `js/shortcuts.js` | Global keymap: `j`/`k`/`m`/`s`/`S`/`v`/`r`, `/`, `?` |
| `js/ui.js` | `toast()` + `nav` (mobile drill-in panes bound to the History API) |

**Module communication:** direct imports plus CustomEvents on `state`
(currently just `"entry-updated"`). Circular imports exist (sidebar ↔
entrylist ↔ reader ↔ manage) and are safe because all cross-module calls
happen at runtime, never during module evaluation — keep it that way: no
module-level code that touches another module or the DOM.

## Invariants & gotchas

- **`sw.js`:** bump the `CACHE` name (`myflux-shell-vN`) whenever service-worker
  behavior changes, or installed clients keep the stale shell. The SW must
  never intercept `/v1/` (co-hosted Miniflux setups would break/cache auth'd
  data). Strategy is network-first — don't "optimize" it to cache-first, that
  can mix old/new module versions.
- **Mobile nav is history:** panes form a hierarchy (`sidebar` 0, `list` 1,
  `reader` 2) in `js/ui.js`. Deeper pushes an entry, shallower travels with
  `history.go(delta)`, same-level replaces. `nav.enterApp()` builds the
  `[sidebar, list]` base stack when the logged-in app appears. The `900px`
  breakpoint must stay in sync between the CSS media query and `nav.isMobile()`.
- **Miniflux API facts** (verified against the miniflux/v2 source):
  - CORS is `Access-Control-Allow-Origin: *` since 2.0.21 — the browser calls
    the API directly; no proxy exists or is needed.
  - `GET /v1/entries` accepts a **single** `status` value. For "all", omit it
    and filter `status === "removed"` client-side (entrylist does).
  - `DELETE /v1/categories/{id}` **cascades** to the category's feeds and their
    entries (`ON DELETE CASCADE`). Any deletion UI must warn with the count.
  - `GET /v1/icons/{id}` returns `{data: "image/png;base64,…"}` — prefix
    `"data:"` before use.
  - `PUT /v1/entries` is the batch read/unread endpoint;
    `PUT /v1/entries/{id}/bookmark` toggles starred.
  - `POST /v1/entries/{id}/save` sends an entry to the user's configured
    third-party integration (fire-and-forget, not a toggle). It answers
    **202 with a JSON content-type but an empty body** — `api.request()`
    tolerates empty JSON bodies for this reason.
  - `GET /v1/integrations/status` (`{has_integrations}`) exists only since
    Miniflux **2.2.2**. Treat a failed probe as "integrations available"
    (`state.hasIntegrations` defaults `true`): hiding the save button is a
    hint, not a gate — the save call itself 400s with a readable message.
  - **Share codes cannot be created via the REST API** (verified against
    `internal/api/api.go`): `POST /entry/share/{id}` is a session-cookie
    web-UI route with no `/v1` equivalent, so entries only carry a non-empty
    `share_code` if shared from the Miniflux UI. The public page is
    `GET {base}/share/{share_code}` (`api.shareUrl`); the reader's share
    action falls back to the entry's original URL and labels which link
    the user got. Don't try to call the UI route from the browser — it has
    no CORS headers and Lax cookies won't ride cross-origin anyway.
- **Optimistic updates** live only in `entrylist.js` (`setStatus`,
  `toggleStar`): mutate the entry + unread counters, emit `"entry-updated"`,
  revert + error-toast on API failure. Rows and the reader both react to that
  event. Route new mutations through this pattern; don't invent parallel paths.
- **Deletion flows** must handle "the current selection no longer exists" —
  fall back to the All view (see `manage.deleteFeed`/`refreshAfterBulk`).
- **Offline lives entirely at the app layer** (IndexedDB via `js/db.js` +
  `js/offline.js`) — `sw.js` was deliberately NOT touched for it and still
  never caches `/v1/`. New `js/` modules are runtime-cached by the SW
  automatically; adding one does not require a `CACHE` bump.
- **Connectivity is classified in exactly one place**: `api.request()`.
  Network failure = `TypeError` from fetch (`isNetworkError`); any *served*
  response (even 4xx/5xx) flips back online. `window` online/offline events
  are hints only — "online" merely triggers `offline.probe()`; the flag
  flips online only when a real request succeeds.
- **The offline queue is fed only from `setStatus`/`toggleStar`** (their
  network-failure branches). Rules: status ops coalesce latest-wins and
  carry the ORIGINAL `prevStatus` — circling back deletes the op (this is
  what makes `applyQueueToCounters` sound); star ops net out in pairs
  because `PUT /v1/entries/{id}/bookmark` is a **toggle**, not idempotent.
  Queue mutations are serialized (`offline.serialize`) — read-modify-write
  across transactions must not interleave. Flush: network/5xx keep ops,
  4xx drops them (poison-pill prevention). The `queue` store must never be
  destructively migrated; `entries`/`meta` may be.
- **Reconnect orchestration lives in app.js** (the `"connectivity"`
  listener), keeping `offline.js` free of pane imports. On online boot the
  flush runs **before** the first sidebar/list fetches. `logout()` destroys
  the IndexedDB database (cached articles are private data) and
  `offline.init()` must not touch the DB while logged out, or it re-creates
  an empty shell right after that destroy.
- **CSS:** one stylesheet, tokens in `:root` via `light-dark()`; manual theme
  override is just `data-theme` forcing `color-scheme`. The global
  `[hidden] { display: none !important; }` exists because class `display`
  rules beat the `hidden` attribute. Scroll containers inside flex/grid need
  `min-height: 0` (already applied — a classic silent breaker).
- **localStorage keys:** `myflux.creds`, `myflux.prefs`, `myflux.icons`.
  IndexedDB: one database `myflux` (stores `entries`, `meta`, `queue`).

## Dev workflow

```sh
npm install
npm run dev    # Vite on http://localhost:8422 (strictPort)
npm test       # Vitest + jsdom, tests/*.test.js, < 1s
npm run build  # dist/; PWA root files copied in by the vite.config.js plugin
```

### Mock Miniflux server

[tools/mock_miniflux.py](tools/mock_miniflux.py) (Python stdlib only):

```sh
python3 tools/mock_miniflux.py          # http://127.0.0.1:8423  (PORT env to override)
```

Log in with URL `http://127.0.0.1:8423` and API key `test-key` to exercise the
full UI without a real Miniflux. It mimics the real CORS middleware and every
endpoint the app uses, with seeded data: 12 categories × 2 feeds, ~140 entries
including a hostile XSS entry (sanitizer check) and a `removed` entry
(filtering check). State is in-memory per run; keep-alive is disabled on
purpose (aborted browser fetches poison pooled connections otherwise).
Env toggles: `INTEGRATIONS=0` (no save integration), `FAIL_WRITES=1` (every
PUT returns 500 — exercises the offline queue's keep-on-server-error branch).
Killing/restarting the process is the server-unreachable simulation for
offline testing.

### Testing conventions

- Import the real modules; no test globals (`import { test, expect } from "vitest"`).
- `fetch` is stubbed via `vi.stubGlobal` (pattern in `tests/api.test.js`).
- Module singletons (`api`, `sidebar`, `list`, `manage`) are spied with
  `vi.spyOn`; `ui.js` is `vi.mock`ed where `toast`/`nav` would touch DOM that
  doesn't exist in a bare jsdom document (pattern in `tests/manage.test.js`).
- `state` is a per-file shared singleton — each test sets every field it reads.
- IndexedDB-touching tests use the `fake-indexeddb` devDependency:
  `vi.stubGlobal("indexedDB", new IDBFactory())` plus `await db.close()` in
  `beforeEach` gives each test a pristine database (pattern in
  `tests/db.test.js` / `tests/offline-queue.test.js`).
- jsdom can't exercise: IntersectionObserver pagination, rAF auto-scroll, real
  drag-and-drop, the service worker. Verify those in a browser.

### Browser verification (for agents)

The preview/headless page often reports `visibilityState === "hidden"`, where
Chrome suspends **both** requestAnimationFrame and IntersectionObserver
callbacks. Never wait on observers or rAF there — call the logic directly
(e.g. `App.list.load(false)`) or shim rAF onto `setTimeout` for the test.
Synthetic `DragEvent`s with a real `DataTransfer` work for drag-and-drop, but
only while the sidebar is actually visible — in mobile mode it's
`display: none` and every rect is zero, which silently garbles midpoint math.

## Deployment

`Dockerfile`: node:22-alpine builds → nginx:alpine serves `dist/` on `${PORT}`
(Cloud Run's contract, via the `nginx.conf.template` envsubst mechanism).
The cache policy is deliberate and PWA-critical: `/assets/` immutable for a
year, `index.html`/`sw.js`/manifest `no-cache`. Weakening the no-cache rules
stalls updates for installed apps.

## Style

- Match existing idioms: object-literal modules with `init()`, arrow handlers,
  `?.`/`??`, `replaceChildren`, template literals, `const` everywhere.
- Comments only where the code can't speak — constraints and why-nots (see the
  headers in `sw.js` and `sanitize.js`), never narration.
- Behavior changes come with tests; run `npm test` before committing.
- Commits: imperative one-line summary + a body that explains what and why
  (see `git log` for the register).
