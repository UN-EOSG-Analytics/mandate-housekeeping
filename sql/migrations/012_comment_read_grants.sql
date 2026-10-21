-- Apply as the comment_reads owner (or an administrator) after migration 011.
-- Explicit grants are needed when 011 was applied by a different role than 005:
-- ALTER DEFAULT PRIVILEGES only applies to tables created by its owning role.
-- Forced RLS continues to restrict receipts to the selected cycle and user.
BEGIN;
GRANT SELECT, INSERT ON mandates_housekeeping.comment_reads
  TO mandates_housekeeping_app;
COMMIT;
