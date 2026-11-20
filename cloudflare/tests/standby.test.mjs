import test from "node:test";
import assert from "node:assert/strict";
import { createAspaceStandby } from "../standby.js";

test("a failed second offline save preserves the first D1 receipt across reload", async () => {
  const env = fakeEnvironment();
  let app = env.create({ allowStandbyWrites: true });
  await (await app.read("boards/sample")).mirrored;
  env.setOffline(true);
  assert.equal((await app.write("boards/sample", { text: "first draft" })).source, "cloudflare");
  env.backup.set("boards/sample", { value: { text: "student change" }, revision: 3 });
  assert.equal((await app.write("boards/sample", { text: "second draft" })).source, "local");
  const record = await env.queue.get("boards/sample");
  assert.deepEqual(record.standbyValue, { text: "first draft" });
  assert.equal(record.standbyRevision, 2);
  app = env.create({ allowStandbyWrites: true });
  env.setOffline(false);
  assert.equal((await app.replay("boards/sample")).status, "standby_conflict");
  assert.deepEqual(env.docs.get("boards/sample").value, { text: "original" });
  assert.deepEqual(await app.draft("boards/sample"), { text: "second draft" });
});

test("queued standby writes stop when Firebase rejects access after an outage", async () => {
  const env = fakeEnvironment();
  const app = env.create({ allowStandbyWrites: true });
  await (await app.read("boards/sample")).mirrored;
  env.setOffline(true);
  await app.write("boards/sample", { text: "first draft" });
  env.setOffline(false);
  env.setFirebaseError({ status: 403, message: "Permission denied" });
  const result = await app.write("boards/sample", { text: "blocked draft" });
  assert.equal(result.source, "local");
  assert.equal(result.reason, "primary_rejected");
  assert.deepEqual(env.backup.get("boards/sample").value, { text: "first draft" });
  assert.deepEqual(await app.draft("boards/sample"), { text: "blocked draft" });
});

test("an identical Firebase value cannot discard a draft when D1 has newer guest changes", async () => {
  const env = fakeEnvironment();
  const app = env.create({ allowStandbyWrites: true });
  await (await app.read("boards/sample")).mirrored;
  env.setOffline(true);
  await app.write("boards/sample", { text: "offline draft" });
  env.docs.set("boards/sample", { value: { text: "offline draft" }, revision: 2 });
  env.backup.set("boards/sample", { value: { text: "student change" }, revision: 3 });
  env.setOffline(false);
  assert.equal((await app.replay("boards/sample")).status, "standby_conflict");
  assert.equal(await app.pending("boards/sample"), true);
});

test("D1 changes that restore the same content still require reconciliation", async () => {
  const env = fakeEnvironment();
  const app = env.create({ allowStandbyWrites: true });
  await (await app.read("boards/sample")).mirrored;
  env.setOffline(true);
  await app.write("boards/sample", { text: "draft" });
  env.backup.get("boards/sample").revision += 2;
  env.setOffline(false);
  assert.equal((await app.replay("boards/sample")).status, "standby_conflict");
  assert.equal(await app.pending("boards/sample"), true);
});

function fakeEnvironment() {
  const docs = new Map([["boards/sample", { value: { text: "original" }, revision: 1 }]]);
  const backup = new Map();
  const pending = new Map();
  let offline = false, auth = true, putThenThrow = false, reads = 0, cloudReads = 0, firebaseError = null, exposeEtag = true;
  const queue = {
    async put(key, value) { pending.set(key, structuredClone(value)); },
    async get(key) { return structuredClone(pending.get(key) ?? null); },
    async remove(key) { pending.delete(key); },
    async list() { return [...pending.entries()].map(([key, record]) => ({ key, record: structuredClone(record) })); }
  };
  const cloudflare = {
    async getDoc(key) {
      cloudReads++;
      if (!backup.has(key)) throw Object.assign(new Error("missing"), { status: 404 });
      return structuredClone(backup.get(key));
    },
    async putDoc(key, value, expectedRevision) {
      const old = backup.get(key);
      if ((old?.revision ?? 0) !== expectedRevision)
        throw Object.assign(new Error("revision conflict"), { status: 409 });
      backup.set(key, { value: structuredClone(value), revision: expectedRevision + 1 });
      return { revision: expectedRevision + 1 };
    }
  };
  const fetchImpl = async (url, init) => {
    if (offline) throw new Error("network");
    if (firebaseError) return new Response(JSON.stringify({ error: { message: firebaseError.message } }), {
      status: firebaseError.status,
      headers: { "Content-Type": "application/json" }
    });
    const docKey = new URL(url).pathname.slice("/docs/".length, -".json".length);
    const current = docs.get(docKey);
    if (init.method === "GET") {
      reads++;
      return new Response(JSON.stringify(current ? { j: JSON.stringify(current.value) } : null), {
        status: 200, headers: exposeEtag ? { ETag: `"${current?.revision ?? 0}"` } : {}
      });
    }
    if (init.headers["if-match"] !== `"${current?.revision ?? 0}"`)
      return new Response("stale", { status: 412 });
    const next = { value: JSON.parse(JSON.parse(init.body).j), revision: (current?.revision ?? 0) + 1 };
    docs.set(docKey, next);
    if (putThenThrow) { putThenThrow = false; throw new Error("Lost response"); }
    return new Response(JSON.stringify({ j: JSON.stringify(next.value) }), {
      status: 200, headers: { ETag: `"${next.revision}"` }
    });
  };
  const create = (opts = {}) => createAspaceStandby({
    firebaseDatabaseURL: "https://example.firebaseio.com",
    getIdToken: async () => auth ? "test-token" : null,
    cloudflare, fetchImpl, queue, ...opts
  });
  return {
    create, queue, docs, backup,
    setOffline(value) { offline = value; },
    setAuth(value) { auth = value; },
    setFirebaseError(value) { firebaseError = value; },
    setExposeEtag(value) { exposeEtag = value; },
    loseNextWriteResponse() { putThenThrow = true; },
    stats() { return { reads, cloudReads }; }
  };
}

test("healthy Firebase read mirrors confirmed data and stays primary", async () => {
  const env = fakeEnvironment();
  const app = env.create();
  const result = await app.read("boards/sample");
  assert.equal(result.source, "firebase");
  assert.equal(await result.mirrored, true);
  assert.deepEqual(env.backup.get("boards/sample").value, { text: "original" });
  const saved = await app.write("boards/sample", { text: "updated" });
  assert.equal(saved.pending, false);
  assert.equal(await saved.mirrored, true);
  assert.deepEqual(env.docs.get("boards/sample").value, { text: "updated" });
  assert.equal(await app.pending("boards/sample"), false);
});

test("outage uses confirmed Cloudflare mirror for reads", async () => {
  const env = fakeEnvironment();
  const app = env.create();
  await (await app.read("boards/sample")).mirrored;
  env.setOffline(true);
  const result = await app.read("boards/sample");
  assert.equal(result.source, "cloudflare");
  assert.equal(result.stale, true);
  assert.deepEqual(result.value, { text: "original" });
});

test("authentication failures are not treated as database outages", async () => {
  const env = fakeEnvironment();
  const app = env.create();
  env.setAuth(false);
  await assert.rejects(() => app.read("boards/sample"), e => e.status === 401);
  assert.equal(env.stats().cloudReads, 0);
});

test("offline write persists locally across controller restarts and safely replays", async () => {
  const env = fakeEnvironment();
  let app = env.create();
  await app.read("boards/sample");
  env.setOffline(true);
  assert.equal((await app.write("boards/sample", { text: "offline draft" })).pending, true);
  assert.equal(await app.pending("boards/sample"), true);
  app = env.create();
  assert.deepEqual((await app.read("boards/sample")).value, { text: "offline draft" });
  env.setOffline(false);
  const result = await app.replay("boards/sample");
  assert.equal(result.status, "replayed");
  await result.mirrored;
  assert.deepEqual(env.docs.get("boards/sample").value, { text: "offline draft" });
  assert.equal(await app.pending("boards/sample"), false);
});

test("replay detects primary edits and never overwrites them", async () => {
  const env = fakeEnvironment();
  const app = env.create();
  await app.read("boards/sample");
  env.setOffline(true);
  await app.write("boards/sample", { text: "local" });
  env.docs.set("boards/sample", { value: { text: "other device" }, revision: 2 });
  env.setOffline(false);
  assert.equal((await app.replay("boards/sample")).status, "conflict");
  assert.deepEqual(env.docs.get("boards/sample").value, { text: "other device" });
  assert.equal(await app.pending("boards/sample"), true);
});

test("ambiguous committed PUT response is recovered without duplicate update", async () => {
  const env = fakeEnvironment();
  const app = env.create();
  await app.read("boards/sample");
  env.loseNextWriteResponse();
  const result = await app.write("boards/sample", { text: "committed" });
  assert.equal(result.pending, true);
  assert.equal(env.docs.get("boards/sample").revision, 2);
  assert.equal((await app.replay("boards/sample")).status, "already_applied");
  assert.equal(env.docs.get("boards/sample").revision, 2);
});

test("missing verified primary base never triggers a blind queued overwrite", async () => {
  const env = fakeEnvironment();
  const app = env.create();
  const queued = await app.write("boards/sample", { text: "unknown base" });
  assert.equal(queued.pending, true);
  assert.equal((await app.replay("boards/sample")).status, "conflict");
  assert.deepEqual(env.docs.get("boards/sample").value, { text: "original" });
});

test("standby mirror never overwrites divergent guest edits", async () => {
  const env = fakeEnvironment();
  const app = env.create();
  await (await app.read("boards/sample")).mirrored;
  env.backup.set("boards/sample", { value: { text: "guest changed standby" }, revision: 2 });
  const saved = await app.write("boards/sample", { text: "primary changed" });
  assert.equal(saved.pending, false);
  assert.equal(await saved.mirrored, false);
  assert.deepEqual(env.backup.get("boards/sample").value, { text: "guest changed standby" });
});

test("large embedded media never silently claims a confirmed standby mirror", async () => {
  const env = fakeEnvironment();
  const app = env.create();
  const start = await app.read("boards/sample");
  assert.equal(await start.mirrored, true);
  const saved = await app.write("boards/sample", {
    text: "data:image/png;base64,AAAA",
    items: []
  });
  assert.equal(saved.pending, false);
  assert.equal(await saved.mirrored, false);
  assert.deepEqual(env.backup.get("boards/sample").value, { text: "original" });
});

test("explicit Firebase quota exhaustion triggers standby reads", async () => {
  const env = fakeEnvironment();
  const app = env.create();
  await (await app.read("boards/sample")).mirrored;
  env.setFirebaseError({ status: 403, message: "Quota exceeded" });
  const result = await app.read("boards/sample");
  assert.equal(result.source, "cloudflare");
  assert.equal(result.stale, true);
});

test("plain Firebase permission denied never triggers standby", async () => {
  const env = fakeEnvironment();
  const app = env.create();
  await (await app.read("boards/sample")).mirrored;
  env.setFirebaseError({ status: 403, message: "Permission denied" });
  await assert.rejects(() => app.read("boards/sample"), error => error.status === 403);
  assert.equal(env.backup.get("boards/sample").revision, 1);
});

test("Firebase 500 server outage triggers standby, with no duplicate storage subsystem", async () => {
  const env = fakeEnvironment();
  const app = env.create();
  await (await app.read("boards/sample")).mirrored;
  env.setFirebaseError({ status: 503, message: "Service unavailable" });
  assert.equal((await app.read("boards/sample")).source, "cloudflare");
});

test("Firebase validation failure never switches to standby", async () => {
  const env = fakeEnvironment();
  const app = env.create();
  await (await app.read("boards/sample")).mirrored;
  env.setFirebaseError({ status: 400, message: "Malformed data" });
  await assert.rejects(() => app.read("boards/sample"), error => error.status === 400);
});

test("Firebase 429 rate limit triggers standby read", async () => {
  const env = fakeEnvironment();
  const app = env.create();
  await (await app.read("boards/sample")).mirrored;
  env.setFirebaseError({ status: 429, message: "Too many requests" });
  assert.equal((await app.read("boards/sample")).source, "cloudflare");
});

test("opt-in Cloudflare writes during outage use the verified mirror and replay safely", async () => {
  const env = fakeEnvironment();
  const app = env.create({ allowStandbyWrites: true });
  const baseline = await app.read("boards/sample");
  assert.equal(await baseline.mirrored, true);
  env.setOffline(true);
  const first = await app.write("boards/sample", { text: "standby first" });
  assert.equal(first.source, "cloudflare");
  assert.equal(first.pending, true);
  assert.deepEqual(env.backup.get("boards/sample").value, { text: "standby first" });
  assert.deepEqual(env.docs.get("boards/sample").value, { text: "original" });
  const second = await app.write("boards/sample", { text: "standby second" });
  assert.equal(second.source, "cloudflare");
  assert.deepEqual(env.backup.get("boards/sample").value, { text: "standby second" });
  env.setOffline(false);
  const replay = await app.replay("boards/sample");
  assert.equal(replay.status, "replayed");
  assert.deepEqual(env.docs.get("boards/sample").value, { text: "standby second" });
  assert.equal(await app.pending("boards/sample"), false);
});

test("standby cannot overwrite changes made by another participant", async () => {
  const env = fakeEnvironment();
  const app = env.create({ allowStandbyWrites: true });
  await (await app.read("boards/sample")).mirrored;
  env.setOffline(true);
  env.backup.set("boards/sample", {
    value: { text: "other participant" }, revision: 2
  });
  const result = await app.write("boards/sample", { text: "my edit" });
  assert.equal(result.source, "local");
  assert.deepEqual(env.backup.get("boards/sample").value, { text: "other participant" });
  assert.equal(await app.pending("boards/sample"), true);
});

test("standby write refuses absent confirmed backup", async () => {
  const env = fakeEnvironment();
  const app = env.create({ allowStandbyWrites: true });
  await app.read("boards/sample"); // Mirror promise intentionally not awaited.
  env.setOffline(true);
  const result = await app.write("boards/sample", { text: "offline" });
  assert.ok(["local", "cloudflare"].includes(result.source));
  assert.equal(await app.pending("boards/sample"), true);
});

test("standby reconciliation blocks a changed Firebase primary document", async () => {
  const env = fakeEnvironment();
  const app = env.create({ allowStandbyWrites: true });
  await (await app.read("boards/sample")).mirrored;
  env.setOffline(true);
  assert.equal((await app.write("boards/sample", { text: "cloud" })).source, "cloudflare");
  env.docs.set("boards/sample", { value: { text: "other primary writer" }, revision: 2 });
  env.setOffline(false);
  assert.equal((await app.replay("boards/sample")).status, "conflict");
  assert.deepEqual(env.docs.get("boards/sample").value, { text: "other primary writer" });
  assert.equal(await app.pending("boards/sample"), true);
});

test("standby replay refuses subsequent edits from a second Cloudflare writer", async () => {
  const env = fakeEnvironment();
  const app = env.create({ allowStandbyWrites: true });
  await (await app.read("boards/sample")).mirrored;
  env.setOffline(true);
  await app.write("boards/sample", { text: "offline teacher" });
  env.backup.set("boards/sample", {
    value: { text: "other cloud writer" }, revision: 3
  });
  env.setOffline(false);
  assert.equal((await app.replay("boards/sample")).status, "standby_conflict");
  assert.deepEqual(env.docs.get("boards/sample").value, { text: "original" });
});

test("missing browser-visible ETag permits CAS standby write only after outage probe", async () => {
  const env = fakeEnvironment();
  env.setExposeEtag(false);
  const app = env.create({ allowStandbyWrites: true });
  const baseline = await app.read("boards/sample");
  assert.equal(await baseline.mirrored, true);
  env.setOffline(true);
  const saved = await app.write("boards/sample", { text: "standby no etag" });
  assert.equal(saved.source, "cloudflare");
  assert.equal(saved.pending, true);
  assert.deepEqual(env.backup.get("boards/sample").value, { text: "standby no etag" });
  assert.deepEqual(env.docs.get("boards/sample").value, { text: "original" });
});

test("missing ETag with healthy Firebase must not silently switch to standby", async () => {
  const env = fakeEnvironment();
  env.setExposeEtag(false);
  const app = env.create({ allowStandbyWrites: true });
  await (await app.read("boards/sample")).mirrored;
  const saved = await app.write("boards/sample", { text: "needs etag" });
  assert.equal(saved.source, "local");
  assert.equal(saved.reason, "missing_primary_etag");
  assert.deepEqual(env.docs.get("boards/sample").value, { text: "original" });
  assert.deepEqual(env.backup.get("boards/sample").value, { text: "original" });
});
