/* State tests: derived values, events, prefs persistence.
 * Vitest's jsdom environment provides a fresh localStorage per test file. */
import { test, expect } from "vitest";
import { state } from "../js/state.js";

function fixtureFeeds() {
  state.setFeeds([
    { id: 1, title: "Feed One", category: { id: 10, title: "Cat A" } },
    { id: 2, title: "Feed Two", category: { id: 10, title: "Cat A" } },
    { id: 3, title: "Feed Three", category: { id: 20, title: "Cat B" } },
  ]);
  state.counters = { reads: {}, unreads: { 1: 5, 2: 2, 3: 7 } };
}

test("state: feedsById map and feedTitle lookup", () => {
  fixtureFeeds();
  expect(state.feedTitle(2)).toBe("Feed Two");
  expect(state.feedTitle(999)).toBe("");
});

test("state: unreadTotal sums all feeds", () => {
  fixtureFeeds();
  expect(state.unreadTotal()).toBe(14);
});

test("state: categoryUnread sums only that category's feeds", () => {
  fixtureFeeds();
  expect(state.categoryUnread(10)).toBe(7);
  expect(state.categoryUnread(20)).toBe(7);
  expect(state.categoryUnread(999)).toBe(0);
});

test("state: emit dispatches CustomEvent with detail", () => {
  let got = null;
  const handler = (e) => { got = e.detail; };
  state.addEventListener("test-event", handler);
  state.emit("test-event", { x: 1 });
  state.removeEventListener("test-event", handler);
  expect(got).toEqual({ x: 1 });
});

test("state: prefs round-trip through localStorage", () => {
  state.prefs.theme = "dark";
  state.prefs.unreadOnly = false;
  state.prefs.categoryOrder = [3, 1, 2];
  state.savePrefs();

  state.prefs.theme = "auto";
  state.prefs.unreadOnly = true;
  state.prefs.categoryOrder = [];
  state.loadPrefs();

  expect(state.prefs.theme).toBe("dark");
  expect(state.prefs.unreadOnly).toBe(false);
  expect(state.prefs.categoryOrder).toEqual([3, 1, 2]);
});

test("state: corrupt prefs JSON keeps defaults", () => {
  localStorage.setItem("myflux.prefs", "{not json");
  expect(() => state.loadPrefs()).not.toThrow();
});

test("state: creds save/load/clear", () => {
  state.saveCreds("https://mf.test", "key123");
  state.creds = null;
  expect(state.loadCreds()).toEqual({ url: "https://mf.test", key: "key123" });
  state.clearCreds();
  expect(state.loadCreds()).toBeNull();
});

test("state: icon cache set/get", () => {
  state.icons.set(42, "data:image/png;base64,AA==");
  expect(state.icons.get(42)).toBe("data:image/png;base64,AA==");
  expect(state.icons.get(43)).toBeUndefined();
});
