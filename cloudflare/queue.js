/**
 * Durable owner-only queue for the staged standby controller.
 * Never stores Firebase auth tokens; the auth provider supplies fresh credentials.
 * Scope must be unique to the authenticated owner and application.
 */
export function createIndexedDBStandbyQueue({
  scope,
  databaseName = "aspace-standby-queue-v1",
  indexedDBImpl = globalThis.indexedDB
} = {}) {
  if (!/^[A-Za-z0-9_-]{8,150}$/.test(scope || "")) throw new Error("Queue owner scope is required");
  if (!indexedDBImpl) throw new Error("IndexedDB is unavailable; cannot provide durable standby edits");
  let handle;
  const db = async () => {
    if (handle) return handle;
    handle = new Promise((resolve, reject) => {
      const req = indexedDBImpl.open(databaseName, 1);
      req.onupgradeneeded = () => {
        const database = req.result;
        if (!database.objectStoreNames.contains("pending")) database.createObjectStore("pending");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("Cannot open IndexedDB"));
      req.onblocked = () => reject(new Error("IndexedDB upgrade blocked"));
    });
    return handle;
  };
  async function transaction(mode, callback) {
    const database = await db();
    return new Promise((resolve, reject) => {
      const tx = database.transaction("pending", mode);
      const store = tx.objectStore("pending");
      let result;
      const req = callback(store);
      req.onsuccess = () => { result = req.result; };
      req.onerror = () => { /* transaction onerror handles this */ };
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
      tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction failed"));
    });
  }
  const id = key => scope + ":" + key;
  return {
    async put(key, record) {
      const value = structuredClone(record);
      return transaction("readwrite", store => store.put(value, id(key)));
    },
    async get(key) {
      const value = await transaction("readonly", store => store.get(id(key)));
      return value ? structuredClone(value) : null;
    },
    async remove(key) {
      return transaction("readwrite", store => store.delete(id(key)));
    },
    async list() {
      const database = await db();
      return new Promise((resolve, reject) => {
        const out = [];
        const tx = database.transaction("pending", "readonly");
        const request = tx.objectStore("pending").openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return;
          if (typeof cursor.key === "string" && cursor.key.startsWith(scope + ":"))
            out.push({ key: cursor.key.slice(scope.length + 1), record: structuredClone(cursor.value) });
          cursor.continue();
        };
        tx.oncomplete = () => resolve(out);
        tx.onabort = () => reject(tx.error || new Error("Could not list queue"));
        tx.onerror = () => reject(tx.error || new Error("Could not list queue"));
      });
    }
  };
}
