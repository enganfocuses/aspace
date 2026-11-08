-- Aspace Cloudflare fallback schema.
-- New empty D1 only: npx wrangler d1 execute aspace-fallback --remote --file=schema.sql
-- Existing D1: use migrations/001_add_revision.sql once; do not reapply on an already-migrated database.
CREATE TABLE IF NOT EXISTS docs (
  owner_uid TEXT NOT NULL,
  doc_key TEXT NOT NULL,
  payload TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  PRIMARY KEY (owner_uid, doc_key)
);
CREATE INDEX IF NOT EXISTS docs_updated_at ON docs(owner_uid, updated_at);
-- Reserved for the next phase. Raw public-link tokens are never stored.
CREATE TABLE IF NOT EXISTS shares (
  token_hash TEXT PRIMARY KEY,
  owner_uid TEXT NOT NULL,
  doc_key TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('viewer', 'editor')),
  revoked INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS shares_doc_key ON shares(owner_uid, doc_key);
