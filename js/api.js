/* Miniflux REST API client. All methods return parsed JSON (or null for 204). */
(function () {
  "use strict";
  window.App = window.App || {};

  class ApiError extends Error {
    constructor(status, message) {
      super(message || `HTTP ${status}`);
      this.name = "ApiError";
      this.status = status;
    }
  }

  const api = {
    base: null,
    key: null,

    configure(baseUrl, key) {
      this.base = api.normalizeUrl(baseUrl);
      this.key = key;
    },

    // Accepts URLs with trailing slashes or a pasted "/v1" suffix.
    normalizeUrl(url) {
      url = String(url || "").trim().replace(/\/+$/, "");
      url = url.replace(/\/v1$/, "");
      return url;
    },

    async request(method, path, { params, body } = {}) {
      const url = new URL(this.base + "/v1" + path);
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          if (v !== null && v !== undefined && v !== "") url.searchParams.set(k, v);
        }
      }
      const headers = { "X-Auth-Token": this.key };
      if (body !== undefined) headers["Content-Type"] = "application/json";

      const res = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });

      if (!res.ok) {
        let message = null;
        try {
          message = (await res.json()).error_message;
        } catch (_) { /* non-JSON error body */ }
        throw new ApiError(res.status, message);
      }
      if (res.status === 204) return null;
      return res.json();
    },

    get(path, params) { return this.request("GET", path, { params }); },
    put(path, body, params) { return this.request("PUT", path, { body, params }); },

    // --- Endpoints ---
    me() { return this.get("/me"); },
    categories() { return this.get("/categories"); },
    feeds() { return this.get("/feeds"); },
    counters() { return this.get("/feeds/counters"); },
    icon(iconId) { return this.get(`/icons/${iconId}`); },

    entries(params) { return this.get("/entries", params); },
    feedEntries(feedId, params) { return this.get(`/feeds/${feedId}/entries`, params); },
    categoryEntries(catId, params) { return this.get(`/categories/${catId}/entries`, params); },

    updateEntries(entryIds, status) {
      return this.put("/entries", { entry_ids: entryIds, status });
    },
    toggleBookmark(entryId) { return this.put(`/entries/${entryId}/bookmark`); },
    fetchContent(entryId) { return this.get(`/entries/${entryId}/fetch-content`); },

    markFeedRead(feedId) { return this.put(`/feeds/${feedId}/mark-all-as-read`); },
    markCategoryRead(catId) { return this.put(`/categories/${catId}/mark-all-as-read`); },
    markUserRead(userId) { return this.put(`/users/${userId}/mark-all-as-read`); },
  };

  App.api = api;
  App.ApiError = ApiError;
})();
