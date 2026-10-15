-- Dedicated database role for the mandates-housekeeping app.
--
-- The app (Next.js on Vercel, see src/lib/db/db.ts) should connect via
-- DATABASE_URL using this role instead of the server admin account.
--
-- Privilege profile (least privilege, derived from actual app queries):
--   mandates_housekeeping  read/write (app's own schema)
--   ppb2026                read-only  (budget documents, citations)
--   systemchart.entities   read-only  (canonical entity list)
--   public.documents       read-only
--   public.issuing_bodies  read-only
--
-- The role deliberately has NO ddl rights (no CREATE on any schema):
-- migrations keep running as the admin/owner role, not as the app.
--
-- The password is not stored in this file. Provide it at execution time:
--   psql -v app_password='<secret>' -f sql/schema/app_role.sql

create role mandates_housekeeping_app login password :'app_password';

comment on role mandates_housekeeping_app is 'Application role for the mandates-housekeeping app (read/write on mandates_housekeeping, read-only elsewhere). No DDL rights.';

-- Schema access
grant usage on schema mandates_housekeeping to mandates_housekeeping_app;
grant usage on schema ppb2026 to mandates_housekeeping_app;
grant usage on schema systemchart to mandates_housekeeping_app;
grant usage on schema public to mandates_housekeeping_app;

-- App's own schema: full DML
grant select, insert, update, delete on all tables in schema mandates_housekeeping to mandates_housekeeping_app;
grant usage, select on all sequences in schema mandates_housekeeping to mandates_housekeeping_app;

-- Read-only dependencies
grant select on all tables in schema ppb2026 to mandates_housekeeping_app;
grant select on systemchart.entities to mandates_housekeeping_app;
grant select on public.unified_documents to mandates_housekeeping_app;
grant select on public.issuing_bodies to mandates_housekeeping_app;

-- Future objects created by the role running migrations (i.e. the role
-- executing this script) are granted automatically, so tables added by
-- later migrations don't silently break for the app.
alter default privileges in schema mandates_housekeeping
    grant select, insert, update, delete on tables to mandates_housekeeping_app;
alter default privileges in schema mandates_housekeeping
    grant usage, select on sequences to mandates_housekeeping_app;
alter default privileges in schema ppb2026
    grant select on tables to mandates_housekeeping_app;

-- Runtime dependencies only; no legacy mandates.* fulltext reader remains.
GRANT USAGE ON SCHEMA digitallibrary TO mandates_housekeeping_app;
GRANT SELECT ON public.unified_documents,
 digitallibrary.documents, digitallibrary.resolution_series,
 digitallibrary.document_paragraphs, digitallibrary.document_files,
 digitallibrary.document_parses TO mandates_housekeeping_app;

-- Compatibility metadata is read-only, including after blanket/default grants.
REVOKE INSERT, UPDATE, DELETE ON mandates_housekeeping.document_metadata_fallback FROM mandates_housekeeping_app;
