/* Feed & category management: add/edit/delete feeds, category CRUD, OPML. */
(function () {
  "use strict";
  window.App = window.App || {};
  const state = () => App.state;

  function showError(el, err) {
    el.textContent = err.message || String(err);
    el.hidden = false;
  }

  function fillCategorySelect(select, selectedId) {
    select.textContent = "";
    for (const cat of App.sidebar.orderedCategories()) {
      const opt = document.createElement("option");
      opt.value = cat.id;
      opt.textContent = cat.title;
      if (cat.id === selectedId) opt.selected = true;
      select.appendChild(opt);
    }
  }

  const manage = {
    editingFeedId: null,
    discovered: null, // results of the last discover call, or null

    init() {
      document.getElementById("add-feed-btn").addEventListener("click", () => this.openAddFeed());
      document.getElementById("manage-btn").addEventListener("click", () => this.openManage());

      // Cancel/Done buttons close their dialog
      document.querySelectorAll("dialog [data-close]").forEach((btn) => {
        btn.addEventListener("click", () => btn.closest("dialog").close());
      });

      document.getElementById("add-feed-form")
        .addEventListener("submit", (e) => { e.preventDefault(); this.submitAddFeed(); });
      document.getElementById("add-feed-url")
        .addEventListener("input", () => this.resetDiscover());

      document.getElementById("edit-feed-form")
        .addEventListener("submit", (e) => { e.preventDefault(); this.submitEditFeed(); });
      document.getElementById("edit-feed-delete")
        .addEventListener("click", () => this.deleteFeed());

      document.getElementById("new-cat-form")
        .addEventListener("submit", (e) => { e.preventDefault(); this.createCategory(); });
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
        state().selection.type === "category" ? state().selection.id : undefined);
      this.resetDiscover();
      dlg.showModal();
    },

    resetDiscover() {
      this.discovered = null;
      const results = document.getElementById("discover-results");
      results.hidden = true;
      results.textContent = "";
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
        const found = await App.api.discover(url);
        if (!found || found.length === 0) {
          throw new Error("No feeds found at that address.");
        }
        if (found.length === 1) {
          return this.subscribe(found[0].url, categoryId, submit, errEl);
        }
        // Multiple feeds: let the user pick one
        this.discovered = found;
        const results = document.getElementById("discover-results");
        results.textContent = "";
        found.forEach((f, i) => {
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
          results.appendChild(label);
        });
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
        const res = await App.api.createFeed(feedUrl, categoryId);
        document.getElementById("add-feed-dialog").close();
        await App.sidebar.load();
        const feed = state().feedsById.get(res.feed_id);
        if (feed) App.list.show({ type: "feed", id: feed.id, title: feed.title });
        App.toast("Subscribed");
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
      fillCategorySelect(document.getElementById("edit-feed-category"),
        feed.category ? feed.category.id : undefined);
      document.getElementById("edit-feed-dialog").showModal();
    },

    async submitEditFeed() {
      const errEl = document.getElementById("edit-feed-error");
      errEl.hidden = true;
      try {
        await App.api.updateFeed(this.editingFeedId, {
          title: document.getElementById("edit-feed-title").value.trim(),
          feed_url: document.getElementById("edit-feed-url").value.trim(),
          category_id: Number(document.getElementById("edit-feed-category").value),
        });
        document.getElementById("edit-feed-dialog").close();
        await App.sidebar.load();
        const sel = state().selection;
        if (sel.type === "feed" && sel.id === this.editingFeedId) {
          const feed = state().feedsById.get(this.editingFeedId);
          if (feed) App.list.show({ type: "feed", id: feed.id, title: feed.title });
        }
      } catch (err) {
        showError(errEl, err);
      }
    },

    async deleteFeed() {
      const feed = state().feedsById.get(this.editingFeedId);
      if (!feed) return;
      if (!window.confirm(`Unsubscribe from “${feed.title}”? Its entries will be deleted.`)) return;
      const errEl = document.getElementById("edit-feed-error");
      try {
        await App.api.deleteFeed(feed.id);
        document.getElementById("edit-feed-dialog").close();
        await App.sidebar.load();
        const sel = state().selection;
        if (sel.type === "feed" && sel.id === feed.id) {
          App.list.show({ type: "all", id: null, title: "All" });
        }
        App.toast(`Unsubscribed from ${feed.title}`);
      } catch (err) {
        showError(errEl, err);
      }
    },

    /* ---------- categories & OPML ---------- */

    openManage() {
      document.getElementById("manage-error").hidden = true;
      document.getElementById("new-cat-form").reset();
      this.renderCategoryList();
      document.getElementById("manage-dialog").showModal();
    },

    renderCategoryList() {
      const listEl = document.getElementById("cat-list");
      listEl.textContent = "";
      for (const cat of App.sidebar.orderedCategories()) {
        const row = document.createElement("div");
        row.className = "cat-row";

        const input = document.createElement("input");
        input.type = "text";
        input.value = cat.title;
        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter") { e.preventDefault(); input.blur(); }
        });
        input.addEventListener("blur", () => this.renameCategory(cat, input));

        const feedCount = state().feeds.filter(
          (f) => f.category && f.category.id === cat.id).length;
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
        listEl.appendChild(row);
      }
    },

    async renameCategory(cat, input) {
      const title = input.value.trim();
      if (!title || title === cat.title) { input.value = cat.title; return; }
      const errEl = document.getElementById("manage-error");
      errEl.hidden = true;
      try {
        await App.api.updateCategory(cat.id, title);
        await App.sidebar.load();
        if (state().selection.type === "category" && state().selection.id === cat.id) {
          App.list.show({ type: "category", id: cat.id, title });
        } else {
          this.renderCategoryList();
        }
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
        await App.api.createCategory(title);
        input.value = "";
        await App.sidebar.load();
        this.renderCategoryList();
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
        await App.api.deleteCategory(cat.id);
        await App.sidebar.load();
        this.renderCategoryList();
        const sel = state().selection;
        const gone = (sel.type === "category" && sel.id === cat.id) ||
          (sel.type === "feed" && !state().feedsById.has(sel.id));
        if (gone) App.list.show({ type: "all", id: null, title: "All" });
      } catch (err) {
        showError(errEl, err);
      }
    },

    async exportOpml() {
      const errEl = document.getElementById("manage-error");
      errEl.hidden = true;
      try {
        const xml = await App.api.exportOpml();
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
        const xml = await file.text();
        await App.api.importOpml(xml);
        await App.sidebar.load();
        this.renderCategoryList();
        App.toast("OPML imported — feeds will populate as Miniflux fetches them");
      } catch (err) {
        showError(errEl, err);
      }
    },
  };

  App.manage = manage;
})();
