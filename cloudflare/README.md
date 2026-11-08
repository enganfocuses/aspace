# Aspace: automatic board reserve

Firebase remains primary. Ordinary Aspace board sessions use `runtime.js` and
`live-board.js`; owners and students keep the same editor and existing links.
`config.js` enables the reserve. `?standby=off` or `reserve.enabled=false`
disables routing for rollback. No paid object storage is enabled.

## Data and recovery

- Shared lessons use `/shares/<token>/board` as their canonical Firebase path
  for both owner and student. Private boards keep `/docs/boards/<id>` and its
  existing JSON wrapper. Full snapshots are not saved to both primary paths.
- D1 uses the same `boards/<id>` key. `_aspaceSync` records a primary content
  hash, mirror/standby state and a bounded chain of ancestor hashes. The editor
  receives only logical board content. Display timestamps are excluded from
  ancestry hashes.
- Changes are committed to IndexedDB before network writes. Provider writes
  are serialized; Web Locks also serialize tabs of the same local actor.
- Network failures, timeouts, 429, 5xx and explicitly recognized Firebase quota
  errors enable reserve access. Ordinary 401/403/404, invalid JSON and version
  conflicts do not bypass authorization.
- Firebase saves use ETag preconditions and D1 saves use revision CAS. An editor
  without a confirmed version retains a local draft instead of overwriting.
- `merge-board.js` merges independent object additions, deletions and edits.
  Concurrent changes to one object or scalar field stay conflicts. Both stored
  versions are retained; the board menu exports all versions as JSON and lets
  an editor explicitly choose a reviewed version. Resolution rechecks both
  provider versions and the local draft before conditional replacement.
- Any authorized editor can restore pending D1 changes when Firebase returns,
  provided the primary hash matches the recorded base or confirmed ancestor.
  A later D1 write is protected by its revision; it cannot be silently replaced
  by an earlier recovery response. View-only clients never restore by writing.
- Board polling handles outages beginning mid-lesson, recovery, role changes
  and revocation. It pauses hidden tabs and preserves unsaved local edits.
- Existing IndexedDB drafts migrate before the old board queue can replay.
  Unknown old ancestors remain conflicts. Non-board metadata and local assets
  retain the legacy paths.
- Owner share mutations persist hashed intents locally and serialize updates.
  Failed role/revocation operations retry after reconnect/reload. The UI warns
  when access changes have not been confirmed by both services. Revocation
  archives the current shared board before removing the Firebase share.

## Deployment

The existing Worker APIs and D1 revision schema are unchanged by this browser
release; no new database migration or backend endpoint is required. The Worker
verifies owner Firebase ID tokens and enforces capability roles and revisions.
R2 stays disabled in `wrangler.toml`.

For backend changes use the existing manual GitHub Actions deployment workflow
with repository-owned Cloudflare secrets. Never put Cloudflare credentials in
browser code. An empty D1 uses `schema.sql`; an older D1 without revisions uses
`migrations/001_add_revision.sql` once. Do not run both revision migrations on
an already migrated database.

## Validation

```sh
node --test tests/*.test.mjs cloudflare/tests/*.test.mjs
```

The tests cover two participants, independent/overlapping changes, quota and
network failures, lost save responses, recovery by a new participant, partial
recovery ancestry, viewer isolation and legacy note migration. Browser QA uses
two tabs of the actual editor with a preview-only synthetic backend. This does
not assert that a real two-device lesson or every network configuration was
tested.

The published `cloudflare-failover-check.html` and
`cloudflare-guest-batch-check.html` exercise disposable records against the
actual services after owner sign-in. `cloudflare-standby-preparation.html`
explicitly snapshots canonical shared/private boards and active hashed grants.

## Limits

Embedded/oversized media is retained on the device and existing Firebase paths;
it is not mirrored to D1. Small boards and external media URLs can use the
reserve. WebRTC signaling and new owner sign-in retain their current Firebase
and network dependencies. Local browser storage can be cleared. Conflicting
edits need review. Anonymous links are bearer capabilities, and revocation
cannot erase a copy somebody already downloaded. No unlimited-free or
uninterrupted-video guarantee is implied.
