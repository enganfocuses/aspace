/**
 * Aspace standby failover controller — NOT connected to the live application.
 *
 * Firebase RTDB remains authoritative. Cloudflare D1 stores a versioned mirror.
 * Standby reads use one centralized policy: quota exhaustion, network errors, timeouts, HTTP 429 and 5xx.
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
  fetchImpl = fetch, timeoutMs = 8000, onStatus = () => {}, queue
}) {
  const base = String(firebaseDatabaseURL || "").replace(/\/+$/, "");
  if (!base.startsWith("https://") || typeof getIdToken !== "function" ||
      !cloudflare || typeof cloudflare.getDoc !== "function" ||
      typeof cloudflare.putDoc !== "function" || !queue ||
      ["put", "get", "remove", "list"].some(method => typeof queue[method] !== "function")) {
    throw new Error("Firebase URL, getIdToken, Cloudflare adapter and durable queue are required");
  }
  const state = new Map();
  const lastMirrored = new Map();
  const busy = new Set();
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
      throw error("Primary network error: " + (cause?.name || "network"), 0);
    } finally { clearTimeout(timeout); }
    if (!response.ok) {
      if (response.status === 412) throw error("Firebase version conflict", 412);
      const rawError = (await response.text().catch(() => "")).slice(0, 2048);
      let detail = rawError;
      try {
        const parsed = JSON.parse(rawError);
        detail = [parsed.error?.message, parsed.error?.status, parsed.error?.code,
          parsed.error?.errors?.[0]?.reason, typeof parsed.error === "string" ? parsed.error : ""]
          .filter(Boolean).join(" ");
      } catch { /* Some Firebase failures use plain text */ }
      const quota = /quota[ _-]?(exceeded|exhausted|limit)|(?:exceeded|exhausted)[ _-]?(?:quota|usage|bandwidth|storage|download|connection)[ _-]?limit|resource_exhausted|billing[ _-]?quota|bandwidth[ _-]?quota/i.test(detail);
      throw Object.assign(error("Firebase HTTP " + response.status + (quota ? " (quota)" : ""), response.status), { quota });

    }
    const raw = await response.json();
    let parsed = raw;
    if (raw && typeof raw.j === "string") {
      try { parsed = JSON.parse(raw.j); } catch { throw error("Invalid Firebase document", 422); }
    }
    return { value: parsed, etag: response.headers.get("etag") };
  }

  // The only read-failover policy, shared by reads and recovery classification.
  // Never mask Firebase authentication, access-denied, validation or ETag conflicts.
  function standbyEligible(e) {
    if (!e) return false;
    return Boolean(e.quota) ||
      e.status === 0 || e.status === 429 ||
      (e.status >= 500 && e.status <= 599);
  }


  async function mirror(key, value) {
    if (value === null) return false; // Tombstones require a separate protocol.
    // D1 is not a media store; skip costly embedded media and oversized snapshots.
    const serial = JSON.stringify(value);
    if (serial.length > 750_000 ||
        ["data:image/", "data:audio/", "data:video/", "data:application/pdf"].some(part => serial.includes(part))) {
      tell(key, "mirror_skipped", "Large or embedded media requires a separate standby plan");
      return false;
    }
    const before = await cloudflare.getDoc(key).catch(e => {
      if (e.status === 404) return null;
      throw e;
    });
    if (before && JSON.stringify(before.value) === serial) {
      lastMirrored.set(key, serial);
      return true;
    }
    // Never clobber a divergent standby copy: a guest may have edited it during
    // a primary outage. Only advance a snapshot whose last content we confirmed.
    if (before && lastMirrored.get(key) !== JSON.stringify(before.value)) {
      throw error("Standby divergence requires reconciliation", 409);
    }
    await cloudflare.putDoc(key, value, before ? before.revision : 0);
    lastMirrored.set(key, serial);
    return true;
  }

  async function read(key) {
    if (!safeKey(key)) throw new Error("Invalid document key");
    // A pending local edit always wins in the UI until conflict-safe reconciliation.
    const queued = await queue.get(key);
    if (queued) {
      tell(key, "queued", "Unsynced draft retained; manual or safe replay required");
      return { source: "local", value: clone(queued.value), pending: true, mirrored: Promise.resolve(false) };
    }
    try {
      const result = await primary("GET", key);
      state.set(key, { etag: result.etag, lastValue: clone(result.value) });
      tell(key, "primary", "Firebase available");
      const mirrored = mirror(key, result.value).then(ok => {
        if (ok) tell(key, "mirrored", "Cloudflare snapshot updated");
        return ok;
      }).catch(e => { tell(key, "mirror_error", e.message); return false; });
      return { source: "firebase", value: result.value, mirrored };
    } catch (e) {
      if (!standbyEligible(e)) throw e;
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
    if (busy.has(key)) throw error("Another save is running for this document", 409);
    busy.add(key);
    try {
      const previous = await queue.get(key);
      const known = state.get(key);
      // Keep the earliest common ancestor across multiple offline edits.
      const record = {
        id: crypto.randomUUID(),
        value: clone(value),
        baseValue: previous ? previous.baseValue : known?.lastValue ?? null,
        baseKnown: previous ? previous.baseKnown : Boolean(known),
        createdAt: previous ? previous.createdAt : Date.now()
      };
      // The durable local queue MUST commit before attempting Firebase.
      await queue.put(key, record);
      tell(key, "queued", "Draft persisted locally before network save");
      if (previous || !known?.etag) return { source: "local", pending: true, reason: "reconciliation_required" };
      try {
        const saved = await primary("PUT", key, value, known.etag);
        state.set(key, { etag: saved.etag, lastValue: clone(value) });
        await queue.remove(key);
        const mirrored = mirror(key, value).then(ok => {
          if (ok) tell(key, "mirrored", "Standby updated after primary save");
          return ok;
        }).catch(e => { tell(key, "mirror_error", e.message); return false; });
        tell(key, "primary", "Firebase save confirmed");
        return { source: "firebase", pending: false, mirrored };
      } catch (e) {
        if (!standbyEligible(e)) {
          // Keep the local draft for 412, so the user can manually reconcile.
          tell(key, "conflict", "Primary rejected the write; pending draft retained");
          throw e;
        }
        tell(key, "queued", "Primary unavailable; durable draft retained");
        return { source: "local", pending: true, reason: "primary_unavailable" };
      }
    } finally {
      busy.delete(key);
    }
  }

  // Explicit replay after Firebase recovers: read current primary state first.
  // Only write if unchanged since the captured ancestor. No blind last-write-wins.
  async function replay(key) {
    if (!safeKey(key)) throw new Error("Invalid document key");
    if (busy.has(key)) return { key, status: "busy" };
    busy.add(key);
    try {
      const item = await queue.get(key);
      if (!item) return { key, status: "empty" };
      let live;
      try { live = await primary("GET", key); }
      catch (e) {
        return { key, status: standbyEligible(e) ? "primary_unavailable" : "error", error: e.message };
      }
      if (JSON.stringify(live.value) === JSON.stringify(item.value)) {
        // The previous PUT may have succeeded before its response was lost.
        await queue.remove(key);
        state.set(key, { etag: live.etag, lastValue: clone(live.value) });
        return { key, status: "already_applied" };
      }
      if (!item.baseKnown || JSON.stringify(live.value) !== JSON.stringify(item.baseValue)) {
        tell(key, "conflict", "Primary document changed while draft was pending");
        return { key, status: "conflict" };
      }
      if (!live.etag) return { key, status: "no_etag" };
      try {
        await primary("PUT", key, item.value, live.etag);
      } catch (e) {
        return { key, status: e.status === 412 ? "conflict" :
          standbyEligible(e) ? "primary_unavailable" : "error", error: e.message };
      }
      await queue.remove(key);
      // Don't re-use an unknown PUT response ETag; the next write requires a fresh read.
      state.delete(key);
      const mirrored = mirror(key, item.value).catch(e => {
        tell(key, "mirror_error", e.message); return false;
      });
      tell(key, "replayed", "Pending draft safely committed to Firebase");
      return { key, status: "replayed", mirrored };
    } finally {
      busy.delete(key);
    }
  }

  async function replayAll() {
    const entries = await queue.list();
    const outcomes = [];
    // Sequential replay avoids hammering Firebase quota after reconnection.
    for (const entry of entries) {
      if (!safeKey(entry.key)) {
        outcomes.push({ key: entry.key, status: "invalid_key" });
        continue;
      }
      outcomes.push(await replay(entry.key));
    }
    return outcomes;
  }

  // Optional automatic recovery. It is *only* activated when the caller enables
  // the standby adapter, never by importing this module. Conflicts are retained.
  function startRecovery({
    target = typeof window === "object" ? window : null,
    intervalMs = 60_000,
    onResults = () => {}
  } = {}) {
    if (!target || typeof target.addEventListener !== "function" ||
        typeof target.removeEventListener !== "function") {
      throw new Error("Recovery requires a browser event target");
    }
    let stopped = false, running = false;
    async function tick() {
      if (stopped || running || (target.navigator && target.navigator.onLine === false)) return;
      running = true;
      try {
        const results = await replayAll();
        if (!stopped && results.length) onResults(results);
      } catch (e) {
        if (!stopped) tell("*", "recovery_error", e.message);
      } finally { running = false; }
    }
    const delay = Math.max(15_000, Number(intervalMs) || 60_000);
    target.addEventListener("online", tick);
    const timer = setInterval(tick, delay);
    void tick();
    return () => { stopped = true; target.removeEventListener("online", tick); clearInterval(timer); };
  }

  async function pending(key) {
    return key === undefined
      ? (await queue.list()).map(entry => entry.key)
      : Boolean(await queue.get(key));
  }
  async function draft(key) {
    const item = await queue.get(key);
    return item ? clone(item.value) : null;
  }
  return { read, write, mirror, replay, replayAll, startRecovery, pending, draft };}
