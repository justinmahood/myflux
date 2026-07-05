/* Miniflux REST API client. All methods return parsed JSON (or null for 204). */
import { state } from "./state.js";

export class ApiError extends Error {
  constructor(status, message) {
    super(message || `HTTP ${status}`);
    this.name = "ApiError";
    this.status = status;
  }
}

// fetch rejects with TypeError only for network-level failures (aborts are
// DOMException AbortError, our errors are ApiError) — that distinction is
// what separates "offline" from "the server said no".
export const isNetworkError = (err) => err instanceof TypeError;

export const api = {
  base: null,
  key: null,

  configure(baseUrl, key) {
    this.base = api.normalizeUrl(baseUrl);
    this.key = key;
  },

  // Accepts URLs with trailing slashes or a pasted "/v1" suffix.
  normalizeUrl(url) {
    return String(url ?? "").trim().replace(/\/+$/, "").replace(/\/v1$/, "");
  },

  async request(method, path, { params, body, rawBody, signal } = {}) {
    const url = new URL(`${this.base}/v1${path}`);
    for (const [k, v] of Object.entries(params ?? {})) {
      if (v !== null && v !== undefined && v !== "") url.searchParams.set(k, v);
    }
    const headers = { "X-Auth-Token": this.key };
    if (body !== undefined) headers["Content-Type"] = "application/json";

    let res;
    try {
      res = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : rawBody,
        signal,
      });
    } catch (err) {
      if (err.name !== "AbortError") state.setConnectivity(false);
      throw err;
    }
    // The server answered — even an error status means we're reachable.
    state.setConnectivity(true);

    if (!res.ok) {
      const message = await res.json().then((data) => data.error_message, () => null);
      throw new ApiError(res.status, message);
    }
    if (res.status === 204) return null;
    const type = res.headers.get("Content-Type") ?? "";
    if (!type.includes("json")) return res.text();
    // Some endpoints (e.g. save-entry's 202) send a JSON content-type with an
    // empty body — res.json() would throw on those.
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  },

  get(path, params, signal) { return this.request("GET", path, { params, signal }); },
  put(path, body, params) { return this.request("PUT", path, { body, params }); },
  post(path, body) { return this.request("POST", path, { body }); },
  del(path) { return this.request("DELETE", path); },

  // --- Endpoints ---
  me() { return this.get("/me"); },
  categories() { return this.get("/categories"); },
  feeds() { return this.get("/feeds"); },
  counters() { return this.get("/feeds/counters"); },
  icon(iconId) { return this.get(`/icons/${iconId}`); },

  entries(params, signal) { return this.get("/entries", params, signal); },
  feedEntries(feedId, params, signal) {
    return this.get(`/feeds/${feedId}/entries`, params, signal);
  },
  categoryEntries(catId, params, signal) {
    return this.get(`/categories/${catId}/entries`, params, signal);
  },

  updateEntries(entryIds, status) {
    return this.put("/entries", { entry_ids: entryIds, status });
  },
  toggleBookmark(entryId) { return this.put(`/entries/${entryId}/bookmark`); },
  fetchContent(entryId) { return this.get(`/entries/${entryId}/fetch-content`); },
  saveEntry(entryId) { return this.post(`/entries/${entryId}/save`); },
  integrationsStatus() { return this.get("/integrations/status"); },
  // Public share page for an entry that already has a share_code. Codes can
  // only be created from the Miniflux web UI — the REST API has no endpoint
  // for it (POST /entry/share/{id} is a session-cookie UI route).
  shareUrl(shareCode) { return `${this.base}/share/${shareCode}`; },

  markFeedRead(feedId) { return this.put(`/feeds/${feedId}/mark-all-as-read`); },
  markCategoryRead(catId) { return this.put(`/categories/${catId}/mark-all-as-read`); },
  markUserRead(userId) { return this.put(`/users/${userId}/mark-all-as-read`); },

  // --- feed & category management ---
  discover(url) { return this.post("/discover", { url }); },
  createFeed(feedUrl, categoryId) {
    return this.post("/feeds", { feed_url: feedUrl, category_id: categoryId });
  },
  updateFeed(feedId, changes) { return this.put(`/feeds/${feedId}`, changes); },
  deleteFeed(feedId) { return this.del(`/feeds/${feedId}`); },
  refreshFeed(feedId) { return this.put(`/feeds/${feedId}/refresh`); },

  createCategory(title) { return this.post("/categories", { title }); },
  updateCategory(catId, title) { return this.put(`/categories/${catId}`, { title }); },
  deleteCategory(catId) { return this.del(`/categories/${catId}`); },

  exportOpml() { return this.get("/export"); },
  importOpml(xml) { return this.request("POST", "/import", { rawBody: xml }); },
};
