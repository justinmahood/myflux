/* API client tests: URL normalization, request building, response and
 * error handling — with fetch stubbed out. */
import { test, assert, assertEqual, assertThrows } from "./runner.js";
import { api, ApiError } from "../js/api.js";

/* Run fn with fetch replaced; records calls as {url, opts}. */
async function withFetch(responder, fn) {
  const real = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url: String(url), opts });
    return responder(String(url), opts);
  };
  try {
    return await fn(calls);
  } finally {
    globalThis.fetch = real;
  }
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status, headers: { "Content-Type": "application/json" },
  });

test("api: normalizeUrl strips trailing slashes and a pasted /v1", () => {
  assertEqual(api.normalizeUrl("https://mf.test/"), "https://mf.test");
  assertEqual(api.normalizeUrl("https://mf.test///"), "https://mf.test");
  assertEqual(api.normalizeUrl("  https://mf.test/v1/  "), "https://mf.test");
  assertEqual(api.normalizeUrl("https://mf.test/v1"), "https://mf.test");
  assertEqual(api.normalizeUrl("https://mf.test/sub/path"), "https://mf.test/sub/path");
  assertEqual(api.normalizeUrl("https://mf.test"), "https://mf.test");
});

test("api: sends X-Auth-Token and builds /v1 URLs", async () => {
  api.configure("https://mf.test/", "sekret");
  await withFetch(() => json({ ok: 1 }), async (calls) => {
    await api.me();
    assertEqual(calls[0].url, "https://mf.test/v1/me");
    assertEqual(calls[0].opts.headers["X-Auth-Token"], "sekret");
  });
});

test("api: query params set; null/undefined/empty skipped; 0 kept", async () => {
  api.configure("https://mf.test", "k");
  await withFetch(() => json({}), async (calls) => {
    await api.entries({ limit: 50, offset: 0, status: undefined, search: "", after: null });
    const url = new URL(calls[0].url);
    assertEqual(url.searchParams.get("limit"), "50");
    assertEqual(url.searchParams.get("offset"), "0");
    assert(!url.searchParams.has("status"), "undefined param sent");
    assert(!url.searchParams.has("search"), "empty param sent");
    assert(!url.searchParams.has("after"), "null param sent");
  });
});

test("api: JSON body serialized with content-type", async () => {
  api.configure("https://mf.test", "k");
  await withFetch(() => new Response(null, { status: 204 }), async (calls) => {
    await api.updateEntries([1, 2], "read");
    assertEqual(calls[0].opts.method, "PUT");
    assertEqual(calls[0].opts.headers["Content-Type"], "application/json");
    assertEqual(JSON.parse(calls[0].opts.body), { entry_ids: [1, 2], status: "read" });
  });
});

test("api: 204 responses return null", async () => {
  api.configure("https://mf.test", "k");
  await withFetch(() => new Response(null, { status: 204 }), async () => {
    assertEqual(await api.toggleBookmark(7), null);
  });
});

test("api: non-JSON responses return text (OPML export)", async () => {
  api.configure("https://mf.test", "k");
  const xml = '<?xml version="1.0"?><opml/>';
  await withFetch(
    () => new Response(xml, { status: 200, headers: { "Content-Type": "text/x-opml" } }),
    async () => {
      assertEqual(await api.exportOpml(), xml);
    });
});

test("api: rawBody sent as-is without JSON content-type (OPML import)", async () => {
  api.configure("https://mf.test", "k");
  await withFetch(() => json({ message: "ok" }, 201), async (calls) => {
    await api.importOpml("<opml/>");
    assertEqual(calls[0].opts.body, "<opml/>");
    assertEqual(calls[0].opts.headers["Content-Type"], undefined);
  });
});

test("api: server error_message surfaces in ApiError", async () => {
  api.configure("https://mf.test", "k");
  await withFetch(() => json({ error_message: "boom" }, 400), async () => {
    await assertThrows(() => api.me(), (err) => {
      assert(err instanceof ApiError, "not an ApiError");
      assertEqual(err.message, "boom");
      assertEqual(err.status, 400);
    });
  });
});

test("api: non-JSON error bodies fall back to HTTP status message", async () => {
  api.configure("https://mf.test", "k");
  await withFetch(() => new Response("oops", { status: 502 }), async () => {
    await assertThrows(() => api.me(), (err) => {
      assert(err instanceof ApiError);
      assertEqual(err.message, "HTTP 502");
      assertEqual(err.status, 502);
    });
  });
});

test("api: abort signal is forwarded to fetch", async () => {
  api.configure("https://mf.test", "k");
  const controller = new AbortController();
  await withFetch(() => json({}), async (calls) => {
    await api.entries({ limit: 1 }, controller.signal);
    assert(calls[0].opts.signal === controller.signal, "signal not forwarded");
  });
});
