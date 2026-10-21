-- Apply after migration 010 and before deploying comment notifications.
-- Personal read receipts can be written for archived cycles; comments remain read-only.
BEGIN;
ALTER TABLE mandates_housekeeping.mandate_comments
  ADD CONSTRAINT mandate_comments_id_cycle_unique UNIQUE (id, budget_version);
CREATE TABLE mandates_housekeeping.comment_reads (
  comment_id uuid NOT NULL,
  budget_version text NOT NULL CHECK (budget_version IN ('ppb2026', 'ppb2027')),
  user_email text NOT NULL REFERENCES mandates_housekeeping.users(email) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_email, budget_version, comment_id),
  FOREIGN KEY (comment_id, budget_version)
    REFERENCES mandates_housekeeping.mandate_comments(id, budget_version) ON DELETE CASCADE
);
CREATE INDEX idx_mandate_comments_conversation
  ON mandates_housekeeping.mandate_comments(budget_version, document_symbol, created_at DESC, id DESC);
ALTER TABLE mandates_housekeeping.comment_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE mandates_housekeeping.comment_reads FORCE ROW LEVEL SECURITY;
-- Every action sets app.user_email locally from the authenticated session.
CREATE POLICY personal_cycle_read ON mandates_housekeeping.comment_reads FOR SELECT
  USING (budget_version = current_setting('app.budget_version', true)
    AND user_email = current_setting('app.user_email', true));
CREATE POLICY personal_cycle_insert ON mandates_housekeeping.comment_reads FOR INSERT
  WITH CHECK (budget_version = current_setting('app.budget_version', true)
    AND user_email = current_setting('app.user_email', true));
COMMIT;
