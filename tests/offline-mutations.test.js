/* The optimistic mutation paths under failure: a network error keeps the
 * change and feeds the queue (silently); a real API error still reverts
 * and toasts — pinning the pre-offline behavior. */
import { test, expect, vi, beforeEach, afterEach } from "vitest";
import { list } from "../js/entrylist.js";
import { api, ApiError } from "../js/api.js";
import { offline } from "../js/offline.js";
import { state } from "../js/state.js";
import { sidebar } from "../js/sidebar.js";
import { toast } from "../js/ui.js";

vi.mock("../js/ui.js", () => ({
  toast: vi.fn(),
  nav: { isMobile: () => false, showList: vi.fn(), showReader: vi.fn(), showSidebar: vi.fn() },
}));

beforeEach(() => {
  state.counters = { reads: {}, unreads: { 5: 3 } };
  vi.spyOn(sidebar, "updateBadges").mockImplementation(() => {});
  vi.spyOn(offline, "enqueueStatus").mockResolvedValue();
  vi.spyOn(offline, "enqueueStar").mockResolvedValue();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(toast).mockClear();
});

test("setStatus offline: change survives, op enqueued, no toast", async () => {
  vi.spyOn(api, "updateEntries").mockRejectedValue(new TypeError("Failed to fetch"));
  const entry = { id: 1, feed_id: 5, status: "unread", starred: false };

  await list.setStatus(entry, "read");

  expect(entry.status).toBe("read");
  expect(state.counters.unreads[5]).toBe(2); // optimistic decrement kept
  expect(offline.enqueueStatus).toHaveBeenCalledExactlyOnceWith(1, "read", "unread");
  expect(toast).not.toHaveBeenCalled();
});

test("setStatus with a server error: reverts and toasts (unchanged behavior)", async () => {
  vi.spyOn(api, "updateEntries").mockRejectedValue(new ApiError(500, "boom"));
  const entry = { id: 1, feed_id: 5, status: "unread", starred: false };

  await list.setStatus(entry, "read");

  expect(entry.status).toBe("unread");
  expect(state.counters.unreads[5]).toBe(3);
  expect(offline.enqueueStatus).not.toHaveBeenCalled();
  expect(toast).toHaveBeenCalledOnce();
});

test("toggleStar offline: star kept, op enqueued, no toast", async () => {
  vi.spyOn(api, "toggleBookmark").mockRejectedValue(new TypeError("Failed to fetch"));
  const entry = { id: 2, feed_id: 5, status: "read", starred: false };

  await list.toggleStar(entry);

  expect(entry.starred).toBe(true);
  expect(offline.enqueueStar).toHaveBeenCalledExactlyOnceWith(2);
  expect(toast).not.toHaveBeenCalled();
});

test("toggleStar with a server error: reverts and toasts (unchanged behavior)", async () => {
  vi.spyOn(api, "toggleBookmark").mockRejectedValue(new ApiError(500, "boom"));
  const entry = { id: 2, feed_id: 5, status: "read", starred: true };

  await list.toggleStar(entry);

  expect(entry.starred).toBe(true); // reverted back to the original value
  expect(offline.enqueueStar).not.toHaveBeenCalled();
  expect(toast).toHaveBeenCalledOnce();
});
