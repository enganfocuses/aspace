import { createRemoteJWKSet, jwtVerify } from "jose";

const FIREBASE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
);
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
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
    const uid = await requireOwner(request, env);
    if (!uid) return json({ error: "unauthorized" }, 401);

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
      const key = decodeURIComponent(docMatch[1]);
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
