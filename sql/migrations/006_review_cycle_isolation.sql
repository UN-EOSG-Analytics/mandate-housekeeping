-- MANUAL APPLY ONLY. Do not run from application startup.
-- Apply as the migration owner, with app traffic paused by the operator.
-- No audit fields, keys, IDs, timestamps or source citations are rewritten.
\set ON_ERROR_STOP on
BEGIN;
CREATE TEMP TABLE _review_before ON COMMIT DROP AS
SELECT 'mandate_decisions' AS relation, to_jsonb(r) AS row FROM mandates_housekeeping.mandate_decisions r
UNION ALL
SELECT 'mandate_comments' AS relation, to_jsonb(r) AS row FROM mandates_housekeeping.mandate_comments r
UNION ALL
SELECT 'entity_review_mode' AS relation, to_jsonb(r) AS row FROM mandates_housekeeping.entity_review_mode r
UNION ALL
SELECT 'review_change_responses' AS relation, to_jsonb(r) AS row FROM mandates_housekeeping.review_change_responses r
UNION ALL
SELECT 'docx_uploads' AS relation, to_jsonb(r) AS row FROM mandates_housekeeping.docx_uploads r;
-- Review-cycle isolation. Context is transaction-local (PgBouncer compatible).
-- Existing history belongs to ppb2026 regardless of the shared registry default.
-- PPB2027 review is disabled in BOTH the application and database policy.

ALTER TABLE mandates_housekeeping.mandate_decisions
  ADD COLUMN budget_version text NOT NULL DEFAULT 'ppb2026'
  CHECK (budget_version IN ('ppb2026', 'ppb2027'));
ALTER TABLE mandates_housekeeping.mandate_decisions ALTER COLUMN budget_version
  SET DEFAULT COALESCE(NULLIF(current_setting('app.budget_version', true), ''), 'ppb2026');
CREATE INDEX mandate_decisions_cycle_idx ON mandates_housekeeping.mandate_decisions (budget_version, entity);
ALTER TABLE mandates_housekeeping.mandate_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE mandates_housekeeping.mandate_decisions FORCE ROW LEVEL SECURITY;
CREATE POLICY cycle_read ON mandates_housekeeping.mandate_decisions FOR SELECT
  USING (budget_version = COALESCE(NULLIF(current_setting('app.budget_version', true), ''), 'ppb2026'));
CREATE POLICY cycle_insert ON mandates_housekeeping.mandate_decisions FOR INSERT
  WITH CHECK (budget_version = 'ppb2026' AND budget_version = COALESCE(NULLIF(current_setting('app.budget_version', true), ''), 'ppb2026'));
CREATE POLICY cycle_update ON mandates_housekeeping.mandate_decisions FOR UPDATE
  USING (budget_version = 'ppb2026' AND budget_version = COALESCE(NULLIF(current_setting('app.budget_version', true), ''), 'ppb2026'))
  WITH CHECK (budget_version = 'ppb2026' AND budget_version = COALESCE(NULLIF(current_setting('app.budget_version', true), ''), 'ppb2026'));
CREATE POLICY cycle_delete ON mandates_housekeeping.mandate_decisions FOR DELETE
  USING (budget_version = 'ppb2026' AND budget_version = COALESCE(NULLIF(current_setting('app.budget_version', true), ''), 'ppb2026'));

ALTER TABLE mandates_housekeeping.mandate_comments
  ADD COLUMN budget_version text NOT NULL DEFAULT 'ppb2026'
  CHECK (budget_version IN ('ppb2026', 'ppb2027'));
ALTER TABLE mandates_housekeeping.mandate_comments ALTER COLUMN budget_version
  SET DEFAULT COALESCE(NULLIF(current_setting('app.budget_version', true), ''), 'ppb2026');
CREATE INDEX mandate_comments_cycle_idx ON mandates_housekeeping.mandate_comments (budget_version, entity);
ALTER TABLE mandates_housekeeping.mandate_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE mandates_housekeeping.mandate_comments FORCE ROW LEVEL SECURITY;
CREATE POLICY cycle_read ON mandates_housekeeping.mandate_comments FOR SELECT
  USING (budget_version = COALESCE(NULLIF(current_setting('app.budget_version', true), ''), 'ppb2026'));
CREATE POLICY cycle_insert ON mandates_housekeeping.mandate_comments FOR INSERT
  WITH CHECK (budget_version = 'ppb2026' AND budget_version = COALESCE(NULLIF(current_setting('app.budget_version', true), ''), 'ppb2026'));
CREATE POLICY cycle_update ON mandates_housekeeping.mandate_comments FOR UPDATE
  USING (budget_version = 'ppb2026' AND budget_version = COALESCE(NULLIF(current_setting('app.budget_version', true), ''), 'ppb2026'))
  WITH CHECK (budget_version = 'ppb2026' AND budget_version = COALESCE(NULLIF(current_setting('app.budget_version', true), ''), 'ppb2026'));
CREATE POLICY cycle_delete ON mandates_housekeeping.mandate_comments FOR DELETE
  USING (budget_version = 'ppb2026' AND budget_version = COALESCE(NULLIF(current_setting('app.budget_version', true), ''), 'ppb2026'));

ALTER TABLE mandates_housekeeping.entity_review_mode
  ADD COLUMN budget_version text NOT NULL DEFAULT 'ppb2026'
  CHECK (budget_version IN ('ppb2026', 'ppb2027'));
ALTER TABLE mandates_housekeeping.entity_review_mode ALTER COLUMN budget_version
  SET DEFAULT COALESCE(NULLIF(current_setting('app.budget_version', true), ''), 'ppb2026');
CREATE INDEX entity_review_mode_cycle_idx ON mandates_housekeeping.entity_review_mode (budget_version, entity);
ALTER TABLE mandates_housekeeping.entity_review_mode ENABLE ROW LEVEL SECURITY;
ALTER TABLE mandates_housekeeping.entity_review_mode FORCE ROW LEVEL SECURITY;
CREATE POLICY cycle_read ON mandates_housekeeping.entity_review_mode FOR SELECT
  USING (budget_version = COALESCE(NULLIF(current_setting('app.budget_version', true), ''), 'ppb2026'));
CREATE POLICY cycle_insert ON mandates_housekeeping.entity_review_mode FOR INSERT
  WITH CHECK (budget_version = 'ppb2026' AND budget_version = COALESCE(NULLIF(current_setting('app.budget_version', true), ''), 'ppb2026'));
CREATE POLICY cycle_update ON mandates_housekeeping.entity_review_mode FOR UPDATE
  USING (budget_version = 'ppb2026' AND budget_version = COALESCE(NULLIF(current_setting('app.budget_version', true), ''), 'ppb2026'))
  WITH CHECK (budget_version = 'ppb2026' AND budget_version = COALESCE(NULLIF(current_setting('app.budget_version', true), ''), 'ppb2026'));
CREATE POLICY cycle_delete ON mandates_housekeeping.entity_review_mode FOR DELETE
  USING (budget_version = 'ppb2026' AND budget_version = COALESCE(NULLIF(current_setting('app.budget_version', true), ''), 'ppb2026'));

ALTER TABLE mandates_housekeeping.review_change_responses
  ADD COLUMN budget_version text NOT NULL DEFAULT 'ppb2026'
  CHECK (budget_version IN ('ppb2026', 'ppb2027'));
ALTER TABLE mandates_housekeeping.review_change_responses ALTER COLUMN budget_version
  SET DEFAULT COALESCE(NULLIF(current_setting('app.budget_version', true), ''), 'ppb2026');
CREATE INDEX review_change_responses_cycle_idx ON mandates_housekeeping.review_change_responses (budget_version, entity);
ALTER TABLE mandates_housekeeping.review_change_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE mandates_housekeeping.review_change_responses FORCE ROW LEVEL SECURITY;
CREATE POLICY cycle_read ON mandates_housekeeping.review_change_responses FOR SELECT
  USING (budget_version = COALESCE(NULLIF(current_setting('app.budget_version', true), ''), 'ppb2026'));
CREATE POLICY cycle_insert ON mandates_housekeeping.review_change_responses FOR INSERT
  WITH CHECK (budget_version = 'ppb2026' AND budget_version = COALESCE(NULLIF(current_setting('app.budget_version', true), ''), 'ppb2026'));
CREATE POLICY cycle_update ON mandates_housekeeping.review_change_responses FOR UPDATE
  USING (budget_version = 'ppb2026' AND budget_version = COALESCE(NULLIF(current_setting('app.budget_version', true), ''), 'ppb2026'))
  WITH CHECK (budget_version = 'ppb2026' AND budget_version = COALESCE(NULLIF(current_setting('app.budget_version', true), ''), 'ppb2026'));
CREATE POLICY cycle_delete ON mandates_housekeeping.review_change_responses FOR DELETE
  USING (budget_version = 'ppb2026' AND budget_version = COALESCE(NULLIF(current_setting('app.budget_version', true), ''), 'ppb2026'));

ALTER TABLE mandates_housekeeping.docx_uploads
  ADD COLUMN budget_version text NOT NULL DEFAULT 'ppb2026'
  CHECK (budget_version IN ('ppb2026', 'ppb2027'));
ALTER TABLE mandates_housekeeping.docx_uploads ALTER COLUMN budget_version
  SET DEFAULT COALESCE(NULLIF(current_setting('app.budget_version', true), ''), 'ppb2026');
CREATE INDEX docx_uploads_cycle_idx ON mandates_housekeeping.docx_uploads (budget_version, entity);
ALTER TABLE mandates_housekeeping.docx_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE mandates_housekeeping.docx_uploads FORCE ROW LEVEL SECURITY;
CREATE POLICY cycle_read ON mandates_housekeeping.docx_uploads FOR SELECT
  USING (budget_version = COALESCE(NULLIF(current_setting('app.budget_version', true), ''), 'ppb2026'));
CREATE POLICY cycle_insert ON mandates_housekeeping.docx_uploads FOR INSERT
  WITH CHECK (budget_version = 'ppb2026' AND budget_version = COALESCE(NULLIF(current_setting('app.budget_version', true), ''), 'ppb2026'));
CREATE POLICY cycle_update ON mandates_housekeeping.docx_uploads FOR UPDATE
  USING (budget_version = 'ppb2026' AND budget_version = COALESCE(NULLIF(current_setting('app.budget_version', true), ''), 'ppb2026'))
  WITH CHECK (budget_version = 'ppb2026' AND budget_version = COALESCE(NULLIF(current_setting('app.budget_version', true), ''), 'ppb2026'));
CREATE POLICY cycle_delete ON mandates_housekeeping.docx_uploads FOR DELETE
  USING (budget_version = 'ppb2026' AND budget_version = COALESCE(NULLIF(current_setting('app.budget_version', true), ''), 'ppb2026'));

-- Session/decision foreign keys must agree on cycle even for privileged importers.
ALTER TABLE mandates_housekeeping.entity_review_mode ADD UNIQUE (id, budget_version);
ALTER TABLE mandates_housekeeping.mandate_decisions ADD UNIQUE (id, budget_version);
ALTER TABLE mandates_housekeeping.mandate_decisions ADD CONSTRAINT decisions_session_cycle_fk
  FOREIGN KEY (review_session_id, budget_version)
  REFERENCES mandates_housekeeping.entity_review_mode (id, budget_version);
ALTER TABLE mandates_housekeeping.review_change_responses ADD CONSTRAINT responses_session_cycle_fk
  FOREIGN KEY (review_session_id, budget_version)
  REFERENCES mandates_housekeeping.entity_review_mode (id, budget_version);
ALTER TABLE mandates_housekeeping.review_change_responses ADD CONSTRAINT responses_decision_cycle_fk
  FOREIGN KEY (revert_decision_id, budget_version)
  REFERENCES mandates_housekeeping.mandate_decisions (id, budget_version);
DROP INDEX mandates_housekeeping.idx_review_change_responses_unique;
CREATE UNIQUE INDEX idx_review_change_responses_unique ON mandates_housekeeping.review_change_responses
  (budget_version, entity, document_symbol, COALESCE(subprogramme, ''), review_session_id);

-- Fail atomically if anything except the added version field changed.
DO $conservation$
BEGIN
 IF EXISTS (
   (SELECT * FROM _review_before EXCEPT SELECT * FROM (
SELECT 'mandate_decisions' AS relation, to_jsonb(r) - 'budget_version' AS row FROM mandates_housekeeping.mandate_decisions r
UNION ALL
SELECT 'mandate_comments' AS relation, to_jsonb(r) - 'budget_version' AS row FROM mandates_housekeeping.mandate_comments r
UNION ALL
SELECT 'entity_review_mode' AS relation, to_jsonb(r) - 'budget_version' AS row FROM mandates_housekeeping.entity_review_mode r
UNION ALL
SELECT 'review_change_responses' AS relation, to_jsonb(r) - 'budget_version' AS row FROM mandates_housekeeping.review_change_responses r
UNION ALL
SELECT 'docx_uploads' AS relation, to_jsonb(r) - 'budget_version' AS row FROM mandates_housekeeping.docx_uploads r) after_rows)
   UNION ALL
   (SELECT * FROM (
SELECT 'mandate_decisions' AS relation, to_jsonb(r) - 'budget_version' AS row FROM mandates_housekeeping.mandate_decisions r
UNION ALL
SELECT 'mandate_comments' AS relation, to_jsonb(r) - 'budget_version' AS row FROM mandates_housekeeping.mandate_comments r
UNION ALL
SELECT 'entity_review_mode' AS relation, to_jsonb(r) - 'budget_version' AS row FROM mandates_housekeeping.entity_review_mode r
UNION ALL
SELECT 'review_change_responses' AS relation, to_jsonb(r) - 'budget_version' AS row FROM mandates_housekeeping.review_change_responses r
UNION ALL
SELECT 'docx_uploads' AS relation, to_jsonb(r) - 'budget_version' AS row FROM mandates_housekeeping.docx_uploads r) after_rows EXCEPT SELECT * FROM _review_before)
 ) THEN RAISE EXCEPTION 'Review conservation failed'; END IF;
END $conservation$;
COMMIT;
