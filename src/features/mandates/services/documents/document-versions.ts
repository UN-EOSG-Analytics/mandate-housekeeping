/** Series candidates for explicit reviewer consideration; never legal supersession.
 * Collections do not establish a version sequence. Issuer and document type are
 * part of the series key. Whitespace aliases cannot merge distinct issuers.
 */
import { query, type TransactionQueryFn } from "@/lib/db/db";
import { normalizeSymbol, cleanTitle } from "./metadata";
import {
  documentSeriesIdentity,
  sameDocumentSeriesIdentity,
} from "./series-identity";

export interface DocumentVersion {
  symbol: string;
  title: string | null;
  year: number;
  body: string | null;
}
export interface SeriesCandidate extends DocumentVersion {
  currentSymbol: string;
  currentYear: number;
  docType: string;
}

export async function fetchSeriesCandidates(
  symbols: string[],
  options: { newerOnly?: boolean; runQuery?: TransactionQueryFn } = {},
): Promise<SeriesCandidate[]> {
  if (!symbols.length) return [];
  const rows = await (options.runQuery ?? query)<SeriesCandidate>(
    `
    WITH requested AS (SELECT DISTINCT unnest($1::text[]) AS symbol), matches AS (
      SELECT r.symbol, s.series_key, s.un_body, s.doc_type, s.year,
             s.is_collection, s.is_informative
      FROM requested r
      JOIN digitallibrary.resolution_series s
        ON upper(regexp_replace(s.document_symbol, '[[:space:]]', '', 'g')) =
           upper(regexp_replace(r.symbol, '[[:space:]]', '', 'g'))
      JOIN digitallibrary.documents d ON d.recid = s.recid AND d.deleted_at IS NULL
    ), current_docs AS (
      SELECT symbol, min(series_key) AS series_key, min(un_body) AS un_body,
             min(doc_type) AS doc_type, min(year) AS year
      FROM matches
      GROUP BY symbol
      HAVING count(DISTINCT (series_key, un_body, doc_type, year)) = 1
         AND bool_and(NOT is_collection AND is_informative)
         AND min(year) > 0
    ), candidates AS MATERIALIZED (
      SELECT c.symbol AS "currentSymbol", c.year AS "currentYear", s.*,
             upper(regexp_replace(s.document_symbol, '[[:space:]]', '', 'g')) AS symbol_key
      FROM current_docs c
      JOIN digitallibrary.resolution_series s
        ON (s.series_key, s.un_body, s.doc_type) = (c.series_key, c.un_body, c.doc_type)
      WHERE NOT s.is_collection AND s.is_informative AND s.year > 0
        ${options.newerOnly ? "AND s.year > c.year" : ""}
    ), unambiguous_candidates AS (
      SELECT upper(regexp_replace(s.document_symbol, '[[:space:]]', '', 'g')) AS symbol_key
      FROM digitallibrary.resolution_series s
      JOIN digitallibrary.documents d ON d.recid = s.recid AND d.deleted_at IS NULL
      WHERE upper(regexp_replace(s.document_symbol, '[[:space:]]', '', 'g')) IN (SELECT symbol_key FROM candidates)
      GROUP BY 1
      HAVING count(DISTINCT (s.series_key, s.un_body, s.doc_type, s.year)) = 1
         AND bool_and(NOT s.is_collection AND s.is_informative)
    )
    SELECT DISTINCT s."currentSymbol", s."currentYear",
      s.document_symbol AS symbol, coalesce(d.display_title, d.title) AS title,
      s.year, s.un_body AS body, s.doc_type AS "docType"
    FROM candidates s
    JOIN unambiguous_candidates a ON a.symbol_key = s.symbol_key
    JOIN digitallibrary.documents d ON d.recid = s.recid AND d.deleted_at IS NULL
    ORDER BY "currentSymbol", year, symbol
  `,
    [symbols],
  );
  const unique = new Map<string, SeriesCandidate>();
  const ambiguous = new Set<string>();
  for (const row of rows) {
    const identity = documentSeriesIdentity(row.currentSymbol);
    if (
      !identity ||
      !sameDocumentSeriesIdentity(row.currentSymbol, row.symbol) ||
      identity.kind !== row.docType ||
      !Number.isInteger(row.currentYear) ||
      !Number.isInteger(row.year) ||
      row.currentYear <= 0 ||
      row.year <= 0 ||
      (options.newerOnly && row.year <= row.currentYear)
    )
      continue;
    const symbol = normalizeSymbol(row.symbol);
    const key = JSON.stringify([row.currentSymbol, symbol]);
    const previous = unique.get(key);
    if (
      previous &&
      (previous.year !== row.year ||
        previous.currentYear !== row.currentYear ||
        previous.body !== row.body)
    )
      ambiguous.add(key);
    if (!previous) unique.set(key, row);
  }
  for (const key of ambiguous) unique.delete(key);
  return [...unique.values()].sort(
    (a, b) =>
      a.currentSymbol.localeCompare(b.currentSymbol) ||
      a.year - b.year ||
      a.symbol.localeCompare(b.symbol),
  );
}

/** Strictly later, issuer/type-safe documents in the same catalogue series. */
export async function fetchLaterVersions(
  symbol: string,
): Promise<DocumentVersion[]> {
  return (await fetchSeriesCandidates([symbol], { newerOnly: true })).map(
    (row) => ({
      symbol: row.symbol,
      title: cleanTitle(row.title),
      year: row.year,
      body: row.body,
    }),
  );
}
