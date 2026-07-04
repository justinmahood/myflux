/* Mobile drill-in navigation and its History API integration
 * (platform back gesture support). */
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
  const back = vi.spyOn(history, "back").mockImplementation(() => {});
  nav.showReader();
  nav.showList();
  nav.showSidebar();
  expect(push).not.toHaveBeenCalled();
  expect(back).not.toHaveBeenCalled();
  expect(document.body.classList.contains("show-sidebar")).toBe(true);
});

test("nav: mobile drill-in pushes one history entry", () => {
  vi.spyOn(nav, "isMobile").mockReturnValue(true);
  const push = vi.spyOn(history, "pushState");
  nav.showReader();
  expect(push).toHaveBeenCalledExactlyOnceWith({ pane: "reader" }, "");
  expect(document.body.classList.contains("show-reader")).toBe(true);
});

test("nav: mobile back-to-list delegates to history.back", () => {
  vi.spyOn(nav, "isMobile").mockReturnValue(true);
  history.replaceState({ pane: "reader" }, "");
  nav.current = "reader";
  const back = vi.spyOn(history, "back").mockImplementation(() => {});
  const push = vi.spyOn(history, "pushState");
  nav.showList();
  expect(back).toHaveBeenCalledOnce();
  expect(push).not.toHaveBeenCalled();
  // the visual switch happens in the popstate handler, not synchronously
  expect(document.body.classList.contains("show-list")).toBe(false);
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
