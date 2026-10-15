-- MANUAL APPLY ONLY.
\set ON_ERROR_STOP on
BEGIN;
-- Runtime dependencies only; no legacy mandates.* fulltext reader remains.
GRANT USAGE ON SCHEMA digitallibrary TO mandates_housekeeping_app;
GRANT SELECT ON public.unified_documents,
 digitallibrary.documents, digitallibrary.resolution_series,
 digitallibrary.document_paragraphs, digitallibrary.document_files,
 digitallibrary.document_parses TO mandates_housekeeping_app;
COMMIT;
