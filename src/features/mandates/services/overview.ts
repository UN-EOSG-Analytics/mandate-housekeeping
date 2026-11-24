import { unstable_cache } from "next/cache";
import { query } from "@/lib/db/db";
import {
  versionPredicateSqlFor,
  type BudgetVersion,
} from "@/lib/db/budget-version";
import { budgetPartAliases, resolveBudgetPart } from "./budget-parts";
import type { PartOverviewSummary } from "@/types/overview";

interface OverviewRow {
  budget_part: string;
  entity: string;
  entity_long: string | null;
  section: string | null;
  section_title: string | null;
  mandate_count: number;
}

/** Only citation membership is cached; account and review permissions stay live. */
export const fetchOverviewSummary = unstable_cache(
  async (version: BudgetVersion): Promise<PartOverviewSummary[]> => {
    const rows = await query<OverviewRow>(
      `WITH citations AS MATERIALIZED (
        SELECT c.id, c.entity,
          COALESCE(
            $1::jsonb ->> lower(btrim(regexp_replace(normalize(c.budget_part, NFKC), '\\s+', ' ', 'g'))),
            NULLIF(btrim(c.budget_part), ''), 'Other'
          ) AS budget_part,
          c.ppb_full_document_symbol,
          c.part_in_document, c.sub_programme, c.component, c.section, c.section_title
        FROM ppb2026.source_document_citations c
        WHERE ${versionPredicateSqlFor("c", version)} AND c.entity IS NOT NULL AND c.entity <> ''
      ), locations AS (
        SELECT DISTINCT entity, COALESCE(NULLIF(budget_part, ''), 'Other') AS budget_part,
          ppb_full_document_symbol,
          CASE WHEN part_in_document = 'Mandates and background' THEN NULL
            ELSE COALESCE(NULLIF(sub_programme, ''), NULLIF(component, ''), 'Legislative mandates') END AS programme,
          COALESCE(part_in_document = 'Mandates and background', false) AS background
        FROM citations
      ), counts AS (
        SELECT entity, budget_part, count(*)::int AS mandate_count
        FROM locations GROUP BY entity, budget_part
      ), labels AS (
        SELECT DISTINCT ON (entity, COALESCE(NULLIF(budget_part, ''), 'Other'))
          entity, COALESCE(NULLIF(budget_part, ''), 'Other') AS budget_part, section, section_title
        FROM citations ORDER BY entity, COALESCE(NULLIF(budget_part, ''), 'Other'), ppb_full_document_symbol, id
      )
      SELECT c.*, e.entity_long, l.section, l.section_title
      FROM counts c
      JOIN labels l USING (entity, budget_part)
      LEFT JOIN systemchart.entities e ON e.entity = c.entity
      ORDER BY c.entity`,
      [JSON.stringify(budgetPartAliases())],
      version,
    );
    const parts = new Map<string, PartOverviewSummary>();
    for (const row of rows) {
      const { key, meta } = resolveBudgetPart(row.budget_part);
      let part = parts.get(key);
      if (!part) {
        part = {
          part: meta?.label ?? row.budget_part,
          numeral: meta?.numeral ?? "",
          order: meta?.order ?? 999,
          entities: [],
        };
        parts.set(key, part);
      }
      part.entities.push({
        entity: row.entity,
        entityLong: row.entity_long,
        section: row.section,
        sectionTitle: row.section_title,
        mandateCount: row.mandate_count,
      });
    }
    return [...parts.values()]
      .sort((a, b) => a.order - b.order)
      .map((part) => ({
        ...part,
        entities: part.entities.sort((a, b) =>
          a.entity.localeCompare(b.entity),
        ),
      }));
  },
  ["entity-overview-summary-budget-parts-v2"],
  { revalidate: 60 },
);
