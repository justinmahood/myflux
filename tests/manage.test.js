/* moveFeed (sidebar drag-and-drop → category membership) logic. */
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
  ]);
  state.selection = { type: "all", id: null, title: "All" };
  vi.spyOn(api, "updateFeed").mockResolvedValue({});
  vi.spyOn(sidebar, "load").mockResolvedValue();
  vi.spyOn(list, "show").mockImplementation(() => {});
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
