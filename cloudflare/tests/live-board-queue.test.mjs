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
