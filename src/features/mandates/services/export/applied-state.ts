import { query } from "@/lib/db/db";
import {
  citationSubprogramme,
  mandateKey as decisionKey,
} from "../citation-identity";
import type {
  PPBRecord,
  CitationInfo,
  ManualMetadata,
  MandateDecision,
  ExportDecisionMode,
} from "@/types";
import {
  getDecisionTracks,
  getEffectiveDecision,
} from "@/features/mandates/services/decision-tracks";
import { fetchPPBRecords } from "@/features/mandates/services/data-service";
import {
  fetchDocumentMetadata,
  cleanTitle as cleanMetadataTitle,
} from "@/features/mandates/services/documents/metadata";

export interface AppliedMandateRow {
  symbol: string;
  title: string;
  body: string;
  docType: string | null;
  year: number | null;
  link: string | null;
  entity: string;
  entityLong: string | null;
  subprogramme: string | null;
  part: string | null;
}

export type LatestDecisionRow = MandateDecision;

interface DecisionRow {
  id: string;
  document_symbol: string;
  entity: string;
  subprogramme: string | null;
  decision: MandateDecision["decision"];
  decision_track: MandateDecision["decisionTrack"];
  reviewed_submission_id: string | null;
  review_session_id: string | null;
  has_addition: boolean;
  new_symbol: string | null;
  manual_metadata: ManualMetadata | null;
  decision_reason: string | null;
  other_reason: string | null;
  user_email: string;
  user_entity: string | null;
  created_at: string;
  approved_by: string | null;
  approved_by_entity: string | null;
  approved_at: string | null;
}

interface ResolvedDecisionMetadata {
  title: string;
  body: string;
  docType: string | null;
  year: number | null;
  link: string | null;
}

function getSubprogramme(
  ci: Pick<CitationInfo, "sub-programme" | "component" | "part_in_document">,
): string | null {
  return citationSubprogramme(
    ci["sub-programme"],
    ci.component,
    ci.part_in_document,
  );
}

function isLegislative(part: string | null): boolean {
  return part === "Legislative mandates";
}

function applyManualOverrides(
  base: ResolvedDecisionMetadata,
  manual: ManualMetadata | null | undefined,
): ResolvedDecisionMetadata {
  if (!manual) return base;
  return {
    title: manual.title ?? base.title,
    body: manual.body ?? base.body,
    docType: base.docType,
    year: manual.year ?? base.year,
    link: manual.link ?? base.link,
  };
}

function cleanTitle(title: string | null | undefined): string {
  if (!title) return "";
  return cleanMetadataTitle(title) || "";
}

function getSubprogrammeSortKey(subprogramme: string | null): string {
  return subprogramme?.trim() || "All Subprogrammes";
}

function compareSymbolsNatural(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function compareAppliedRows(
  a: AppliedMandateRow,
  b: AppliedMandateRow,
): number {
  const aSub = getSubprogrammeSortKey(a.subprogramme).toLowerCase();
  const bSub = getSubprogrammeSortKey(b.subprogramme).toLowerCase();
  const aIsAll = aSub.includes("all subprogramme");
  const bIsAll = bSub.includes("all subprogramme");
  if (aIsAll && !bIsAll) return -1;
  if (!aIsAll && bIsAll) return 1;
  if (aSub !== bSub) {
    return aSub.localeCompare(bSub, undefined, { sensitivity: "base" });
  }
  return compareSymbolsNatural(a.symbol, b.symbol);
}

export type ExportDecisionHistory = MandateDecision[] & {
  hasAddition: boolean;
};

export async function fetchDecisionHistories(
  entity?: string,
): Promise<Map<string, ExportDecisionHistory>> {
  const rows = await query<DecisionRow>(
    `
      SELECT DISTINCT ON (d.entity, d.document_symbol, d.subprogramme, d.decision_track)
        bool_or(d.decision = 'add') OVER (PARTITION BY d.entity, d.document_symbol, d.subprogramme) AS has_addition,
        d.id,
        d.document_symbol,
        d.entity,
        d.subprogramme,
        d.decision,
        d.decision_track,
        d.reviewed_submission_id,
        d.review_session_id,
        d.new_symbol,
        d.manual_metadata,
        d.decision_reason,
        d.other_reason,
        d.user_email,
        u.entity as user_entity,
        d.created_at,
        d.approved_by,
        approver.entity as approved_by_entity,
        d.approved_at
      FROM mandates_housekeeping.mandate_decisions d
      LEFT JOIN mandates_housekeeping.users u ON d.user_email = u.email
      LEFT JOIN mandates_housekeeping.users approver ON d.approved_by = approver.email
      WHERE ($1::text IS NULL OR d.entity = $1)
      ORDER BY d.entity, d.document_symbol, d.subprogramme, d.decision_track, d.created_at DESC, d.id DESC
    `,
    [entity || null],
  );

  const histories = new Map<string, ExportDecisionHistory>();
  for (const row of rows) {
    const event: MandateDecision = {
      id: row.id,
      documentSymbol: row.document_symbol,
      entity: row.entity,
      subprogramme: row.subprogramme,
      decision: row.decision,
      decisionTrack: row.decision_track,
      reviewedSubmissionId: row.reviewed_submission_id,
      reviewSessionId: row.review_session_id,
      newSymbol: row.new_symbol,
      manualMetadata: row.manual_metadata,
      decisionReason: row.decision_reason,
      otherReason: row.other_reason,
      userEmail: row.user_email,
      userEntity: row.user_entity,
      createdAt: row.created_at,
      approvedBy: row.approved_by,
      approvedByEntity: row.approved_by_entity,
      approvedAt: row.approved_at,
    };
    const key = decisionKey(row.entity, row.document_symbol, row.subprogramme);
    const history =
      histories.get(key) ??
      Object.assign([], { hasAddition: row.has_addition });
    history.hasAddition ||= row.has_addition;
    history.push(event);
    histories.set(key, history);
  }
  return histories;
}

function resolveDecisionMetadata(
  symbol: string,
  manualMetadata: ManualMetadata | null,
  metadataLookup: Record<string, ResolvedDecisionMetadata | null>,
): ResolvedDecisionMetadata {
  const base = metadataLookup[symbol] || {
    title: "",
    body: "",
    docType: null,
    year: null,
    link: null,
  };
  return applyManualOverrides(base, manualMetadata);
}

function buildEntityLongMap(records: PPBRecord[]): Map<string, string | null> {
  const map = new Map<string, string | null>();
  for (const rec of records) {
    for (const ci of rec.citation_info) {
      if (ci.entity && !map.has(ci.entity)) {
        map.set(ci.entity, ci.entity_long || null);
      }
    }
  }
  return map;
}

/** Preserve old programme-level null keys without applying background decisions. */
export function withLegacyProgrammeKeys(
  records: {
    full_document_symbol: string;
    citation_info: Pick<
      CitationInfo,
      "entity" | "sub-programme" | "component" | "part_in_document"
    >[];
  }[],
  histories: Map<string, ExportDecisionHistory>,
): Map<string, ExportDecisionHistory> {
  const resolved = new Map(histories);
  const background = new Set<string>();
  for (const record of records)
    for (const ci of record.citation_info)
      if (ci.entity && ci.part_in_document === "Mandates and background")
        background.add(
          decisionKey(ci.entity, record.full_document_symbol, null),
        );
  for (const record of records)
    for (const ci of record.citation_info) {
      if (
        !ci.entity ||
        !isLegislative(ci.part_in_document) ||
        ci["sub-programme"] ||
        ci.component
      )
        continue;
      const key = decisionKey(
        ci.entity,
        record.full_document_symbol,
        getSubprogramme(ci),
      );
      const legacyKey = decisionKey(
        ci.entity,
        record.full_document_symbol,
        null,
      );
      const legacy = histories.get(legacyKey);
      if (legacy && !background.has(legacyKey)) {
        const existing = histories.get(key);
        resolved.set(
          key,
          Object.assign(
            [...(existing ?? []), ...legacy].map((event) => ({
              ...event,
              subprogramme: getSubprogramme(ci),
            })),
            { hasAddition: !!existing?.hasAddition || legacy.hasAddition },
          ),
        );
        resolved.delete(legacyKey);
      }
    }
  return resolved;
}

/** Count only submissions that participate in the legislative export. */
function countFallbacks(
  records: PPBRecord[],
  histories: Map<string, ExportDecisionHistory>,
  entity?: string,
): number {
  const included = new Set<string>();
  for (const record of records)
    for (const citation of record.citation_info) {
      if (
        citation.entity &&
        (!entity || citation.entity === entity) &&
        isLegislative(citation.part_in_document)
      ) {
        included.add(
          decisionKey(
            citation.entity,
            record.full_document_symbol,
            getSubprogramme(citation),
          ),
        );
      }
    }
  let count = 0;
  for (const [key, history] of histories) {
    const { submission, currentReview } = getDecisionTracks(history);
    if (
      submission &&
      submission.decision !== "cancel" &&
      !currentReview &&
      (included.has(key) || submission.decision === "add")
    )
      count++;
  }
  return count;
}

export async function getExportFallbackCount(entity?: string): Promise<number> {
  const [records, rawHistories] = await Promise.all([
    fetchPPBRecords(),
    fetchDecisionHistories(entity),
  ]);
  return countFallbacks(
    records,
    withLegacyProgrammeKeys(records, rawHistories),
    entity,
  );
}

export async function getAppliedExportData(
  entity?: string,
  mode: ExportDecisionMode = "reviewed",
): Promise<{
  rows: AppliedMandateRow[];
  decisions: LatestDecisionRow[];
}> {
  const [records, rawHistories] = await Promise.all([
    fetchPPBRecords(),
    fetchDecisionHistories(entity),
  ]);
  const histories = withLegacyProgrammeKeys(records, rawHistories);
  const decisions = [...histories.values()].flatMap((history) => {
    const decision = getEffectiveDecision(history, mode);
    if (!decision) return [];
    // Retaining an entity's manual addition accepts its original metadata too.
    // A replacement uses only the reviewer's metadata and the new catalogue entry.
    if (
      history.hasAddition &&
      decision.decisionTrack === "review" &&
      decision.decision === "retain" &&
      !decision.manualMetadata
    ) {
      const { submission } = getDecisionTracks(history);
      return [
        { ...decision, manualMetadata: submission?.manualMetadata ?? null },
      ];
    }
    return [decision];
  });
  const baselineKeys = new Set<string>();
  for (const record of records)
    for (const citation of record.citation_info) {
      if (citation.entity && isLegislative(citation.part_in_document)) {
        baselineKeys.add(
          decisionKey(
            citation.entity,
            record.full_document_symbol,
            getSubprogramme(citation),
          ),
        );
      }
    }
  const decisionsMap = new Map<string, LatestDecisionRow>();
  const symbolsToResolve = new Set<string>();

  for (const decision of decisions) {
    decisionsMap.set(
      decisionKey(
        decision.entity,
        decision.documentSymbol,
        decision.subprogramme,
      ),
      decision,
    );
    if (decision.decision === "update" && decision.newSymbol) {
      symbolsToResolve.add(decision.newSymbol);
    }
    if (decision.decision === "add" || decision.decision === "retain") {
      symbolsToResolve.add(decision.documentSymbol);
    }
  }

  const metadata = await fetchDocumentMetadata([...symbolsToResolve]);
  const metadataLookup: Record<string, ResolvedDecisionMetadata | null> = {};
  for (const [symbol, meta] of Object.entries(metadata)) {
    metadataLookup[symbol] = meta
      ? {
          title: cleanTitle(meta.title),
          body: meta.body || "",
          docType: meta.docType || null,
          year: meta.year ?? null,
          link: meta.link || null,
        }
      : null;
  }

  const entityLongMap = buildEntityLongMap(records);
  const rows: AppliedMandateRow[] = [];
  const seen = new Set<string>();

  for (const rec of records) {
    for (const ci of rec.citation_info) {
      if (!ci.entity) continue;
      if (entity && ci.entity !== entity) continue;
      if (!isLegislative(ci.part_in_document)) continue;

      const subprogramme = getSubprogramme(ci);
      const key = decisionKey(
        ci.entity,
        rec.full_document_symbol,
        subprogramme,
      );
      const decision = decisionsMap.get(key);

      if (decision?.decision === "remove") continue;

      if (decision?.decision === "update" && decision.newSymbol) {
        const resolved = resolveDecisionMetadata(
          decision.newSymbol,
          decision.manualMetadata || null,
          metadataLookup,
        );
        const appliedKey = decisionKey(
          decision.entity,
          decision.newSymbol,
          decision.subprogramme,
        );
        if (!seen.has(appliedKey)) {
          seen.add(appliedKey);
          rows.push({
            symbol: decision.newSymbol,
            title: cleanTitle(resolved.title),
            body: resolved.body || "",
            docType: resolved.docType || null,
            year: resolved.year ?? null,
            link: resolved.link || null,
            entity: decision.entity,
            entityLong: ci.entity_long || null,
            subprogramme,
            part: "Legislative mandates",
          });
        }
        continue;
      }

      const appliedKey = decisionKey(
        ci.entity,
        rec.full_document_symbol,
        subprogramme,
      );
      if (seen.has(appliedKey)) continue;
      seen.add(appliedKey);

      rows.push({
        symbol: rec.full_document_symbol,
        title: cleanTitle(rec.description || rec.uniform_title || ""),
        body: rec.body || "",
        docType: rec.type || null,
        year: rec.year,
        link: rec.link,
        entity: ci.entity,
        entityLong: ci.entity_long || null,
        subprogramme,
        part: ci.part_in_document,
      });
    }
  }

  for (const decision of decisions) {
    if (entity && decision.entity !== entity) continue;
    const originalKey = decisionKey(
      decision.entity,
      decision.documentSymbol,
      decision.subprogramme,
    );
    const wasAdded =
      histories.get(originalKey)?.hasAddition || decision.decision === "add";
    if (
      baselineKeys.has(originalKey) ||
      !wasAdded ||
      decision.decision === "remove" ||
      decision.decision === "cancel"
    )
      continue;
    const targetSymbol =
      decision.decision === "update" && decision.newSymbol
        ? decision.newSymbol
        : decision.documentSymbol;
    const appliedKey = decisionKey(
      decision.entity,
      targetSymbol,
      decision.subprogramme,
    );
    if (seen.has(appliedKey)) continue;

    const resolved = resolveDecisionMetadata(
      targetSymbol,
      decision.manualMetadata || null,
      metadataLookup,
    );
    seen.add(appliedKey);
    rows.push({
      symbol: targetSymbol,
      title: cleanTitle(resolved.title),
      body: resolved.body || "",
      docType: resolved.docType || null,
      year: resolved.year ?? null,
      link: resolved.link || null,
      entity: decision.entity,
      entityLong: entityLongMap.get(decision.entity) || null,
      subprogramme: decision.subprogramme,
      part: "Legislative mandates",
    });
  }

  return {
    rows: rows.sort(compareAppliedRows),
    decisions,
  };
}
