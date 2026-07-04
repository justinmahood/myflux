/* API client tests: URL normalization, request building, response and
 * error handling — with fetch stubbed out. */
import { test, expect, vi, afterEach } from "vitest";
import { api, ApiError } from "../js/api.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

/* Stub fetch; returns the recorded calls as {url, opts}. */
function stubFetch(responder) {
  const calls = [];
  vi.stubGlobal("fetch", async (url, opts) => {
    calls.push({ url: String(url), opts });
    return responder(String(url), opts);
  });
  return calls;
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status, headers: { "Content-Type": "application/json" },
  });

test("api: normalizeUrl strips trailing slashes and a pasted /v1", () => {
  expect(api.normalizeUrl("https://mf.test/")).toBe("https://mf.test");
  expect(api.normalizeUrl("https://mf.test///")).toBe("https://mf.test");
  expect(api.normalizeUrl("  https://mf.test/v1/  ")).toBe("https://mf.test");
  expect(api.normalizeUrl("https://mf.test/v1")).toBe("https://mf.test");
  expect(api.normalizeUrl("https://mf.test/sub/path")).toBe("https://mf.test/sub/path");
  expect(api.normalizeUrl("https://mf.test")).toBe("https://mf.test");
});

test("api: sends X-Auth-Token and builds /v1 URLs", async () => {
  api.configure("https://mf.test/", "sekret");
  const calls = stubFetch(() => json({ ok: 1 }));
  await api.me();
  expect(calls[0].url).toBe("https://mf.test/v1/me");
  expect(calls[0].opts.headers["X-Auth-Token"]).toBe("sekret");
});

test("api: query params set; null/undefined/empty skipped; 0 kept", async () => {
  api.configure("https://mf.test", "k");
  const calls = stubFetch(() => json({}));
  await api.entries({ limit: 50, offset: 0, status: undefined, search: "", after: null });
  const url = new URL(calls[0].url);
  expect(url.searchParams.get("limit")).toBe("50");
  expect(url.searchParams.get("offset")).toBe("0");
  expect(url.searchParams.has("status")).toBe(false);
  expect(url.searchParams.has("search")).toBe(false);
  expect(url.searchParams.has("after")).toBe(false);
});

test("api: JSON body serialized with content-type", async () => {
  api.configure("https://mf.test", "k");
  const calls = stubFetch(() => new Response(null, { status: 204 }));
  await api.updateEntries([1, 2], "read");
  expect(calls[0].opts.method).toBe("PUT");
  expect(calls[0].opts.headers["Content-Type"]).toBe("application/json");
  expect(JSON.parse(calls[0].opts.body)).toEqual({ entry_ids: [1, 2], status: "read" });
});

test("api: 204 responses return null", async () => {
  api.configure("https://mf.test", "k");
  stubFetch(() => new Response(null, { status: 204 }));
  expect(await api.toggleBookmark(7)).toBeNull();
});

test("api: non-JSON responses return text (OPML export)", async () => {
  api.configure("https://mf.test", "k");
  const xml = '<?xml version="1.0"?><opml/>';
  stubFetch(() =>
    new Response(xml, { status: 200, headers: { "Content-Type": "text/x-opml" } }));
  expect(await api.exportOpml()).toBe(xml);
});

test("api: rawBody sent as-is without JSON content-type (OPML import)", async () => {
  api.configure("https://mf.test", "k");
  const calls = stubFetch(() => json({ message: "ok" }, 201));
  await api.importOpml("<opml/>");
  expect(calls[0].opts.body).toBe("<opml/>");
  expect(calls[0].opts.headers["Content-Type"]).toBeUndefined();
});

test("api: server error_message surfaces in ApiError", async () => {
  api.configure("https://mf.test", "k");
  stubFetch(() => json({ error_message: "boom" }, 400));
  const err = await api.me().catch((e) => e);
  expect(err).toBeInstanceOf(ApiError);
  expect(err.message).toBe("boom");
  expect(err.status).toBe(400);
});

test("api: non-JSON error bodies fall back to HTTP status message", async () => {
  api.configure("https://mf.test", "k");
  stubFetch(() => new Response("oops", { status: 502 }));
  const err = await api.me().catch((e) => e);
  expect(err).toBeInstanceOf(ApiError);
  expect(err.message).toBe("HTTP 502");
  expect(err.status).toBe(502);
});

test("api: abort signal is forwarded to fetch", async () => {
  api.configure("https://mf.test", "k");
  const controller = new AbortController();
  const calls = stubFetch(() => json({}));
  await api.entries({ limit: 1 }, controller.signal);
  expect(calls[0].opts.signal).toBe(controller.signal);
});
