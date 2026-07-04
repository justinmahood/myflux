/* Pure-logic behaviors from the view modules: category ordering,
 * entry-list query building, and row rendering (no init() needed —
 * these paths don't touch the app's live DOM). */
import { test, expect } from "vitest";
import { state } from "../js/state.js";
import { sidebar } from "../js/sidebar.js";
import { list } from "../js/entrylist.js";

test("sidebar: default category order is alphabetical", () => {
  state.categories = [
    { id: 1, title: "Zebra" }, { id: 2, title: "Alpha" }, { id: 3, title: "Mango" },
  ];
  state.prefs.categoryOrder = [];
  expect(sidebar.orderedCategories().map((c) => c.title))
    .toEqual(["Alpha", "Mango", "Zebra"]);
});

test("sidebar: custom order wins; unordered categories follow A-Z", () => {
  state.categories = [
    { id: 1, title: "Beta" }, { id: 2, title: "Alpha" },
    { id: 3, title: "Delta" }, { id: 4, title: "Carrot" },
  ];
  state.prefs.categoryOrder = [3, 1]; // Delta, Beta pinned; Alpha+Carrot trail A-Z
  expect(sidebar.orderedCategories().map((c) => c.title))
    .toEqual(["Delta", "Beta", "Alpha", "Carrot"]);
});

test("sidebar: faviconFor falls back to placeholder", () => {
  state.setFeeds([{ id: 1, title: "F", icon: null }]);
  expect(sidebar.faviconFor(1)).toMatch(/^data:image\/svg\+xml/);
  expect(sidebar.faviconFor(999)).toMatch(/^data:image\/svg\+xml/);
});

function setSelection(sel, { unreadOnly = true, search = "" } = {}) {
  state.selection = sel;
  state.prefs.unreadOnly = unreadOnly;
  state.search = search;
  list.offset = 0;
}

test("entrylist: buildParams for unread-only view", () => {
  setSelection({ type: "all", id: null, title: "All" });
  const p = list.buildParams();
  expect(p.status).toBe("unread");
  expect(p.order).toBe("published_at");
  expect(p.direction).toBe("desc");
  expect(p).not.toHaveProperty("starred");
});

test("entrylist: buildParams shows all statuses when toggle is off", () => {
  setSelection({ type: "all", id: null, title: "All" }, { unreadOnly: false });
  expect(list.buildParams()).not.toHaveProperty("status");
});

test("entrylist: buildParams for starred ignores unread filter", () => {
  setSelection({ type: "starred", id: null, title: "Starred" });
  const p = list.buildParams();
  expect(p.starred).toBe("true");
  expect(p).not.toHaveProperty("status");
});

test("entrylist: buildParams for today uses local-midnight published_after", () => {
  setSelection({ type: "today", id: null, title: "Today" });
  expect(list.buildParams().published_after)
    .toBe(Math.floor(new Date().setHours(0, 0, 0, 0) / 1000));
});

test("entrylist: buildParams includes search when set", () => {
  setSelection({ type: "all", id: null, title: "All" }, { search: "espresso" });
  expect(list.buildParams().search).toBe("espresso");
});

const entryFixture = (overrides = {}) => ({
  id: 1,
  status: "unread",
  starred: false,
  title: "A Great Title",
  content: "<h1>A Great Title</h1><p>Body text of the article.</p>",
  published_at: new Date().toISOString(),
  feed_id: 9,
  feed: { title: "Feed X" },
  enclosures: [],
  url: "https://site.test/post",
  ...overrides,
});

test("entrylist: renderRow dedupes title from snippet", () => {
  state.setFeeds([]);
  const row = list.renderRow(entryFixture());
  expect(row.querySelector(".entry-title").textContent).toBe("A Great Title");
  expect(row.querySelector(".entry-snippet").textContent).toBe("Body text of the article.");
});

test("entrylist: renderRow marks read entries and shows stars", () => {
  state.setFeeds([]);
  const read = list.renderRow(entryFixture({ status: "read", starred: true }));
  expect(read.classList.contains("read")).toBe(true);
  expect(read.querySelector(".entry-star").hidden).toBe(false);
  const unread = list.renderRow(entryFixture());
  expect(unread.classList.contains("read")).toBe(false);
  expect(unread.querySelector(".entry-star").hidden).toBe(true);
});

test("entrylist: renderRow uses image enclosure for the thumbnail", () => {
  state.setFeeds([]);
  const row = list.renderRow(entryFixture({
    enclosures: [{ mime_type: "image/jpeg", url: "https://cdn.test/thumb.jpg" }],
  }));
  expect(row.querySelector(".entry-thumb").style.backgroundImage)
    .toContain("cdn.test/thumb.jpg");
});

test("entrylist: renderRow uses <time> with machine-readable datetime", () => {
  state.setFeeds([]);
  const entry = entryFixture();
  const time = list.renderRow(entry).querySelector("time");
  expect(time).not.toBeNull();
  expect(time.dateTime).toBe(entry.published_at);
});
