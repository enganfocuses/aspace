import test from "node:test";
import assert from "node:assert/strict";
import { createLiveBoard } from "../live-board.js";

test("successful replay removes the exact queued draft instead of leaving it to replay forever", async () => {
  const board = { items: [], strokes: [], name: "sample" };
  const pending = new Map();
  const queue = {
    async put(key, value) { pending.set(key, structuredClone(value)); },
    async get(key) { return structuredClone(pending.get(key) ?? null); },
    async remove(key) { pending.delete(key); }
  };
  let revision = 1;
  const fetchImpl = async (_url, init) => {
    if (init.method === "GET") {
      return new Response(JSON.stringify({ j: JSON.stringify(board) }), {
        status: 200, headers: { ETag: `"${revision}"` }
      });
    }
    assert.equal(init.headers["if-match"], `"${revision}"`);
    const next = JSON.parse(JSON.parse(init.body).j);
    Object.assign(board, next);
    revision++;
    return new Response(JSON.stringify({ j: JSON.stringify(board) }), {
      status: 200, headers: { ETag: `"${revision}"` }
    });
  };
  const cloudflare = {
    async getDoc() { throw Object.assign(new Error("missing"), { status: 404 }); },
    async putDoc(_key, _value, expected) { return { revision: expected + 1 }; }
  };
  const originalId = "draft-that-must-be-removed";
  await queue.put("boards/sample", {
    id: originalId, value: structuredClone(board), base: structuredClone(board),
    createdAt: 1
  });
  const transport = createLiveBoard({
    key: "boards/sample",
    firebaseDatabaseURL: "https://example.firebaseio.com",
    cloudflare, queue, fetchImpl, getIdToken: async () => "token"
  });
  await transport.read();
  assert.equal(await queue.get("boards/sample"), null);
});


test("Firebase saves continue when the browser does not expose an ETag header", async () => {
  let board = { items: [], strokes: [], name: "sample" };
  const pending = new Map();
  const queue = {
    async put(key, value) { pending.set(key, structuredClone(value)); },
    async get(key) { return structuredClone(pending.get(key) ?? null); },
    async remove(key) { pending.delete(key); }
  };
  const fetchImpl = async (_url, init) => {
    if (init.method === "GET")
      return new Response(JSON.stringify({ j: JSON.stringify(board) }), { status: 200 });
    assert.equal(init.headers["if-match"], undefined);
    board = JSON.parse(JSON.parse(init.body).j);
    return new Response(JSON.stringify({ j: JSON.stringify(board) }), { status: 200 });
  };
  const cloudflare = {
    async getDoc() { throw Object.assign(new Error("missing"), { status: 404 }); },
    async putDoc(_key, _value, expected) { return { revision: expected + 1 }; }
  };
  const transport = createLiveBoard({
    key: "boards/sample", firebaseDatabaseURL: "https://example.firebaseio.com",
    cloudflare, queue, fetchImpl, getIdToken: async () => "token"
  });
  const next = { ...board, name: "saved without etag" };
  const result = await transport.write(next, { base: board });
  assert.equal(result.source, "firebase");
  assert.equal(board.name, "saved without etag");
  assert.equal(await queue.get("boards/sample"), null);
});

test("Firebase 412 conflicts are re-read and independently merged once", async () => {
  const base = { name: "sample", items: [{ id: "one", t: "before", x: 0 }], strokes: [] };
  let board = structuredClone(base);
  let revision = 1, rejected = false;
  const pending = new Map();
  const queue = {
    async put(key, value) { pending.set(key, structuredClone(value)); },
    async get(key) { return structuredClone(pending.get(key) ?? null); },
    async remove(key) { pending.delete(key); }
  };
  const fetchImpl = async (_url, init) => {
    if (init.method === "GET")
      return new Response(JSON.stringify({ j: JSON.stringify(board) }), {
        status: 200, headers: { ETag: `"${revision}"` }
      });
    if (!rejected) {
      rejected = true;
      board = { ...board, items: [{ ...board.items[0], x: 40 }] };
      revision++;
      return new Response("precondition failed", { status: 412 });
    }
    assert.equal(init.headers["if-match"], `"${revision}"`);
    board = JSON.parse(JSON.parse(init.body).j);
    revision++;
    return new Response(JSON.stringify({ j: JSON.stringify(board) }), {
      status: 200, headers: { ETag: `"${revision}"` }
    });
  };
  const cloudflare = {
    async getDoc() { throw Object.assign(new Error("missing"), { status: 404 }); },
    async putDoc(_key, _value, expected) { return { revision: expected + 1 }; }
  };
  const transport = createLiveBoard({
    key: "boards/sample", firebaseDatabaseURL: "https://example.firebaseio.com",
    cloudflare, queue, fetchImpl, getIdToken: async () => "token"
  });
  const local = structuredClone(base);
  local.items[0].t = "local text";
  const result = await transport.write(local, { base });
  assert.equal(result.source, "firebase");
  assert.equal(result.value.items[0].t, "local text");
  assert.equal(result.value.items[0].x, 40);
  assert.equal(await queue.get("boards/sample"), null);
});
