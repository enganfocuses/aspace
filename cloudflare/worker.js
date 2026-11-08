import { createRemoteJWKSet, jwtVerify } from "jose";

const FIREBASE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
);
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
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
    if (!env.DB || !env.ASSETS || !env.FIREBASE_PROJECT_ID || !env.OWNER_UID) {
      return json({ error: "fallback_not_configured" }, 503);
    }
    const uid = await requireOwner(request, env);
    if (!uid) return json({ error: "unauthorized" }, 401);

    const docMatch = url.pathname.match(/^\/v1\/docs\/(.+)$/);
    if (docMatch) {
      const key = decodeURIComponent(docMatch[1]);
      if (!safeKey(key)) return json({ error: "invalid_key" }, 400);
      if (request.method === "GET") {
        const row = await env.DB.prepare(
          "SELECT payload, updated_at FROM docs WHERE owner_uid = ? AND doc_key = ?"
        ).bind(uid, key).first();
        if (!row) return json({ error: "not_found" }, 404);
        return json({ j: row.payload, updatedAt: row.updated_at });
      }
      if (request.method === "PUT") {
        let body;
        try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }
        if (!body || typeof body.j !== "string") return json({ error: "expected_json_wrapper" }, 400);
        if (body.j.length > 4_000_000) return json({ error: "document_too_large" }, 413);
        const now = Date.now();
        await env.DB.prepare(
          "INSERT INTO docs(owner_uid, doc_key, payload, updated_at) VALUES(?, ?, ?, ?) " +
          "ON CONFLICT(owner_uid, doc_key) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at"
        ).bind(uid, key, body.j, now).run();
        return json({ ok: true, updatedAt: now });
      }
      return json({ error: "method_not_allowed" }, 405);
    }

    const assetMatch = url.pathname.match(/^\/v1\/assets\/([^/]+)$/);
    if (assetMatch) {
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
