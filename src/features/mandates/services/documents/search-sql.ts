/** Separate branches let the planner use symbol and title indexes independently. */
const columns = `ppb_full_document_symbol AS symbol, display_title AS title,
  ppb_type AS type, ppb_year AS year, ppb_body AS body`;
/** A catalogue entry must have a live Digital Library record, even if already cited. */
const digitalLibraryMembership = `EXISTS (
        SELECT 1
        FROM digitallibrary.documents dl
        WHERE dl.symbol_normalized = upper(regexp_replace(u.ppb_full_document_symbol, '[[:space:]]', '', 'g'))
          AND dl.deleted_at IS NULL
      )`;
export const SYMBOL_SEARCH_SQL = `
  WITH matches AS (
    SELECT DISTINCT ON (ppb_full_document_symbol) ${columns}
    FROM public.unified_documents u
    WHERE ppb_full_document_symbol ILIKE $1
      AND ppb_full_document_symbol !~ '^[0-9]+/[0-9]+$'
      AND ${digitalLibraryMembership}
    ORDER BY ppb_full_document_symbol, is_ppb DESC, display_title NULLS LAST, ppb_year DESC NULLS LAST
  )
  SELECT * FROM matches
  ORDER BY CASE WHEN upper(symbol) = $2 THEN 0 ELSE 1 END,
    length(symbol), year DESC NULLS LAST, symbol
  LIMIT $3`;
export const TITLE_SEARCH_SQL = `
  WITH matches AS (
    SELECT DISTINCT ON (ppb_full_document_symbol) ${columns}
    FROM public.unified_documents u
    WHERE display_title ILIKE $1
      AND ppb_full_document_symbol NOT ILIKE $2
      AND ppb_full_document_symbol !~ '^[0-9]+/[0-9]+$'
      AND ${digitalLibraryMembership}
    ORDER BY ppb_full_document_symbol, is_ppb DESC, display_title NULLS LAST, ppb_year DESC NULLS LAST
  )
  SELECT * FROM matches ORDER BY length(symbol), year DESC NULLS LAST, symbol
  LIMIT $3`;

/** SQL LIKE metacharacters in user input are literal search characters. */
export function literalSearchPattern(text: string): string {
  return text.replace(/[\\%_]/g, "\\$&");
}
