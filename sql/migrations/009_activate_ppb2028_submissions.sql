-- MANUAL APPLY ONLY, as the migration owner, coordinated with the app update.
-- Activate submissions for PPB 2028 (source cycle ppb2027).
-- Submissions for PPB 2027 (ppb2026) remain readable but cannot be changed.
-- No rows, cycle assignments, decisions, comments, IDs or audit fields change.
-- Requires migration 006. Do not edit/reapply historical migrations.
\set ON_ERROR_STOP on
BEGIN;

ALTER TABLE mandates_housekeeping.mandate_decisions ALTER COLUMN budget_version
  SET DEFAULT COALESCE(NULLIF(current_setting('app.budget_version', true), ''), 'ppb2027');
ALTER POLICY cycle_read ON mandates_housekeeping.mandate_decisions
  USING (budget_version = COALESCE(NULLIF(current_setting('app.budget_version', true), ''), 'ppb2027'));
ALTER POLICY cycle_insert ON mandates_housekeeping.mandate_decisions
  WITH CHECK (budget_version = 'ppb2027' AND budget_version = COALESCE(NULLIF(current_setting('app.budget_version', true), ''), 'ppb2027'));
ALTER POLICY cycle_update ON mandates_housekeeping.mandate_decisions
  USING (budget_version = 'ppb2027' AND budget_version = COALESCE(NULLIF(current_setting('app.budget_version', true), ''), 'ppb2027'))
  WITH CHECK (budget_version = 'ppb2027' AND budget_version = COALESCE(NULLIF(current_setting('app.budget_version', true), ''), 'ppb2027'));
ALTER POLICY cycle_delete ON mandates_housekeeping.mandate_decisions
  USING (budget_version = 'ppb2027' AND budget_version = COALESCE(NULLIF(current_setting('app.budget_version', true), ''), 'ppb2027'));

ALTER TABLE mandates_housekeeping.mandate_comments ALTER COLUMN budget_version
  SET DEFAULT COALESCE(NULLIF(current_setting('app.budget_version', true), ''), 'ppb2027');
ALTER POLICY cycle_read ON mandates_housekeeping.mandate_comments
  USING (budget_version = COALESCE(NULLIF(current_setting('app.budget_version', true), ''), 'ppb2027'));
ALTER POLICY cycle_insert ON mandates_housekeeping.mandate_comments
  WITH CHECK (budget_version = 'ppb2027' AND budget_version = COALESCE(NULLIF(current_setting('app.budget_version', true), ''), 'ppb2027'));
ALTER POLICY cycle_update ON mandates_housekeeping.mandate_comments
  USING (budget_version = 'ppb2027' AND budget_version = COALESCE(NULLIF(current_setting('app.budget_version', true), ''), 'ppb2027'))
  WITH CHECK (budget_version = 'ppb2027' AND budget_version = COALESCE(NULLIF(current_setting('app.budget_version', true), ''), 'ppb2027'));
ALTER POLICY cycle_delete ON mandates_housekeeping.mandate_comments
  USING (budget_version = 'ppb2027' AND budget_version = COALESCE(NULLIF(current_setting('app.budget_version', true), ''), 'ppb2027'));

ALTER TABLE mandates_housekeeping.entity_review_mode ALTER COLUMN budget_version
  SET DEFAULT COALESCE(NULLIF(current_setting('app.budget_version', true), ''), 'ppb2027');
ALTER POLICY cycle_read ON mandates_housekeeping.entity_review_mode
  USING (budget_version = COALESCE(NULLIF(current_setting('app.budget_version', true), ''), 'ppb2027'));
ALTER POLICY cycle_insert ON mandates_housekeeping.entity_review_mode
  WITH CHECK (budget_version = 'ppb2027' AND budget_version = COALESCE(NULLIF(current_setting('app.budget_version', true), ''), 'ppb2027'));
ALTER POLICY cycle_update ON mandates_housekeeping.entity_review_mode
  USING (budget_version = 'ppb2027' AND budget_version = COALESCE(NULLIF(current_setting('app.budget_version', true), ''), 'ppb2027'))
  WITH CHECK (budget_version = 'ppb2027' AND budget_version = COALESCE(NULLIF(current_setting('app.budget_version', true), ''), 'ppb2027'));
ALTER POLICY cycle_delete ON mandates_housekeeping.entity_review_mode
  USING (budget_version = 'ppb2027' AND budget_version = COALESCE(NULLIF(current_setting('app.budget_version', true), ''), 'ppb2027'));

ALTER TABLE mandates_housekeeping.review_change_responses ALTER COLUMN budget_version
  SET DEFAULT COALESCE(NULLIF(current_setting('app.budget_version', true), ''), 'ppb2027');
ALTER POLICY cycle_read ON mandates_housekeeping.review_change_responses
  USING (budget_version = COALESCE(NULLIF(current_setting('app.budget_version', true), ''), 'ppb2027'));
ALTER POLICY cycle_insert ON mandates_housekeeping.review_change_responses
  WITH CHECK (budget_version = 'ppb2027' AND budget_version = COALESCE(NULLIF(current_setting('app.budget_version', true), ''), 'ppb2027'));
ALTER POLICY cycle_update ON mandates_housekeeping.review_change_responses
  USING (budget_version = 'ppb2027' AND budget_version = COALESCE(NULLIF(current_setting('app.budget_version', true), ''), 'ppb2027'))
  WITH CHECK (budget_version = 'ppb2027' AND budget_version = COALESCE(NULLIF(current_setting('app.budget_version', true), ''), 'ppb2027'));
ALTER POLICY cycle_delete ON mandates_housekeeping.review_change_responses
  USING (budget_version = 'ppb2027' AND budget_version = COALESCE(NULLIF(current_setting('app.budget_version', true), ''), 'ppb2027'));

ALTER TABLE mandates_housekeeping.docx_uploads ALTER COLUMN budget_version
  SET DEFAULT COALESCE(NULLIF(current_setting('app.budget_version', true), ''), 'ppb2027');
ALTER POLICY cycle_read ON mandates_housekeeping.docx_uploads
  USING (budget_version = COALESCE(NULLIF(current_setting('app.budget_version', true), ''), 'ppb2027'));
ALTER POLICY cycle_insert ON mandates_housekeeping.docx_uploads
  WITH CHECK (budget_version = 'ppb2027' AND budget_version = COALESCE(NULLIF(current_setting('app.budget_version', true), ''), 'ppb2027'));
ALTER POLICY cycle_update ON mandates_housekeeping.docx_uploads
  USING (budget_version = 'ppb2027' AND budget_version = COALESCE(NULLIF(current_setting('app.budget_version', true), ''), 'ppb2027'))
  WITH CHECK (budget_version = 'ppb2027' AND budget_version = COALESCE(NULLIF(current_setting('app.budget_version', true), ''), 'ppb2027'));
ALTER POLICY cycle_delete ON mandates_housekeeping.docx_uploads
  USING (budget_version = 'ppb2027' AND budget_version = COALESCE(NULLIF(current_setting('app.budget_version', true), ''), 'ppb2027'));

COMMIT;
