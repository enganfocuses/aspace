/* Not imported by the live app yet. The app must provide a fresh Firebase ID token. */
export function createCloudflareFallback({ baseUrl, getIdToken, fetchImpl = fetch }) {
  const base = String(baseUrl || "").replace(/\/+$/, "");
  if (!base || typeof getIdToken !== "function") throw new Error("Cloudflare fallback requires baseUrl and getIdToken()");
  async function request(path, options = {}) {
    const token = await getIdToken();
    if (!token) throw new Error("Firebase ID token is unavailable");
    const response = await fetchImpl(base + path, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body && !(options.body instanceof ReadableStream) ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {})
      }
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Cloudflare fallback HTTP ${response.status}${detail ? `: ${detail.slice(0, 160)}` : ""}`);
    }
    return response;
  }
  return {
    async health() {
      const r = await fetchImpl(base + "/health", { cache: "no-store" });
      if (!r.ok) throw new Error(`Cloudflare health HTTP ${r.status}`);
      return r.json();
    },
    // Returns both the document and its revision. Keep this revision for safe subsequent writes.
    async getDoc(key) {
      const r = await request("/v1/docs/" + encodeURIComponent(key));
      const record = await r.json();
      return record && typeof record.j === "string"
        ? { value: JSON.parse(record.j), revision: record.revision, updatedAt: record.updatedAt }
        : null;
    },
    // Use expectedRevision=0 for creating a new document, or the revision from getDoc.
    // A 409 indicates a concurrent edit; callers must reconcile rather than retry blindly.
    async putDoc(key, value, expectedRevision) {
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
        throw new Error("putDoc requires a nonnegative expectedRevision");
      }
      const r = await request("/v1/docs/" + encodeURIComponent(key), {
        method: "PUT",
        body: JSON.stringify({ j: JSON.stringify(value), expectedRevision })
      });
      return r.json();
    },
    async getAsset(id) {
      const r = await request("/v1/assets/" + encodeURIComponent(id));
      return r.blob();
    },
    async putAsset(id, blob) {
      await request("/v1/assets/" + encodeURIComponent(id), {
        method: "PUT",
        headers: { "Content-Type": blob.type || "application/octet-stream" },
        body: blob
      });
      return true;
    }
  };
}
