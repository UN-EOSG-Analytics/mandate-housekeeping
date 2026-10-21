/**
 * Analysis service for mandate decisions
 * Provides statistics on decisions and their impact on citation counts
 */

import { query } from "@/lib/db/db";
import { effectiveDecisionsCteSql } from "./decision-tracks-sql";
import { versionPredicateSql } from "@/lib/db/budget-version";

export interface DecisionStats {
  decision: string;
  count: number;
  percentage: number;
}

export interface EntityDecisionStats {
  entity: string;
  entityLong: string | null;
  totalCitations: number;
  decisionsCount: number;
  retainCount: number;
  removeCount: number;
  updateCount: number;
  addCount: number;
  noDecisionCount: number;
  /** Citations that would remain after applying remove decisions */
  projectedCitations: number;
  /** Absolute decrease in citations */
  absoluteDecrease: number;
  /** Percentage decrease in citations */
  percentageDecrease: number;
}

export interface OverallStats {
  totalCitations: number;
  totalUniqueDocuments: number;
  projectedUniqueDocuments: number;
  totalEntities: number;
  decisionsBreakdown: DecisionStats[];
  totalDecisions: number;
  citationsWithDecisions: number;
  citationsWithoutDecisions: number;
  projectedCitations: number;
  absoluteDecrease: number;
  percentageDecrease: number;
}

export interface AnalysisData {
  overall: OverallStats;
  byEntity: EntityDecisionStats[];
}

/**
 * Fetch comprehensive analysis data combining citations and decisions
 * Only considers the most recent decision per (document_symbol, entity, subprogramme)
 */
export async function fetchAnalysisData(): Promise<AnalysisData> {
  // Get total citations by entity (excluding NULL and 'NA' entities)
  const citationsByEntity = await query<{
    entity: string;
    entity_long: string | null;
    total_citations: string;
    unique_documents: string;
  }>(`
    SELECT 
      c.entity,
      e.entity_long,
      COUNT(*) as total_citations,
      COUNT(DISTINCT c.ppb_full_document_symbol) as unique_documents
    FROM ppb2026.source_document_citations c
    LEFT JOIN systemchart.entities e ON c.entity = e.entity
    WHERE c.entity IS NOT NULL AND c.entity != 'NA'
      AND ${versionPredicateSql("c")}
    GROUP BY c.entity, e.entity_long
    ORDER BY COUNT(*) DESC
  `);

  // Get the LATEST decision per (document_symbol, entity, subprogramme) - excluding audit trail
  // Using DISTINCT ON to get only the most recent decision for each unique citation
  // Excludes NULL and 'NA' entities
  const decisionsByEntity = await query<{
    entity: string;
    decision: string;
    count: string;
  }>(`
    WITH ${effectiveDecisionsCteSql()}
    SELECT 
      entity,
      CASE WHEN has_addition THEN
        CASE WHEN decision IN ('add', 'retain', 'update') THEN 'add' ELSE 'cancel' END
        ELSE decision END AS decision,
      COUNT(*) as count
    FROM latest_decisions
    WHERE decision != 'cancel' AND NOT (has_addition AND decision = 'remove')
      AND entity IS NOT NULL AND entity != 'NA'
    GROUP BY entity, 2
    ORDER BY entity, decision
  `);

  // Get overall decision breakdown (latest decisions only, excluding NULL and 'NA' entities)
  const overallDecisions = await query<{
    decision: string;
    count: string;
  }>(`
    WITH ${effectiveDecisionsCteSql()}
    SELECT 
      CASE WHEN has_addition THEN
        CASE WHEN decision IN ('add', 'retain', 'update') THEN 'add' ELSE 'cancel' END
        ELSE decision END AS decision,
      COUNT(*) as count
    FROM latest_decisions
    WHERE decision != 'cancel' AND NOT (has_addition AND decision = 'remove')
      AND entity IS NOT NULL AND entity != 'NA'
    GROUP BY 1
    ORDER BY 1
  `);

  // Build decision maps for faster lookup
  const decisionMap = new Map<string, Map<string, number>>();
  for (const row of decisionsByEntity) {
    if (!decisionMap.has(row.entity)) {
      decisionMap.set(row.entity, new Map());
    }
    decisionMap.get(row.entity)!.set(row.decision, parseInt(row.count, 10));
  }

  // Calculate entity-level stats
  // totalDecisions = count of citations that have a decision (latest only, no cancel, no audit trail)
  // Projected = current citations - remove + add
  const byEntity: EntityDecisionStats[] = citationsByEntity.map((row) => {
    const totalCitations = parseInt(row.total_citations, 10);
    const entityDecisions = decisionMap.get(row.entity) || new Map();

    const retainCount = entityDecisions.get("retain") || 0;
    const removeCount = entityDecisions.get("remove") || 0;
    const updateCount = entityDecisions.get("update") || 0;
    const addCount = entityDecisions.get("add") || 0;

    // All decisions count towards "citations with decisions"
    // 'add' creates new citations but still represents a decision
    const decisionsCount = retainCount + removeCount + updateCount + addCount;

    // Projected = current citations - removed + newly added
    // retain/update/no-decision → stays in projected
    // remove → removed from projected
    // add → new citations added to projected
    const projectedCitations = totalCitations - removeCount + addCount;
    const absoluteDecrease = totalCitations - projectedCitations;
    const percentageDecrease =
      totalCitations > 0 ? (absoluteDecrease / totalCitations) * 100 : 0;

    return {
      entity: row.entity,
      entityLong: row.entity_long,
      totalCitations,
      decisionsCount,
      retainCount,
      removeCount,
      updateCount,
      addCount,
      noDecisionCount: Math.max(
        0,
        totalCitations - retainCount - removeCount - updateCount,
      ),
      projectedCitations,
      absoluteDecrease,
      percentageDecrease,
    };
  });

  // Calculate overall stats
  const totalCitations = byEntity.reduce((sum, e) => sum + e.totalCitations, 0);
  const totalRemoved = byEntity.reduce((sum, e) => sum + e.removeCount, 0);
  const totalAdded = byEntity.reduce((sum, e) => sum + e.addCount, 0);

  // Total citations that have received a decision (retain, remove, update, or add)
  // Excludes audit trail (DISTINCT ON latest) and cancel decisions
  const totalDecisionsCount = byEntity.reduce(
    (sum, e) => sum + e.decisionsCount,
    0,
  );

  // Count unique documents across all entities (excluding NULL and 'NA' entities)
  const uniqueDocsResult = await query<{ count: string }>(`
    SELECT COUNT(DISTINCT c.ppb_full_document_symbol) as count
    FROM ppb2026.source_document_citations c
    WHERE c.entity IS NOT NULL AND c.entity != 'NA'
      AND ${versionPredicateSql("c")}
  `);

  // Calculate projected unique documents
  // Documents that will remain after applying all decisions
  const projectedDocsResult = await query<{ count: string }>(`
    WITH ${effectiveDecisionsCteSql()},
    -- Documents with at least one non-removed citation
    retained_docs AS (
      SELECT DISTINCT c.ppb_full_document_symbol
      FROM ppb2026.source_document_citations c
      WHERE c.entity IS NOT NULL AND c.entity != 'NA'
        AND ${versionPredicateSql("c")}
        AND NOT EXISTS (
          SELECT 1 FROM latest_decisions d
          WHERE d.document_symbol = c.ppb_full_document_symbol
            AND d.entity = c.entity
            AND COALESCE(d.subprogramme, '') = COALESCE(c.sub_programme, '')
            AND d.decision = 'remove' AND NOT d.has_addition
        )
    ),
    -- New documents from add decisions
    added_docs AS (
      SELECT DISTINCT CASE WHEN decision = 'update' THEN new_symbol ELSE document_symbol END as ppb_full_document_symbol
      FROM latest_decisions
      WHERE decision = 'add' OR (has_addition AND decision IN ('retain', 'update'))
    )
    SELECT COUNT(DISTINCT ppb_full_document_symbol) as count
    FROM (
      SELECT ppb_full_document_symbol FROM retained_docs
      UNION
      SELECT ppb_full_document_symbol FROM added_docs
    ) all_docs
  `);

  // Projected = current - removed + added
  const projectedCitations = totalCitations - totalRemoved + totalAdded;
  const absoluteDecrease = totalCitations - projectedCitations;
  const percentageDecrease =
    totalCitations > 0 ? (absoluteDecrease / totalCitations) * 100 : 0;

  // Total unique latest decisions (for pie chart)
  const totalDecisions = overallDecisions.reduce(
    (sum, d) => sum + parseInt(d.count, 10),
    0,
  );

  const decisionsBreakdown: DecisionStats[] = overallDecisions.map((d) => ({
    decision: d.decision,
    count: parseInt(d.count, 10),
    percentage:
      totalDecisions > 0 ? (parseInt(d.count, 10) / totalDecisions) * 100 : 0,
  }));

  const overall: OverallStats = {
    totalCitations,
    totalUniqueDocuments: parseInt(uniqueDocsResult[0]?.count || "0", 10),
    projectedUniqueDocuments: parseInt(
      projectedDocsResult[0]?.count || "0",
      10,
    ),
    totalEntities: citationsByEntity.length,
    decisionsBreakdown,
    totalDecisions,
    citationsWithDecisions: totalDecisionsCount - totalAdded,
    citationsWithoutDecisions: Math.max(
      0,
      totalCitations - totalDecisionsCount + totalAdded,
    ),
    projectedCitations,
    absoluteDecrease,
    percentageDecrease,
  };

  return { overall, byEntity };
}
