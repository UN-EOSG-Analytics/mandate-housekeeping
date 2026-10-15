/** Current registry metadata with a frozen compatibility floor for legacy review fields.
 * The compatibility table is seeded once by migration 008; legacy catalogues are
 * never queried at runtime. Manual review metadata remains an explicit override.
 */
import { query } from "@/lib/db/db";

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
): Promise<Record<string, DocumentMetadata | null>> {
  if (!symbols.length) return {};
  const rows = await query<ResolvedMetadata & { symbol: string }>(
    `
    WITH requested AS (SELECT DISTINCT unnest($1::text[]) AS symbol)
    SELECT r.symbol,
      COALESCE(NULLIF(trim(u.display_title), ''), NULLIF(trim(u.ppb_description), ''), f.title) AS title,
      COALESCE(u.ppb_year, f.year) AS year,
      COALESCE(NULLIF(u.ppb_body, ''), f.body) AS body,
      COALESCE(NULLIF(u.ppb_type, ''), f.doc_type) AS "docType",
      COALESCE(NULLIF(u.ppb_link, ''), f.link,
        CASE WHEN u.is_catalog_pattern THEN 'https://docs.un.org/en/' || r.symbol END) AS link,
      (u.ppb_full_document_symbol IS NOT NULL OR COALESCE(f.has_db_metadata, false)) AS "hasDbMetadata"
    FROM requested r
    LEFT JOIN LATERAL (
      SELECT candidates.* FROM (
        SELECT d.*, count(*) OVER () AS matches
        FROM public.unified_documents d
        WHERE upper(regexp_replace(d.ppb_full_document_symbol, '[[:space:]]', '', 'g')) =
              upper(regexp_replace(r.symbol, '[[:space:]]', '', 'g'))
      ) candidates
      WHERE candidates.ppb_full_document_symbol = r.symbol OR candidates.matches = 1
      ORDER BY (candidates.ppb_full_document_symbol = r.symbol) DESC
      LIMIT 1
    ) u ON true
    LEFT JOIN LATERAL (
      SELECT candidates.* FROM (
        SELECT d.*, count(*) OVER () AS matches
        FROM mandates_housekeeping.document_metadata_fallback d
        WHERE d.symbol_normalized = upper(regexp_replace(r.symbol, '[[:space:]]', '', 'g'))
      ) candidates
      WHERE candidates.symbol = r.symbol OR candidates.matches = 1
      ORDER BY (candidates.symbol = r.symbol) DESC
      LIMIT 1
    ) f ON true
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
