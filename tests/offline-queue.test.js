/* The pending-op queue: coalescing rules, replay grouping, and the failure
 * taxonomy (network/5xx keep ops, 4xx drops them). Runs against
 * fake-indexeddb; the api singleton is spied per test. */
import { test, expect, vi, beforeEach, afterEach } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { offline, applyQueueToCounters } from "../js/offline.js";
import { db } from "../js/db.js";
import { api, ApiError } from "../js/api.js";
import { toast } from "../js/ui.js";

vi.mock("../js/ui.js", () => ({ toast: vi.fn(), nav: {} }));

beforeEach(async () => {
  await db.close();
  vi.stubGlobal("indexedDB", new IDBFactory());
  offline.pendingIds = new Set();
  offline.pendingCount = 0;
  offline.flushing = false;
  offline.flushAgain = false;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(toast).mockClear();
});

test("queue: re-enqueueing the same status keeps a single op", async () => {
  await offline.enqueueStatus(1, "read", "unread");
  await offline.enqueueStatus(1, "read", "unread");
  const queue = await db.getAll("queue");
  expect(queue.length).toBe(1);
  expect(queue[0]).toMatchObject({ kind: "status", entryId: 1, status: "read", prevStatus: "unread" });
  expect(offline.pendingCount).toBe(1);
});

test("queue: circling back to the original status deletes the op", async () => {
  await offline.enqueueStatus(1, "read", "unread");
  // the entry is now read locally, so the revert passes prevStatus "read" —
  // the op's ORIGINAL prevStatus ("unread") must win the comparison
  await offline.enqueueStatus(1, "unread", "read");
  expect(await db.getAll("queue")).toEqual([]);
  expect(offline.pendingCount).toBe(0);
  expect(offline.pendingIds.size).toBe(0);
});

test("queue: star ops net out in pairs (the API is a toggle)", async () => {
  await offline.enqueueStar(5);
  expect(offline.pendingCount).toBe(1);
  await offline.enqueueStar(5);
  expect(await db.getAll("queue")).toEqual([]);
  await offline.enqueueStar(5);
  expect(offline.pendingCount).toBe(1);
});

test("queue: flush groups statuses into batch calls and toggles stars singly", async () => {
  const update = vi.spyOn(api, "updateEntries").mockResolvedValue(null);
  const bookmark = vi.spyOn(api, "toggleBookmark").mockResolvedValue(null);
  await offline.enqueueStatus(1, "read", "unread");
  await offline.enqueueStatus(2, "read", "unread");
  await offline.enqueueStatus(3, "unread", "read");
  await offline.enqueueStar(4);
  await offline.enqueueStar(5);

  await offline.flush();

  expect(update).toHaveBeenCalledTimes(2);
  expect(update).toHaveBeenCalledWith([1, 2], "read");
  expect(update).toHaveBeenCalledWith([3], "unread");
  expect(bookmark).toHaveBeenCalledTimes(2);
  expect(await db.getAll("queue")).toEqual([]);
  expect(offline.pendingCount).toBe(0);
});

test("queue: network failure during flush keeps every op", async () => {
  vi.spyOn(api, "updateEntries").mockRejectedValue(new TypeError("Failed to fetch"));
  const bookmark = vi.spyOn(api, "toggleBookmark").mockResolvedValue(null);
  await offline.enqueueStatus(1, "read", "unread");
  await offline.enqueueStar(2);

  await offline.flush();

  expect((await db.getAll("queue")).length).toBe(2);
  expect(bookmark).not.toHaveBeenCalled(); // flush aborted before stars
  expect(toast).not.toHaveBeenCalled();
});

test("queue: 5xx keeps ops for a later retry", async () => {
  vi.spyOn(api, "updateEntries").mockRejectedValue(new ApiError(503, "down"));
  await offline.enqueueStatus(1, "read", "unread");
  await offline.flush();
  expect((await db.getAll("queue")).length).toBe(1);
  expect(toast).not.toHaveBeenCalled();
});

test("queue: 4xx drops the poison ops with one summary toast", async () => {
  vi.spyOn(api, "updateEntries").mockRejectedValue(new ApiError(400, "bad"));
  vi.spyOn(api, "toggleBookmark").mockRejectedValue(new ApiError(404, "gone"));
  await offline.enqueueStatus(1, "read", "unread");
  await offline.enqueueStar(2);

  await offline.flush();

  expect(await db.getAll("queue")).toEqual([]);
  expect(toast).toHaveBeenCalledExactlyOnceWith(
    "2 offline changes could not be applied", true);
});

test("queue: concurrent enqueues serialize (double-tap star still nets out)", async () => {
  // No awaits between the calls — without serialization both would read an
  // empty queue and insert two star ops instead of netting to zero.
  await Promise.all([offline.enqueueStar(7), offline.enqueueStar(7)]);
  expect(await db.getAll("queue")).toEqual([]);

  await Promise.all([
    offline.enqueueStatus(8, "read", "unread"),
    offline.enqueueStatus(8, "unread", "read"), // circles back: net zero
  ]);
  expect(await db.getAll("queue")).toEqual([]);
  expect(offline.pendingCount).toBe(0);
});

test("queue: reentrant flush() calls never double-replay", async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  const update = vi.spyOn(api, "updateEntries").mockImplementation(async () => { await gate; });
  await offline.enqueueStatus(1, "read", "unread");

  const first = offline.flush();
  const second = offline.flush(); // must coalesce into flushAgain
  release();
  await Promise.all([first, second]);

  expect(update).toHaveBeenCalledTimes(1);
  expect(await db.getAll("queue")).toEqual([]);
});

test("applyQueueToCounters: adjusts unread badges from queued status ops", () => {
  const counters = { reads: {}, unreads: { 10: 3, 20: 1 } };
  const cachedById = new Map([
    [1, { id: 1, feed_id: 10 }],
    [2, { id: 2, feed_id: 20 }],
  ]);
  const queue = [
    { kind: "status", entryId: 1, status: "read" },    // 10: 3 -> 2
    { kind: "status", entryId: 2, status: "unread" },  // 20: 1 -> 2
    { kind: "star", entryId: 1 },                      // ignored
    { kind: "status", entryId: 99, status: "read" },   // not cached: skipped
  ];
  const out = applyQueueToCounters(counters, queue, cachedById);
  expect(out.unreads).toEqual({ 10: 2, 20: 2 });
  expect(counters.unreads).toEqual({ 10: 3, 20: 1 }); // input untouched
});
