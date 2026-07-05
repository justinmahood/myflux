/* Share action. The Miniflux REST API cannot create share codes (that's a
 * web-UI-session route), so the reader shares the public Miniflux page only
 * when the entry already carries a share_code, and the original article URL
 * otherwise — and must say which one the user got. */
import { test, expect, vi, beforeEach, afterEach } from "vitest";
import { api } from "../js/api.js";
import { reader } from "../js/reader.js";
import { nav, toast } from "../js/ui.js";

vi.mock("../js/ui.js", () => ({
  toast: vi.fn(),
  nav: {
    isMobile: vi.fn(() => false),
    showReader: vi.fn(), showList: vi.fn(), showSidebar: vi.fn(),
  },
}));

const stubbedNav = [];
function stubNavigator(props) {
  for (const [key, value] of Object.entries(props)) {
    Object.defineProperty(navigator, key, { value, configurable: true });
    stubbedNav.push(key);
  }
}

beforeEach(() => {
  api.configure("https://mf.test/sub/", "k");
  reader.current = null;
});

afterEach(() => {
  while (stubbedNav.length) {
    Object.defineProperty(navigator, stubbedNav.pop(),
      { value: undefined, configurable: true });
  }
  vi.clearAllMocks();
});

test("share: shareUrl keeps sub-path installations intact", () => {
  expect(api.shareUrl("aBc123")).toBe("https://mf.test/sub/share/aBc123");
});

test("share: shareLink prefers the Miniflux public page over the original URL", () => {
  const shared = { url: "https://orig.example/a", share_code: "zz9" };
  expect(reader.shareLink(shared)).toEqual({
    url: "https://mf.test/sub/share/zz9", kind: "Miniflux public link",
  });
  const unshared = { url: "https://orig.example/a", share_code: "" };
  expect(reader.shareLink(unshared)).toEqual({
    url: "https://orig.example/a", kind: "original link",
  });
});

test("share: desktop copies the Miniflux link and says so", async () => {
  const writeText = vi.fn(async () => {});
  stubNavigator({ clipboard: { writeText } });
  reader.current = { id: 1, title: "T", url: "https://orig.example/a", share_code: "zz9" };
  await reader.shareEntry();
  expect(writeText).toHaveBeenCalledExactlyOnceWith("https://mf.test/sub/share/zz9");
  expect(toast).toHaveBeenCalledExactlyOnceWith("Copied Miniflux public link to clipboard");
});

test("share: desktop falls back to the original URL for unshared entries", async () => {
  const writeText = vi.fn(async () => {});
  stubNavigator({ clipboard: { writeText } });
  reader.current = { id: 1, title: "T", url: "https://orig.example/a", share_code: "" };
  await reader.shareEntry();
  expect(writeText).toHaveBeenCalledExactlyOnceWith("https://orig.example/a");
  expect(toast).toHaveBeenCalledExactlyOnceWith("Copied original link to clipboard");
});

test("share: mobile uses the native share sheet, not the clipboard", async () => {
  nav.isMobile.mockReturnValue(true);
  const share = vi.fn(async () => {});
  const writeText = vi.fn(async () => {});
  stubNavigator({ share, clipboard: { writeText } });
  reader.current = { id: 1, title: "T", url: "https://orig.example/a", share_code: "zz9" };
  await reader.shareEntry();
  expect(share).toHaveBeenCalledExactlyOnceWith({
    title: "T", url: "https://mf.test/sub/share/zz9",
  });
  expect(writeText).not.toHaveBeenCalled();
  expect(toast).not.toHaveBeenCalled();
});

test("share: dismissing the share sheet is not an error", async () => {
  nav.isMobile.mockReturnValue(true);
  const abort = new Error("canceled");
  abort.name = "AbortError";
  stubNavigator({ share: vi.fn(async () => { throw abort; }) });
  reader.current = { id: 1, title: "T", url: "https://orig.example/a", share_code: "" };
  await reader.shareEntry();
  expect(toast).not.toHaveBeenCalled();
});
