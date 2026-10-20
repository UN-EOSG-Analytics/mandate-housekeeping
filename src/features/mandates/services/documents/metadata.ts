/** Current registry metadata with a frozen compatibility floor for legacy review fields.
 * The compatibility table is seeded once by migration 008; legacy catalogues are
 * never queried at runtime. Manual review metadata remains an explicit override.
 */
import { query, type TransactionQueryFn } from "@/lib/db/db";

export interface DocumentMetadata {
  title: string | null;
  year: number | null;
  body: string | null;
  docType: string | null;
  link: string | null;
  hasDbMetadata?: boolean;
}
export interface ResolvedMetadata extends DocumentMetadata {
  hasDbMetadata: boolean;
}

export function cleanTitle(title: string | null): string | null {
  return title?.replace(/\s*:\s*$/, "").trim() || null;
}

/** Whitespace aliases only: never infer an issuer from a numeric tail. */
export function normalizeSymbol(symbol: string): string {
  return symbol.replace(/\s/g, "").toUpperCase();
}

export function buildPlaceholders(count: number, offset = 1): string {
  return Array.from({ length: count }, (_, i) => `$${i + offset}`).join(",");
}

export async function fetchDocumentMetadata(
  symbols: string[],
  runQuery: TransactionQueryFn = query,
): Promise<Record<string, DocumentMetadata | null>> {
  if (!symbols.length) return {};
  const rows = await runQuery<ResolvedMetadata & { symbol: string }>(
    `
    WITH requested AS MATERIALIZED (
      SELECT DISTINCT symbol, upper(regexp_replace(symbol, '[[:space:]]', '', 'g')) AS normalized_key
      FROM unnest($1::text[]) AS symbol
    ), catalogue_keys AS NOT MATERIALIZED (
      -- Inline the scan so only requested catalogue rows are materialized below.
      SELECT d.*, upper(regexp_replace(d.ppb_full_document_symbol, '[[:space:]]', '', 'g')) AS normalized_key
      FROM public.unified_documents d
    ), catalogue AS MATERIALIZED (
      SELECT d.*, count(*) OVER (PARTITION BY normalized_key) AS matches,
        row_number() OVER (PARTITION BY ppb_full_document_symbol ORDER BY
          is_ppb DESC, display_title NULLS LAST, ppb_description NULLS LAST,
          ppb_year DESC NULLS LAST, ppb_body NULLS LAST, ppb_type NULLS LAST,
          ppb_link NULLS LAST) AS exact_rank
      FROM catalogue_keys d
      WHERE normalized_key IN (SELECT normalized_key FROM requested)
    ), fallback AS MATERIALIZED (
      SELECT d.*, count(*) OVER (PARTITION BY symbol_normalized) AS matches
      FROM mandates_housekeeping.document_metadata_fallback d
      WHERE symbol_normalized IN (SELECT normalized_key FROM requested)
    )
    SELECT r.symbol,
      COALESCE(NULLIF(trim(u.display_title), ''), NULLIF(trim(u.ppb_description), ''), f.title) AS title,
      COALESCE(u.ppb_year, f.year) AS year,
      COALESCE(NULLIF(u.ppb_body, ''), f.body) AS body,
      COALESCE(NULLIF(u.ppb_type, ''), f.doc_type) AS "docType",
      COALESCE(NULLIF(u.ppb_link, ''), f.link,
        CASE WHEN u.is_catalog_pattern THEN 'https://docs.un.org/en/' || r.symbol END) AS link,
      (u.ppb_full_document_symbol IS NOT NULL OR COALESCE(f.has_db_metadata, false)) AS "hasDbMetadata"
    FROM requested r
    LEFT JOIN catalogue u ON u.normalized_key = r.normalized_key AND u.exact_rank = 1
      AND (u.ppb_full_document_symbol = r.symbol OR u.matches = 1)
    LEFT JOIN fallback f ON f.symbol_normalized = r.normalized_key
      AND (f.symbol = r.symbol OR f.matches = 1)
  `,
    [symbols],
  );
  return Object.fromEntries(
    rows.map((row) => [
      row.symbol,
      row.title !== null ||
      row.year !== null ||
      row.body !== null ||
      row.docType !== null ||
      row.link !== null
        ? row
        : null,
    ]),
  );
}
