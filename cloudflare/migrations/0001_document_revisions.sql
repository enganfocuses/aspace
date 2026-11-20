-- Aspace D1 migration 0001: document revision tracking.
-- Run ONCE on the existing aspace-fallback database. Non-destructive: rows are retained.
-- Required before optimistic concurrency control is enabled on the Worker.
ALTER TABLE docs ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;

-- Sanity-check after applying:
-- PRAGMA table_info(docs);
-- SELECT COUNT(*) AS documents FROM docs;
