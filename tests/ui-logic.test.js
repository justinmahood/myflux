/* Pure-logic behaviors from the view modules: category ordering,
 * entry-list query building, and row rendering (no init() needed —
 * these paths don't touch the app's live DOM). */
import { test, assert, assertEqual } from "./runner.js";
import { state } from "../js/state.js";
import { sidebar } from "../js/sidebar.js";
import { list } from "../js/entrylist.js";

test("sidebar: default category order is alphabetical", () => {
  state.categories = [
    { id: 1, title: "Zebra" }, { id: 2, title: "Alpha" }, { id: 3, title: "Mango" },
  ];
  state.prefs.categoryOrder = [];
  assertEqual(sidebar.orderedCategories().map((c) => c.title),
    ["Alpha", "Mango", "Zebra"]);
});

test("sidebar: custom order wins; unordered categories follow A-Z", () => {
  state.categories = [
    { id: 1, title: "Beta" }, { id: 2, title: "Alpha" },
    { id: 3, title: "Delta" }, { id: 4, title: "Carrot" },
  ];
  state.prefs.categoryOrder = [3, 1]; // Delta, Beta pinned; Alpha+Carrot trail A-Z
  assertEqual(sidebar.orderedCategories().map((c) => c.title),
    ["Delta", "Beta", "Alpha", "Carrot"]);
});

test("sidebar: faviconFor falls back to placeholder", () => {
  state.setFeeds([{ id: 1, title: "F", icon: null }]);
  assert(sidebar.faviconFor(1).startsWith("data:image/svg+xml"), "no placeholder");
  assert(sidebar.faviconFor(999).startsWith("data:image/svg+xml"), "no placeholder for unknown feed");
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
  assertEqual(p.status, "unread");
  assertEqual(p.order, "published_at");
  assertEqual(p.direction, "desc");
  assert(!("starred" in p));
});

test("entrylist: buildParams shows all statuses when toggle is off", () => {
  setSelection({ type: "all", id: null, title: "All" }, { unreadOnly: false });
  const p = list.buildParams();
  assert(!("status" in p), "status filter should be absent");
});

test("entrylist: buildParams for starred ignores unread filter", () => {
  setSelection({ type: "starred", id: null, title: "Starred" });
  const p = list.buildParams();
  assertEqual(p.starred, "true");
  assert(!("status" in p), "starred view must not filter by status");
});

test("entrylist: buildParams for today uses local-midnight published_after", () => {
  setSelection({ type: "today", id: null, title: "Today" });
  const p = list.buildParams();
  assertEqual(p.published_after, Math.floor(new Date().setHours(0, 0, 0, 0) / 1000));
});

test("entrylist: buildParams includes search when set", () => {
  setSelection({ type: "all", id: null, title: "All" }, { search: "espresso" });
  assertEqual(list.buildParams().search, "espresso");
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
  assertEqual(row.querySelector(".entry-title").textContent, "A Great Title");
  assertEqual(row.querySelector(".entry-snippet").textContent, "Body text of the article.");
});

test("entrylist: renderRow marks read entries and shows stars", () => {
  state.setFeeds([]);
  const read = list.renderRow(entryFixture({ status: "read", starred: true }));
  assert(read.classList.contains("read"));
  assertEqual(read.querySelector(".entry-star").hidden, false);
  const unread = list.renderRow(entryFixture());
  assert(!unread.classList.contains("read"));
  assertEqual(unread.querySelector(".entry-star").hidden, true);
});

test("entrylist: renderRow uses image enclosure for the thumbnail", () => {
  state.setFeeds([]);
  const row = list.renderRow(entryFixture({
    enclosures: [{ mime_type: "image/jpeg", url: "https://cdn.test/thumb.jpg" }],
  }));
  assert(row.querySelector(".entry-thumb").style.backgroundImage.includes("cdn.test/thumb.jpg"),
    "enclosure thumbnail not used");
});

test("entrylist: renderRow uses <time> with machine-readable datetime", () => {
  state.setFeeds([]);
  const entry = entryFixture();
  const time = list.renderRow(entry).querySelector("time");
  assert(time, "no <time> element");
  assertEqual(time.dateTime, entry.published_at);
});
