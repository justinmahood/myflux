/* Boot, login flow, theme, mobile navigation, toasts. */
(function () {
  "use strict";
  window.App = window.App || {};
  const state = () => App.state;

  const COUNTER_REFRESH_MS = 60000;

  /* --- toast --- */
  let toastTimer = null;
  App.toast = function (message, isError) {
    const el = document.getElementById("toast");
    el.textContent = message;
    el.classList.toggle("error", Boolean(isError));
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 4000);
  };

  /* --- mobile drill-in navigation (no-ops on wide screens, CSS-gated) --- */
  App.nav = {
    set(pane) {
      document.body.classList.remove("show-sidebar", "show-list", "show-reader");
      document.body.classList.add("show-" + pane);
    },
    showSidebar() { this.set("sidebar"); },
    showList() { this.set("list"); },
    showReader() { this.set("reader"); },
  };

  /* --- theme --- */
  const THEME_ICONS = {
    auto: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" stroke="none"/></svg>',
    light: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    dark: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/></svg>',
  };

  function applyTheme() {
    const theme = state().prefs.theme;
    if (theme === "auto") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    const btn = document.getElementById("theme-toggle");
    btn.innerHTML = THEME_ICONS[theme] || THEME_ICONS.auto;
    btn.title = "Theme: " + theme;
  }

  function cycleTheme() {
    const order = ["auto", "light", "dark"];
    const cur = order.indexOf(state().prefs.theme);
    state().prefs.theme = order[(cur + 1) % order.length];
    state().savePrefs();
    applyTheme();
  }

  /* --- views --- */
  function showLogin(errorMsg) {
    document.getElementById("app-view").hidden = true;
    document.getElementById("login-view").hidden = false;
    const errEl = document.getElementById("login-error");
    errEl.textContent = errorMsg || "";
    errEl.hidden = !errorMsg;
    if (state().creds) {
      document.getElementById("login-url").value = state().creds.url;
    }
  }

  async function showApp() {
    document.getElementById("login-view").hidden = true;
    document.getElementById("app-view").hidden = false;
    document.getElementById("user-name").textContent = state().user.username;
    await App.sidebar.load();
    App.list.show({ type: "all", id: null, title: "All" });
  }

  function loginErrorMessage(err) {
    if (err instanceof App.ApiError) {
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
      App.api.configure(url, key);
      state().user = await App.api.me();
      state().saveCreds(App.api.base, key);
      await showApp();
    } catch (err) {
      showLogin(loginErrorMessage(err));
    } finally {
      submit.disabled = false;
      submit.textContent = "Sign in";
    }
  }

  function logout() {
    state().clearCreds();
    location.reload();
  }

  /* --- boot --- */
  async function boot() {
    state().loadPrefs();
    applyTheme();

    App.list.init();
    App.reader.init();
    App.shortcuts.init();
    App.manage.init();

    document.getElementById("login-form").addEventListener("submit", handleLogin);
    document.getElementById("logout-btn").addEventListener("click", logout);
    document.getElementById("theme-toggle").addEventListener("click", cycleTheme);
    document.getElementById("nav-sidebar").addEventListener("click", () => App.nav.showSidebar());
    document.getElementById("nav-list").addEventListener("click", () => App.nav.showList());

    setInterval(() => {
      if (!document.getElementById("app-view").hidden && !document.hidden) {
        App.sidebar.refreshCounters();
      }
    }, COUNTER_REFRESH_MS);

    const creds = state().loadCreds();
    if (creds && creds.url && creds.key) {
      App.api.configure(creds.url, creds.key);
      try {
        state().user = await App.api.me();
        await showApp();
        return;
      } catch (err) {
        // Stored credentials no longer work (or server unreachable)
        showLogin(loginErrorMessage(err));
        return;
      }
    }
    showLogin();
  }

  // Scripts load with `defer`, so the DOM is fully parsed by the time this runs.
  boot();
})();
