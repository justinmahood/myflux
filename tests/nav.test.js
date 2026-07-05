/* Mobile drill-in navigation and its History API integration: the panes
 * form a hierarchy (sources 0 -> list 1 -> article 2) mirrored in browser
 * history so the platform back gesture walks back down. */
import { test, expect, vi, beforeEach, afterEach } from "vitest";
import { nav } from "../js/ui.js";

beforeEach(() => {
  document.body.className = "";
  nav.current = "list";
  history.replaceState({ pane: "list" }, "");
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("nav: desktop pane switches never touch history", () => {
  vi.spyOn(nav, "isMobile").mockReturnValue(false);
  const push = vi.spyOn(history, "pushState");
  const go = vi.spyOn(history, "go").mockImplementation(() => {});
  nav.showReader();
  nav.showList();
  nav.showSidebar();
  expect(push).not.toHaveBeenCalled();
  expect(go).not.toHaveBeenCalled();
  expect(document.body.classList.contains("show-sidebar")).toBe(true);
});

test("nav: enterApp builds the [sources, list] base stack on mobile", () => {
  vi.spyOn(nav, "isMobile").mockReturnValue(true);
  const replace = vi.spyOn(history, "replaceState");
  const push = vi.spyOn(history, "pushState");
  nav.enterApp();
  expect(replace).toHaveBeenCalledWith({ pane: "sidebar" }, "");
  expect(push).toHaveBeenCalledWith({ pane: "list" }, "");
});

test("nav: enterApp keeps a single normalized entry on desktop", () => {
  vi.spyOn(nav, "isMobile").mockReturnValue(false);
  const replace = vi.spyOn(history, "replaceState");
  const push = vi.spyOn(history, "pushState");
  nav.enterApp();
  expect(replace).toHaveBeenCalledWith({ pane: "list" }, "");
  expect(push).not.toHaveBeenCalled();
});

test("nav: drilling deeper pushes one entry (list -> reader)", () => {
  vi.spyOn(nav, "isMobile").mockReturnValue(true);
  const push = vi.spyOn(history, "pushState");
  nav.showReader();
  expect(push).toHaveBeenCalledExactlyOnceWith({ pane: "reader" }, "");
  expect(document.body.classList.contains("show-reader")).toBe(true);
});

test("nav: going shallower travels back through history (reader -> list)", () => {
  vi.spyOn(nav, "isMobile").mockReturnValue(true);
  history.replaceState({ pane: "reader" }, "");
  nav.current = "reader";
  const go = vi.spyOn(history, "go").mockImplementation(() => {});
  const push = vi.spyOn(history, "pushState");
  nav.showList();
  expect(go).toHaveBeenCalledExactlyOnceWith(-1);
  expect(push).not.toHaveBeenCalled();
  // the visual switch happens in the popstate handler, not synchronously
  expect(document.body.classList.contains("show-list")).toBe(false);
});

test("nav: opening the sources pane from the list travels back (list -> sidebar)", () => {
  vi.spyOn(nav, "isMobile").mockReturnValue(true);
  const go = vi.spyOn(history, "go").mockImplementation(() => {});
  nav.showSidebar();
  expect(go).toHaveBeenCalledExactlyOnceWith(-1);
});

test("nav: article -> sources jumps two levels in one traversal", () => {
  vi.spyOn(nav, "isMobile").mockReturnValue(true);
  history.replaceState({ pane: "reader" }, "");
  nav.current = "reader";
  const go = vi.spyOn(history, "go").mockImplementation(() => {});
  nav.showSidebar();
  expect(go).toHaveBeenCalledExactlyOnceWith(-2);
});

test("nav: picking a feed from the sources pane pushes the list", () => {
  vi.spyOn(nav, "isMobile").mockReturnValue(true);
  history.replaceState({ pane: "sidebar" }, "");
  nav.current = "sidebar";
  const push = vi.spyOn(history, "pushState");
  nav.showList();
  expect(push).toHaveBeenCalledExactlyOnceWith({ pane: "list" }, "");
});

test("nav: opening the next article reuses the reader entry (no stacking)", () => {
  vi.spyOn(nav, "isMobile").mockReturnValue(true);
  history.replaceState({ pane: "reader" }, "");
  nav.current = "reader";
  const push = vi.spyOn(history, "pushState");
  const replace = vi.spyOn(history, "replaceState");
  nav.showReader(); // j/k to the next article
  expect(push).not.toHaveBeenCalled();
  expect(replace).toHaveBeenCalledExactlyOnceWith({ pane: "reader" }, "");
});

test("nav: popstate applies the entry's pane (back gesture)", () => {
  nav.init();
  window.dispatchEvent(new PopStateEvent("popstate", { state: { pane: "sidebar" } }));
  expect(document.body.classList.contains("show-sidebar")).toBe(true);
  window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
  expect(document.body.classList.contains("show-list")).toBe(true);
});
