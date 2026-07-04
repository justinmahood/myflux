/* Feed & category management: add/edit/delete feeds, category CRUD, OPML.
 * Cancel/Done buttons close their <dialog> natively via method="dialog". */
import { api } from "./api.js";
import { state } from "./state.js";
import { sidebar } from "./sidebar.js";
import { list } from "./entrylist.js";
import { toast } from "./ui.js";

function showError(el, err) {
  el.textContent = err.message ?? String(err);
  el.hidden = false;
}

function fillCategorySelect(select, selectedId) {
  select.replaceChildren(...sidebar.orderedCategories().map((cat) => {
    const opt = document.createElement("option");
    opt.value = cat.id;
    opt.textContent = cat.title;
    opt.selected = cat.id === selectedId;
    return opt;
  }));
}

/* A submit whose button carries formmethod="dialog" is a native close
 * request (Cancel); let the browser handle it. */
const isDialogClose = (e) => e.submitter?.formMethod === "dialog";

export const manage = {
  editingFeedId: null,
  discovered: null, // results of the last discover call, or null
  selectedFeeds: new Set(), // feed ids checked in the Feeds tab

  init() {
    document.getElementById("add-feed-btn").addEventListener("click", () => this.openAddFeed());
    document.getElementById("manage-btn").addEventListener("click", () => this.openManage());

    for (const btn of document.querySelectorAll("#manage-dialog .tab")) {
      btn.addEventListener("click", () => this.switchTab(btn.dataset.tab));
    }
    document.getElementById("feed-filter")
      .addEventListener("input", () => this.renderFeedManager());
    document.getElementById("feed-select-all")
      .addEventListener("change", (e) => this.toggleSelectAll(e.target.checked));
    document.getElementById("bulk-move").addEventListener("click", () => this.bulkMove());
    document.getElementById("bulk-unsub").addEventListener("click", () => this.bulkUnsubscribe());

    document.getElementById("add-feed-form").addEventListener("submit", (e) => {
      if (isDialogClose(e)) return;
      e.preventDefault();
      this.submitAddFeed();
    });
    document.getElementById("add-feed-url")
      .addEventListener("input", () => this.resetDiscover());

    document.getElementById("edit-feed-form").addEventListener("submit", (e) => {
      if (isDialogClose(e)) return;
      e.preventDefault();
      this.submitEditFeed();
    });
    document.getElementById("edit-feed-delete")
      .addEventListener("click", () => this.deleteFeed());

    document.getElementById("new-cat-form").addEventListener("submit", (e) => {
      e.preventDefault();
      this.createCategory();
    });
    document.getElementById("opml-export")
      .addEventListener("click", () => this.exportOpml());
    const fileInput = document.getElementById("opml-file");
    document.getElementById("opml-import")
      .addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => this.importOpml());
  },

  /* ---------- add feed ---------- */

  openAddFeed() {
    const dlg = document.getElementById("add-feed-dialog");
    document.getElementById("add-feed-form").reset();
    document.getElementById("add-feed-error").hidden = true;
    fillCategorySelect(document.getElementById("add-feed-category"),
      state.selection.type === "category" ? state.selection.id : undefined);
    this.resetDiscover();
    dlg.showModal();
  },

  resetDiscover() {
    this.discovered = null;
    const results = document.getElementById("discover-results");
    results.hidden = true;
    results.replaceChildren();
    document.getElementById("add-feed-submit").textContent = "Add";
  },

  async submitAddFeed() {
    const errEl = document.getElementById("add-feed-error");
    const submit = document.getElementById("add-feed-submit");
    const url = document.getElementById("add-feed-url").value.trim();
    const categoryId = Number(document.getElementById("add-feed-category").value);
    errEl.hidden = true;

    // Second submit: a feed has been picked from the discover list
    if (this.discovered) {
      const picked = document.querySelector('input[name="discovered-feed"]:checked');
      if (!picked) return;
      return this.subscribe(picked.value, categoryId, submit, errEl);
    }

    submit.disabled = true;
    submit.textContent = "Looking…";
    try {
      const found = await api.discover(url);
      if (!found?.length) {
        throw new Error("No feeds found at that address.");
      }
      if (found.length === 1) {
        return this.subscribe(found[0].url, categoryId, submit, errEl);
      }
      // Multiple feeds: let the user pick one
      this.discovered = found;
      const results = document.getElementById("discover-results");
      results.replaceChildren(...found.map((f, i) => {
        const label = document.createElement("label");
        label.className = "discover-item";
        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = "discovered-feed";
        radio.value = f.url;
        radio.checked = i === 0;
        const text = document.createElement("span");
        text.textContent = `${f.title || f.url} (${f.type})`;
        text.title = f.url;
        label.append(radio, text);
        return label;
      }));
      results.hidden = false;
      submit.textContent = "Subscribe";
    } catch (err) {
      showError(errEl, err);
    } finally {
      submit.disabled = false;
      if (!this.discovered) submit.textContent = "Add";
    }
  },

  async subscribe(feedUrl, categoryId, submit, errEl) {
    submit.disabled = true;
    submit.textContent = "Subscribing…";
    try {
      const res = await api.createFeed(feedUrl, categoryId);
      document.getElementById("add-feed-dialog").close();
      await sidebar.load();
      const feed = state.feedsById.get(res.feed_id);
      if (feed) list.show({ type: "feed", id: feed.id, title: feed.title });
      toast("Subscribed");
    } catch (err) {
      showError(errEl, err);
    } finally {
      submit.disabled = false;
      submit.textContent = this.discovered ? "Subscribe" : "Add";
    }
  },

  /* ---------- edit feed ---------- */

  openEditFeed(feed) {
    this.editingFeedId = feed.id;
    document.getElementById("edit-feed-title").value = feed.title;
    document.getElementById("edit-feed-url").value = feed.feed_url;
    document.getElementById("edit-feed-error").hidden = true;
    fillCategorySelect(document.getElementById("edit-feed-category"), feed.category?.id);
    document.getElementById("edit-feed-dialog").showModal();
  },

  async submitEditFeed() {
    const errEl = document.getElementById("edit-feed-error");
    errEl.hidden = true;
    try {
      await api.updateFeed(this.editingFeedId, {
        title: document.getElementById("edit-feed-title").value.trim(),
        feed_url: document.getElementById("edit-feed-url").value.trim(),
        category_id: Number(document.getElementById("edit-feed-category").value),
      });
      document.getElementById("edit-feed-dialog").close();
      await sidebar.load();
      const sel = state.selection;
      if (sel.type === "feed" && sel.id === this.editingFeedId) {
        const feed = state.feedsById.get(this.editingFeedId);
        if (feed) list.show({ type: "feed", id: feed.id, title: feed.title });
      }
    } catch (err) {
      showError(errEl, err);
    }
  },

  async deleteFeed() {
    const feed = state.feedsById.get(this.editingFeedId);
    if (!feed) return;
    if (!window.confirm(`Unsubscribe from “${feed.title}”? Its entries will be deleted.`)) return;
    const errEl = document.getElementById("edit-feed-error");
    try {
      await api.deleteFeed(feed.id);
      document.getElementById("edit-feed-dialog").close();
      await sidebar.load();
      const sel = state.selection;
      if (sel.type === "feed" && sel.id === feed.id) {
        list.show({ type: "all", id: null, title: "All" });
      }
      toast(`Unsubscribed from ${feed.title}`);
    } catch (err) {
      showError(errEl, err);
    }
  },

  /* Move a feed to another category (sidebar drag-and-drop). */
  async moveFeed(feedId, categoryId) {
    const feed = state.feedsById.get(feedId);
    const target = state.categories.find((c) => c.id === categoryId);
    if (!feed || !target || feed.category?.id === categoryId) return false;
    const previousCatId = feed.category?.id;
    try {
      await api.updateFeed(feedId, { category_id: categoryId });
      await sidebar.load();
      const sel = state.selection;
      if (sel.type === "category" && (sel.id === categoryId || sel.id === previousCatId)) {
        list.show({ ...sel }); // membership of the open category changed
      }
      toast(`Moved “${feed.title}” to ${target.title}`);
      return true;
    } catch (err) {
      toast(`Could not move feed — ${err.message}`, true);
      return false;
    }
  },

  /* ---------- categories & OPML ---------- */

  openManage() {
    document.getElementById("manage-error").hidden = true;
    document.getElementById("new-cat-form").reset();
    document.getElementById("feed-filter").value = "";
    this.selectedFeeds.clear();
    this.switchTab("feeds");
    this.renderFeedManager();
    this.renderCategoryList();
    document.getElementById("manage-dialog").showModal();
  },

  switchTab(name) {
    for (const btn of document.querySelectorAll("#manage-dialog .tab")) {
      btn.setAttribute("aria-selected", String(btn.dataset.tab === name));
    }
    for (const panel of document.querySelectorAll("#manage-dialog .tab-panel")) {
      panel.hidden = panel.id !== `tab-${name}`;
    }
  },

  /* ---------- feeds tab ---------- */

  renderFeedManager() {
    // drop selections for feeds that no longer exist
    this.selectedFeeds = new Set(
      [...this.selectedFeeds].filter((id) => state.feedsById.has(id)));

    const q = document.getElementById("feed-filter").value.trim().toLowerCase();
    const frag = document.createDocumentFragment();
    for (const cat of sidebar.orderedCategories()) {
      const feeds = state.feeds.filter((f) =>
        f.category?.id === cat.id &&
        (!q || f.title.toLowerCase().includes(q) || cat.title.toLowerCase().includes(q)));
      if (!feeds.length) continue;
      const group = document.createElement("div");
      group.className = "feed-mgr-group";
      group.textContent = cat.title;
      frag.appendChild(group);
      for (const feed of feeds) frag.appendChild(this.feedManagerRow(feed));
    }
    if (!frag.childNodes.length) {
      const empty = document.createElement("div");
      empty.className = "feed-mgr-empty";
      empty.textContent = state.feeds.length ? "No feeds match" : "No feeds yet";
      frag.appendChild(empty);
    }
    document.getElementById("feed-mgr-list").replaceChildren(frag);
    fillCategorySelect(document.getElementById("bulk-category"));
    this.syncBulkBar();
  },

  feedManagerRow(feed) {
    const row = document.createElement("div");
    row.className = "feed-mgr-row";

    const check = document.createElement("input");
    check.type = "checkbox";
    check.dataset.feedId = feed.id;
    check.checked = this.selectedFeeds.has(feed.id);
    check.addEventListener("change", () => {
      if (check.checked) this.selectedFeeds.add(feed.id);
      else this.selectedFeeds.delete(feed.id);
      this.syncBulkBar();
    });

    const icon = document.createElement("img");
    icon.className = "favicon";
    icon.alt = "";
    icon.src = sidebar.faviconFor(feed.id);

    const title = document.createElement("span");
    title.className = "feed-mgr-title";
    title.textContent = feed.title;
    title.title = feed.title;

    const catSel = document.createElement("select");
    catSel.setAttribute("aria-label", `Category for ${feed.title}`);
    fillCategorySelect(catSel, feed.category?.id);
    catSel.addEventListener("change", async () => {
      const moved = await this.moveFeed(feed.id, Number(catSel.value));
      if (moved) {
        this.renderFeedManager();
        this.renderCategoryList();
      } else {
        catSel.value = String(feed.category?.id);
      }
    });

    // Clicking anywhere else on the row toggles its checkbox.
    row.addEventListener("click", (e) => {
      if (e.target === check || e.target.closest("select")) return;
      check.checked = !check.checked;
      check.dispatchEvent(new Event("change"));
    });

    row.append(check, icon, title, catSel);
    return row;
  },

  toggleSelectAll(checked) {
    for (const box of document.querySelectorAll(
      '#feed-mgr-list input[type="checkbox"]')) {
      box.checked = checked;
      const id = Number(box.dataset.feedId);
      if (checked) this.selectedFeeds.add(id);
      else this.selectedFeeds.delete(id);
    }
    this.syncBulkBar();
  },

  syncBulkBar() {
    const count = this.selectedFeeds.size;
    document.getElementById("feed-sel-count").textContent =
      count === 1 ? "1 selected" : `${count} selected`;
    document.getElementById("bulk-move").disabled = count === 0;
    document.getElementById("bulk-unsub").disabled = count === 0;
    const visible = [...document.querySelectorAll(
      '#feed-mgr-list input[type="checkbox"]')];
    const checkedVisible = visible.filter((c) => c.checked).length;
    const all = document.getElementById("feed-select-all");
    all.checked = visible.length > 0 && checkedVisible === visible.length;
    all.indeterminate = checkedVisible > 0 && checkedVisible < visible.length;
  },

  async bulkMove(categoryId = Number(document.getElementById("bulk-category").value)) {
    const target = state.categories.find((c) => c.id === categoryId);
    if (!target || this.selectedFeeds.size === 0) return;
    const ids = [...this.selectedFeeds].filter(
      (id) => state.feedsById.get(id)?.category?.id !== categoryId);
    if (!ids.length) {
      toast(`Selected feeds are already in ${target.title}`);
      return;
    }
    const results = await Promise.allSettled(
      ids.map((id) => api.updateFeed(id, { category_id: categoryId })));
    const failed = results.filter((r) => r.status === "rejected").length;
    this.selectedFeeds.clear();
    await this.refreshAfterBulk();
    const moved = ids.length - failed;
    toast(failed
      ? `Moved ${moved} to ${target.title} — ${failed} failed`
      : `Moved ${moved} feed${moved === 1 ? "" : "s"} to ${target.title}`,
      failed > 0);
  },

  async bulkUnsubscribe() {
    const count = this.selectedFeeds.size;
    if (!count) return;
    if (!window.confirm(
      `Unsubscribe ${count} feed${count === 1 ? "" : "s"}? Their entries will be deleted.`)) {
      return;
    }
    const ids = [...this.selectedFeeds];
    const results = await Promise.allSettled(ids.map((id) => api.deleteFeed(id)));
    const failed = results.filter((r) => r.status === "rejected").length;
    this.selectedFeeds.clear();
    await this.refreshAfterBulk();
    const removed = ids.length - failed;
    toast(failed
      ? `Unsubscribed ${removed} — ${failed} failed`
      : `Unsubscribed ${removed} feed${removed === 1 ? "" : "s"}`,
      failed > 0);
  },

  async refreshAfterBulk() {
    await sidebar.load();
    const sel = state.selection;
    if (sel.type === "feed" && !state.feedsById.has(sel.id)) {
      list.show({ type: "all", id: null, title: "All" });
    } else if (sel.type !== "feed") {
      list.show({ ...sel }); // membership or entry counts may have changed
    }
    this.renderFeedManager();
    this.renderCategoryList();
  },

  renderCategoryList() {
    const listEl = document.getElementById("cat-list");
    listEl.replaceChildren(...sidebar.orderedCategories().map((cat) => {
      const row = document.createElement("div");
      row.className = "cat-row";

      const input = document.createElement("input");
      input.type = "text";
      input.value = cat.title;
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); input.blur(); }
      });
      input.addEventListener("blur", () => this.renameCategory(cat, input));

      const feedCount = state.feeds.filter((f) => f.category?.id === cat.id).length;
      const count = document.createElement("span");
      count.className = "cat-row-count";
      count.textContent = feedCount === 1 ? "1 feed" : `${feedCount} feeds`;

      const del = document.createElement("button");
      del.type = "button";
      del.className = "icon-btn";
      del.title = "Delete category";
      del.innerHTML =
        '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"/></svg>';
      del.addEventListener("click", () => this.deleteCategory(cat, feedCount));

      row.append(input, count, del);
      return row;
    }));
  },

  async renameCategory(cat, input) {
    const title = input.value.trim();
    if (!title || title === cat.title) {
      input.value = cat.title;
      return;
    }
    const errEl = document.getElementById("manage-error");
    errEl.hidden = true;
    try {
      await api.updateCategory(cat.id, title);
      await sidebar.load();
      if (state.selection.type === "category" && state.selection.id === cat.id) {
        list.show({ type: "category", id: cat.id, title });
      } else {
        this.renderCategoryList();
      }
      this.renderFeedManager();
    } catch (err) {
      input.value = cat.title;
      showError(errEl, err);
    }
  },

  async createCategory() {
    const input = document.getElementById("new-cat-title");
    const title = input.value.trim();
    if (!title) return;
    const errEl = document.getElementById("manage-error");
    errEl.hidden = true;
    try {
      await api.createCategory(title);
      input.value = "";
      await sidebar.load();
      this.renderCategoryList();
      this.renderFeedManager();
    } catch (err) {
      showError(errEl, err);
    }
  },

  async deleteCategory(cat, feedCount) {
    const warning = feedCount > 0
      ? `Delete “${cat.title}”? This also unsubscribes its ${feedCount} ` +
        `feed${feedCount === 1 ? "" : "s"} and deletes their entries.`
      : `Delete the empty category “${cat.title}”?`;
    if (!window.confirm(warning)) return;
    const errEl = document.getElementById("manage-error");
    errEl.hidden = true;
    try {
      await api.deleteCategory(cat.id);
      await sidebar.load();
      this.renderCategoryList();
      this.renderFeedManager();
      const sel = state.selection;
      const gone = (sel.type === "category" && sel.id === cat.id) ||
        (sel.type === "feed" && !state.feedsById.has(sel.id));
      if (gone) list.show({ type: "all", id: null, title: "All" });
    } catch (err) {
      showError(errEl, err);
    }
  },

  async exportOpml() {
    const errEl = document.getElementById("manage-error");
    errEl.hidden = true;
    try {
      const xml = await api.exportOpml();
      const blob = new Blob([xml], { type: "text/x-opml" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "subscriptions.opml";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      showError(errEl, err);
    }
  },

  async importOpml() {
    const fileInput = document.getElementById("opml-file");
    const file = fileInput.files[0];
    fileInput.value = "";
    if (!file) return;
    const errEl = document.getElementById("manage-error");
    errEl.hidden = true;
    try {
      await api.importOpml(await file.text());
      await sidebar.load();
      this.renderCategoryList();
      toast("OPML imported — feeds will populate as Miniflux fetches them");
    } catch (err) {
      showError(errEl, err);
    }
  },
};
