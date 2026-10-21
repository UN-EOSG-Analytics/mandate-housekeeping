-- Apply after 009_activate_ppb2028_submissions.sql, before deploying the two-column application.
-- Existing events remain entity submissions, regardless of author/session/approval.
BEGIN;
-- Fail without altering historical sessions if existing data needs reconciliation.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM mandates_housekeeping.entity_review_mode
    WHERE ended_at IS NULL GROUP BY budget_version, entity HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Multiple active review sessions exist for an entity/cycle. Reconcile them explicitly before applying migration 010.';
  END IF;
END $$;
ALTER TABLE mandates_housekeeping.mandate_decisions
  ADD COLUMN decision_track text NOT NULL DEFAULT 'entity'
    CHECK (decision_track IN ('entity', 'review')),
  ADD COLUMN reviewed_submission_id uuid,
  ADD CONSTRAINT review_submission_same_cycle_fk
    FOREIGN KEY (reviewed_submission_id, budget_version)
    REFERENCES mandates_housekeeping.mandate_decisions (id, budget_version),
  ADD CONSTRAINT entity_has_no_review_reference
    CHECK (decision_track = 'review' OR reviewed_submission_id IS NULL);
CREATE INDEX idx_mandate_decisions_track_latest
  ON mandates_housekeeping.mandate_decisions
  (budget_version, entity, document_symbol, COALESCE(subprogramme, ''), decision_track, created_at DESC, id DESC);
-- A cycle can have only one active review session per entity.
CREATE UNIQUE INDEX idx_entity_review_mode_one_active
  ON mandates_housekeeping.entity_review_mode (budget_version, entity)
  WHERE ended_at IS NULL;
COMMIT;
