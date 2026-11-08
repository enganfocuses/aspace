import { createRemoteJWKSet, jwtVerify } from "jose";

const FIREBASE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
);
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Aspace-Share-Token",
  "Access-Control-Max-Age": "86400"
};
function response(body, status = 200, headers = {}) {
  return new Response(body, { status, headers: { ...corsHeaders, ...headers } });
}
function json(data, status = 200) {
  return response(JSON.stringify(data), status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
}
async function requireOwner(request, env) {
  const match = (request.headers.get("Authorization") || "").match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  try {
    const { payload } = await jwtVerify(match[1], FIREBASE_JWKS, {
      issuer: `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`,
      audience: env.FIREBASE_PROJECT_ID
    });
    const uid = String(payload.sub || "");
    return uid && uid === env.OWNER_UID ? uid : null;
  } catch { return null; }
}
function safeKey(value) {
  // Aspace document identifiers are hierarchical (for example, "meta/boards" and "boards/abc").
  // Only allow safe path segments; forbid empty, dot and traversal segments.
  return typeof value === "string" && value.length <= 180 &&
    value.split("/").every(segment => /^[A-Za-z0-9_-]+$/.test(segment));
}

// Share tokens are high-entropy secrets kept in URL fragments by clients, never in the URL path.
async function shareTokenHash(token) {
  if (!/^(?:[a-f0-9]{48}|[a-f0-9]{64})$/.test(token)) return null;
  const bytes = new TextEncoder().encode(token);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, b => b.toString(16).padStart(2, "0")).join("");
}
function isPrototypeDoc(key) {
  return /^prototype-board-v[1-3]$/.test(key);
}
function isLiveBoardDoc(key) {
  return /^boards\/[A-Za-z0-9_-]{1,120}$/.test(key);
}
function isShareableDoc(key) {
  return isPrototypeDoc(key) || isLiveBoardDoc(key);
}
// Live whiteboard documents use the existing Aspace schema (no prototype wrapper).
// Keep edits intentionally bounded so anonymous capability links cannot be used
// for arbitrary D1 writes or enormous media blobs.
function validLiveBoard(board) {
  if (!board || typeof board !== "object" || Array.isArray(board) ||
      typeof board.name !== "string" || board.name.length > 250 ||
      !["dots", "clean"].includes(board.bg ?? "dots") ||
      !Array.isArray(board.items) || board.items.length > 1000 ||
      !Array.isArray(board.strokes) || board.strokes.length > 3000 ||
      typeof (board.siteUrl ?? "") !== "string" ||
      (board.siteUrl ?? "").length > 2048) return false;
  const kinds = new Set(["note","rr","rect","pill","oval","diamond",
    "triangle","star","hex","txt","frame","emo","img","aud","vid","embed"]);
  for (const item of board.items) {
    if (!item || typeof item !== "object" ||
        !/^[A-Za-z0-9_-]{1,120}$/.test(item.id || "") ||
        !kinds.has(item.k) ||
        !["x","y","w","h"].every(k => Number.isFinite(item[k]) &&
          item[k] >= 0 && item[k] <= 10000) ||
        item.w < 1 || item.h < 1 ||
        typeof (item.t ?? "") !== "string" || (item.t ?? "").length > 20000 ||
        typeof (item.u ?? "") !== "string" || (item.u ?? "").length > 4096)
      return false;
  }
  for (const stroke of board.strokes) {
    if (!stroke || typeof stroke !== "object" ||
        !/^[A-Za-z0-9_-]{1,120}$/.test(stroke.id || "") ||
        !Array.isArray(stroke.p) || stroke.p.length % 2 !== 0 ||
        stroke.p.length > 10000 ||
        !stroke.p.every(n => Number.isFinite(n) && n >= -1000 && n <= 10000) ||
        !Number.isFinite(stroke.w) || stroke.w < 0 || stroke.w > 100)
      return false;
  }
  return true;
}
async function readBody(request) {
  const length = Number(request.headers.get("Content-Length") || 0);
  if (length > 4_300_000) return { error: "document_too_large", status: 413 };
  let value;
  try { value = await request.json(); } catch { return { error: "invalid_json", status: 400 }; }
  if (!value || typeof value.j !== "string") return { error: "expected_json_wrapper", status: 400 };
  if (new TextEncoder().encode(value.j).byteLength > 4_000_000) return { error: "document_too_large", status: 413 };
  if (!Number.isSafeInteger(value.expectedRevision) || value.expectedRevision < 1) {
    return { error: "expected_revision_required", status: 428 };
  }
  return { value };
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
    const url = new URL(request.url);
    if (url.pathname === "/health" && request.method === "GET") {
      return json({ ok: true, service: "aspace-fallback", version: 1 });
    }
    // Public, read-only readiness check. Returns only a boolean, never schema or user data.
    if (url.pathname === "/health/db" && request.method === "GET") {
      if (!env.DB) return json({ ok: false, database: "unavailable" }, 503);
      try {
        // SELECT of a named column fails when the required revision migration is missing.
        await env.DB.prepare("SELECT revision FROM docs LIMIT 1").first();
        await env.DB.prepare("SELECT token_hash FROM shares LIMIT 1").first();
        return json({ ok: true, database: "ready", revisions: true });
      } catch (error) {
        console.error("D1 health check failed", error);
        return json({ ok: false, database: "unavailable" }, 503);
      }
    }
    if (!env.DB || !env.FIREBASE_PROJECT_ID || !env.OWNER_UID) {
      return json({ error: "fallback_not_configured" }, 503);
    }
    // Guest access works without a Firebase account. Its capability token is never
    // accepted for owner endpoints and is verified against a SHA-256 hash in D1.
    if (url.pathname === "/v1/shared") {
      if (!["GET", "PUT"].includes(request.method)) return json({ error: "method_not_allowed" }, 405);
      const token = request.headers.get("X-Aspace-Share-Token") || "";
      const hash = await shareTokenHash(token);
      if (!hash) return json({ error: "invalid_share" }, 404);
      const share = await env.DB.prepare(
        "SELECT owner_uid, doc_key, role FROM shares WHERE token_hash = ? AND revoked = 0"
      ).bind(hash).first();
      if (!share || !isShareableDoc(share.doc_key)) return json({ error: "invalid_share" }, 404);
      if (request.method === "GET") {
        const row = await env.DB.prepare(
          "SELECT payload, updated_at, revision FROM docs WHERE owner_uid = ? AND doc_key = ?"
        ).bind(share.owner_uid, share.doc_key).first();
        if (!row) return json({ error: "not_found" }, 404);
        return json({ j: row.payload, revision: row.revision, updatedAt: row.updated_at, role: share.role });
      }
      if (share.role !== "editor") return json({ error: "read_only" }, 403);
      const input = await readBody(request);
      if (input.error) return json({ error: input.error }, input.status);
      // Guest links are only for the small text-and-shapes prototype, not arbitrary uploads.
      const maxGuestBytes = isPrototypeDoc(share.doc_key) ? 500_000 : 750_000;
      if (new TextEncoder().encode(input.value.j).byteLength > maxGuestBytes) {
        return json({ error: "guest_document_too_large" }, 413);
      }
      let board;
      try { board = JSON.parse(input.value.j); } catch { return json({ error: "invalid_board" }, 400); }
      const valid = isPrototypeDoc(share.doc_key)
        ? (board && board.kind === "aspace-prototype" && board.schema === 1 &&
          typeof board.title === "string" && board.title.length <= 120 &&
          typeof board.text === "string" && board.text.length <= 100_000 &&
          Array.isArray(board.items) && board.items.length <= 100 &&
          Array.isArray(board.strokes) && board.strokes.length <= 250)
        : validLiveBoard(board);
      if (!valid) return json({ error: "invalid_board" }, 400);
      const now = Date.now();
      // Check access and update atomically so revoking a link cannot race a write.
      const updated = await env.DB.prepare(
        "UPDATE docs SET payload = ?, revision = revision + 1, updated_at = ? " +
        "WHERE owner_uid = ? AND doc_key = ? AND revision = ? " +
        "AND EXISTS (SELECT 1 FROM shares WHERE token_hash = ? AND revoked = 0 AND role = 'editor') " +
        "RETURNING revision"
      ).bind(input.value.j, now, share.owner_uid, share.doc_key, input.value.expectedRevision, hash).first();
      if (!updated) {
        const stillAuthorized = await env.DB.prepare(
          "SELECT 1 FROM shares WHERE token_hash = ? AND revoked = 0 AND role = 'editor'"
        ).bind(hash).first();
        if (!stillAuthorized) return json({ error: "invalid_share" }, 404);
        const current = await env.DB.prepare(
          "SELECT revision FROM docs WHERE owner_uid = ? AND doc_key = ?"
        ).bind(share.owner_uid, share.doc_key).first();
        return json({ error: "revision_conflict", currentRevision: current?.revision ?? 0 }, 409);
      }
      return json({ ok: true, revision: updated.revision, updatedAt: now });
    }

    const uid = await requireOwner(request, env);
    if (!uid) return json({ error: "unauthorized" }, 401);

    // List hashes and status, never raw link secrets, so links can be revoked on any owner's device.
    if (url.pathname === "/v1/shares" && request.method === "GET") {
      const docKey = url.searchParams.get("docKey") || "";
      if (!isShareableDoc(docKey)) return json({ error: "invalid_key" }, 400);
      const result = await env.DB.prepare(
        "SELECT token_hash, role, revoked, updated_at FROM shares " +
        "WHERE owner_uid = ? AND doc_key = ? ORDER BY updated_at DESC LIMIT 100"
      ).bind(uid, docKey).all();
      return json({ shares: (result.results || []).map(s => ({
        tokenHash: s.token_hash, role: s.role, revoked: Boolean(s.revoked), updatedAt: s.updated_at
      })) });
    }
    // Owner can create only test-board shares at this stage. Raw tokens are
    // generated in the browser; only SHA-256 hashes are stored in D1.
    if (url.pathname === "/v1/shares" && request.method === "POST") {
      let body;
      try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }
      if (!body || !/^[a-f0-9]{64}$/.test(body.tokenHash || "") ||
          !isShareableDoc(body.docKey) || !["viewer", "editor"].includes(body.role)) {
        return json({ error: "invalid_share_request" }, 400);
      }
      const doc = await env.DB.prepare(
        "SELECT 1 FROM docs WHERE owner_uid = ? AND doc_key = ?"
      ).bind(uid, body.docKey).first();
      if (!doc) return json({ error: "document_not_found" }, 404);
      const now = Date.now();
      const result = await env.DB.prepare(
        "INSERT INTO shares(token_hash, owner_uid, doc_key, role, revoked, updated_at) " +
        "VALUES (?, ?, ?, ?, 0, ?) ON CONFLICT(token_hash) DO NOTHING RETURNING token_hash"
      ).bind(body.tokenHash, uid, body.docKey, body.role, now).first();
      if (!result) return json({ error: "share_already_exists" }, 409);
      return json({ ok: true, role: body.role });
    }
    const updateRoleMatch = url.pathname.match(/^\/v1\/shares\/([a-f0-9]{64})$/);
    if (updateRoleMatch && request.method === "PATCH") {
      let body;
      try { body = await request.json(); }
      catch { return json({ error: "invalid_json" }, 400); }
      if (!body || !["viewer","editor"].includes(body.role)) {
        return json({ error: "invalid_role" }, 400);
      }
      const result = await env.DB.prepare(
        "UPDATE shares SET role = ?, updated_at = ? WHERE token_hash = ? " +
        "AND owner_uid = ? AND revoked = 0 RETURNING token_hash"
      ).bind(body.role,Date.now(),updateRoleMatch[1],uid).first();
      return result ? json({ ok: true, role: body.role }) :
        json({ error: "share_not_found_or_revoked" }, 404);
    }
    const revokeMatch = url.pathname.match(/^\/v1\/shares\/([a-f0-9]{64})$/);
    if (revokeMatch && request.method === "DELETE") {
      const updated = await env.DB.prepare(
        "UPDATE shares SET revoked = 1, updated_at = ? WHERE token_hash = ? AND owner_uid = ?"
      ).bind(Date.now(), revokeMatch[1], uid).run();
      return json({ ok: true, revoked: (updated.meta?.changes || 0) > 0 });
    }

    // Owner-only, read-only database diagnostic. Does not expose or modify lesson data.
    if (url.pathname === "/v1/diagnostics/db" && request.method === "GET") {
      try {
        const result = await env.DB.prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('docs', 'shares')"
        ).all();
        const present = new Set((result.results || []).map(row => row.name));
        const ready = present.has("docs") && present.has("shares");
        return json({ ok: ready, database: ready ? "ready" : "schema_incomplete" }, ready ? 200 : 503);
      } catch (error) {
        console.error("D1 diagnostic failed", error);
        return json({ ok: false, database: "unavailable" }, 503);
      }
    }

    const docMatch = url.pathname.match(/^\/v1\/docs\/(.+)$/);
    if (docMatch) {
      let key;
      try { key = decodeURIComponent(docMatch[1]); }
      catch { return json({ error: "invalid_key" }, 400); }
      if (!safeKey(key)) return json({ error: "invalid_key" }, 400);
      // Allow owner to clean up only disposable diagnostic documents.
      if (request.method === "DELETE") {
        if (!/^diag-[0-9a-f-]{36}$/.test(key)) return json({ error: "delete_not_allowed" }, 403);
        await env.DB.prepare(
          "DELETE FROM docs WHERE owner_uid = ? AND doc_key = ?"
        ).bind(uid, key).run();
        return json({ ok: true, deleted: true });
      }
      if (request.method === "GET") {
        const row = await env.DB.prepare(
          "SELECT payload, updated_at, revision FROM docs WHERE owner_uid = ? AND doc_key = ?"
        ).bind(uid, key).first();
        if (!row) return json({ error: "not_found" }, 404);
        return json({ j: row.payload, updatedAt: row.updated_at, revision: row.revision });
      }
      if (request.method === "PUT") {
        let body;
        try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }
        if (!body || typeof body.j !== "string") return json({ error: "expected_json_wrapper" }, 400);
        if (new TextEncoder().encode(body.j).byteLength > 4_000_000) return json({ error: "document_too_large" }, 413);
        // expectedRevision=0 is create-only. Positive values are CAS updates.
        // Missing revision is rejected rather than silently overwriting stored lessons.
        const expected = body.expectedRevision;
        if (!Number.isSafeInteger(expected) || expected < 0) return json({ error: "expected_revision_required" }, 428);
        const now = Date.now();
        let changed;
        if (expected === 0) {
          changed = await env.DB.prepare(
            "INSERT INTO docs(owner_uid, doc_key, payload, updated_at, revision) " +
            "VALUES(?, ?, ?, ?, 1) ON CONFLICT(owner_uid, doc_key) DO NOTHING RETURNING revision"
          ).bind(uid, key, body.j, now).first();
        } else {
          changed = await env.DB.prepare(
            "UPDATE docs SET payload = ?, updated_at = ?, revision = revision + 1 " +
            "WHERE owner_uid = ? AND doc_key = ? AND revision = ? RETURNING revision"
          ).bind(body.j, now, uid, key, expected).first();
        }
        if (!changed) {
          const existing = await env.DB.prepare(
            "SELECT revision FROM docs WHERE owner_uid = ? AND doc_key = ?"
          ).bind(uid, key).first();
          return json({ error: "revision_conflict", currentRevision: existing?.revision ?? 0 }, 409);
        }
        return json({ ok: true, updatedAt: now, revision: changed.revision });
      }
      return json({ error: "method_not_allowed" }, 405);
    }

    const assetMatch = url.pathname.match(/^\/v1\/assets\/([^/]+)$/);
    if (assetMatch) {
      if (!env.ASSETS) return json({ error: "asset_storage_not_enabled" }, 503);
      const id = decodeURIComponent(assetMatch[1]);
      if (!safeKey(id)) return json({ error: "invalid_asset_id" }, 400);
      const objectKey = `${uid}/${id}`;
      if (request.method === "GET") {
        const object = await env.ASSETS.get(objectKey);
        if (!object) return json({ error: "not_found" }, 404);
        const headers = new Headers(corsHeaders);
        object.writeHttpMetadata(headers);
        headers.set("ETag", object.httpEtag);
        headers.set("Cache-Control", "private, max-age=60");
        return new Response(object.body, { headers });
      }
      if (request.method === "PUT") {
        const limit = Math.max(1, Number(env.MAX_ASSET_BYTES) || 104857600);
        const size = Number(request.headers.get("Content-Length") || 0);
        if (size > limit) return json({ error: "asset_too_large", limit }, 413);
        if (!request.body) return json({ error: "empty_body" }, 400);
        await env.ASSETS.put(objectKey, request.body, {
          httpMetadata: { contentType: request.headers.get("Content-Type") || "application/octet-stream" },
          customMetadata: { ownerUid: uid, assetId: id }
        });
        return json({ ok: true, key: id });
      }
      return json({ error: "method_not_allowed" }, 405);
    }
    return json({ error: "not_found" }, 404);
  }
};
