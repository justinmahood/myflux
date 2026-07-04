/* Entry point: boot, login flow, theme. */
import { api, ApiError } from "./api.js";
import { state } from "./state.js";
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

async function showApp() {
  document.getElementById("login-view").hidden = true;
  document.getElementById("app-view").hidden = false;
  document.getElementById("user-name").textContent = state.user.username;
  await sidebar.load();
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
    await showApp();
  } catch (err) {
    showLogin(loginErrorMessage(err));
  } finally {
    submit.disabled = false;
    submit.textContent = "Sign in";
  }
}

function logout() {
  state.clearCreds();
  location.reload();
}

/* --- boot --- */

state.loadPrefs();
applyTheme();

list.init();
reader.init();
shortcuts.init();
manage.init();

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
window.App = { api, state, sidebar, list, reader, manage, nav, toast };

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
    // Stored credentials no longer work (or server unreachable)
    showLogin(loginErrorMessage(err));
  }
} else {
  showLogin();
}
