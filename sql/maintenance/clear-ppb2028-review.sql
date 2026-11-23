-- Run with psql -X -f sql/maintenance/clear-ppb2028-review.sql to preview.
-- To apply, repeat with -v expected_rows=N using the PPB 2028 total below.
-- For an exact count of all personal read receipts, use a maintenance role
-- with full visibility (including BYPASSRLS on tables with forced RLS).
\set ON_ERROR_STOP on
\if :{?expected_rows}
BEGIN;
SET LOCAL lock_timeout = '5s';
-- Stabilize the preview through commit while allowing ordinary reads.
LOCK TABLE mandates_housekeeping.review_change_responses,
           mandates_housekeeping.mandate_decisions,
           mandates_housekeeping.entity_review_mode,
           mandates_housekeeping.mandate_comments,
           mandates_housekeeping.comment_reads IN SHARE ROW EXCLUSIVE MODE;
\else
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
\endif

-- Fail on partially visible counts. This setting does not grant privileges.
SET LOCAL row_security = off;
SET LOCAL app.budget_version = 'ppb2027';

-- PPB labels refer to submission year. Database keys refer to source year.
WITH activity AS (
  SELECT budget_version, 'Entity decision events' AS kind
    FROM mandates_housekeeping.mandate_decisions WHERE decision_track = 'entity'
  UNION ALL
  SELECT budget_version, 'Reviewer decision events'
    FROM mandates_housekeeping.mandate_decisions WHERE decision_track = 'review'
  UNION ALL
  SELECT budget_version, 'Comments' FROM mandates_housekeeping.mandate_comments
  UNION ALL
  SELECT budget_version, 'Comment read receipts' FROM mandates_housekeeping.comment_reads
  UNION ALL
  SELECT budget_version, 'Review change responses' FROM mandates_housekeeping.review_change_responses
  UNION ALL
  SELECT budget_version, 'Active review sessions' FROM mandates_housekeeping.entity_review_mode WHERE ended_at IS NULL
  UNION ALL
  SELECT budget_version, 'Ended review sessions' FROM mandates_housekeeping.entity_review_mode WHERE ended_at IS NOT NULL
), kinds(kind) AS (
  VALUES ('Entity decision events'), ('Reviewer decision events'), ('Comments'),
         ('Comment read receipts'), ('Review change responses'),
         ('Active review sessions'), ('Ended review sessions')
)
SELECT COALESCE(k.kind, 'TOTAL') AS activity,
       count(*) FILTER (WHERE a.budget_version = 'ppb2027') AS ppb2028_to_delete,
       count(*) FILTER (WHERE a.budget_version = 'ppb2026') AS ppb2027_preserved
FROM kinds k LEFT JOIN activity a USING (kind)
GROUP BY ROLLUP(k.kind)
ORDER BY grouping(k.kind), k.kind;

\if :{?expected_rows}
-- 'ppb2027' below always means submissions FOR PPB 2028.
WITH counts(n) AS (
  SELECT count(*) FROM mandates_housekeeping.mandate_decisions WHERE budget_version = 'ppb2027'
  UNION ALL SELECT count(*) FROM mandates_housekeeping.mandate_comments WHERE budget_version = 'ppb2027'
  UNION ALL SELECT count(*) FROM mandates_housekeeping.comment_reads WHERE budget_version = 'ppb2027'
  UNION ALL SELECT count(*) FROM mandates_housekeeping.review_change_responses WHERE budget_version = 'ppb2027'
  UNION ALL SELECT count(*) FROM mandates_housekeeping.entity_review_mode WHERE budget_version = 'ppb2027'
)
SELECT sum(n) = :'expected_rows'::bigint AS matches_preview FROM counts \gset
\if :matches_preview
DELETE FROM mandates_housekeeping.review_change_responses WHERE budget_version = 'ppb2027';
DELETE FROM mandates_housekeeping.mandate_decisions WHERE budget_version = 'ppb2027';
-- The composite (comment_id, budget_version) FK cascades to matching receipts.
DELETE FROM mandates_housekeeping.mandate_comments WHERE budget_version = 'ppb2027';
DELETE FROM mandates_housekeeping.entity_review_mode WHERE budget_version = 'ppb2027';
COMMIT;
\else
ROLLBACK;
\echo 'Count differs from expected_rows. Cleanup rolled back. Preview again.'
\endif
\else
ROLLBACK;
\echo 'Read-only preview complete.'
\endif
