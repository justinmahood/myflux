/* State tests: derived values, events, prefs persistence.
 * index.html snapshots and restores all myflux.* localStorage keys, so
 * these tests can write real prefs without clobbering app state. */
import { test, assert, assertEqual } from "./runner.js";
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
  assertEqual(state.feedTitle(2), "Feed Two");
  assertEqual(state.feedTitle(999), "");
});

test("state: unreadTotal sums all feeds", () => {
  fixtureFeeds();
  assertEqual(state.unreadTotal(), 14);
});

test("state: categoryUnread sums only that category's feeds", () => {
  fixtureFeeds();
  assertEqual(state.categoryUnread(10), 7);
  assertEqual(state.categoryUnread(20), 7);
  assertEqual(state.categoryUnread(999), 0);
});

test("state: emit dispatches CustomEvent with detail", () => {
  let got = null;
  const handler = (e) => { got = e.detail; };
  state.addEventListener("test-event", handler);
  state.emit("test-event", { x: 1 });
  state.removeEventListener("test-event", handler);
  assertEqual(got, { x: 1 });
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

  assertEqual(state.prefs.theme, "dark");
  assertEqual(state.prefs.unreadOnly, false);
  assertEqual(state.prefs.categoryOrder, [3, 1, 2]);
});

test("state: creds save/load/clear", () => {
  state.saveCreds("https://mf.test", "key123");
  state.creds = null;
  assertEqual(state.loadCreds(), { url: "https://mf.test", key: "key123" });
  state.clearCreds();
  assertEqual(state.loadCreds(), null);
});

test("state: icon cache set/get", () => {
  state.icons.set(42, "data:image/png;base64,AA==");
  assertEqual(state.icons.get(42), "data:image/png;base64,AA==");
  assertEqual(state.icons.get(43), undefined);
});
