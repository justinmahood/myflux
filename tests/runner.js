/* Minimal zero-dependency test harness.
 * Register with test(); index.html calls runAll() which renders results
 * and exposes window.__testResults for headless checks. */

const tests = [];

export function test(name, fn) {
  tests.push({ name, fn });
}

export function assert(cond, msg = "assertion failed") {
  if (!cond) throw new Error(msg);
}

export function assertEqual(actual, expected, msg = "") {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${msg}${msg ? ": " : ""}expected ${e}, got ${a}`);
  }
}

export async function assertThrows(fn, check, msg = "expected an exception") {
  try {
    await fn();
  } catch (err) {
    if (check) check(err);
    return err;
  }
  throw new Error(msg);
}

export async function runAll() {
  const results = [];
  for (const t of tests) {
    try {
      await t.fn();
      results.push({ name: t.name, ok: true });
    } catch (err) {
      results.push({ name: t.name, ok: false, error: String(err?.message ?? err) });
    }
  }

  const failed = results.filter((r) => !r.ok);
  const summary = {
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    failures: failed,
    results,
  };

  document.title = failed.length
    ? `✗ ${failed.length}/${results.length} failing — myflux tests`
    : `✓ ${results.length} passing — myflux tests`;

  const out = document.getElementById("results");
  out.replaceChildren(...results.map((r) => {
    const li = document.createElement("li");
    li.className = r.ok ? "pass" : "fail";
    li.textContent = r.ok ? r.name : `${r.name} — ${r.error}`;
    return li;
  }));
  document.getElementById("summary").textContent = failed.length
    ? `${failed.length} of ${results.length} tests FAILED`
    : `All ${results.length} tests passed`;
  document.getElementById("summary").className = failed.length ? "fail" : "pass";

  for (const f of failed) console.error(`FAIL: ${f.name}\n  ${f.error}`);
  window.__testResults = summary;
  return summary;
}
