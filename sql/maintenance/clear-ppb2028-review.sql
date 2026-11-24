-- psql -X -f sql/maintenance/clear-ppb2028-review.sql
-- Default: read-only preview. Under personal RLS, receipt totals may be hidden.
-- -v rehearsal=1: exercise the cleanup under lock and report exact counts, then roll back.
-- -v expected_rows=N: commit only when the actual total, including cascades, equals N.
\set ON_ERROR_STOP on
\if :{?rehearsal}
\set apply false
\set execute true
\else
\set apply :{?expected_rows}
\set execute :{?expected_rows}
\endif

\if :execute
BEGIN;
SET LOCAL lock_timeout = '5s';
LOCK TABLE mandates_housekeeping.review_change_responses,
           mandates_housekeeping.mandate_decisions,
           mandates_housekeeping.entity_review_mode,
           mandates_housekeeping.mandate_comments,
           mandates_housekeeping.comment_reads IN SHARE ROW EXCLUSIVE MODE;
\else
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
\endif

-- Source cycle ppb2027 supplies submissions FOR PPB 2028.
SET LOCAL row_security = on;
SET LOCAL app.budget_version = 'ppb2027';

SELECT count(*) FILTER (WHERE decision_track = 'entity') AS entity_decisions,
       count(*) FILTER (WHERE decision_track = 'review') AS reviewer_decisions,
       count(*) AS decisions
  FROM mandates_housekeeping.mandate_decisions WHERE budget_version = 'ppb2027' \gset
SELECT count(*) AS comments FROM mandates_housekeeping.mandate_comments WHERE budget_version = 'ppb2027' \gset
SELECT count(*) AS responses FROM mandates_housekeeping.review_change_responses WHERE budget_version = 'ppb2027' \gset
SELECT count(*) FILTER (WHERE ended_at IS NULL) AS active_sessions,
       count(*) FILTER (WHERE ended_at IS NOT NULL) AS ended_sessions
  FROM mandates_housekeeping.entity_review_mode WHERE budget_version = 'ppb2027' \gset
SELECT :decisions::bigint + :comments + :responses + :active_sessions + :ended_sessions AS direct_rows \gset

SELECT :entity_decisions AS entity_decisions, :reviewer_decisions AS reviewer_decisions,
       :comments AS comments, :responses AS change_responses, :active_sessions AS active_sessions,
       :ended_sessions AS ended_sessions, :direct_rows AS direct_rows;

\if :execute
-- These are current-transaction counters, including FK cascades. Require statistics
-- so a disabled counter can never make a partially visible receipt total look exact.
DO $$ BEGIN
  IF NOT current_setting('track_counts')::boolean THEN
    RAISE EXCEPTION 'This cleanup requires track_counts for exact cascade counts';
  END IF;
END $$;

DELETE FROM mandates_housekeeping.review_change_responses WHERE budget_version = 'ppb2027';
DELETE FROM mandates_housekeeping.mandate_decisions WHERE budget_version = 'ppb2027';
-- The composite FK cascades only to receipts for these PPB 2028 comments.
DELETE FROM mandates_housekeeping.mandate_comments WHERE budget_version = 'ppb2027';
DELETE FROM mandates_housekeeping.entity_review_mode WHERE budget_version = 'ppb2027';

SELECT sum(n_tup_del) FILTER (WHERE relname <> 'comment_reads') = :direct_rows AS complete,
       sum(n_tup_del) FILTER (WHERE relname = 'comment_reads') AS receipts,
       sum(n_tup_del) AS total
FROM pg_stat_xact_user_tables
WHERE schemaname = 'mandates_housekeeping' AND relname IN
  ('review_change_responses', 'mandate_decisions', 'mandate_comments', 'entity_review_mode', 'comment_reads') \gset
SELECT :direct_rows AS direct_rows, :receipts AS cascaded_receipts, :total AS total_rows;

\if :complete
\if :apply
SELECT :total::bigint = :'expected_rows'::bigint AS matches_preview \gset
\if :matches_preview
COMMIT;
\echo 'PPB 2028 review cleanup committed.'
\else
ROLLBACK;
DO $$ BEGIN RAISE EXCEPTION 'Actual total differs from expected_rows. All changes rolled back.'; END $$;
\endif
\else
ROLLBACK;
\echo 'Rehearsal complete. All changes rolled back.'
\endif
\else
ROLLBACK;
DO $$ BEGIN RAISE EXCEPTION 'Direct deletes differ from the preview. All changes rolled back.'; END $$;
\endif

\else
SELECT CASE WHEN :comments = 0 THEN 0
            WHEN NOT row_security_active('mandates_housekeeping.comment_reads')
            THEN (SELECT count(*) FROM mandates_housekeeping.comment_reads WHERE budget_version = 'ppb2027')
       END AS receipts \gset
\if :{?receipts}
SELECT :receipts AS cascaded_receipts, :direct_rows::bigint + :receipts AS total_rows;
\else
\echo 'Personal read receipts are filtered by RLS. Use -v rehearsal=1 for the exact total including cascades.'
\endif
ROLLBACK;
\endif
