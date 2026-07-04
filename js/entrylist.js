/* Middle pane: magazine-style entry list with infinite scroll.
 * Also owns the optimistic read/star mutations shared with the reader. */
(function () {
  "use strict";
  window.App = window.App || {};
  const state = () => App.state;

  const PAGE_SIZE = 50;
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

  function reltime(dateStr) {
    const date = new Date(dateStr);
    const secs = (Date.now() - date.getTime()) / 1000;
    if (secs < 60) return "now";
    if (secs < 3600) return rtf.format(-Math.floor(secs / 60), "minute");
    if (secs < 86400) return rtf.format(-Math.floor(secs / 3600), "hour");
    if (secs < 7 * 86400) return rtf.format(-Math.floor(secs / 86400), "day");
    const opts = { month: "short", day: "numeric" };
    if (date.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
    return date.toLocaleDateString(undefined, opts);
  }

  const STAR_SVG =
    '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M12 2.5l2.9 6.2 6.6.8-4.9 4.6 1.3 6.6-5.9-3.3-5.9 3.3 1.3-6.6L2.5 9.5l6.6-.8z"/></svg>';

  const list = {
    offset: 0,
    total: 0,
    hasMore: false,
    loading: false,
    reqId: 0,

    els: {},

    init() {
      this.els = {
        rows: document.getElementById("entry-rows"),
        status: document.getElementById("list-status"),
        sentinel: document.getElementById("list-sentinel"),
        scroll: document.getElementById("entry-list"),
        title: document.getElementById("list-title"),
        count: document.getElementById("list-count"),
        search: document.getElementById("search-input"),
        unreadToggle: document.getElementById("unread-toggle"),
        markAll: document.getElementById("mark-all-read"),
        refresh: document.getElementById("refresh-btn"),
      };

      this.observer = new IntersectionObserver(
        (obs) => {
          if (obs.some((o) => o.isIntersecting) && this.hasMore && !this.loading) {
            this.load(false);
          }
        },
        { root: this.els.scroll, rootMargin: "400px" }
      );
      this.observer.observe(this.els.sentinel);

      this.els.unreadToggle.addEventListener("click", () => {
        state().prefs.unreadOnly = !state().prefs.unreadOnly;
        state().savePrefs();
        this.syncControls();
        this.load(true);
      });

      this.els.refresh.addEventListener("click", () => this.refresh());
      this.els.markAll.addEventListener("click", () => this.markAllRead());

      let searchTimer = null;
      this.els.search.addEventListener("input", () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
          const q = this.els.search.value.trim();
          if (q === state().search) return;
          state().search = q;
          this.load(true);
        }, 350);
      });
      this.els.search.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          this.els.search.value = "";
          this.els.search.dispatchEvent(new Event("input"));
          this.els.search.blur();
        } else if (e.key === "Enter") {
          e.preventDefault();
          this.els.search.blur();
        }
      });

      state().on("entry-updated", (entry) => this.updateRow(entry));
    },

    show(selection) {
      state().selection = selection;
      App.sidebar.updateSelected();
      this.els.title.textContent = selection.title;
      App.nav.showList();
      this.syncControls();
      this.load(true);
    },

    syncControls() {
      const sel = state().selection;
      this.els.unreadToggle.setAttribute("aria-pressed", String(state().prefs.unreadOnly));
      this.els.unreadToggle.disabled = sel.type === "starred";
      this.els.unreadToggle.title = state().prefs.unreadOnly
        ? "Showing unread only — click for all" : "Showing all — click for unread only";
      this.els.markAll.disabled = sel.type === "today" || sel.type === "starred";
    },

    refresh() {
      const svg = this.els.refresh.querySelector("svg");
      svg.classList.add("spin");
      Promise.allSettled([this.load(true), App.sidebar.refreshCounters()]).then(() => {
        svg.classList.remove("spin");
      });
    },

    buildParams() {
      const sel = state().selection;
      const params = {
        order: "published_at",
        direction: "desc",
        limit: PAGE_SIZE,
        offset: this.offset,
      };
      if (sel.type === "starred") {
        params.starred = "true";
      } else if (state().prefs.unreadOnly) {
        params.status = "unread";
      }
      if (sel.type === "today") {
        params.published_after = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
      }
      if (state().search) params.search = state().search;
      return params;
    },

    fetchPage() {
      const sel = state().selection;
      const params = this.buildParams();
      if (sel.type === "feed") return App.api.feedEntries(sel.id, params);
      if (sel.type === "category") return App.api.categoryEntries(sel.id, params);
      return App.api.entries(params);
    },

    async load(reset) {
      const reqId = ++this.reqId;
      if (reset) {
        this.offset = 0;
        this.total = 0;
        this.hasMore = false;
        state().entries = [];
        this.els.rows.textContent = "";
        this.els.scroll.scrollTop = 0;
        this.setStatusMsg("Loading…");
      }
      this.loading = true;
      try {
        const res = await this.fetchPage();
        if (reqId !== this.reqId) return;

        const page = res.entries || [];
        const entries = page.filter((e) => e.status !== "removed");
        this.total = res.total || 0;
        this.offset += page.length;
        this.hasMore = page.length > 0 && this.offset < this.total;

        state().entries.push(...entries);
        for (const entry of entries) this.els.rows.appendChild(this.renderRow(entry));

        this.els.count.textContent = String(this.total);
        this.els.count.hidden = this.total === 0;

        if (state().entries.length === 0) {
          this.setStatusMsg(
            state().search ? "No results" :
            state().prefs.unreadOnly && state().selection.type !== "starred"
              ? "You're all caught up" : "No entries");
        } else {
          this.setStatusMsg(null);
        }
      } catch (err) {
        if (reqId !== this.reqId) return;
        this.setStatusMsg("Could not load entries — " + err.message);
      } finally {
        if (reqId === this.reqId) {
          this.loading = false;
          // IntersectionObserver only fires on crossings; if the sentinel is
          // still visible after this page, re-arm it so the next page loads.
          this.observer.unobserve(this.els.sentinel);
          this.observer.observe(this.els.sentinel);
        }
      }
    },

    setStatusMsg(msg) {
      this.els.status.textContent = msg || "";
      this.els.status.hidden = !msg;
    },

    renderRow(entry) {
      const row = document.createElement("article");
      row.className = "entry-row";
      if (entry.status === "read") row.classList.add("read");
      if (entry.id === state().selectedEntryId) row.classList.add("selected");
      row.dataset.id = entry.id;

      const thumb = document.createElement("div");
      thumb.className = "entry-thumb";
      const thumbUrl = this.thumbnailFor(entry);
      if (thumbUrl) {
        thumb.style.backgroundImage = `url("${thumbUrl.replace(/"/g, "%22")}")`;
      } else {
        thumb.innerHTML =
          '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1.5" fill="currentColor" stroke="none"/></svg>';
      }

      const main = document.createElement("div");
      main.className = "entry-main";

      const title = document.createElement("h3");
      title.className = "entry-title";
      title.textContent = entry.title || "(untitled)";

      const snippet = document.createElement("p");
      snippet.className = "entry-snippet";
      let snippetText = App.sanitize.text(entry.content, 500);
      const titleText = (entry.title || "").trim();
      if (titleText && snippetText.startsWith(titleText)) {
        snippetText = snippetText.slice(titleText.length).trim(); // content repeats title
      }
      if (snippetText.length > 220) snippetText = snippetText.slice(0, 219) + "…";
      snippet.textContent = snippetText;

      const meta = document.createElement("div");
      meta.className = "entry-meta";
      const favicon = document.createElement("img");
      favicon.className = "favicon";
      favicon.alt = "";
      favicon.dataset.feedId = entry.feed_id;
      favicon.src = App.sidebar.faviconFor(entry.feed_id);
      const feedName = document.createElement("span");
      feedName.className = "entry-feed-name";
      feedName.textContent = (entry.feed && entry.feed.title) || state().feedTitle(entry.feed_id);
      const time = document.createElement("span");
      time.textContent = "· " + reltime(entry.published_at);
      const star = document.createElement("span");
      star.className = "entry-star";
      star.innerHTML = STAR_SVG;
      star.hidden = !entry.starred;

      meta.append(favicon, feedName, time, star);
      main.append(title, snippet, meta);
      row.append(thumb, main);

      row.addEventListener("click", () => this.select(entry.id));
      return row;
    },

    thumbnailFor(entry) {
      const enclosure = (entry.enclosures || []).find(
        (e) => (e.mime_type || "").startsWith("image/") && /^https?:/i.test(e.url || ""));
      if (enclosure) return enclosure.url;
      return App.sanitize.firstImage(entry.content, entry.url);
    },

    refreshFavicons() {
      this.els.rows.querySelectorAll("img.favicon[data-feed-id]").forEach((img) => {
        img.src = App.sidebar.faviconFor(Number(img.dataset.feedId));
      });
    },

    entryById(id) {
      return state().entries.find((e) => e.id === id) || null;
    },

    select(id) {
      const entry = this.entryById(id);
      if (!entry) return;
      state().selectedEntryId = id;
      this.els.rows.querySelectorAll(".entry-row.selected").forEach((el) =>
        el.classList.remove("selected"));
      const row = this.els.rows.querySelector(`.entry-row[data-id="${id}"]`);
      if (row) {
        row.classList.add("selected");
        row.scrollIntoView({ block: "nearest" });
      }
      App.reader.open(entry);
      if (entry.status === "unread") this.setStatus(entry, "read");
    },

    async selectOffset(delta) {
      const entries = state().entries;
      if (!entries.length) return;
      const idx = entries.findIndex((e) => e.id === state().selectedEntryId);
      let next = idx === -1 ? 0 : idx + delta;
      if (next < 0) next = 0;
      if (next >= entries.length) {
        if (this.hasMore && !this.loading) {
          await this.load(false);
          if (next >= state().entries.length) return;
        } else {
          return;
        }
      }
      this.select(state().entries[next].id);
    },

    /* --- optimistic mutations --- */

    async setStatus(entry, status) {
      const prev = entry.status;
      if (prev === status) return;
      entry.status = status;
      this.adjustUnread(entry.feed_id, prev === "unread" ? -1 : +1);
      state().emit("entry-updated", entry);
      try {
        await App.api.updateEntries([entry.id], status);
      } catch (err) {
        entry.status = prev;
        this.adjustUnread(entry.feed_id, prev === "unread" ? +1 : -1);
        state().emit("entry-updated", entry);
        App.toast("Could not update entry — " + err.message, true);
      }
    },

    async toggleStar(entry) {
      entry.starred = !entry.starred;
      state().emit("entry-updated", entry);
      try {
        await App.api.toggleBookmark(entry.id);
      } catch (err) {
        entry.starred = !entry.starred;
        state().emit("entry-updated", entry);
        App.toast("Could not update star — " + err.message, true);
      }
    },

    adjustUnread(feedId, delta) {
      const unreads = state().counters.unreads;
      unreads[feedId] = Math.max(0, (unreads[feedId] || 0) + delta);
      App.sidebar.updateBadges();
    },

    updateRow(entry) {
      const row = this.els.rows.querySelector(`.entry-row[data-id="${entry.id}"]`);
      if (!row) return;
      row.classList.toggle("read", entry.status === "read");
      row.querySelector(".entry-star").hidden = !entry.starred;
    },

    async markAllRead() {
      const sel = state().selection;
      if (!window.confirm(`Mark all entries in “${sel.title}” as read?`)) return;
      try {
        if (sel.type === "feed") await App.api.markFeedRead(sel.id);
        else if (sel.type === "category") await App.api.markCategoryRead(sel.id);
        else await App.api.markUserRead(state().user.id);
        await Promise.allSettled([this.load(true), App.sidebar.refreshCounters()]);
      } catch (err) {
        App.toast("Could not mark all as read — " + err.message, true);
      }
    },
  };

  App.list = list;
})();
