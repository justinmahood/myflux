/* Minimal promise wrapper over IndexedDB for the offline cache.
 * Stores: entries (cached articles, keyPath id), meta (snapshots,
 * out-of-line keys), queue (pending offline ops, autoIncrement id).
 * Migration policy: switch on oldVersion in onupgradeneeded; the cache
 * stores (entries, meta) may be destructively recreated in a future
 * version, the queue store never — it holds user changes that haven't
 * reached the server yet. */

const DB_NAME = "myflux";
const DB_VERSION = 1;

let opening = null; // lazy shared connection promise

function open() {
  opening ??= new Promise((resolve, reject) => {
    // Read the indexedDB global lazily so tests can stub a fresh factory.
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      if (e.oldVersion < 1) {
        req.result.createObjectStore("entries", { keyPath: "id" });
        req.result.createObjectStore("meta");
        req.result.createObjectStore("queue", { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => {
      req.result.onversionchange = () => {
        req.result.close();
        opening = null;
      };
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
  });
  return opening;
}

/* Run fn(objectStore) in a transaction; resolves with the result of the
 * request fn returns (if any) once the transaction commits. */
async function run(storeName, mode, fn) {
  const idb = await open();
  return new Promise((resolve, reject) => {
    const t = idb.transaction(storeName, mode);
    const req = fn(t.objectStore(storeName));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error ?? new DOMException("aborted", "AbortError"));
  });
}

export const db = {
  get: (store, key) => run(store, "readonly", (s) => s.get(key)),
  getAll: (store) => run(store, "readonly", (s) => s.getAll()),
  put: (store, value, key) => run(store, "readwrite",
    (s) => (key === undefined ? s.put(value) : s.put(value, key))),
  bulkPut: (store, values) => run(store, "readwrite", (s) => {
    for (const value of values) s.put(value);
  }),
  del: (store, key) => run(store, "readwrite", (s) => s.delete(key)),
  bulkDel: (store, keys) => run(store, "readwrite", (s) => {
    for (const key of keys) s.delete(key);
  }),
  clear: (store) => run(store, "readwrite", (s) => s.clear()),

  async close() {
    if (!opening) return;
    const pending = opening;
    opening = null;
    try {
      (await pending).close();
    } catch { /* connection never opened */ }
  },

  // Timeout-raced so logout can never hang on a "blocked" delete.
  async destroy() {
    await this.close();
    await Promise.race([
      new Promise((resolve) => {
        const req = indexedDB.deleteDatabase(DB_NAME);
        req.onsuccess = req.onerror = req.onblocked = () => resolve();
      }),
      new Promise((resolve) => setTimeout(resolve, 1000)),
    ]);
  },
};
