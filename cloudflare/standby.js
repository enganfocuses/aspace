/**
 * Aspace standby failover controller — NOT connected to the live application.
 *
 * Firebase RTDB remains authoritative. Cloudflare D1 stores a versioned mirror.
 * The controller fails over only on network failures, timeouts, HTTP 429 or 5xx.
 * Permission/auth errors NEVER trigger failover.
 *
 * Read: Firebase -> (mirror asynchronously) Cloudflare; on network fault ->
 *       last confirmed Cloudflare mirror, or an explicit unavailable result.
 * Write: Firebase with an ETag precondition. If Firebase is unavailable, only
 *        a local pending draft is returned — never an unsafe blind D1 write.
 * This is deliberate until a durable two-way journal exists. It prevents
 * duplicate updates and silently diverging authoritative copies.
 */
export function createAspaceStandby({
  firebaseDatabaseURL, getIdToken, cloudflare,
  fetchImpl = fetch, timeoutMs = 8000, onStatus = () => {}
}) {
  const base = String(firebaseDatabaseURL || "").replace(/\/+$/, "");
  if (!base.startsWith("https://") || typeof getIdToken !== "function" ||
      !cloudflare || typeof cloudflare.getDoc !== "function" ||
      typeof cloudflare.putDoc !== "function") {
    throw new Error("Firebase URL, getIdToken and Cloudflare adapter are required");
  }
  const state = new Map();
  const deferred = new Map();
  const safeKey = key => typeof key === "string" && key.length <= 180 &&
    key.split("/").every(s => /^[A-Za-z0-9_-]+$/.test(s));
  const clone = v => JSON.parse(JSON.stringify(v));
  const tell = (key, phase, note) => onStatus({ key, phase, note });
  const error = (message, status) => Object.assign(new Error(message), { status });

  async function primary(method, key, value, etag) {
    const token = await getIdToken(); // Auth failure is NOT Firebase storage failover.
    if (!token) throw error("Firebase authentication is unavailable", 401);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const path = key.split("/").map(encodeURIComponent).join("/");
    const headers = { "X-Firebase-ETag": "true" };
    if (method === "PUT") {
      headers["Content-Type"] = "application/json";
      headers["if-match"] = etag;
    }
    let response;
    try {
      response = await fetchImpl(base + "/docs/" + path + ".json?auth=" + encodeURIComponent(token), {
        method, headers, signal: controller.signal,
        body: method === "PUT" ? JSON.stringify({ j: JSON.stringify(value) }) : undefined,
        cache: "no-store", referrerPolicy: "no-referrer"
      });
    } catch (cause) {
      throw error("Primary network error: " + (cause?.name || "network"), 503);
    } finally { clearTimeout(timeout); }
    if (!response.ok) {
      if (response.status === 412) throw error("Firebase version conflict", 412);
      throw error("Firebase HTTP " + response.status, response.status);
    }
    const raw = await response.json();
    let parsed = raw;
    if (raw && typeof raw.j === "string") {
      try { parsed = JSON.parse(raw.j); } catch { throw error("Invalid Firebase document", 422); }
    }
    return { value: parsed, etag: response.headers.get("etag") };
  }

  function transient(e) {
    return e && (e.status === 429 || e.status >= 500);
  }

  async function mirror(key, value) {
    if (value === null) return; // Avoid deleting standby data without a separate tombstone protocol.
    // D1 snapshots are CAS-protected. A conflicting standby edit must not be overwritten.
    const before = await cloudflare.getDoc(key).catch(e => {
      if (e.status === 404) return null;
      throw e;
    });
    await cloudflare.putDoc(key, value, before ? before.revision : 0);
  }

  async function read(key) {
    if (!safeKey(key)) throw new Error("Invalid document key");
    try {
      const result = await primary("GET", key);
      state.set(key, { etag: result.etag, lastValue: clone(result.value) });
      tell(key, "primary", "Firebase available");
      // Mirror is asynchronous but errors are surfaced, not treated as successful backups.
      const mirrored = mirror(key, result.value).then(() => {
        tell(key, "mirrored", "Cloudflare snapshot updated");
        return true;
      }).catch(e => {
        tell(key, "mirror_error", e.message);
        return false;
      });
      return { source: "firebase", value: result.value, mirrored };
    } catch (e) {
      if (!transient(e)) throw e;
      tell(key, "standby", "Firebase unavailable, checking Cloudflare");
      try {
        const backup = await cloudflare.getDoc(key);
        if (!backup) throw error("Standby document missing", 404);
        return { source: "cloudflare", value: backup.value, revision: backup.revision,
          stale: true, mirrored: Promise.resolve(false) };
      } catch (backupError) {
        tell(key, "unavailable", "No confirmed standby snapshot");
        throw error("Both primary and standby unavailable: " + backupError.message, 503);
      }
    }
  }

  async function write(key, value) {
    if (!safeKey(key)) throw new Error("Invalid document key");
    const known = state.get(key);
    if (!known?.etag) {
      deferred.set(key, clone(value));
      tell(key, "queued", "No primary ETag; write kept pending in this tab");
      return { source: "local", pending: true, reason: "missing_primary_etag" };
    }
    try {
      const saved = await primary("PUT", key, value, known.etag);
      state.set(key, { etag: saved.etag, lastValue: clone(value) });
      deferred.delete(key);
      const mirrored = mirror(key, value).then(() => {
        tell(key, "mirrored", "Standby updated after primary save");
        return true;
      }).catch(e => { tell(key, "mirror_error", e.message); return false; });
      tell(key, "primary", "Firebase save confirmed");
      return { source: "firebase", pending: false, mirrored };
    } catch (e) {
      if (!transient(e)) throw e; // 401, 403, 412, bad data: never fail over.
      deferred.set(key, clone(value));
      tell(key, "queued", "Firebase unavailable; draft queued in this tab");
      return { source: "local", pending: true, reason: "primary_unavailable" };
    }
  }

  // A caller owns durable IndexedDB persistence; this in-memory queue is only
  // a staging contract and MUST NOT be used for production/offline persistence.
  function pending(key) {
    return key === undefined ? [...deferred.keys()] : deferred.has(key);
  }
  function draft(key) { return deferred.has(key) ? clone(deferred.get(key)) : null; }

  return { read, write, mirror, pending, draft };
}
