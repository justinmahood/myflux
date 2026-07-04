/* Central app state with EventTarget-based events and localStorage persistence. */

const CREDS_KEY = "myflux.creds";
const PREFS_KEY = "myflux.prefs";
const ICONS_KEY = "myflux.icons";

class IconCache {
  #icons = new Map(); // iconId -> data URL

  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem(ICONS_KEY)) ?? {};
      for (const [id, data] of Object.entries(saved)) this.#icons.set(Number(id), data);
    } catch { /* start empty */ }
  }

  get(iconId) { return this.#icons.get(iconId); }

  set(iconId, dataUrl) {
    this.#icons.set(iconId, dataUrl);
    if (dataUrl.length > 30_000) return; // don't persist oversized icons
    try {
      localStorage.setItem(ICONS_KEY, JSON.stringify(Object.fromEntries(this.#icons)));
    } catch { /* quota exceeded: in-memory only */ }
  }
}

class AppState extends EventTarget {
  creds = null; // { url, key }
  prefs = {
    theme: "auto",      // auto | light | dark
    unreadOnly: true,
    collapsed: {},       // categoryId -> true
    categoryOrder: [],   // categoryIds in display order; others sort after, A-Z
  };

  user = null;
  categories = [];
  feeds = [];
  feedsById = new Map();
  counters = { reads: {}, unreads: {} };

  selection = { type: "all", id: null, title: "All" };
  entries = [];
  selectedEntryId = null;
  search = "";

  icons = new IconCache();

  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  // --- derived ---
  feedTitle(feedId) {
    return this.feedsById.get(feedId)?.title ?? "";
  }

  unreadTotal() {
    return Object.values(this.counters.unreads ?? {}).reduce((a, b) => a + b, 0);
  }

  categoryUnread(catId) {
    return this.feeds
      .filter((feed) => feed.category?.id === catId)
      .reduce((sum, feed) => sum + (this.counters.unreads[feed.id] ?? 0), 0);
  }

  setFeeds(feeds) {
    this.feeds = feeds;
    this.feedsById = new Map(feeds.map((f) => [f.id, f]));
  }

  // --- persistence ---
  loadCreds() {
    try {
      this.creds = JSON.parse(localStorage.getItem(CREDS_KEY));
    } catch {
      this.creds = null;
    }
    return this.creds;
  }

  saveCreds(url, key) {
    this.creds = { url, key };
    localStorage.setItem(CREDS_KEY, JSON.stringify(this.creds));
  }

  clearCreds() {
    this.creds = null;
    localStorage.removeItem(CREDS_KEY);
  }

  loadPrefs() {
    try {
      Object.assign(this.prefs, JSON.parse(localStorage.getItem(PREFS_KEY)) ?? {});
    } catch { /* keep defaults */ }
  }

  savePrefs() {
    localStorage.setItem(PREFS_KEY, JSON.stringify(this.prefs));
  }
}

export const state = new AppState();
