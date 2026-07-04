/* Right pane: renders the selected entry and its actions. */
(function () {
  "use strict";
  window.App = window.App || {};
  const state = () => App.state;

  const reader = {
    current: null,
    els: {},

    init() {
      this.els = {
        empty: document.getElementById("reader-empty"),
        article: document.getElementById("reader-article"),
        actions: document.getElementById("reader-actions"),
        scroll: document.getElementById("reader-scroll"),
        feed: document.getElementById("reader-feed"),
        date: document.getElementById("reader-date"),
        time: document.getElementById("reader-time"),
        titleLink: document.getElementById("reader-title-link"),
        author: document.getElementById("reader-author"),
        content: document.getElementById("reader-content"),
        starBtn: document.getElementById("star-btn"),
        readBtn: document.getElementById("read-btn"),
        fetchBtn: document.getElementById("fetch-btn"),
        openBtn: document.getElementById("open-btn"),
      };

      this.els.starBtn.addEventListener("click", () => this.toggleStar());
      this.els.readBtn.addEventListener("click", () => this.toggleRead());
      this.els.openBtn.addEventListener("click", () => this.openOriginal());
      this.els.fetchBtn.addEventListener("click", () => this.fetchFullContent());

      state().on("entry-updated", (entry) => {
        if (this.current && entry.id === this.current.id) this.syncButtons();
      });
    },

    open(entry) {
      this.current = entry;
      this.els.empty.hidden = true;
      this.els.article.hidden = false;
      this.els.actions.hidden = false;

      this.els.feed.textContent =
        (entry.feed && entry.feed.title) || state().feedTitle(entry.feed_id);
      const published = new Date(entry.published_at);
      this.els.date.textContent = published.toLocaleString(undefined, {
        weekday: "short", month: "short", day: "numeric",
        year: "numeric", hour: "numeric", minute: "2-digit",
      });
      this.els.time.textContent = entry.reading_time
        ? `${entry.reading_time} min read` : "";

      this.els.titleLink.textContent = entry.title || "(untitled)";
      this.els.titleLink.href = entry.url || "#";

      this.els.author.textContent = entry.author ? `by ${entry.author}` : "";

      this.renderContent(entry.content, entry.url);
      this.syncButtons();
      this.els.scroll.scrollTop = 0;
      App.nav.showReader();
    },

    renderContent(html, baseUrl) {
      const frag = App.sanitize.html(html, baseUrl);
      // Many feeds repeat the entry title as a leading heading; drop it.
      const first = frag.firstElementChild;
      if (first && /^h[1-6]$/.test(first.localName) && this.current &&
          first.textContent.trim() === (this.current.title || "").trim()) {
        first.remove();
      }
      this.els.content.textContent = "";
      this.els.content.appendChild(frag);
    },

    clear() {
      this.current = null;
      this.els.article.hidden = true;
      this.els.actions.hidden = true;
      this.els.empty.hidden = false;
    },

    syncButtons() {
      const entry = this.current;
      if (!entry) return;
      this.els.starBtn.classList.toggle("active", Boolean(entry.starred));
      this.els.starBtn.querySelector("svg").setAttribute(
        "fill", entry.starred ? "currentColor" : "none");
      this.els.starBtn.title = entry.starred ? "Unstar (s)" : "Star (s)";
      const isRead = entry.status === "read";
      this.els.readBtn.title = isRead ? "Mark as unread (m)" : "Mark as read (m)";
      this.els.readBtn.classList.toggle("active", !isRead);
    },

    toggleStar() {
      if (this.current) App.list.toggleStar(this.current);
    },

    toggleRead() {
      if (!this.current) return;
      App.list.setStatus(
        this.current, this.current.status === "read" ? "unread" : "read");
    },

    openOriginal() {
      if (this.current && this.current.url) {
        window.open(this.current.url, "_blank", "noopener");
      }
    },

    async fetchFullContent() {
      if (!this.current) return;
      const entry = this.current;
      const svg = this.els.fetchBtn.querySelector("svg");
      svg.classList.add("spin");
      this.els.fetchBtn.disabled = true;
      try {
        const res = await App.api.fetchContent(entry.id);
        if (res && res.content && this.current && this.current.id === entry.id) {
          entry.content = res.content;
          this.renderContent(entry.content, entry.url);
        }
      } catch (err) {
        App.toast("Could not fetch full content — " + err.message, true);
      } finally {
        svg.classList.remove("spin");
        this.els.fetchBtn.disabled = false;
      }
    },
  };

  App.reader = reader;
})();
