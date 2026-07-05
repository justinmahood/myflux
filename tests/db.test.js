/* IndexedDB wrapper: exercised against fake-indexeddb, which implements
 * real IDB semantics (transactions, keyPaths, autoIncrement) in pure JS.
 * db.js reads the indexedDB global lazily, so each test gets a pristine
 * factory via vi.stubGlobal. */
import { test, expect, vi, beforeEach } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { db } from "../js/db.js";

beforeEach(async () => {
  await db.close(); // drop the connection to the previous test's factory
  vi.stubGlobal("indexedDB", new IDBFactory());
});

test("db: entries round-trip through the in-line id keyPath", async () => {
  await db.put("entries", { id: 7, title: "seven" });
  expect(await db.get("entries", 7)).toEqual({ id: 7, title: "seven" });
  await db.put("entries", { id: 7, title: "seven, updated" });
  expect((await db.getAll("entries")).length).toBe(1);
  await db.del("entries", 7);
  expect(await db.get("entries", 7)).toBeUndefined();
});

test("db: meta uses out-of-line keys", async () => {
  await db.put("meta", { feeds: [1, 2] }, "snapshot");
  expect(await db.get("meta", "snapshot")).toEqual({ feeds: [1, 2] });
});

test("db: queue autoincrements and injects the generated id", async () => {
  const key1 = await db.put("queue", { kind: "star", entryId: 10 });
  const key2 = await db.put("queue", { kind: "star", entryId: 11 });
  expect(key2).toBeGreaterThan(key1);
  const all = await db.getAll("queue");
  expect(all.map((op) => op.id)).toEqual([key1, key2]);
});

test("db: bulkPut and bulkDel run as single transactions", async () => {
  await db.bulkPut("entries", [{ id: 1 }, { id: 2 }, { id: 3 }]);
  expect((await db.getAll("entries")).length).toBe(3);
  await db.bulkDel("entries", [1, 3]);
  expect((await db.getAll("entries")).map((e) => e.id)).toEqual([2]);
});

test("db: clear empties one store without touching others", async () => {
  await db.put("entries", { id: 1 });
  await db.put("meta", { x: 1 }, "snapshot");
  await db.clear("entries");
  expect(await db.getAll("entries")).toEqual([]);
  expect(await db.get("meta", "snapshot")).toEqual({ x: 1 });
});

test("db: destroy deletes the database; next use starts fresh", async () => {
  await db.put("entries", { id: 1 });
  await db.destroy();
  expect(await db.getAll("entries")).toEqual([]);
});
