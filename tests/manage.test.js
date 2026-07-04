/* Category-membership management: moveFeed (drag-and-drop) and the
 * Manage dialog's bulk operations. */
import { test, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../js/ui.js", () => ({
  toast: vi.fn(),
  nav: { set: vi.fn(), showSidebar: vi.fn(), showList: vi.fn(), showReader: vi.fn() },
}));

import { manage } from "../js/manage.js";
import { api } from "../js/api.js";
import { state } from "../js/state.js";
import { sidebar } from "../js/sidebar.js";
import { list } from "../js/entrylist.js";
import { toast } from "../js/ui.js";

beforeEach(() => {
  state.categories = [
    { id: 1, title: "Tech" },
    { id: 2, title: "News" },
  ];
  state.setFeeds([
    { id: 7, title: "Feed Seven", category: { id: 1, title: "Tech" } },
    { id: 8, title: "Feed Eight", category: { id: 2, title: "News" } },
  ]);
  state.selection = { type: "all", id: null, title: "All" };
  manage.selectedFeeds = new Set();
  vi.spyOn(api, "updateFeed").mockResolvedValue({});
  vi.spyOn(api, "deleteFeed").mockResolvedValue(null);
  vi.spyOn(sidebar, "load").mockResolvedValue();
  vi.spyOn(list, "show").mockImplementation(() => {});
  vi.spyOn(manage, "refreshAfterBulk").mockResolvedValue();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

test("moveFeed: moves a feed and reloads the sidebar", async () => {
  expect(await manage.moveFeed(7, 2)).toBe(true);
  expect(api.updateFeed).toHaveBeenCalledWith(7, { category_id: 2 });
  expect(sidebar.load).toHaveBeenCalled();
  expect(toast).toHaveBeenCalledWith("Moved “Feed Seven” to News");
});

test("moveFeed: dropping on the feed's own category is a no-op", async () => {
  expect(await manage.moveFeed(7, 1)).toBe(false);
  expect(api.updateFeed).not.toHaveBeenCalled();
});

test("moveFeed: unknown feed or category is a no-op", async () => {
  expect(await manage.moveFeed(999, 2)).toBe(false);
  expect(await manage.moveFeed(7, 999)).toBe(false);
  expect(api.updateFeed).not.toHaveBeenCalled();
});

test("moveFeed: refreshes the open category view when membership changes", async () => {
  state.selection = { type: "category", id: 1, title: "Tech" }; // source category open
  await manage.moveFeed(7, 2);
  expect(list.show).toHaveBeenCalledWith({ type: "category", id: 1, title: "Tech" });
});

test("moveFeed: leaves unrelated views alone", async () => {
  state.selection = { type: "feed", id: 7, title: "Feed Seven" };
  await manage.moveFeed(7, 2);
  expect(list.show).not.toHaveBeenCalled();
});

test("moveFeed: API failure surfaces an error toast and returns false", async () => {
  api.updateFeed.mockRejectedValue(new Error("nope"));
  expect(await manage.moveFeed(7, 2)).toBe(false);
  expect(toast).toHaveBeenCalledWith("Could not move feed — nope", true);
});

test("bulkMove: moves only feeds not already in the target category", async () => {
  manage.selectedFeeds = new Set([7, 8]); // 8 is already in News
  await manage.bulkMove(2);
  expect(api.updateFeed).toHaveBeenCalledTimes(1);
  expect(api.updateFeed).toHaveBeenCalledWith(7, { category_id: 2 });
  expect(manage.refreshAfterBulk).toHaveBeenCalled();
  expect(toast).toHaveBeenCalledWith("Moved 1 feed to News", false);
  expect(manage.selectedFeeds.size).toBe(0); // selection clears after bulk actions
});

test("bulkMove: all feeds already in target is a friendly no-op", async () => {
  manage.selectedFeeds = new Set([8]);
  await manage.bulkMove(2);
  expect(api.updateFeed).not.toHaveBeenCalled();
  expect(toast).toHaveBeenCalledWith("Selected feeds are already in News");
});

test("bulkMove: reports partial failures", async () => {
  state.setFeeds([
    { id: 7, title: "Feed Seven", category: { id: 1, title: "Tech" } },
    { id: 9, title: "Feed Nine", category: { id: 1, title: "Tech" } },
  ]);
  manage.selectedFeeds = new Set([7, 9]);
  api.updateFeed.mockImplementation((id) =>
    id === 9 ? Promise.reject(new Error("boom")) : Promise.resolve({}));
  await manage.bulkMove(2);
  expect(toast).toHaveBeenCalledWith("Moved 1 to News — 1 failed", true);
});

test("bulkUnsubscribe: confirms, deletes each, clears selection", async () => {
  vi.stubGlobal("confirm", vi.fn(() => true));
  manage.selectedFeeds = new Set([7, 8]);
  await manage.bulkUnsubscribe();
  expect(api.deleteFeed).toHaveBeenCalledTimes(2);
  expect(manage.selectedFeeds.size).toBe(0);
  expect(toast).toHaveBeenCalledWith("Unsubscribed 2 feeds", false);
  vi.unstubAllGlobals();
});

test("bulkUnsubscribe: cancelled confirm does nothing", async () => {
  vi.stubGlobal("confirm", vi.fn(() => false));
  manage.selectedFeeds = new Set([7]);
  await manage.bulkUnsubscribe();
  expect(api.deleteFeed).not.toHaveBeenCalled();
  expect(manage.selectedFeeds.size).toBe(1);
  vi.unstubAllGlobals();
});
