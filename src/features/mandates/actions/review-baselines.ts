"use server";

/**
 * Review Baselines Service
 *
 * Fetches baseline decisions (pre-review state) and computes change info
 * for displaying persistent review change indicators.
 *
 * Key concepts:
 * - Baseline: The last decision for a document BEFORE a review session started
 * - In-review decision: Decision made DURING the review (has review_session_id set)
 * - Change: Difference between baseline and in-review decision
 */

import { query } from "@/lib/db/db";
import type {
  Decision,
  MandateDecision,
  ReviewChangeInfo,
  ReviewChangeResponse,
} from "@/types";

type ActionResult<T = void> =
  | { success: true; data?: T }
  | { success: false; error: string };

interface DecisionRow {
  id: string;
  document_symbol: string;
  entity: string;
  subprogramme: string | null;
  decision: string;
  new_symbol: string | null;
  manual_metadata: Record<string, unknown> | null;
  decision_reason: string | null;
  other_reason: string | null;
  user_email: string;
  user_entity: string | null;
  created_at: string;
  approved_by: string | null;
  approved_by_entity: string | null;
  approved_at: string | null;
  review_session_id: string | null;
}

interface ResponseRow {
  id: string;
  entity: string;
  document_symbol: string;
  subprogramme: string | null;
  review_session_id: string;
  response_type: string;
  responded_by: string;
  responded_at: string;
  revert_decision_id: string | null;
  comment: string | null;
}

const toDecision = (row: DecisionRow): MandateDecision => ({
  id: row.id,
  documentSymbol: row.document_symbol,
  entity: row.entity,
  subprogramme: row.subprogramme,
  decision: row.decision as Decision,
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
  reviewSessionId: row.review_session_id,
});

const toResponse = (row: ResponseRow): ReviewChangeResponse => ({
  id: row.id,
  entity: row.entity,
  documentSymbol: row.document_symbol,
  subprogramme: row.subprogramme,
  reviewSessionId: row.review_session_id,
  responseType: row.response_type as "accept" | "revert",
  respondedBy: row.responded_by,
  respondedAt: row.responded_at,
  revertDecisionId: row.revert_decision_id,
  comment: row.comment,
});

/**
 * Get the review session info for an entity
 * Returns the current active review or the most recent completed review
 */
export async function getReviewSessionAction(entity: string): Promise<
  ActionResult<{
    reviewSessionId: string | null;
    isActive: boolean;
    startedAt: string | null;
    startedBy: string | null;
    endedAt: string | null;
  }>
> {
  if (!entity) {
    return { success: false, error: "entity required" };
  }

  // First check for active review
  const activeRows = await query<{
    id: string;
    started_at: string;
    started_by: string;
  }>(
    `SELECT id, started_at, started_by 
     FROM mandates_housekeeping.entity_review_mode 
     WHERE entity = $1 AND ended_at IS NULL 
     ORDER BY started_at DESC LIMIT 1`,
    [entity],
  );

  if (activeRows.length > 0) {
    return {
      success: true,
      data: {
        reviewSessionId: activeRows[0].id,
        isActive: true,
        startedAt: activeRows[0].started_at,
        startedBy: activeRows[0].started_by,
        endedAt: null,
      },
    };
  }

  // Check for most recent completed review
  const completedRows = await query<{
    id: string;
    started_at: string;
    started_by: string;
    ended_at: string;
  }>(
    `SELECT id, started_at, started_by, ended_at 
     FROM mandates_housekeeping.entity_review_mode 
     WHERE entity = $1 AND ended_at IS NOT NULL 
     ORDER BY ended_at DESC LIMIT 1`,
    [entity],
  );

  if (completedRows.length > 0) {
    return {
      success: true,
      data: {
        reviewSessionId: completedRows[0].id,
        isActive: false,
        startedAt: completedRows[0].started_at,
        startedBy: completedRows[0].started_by,
        endedAt: completedRows[0].ended_at,
      },
    };
  }

  return {
    success: true,
    data: {
      reviewSessionId: null,
      isActive: false,
      startedAt: null,
      startedBy: null,
      endedAt: null,
    },
  };
}

/**
 * Get review change info for all documents in an entity
 * Returns baseline and in-review decisions for comparison
 *
 * Baseline = state before ANY review started (persistent)
 * Current = latest decision (may be from any review session)
 * Changes persist across sessions until responded to.
 */
export async function getEntityReviewChangesAction(
  entity: string,
  reviewSessionId: string,
): Promise<ActionResult<Record<string, ReviewChangeInfo>>> {
  if (!entity || !reviewSessionId) {
    return { success: false, error: "entity and reviewSessionId required" };
  }

  // Get the FIRST review session start time (establishes true baseline)
  const firstReviewRows = await query<{ started_at: string }>(
    `SELECT started_at FROM mandates_housekeeping.entity_review_mode 
     WHERE entity = $1 
     ORDER BY started_at ASC LIMIT 1`,
    [entity],
  );

  if (firstReviewRows.length === 0) {
    return { success: false, error: "no review sessions found" };
  }

  const firstReviewStartedAt = firstReviewRows[0].started_at;

  // Get baseline decisions (last decision BEFORE first review for each document)
  // Only get decisions that were NOT made during any review
  const baselineRows = await query<DecisionRow>(
    `SELECT DISTINCT ON (d.document_symbol, COALESCE(d.subprogramme, ''))
       d.*, u.entity as user_entity, approver.entity as approved_by_entity
     FROM mandates_housekeeping.mandate_decisions d
     LEFT JOIN mandates_housekeeping.users u ON d.user_email = u.email
     LEFT JOIN mandates_housekeeping.users approver ON d.approved_by = approver.email
     WHERE d.entity = $1 
       AND d.created_at < $2
       AND d.review_session_id IS NULL
     ORDER BY d.document_symbol, COALESCE(d.subprogramme, ''), d.created_at DESC`,
    [entity, firstReviewStartedAt],
  );

  // Get current decisions (latest decision for each document)
  const currentRows = await query<DecisionRow>(
    `SELECT DISTINCT ON (d.document_symbol, COALESCE(d.subprogramme, ''))
       d.*, u.entity as user_entity, approver.entity as approved_by_entity
     FROM mandates_housekeeping.mandate_decisions d
     LEFT JOIN mandates_housekeeping.users u ON d.user_email = u.email
     LEFT JOIN mandates_housekeeping.users approver ON d.approved_by = approver.email
     WHERE d.entity = $1
     ORDER BY d.document_symbol, COALESCE(d.subprogramme, ''), d.created_at DESC`,
    [entity],
  );

  // Get all responses from ALL review sessions (changes persist until responded to)
  const responseRows = await query<ResponseRow>(
    `SELECT DISTINCT ON (r.entity, r.document_symbol, COALESCE(r.subprogramme, ''))
       r.*
     FROM mandates_housekeeping.review_change_responses r
     WHERE r.entity = $1
     ORDER BY r.entity, r.document_symbol, COALESCE(r.subprogramme, ''), r.responded_at DESC`,
    [entity],
  );

  // Build maps
  const baselineMap: Record<string, MandateDecision> = {};
  for (const row of baselineRows) {
    const key = `${row.document_symbol}:${row.subprogramme || ""}`;
    baselineMap[key] = toDecision(row);
  }

  const currentMap: Record<string, MandateDecision> = {};
  for (const row of currentRows) {
    const key = `${row.document_symbol}:${row.subprogramme || ""}`;
    currentMap[key] = toDecision(row);
  }

  const responseMap: Record<string, ReviewChangeResponse> = {};
  for (const row of responseRows) {
    const key = `${row.document_symbol}:${row.subprogramme || ""}`;
    responseMap[key] = toResponse(row);
  }

  // Build result - include all documents that have decisions
  const allKeys = new Set([
    ...Object.keys(baselineMap),
    ...Object.keys(currentMap),
  ]);

  const result: Record<string, ReviewChangeInfo> = {};
  for (const key of allKeys) {
    const baseline = baselineMap[key] || null;
    const current = currentMap[key] || null;

    // Always check for changes between baseline and current
    // This works correctly because:
    // - If decision was made during ANY review, it will differ from baseline
    // - If decision was made outside review, baseline and current will match (no change)
    const hasChange = detectChange(baseline, current);

    result[key] = {
      baseline,
      inReviewDecision: current,
      hasChange,
      response: responseMap[key] || null,
    };
  }

  return { success: true, data: result };
}

/**
 * Detect if there's a meaningful change between baseline and in-review decision
 */
function detectChange(
  baseline: MandateDecision | null,
  inReview: MandateDecision | null,
): boolean {
  // If there's no in-review decision, no change happened during review
  if (!inReview) return false;

  // If no baseline existed and now there's a decision, that's a change
  if (!baseline) return true;

  // Compare the actual decision values
  if (baseline.decision !== inReview.decision) return true;
  if (baseline.newSymbol !== inReview.newSymbol) return true;
  if (baseline.decisionReason !== inReview.decisionReason) return true;
  if (baseline.otherReason !== inReview.otherReason) return true;

  return false;
}

/**
 * Accept a review change (mark it as acknowledged)
 */
export async function acceptReviewChangeAction(
  params: {
    entity: string;
    documentSymbol: string;
    subprogramme: string | null;
    reviewSessionId: string;
    comment?: string;
  },
  expectedBudgetVersion?: string,
): Promise<ActionResult<ReviewChangeResponse>> {
  void params;
  void expectedBudgetVersion;
  return {
    success: false,
    error: "Use the separate submission and review columns.",
  };
}

/**
 * Revert a review change (restore the baseline decision)
 */
export async function revertReviewChangeAction(
  params: {
    entity: string;
    documentSymbol: string;
    subprogramme: string | null;
    reviewSessionId: string;
    comment?: string;
  },
  expectedBudgetVersion?: string,
): Promise<ActionResult<ReviewChangeResponse>> {
  void params;
  void expectedBudgetVersion;
  return {
    success: false,
    error: "Use the separate submission and review columns.",
  };
}
