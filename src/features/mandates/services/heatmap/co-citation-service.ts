/**
 * Entity × Entity co-citation matrix service.
 *
 * For a budget version, computes how many distinct document symbols (mandates)
 * each pair of entities BOTH cite — the data behind the appendix heatmap in
 * docs/UN_MIR_2025_2144.pdf (p.42).
 *
 * A pair's "shared" count = |symbols(entity A) ∩ symbols(entity B)| within the
 * version. The diagonal (an entity with itself) is each entity's own distinct
 * symbol count and is reported separately via `totals` (rendered blank in the
 * matrix). Symbols are normalized the same way as
 * services/documents/metadata.ts so spacing variants match.
 */

import { query } from "@/lib/db/db";
import {
  type BudgetVersion,
  versionPredicateSqlFor,
  excludePlanOutlineSql,
} from "@/lib/db/budget-version";
import {
  pairKey,
  type MatrixData,
} from "@/features/mandates/heatmap/matrix-utils";

export { pairKey, type MatrixData };

interface PairRow {
  e1: string;
  e2: string;
  shared: number;
}
interface TotalRow {
  entity: string;
  total: number;
}

/** Normalized (entity, symbol) source rows for the raw current/comparison cycle. */
function entSymCte(version: BudgetVersion): string {
  return `ent_sym AS (
    SELECT DISTINCT c.entity,
           REGEXP_REPLACE(c.ppb_full_document_symbol, '(\\d) ([A-Z])$', '\\1\\2') AS symbol
    FROM ppb2026.source_document_citations c
    WHERE c.entity IS NOT NULL AND c.entity != 'NA'
      AND ${versionPredicateSqlFor("c", version)}
      AND ${excludePlanOutlineSql("c")}
  )`;
}

/**
 * Projected (entity, symbol) rows = raw ppb2026 minus latest `remove`
 * decisions plus latest `add` decisions (entity, new mandate). `update` keeps
 * the citation (symbol change is not modelled here). One layer to experiment
 * with as an "improvement" metric.
 */
function projectedEntSymCte(): string {
  return `latest_decisions AS (
    SELECT DISTINCT ON (document_symbol, entity, COALESCE(subprogramme, ''))
      document_symbol, entity, decision, new_symbol
    FROM mandates_housekeeping.mandate_decisions
    WHERE entity IS NOT NULL AND entity != 'NA'
    ORDER BY document_symbol, entity, COALESCE(subprogramme, ''), created_at DESC
  ),
  base AS (
    SELECT DISTINCT c.entity,
           REGEXP_REPLACE(c.ppb_full_document_symbol, '(\\d) ([A-Z])$', '\\1\\2') AS symbol
    FROM ppb2026.source_document_citations c
    WHERE c.entity IS NOT NULL AND c.entity != 'NA'
      AND ${versionPredicateSqlFor("c", "ppb2026")}
      AND ${excludePlanOutlineSql("c")}
  ),
  retained AS (
    SELECT b.entity, b.symbol
    FROM base b
    WHERE NOT EXISTS (
      SELECT 1 FROM latest_decisions d
      WHERE d.entity = b.entity
        AND REGEXP_REPLACE(d.document_symbol, '(\\d) ([A-Z])$', '\\1\\2') = b.symbol
        AND d.decision = 'remove'
    )
  ),
  added AS (
    SELECT entity,
           REGEXP_REPLACE(COALESCE(new_symbol, document_symbol), '(\\d) ([A-Z])$', '\\1\\2') AS symbol
    FROM latest_decisions
    WHERE decision = 'add'
  ),
  ent_sym AS (
    SELECT entity, symbol FROM retained
    UNION
    SELECT entity, symbol FROM added
  )`;
}

async function runMatrix(
  entSym: string,
  version?: BudgetVersion,
): Promise<MatrixData> {
  const pairRows = await query<PairRow>(
    `WITH ${entSym}
     SELECT a.entity AS e1, b.entity AS e2, COUNT(*)::int AS shared
     FROM ent_sym a
     JOIN ent_sym b ON a.symbol = b.symbol AND a.entity < b.entity
     GROUP BY a.entity, b.entity`,
    [],
    version,
  );
  const totalRows = await query<TotalRow>(
    `WITH ${entSym}
     SELECT entity, COUNT(*)::int AS total
     FROM ent_sym
     GROUP BY entity`,
    [],
    version,
  );

  const pairs: Record<string, number> = {};
  for (const r of pairRows) pairs[pairKey(r.e1, r.e2)] = r.shared;

  const totals: Record<string, number> = {};
  for (const r of totalRows) totals[r.entity] = r.total;

  return { entities: Object.keys(totals).sort(), pairs, totals };
}

/** Raw co-citation matrix for a single budget version. */
export function fetchVersionMatrix(
  version: BudgetVersion,
): Promise<MatrixData> {
  return runMatrix(entSymCte(version));
}

/** ppb2026 matrix after applying the latest housekeeping decisions. */
export function fetchProjectedMatrix(): Promise<MatrixData> {
  return runMatrix(projectedEntSymCte(), "ppb2026");
}

/**
 * Signed difference `b − a` over the union of both pair sets. Positive =
 * overlap grew, negative = overlap shrank (cleaner). Totals are differenced too.
 */
export function diffMatrix(a: MatrixData, b: MatrixData): MatrixData {
  const pairs: Record<string, number> = {};
  for (const k of new Set([...Object.keys(a.pairs), ...Object.keys(b.pairs)])) {
    pairs[k] = (b.pairs[k] ?? 0) - (a.pairs[k] ?? 0);
  }
  const totals: Record<string, number> = {};
  for (const e of new Set([
    ...Object.keys(a.totals),
    ...Object.keys(b.totals),
  ])) {
    totals[e] = (b.totals[e] ?? 0) - (a.totals[e] ?? 0);
  }
  return {
    entities: [...new Set([...a.entities, ...b.entities])].sort(),
    pairs,
    totals,
  };
}
