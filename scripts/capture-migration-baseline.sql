\set ON_ERROR_STOP on
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT jsonb_build_object(
 'captured_at', now(), 'database', current_database(), 'role', current_user,
 'citations', (SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM ppb2026.source_document_citations c),
 'decisions', (SELECT jsonb_agg(to_jsonb(d) ORDER BY id) FROM mandates_housekeeping.mandate_decisions d),
 'comments', (SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM mandates_housekeeping.mandate_comments c),
 'sessions', (SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM mandates_housekeeping.entity_review_mode r),
 'responses', (SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM mandates_housekeeping.review_change_responses r),
 'uploads', (SELECT jsonb_agg(to_jsonb(u) ORDER BY id) FROM mandates_housekeeping.docx_uploads u),
 'effective_decisions', (SELECT jsonb_agg(to_jsonb(d)) FROM (
   SELECT DISTINCT ON (entity, document_symbol, coalesce(subprogramme,'')) *
   FROM mandates_housekeeping.mandate_decisions
   ORDER BY entity, document_symbol, coalesce(subprogramme,''), created_at DESC, id DESC
 ) d),
 'columns', (SELECT jsonb_agg(to_jsonb(c)) FROM information_schema.columns c WHERE table_schema IN ('mandates_housekeeping','ppb2026')),
 'grants', (SELECT jsonb_object_agg(n.nspname||'.'||c.relname,has_table_privilege(current_user,c.oid,'SELECT')) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE (n.nspname='digitallibrary' AND c.relname IN ('documents','resolution_series','document_paragraphs','document_files','document_parses')) OR (n.nspname='public' AND c.relname='unified_documents'))
);
COMMIT;
