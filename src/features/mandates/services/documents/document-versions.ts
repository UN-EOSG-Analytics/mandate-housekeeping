/** Series candidates for explicit reviewer consideration; never legal supersession.
 * Collections do not establish a version sequence. Issuer and document type are
 * part of the series key. Whitespace aliases cannot merge distinct issuers.
 */
import { query, type TransactionQueryFn } from "@/lib/db/db";
import { normalizeSymbol, cleanTitle } from "./metadata";

export interface DocumentVersion {
  symbol: string;
  title: string | null;
  year: number;
  body: string | null;
}
export interface SeriesCandidate extends DocumentVersion {
  currentSymbol: string;
  currentYear: number;
}

export async function fetchSeriesCandidates(
  symbols: string[],
  options: { newerOnly?: boolean; runQuery?: TransactionQueryFn } = {},
): Promise<SeriesCandidate[]> {
  if (!symbols.length) return [];
  return (options.runQuery ?? query)<SeriesCandidate>(
    `
    WITH requested AS (SELECT DISTINCT unnest($1::text[]) AS symbol), matches AS (
      SELECT r.symbol, s.series_key, s.un_body, s.doc_type, s.year,
             s.is_collection, s.is_informative
      FROM requested r
      JOIN digitallibrary.resolution_series s
        ON upper(regexp_replace(s.document_symbol, '[[:space:]]', '', 'g')) =
           upper(regexp_replace(r.symbol, '[[:space:]]', '', 'g'))
    ), current_docs AS (
      SELECT symbol, min(series_key) AS series_key, min(un_body) AS un_body,
             min(doc_type) AS doc_type, min(year) AS year
      FROM matches
      GROUP BY symbol
      HAVING count(DISTINCT (series_key, un_body, doc_type, year)) = 1
         AND bool_and(NOT is_collection AND is_informative)
    )
    SELECT DISTINCT c.symbol AS "currentSymbol", c.year AS "currentYear",
      s.document_symbol AS symbol, coalesce(d.display_title, d.title) AS title,
      s.year, s.un_body AS body
    FROM current_docs c
    JOIN digitallibrary.resolution_series s
      ON (s.series_key, s.un_body, s.doc_type) = (c.series_key, c.un_body, c.doc_type)
    JOIN digitallibrary.documents d ON d.recid = s.recid AND d.deleted_at IS NULL
    WHERE NOT s.is_collection AND s.is_informative AND s.year > 0
      ${options.newerOnly ? "AND s.year > c.year" : ""}
    ORDER BY "currentSymbol", year, symbol
  `,
    [symbols],
  );
}

export async function fetchAllVersions(
  symbol: string,
): Promise<DocumentVersion[]> {
  const rows = await fetchSeriesCandidates([symbol]);
  const unique = new Map<string, DocumentVersion>();
  for (const row of rows)
    unique.set(normalizeSymbol(row.symbol), {
      symbol: row.symbol,
      title: cleanTitle(row.title),
      year: row.year,
      body: row.body,
    });
  return [...unique.values()];
}
