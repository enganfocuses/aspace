import test from "node:test";
import assert from "node:assert/strict";
import { createAspaceStandby } from "../standby.js";

function fakeEnvironment() {
  const docs = new Map([["boards/sample", { value: { text: "original" }, revision: 1 }]]);
  const backup = new Map();
  const pending = new Map();
  let offline = false, auth = true, putThenThrow = false, reads = 0, cloudReads = 0;
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
    const docKey = new URL(url).pathname.slice("/docs/".length, -".json".length);
    const current = docs.get(docKey);
    if (init.method === "GET") {
      reads++;
      return new Response(JSON.stringify(current ? { j: JSON.stringify(current.value) } : null), {
        status: 200, headers: { ETag: `"${current?.revision ?? 0}"` }
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
  const create = () => createAspaceStandby({
    firebaseDatabaseURL: "https://example.firebaseio.com",
    getIdToken: async () => auth ? "test-token" : null,
    cloudflare, fetchImpl, queue
  });
  return {
    create, queue, docs, backup,
    setOffline(value) { offline = value; },
    setAuth(value) { auth = value; },
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
