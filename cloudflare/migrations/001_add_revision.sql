-- ONE-TIME ONLY for existing D1 docs tables created without revision.
-- Before running, verify that SELECT revision FROM docs LIMIT 1 fails.
-- If it succeeds, STOP: database is already migrated and this migration must not run.
-- This statement does not rewrite payloads or existing owner IDs.
ALTER TABLE docs ADD COLUMN revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1);
