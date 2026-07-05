/* Left pane: smart feeds, category/feed tree, unread badges, favicons,
 * and drag-and-drop category reordering. */
import { api } from "./api.js";
import { state } from "./state.js";
import { offline } from "./offline.js";
import { list } from "./entrylist.js";
import { manage } from "./manage.js";

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

const PLACEHOLDER_ICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Crect width='16' height='16' rx='3' fill='%23c6cacd'/%3E%3Cpath d='M4.5 11a1 1 0 1 0 0-.01M4.5 7.5A4 4 0 0 1 8.5 11.5M4.5 4a7.5 7.5 0 0 1 7.5 7.5' fill='none' stroke='white' stroke-width='1.4' stroke-linecap='round'/%3E%3C/svg%3E";

export const sidebar = {
  async load() {
    const [categories, feeds, counters] = await Promise.all([
      api.categories(),
      api.feeds(),
      api.counters(),
    ]);
    categories.sort((a, b) => a.title.localeCompare(b.title));
    feeds.sort((a, b) => a.title.localeCompare(b.title));
    state.categories = categories;
    state.setFeeds(feeds);
    state.counters = counters ?? { reads: {}, unreads: {} };
    this.render();
    this.loadIcons();
    offline.saveSnapshot(); // fire-and-forget offline boot data
  },

  async refreshCounters() {
    try {
      state.counters = (await api.counters()) ?? { reads: {}, unreads: {} };
      this.updateBadges();
      offline.saveCounters(); // fire-and-forget
    } catch { /* transient; next refresh will catch up */ }
  },

  render() {
    const smartNav = document.getElementById("smart-feeds");
    smartNav.replaceChildren(...SMART.map((item) => {
      const btn = document.createElement("button");
      btn.className = "side-item";
      btn.dataset.type = item.type;
      btn.innerHTML =
        `<span class="side-icon">${item.icon}</span>` +
        `<span class="side-label"></span><span class="side-count"></span>`;
      btn.querySelector(".side-label").textContent = item.title;
      btn.addEventListener("click", () => {
        list.show({ type: item.type, id: null, title: item.title });
      });
      return btn;
    }));

    const tree = document.getElementById("feed-tree");
    tree.replaceChildren();
    this.bindTreeDrag(tree);
    const feedsByCat = Map.groupBy(state.feeds, (feed) => feed.category?.id ?? 0);

    for (const cat of this.orderedCategories()) {
      const feeds = feedsByCat.get(cat.id) ?? [];
      if (!feeds.length) continue;

      const group = document.createElement("div");
      group.className = "cat-group";
      group.dataset.catId = cat.id;

      const header = document.createElement("div");
      header.className = "cat-header";
      header.dataset.catId = cat.id;
      header.classList.toggle("collapsed", Boolean(state.prefs.collapsed[cat.id]));
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
        list.show({ type: "category", id: cat.id, title: cat.title });
      });
      this.makeDraggable(header, group);
      group.appendChild(header);

      const container = document.createElement("div");
      container.className = "cat-feeds";
      container.dataset.catId = cat.id;
      container.hidden = Boolean(state.prefs.collapsed[cat.id]);
      container.replaceChildren(...feeds.map((feed) => this.feedItem(feed)));
      group.appendChild(container);
      tree.appendChild(group);
    }

    this.updateBadges();
    this.updateSelected();
  },

  feedItem(feed) {
    const row = document.createElement("div");
    row.className = "feed-row";

    const btn = document.createElement("button");
    btn.className = "side-item";
    btn.dataset.feedId = feed.id;
    const errorDot = feed.parsing_error_count > 0
      ? '<span class="feed-error-dot" title="Feed has errors"></span>' : "";
    btn.innerHTML =
      `<img class="favicon" alt="" src="${PLACEHOLDER_ICON}">` +
      `<span class="side-label"></span>${errorDot}<span class="side-count"></span>`;
    btn.querySelector(".side-label").textContent = feed.title;
    btn.title = feed.title;
    btn.addEventListener("click", () => {
      list.show({ type: "feed", id: feed.id, title: feed.title });
    });

    const kebab = document.createElement("button");
    kebab.className = "feed-kebab";
    kebab.title = "Edit feed";
    kebab.innerHTML =
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>';
    kebab.addEventListener("click", (e) => {
      e.stopPropagation();
      manage.openEditFeed(feed);
    });

    // Drag a feed onto another category to move it there.
    row.draggable = true;
    row.addEventListener("dragstart", (e) => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(feed.id));
      this.drag = { type: "feed", feedId: feed.id };
      row.classList.add("dragging-feed");
      this.startAutoScroll(e.clientY);
    });
    row.addEventListener("dragend", () => {
      row.classList.remove("dragging-feed");
      this.stopAutoScroll();
      this.setDropTarget(null);
      this.drag = null;
    });

    row.append(btn, kebab);
    return row;
  },

  placeholderIcon() {
    return PLACEHOLDER_ICON;
  },

  /* Custom order from prefs first; categories not in the list follow, A-Z. */
  orderedCategories() {
    const order = state.prefs.categoryOrder ?? [];
    return [...state.categories].sort((a, b) => {
      const ia = order.indexOf(a.id);
      const ib = order.indexOf(b.id);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.title.localeCompare(b.title);
    });
  },

  /* Active sidebar drag: { type: "category" } or { type: "feed", feedId }. */
  drag: null,
  dropTargetEl: null,

  makeDraggable(header, group) {
    header.draggable = true;
    header.addEventListener("dragstart", (e) => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", group.dataset.catId);
      this.drag = { type: "category" };
      group.classList.add("dragging");
      this.startAutoScroll(e.clientY);
    });
    header.addEventListener("dragend", () => {
      group.classList.remove("dragging");
      this.stopAutoScroll();
      this.drag = null;
      this.saveOrder();
    });
  },

  setDropTarget(group) {
    if (this.dropTargetEl === group) return;
    this.dropTargetEl?.classList.remove("drop-target");
    this.dropTargetEl = group;
    group?.classList.add("drop-target");
  },

  /* Scroll the sidebar while a drag hovers near its top/bottom edge —
   * the browser doesn't auto-scroll inner overflow containers. */
  autoScroll: { raf: null, y: 0 },

  startAutoScroll(initialY) {
    const scroller = document.querySelector(".sidebar-scroll");
    const ZONE = 56;       // px from edge where scrolling kicks in
    const MAX_SPEED = 16;  // px per frame at the very edge
    this.autoScroll.y = initialY;
    const step = () => {
      if (!this.drag) {
        this.stopAutoScroll();
        return;
      }
      const rect = scroller.getBoundingClientRect();
      const y = this.autoScroll.y;
      let speed = 0;
      if (y < rect.top + ZONE) {
        speed = -Math.ceil(((rect.top + ZONE - y) / ZONE) * MAX_SPEED);
      } else if (y > rect.bottom - ZONE) {
        speed = Math.ceil(((y - (rect.bottom - ZONE)) / ZONE) * MAX_SPEED);
      }
      if (speed) scroller.scrollTop += speed;
      this.autoScroll.raf = requestAnimationFrame(step);
    };
    cancelAnimationFrame(this.autoScroll.raf);
    this.autoScroll.raf = requestAnimationFrame(step);
  },

  stopAutoScroll() {
    cancelAnimationFrame(this.autoScroll.raf);
    this.autoScroll.raf = null;
  },

  bindTreeDrag(tree) {
    if (tree.dataset.dndBound) return;
    tree.dataset.dndBound = "1";
    // Track the pointer over the whole scroll area (smart feeds included)
    // so edge auto-scroll works wherever the drag hovers.
    tree.closest(".sidebar-scroll").addEventListener("dragover", (e) => {
      if (!this.drag) return;
      e.preventDefault();
      this.autoScroll.y = e.clientY;
    });
    tree.addEventListener("dragover", (e) => {
      if (!this.drag) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (this.drag.type === "category") {
        const dragging = tree.querySelector(".cat-group.dragging");
        const target = e.target.closest(".cat-group");
        if (!dragging || !target || target === dragging) return;
        const rect = target.getBoundingClientRect();
        const after = e.clientY > rect.top + rect.height / 2;
        tree.insertBefore(dragging, after ? target.nextSibling : target);
      } else {
        // Feed drag: highlight the hovered category unless it's already home.
        const group = e.target.closest(".cat-group");
        const currentCatId = state.feedsById.get(this.drag.feedId)?.category?.id;
        this.setDropTarget(
          group && Number(group.dataset.catId) !== currentCatId ? group : null);
      }
    });
    tree.addEventListener("drop", (e) => {
      e.preventDefault();
      if (this.drag?.type === "feed") {
        const group = e.target.closest(".cat-group");
        if (group) manage.moveFeed(this.drag.feedId, Number(group.dataset.catId));
      }
      this.setDropTarget(null);
    });
  },

  saveOrder() {
    const ids = [...document.querySelectorAll("#feed-tree .cat-group")]
      .map((g) => Number(g.dataset.catId));
    if (!ids.length) return;
    state.prefs.categoryOrder = ids;
    state.savePrefs();
  },

  toggleCategory(catId, header) {
    const collapsed = !state.prefs.collapsed[catId];
    if (collapsed) state.prefs.collapsed[catId] = true;
    else delete state.prefs.collapsed[catId];
    state.savePrefs();
    header.classList.toggle("collapsed", collapsed);
    const container = document.querySelector(`.cat-feeds[data-cat-id="${catId}"]`);
    if (container) container.hidden = collapsed;
  },

  updateBadges() {
    const unreads = state.counters.unreads ?? {};
    for (const el of document.querySelectorAll("#feed-tree .side-item[data-feed-id]")) {
      const n = unreads[el.dataset.feedId] ?? 0;
      el.querySelector(".side-count").textContent = n ? String(n) : "";
    }
    for (const el of document.querySelectorAll("#feed-tree .cat-header")) {
      const n = state.categoryUnread(Number(el.dataset.catId));
      el.querySelector(".side-count").textContent = n ? String(n) : "";
    }
    const allBtn = document.querySelector('#smart-feeds .side-item[data-type="all"]');
    if (allBtn) {
      const total = state.unreadTotal();
      allBtn.querySelector(".side-count").textContent = total ? String(total) : "";
    }
  },

  updateSelected() {
    const sel = state.selection;
    for (const el of document.querySelectorAll("#sidebar .side-item")) {
      const isSel =
        (el.dataset.type && el.dataset.type === sel.type) ||
        (el.dataset.feedId && sel.type === "feed" && Number(el.dataset.feedId) === sel.id);
      el.classList.toggle("selected", Boolean(isSel));
    }
    for (const el of document.querySelectorAll("#feed-tree .cat-header")) {
      el.classList.toggle("selected",
        sel.type === "category" && Number(el.dataset.catId) === sel.id);
    }
  },

  async loadIcons() {
    const wanted = Map.groupBy(
      state.feeds.filter((feed) => feed.icon?.icon_id),
      (feed) => feed.icon.icon_id);
    for (const [iconId, feeds] of wanted) {
      let dataUrl = state.icons.get(iconId);
      if (!dataUrl) {
        if (state.offline) continue; // cache-only; localStorage icons still show
        try {
          const icon = await api.icon(iconId);
          if (!icon?.data) continue;
          dataUrl = `data:${icon.data}`;
          state.icons.set(iconId, dataUrl);
        } catch {
          continue;
        }
      }
      for (const feed of feeds) {
        const img = document.querySelector(
          `.side-item[data-feed-id="${feed.id}"] .favicon`);
        if (img) img.src = dataUrl;
      }
    }
    list.refreshFavicons();
  },

  faviconFor(feedId) {
    const iconId = state.feedsById.get(feedId)?.icon?.icon_id;
    return (iconId && state.icons.get(iconId)) || PLACEHOLDER_ICON;
  },
};
