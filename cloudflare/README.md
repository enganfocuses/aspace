# Aspace Cloudflare standby — Firebase stays primary

## Fundamental architecture decision

**Do not migrate away from Firebase.** Firebase Realtime Database remains the primary datastore, while Cloudflare D1 serves as a warm standby. The intended behavior is:

1. With Firebase healthy: read/write Firebase, mirror confirmed documents to Cloudflare asynchronously using D1 revision checks.
2. If Firebase explicitly reports **quota exhaustion** or has a *network error, timeout, 429 or 5xx*: switch reads to a previously confirmed Cloudflare snapshot. Use one centralized eligibility policy. Do not mask authentication errors, permission denials, ETag conflicts or malformed requests.
3. During a Firebase outage: preserve edits in a durable local queue. Do not silently overwrite either provider. Write-capable failover to D1 and replay to Firebase requires an idempotent two-way journal, per-document base revisions and conflict handling, and must be tested before enabled.
4. When Firebase returns: reconcile revisions before replay, avoid losing teacher/student edits, and resume primary writes only after a safe merge.
5. Public sharing and video require separate consideration: fallback owner document access does not automatically mean students can work during a Firebase/Authentication outage.
6. No billable R2 deployment: images and videos are **not** automatically backed up by D1.

### Staged standby implementation

`cloudflare/standby.js` is an isolated Firebase-first controller, **not loaded by the production site**. It supports Firebase-first reads, confirmed Cloudflare snapshots on transient read failures, conditional Firebase ETag writes and an injected **durable IndexedDB queue** from `cloudflare/queue.js`. Pending drafts survive browser reloads and can be explicitly replayed after Firebase recovers, but replay only proceeds when the server's current document still equals the draft's known base. A previously accepted write with a lost response is detected and not repeated. Unknown bases and divergent content stop with a conflict rather than silently overwriting. The controller's mirror refuses to overwrite a Cloudflare document whose content has diverged. Full Cloudflare writes during outages, journaled bidirectional reconciliation, and production integration are **not yet active**. The live site still uses Firebase.

The owner-only `cloudflare-migration-audit.html` page is a read-only readiness audit despite its historical filename: it does not migrate or replace data.

---

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

## Deployment verification

The GitHub-connected Worker must deploy the code from this `cloudflare/` directory, not the Cloudflare Hello World scaffold. In Cloudflare Builds, check that the latest deployment references this branch and commit; a `Ready` status on a dashboard-only deployment does not establish that. After deployment, `GET /health` must return JSON with `service: "aspace-fallback"`. A protected `GET /v1/docs/meta%2Fboards` without an ID token should return HTTP 401. Avoid testing writes on live teaching data.

## Current isolated prototype (November 2026)

**Do not merge this draft PR or switch production Aspace yet.** The live application still uses Firebase Realtime Database and its current student links. A separate prototype is published at `/aspace/cloudflare-board-test.html` and uses owner Firebase Authentication only for its owner interface.

Implemented in the staging Worker:
- D1 owner document GET and compare-and-swap PUT, with monotonically increasing revisions and HTTP 409 conflicts.
- Prototype guest links for `prototype-board-v1`, `prototype-board-v2`, `prototype-board-v3` only; no account required. The owner creates a cryptographically random 256-bit token in the browser, sends only SHA-256 to D1, and shares a URL fragment so secrets are not included in HTTP request paths.
- Viewer links can only GET. Editor links can GET/PUT using compare-and-swap revisions; revoked links stop working on the next server request.
- Owner GET /v1/shares?docKey=... audits hashed tokens without raw secrets; POST creates and DELETE /v1/shares/:hash revokes them.
- Guest writes are restricted to 500 KB valid prototype documents, with capped top-level arrays. This is not an anti-abuse rate limiter.
- Diagnostic DELETE is restricted to `diag-<uuid>` owner documents.

In the separate HTML prototype:
- Three test-board slots, per-device local drafts, rate-limited autosave, offline retries, export/import, bounded local version snapshots.
- Conservative three-way merge for *independent* changes only. Overlapping edits remain conflicts and must be resolved manually.
- Touch objects and freehand drawing; guest view and guest editor interfaces; read-only previews.
- A one-click batch-check page for local merge cases, D1 readiness, and unauthenticated endpoint denial.

### Known limitations / before production

1. **This is not real-time CRDT or operational transformation.** It polls server state and saves complete board JSON; concurrent changes to the same object or text cannot be merged automatically.
2. The guest prototype requires a separate security and mobile test. Never add real student content to the three test boards until privacy is reviewed.
3. Anonymous public links are bearer capabilities. Anyone who obtains the link has the assigned permissions; revoking access does not erase already-downloaded data or local copies.
4. Guest edit API enforces role and document CAS, but no global anti-abuse quotas or automatic rotation/expiration have been implemented.
5. Current WebRTC video, Firebase media storage/signaling, and production student sharing are **not migrated**.
6. No R2 object storage is configured. Do not enable billable object storage without an explicit cost decision.
7. Cloudflare Worker deployment status must be confirmed in Cloudflare Builds; GitHub commits alone do not prove live deployment.
8. The main Aspace board serialization is richer than the prototype. Media references, canvas dimensions, permissions, and import/export need formal migration rules before switching.

### Batch smoke test (tablet friendly)

After both Cloudflare Builds and GitHub Pages publish the latest changes:

1. Open `https://enganfocuses.github.io/aspace/cloudflare-batch-check.html` and run the nine checks.
2. Open `https://enganfocuses.github.io/aspace/cloudflare-board-test.html`, use three independent test board slots, and test local snapshots, shapes, notes, pen, backup and import.
3. On board slot 1, save first and create one viewer and one editor link. Open each in a private browser without Firebase login. Confirm viewer cannot save and editor can save.
4. Make independent changes from two browsers to different fields/objects and observe auto merge after a stale-save conflict. Edit the *same* object from both browsers and confirm saving is blocked.
5. Revoke both links in the owner screen; verify guest requests no longer return board contents.
6. Only when this whole sequence passes, consider integrating a gated adapter into the main app. Never silently delete or overwrite existing Firebase data.


## Latest standby test package

- `queue.js`: an owner-scoped IndexedDB queue (injection required; no fallback to memory).
- `standby.js`: primary ETag updates, transient read failover to Cloudflare, durable queue writes before network attempts, explicit conflict-safe replay, and divergent standby snapshot checks.
- `tests/standby.test.mjs`: eight independent no-network tests for normal operation, outage reads, auth isolation, reload recovery, conflicts, ambiguous success, unknown base, and divergent mirrors.
- `npm test` inside `cloudflare/` executes them using Node 22.
- GitHub Actions runs the same tests for this draft branch.

**Limitations:** Sync is not enabled in production, and no browser integration has been tested with the real Firebase board yet. Replay must be invoked explicitly; merely reconnecting doesn't auto-replay. The prototype Cloudflare guest-board functionality is separate and does not grant failover for existing Firebase student links. The IndexedDB queue is scoped to one owner, but browser-local storage is not encrypted and can be cleared by the user. Never claim that the product is protected against all service outages or billing-limit errors until failover is fully integrated and end-to-end tested.


### Failover implementation details (staging)

The opt-in `createAspaceStandby` constructor now requires a durable IndexedDB queue. Writes persist the user's draft before attempting any network mutation. On transient Firebase errors, the queued draft remains available across reloads; reading never silently replaces a pending draft with an older standby snapshot.

`replay(key)` compares the current Firebase document to the previously read base and uses Firebase ETags. If Firebase has changed, the draft is retained for explicit conflict resolution. A lost PUT response is handled by detecting an already-applied identical value. `replayAll()` is sequential; `startRecovery()` optionally polls and handles browser online events, but does not silently merge conflicts. Neither is wired into the production app.

Mirroring skips snapshots larger than 750,000 JSON characters or containing embedded data-URL media. This reduces unexpected storage/bandwidth usage, but means these boards are **not backed up by Cloudflare**. Mirroring also refuses to overwrite a Cloudflare snapshot that differs from the last confirmed local mirror (for instance, if a guest made an edit during an outage). A production implementation will require explicit migration rules and reconciliation of such divergence.

Even with a durable queue, this is **not** a complete solution for simultaneous guest writes, media continuity, or video signaling during Firebase outages. Do not claim zero-cost guarantees or uninterrupted collaboration.

## Final routing policy

Firebase remains primary. Cloudflare is an emergency reserve if Firebase quotas are exceeded or Firebase becomes unavailable. `standbyEligible()` is the single centralized decision point: explicit quota errors, network failures/timeouts, HTTP 429 and HTTP 5xx trigger standby reads. Unauthorized (401), ordinary permission-denied (403), malformed requests (400) and ETag conflicts (412) must not switch providers. This must not be misrepresented as having two duplicate whiteboard implementations: the provider changes, not the board UI or board document format.

Quota errors can have different shapes, and only confidently recognized signals trigger switching. A permission-denied error must not be mistaken for exhausted quota. Writes are held durably when necessary and only replayed to Firebase with base verification; full editable Cloudflare standby remains a future requirement. Auth still relies on Firebase for fresh tokens.

## Single-router integration staged in the real board app

On the draft `feature/cloudflare-fallback-foundation` branch, `index.html` has exactly one existing `load(p)` and one existing `save(p,d)` function. When (and only when) the owner explicitly opens a build with `?standby=lab`, these entry points route small board documents through `cloudflare/standby.js` and its IndexedDB-backed queue. Without the flag the original Firebase behavior is left unchanged. The existing real-time guest board sharing, WebRTC signaling and asset handling are NOT routed through this controller. The old `syncLocalChanges` queue is bypassed when the standby controller is active, preventing duplicate writes.

**The staging branch is not deployed as the normal Aspace site.** Ordinary visits to the GitHub Pages production page remain Firebase-only. The branch must not be merged until the single-router code has been verified against the real application in a controlled owner environment and ownership/guest permissions, Firebase ETag behavior, and existing local pending changes have been reviewed. The single-router mode is a storage-routing prototype, not an all-feature outage-ready product.

For a synthetic end-to-end quota/outage test without enabling production failover, visit `/cloudflare-failover-check.html` on GitHub Pages. It performs one batch covering real board schema read-only inspection, a disposable diagnostic document, quota-triggered standby reads, permission denial isolation, network failure, durable queued edits, restoration, conflicting concurrent edits, and cleanup.
