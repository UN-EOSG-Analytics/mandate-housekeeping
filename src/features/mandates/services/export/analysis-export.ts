/**
 * Clean Excel data dump for analysis (pivots / plots) from the /analysis page.
 *
 * A single tidy "2026 vs 2027" sheet: one row per (entity, mandate symbol,
 * subprogramme) drawn from the UNION of 2026 source citations, 2027 source
 * citations, AND housekeeping decisions — so it answers "which housekeeping
 * decision was taken on 2026, and what happened in 2027?". Crucially, `add`
 * decisions appear even when the mandate is in neither source fascicle.
 *
 * Plan Outline citations are excluded (not entity-attributed; outside the
 * official two-document version definitions), matching the heatmap.
 */

import ExcelJS from "exceljs";
import { query } from "@/lib/db/db";
import { fetchDocumentMetadata } from "@/features/mandates/services/documents/metadata";
import {
  getReasonLabel,
  type DecisionType,
} from "@/features/mandates/services/decision-reasons";
import {
  getCuratedEntity,
  SECTION_META,
} from "@/features/mandates/heatmap/entity-sections";

const DECISION_TYPES: DecisionType[] = ["add", "retain", "update", "remove"];

function reasonLabel(decision: string | null, reasonId: string | null): string {
  if (!decision || !reasonId) return "";
  if (!DECISION_TYPES.includes(decision as DecisionType)) return reasonId;
  return (
    getReasonLabel(decision as DecisionType, reasonId) ?? reasonId
  ).replace(/\*\*/g, "");
}

function sectionGroup(entity: string): string {
  const cur = getCuratedEntity(entity);
  return cur ? SECTION_META[cur.section].label : "";
}

function iso(d: Date | string | null): string {
  if (!d) return "";
  return (d instanceof Date ? d : new Date(d)).toISOString();
}

interface ReconRow {
  entity: string;
  entity_long: string | null;
  symbol: string;
  subprogramme: string;
  in26: boolean;
  in27: boolean;
  c26: number;
  c27: number;
  decision: string | null;
  decision_reason: string | null;
  other_reason: string | null;
  new_symbol: string | null;
  decided_by: string | null;
  decided_at: Date | null;
  approved_by: string | null;
  approved_at: Date | null;
  review_key_count: number;
  review_key_conflict: boolean;
  review_key_candidates: unknown;
}

export async function exportAnalysisXlsx(): Promise<Buffer> {
  const rows = await query<ReconRow>(
    `WITH src AS (
       SELECT c.entity,
         upper(regexp_replace(c.ppb_full_document_symbol, '[[:space:]]', '', 'g')) AS symbol,
         COALESCE(NULLIF(c.sub_programme, 'All Subprogrammes'), c.component, '') AS subprogramme,
         bdv.version_slug AS ver
       FROM ppb2026.source_document_citations c
       JOIN ppb2026.budget_documents bd ON c.origin_document ~ bd.match_pattern
       JOIN ppb2026.budget_document_versions bdv ON bdv.doc_slug = bd.slug
       WHERE c.entity IS NOT NULL AND c.entity != 'NA'
         AND bdv.version_slug IN ('ppb2026', 'ppb2027')
         AND NOT EXISTS (
           SELECT 1 FROM ppb2026.budget_documents po
           WHERE po.slug = 'plan-outline-a80-6' AND c.origin_document ~ po.match_pattern
         )
     ),
     agg AS (
       SELECT entity, symbol, subprogramme,
         bool_or(ver = 'ppb2026') AS in26,
         bool_or(ver = 'ppb2027') AS in27,
         COUNT(*) FILTER (WHERE ver = 'ppb2026')::int AS c26,
         COUNT(*) FILTER (WHERE ver = 'ppb2027')::int AS c27
       FROM src GROUP BY entity, symbol, subprogramme
     ),
     raw_latest AS (
       -- Preserve each audit key first, then make generic compatibility explicit.
       SELECT DISTINCT ON (entity, document_symbol, COALESCE(subprogramme, '')) *
       FROM mandates_housekeeping.mandate_decisions
       WHERE entity IS NOT NULL AND entity != 'NA'
       ORDER BY entity, document_symbol, COALESCE(subprogramme, ''), created_at DESC, id DESC
     ),
     normalized AS (
       SELECT *, upper(regexp_replace(document_symbol, '[[:space:]]', '', 'g')) AS symbol,
         COALESCE(NULLIF(subprogramme, 'All Subprogrammes'), '') AS comparison_subprogramme
       FROM raw_latest
     ),
     review_key_groups AS (
       SELECT entity, symbol, comparison_subprogramme,
         count(*)::int AS review_key_count,
         count(DISTINCT (decision, new_symbol, decision_reason, other_reason)) > 1 AS review_key_conflict,
         jsonb_agg(jsonb_build_object('id', id, 'subprogramme', subprogramme,
           'document_symbol', document_symbol, 'decision', decision, 'new_symbol', new_symbol)
           ORDER BY created_at DESC, id DESC) AS review_key_candidates
       FROM normalized GROUP BY entity, symbol, comparison_subprogramme
     ),
     ranked AS (
       SELECT *, row_number() OVER (PARTITION BY entity, symbol, comparison_subprogramme
         ORDER BY created_at DESC, id DESC) AS rn FROM normalized
     ),
     latest AS (
       SELECT r.entity, r.symbol, r.comparison_subprogramme AS subprogramme,
         r.decision, r.decision_reason, r.other_reason, r.new_symbol,
         r.user_email, r.created_at, r.approved_by, r.approved_at,
         g.review_key_count, g.review_key_conflict, g.review_key_candidates
       FROM ranked r JOIN review_key_groups g USING (entity, symbol, comparison_subprogramme)
       WHERE r.rn = 1
     ),
     keys AS (
       SELECT entity, symbol, subprogramme FROM agg
       UNION
       SELECT entity, symbol, subprogramme FROM latest
     )
     SELECT k.entity, e.entity_long, k.symbol, k.subprogramme,
       COALESCE(a.in26, false) AS in26, COALESCE(a.in27, false) AS in27,
       COALESCE(a.c26, 0) AS c26, COALESCE(a.c27, 0) AS c27,
       d.decision, d.decision_reason, d.other_reason, d.new_symbol,
       d.user_email AS decided_by, d.created_at AS decided_at,
       d.approved_by, d.approved_at, d.review_key_count, d.review_key_conflict, d.review_key_candidates
     FROM keys k
     LEFT JOIN agg a USING (entity, symbol, subprogramme)
     LEFT JOIN latest d USING (entity, symbol, subprogramme)
     LEFT JOIN systemchart.entities e ON e.entity = k.entity
     ORDER BY k.entity, k.symbol, k.subprogramme`,
    [],
    "ppb2026",
  );

  const meta = await fetchDocumentMetadata([
    ...new Set(rows.map((r) => r.symbol)),
  ]);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "UN Mandates Housekeeping";
  workbook.created = new Date();

  // Cover
  const cover = workbook.addWorksheet("Cover");
  cover.getCell("A1").value =
    "Mandate housekeeping — 2026 vs 2027 analysis data";
  cover.getCell("A1").font = { bold: true, size: 16 };
  cover.getCell("A3").value = `Generated: ${new Date().toISOString()}`;
  cover.getCell("A5").value =
    "One row per (entity, mandate symbol, subprogramme) across the 2026 and 2027 source citations plus housekeeping decisions. in_2026 / in_2027 = present in that fascicle (PPB + PKM; Plan Outline excluded). decision_2026 = latest active housekeeping decision (cancelled = none); add decisions appear even when the mandate is in neither fascicle.";
  cover.getCell("A6").value =
    "Pivot decision_2026 against presence to see outcomes: e.g. remove + only_2026 = removal realized; remove + both = still cited in 2027; add + only_2027 = addition realized; add + neither = added but not (yet) in the 2027 fascicle.";
  cover.getCell("A7").value =
    "Generic All Subprogrammes and NULL are compared together. decision_2026 uses the latest timestamp, then ID, across compatible raw keys. Multiple raw review keys and contradictory effective decisions are explicitly flagged in review_key_* columns; all original history remains unchanged.";
  cover.getColumn(1).width = 130;

  // 2026 vs 2027 reconciliation
  const sheet = workbook.addWorksheet("2026 vs 2027");
  const headers = [
    "entity",
    "entity_long",
    "section_group",
    "symbol",
    "title",
    "year",
    "body",
    "doc_type",
    "link",
    "subprogramme",
    "in_2026",
    "in_2027",
    "presence",
    "count_2026",
    "count_2027",
    "decision_2026",
    "decision_reason",
    "decision_reason_label",
    "other_reason",
    "new_symbol",
    "decided_by",
    "decided_at",
    "approved_by",
    "approved_at",
    "review_key_count",
    "review_key_conflict",
    "review_key_candidates",
  ];
  const widths = [
    12, 32, 18, 18, 40, 7, 8, 14, 30, 16, 9, 9, 12, 11, 11, 13, 18, 40, 30, 16,
    24, 22, 24, 22, 12, 18, 60,
  ];
  const headerRow = sheet.addRow(headers);
  headerRow.font = { bold: true };
  widths.forEach((w, i) => (sheet.getColumn(i + 1).width = w));
  sheet.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];
  sheet.autoFilter = {
    from: "A1",
    to: `${sheet.getColumn(headers.length).letter}1`,
  };

  for (const r of rows) {
    const decision = r.decision === "cancel" ? null : r.decision;
    // Skip orphans: no presence in either fascicle and no active decision.
    if (!r.in26 && !r.in27 && !decision && !r.review_key_conflict) continue;
    const presence =
      r.in26 && r.in27
        ? "both"
        : r.in26
          ? "only_2026"
          : r.in27
            ? "only_2027"
            : "neither";
    const m = meta[r.symbol];
    sheet.addRow([
      r.entity,
      r.entity_long ?? "",
      sectionGroup(r.entity),
      r.symbol,
      m?.title ?? "",
      m?.year ?? "",
      m?.body ?? "",
      m?.docType ?? "",
      m?.link ?? "",
      r.subprogramme,
      r.in26 ? "yes" : "no",
      r.in27 ? "yes" : "no",
      presence,
      r.c26,
      r.c27,
      decision ?? "",
      decision ? (r.decision_reason ?? "") : "",
      decision ? reasonLabel(decision, r.decision_reason) : "",
      decision ? (r.other_reason ?? "") : "",
      r.new_symbol ?? "",
      decision ? (r.decided_by ?? "") : "",
      decision ? iso(r.decided_at) : "",
      decision ? (r.approved_by ?? "") : "",
      decision ? iso(r.approved_at) : "",
      r.review_key_count ?? 0,
      r.review_key_conflict ? "yes" : "no",
      (r.review_key_count ?? 0) > 1
        ? JSON.stringify(r.review_key_candidates)
        : "",
    ]);
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
