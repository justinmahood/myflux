/* Keyboard dispatch: keymap routing (including the case-sensitive s/S pair)
 * and the guards that keep shortcuts away from form fields and the login
 * view. Events are dispatched on detached elements purely to set e.target,
 * then fed to onKey directly — init() is never called here. */
import { test, expect, vi, beforeEach, afterEach } from "vitest";
import { shortcuts } from "../js/shortcuts.js";
import { reader } from "../js/reader.js";
import { list } from "../js/entrylist.js";

beforeEach(() => {
  document.body.innerHTML = '<div id="app-view"></div>';
  vi.spyOn(reader, "toggleStar").mockImplementation(() => {});
  vi.spyOn(reader, "saveEntry").mockImplementation(() => {});
  vi.spyOn(reader, "toggleRead").mockImplementation(() => {});
  vi.spyOn(list, "refresh").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function press(key, { target = document.body, ...init } = {}) {
  const e = new KeyboardEvent("keydown", { key, cancelable: true, ...init });
  target.dispatchEvent(e); // sets e.target without invoking any listener
  shortcuts.onKey(e);
}

test("shortcuts: lowercase s stars, uppercase S saves — never both", () => {
  press("s");
  expect(reader.toggleStar).toHaveBeenCalledOnce();
  expect(reader.saveEntry).not.toHaveBeenCalled();
  press("S");
  expect(reader.saveEntry).toHaveBeenCalledOnce();
  expect(reader.toggleStar).toHaveBeenCalledOnce();
});

test("shortcuts: ignored while typing in an input", () => {
  const input = document.createElement("input");
  press("S", { target: input });
  press("s", { target: input });
  expect(reader.saveEntry).not.toHaveBeenCalled();
  expect(reader.toggleStar).not.toHaveBeenCalled();
});

test("shortcuts: ignored with a system modifier held", () => {
  press("s", { metaKey: true });
  press("S", { ctrlKey: true });
  expect(reader.toggleStar).not.toHaveBeenCalled();
  expect(reader.saveEntry).not.toHaveBeenCalled();
});

test("shortcuts: inert while the app view is hidden (login screen)", () => {
  document.getElementById("app-view").hidden = true;
  press("s");
  press("S");
  press("m");
  expect(reader.toggleStar).not.toHaveBeenCalled();
  expect(reader.saveEntry).not.toHaveBeenCalled();
  expect(reader.toggleRead).not.toHaveBeenCalled();
});
