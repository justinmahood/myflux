/* Offline data layer: IndexedDB-cached entries and snapshots, the pending-op
 * queue with its replay rules, connectivity probing, and the offline banner.
 * Imports only leaf modules (api/state/db/ui) — pane orchestration lives in
 * app.js. Every IDB touch is failure-tolerant: a broken IndexedDB must never
 * degrade the online app. */
import { api, ApiError, isNetworkError } from "./api.js";
import { state } from "./state.js";
import { db } from "./db.js";
import { toast } from "./ui.js";

const MAX_CACHED = 500;
const PREFETCH_LIMIT = 100;

/* Mirror of entrylist.buildParams(), applied to cached entries. Pure. */
export function filterCached(entries, selection, prefs, search, now = Date.now()) {
  const q = (search ?? "").trim().toLowerCase();
  const midnight = new Date(now).setHours(0, 0, 0, 0);
  return entries
    .filter((e) => e.status !== "removed")
    .filter((e) => {
      if (selection.type === "feed") return e.feed_id === selection.id;
      if (selection.type === "category") return e.feed?.category?.id === selection.id;
      if (selection.type === "starred") return Boolean(e.starred);
      if (selection.type === "today") return new Date(e.published_at).getTime() >= midnight;
      return true;
    })
    .filter((e) => selection.type === "starred" || !prefs.unreadOnly || e.status === "unread")
    // Substring over raw title+content is close enough to the server's
    // full-text search; matching inside markup is an accepted false positive.
    .filter((e) => !q || `${e.title} ${e.content}`.toLowerCase().includes(q))
    .sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
}

/* Adjust unread badges for queued status ops (offline boot). Sound because
 * an op's existence guarantees a real one-step change from its cache-time
 * status — ops that net out to no change are deleted at enqueue time. */
export function applyQueueToCounters(counters, queue, cachedById) {
  const unreads = { ...(counters.unreads ?? {}) };
  for (const op of queue) {
    if (op.kind !== "status") continue;
    const entry = cachedById.get(op.entryId);
    if (!entry) continue; // never cached: badge is slightly off, nothing else
    const delta = op.status === "read" ? -1 : +1;
    unreads[entry.feed_id] = Math.max(0, (unreads[entry.feed_id] ?? 0) + delta);
  }
  return { ...counters, unreads };
}

export const offline = {
  pendingIds: new Set(), // entry ids with queued ops (guards persist/prune)
  pendingCount: 0,
  flushing: false,
  flushAgain: false,
  els: {},

  init() {
    this.els.banner = document.getElementById("offline-banner");
    this.els.pending = document.getElementById("offline-pending");

    // Window events are hints, never gates: "offline" shows the banner
    // instantly, "online" only triggers a probe — connectivity flips online
    // exclusively when a real request succeeds (in api.request).
    window.addEventListener("offline", () => state.setConnectivity(false));
    window.addEventListener("online", () => this.probe());

    state.addEventListener("connectivity", () => this.syncBanner());
    state.addEventListener("queue-changed", () => this.syncBanner());
    // One listener keeps cached entries correct through optimistic applies
    // AND reverts — "entry-updated" fires for both.
    state.addEventListener("entry-updated", (e) => {
      db.put("entries", e.detail).catch(() => {});
    });

    // Don't touch the DB from the login screen — opening it would re-create
    // an empty shell right after logout's destroy().
    if (state.loadCreds()) this.syncQueueState().catch(() => {});
  },

  syncBanner() {
    if (!this.els.banner) return;
    this.els.banner.hidden = !state.offline;
    this.els.pending.textContent =
      this.pendingCount ? ` · ${this.pendingCount} pending` : "";
  },

  /* --- cached entries --- */

  async getCachedEntries() {
    try { return await db.getAll("entries"); } catch { return []; }
  },

  async loadCached(selection, prefs, search) {
    return filterCached(await this.getCachedEntries(), selection, prefs, search);
  },

  async persistEntries(entries) {
    // Never clobber an entry whose queued op hasn't replayed yet (a fetched
    // page can be stale relative to the user's offline changes).
    const fresh = entries.filter((e) => !this.pendingIds.has(e.id));
    if (!fresh.length) return;
    try {
      await db.bulkPut("entries", fresh);
    } catch (err) {
      if (err?.name === "QuotaExceededError") await this.prune().catch(() => {});
    }
  },

  async prune() {
    try {
      const entries = await db.getAll("entries");
      const feedIds = new Set(state.feeds.map((f) => f.id));
      const doomed = [];
      // Unsubscribed-feed corpses first (only when we actually know the feeds)
      let alive = entries;
      if (feedIds.size) {
        alive = [];
        for (const e of entries) {
          if (!feedIds.has(e.feed_id) && !this.pendingIds.has(e.id)) doomed.push(e.id);
          else alive.push(e);
        }
      }
      if (alive.length > MAX_CACHED) {
        alive.sort((a, b) => new Date(a.published_at) - new Date(b.published_at));
        let excess = alive.length - MAX_CACHED;
        for (const e of alive) {
          if (!excess) break;
          if (this.pendingIds.has(e.id)) continue;
          doomed.push(e.id);
          excess--;
        }
      }
      if (doomed.length) await db.bulkDel("entries", doomed);
    } catch { /* cache is best-effort */ }
  },

  /* --- snapshot (sidebar data for offline boot) --- */

  accountKey() {
    return `${api.base}:${state.user?.id ?? ""}`;
  },

  async saveSnapshot() {
    try {
      await db.put("meta", {
        user: state.user,
        categories: state.categories,
        feeds: state.feeds,
        counters: state.counters,
        hasIntegrations: state.hasIntegrations,
        accountKey: this.accountKey(),
        lastSyncedAt: Date.now(),
      }, "snapshot");
    } catch { /* best-effort */ }
  },

  async saveCounters() {
    try {
      const snap = await db.get("meta", "snapshot");
      if (!snap) return;
      await db.put("meta",
        { ...snap, counters: state.counters, lastSyncedAt: Date.now() }, "snapshot");
    } catch { /* best-effort */ }
  },

  // Timeout-raced: a pathological IDB open must not hang boot.
  async loadSnapshot() {
    try {
      return await Promise.race([
        db.get("meta", "snapshot"),
        new Promise((resolve) => setTimeout(() => resolve(null), 2000)),
      ]) ?? null;
    } catch {
      return null;
    }
  },

  /* --- pending-op queue --- */

  async getQueue() {
    try { return await db.getAll("queue"); } catch { return []; }
  },

  // Queue mutations are read-modify-write across separate transactions, so
  // rapid mutations (j/j/j, double-tap star) must not interleave: chain them.
  _queueTail: Promise.resolve(),
  serialize(fn) {
    const next = this._queueTail.then(fn, fn);
    this._queueTail = next.catch(() => {});
    return next;
  },

  async syncQueueState() {
    const queue = await this.getQueue();
    this.pendingIds = new Set(queue.map((op) => op.entryId));
    this.pendingCount = queue.length;
    state.emit("queue-changed", { count: this.pendingCount });
  },

  // Latest desired status wins; the original prevStatus is kept so an op
  // that circles back to it nets out to nothing (deleting the op keeps
  // applyQueueToCounters sound and the replay minimal).
  enqueueStatus(entryId, status, prevStatus) {
    return this.serialize(async () => {
      try {
        const queue = await db.getAll("queue");
        const existing = queue.find((op) => op.kind === "status" && op.entryId === entryId);
        const original = existing?.prevStatus ?? prevStatus;
        if (existing) await db.del("queue", existing.id);
        if (status !== original) {
          await db.put("queue",
            { kind: "status", entryId, status, prevStatus: original, queuedAt: Date.now() });
        }
        await this.syncQueueState();
      } catch { /* change stays applied in-memory only */ }
    });
  },

  // The bookmark endpoint is a TOGGLE (not idempotent): at most one queued
  // star op per entry — a second offline toggle deletes it (net zero).
  enqueueStar(entryId) {
    return this.serialize(async () => {
      try {
        const queue = await db.getAll("queue");
        const existing = queue.find((op) => op.kind === "star" && op.entryId === entryId);
        if (existing) await db.del("queue", existing.id);
        else await db.put("queue", { kind: "star", entryId, queuedAt: Date.now() });
        await this.syncQueueState();
      } catch { /* change stays applied in-memory only */ }
    });
  },

  /* Replay the queue. Status ops group into at most two absolute (hence
   * idempotent) batch calls; star ops replay as individual toggles.
   * Network error / 5xx → keep ops and abort (retried on the next
   * connectivity transition or probe). 4xx → drop the poison ops so the
   * queue can never wedge, with one summary toast. */
  async flush() {
    if (this.flushing) {
      this.flushAgain = true;
      return;
    }
    this.flushing = true;
    let dropped = 0;
    try {
      const queue = await db.getAll("queue");
      for (const [status, ops] of Map.groupBy(
        queue.filter((op) => op.kind === "status"), (op) => op.status)) {
        try {
          await api.updateEntries(ops.map((op) => op.entryId), status);
          await db.bulkDel("queue", ops.map((op) => op.id));
        } catch (err) {
          if (isNetworkError(err) || (err instanceof ApiError && err.status >= 500)) return;
          await db.bulkDel("queue", ops.map((op) => op.id));
          dropped += ops.length;
        }
      }
      for (const op of queue.filter((o) => o.kind === "star")) {
        try {
          await api.toggleBookmark(op.entryId);
          await db.del("queue", op.id);
        } catch (err) {
          if (isNetworkError(err) || (err instanceof ApiError && err.status >= 500)) return;
          await db.del("queue", op.id);
          dropped++;
        }
      }
    } catch { /* IDB failure: nothing to flush */ }
    finally {
      this.flushing = false;
      await this.syncQueueState().catch(() => {});
      if (dropped) {
        toast(`${dropped} offline change${dropped === 1 ? "" : "s"} could not be applied`, true);
      }
      if (this.flushAgain) {
        this.flushAgain = false;
        await this.flush();
      }
    }
  },

  /* --- connectivity & prefetch --- */

  // Throwaway request; api.request flips connectivity on success.
  async probe() {
    try { await api.counters(); } catch { /* still offline */ }
  },

  // Newest unread so "open the app on the subway" works without browsing.
  async prefetch() {
    if (state.offline) return;
    try {
      const res = await api.entries({
        status: "unread", order: "published_at", direction: "desc", limit: PREFETCH_LIMIT,
      });
      await this.persistEntries((res.entries ?? []).filter((e) => e.status !== "removed"));
      await this.prune();
    } catch { /* best-effort */ }
  },

  /* --- lifecycle --- */

  async clearAll() {
    try {
      await Promise.all([db.clear("entries"), db.clear("meta"), db.clear("queue")]);
      await this.syncQueueState();
    } catch { /* best-effort */ }
  },

  destroy() {
    return db.destroy();
  },
};
