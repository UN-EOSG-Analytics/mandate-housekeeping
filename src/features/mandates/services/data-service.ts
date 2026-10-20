/**
 * Mandate data service for PPB 2026/2027
 * Fetches PPB records from database and transforms into hierarchical structure
 */

import { query, transaction, type TransactionQueryFn } from "@/lib/db/db";
import { versionPredicateSql } from "@/lib/db/budget-version";
import type {
  PPBRecord,
  EntityData,
  CitationInfo,
  BudgetPartMeta,
  PartData,
  Mandate,
  MandateAction,
  NewerVersion,
} from "@/types";
import { BUDGET_PARTS_META } from "@/lib/constants";
import { fetchDocumentMetadata } from "./documents/metadata";
import { fetchNewerVersions } from "./documents/newer-versions";

export interface EntityOption {
  entity: string;
  entity_long: string | null;
}

interface DBCitationRow {
  id: string;
  sub_programme_number: number | null;
  ppb_full_document_symbol: string;
  entity: string;
  entity_long: string | null;
  origin_document: string | null;
  part_in_document: string | null;
  section: string | null;
  section_title: string | null;
  priority_area: string | null;
  sub_programme: string | null;
  pillar: string | null;
  budget_part: string | null;
  programme: number | null;
  programme_title: string | null;
  component: string | null;
  // Additional field specific to PPB data
  ppb_link: string | null;
  // Add doc_symbol for consistency with queries
  doc_symbol: string | null;
}

/**
 * Fetch all PPB records from database
 * Resolves current registry metadata with the conserved compatibility floor.
 */
export async function fetchPPBRecords(): Promise<PPBRecord[]> {
  return transaction((tx) => fetchRecords(tx));
}

/**
 * Fetch an entity's documents, retaining every selected-cycle citation for those
 * symbols. Other entities' citations supply the shared-document counts/badges.
 * Related reads share one cycle-scoped transaction instead of opening one per query.
 */
export async function fetchEntityPageData(
  entity: string,
): Promise<ReturnType<typeof collectEntityData>> {
  const parts = await transaction((tx) => fetchParts(tx, entity));
  return collectEntityData(parts, entity);
}

/** Load the overview without separate transaction setup for each related read. */
export async function fetchOverviewPageData(): Promise<PartData[]> {
  return transaction((tx) => fetchParts(tx));
}

async function fetchParts(
  runQuery: TransactionQueryFn,
  entity?: string,
): Promise<PartData[]> {
  const records = await fetchRecords(runQuery, entity);
  const symbols = records
    .filter((record) => record.metadata_from_db && record.document_symbol)
    .map((record) => record.document_symbol as string);
  const newerVersions = await fetchNewerVersions(symbols, runQuery);
  return transformPPBData(records, getBudgetPartsMeta(), newerVersions);
}

async function fetchRecords(
  runQuery: TransactionQueryFn,
  entity?: string,
): Promise<PPBRecord[]> {
  const rows = await runQuery<DBCitationRow>(
    `
    SELECT 
      c.id,
      c.sub_programme_number,
      c.ppb_full_document_symbol,
      c.entity,
      e.entity_long,
      c.origin_document,
      c.part_in_document,
      c.section,
      c.section_title,
      c.priority_area,
      c.sub_programme,
      c.pillar,
      c.budget_part,
      c.programme,
      c.programme_title,
      c.component,
      c.ppb_full_document_symbol AS symbol
    FROM ppb2026.source_document_citations c
    LEFT JOIN systemchart.entities e ON c.entity = e.entity
    WHERE ${versionPredicateSql("c")}
      ${
        entity !== undefined
          ? `AND c.ppb_full_document_symbol IN (
        SELECT ec.ppb_full_document_symbol
        FROM ppb2026.source_document_citations ec
        WHERE ec.entity = $1 AND ${versionPredicateSql("ec")}
      )`
          : ""
      }
    ORDER BY c.ppb_full_document_symbol, c.entity
  `,
    entity !== undefined ? [entity] : undefined,
  );

  const metadata = await fetchDocumentMetadata(
    [...new Set(rows.map((r) => r.ppb_full_document_symbol))],
    runQuery,
  );

  // Group rows by document symbol to build PPBRecord structure
  const recordsMap = new Map<string, PPBRecord>();
  const entitiesMap = new Map<string, Set<string>>();

  for (const row of rows) {
    const symbol = row.ppb_full_document_symbol;

    if (!recordsMap.has(symbol)) {
      // Use shared metadata resolution utility
      const resolved = metadata[symbol] ?? {
        title: null,
        year: null,
        body: null,
        docType: null,
        link: null,
        hasDbMetadata: false,
      };

      recordsMap.set(symbol, {
        full_document_symbol: symbol,
        num_citations: 0,
        num_entities: 0,
        entities: [],
        link: resolved.link,
        priority_area: row.priority_area,
        year: resolved.year,
        body: resolved.body,
        pillar: row.pillar,
        entity_long: row.entity_long,
        description: resolved.title,
        type: resolved.docType,
        citation_info: [],
        document_symbol: symbol,
        uniform_title: null,
        metadata_from_db: resolved.hasDbMetadata,
        recurrence_actions: undefined,
        entity_relevance: undefined,
      });
      entitiesMap.set(symbol, new Set());
    }

    const record = recordsMap.get(symbol)!;
    const entities = entitiesMap.get(symbol)!;

    // Build CitationInfo for this row
    const citationInfo: CitationInfo = {
      id: row.id,
      subprogramme_number: row.sub_programme_number,
      origin_document: row.origin_document || "",
      budget_part: row.budget_part,
      section: row.section,
      section_title: row.section_title,
      entity_long: row.entity_long,
      entity: row.entity,
      programme: row.programme,
      programme_title: row.programme_title,
      "sub-programme": row.sub_programme,
      component: row.component,
      part_in_document: row.part_in_document,
    };

    record.citation_info.push(citationInfo);
    record.num_citations++;

    // Track unique entities
    if (row.entity && !entities.has(row.entity)) {
      entities.add(row.entity);
      record.entities.push(row.entity);
    }
  }

  // Update num_entities for all records
  for (const [symbol, record] of recordsMap) {
    record.num_entities = entitiesMap.get(symbol)?.size || 0;
  }

  return Array.from(recordsMap.values());
}

/**
 * Fetch entities that are referenced in PPB 2026 citations
 * Only returns entities actually used in the current budget cycle
 */
export async function fetchEntities(): Promise<EntityOption[]> {
  const rows = await query<EntityOption>(
    `SELECT DISTINCT e.entity, e.entity_long
     FROM systemchart.entities e
     INNER JOIN ppb2026.source_document_citations c ON e.entity = c.entity
     WHERE ${versionPredicateSql("c")}
     ORDER BY e.entity`,
  );
  return rows;
}

/**
 * Fetch budget parts metadata
 * Returns static data (could be moved to DB in future)
 */
export function getBudgetPartsMeta(): BudgetPartMeta[] {
  return BUDGET_PARTS_META;
}

// ============================================================================
// Data Transformation Functions
// ============================================================================

/**
 * Determine the suggested action for a mandate within an entity
 * Returns UPDATE with latest symbol, or DROP if newer version is already cited
 */
function getActionForEntity(
  rec: PPBRecord,
  entity: string,
): MandateAction | null {
  const action = rec.recurrence_actions?.find((a) => a.entity === entity);
  if (!action) return null;

  if (action.newer_cited_symbols.length > 0) {
    return { type: "DROP", newerSymbol: action.newer_cited_symbols[0] };
  }
  return { type: "UPDATE", newerSymbol: action.latest_symbol };
}

/** Check if a part should be classified as background (vs. legislative mandate) */
function isBackgroundPart(part: string | null): boolean {
  return part === "Mandates and background";
}

/** Remove trailing colons from titles for consistency */
function cleanTitle(title: string): string {
  return title.replace(/\s*:\s*$/, "").trim();
}

/**
 * Transform raw PPB records into hierarchical structure
 * @param records Raw database records from PPB extraction
 * @param budgetPartsMeta Metadata for budget parts (labels, order, numerals)
 * @param newerVersions Map of document symbols to their newer versions
 * @returns Structured data organized by parts → entities → mandates
 */
export function transformPPBData(
  records: PPBRecord[],
  budgetPartsMeta: BudgetPartMeta[],
  newerVersions?: Map<string, NewerVersion>,
): PartData[] {
  // Build lookup from key (database budget_part value) to meta
  const metaByKey: Record<string, BudgetPartMeta> = {};
  for (const meta of budgetPartsMeta) {
    metaByKey[meta.key.toLowerCase()] = meta;
  }

  const structure: Record<
    string,
    {
      meta: BudgetPartMeta | null;
      entities: Record<
        string,
        {
          entityLong: string | null;
          section: string | null;
          sectionTitle: string | null;
          backgroundMandates: Mandate[];
          legislativeMandates: Record<string, Mandate[]>;
        }
      >;
    }
  > = {};

  for (const rec of records) {
    const symbol = rec.full_document_symbol;
    const title = cleanTitle(rec.description || rec.uniform_title || "");
    const link = rec.link;
    const year = rec.year;
    const body = rec.body;
    const docType = rec.type;
    const metadataFromDb = rec.metadata_from_db ?? false;

    // Build entity -> entityLong map and entity -> subprogrammes from all citation_info
    const entityLongMap: Record<string, string> = {};
    const entitySubprogrammes: Record<string, string[]> = {};
    for (const ci of rec.citation_info) {
      if (ci.entity && ci.entity_long) {
        entityLongMap[ci.entity] = ci.entity_long;
      }
      if (ci.entity) {
        const subprog = ci["sub-programme"] || ci.component || null;
        if (!entitySubprogrammes[ci.entity])
          entitySubprogrammes[ci.entity] = [];
        if (subprog && !entitySubprogrammes[ci.entity].includes(subprog)) {
          entitySubprogrammes[ci.entity].push(subprog);
        }
      }
    }

    for (const ci of rec.citation_info) {
      const budgetPart = ci.budget_part || "Other";
      const entity = ci.entity;
      const entityLong = ci.entity_long;
      const partInDoc = ci.part_in_document;
      const isBackground = isBackgroundPart(partInDoc);
      const subprog = ci["sub-programme"] || ci.component || null;

      if (!entity) continue;

      const action = getActionForEntity(rec, entity);
      const relevance = rec.entity_relevance?.[entity];
      const relevanceIndices = relevance?.indices || [];
      const aiComments = relevance?.ai_comments || {};

      const mandate: Mandate = {
        // Keep each location intact: section/addendum and subprogramme must come
        // from the same citation row. Review keys remain unchanged.
        citationLocations: rec.citation_info.filter(
          (location) =>
            location.entity === entity &&
            location.budget_part === ci.budget_part &&
            isBackgroundPart(location.part_in_document) === isBackground &&
            (location["sub-programme"] || location.component || null) ===
              subprog,
        ),
        symbol,
        title,
        link,
        year,
        body,
        docType,
        action,
        relevanceCount: relevanceIndices.length,
        relevanceIndices,
        aiComments,
        entity,
        entityLong,
        isBackground,
        otherEntitiesCount: Math.max(0, rec.num_entities - 1),
        allEntities: (rec.entities || []).filter(
          (e): e is string => e !== null,
        ),
        entitySubprogrammes,
        entityLongMap,
        allEntityRelevance: rec.entity_relevance || {},
        metadataFromDb,
        newerVersion: rec.document_symbol
          ? newerVersions?.get(rec.document_symbol)
          : undefined,
      };

      const meta = metaByKey[budgetPart.toLowerCase()] || null;

      if (!structure[budgetPart]) {
        structure[budgetPart] = { meta, entities: {} };
      }

      if (!structure[budgetPart].entities[entity]) {
        structure[budgetPart].entities[entity] = {
          entityLong,
          section: ci.section,
          sectionTitle: ci.section_title,
          backgroundMandates: [],
          legislativeMandates: {},
        };
      }

      const entityData = structure[budgetPart].entities[entity];

      if (isBackground) {
        if (!entityData.backgroundMandates.some((m) => m.symbol === symbol)) {
          entityData.backgroundMandates.push(mandate);
        }
      } else {
        const key = subprog || "Legislative mandates";
        if (!entityData.legislativeMandates[key]) {
          entityData.legislativeMandates[key] = [];
        }
        if (
          !entityData.legislativeMandates[key].some((m) => m.symbol === symbol)
        ) {
          entityData.legislativeMandates[key].push(mandate);
        }
      }
    }
  }

  // Sort by order (roman numeral order), unknown parts at end
  const parts: PartData[] = Object.entries(structure)
    .sort(([, a], [, b]) => {
      const aOrder = a.meta?.order ?? 999;
      const bOrder = b.meta?.order ?? 999;
      return aOrder - bOrder;
    })
    .map(([part, data]) => ({
      part: data.meta?.label || part,
      numeral: data.meta?.numeral || "",
      order: data.meta?.order ?? 999,
      entities: Object.entries(data.entities)
        .sort(([, a], [, b]) => {
          // Sort by section first (nulls last), then by entity name
          const sectionA = a.section ?? "\uffff";
          const sectionB = b.section ?? "\uffff";
          if (sectionA !== sectionB) return sectionA.localeCompare(sectionB);
          return 0; // Keep original order within section
        })
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([entity, entityData]) => ({
          entity,
          entityLong: entityData.entityLong,
          section: entityData.section,
          sectionTitle: entityData.sectionTitle,
          backgroundMandates: entityData.backgroundMandates,
          legislativeMandates: entityData.legislativeMandates,
        })),
    }));

  return parts;
}

/** An entity can occur in multiple budget parts; its review page includes all of them. */
export function collectEntityData(
  parts: PartData[],
  entity: string,
): { data: EntityData; partName: string } | null {
  const matches = parts.flatMap((part) =>
    part.entities
      .filter((e) => e.entity === entity)
      .map((data) => ({ data, partName: part.part })),
  );
  if (!matches.length) return null;
  const merge = (rows: Mandate[]): Mandate[] => {
    const bySymbol = new Map<string, Mandate>();
    for (const row of rows) {
      const old = bySymbol.get(row.symbol);
      bySymbol.set(
        row.symbol,
        old
          ? {
              ...old,
              citationLocations: [
                ...(old.citationLocations ?? []),
                ...(row.citationLocations ?? []),
              ],
            }
          : row,
      );
    }
    return [...bySymbol.values()];
  };
  const legislative: Record<string, Mandate[]> = {};
  for (const match of matches)
    for (const [key, rows] of Object.entries(match.data.legislativeMandates)) {
      legislative[key] = merge([...(legislative[key] ?? []), ...rows]);
    }
  return {
    data: {
      ...matches[0].data,
      backgroundMandates: merge(
        matches.flatMap((m) => m.data.backgroundMandates),
      ),
      legislativeMandates: legislative,
    },
    partName: [...new Set(matches.map((m) => m.partName))].join("; "),
  };
}
