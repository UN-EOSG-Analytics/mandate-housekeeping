-- MANUAL APPLY ONLY. Run BEFORE deploying the new reader.
\set ON_ERROR_STOP on
BEGIN;
-- Immutable compatibility floor: resolved legacy fields and DGACM bracket titles.
-- No review history or provenance is rewritten. Refreshing registry metadata never
-- erases a field the original review could resolve. This is not an add-search catalogue.
CREATE TABLE mandates_housekeeping.document_metadata_fallback (
 symbol text PRIMARY KEY,
 symbol_normalized text NOT NULL,
 title text,
 year integer,
 body text,
 doc_type text,
 link text,
 has_db_metadata boolean NOT NULL,
 export_bracket_title text
);
CREATE INDEX document_metadata_fallback_normalized_idx
 ON mandates_housekeeping.document_metadata_fallback (symbol_normalized);
GRANT SELECT ON mandates_housekeeping.document_metadata_fallback TO mandates_housekeeping_app;
-- Reference data cannot be edited through the app's blanket DML grants.
REVOKE INSERT, UPDATE, DELETE ON mandates_housekeeping.document_metadata_fallback FROM mandates_housekeeping_app;

INSERT INTO mandates_housekeeping.document_metadata_fallback
SELECT sd.ppb_full_document_symbol,
 upper(regexp_replace(sd.ppb_full_document_symbol, '[[:space:]]', '', 'g')),
 COALESCE(NULLIF(trim(regexp_replace(doc.proper_title, '\s*:\s*$', '')), ''), m.title, m.proper_title, sd.ppb_description),
 COALESCE(doc.date_year, m.date_year::integer, sd.ppb_year),
 COALESCE(NULLIF(doc.issuing_body,''), NULLIF(m.issuing_body,''), sd.ppb_body),
 COALESCE(NULLIF(doc.document_type,''), NULLIF(m.document_type,''), sd.ppb_type),
 CASE WHEN doc.proper_title IS NOT NULL OR m.title IS NOT NULL OR m.proper_title IS NOT NULL
      THEN 'https://docs.un.org/en/' || upper(sd.ppb_full_document_symbol) ELSE sd.ppb_link END,
 (doc.proper_title IS NOT NULL OR m.title IS NOT NULL OR m.proper_title IS NOT NULL),
 m.title
FROM ppb2026.source_documents sd
LEFT JOIN public.documents doc ON regexp_replace(sd.ppb_full_document_symbol, '(\d) ([A-Z])$', '\1\2') = doc.symbol
LEFT JOIN ppb2026.source_documents_metadata_clean m ON m.ppb_full_document_symbol = sd.ppb_full_document_symbol;
INSERT INTO mandates_housekeeping.document_metadata_fallback
SELECT doc.symbol, upper(regexp_replace(doc.symbol, '[[:space:]]', '', 'g')),
 NULLIF(trim(regexp_replace(doc.proper_title, '\s*:\s*$', '')), ''), doc.date_year,
 doc.issuing_body, doc.document_type,
 CASE WHEN doc.proper_title IS NOT NULL THEN 'https://docs.un.org/en/' || upper(doc.symbol) END,
 doc.proper_title IS NOT NULL, NULL
FROM public.documents doc
ON CONFLICT (symbol) DO NOTHING;
COMMIT;
