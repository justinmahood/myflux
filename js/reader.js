/* Right pane: renders the selected entry and its actions. */
import { api } from "./api.js";
import { state } from "./state.js";
import { sanitizeHtml } from "./sanitize.js";
import { list } from "./entrylist.js";
import { nav, toast } from "./ui.js";

export const reader = {
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
      saveBtn: document.getElementById("save-btn"),
      shareBtn: document.getElementById("share-btn"),
      fetchBtn: document.getElementById("fetch-btn"),
      openBtn: document.getElementById("open-btn"),
    };

    this.els.starBtn.addEventListener("click", () => this.toggleStar());
    this.els.readBtn.addEventListener("click", () => this.toggleRead());
    this.els.saveBtn.addEventListener("click", () => this.saveEntry());
    this.els.shareBtn.addEventListener("click", () => this.shareEntry());
    this.els.openBtn.addEventListener("click", () => this.openOriginal());
    this.els.fetchBtn.addEventListener("click", () => this.fetchFullContent());

    state.addEventListener("entry-updated", (e) => {
      if (this.current && e.detail.id === this.current.id) this.syncButtons();
    });
  },

  open(entry) {
    this.current = entry;
    this.els.empty.hidden = true;
    this.els.article.hidden = false;
    this.els.actions.hidden = false;

    this.els.feed.textContent = entry.feed?.title ?? state.feedTitle(entry.feed_id);
    const published = new Date(entry.published_at);
    this.els.date.dateTime = entry.published_at;
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
    nav.showReader();
  },

  renderContent(html, baseUrl) {
    const frag = sanitizeHtml(html, baseUrl);
    // Many feeds repeat the entry title as a leading heading; drop it.
    const first = frag.firstElementChild;
    if (first && /^h[1-6]$/.test(first.localName) &&
        first.textContent.trim() === (this.current?.title ?? "").trim()) {
      first.remove();
    }
    this.els.content.replaceChildren(frag);
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
    this.els.saveBtn.hidden = !state.hasIntegrations;
    this.els.shareBtn.title = entry.share_code
      ? "Share (Miniflux public link)" : "Share (original link)";
  },

  toggleStar() {
    if (this.current) list.toggleStar(this.current);
  },

  toggleRead() {
    if (!this.current) return;
    list.setStatus(this.current, this.current.status === "read" ? "unread" : "read");
  },

  openOriginal() {
    if (this.current?.url) {
      window.open(this.current.url, "_blank", "noopener");
    }
  },

  // The Miniflux public share page when the entry already has a share code,
  // else the original article URL. The REST API cannot mint share codes
  // (that's a web-UI-session route), so codes exist only for entries shared
  // from the Miniflux UI.
  shareLink(entry) {
    return entry.share_code
      ? { url: api.shareUrl(entry.share_code), kind: "Miniflux public link" }
      : { url: entry.url, kind: "original link" };
  },

  async shareEntry() {
    if (!this.current) return;
    const { url, kind } = this.shareLink(this.current);
    if (!url) return;
    // Mobile gets the native share sheet; desktop expects a plain copy.
    if (nav.isMobile() && navigator.share) {
      try {
        await navigator.share({ title: this.current.title, url });
      } catch (err) {
        if (err.name !== "AbortError") { // Abort = user closed the sheet
          toast(`Could not share — ${err.message}`, true);
        }
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast(`Copied ${kind} to clipboard`);
    } catch {
      toast("Could not copy — clipboard needs a secure (HTTPS) context", true);
    }
  },

  // One-shot send to whatever integration is configured in Miniflux
  // (Pocket, Wallabag, Readwise, …). Not a toggle — the API is fire-and-forget
  // (202) and there is no saved/unsaved state to reflect.
  async saveEntry() {
    if (!this.current) return;
    if (!state.hasIntegrations) {
      toast("No third-party integration is configured in Miniflux", true);
      return;
    }
    const entry = this.current;
    this.els.saveBtn.disabled = true;
    try {
      await api.saveEntry(entry.id);
      toast("Saved to third-party service");
    } catch (err) {
      toast(`Could not save — ${err.message}`, true);
    } finally {
      this.els.saveBtn.disabled = false;
    }
  },

  async fetchFullContent() {
    if (!this.current) return;
    const entry = this.current;
    const svg = this.els.fetchBtn.querySelector("svg");
    svg.classList.add("spin");
    this.els.fetchBtn.disabled = true;
    try {
      const res = await api.fetchContent(entry.id);
      if (res?.content && this.current?.id === entry.id) {
        entry.content = res.content;
        this.renderContent(entry.content, entry.url);
      }
    } catch (err) {
      toast(`Could not fetch full content — ${err.message}`, true);
    } finally {
      svg.classList.remove("spin");
      this.els.fetchBtn.disabled = false;
    }
  },
};
