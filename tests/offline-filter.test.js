/* filterCached must mirror entrylist.buildParams(): what the server would
 * return for a view, computed over the offline cache. Pure function — no
 * IndexedDB involved. */
import { test, expect } from "vitest";
import { filterCached } from "../js/offline.js";

const NOON = new Date("2026-07-05T12:00:00").getTime();
const TODAY_9AM = new Date("2026-07-05T09:00:00").toISOString();
const YESTERDAY = new Date("2026-07-04T18:00:00").toISOString();

function entry(over = {}) {
  return {
    id: 1, feed_id: 10, status: "unread", starred: false,
    title: "A title", content: "<p>Body text</p>",
    published_at: TODAY_9AM,
    feed: { id: 10, title: "Feed", category: { id: 3, title: "Cat" } },
    ...over,
  };
}

const ALL = { type: "all", id: null };
const READ_TOO = { unreadOnly: false };
const UNREAD_ONLY = { unreadOnly: true };

test("filterCached: feed and category selections match entry fields", () => {
  const entries = [
    entry({ id: 1, feed_id: 10 }),
    entry({ id: 2, feed_id: 20, feed: { id: 20, category: { id: 4 } } }),
  ];
  expect(filterCached(entries, { type: "feed", id: 20 }, READ_TOO, "").map((e) => e.id))
    .toEqual([2]);
  expect(filterCached(entries, { type: "category", id: 3 }, READ_TOO, "").map((e) => e.id))
    .toEqual([1]);
});

test("filterCached: starred view ignores unreadOnly", () => {
  const entries = [
    entry({ id: 1, starred: true, status: "read" }),
    entry({ id: 2, starred: false }),
  ];
  const out = filterCached(entries, { type: "starred", id: null }, UNREAD_ONLY, "");
  expect(out.map((e) => e.id)).toEqual([1]);
});

test("filterCached: unreadOnly hides read entries elsewhere", () => {
  const entries = [entry({ id: 1, status: "read" }), entry({ id: 2 })];
  expect(filterCached(entries, ALL, UNREAD_ONLY, "").map((e) => e.id)).toEqual([2]);
  expect(filterCached(entries, ALL, READ_TOO, "").length).toBe(2);
});

test("filterCached: today means local midnight relative to the injected now", () => {
  const entries = [
    entry({ id: 1, published_at: TODAY_9AM }),
    entry({ id: 2, published_at: YESTERDAY }),
  ];
  const out = filterCached(entries, { type: "today", id: null }, READ_TOO, "", NOON);
  expect(out.map((e) => e.id)).toEqual([1]);
});

test("filterCached: search matches title and content, case-insensitively", () => {
  const entries = [
    entry({ id: 1, title: "Espresso machines ranked" }),
    entry({ id: 2, content: "<p>the best ESPRESSO shots</p>" }),
    entry({ id: 3 }),
  ];
  const out = filterCached(entries, ALL, READ_TOO, "espresso");
  expect(out.map((e) => e.id).sort()).toEqual([1, 2]);
});

test("filterCached: removed entries never surface", () => {
  const entries = [entry({ id: 1, status: "removed" }), entry({ id: 2 })];
  expect(filterCached(entries, ALL, READ_TOO, "").map((e) => e.id)).toEqual([2]);
});

test("filterCached: re-imposes published_at desc on shuffled input", () => {
  const entries = [
    entry({ id: 1, published_at: "2026-07-01T10:00:00Z" }),
    entry({ id: 2, published_at: "2026-07-03T10:00:00Z" }),
    entry({ id: 3, published_at: "2026-07-02T10:00:00Z" }),
  ];
  expect(filterCached(entries, ALL, READ_TOO, "").map((e) => e.id)).toEqual([2, 3, 1]);
});
