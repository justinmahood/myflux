/* Central app state, tiny pub/sub, and localStorage persistence. */
(function () {
  "use strict";
  window.App = window.App || {};

  const CREDS_KEY = "myflux.creds";
  const PREFS_KEY = "myflux.prefs";
  const ICONS_KEY = "myflux.icons";

  const state = {
    creds: null, // { url, key }
    prefs: {
      theme: "auto",      // auto | light | dark
      unreadOnly: true,
      collapsed: {},       // categoryId -> true
    },

    user: null,
    categories: [],
    feeds: [],
    feedsById: new Map(),
    counters: { reads: {}, unreads: {} },

    selection: { type: "all", id: null, title: "All" },
    entries: [],
    selectedEntryId: null,
    search: "",

    // --- events ---
    _listeners: {},
    on(event, fn) {
      (this._listeners[event] = this._listeners[event] || []).push(fn);
    },
    emit(event, data) {
      for (const fn of this._listeners[event] || []) fn(data);
    },

    // --- derived ---
    feedTitle(feedId) {
      const feed = this.feedsById.get(feedId);
      return feed ? feed.title : "";
    },
    unreadTotal() {
      return Object.values(this.counters.unreads || {}).reduce((a, b) => a + b, 0);
    },
    categoryUnread(catId) {
      let sum = 0;
      for (const feed of this.feeds) {
        if (feed.category && feed.category.id === catId) {
          sum += this.counters.unreads[feed.id] || 0;
        }
      }
      return sum;
    },

    // --- persistence ---
    loadCreds() {
      try {
        this.creds = JSON.parse(localStorage.getItem(CREDS_KEY));
      } catch (_) { this.creds = null; }
      return this.creds;
    },
    saveCreds(url, key) {
      this.creds = { url, key };
      localStorage.setItem(CREDS_KEY, JSON.stringify(this.creds));
    },
    clearCreds() {
      this.creds = null;
      localStorage.removeItem(CREDS_KEY);
    },

    loadPrefs() {
      try {
        Object.assign(this.prefs, JSON.parse(localStorage.getItem(PREFS_KEY)) || {});
      } catch (_) { /* keep defaults */ }
    },
    savePrefs() {
      localStorage.setItem(PREFS_KEY, JSON.stringify(this.prefs));
    },

    setFeeds(feeds) {
      this.feeds = feeds;
      this.feedsById = new Map(feeds.map((f) => [f.id, f]));
    },
  };

  // Favicon cache: iconId -> data URL. Persisted best-effort.
  const iconCache = new Map();
  try {
    const saved = JSON.parse(localStorage.getItem(ICONS_KEY)) || {};
    for (const [id, data] of Object.entries(saved)) iconCache.set(Number(id), data);
  } catch (_) { /* start empty */ }

  state.icons = {
    get(iconId) { return iconCache.get(iconId); },
    set(iconId, dataUrl) {
      iconCache.set(iconId, dataUrl);
      if (dataUrl.length > 30000) return; // don't persist oversized icons
      try {
        localStorage.setItem(ICONS_KEY, JSON.stringify(Object.fromEntries(iconCache)));
      } catch (_) { /* quota exceeded: in-memory only */ }
    },
  };

  App.state = state;
})();
