/**
 * Analysis service for mandate decisions
 * Provides statistics on decisions and their impact on citation counts
 */

import { query } from "@/lib/db/db";
import { getEffectiveDecision } from "./decision-tracks";
import { citationSubprogramme, mandateKey } from "./citation-identity";
import {
  fetchDecisionHistories,
  withLegacyProgrammeKeys,
} from "./export/applied-state";
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

/** Count review items once, regardless of how many source locations cite them. */
export async function fetchAnalysisData(): Promise<AnalysisData> {
  const [citations, rawHistories] = await Promise.all([
    query<{
      entity: string;
      entity_long: string | null;
      symbol: string;
      sub_programme: string | null;
      component: string | null;
      part_in_document: string | null;
    }>(`
      SELECT c.entity, e.entity_long, c.ppb_full_document_symbol AS symbol,
        c.sub_programme, c.component, c.part_in_document
      FROM ppb2026.source_document_citations c
      LEFT JOIN systemchart.entities e ON c.entity = e.entity
      WHERE c.entity IS NOT NULL AND c.entity <> 'NA'
        AND ${versionPredicateSql("c")}
    `),
    fetchDecisionHistories(),
  ]);
  // The compatibility resolver needs only citation identities, never metadata.
  const records = citations.map((c) => ({
    full_document_symbol: c.symbol,
    citation_info: [
      {
        entity: c.entity,
        "sub-programme": c.sub_programme,
        component: c.component,
        part_in_document: c.part_in_document,
      },
    ],
  }));
  const histories = withLegacyProgrammeKeys(records, rawHistories);
  const entities = new Map<string, EntityDecisionStats>();
  const projected = new Map<string, Set<string>>();
  const projectedSymbols = new Set<string>();
  const originalSymbols = new Set<string>();
  const baseline = new Set<string>();
  const breakdown = new Map<string, number>();

  function entityStats(entity: string, entityLong: string | null) {
    let stats = entities.get(entity);
    if (!stats) {
      stats = {
        entity,
        entityLong,
        totalCitations: 0,
        decisionsCount: 0,
        retainCount: 0,
        removeCount: 0,
        updateCount: 0,
        addCount: 0,
        noDecisionCount: 0,
        projectedCitations: 0,
        absoluteDecrease: 0,
        percentageDecrease: 0,
      };
      entities.set(entity, stats);
      projected.set(entity, new Set());
    }
    return stats;
  }
  function countDecision(
    stats: EntityDecisionStats,
    decision: "retain" | "remove" | "update" | "add",
  ) {
    stats.decisionsCount++;
    const field = `${decision}Count` as
      | "retainCount"
      | "removeCount"
      | "updateCount"
      | "addCount";
    stats[field]++;
    breakdown.set(decision, (breakdown.get(decision) ?? 0) + 1);
  }
  function include(
    entity: string,
    symbol: string,
    subprogramme: string | null,
  ) {
    projected.get(entity)!.add(mandateKey(entity, symbol, subprogramme));
    projectedSymbols.add(symbol);
  }

  for (const c of citations) {
    const subprogramme = citationSubprogramme(
      c.sub_programme,
      c.component,
      c.part_in_document,
    );
    const key = mandateKey(c.entity, c.symbol, subprogramme);
    if (baseline.has(key)) continue;
    baseline.add(key);
    originalSymbols.add(c.symbol);
    const stats = entityStats(c.entity, c.entity_long);
    stats.totalCitations++;
    const decision = getEffectiveDecision(histories.get(key) ?? [], "reviewed");
    if (!decision || decision.decision === "cancel") stats.noDecisionCount++;
    else {
      // An add event targeting an existing citation does not create another item.
      countDecision(
        stats,
        decision.decision === "add" ? "retain" : decision.decision,
      );
    }
    if (decision?.decision !== "remove") {
      include(
        c.entity,
        decision?.decision === "update" && decision.newSymbol
          ? decision.newSymbol
          : c.symbol,
        subprogramme,
      );
    }
  }

  for (const [key, history] of histories) {
    if (baseline.has(key)) continue;
    const decision = getEffectiveDecision(history, "reviewed");
    if (
      !decision ||
      !decision.entity ||
      decision.entity === "NA" ||
      (!history.hasAddition && decision.decision !== "add") ||
      decision.decision === "cancel" ||
      decision.decision === "remove"
    )
      continue;
    const stats = entityStats(decision.entity, null);
    countDecision(stats, "add");
    include(
      decision.entity,
      decision.decision === "update" && decision.newSymbol
        ? decision.newSymbol
        : decision.documentSymbol,
      decision.subprogramme,
    );
  }
  const byEntity = [...entities.values()]
    .map((stats) => {
      stats.projectedCitations = projected.get(stats.entity)!.size;
      stats.absoluteDecrease = stats.totalCitations - stats.projectedCitations;
      stats.percentageDecrease = stats.totalCitations
        ? (stats.absoluteDecrease / stats.totalCitations) * 100
        : 0;
      return stats;
    })
    .sort(
      (a, b) =>
        b.totalCitations - a.totalCitations || a.entity.localeCompare(b.entity),
    );
  const sum = (field: keyof EntityDecisionStats) =>
    byEntity.reduce((total, stats) => total + Number(stats[field]), 0);
  const totalCitations = sum("totalCitations");
  const totalDecisions = sum("decisionsCount");
  const projectedCitations = sum("projectedCitations");
  const absoluteDecrease = totalCitations - projectedCitations;
  const citationsWithoutDecisions = sum("noDecisionCount");
  return {
    byEntity,
    overall: {
      totalCitations,
      totalUniqueDocuments: originalSymbols.size,
      projectedUniqueDocuments: projectedSymbols.size,
      totalEntities: byEntity.length,
      decisionsBreakdown: [...breakdown]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([decision, count]) => ({
          decision,
          count,
          percentage: totalDecisions ? (count / totalDecisions) * 100 : 0,
        })),
      totalDecisions,
      citationsWithDecisions: totalCitations - citationsWithoutDecisions,
      citationsWithoutDecisions,
      projectedCitations,
      absoluteDecrease,
      percentageDecrease: totalCitations
        ? (absoluteDecrease / totalCitations) * 100
        : 0,
    },
  };
}
