/* Left pane: smart feeds, category/feed tree, unread badges, favicons. */
(function () {
  "use strict";
  window.App = window.App || {};
  const state = () => App.state;

  const SMART = [
    {
      type: "all", title: "All",
      icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1.5" fill="currentColor" stroke="none"/></svg>',
    },
    {
      type: "today", title: "Today",
      icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>',
    },
    {
      type: "starred", title: "Starred",
      icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 2.5l2.9 6.2 6.6.8-4.9 4.6 1.3 6.6-5.9-3.3-5.9 3.3 1.3-6.6L2.5 9.5l6.6-.8z"/></svg>',
    },
  ];

  const sidebar = {
    async load() {
      const [categories, feeds, counters] = await Promise.all([
        App.api.categories(),
        App.api.feeds(),
        App.api.counters(),
      ]);
      categories.sort((a, b) => a.title.localeCompare(b.title));
      feeds.sort((a, b) => a.title.localeCompare(b.title));
      state().categories = categories;
      state().setFeeds(feeds);
      state().counters = counters || { reads: {}, unreads: {} };
      this.render();
      this.loadIcons();
    },

    async refreshCounters() {
      try {
        state().counters = (await App.api.counters()) || { reads: {}, unreads: {} };
        this.updateBadges();
      } catch (_) { /* transient; next refresh will catch up */ }
    },

    render() {
      const smartNav = document.getElementById("smart-feeds");
      smartNav.textContent = "";
      for (const item of SMART) {
        const btn = document.createElement("button");
        btn.className = "side-item";
        btn.dataset.type = item.type;
        btn.innerHTML =
          `<span class="side-icon">${item.icon}</span>` +
          `<span class="side-label"></span><span class="side-count"></span>`;
        btn.querySelector(".side-label").textContent = item.title;
        btn.addEventListener("click", () => {
          App.list.show({ type: item.type, id: null, title: item.title });
        });
        smartNav.appendChild(btn);
      }

      const tree = document.getElementById("feed-tree");
      tree.textContent = "";
      this.bindTreeDrag(tree);
      const feedsByCat = new Map();
      for (const feed of state().feeds) {
        const catId = feed.category ? feed.category.id : 0;
        if (!feedsByCat.has(catId)) feedsByCat.set(catId, []);
        feedsByCat.get(catId).push(feed);
      }

      for (const cat of this.orderedCategories()) {
        const feeds = feedsByCat.get(cat.id) || [];
        if (!feeds.length) continue;

        const group = document.createElement("div");
        group.className = "cat-group";
        group.dataset.catId = cat.id;

        const header = document.createElement("div");
        header.className = "cat-header";
        header.dataset.catId = cat.id;
        if (state().prefs.collapsed[cat.id]) header.classList.add("collapsed");
        header.innerHTML =
          '<span class="cat-fold" title="Fold category">' +
          '<svg class="cat-chevron" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 9l5 5 5-5"/></svg>' +
          '</span><span class="cat-title"></span><span class="side-count"></span>';
        header.querySelector(".cat-title").textContent = cat.title;
        header.querySelector(".cat-fold").addEventListener("click", (e) => {
          e.stopPropagation();
          this.toggleCategory(cat.id, header);
        });
        header.addEventListener("click", () => {
          App.list.show({ type: "category", id: cat.id, title: cat.title });
        });
        this.makeDraggable(header, group);
        group.appendChild(header);

        const container = document.createElement("div");
        container.className = "cat-feeds";
        container.dataset.catId = cat.id;
        if (state().prefs.collapsed[cat.id]) container.hidden = true;
        for (const feed of feeds) {
          container.appendChild(this.feedItem(feed));
        }
        group.appendChild(container);
        tree.appendChild(group);
      }

      this.updateBadges();
      this.updateSelected();
    },

    feedItem(feed) {
      const btn = document.createElement("button");
      btn.className = "side-item";
      btn.dataset.feedId = feed.id;
      const errorDot = feed.parsing_error_count > 0
        ? '<span class="feed-error-dot" title="Feed has errors"></span>' : "";
      btn.innerHTML =
        `<img class="favicon" alt="" src="${sidebar.placeholderIcon()}">` +
        `<span class="side-label"></span>${errorDot}<span class="side-count"></span>`;
      btn.querySelector(".side-label").textContent = feed.title;
      btn.title = feed.title;
      btn.addEventListener("click", () => {
        App.list.show({ type: "feed", id: feed.id, title: feed.title });
      });
      return btn;
    },

    placeholderIcon() {
      return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Crect width='16' height='16' rx='3' fill='%23c6cacd'/%3E%3Cpath d='M4.5 11a1 1 0 1 0 0-.01M4.5 7.5A4 4 0 0 1 8.5 11.5M4.5 4a7.5 7.5 0 0 1 7.5 7.5' fill='none' stroke='white' stroke-width='1.4' stroke-linecap='round'/%3E%3C/svg%3E";
    },

    /* Custom order from prefs first; categories not in the list follow, A-Z. */
    orderedCategories() {
      const order = state().prefs.categoryOrder || [];
      return [...state().categories].sort((a, b) => {
        const ia = order.indexOf(a.id);
        const ib = order.indexOf(b.id);
        if (ia !== -1 && ib !== -1) return ia - ib;
        if (ia !== -1) return -1;
        if (ib !== -1) return 1;
        return a.title.localeCompare(b.title);
      });
    },

    makeDraggable(header, group) {
      header.draggable = true;
      header.addEventListener("dragstart", (e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", group.dataset.catId);
        group.classList.add("dragging");
      });
      header.addEventListener("dragend", () => {
        group.classList.remove("dragging");
        this.saveOrder();
      });
    },

    bindTreeDrag(tree) {
      if (tree.dataset.dndBound) return;
      tree.dataset.dndBound = "1";
      tree.addEventListener("dragover", (e) => {
        const dragging = tree.querySelector(".cat-group.dragging");
        if (!dragging) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const target = e.target.closest(".cat-group");
        if (!target || target === dragging) return;
        const rect = target.getBoundingClientRect();
        const after = e.clientY > rect.top + rect.height / 2;
        tree.insertBefore(dragging, after ? target.nextSibling : target);
      });
      tree.addEventListener("drop", (e) => e.preventDefault());
    },

    saveOrder() {
      const ids = [...document.querySelectorAll("#feed-tree .cat-group")]
        .map((g) => Number(g.dataset.catId));
      if (!ids.length) return;
      state().prefs.categoryOrder = ids;
      state().savePrefs();
    },

    toggleCategory(catId, header) {
      const collapsed = !state().prefs.collapsed[catId];
      if (collapsed) state().prefs.collapsed[catId] = true;
      else delete state().prefs.collapsed[catId];
      state().savePrefs();
      header.classList.toggle("collapsed", collapsed);
      const container = document.querySelector(`.cat-feeds[data-cat-id="${catId}"]`);
      if (container) container.hidden = collapsed;
    },

    updateBadges() {
      const unreads = state().counters.unreads || {};
      document.querySelectorAll("#feed-tree .side-item[data-feed-id]").forEach((el) => {
        const n = unreads[el.dataset.feedId] || 0;
        el.querySelector(".side-count").textContent = n ? String(n) : "";
      });
      document.querySelectorAll("#feed-tree .cat-header").forEach((el) => {
        const n = state().categoryUnread(Number(el.dataset.catId));
        el.querySelector(".side-count").textContent = n ? String(n) : "";
      });
      const allBtn = document.querySelector('#smart-feeds .side-item[data-type="all"]');
      if (allBtn) {
        const total = state().unreadTotal();
        allBtn.querySelector(".side-count").textContent = total ? String(total) : "";
      }
    },

    updateSelected() {
      const sel = state().selection;
      document.querySelectorAll("#sidebar .side-item").forEach((el) => {
        const isSel =
          (el.dataset.type && el.dataset.type === sel.type) ||
          (el.dataset.feedId && sel.type === "feed" && Number(el.dataset.feedId) === sel.id);
        el.classList.toggle("selected", Boolean(isSel));
      });
      document.querySelectorAll("#feed-tree .cat-header").forEach((el) => {
        el.classList.toggle("selected",
          sel.type === "category" && Number(el.dataset.catId) === sel.id);
      });
    },

    async loadIcons() {
      const wanted = new Map(); // iconId -> [feedId, ...]
      for (const feed of state().feeds) {
        if (feed.icon && feed.icon.icon_id) {
          if (!wanted.has(feed.icon.icon_id)) wanted.set(feed.icon.icon_id, []);
          wanted.get(feed.icon.icon_id).push(feed.id);
        }
      }
      for (const [iconId, feedIds] of wanted) {
        let dataUrl = state().icons.get(iconId);
        if (!dataUrl) {
          try {
            const icon = await App.api.icon(iconId);
            if (!icon || !icon.data) continue;
            dataUrl = "data:" + icon.data;
            state().icons.set(iconId, dataUrl);
          } catch (_) { continue; }
        }
        for (const feedId of feedIds) {
          const img = document.querySelector(
            `.side-item[data-feed-id="${feedId}"] .favicon`);
          if (img) img.src = dataUrl;
        }
      }
      App.list.refreshFavicons();
    },

    faviconFor(feedId) {
      const feed = state().feedsById.get(feedId);
      if (feed && feed.icon && feed.icon.icon_id) {
        return state().icons.get(feed.icon.icon_id) || this.placeholderIcon();
      }
      return this.placeholderIcon();
    },
  };

  App.sidebar = sidebar;
})();
