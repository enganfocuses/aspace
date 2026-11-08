# Aspace Cloudflare fallback — phase 1

This is an isolated backup backend. It is NOT connected to the live Aspace app and does not change Firebase behavior.

## Included

- Cloudflare Worker API and public health endpoint.
- D1 document storage for the owner.
- R2 object storage for the owner's assets.
- Cryptographic verification of Firebase ID tokens using Google's Secure Token public JWKs.
- A browser adapter for later integration.
- D1 schema reserved for hashed public-share tokens.

## Security and current limitations

- Data operations are accepted only from the configured owner Firebase UID.
- The Worker verifies the Firebase ID token signature, issuer, and audience; it never trusts a UID from the request body.
- Student public links, viewer/editor permissions, guest asset access, and shared-board signaling are NOT enabled in this phase. Do not route student traffic here yet.
- This phase still relies on Firebase Authentication to issue ID tokens. It is storage/database failover, not authentication failover.
- The adapter is not imported by the production app. Automatic provider switching is not active.
- R2 stores file bytes; D1 stores structured records. Base64 media must not be placed in D1.

## Setup after reviewing the PR

1. Create a Cloudflare account and enable Workers, D1, and R2.
2. Copy wrangler.toml.example to wrangler.toml and fill in the D1 database ID.
3. Create a D1 database named aspace-fallback and an R2 bucket named aspace-fallback-assets.
4. Set OWNER_UID to the Firebase Authentication UID of the Aspace owner. Keep FIREBASE_PROJECT_ID as myspace-5d573.
5. From this directory, install dependencies and initialize D1 with npm install and npx wrangler d1 execute aspace-fallback --remote --file=schema.sql.
6. Deploy with npx wrangler deploy.
7. Test GET /health. Keep the Worker URL private until app integration is complete.

Never commit wrangler.toml, API tokens, or secrets. Do not put Cloudflare API tokens in browser code or config.js.

## Next phases

1. Implement a share-token bridge with hashed tokens, revocation, viewer/editor enforcement, and owner-controlled provisioning.
2. Add a durable change journal and idempotency keys so failover cannot silently overwrite newer edits.
3. Integrate provider routing with health checks, local queueing, and conflict-safe recovery.
4. Move image/audio/video/PDF storage to R2 with MIME, ownership, size, and cleanup validation.
5. Move WebRTC signaling only after guest authorization is ready.

Do not enable automatic failover until phases 1–3 are implemented and tested with a teacher account and a separate student browser.
