/* Entry point: boot, login flow, theme, connectivity orchestration. */
import { api, ApiError, isNetworkError } from "./api.js";
import { state } from "./state.js";
import { offline, applyQueueToCounters } from "./offline.js";
import { sidebar } from "./sidebar.js";
import { list } from "./entrylist.js";
import { reader } from "./reader.js";
import { shortcuts } from "./shortcuts.js";
import { manage } from "./manage.js";
import { nav, toast } from "./ui.js";

const COUNTER_REFRESH_MS = 60_000;

/* --- theme ---
 * Colors are defined with CSS light-dark(); switching themes is just a
 * matter of forcing color-scheme via the data-theme attribute. */
const THEME_ICONS = {
  auto: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" stroke="none"/></svg>',
  light: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  dark: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/></svg>',
};

function applyTheme() {
  const { theme } = state.prefs;
  if (theme === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  const btn = document.getElementById("theme-toggle");
  btn.innerHTML = THEME_ICONS[theme] ?? THEME_ICONS.auto;
  btn.title = `Theme: ${theme}`;
}

function cycleTheme() {
  const order = ["auto", "light", "dark"];
  const cur = order.indexOf(state.prefs.theme);
  state.prefs.theme = order[(cur + 1) % order.length];
  state.savePrefs();
  applyTheme();
}

/* --- views --- */

function showLogin(errorMsg) {
  document.getElementById("app-view").hidden = true;
  document.getElementById("login-view").hidden = false;
  const errEl = document.getElementById("login-error");
  errEl.textContent = errorMsg ?? "";
  errEl.hidden = !errorMsg;
  if (state.creds) {
    document.getElementById("login-url").value = state.creds.url;
  }
}

function revealApp() {
  document.getElementById("login-view").hidden = true;
  document.getElementById("app-view").hidden = false;
  document.getElementById("user-name").textContent = state.user.username;
  nav.enterApp();
}

async function showApp() {
  revealApp();
  // Replay offline changes BEFORE the first fetches, so the unread page
  // doesn't resurrect entries read offline and counters post-date the sync.
  await offline.flush();
  // Fire-and-forget: hide the save button if the server says no integration
  // is configured. Endpoint requires Miniflux 2.2.2+; on failure keep the
  // optimistic default (button visible).
  api.integrationsStatus().then((res) => {
    state.hasIntegrations = Boolean(res?.has_integrations);
    reader.syncButtons();
  }, () => {});
  await sidebar.load();
  list.show({ type: "all", id: null, title: "All" });
  navigator.storage?.persist?.().catch(() => {}); // resist storage eviction
  offline.prefetch(); // newest unread, so offline works without browsing
}

/* No network, but we have a snapshot from a previous session: start the
 * app read-mostly from the IndexedDB cache. */
async function bootOffline(snapshot) {
  state.user = snapshot.user;
  state.categories = snapshot.categories ?? [];
  state.setFeeds(snapshot.feeds ?? []);
  state.hasIntegrations = snapshot.hasIntegrations ?? true;
  const [queue, cached] = await Promise.all(
    [offline.getQueue(), offline.getCachedEntries()]);
  state.counters = applyQueueToCounters(
    snapshot.counters ?? { reads: {}, unreads: {} },
    queue,
    new Map(cached.map((e) => [e.id, e])));
  state.setConnectivity(false);
  revealApp();
  sidebar.render();
  sidebar.loadIcons(); // cache-only while offline
  list.show({ type: "all", id: null, title: "All" });
}

function loginErrorMessage(err) {
  if (err instanceof ApiError) {
    if (err.status === 401 || err.status === 403) {
      return "Authentication failed — check your API key.";
    }
    return `Server error (HTTP ${err.status}) — is this a Miniflux instance?`;
  }
  return "Could not reach the server. Check the URL, and make sure the " +
    "instance is Miniflux 2.0.21+ (older versions don't allow browser API access).";
}

async function handleLogin(event) {
  event.preventDefault();
  const url = document.getElementById("login-url").value;
  const key = document.getElementById("login-key").value.trim();
  const submit = document.getElementById("login-submit");
  submit.disabled = true;
  submit.textContent = "Signing in…";
  try {
    api.configure(url, key);
    state.user = await api.me();
    state.saveCreds(api.base, key);
    // A different account must not inherit the previous one's cached articles.
    const snapshot = await offline.loadSnapshot();
    if (snapshot && snapshot.accountKey !== offline.accountKey()) {
      await offline.clearAll();
    }
    await showApp();
  } catch (err) {
    showLogin(loginErrorMessage(err));
  } finally {
    submit.disabled = false;
    submit.textContent = "Sign in";
  }
}

async function logout() {
  state.clearCreds();
  // Cached articles are private data; destroy() is timeout-raced internally.
  await offline.destroy().catch(() => {});
  location.reload();
}

/* --- boot --- */

state.loadPrefs();
applyTheme();

nav.init();
offline.init();
list.init();
reader.init();
shortcuts.init();
manage.init();

// Reconnect orchestration (kept here so offline.js never imports panes):
// coming back online replays the queue, refreshes counters, swaps a
// cache-rendered list for fresh data, and tops up the offline cache.
state.addEventListener("connectivity", async (e) => {
  list.syncControls();
  reader.syncButtons();
  if (e.detail.offline) return;
  await offline.flush();
  sidebar.refreshCounters();
  if (list.offlineRendered) list.show({ ...state.selection });
  offline.prefetch();
});

document.getElementById("login-form").addEventListener("submit", handleLogin);
document.getElementById("logout-btn").addEventListener("click", logout);
document.getElementById("theme-toggle").addEventListener("click", cycleTheme);
document.getElementById("nav-sidebar").addEventListener("click", () => nav.showSidebar());
document.getElementById("nav-list").addEventListener("click", () => nav.showList());

setInterval(() => {
  if (!document.getElementById("app-view").hidden && !document.hidden) {
    sidebar.refreshCounters();
  }
}, COUNTER_REFRESH_MS);

// Console/debugging handle (also used by the test harness).
window.App = { api, state, sidebar, list, reader, manage, nav, toast, offline };

// PWA: needs a secure context (https or localhost); a no-op elsewhere.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => { /* not fatal */ });
}

const creds = state.loadCreds();
if (creds?.url && creds?.key) {
  api.configure(creds.url, creds.key);
  try {
    state.user = await api.me();
    await showApp();
  } catch (err) {
    // Server unreachable (covers mid-boot failures inside showApp too):
    // start from the offline snapshot if one exists for this server.
    const snapshot = isNetworkError(err) ? await offline.loadSnapshot() : null;
    if (snapshot?.accountKey?.startsWith(`${api.base}:`)) {
      await bootOffline(snapshot);
    } else {
      // Stored credentials no longer work (or server unreachable, no cache)
      showLogin(loginErrorMessage(err));
    }
  }
} else {
  showLogin();
}
