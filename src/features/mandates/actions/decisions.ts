"use server";

/**
 * Mandate decision management
 *
 * Handles the core workflow for mandate housekeeping:
 * - Entities make decisions about each mandate
 * - Decisions include optional justifications and replacement document symbols
 * - DMSPC reviewers approve decisions before finalization
 * - Decisions are blocked during review mode (entity in read-only state)
 *
 * Each decision represents an entity's proposed action on a specific mandate citation.
 */

import { getReviewWriteError } from "@/lib/db/review-cycle";
import { getCurrentUser } from "@/features/auth/auth";
import { query } from "@/lib/db/db";
import type { MandateComment, MandateDecision, MandateState } from "@/types";
import { revalidatePath } from "next/cache";
import { checkReviewModeBlock } from "./review-mode";

// Return type for actions
type ActionResult<T = void> =
  | { success: true; data?: T }
  | { success: false; error: string };

interface ManualMetadata {
  title?: string;
  body?: string;
  year?: number;
  link?: string;
}

interface DecisionRow {
  id: string;
  document_symbol: string;
  entity: string;
  subprogramme: string | null;
  decision: string;
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
  review_session_id: string | null;
}

interface CommentRow {
  id: string;
  document_symbol: string;
  entity: string;
  subprogramme: string | null;
  comment: string;
  user_email: string;
  user_entity: string | null;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}

const toDecision = (row: DecisionRow): MandateDecision => ({
  id: row.id,
  documentSymbol: row.document_symbol,
  entity: row.entity,
  subprogramme: row.subprogramme,
  decision: row.decision as MandateDecision["decision"],
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

const toComment = (row: CommentRow): MandateComment => ({
  id: row.id,
  documentSymbol: row.document_symbol,
  entity: row.entity,
  subprogramme: row.subprogramme,
  comment: row.comment,
  userEmail: row.user_email,
  userEntity: row.user_entity,
  createdAt: row.created_at,
  resolvedAt: row.resolved_at,
  resolvedBy: row.resolved_by,
});

/**
 * Get all decisions and comments for a specific entity
 */
export async function getEntityDecisionsAction(entity: string): Promise<
  ActionResult<{
    states: MandateState[];
    totalComments: Record<string, number>;
  }>
> {
  if (!entity) {
    return { success: false, error: "entity required" };
  }

  // Get all decisions, comments, and total comment counts per document
  const [decisionRows, commentRows, totalCommentRows] = await Promise.all([
    query<DecisionRow>(
      `SELECT d.*, u.entity as user_entity, approver.entity as approved_by_entity
       FROM mandates_housekeeping.mandate_decisions d
       LEFT JOIN mandates_housekeeping.users u ON d.user_email = u.email
       LEFT JOIN mandates_housekeeping.users approver ON d.approved_by = approver.email
       WHERE d.entity = $1
       ORDER BY d.created_at`,
      [entity],
    ),
    query<CommentRow>(
      `SELECT c.*, u.entity as user_entity
       FROM mandates_housekeeping.mandate_comments c
       LEFT JOIN mandates_housekeeping.users u ON c.user_email = u.email
       WHERE c.entity = $1 
       ORDER BY c.created_at`,
      [entity],
    ),
    query<{ document_symbol: string; count: string }>(
      `SELECT document_symbol, COUNT(*)::text as count 
       FROM mandates_housekeeping.mandate_comments 
       GROUP BY document_symbol`,
      [],
    ),
  ]);

  // Build total comments lookup
  const totalCommentsMap: Record<string, number> = {};
  for (const row of totalCommentRows) {
    totalCommentsMap[row.document_symbol] = parseInt(row.count);
  }

  // Group into MandateState objects
  const stateMap: Record<string, MandateState> = {};

  for (const row of decisionRows) {
    const key = `${row.document_symbol}:${row.subprogramme || ""}`;
    if (!stateMap[key]) {
      stateMap[key] = {
        documentSymbol: row.document_symbol,
        entity: row.entity,
        subprogramme: row.subprogramme,
        decision: null,
        decisions: [],
        comments: [],
      };
    }
    const decision = toDecision(row);
    stateMap[key].decisions.push(decision);
    // Track latest decision (overwrites as we iterate, results are ORDER BY created_at)
    stateMap[key].decision = decision;
  }

  for (const row of commentRows) {
    const key = `${row.document_symbol}:${row.subprogramme || ""}`;
    if (!stateMap[key]) {
      stateMap[key] = {
        documentSymbol: row.document_symbol,
        entity: row.entity,
        subprogramme: row.subprogramme,
        decision: null,
        decisions: [],
        comments: [],
      };
    }
    stateMap[key].comments.push(toComment(row));
  }

  return {
    success: true,
    data: {
      states: Object.values(stateMap),
      totalComments: totalCommentsMap,
    },
  };
}

/**
 * Get state for a single mandate (document + entity + subprogramme)
 * Used for granular real-time updates
 */
export async function getSingleMandateStateAction(params: {
  documentSymbol: string;
  entity: string;
  subprogramme: string | null;
}): Promise<ActionResult<MandateState | null>> {
  const { documentSymbol, entity, subprogramme } = params;

  if (!documentSymbol || !entity) {
    return { success: false, error: "documentSymbol and entity required" };
  }

  const decisionSubprogrammeCondition = subprogramme
    ? `AND d.subprogramme = $3`
    : `AND d.subprogramme IS NULL`;

  const commentSubprogrammeCondition = subprogramme
    ? `AND c.subprogramme = $3`
    : `AND c.subprogramme IS NULL`;

  const queryParams = subprogramme
    ? [documentSymbol, entity, subprogramme]
    : [documentSymbol, entity];

  const [decisionRows, commentRows] = await Promise.all([
    query<DecisionRow>(
      `SELECT d.*, u.entity as user_entity, approver.entity as approved_by_entity
       FROM mandates_housekeeping.mandate_decisions d
       LEFT JOIN mandates_housekeeping.users u ON d.user_email = u.email
       LEFT JOIN mandates_housekeeping.users approver ON d.approved_by = approver.email
       WHERE d.document_symbol = $1 AND d.entity = $2 ${decisionSubprogrammeCondition}
       ORDER BY d.created_at`,
      queryParams,
    ),
    query<CommentRow>(
      `SELECT c.*, u.entity as user_entity
       FROM mandates_housekeeping.mandate_comments c
       LEFT JOIN mandates_housekeeping.users u ON c.user_email = u.email
       WHERE c.document_symbol = $1 AND c.entity = $2 ${commentSubprogrammeCondition}
       ORDER BY c.created_at`,
      queryParams,
    ),
  ]);

  if (decisionRows.length === 0 && commentRows.length === 0) {
    return { success: true, data: null };
  }

  const decisions = decisionRows.map(toDecision);
  const comments = commentRows.map(toComment);

  return {
    success: true,
    data: {
      documentSymbol,
      entity,
      subprogramme,
      decision: decisions.length > 0 ? decisions[decisions.length - 1] : null,
      decisions,
      comments,
    },
  };
}

/**
 * Get all decisions and comments for a specific document across all entities
 */
export async function getDocumentDecisionsAction(
  symbol: string,
): Promise<
  ActionResult<{ decisions: MandateDecision[]; comments: MandateComment[] }>
> {
  if (!symbol) {
    return { success: false, error: "symbol required" };
  }

  const [decisionRows, commentRows] = await Promise.all([
    query<DecisionRow>(
      `SELECT d.*, u.entity as user_entity, approver.entity as approved_by_entity
       FROM mandates_housekeeping.mandate_decisions d
       LEFT JOIN mandates_housekeeping.users u ON d.user_email = u.email
       LEFT JOIN mandates_housekeeping.users approver ON d.approved_by = approver.email
       WHERE d.document_symbol = $1
       ORDER BY d.created_at`,
      [symbol],
    ),
    query<CommentRow>(
      `SELECT c.*, u.entity as user_entity
       FROM mandates_housekeeping.mandate_comments c
       LEFT JOIN mandates_housekeeping.users u ON c.user_email = u.email
       WHERE c.document_symbol = $1 
       ORDER BY c.created_at`,
      [symbol],
    ),
  ]);

  return {
    success: true,
    data: {
      decisions: decisionRows.map(toDecision),
      comments: commentRows.map(toComment),
    },
  };
}

/**
 * Create a new mandate decision
 */
export async function createDecisionAction(
  params: {
    documentSymbol: string;
    entity: string;
    subprogramme: string | null;
    decision: string;
    newSymbol?: string | null;
    manualMetadata?: ManualMetadata | null;
  },
  expectedBudgetVersion?: string,
): Promise<ActionResult<MandateDecision>> {
  const cycleError = await getReviewWriteError(expectedBudgetVersion);
  if (cycleError) return { success: false, error: cycleError };

  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "unauthorized" };
  }

  const {
    documentSymbol,
    entity,
    subprogramme,
    decision,
    newSymbol,
    manualMetadata,
  } = params;

  if (
    [documentSymbol, newSymbol].some(
      (symbol) => symbol && /^\d+\/\d+$/.test(symbol.trim()),
    )
  ) {
    return {
      success: false,
      error:
        "An issuer-scoped document identity is required; a reference number alone is ambiguous",
    };
  }
  if (!documentSymbol || !entity || !decision) {
    return { success: false, error: "invalid request" };
  }

  // Reviewers (DMSPC entity + in allowed_reviewers list) can edit any entity
  if (!user.canReviewAnyEntity && user.entity !== entity) {
    return {
      success: false,
      error: "You can only make decisions for your own entity",
    };
  }

  if (!user.entity && !user.canReviewAnyEntity) {
    return { success: false, error: "You must have an entity assigned" };
  }

  if (!["retain", "remove", "add", "update", "cancel"].includes(decision)) {
    return { success: false, error: "invalid decision" };
  }

  if (decision === "update" && !newSymbol) {
    return { success: false, error: "newSymbol required for update" };
  }

  // Validate manual metadata link if provided
  if (manualMetadata?.link && !/^https?:\/\/.+/.test(manualMetadata.link)) {
    return { success: false, error: "invalid link format" };
  }

  // Check if entity is under review (blocks non-reviewers)
  const reviewBlock = await checkReviewModeBlock(
    entity,
    user.email,
    user.isReviewer,
  );
  if (reviewBlock) {
    return { success: false, error: reviewBlock };
  }

  // Get the active review session ID (if any) to link this decision to it
  const reviewSessionRows = await query<{ id: string }>(
    `SELECT id FROM mandates_housekeeping.entity_review_mode 
     WHERE entity = $1 AND ended_at IS NULL`,
    [entity],
  );
  const reviewSessionId = reviewSessionRows[0]?.id || null;

  // Insert new decision event
  const rows = await query<DecisionRow>(
    `WITH inserted AS (
      INSERT INTO mandates_housekeeping.mandate_decisions 
        (document_symbol, entity, subprogramme, decision, new_symbol, manual_metadata, decision_reason, other_reason, user_email, review_session_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    )
    SELECT i.*, u.entity as user_entity, NULL::text as approved_by_entity
    FROM inserted i
    LEFT JOIN mandates_housekeeping.users u ON i.user_email = u.email`,
    [
      documentSymbol,
      entity,
      subprogramme || null,
      decision,
      newSymbol || null,
      manualMetadata ? JSON.stringify(manualMetadata) : null,
      null, // decision_reason - set later via updateDecisionReasonAction
      null, // other_reason - set later via updateDecisionReasonAction
      user.email,
      reviewSessionId,
    ],
  );

  revalidatePath(`/entity/${entity}`);

  return { success: true, data: toDecision(rows[0]) };
}

/**
 * Approve or unapprove a decision (reviewer only)
 */
export async function approveDecisionAction(
  decisionId: string,
  approved: boolean,
  expectedBudgetVersion?: string,
): Promise<
  ActionResult<{
    id: string;
    approvedBy: string | null;
    approvedAt: string | null;
  }>
> {
  const cycleError = await getReviewWriteError(expectedBudgetVersion);
  if (cycleError) return { success: false, error: cycleError };

  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "unauthorized" };
  }

  if (!user.isReviewer) {
    return { success: false, error: "only reviewers can approve" };
  }

  if (!decisionId) {
    return { success: false, error: "decisionId required" };
  }

  const rows = await query<{
    id: string;
    entity: string;
    approved_by: string | null;
    approved_at: string | null;
  }>(
    approved
      ? `UPDATE mandates_housekeeping.mandate_decisions 
         SET approved_by = $2, approved_at = NOW()
         WHERE id = $1
         RETURNING id, entity, approved_by, approved_at`
      : `UPDATE mandates_housekeeping.mandate_decisions 
         SET approved_by = NULL, approved_at = NULL
         WHERE id = $1
         RETURNING id, entity, approved_by, approved_at`,
    approved ? [decisionId, user.email] : [decisionId],
  );

  if (!rows[0]) {
    return { success: false, error: "decision not found" };
  }

  revalidatePath(`/entity/${rows[0].entity}`);

  return {
    success: true,
    data: {
      id: rows[0].id,
      approvedBy: rows[0].approved_by,
      approvedAt: rows[0].approved_at,
    },
  };
}

/**
 * Update the reason for an existing decision
 */
export async function updateDecisionReasonAction(
  params: {
    decisionId: string;
    decisionReason: string | null;
    otherReason: string | null;
  },
  expectedBudgetVersion?: string,
): Promise<ActionResult<MandateDecision>> {
  const cycleError = await getReviewWriteError(expectedBudgetVersion);
  if (cycleError) return { success: false, error: cycleError };

  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "unauthorized" };
  }

  const { decisionId, decisionReason, otherReason } = params;

  if (!decisionId) {
    return { success: false, error: "decisionId required" };
  }

  // Get the existing decision to check permissions
  const existingRows = await query<DecisionRow>(
    `SELECT d.*, u.entity as user_entity, approver.entity as approved_by_entity
     FROM mandates_housekeeping.mandate_decisions d
     LEFT JOIN mandates_housekeeping.users u ON d.user_email = u.email
     LEFT JOIN mandates_housekeeping.users approver ON d.approved_by = approver.email
     WHERE d.id = $1`,
    [decisionId],
  );

  if (existingRows.length === 0) {
    return { success: false, error: "Decision not found" };
  }

  const existing = existingRows[0];

  // DMSPC users can update any entity, others can only update their own entity
  if (!user.canReviewAnyEntity && user.entity !== existing.entity) {
    return {
      success: false,
      error: "You can only update reasons for your own entity",
    };
  }

  // Check if entity is under review (blocks non-reviewers)
  const reviewBlock = await checkReviewModeBlock(
    existing.entity,
    user.email,
    user.isReviewer,
  );
  if (reviewBlock) {
    return { success: false, error: reviewBlock };
  }

  // Create a new decision record to preserve reason history (append-only)
  // This creates a new entry with the same decision type but updated reason
  const rows = await query<DecisionRow>(
    `WITH inserted AS (
      INSERT INTO mandates_housekeeping.mandate_decisions 
        (document_symbol, entity, subprogramme, decision, new_symbol, manual_metadata, decision_reason, other_reason, user_email)
      SELECT 
        document_symbol, 
        entity, 
        subprogramme, 
        decision, 
        new_symbol, 
        manual_metadata,
        $2,  -- new decision_reason
        $3,  -- new other_reason
        $4   -- current user (who is updating the reason)
      FROM mandates_housekeeping.mandate_decisions
      WHERE id = $1
      RETURNING *
    )
    SELECT i.*, users.entity as user_entity, NULL::text as approved_by_entity
    FROM inserted i
    LEFT JOIN mandates_housekeeping.users users ON i.user_email = users.email`,
    [
      decisionId,
      decisionReason,
      decisionReason === "other" ? otherReason : null,
      user.email,
    ],
  );

  revalidatePath(`/entity/${existing.entity}`);

  return { success: true, data: toDecision(rows[0]) };
}

/**
 * Clear all decisions and comments for an entity (reviewers only)
 * This is a destructive operation that removes all decision history
 */
export async function clearAllEntityDecisionsAction(
  entity: string,
  expectedBudgetVersion?: string,
): Promise<
  ActionResult<{ deletedDecisions: number; deletedComments: number }>
> {
  const cycleError = await getReviewWriteError(expectedBudgetVersion);
  if (cycleError) return { success: false, error: cycleError };

  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "unauthorized" };
  }

  // Only reviewers can clear entity data
  if (!user.isReviewer) {
    return {
      success: false,
      error: "Only reviewers can clear entity decisions",
    };
  }

  if (!entity) {
    return { success: false, error: "entity required" };
  }

  try {
    // Delete all comments for this entity
    const commentsResult = await query<{ count: string }>(
      `WITH deleted AS (
        DELETE FROM mandates_housekeeping.mandate_comments
        WHERE entity = $1
        RETURNING 1
      )
      SELECT COUNT(*)::text as count FROM deleted`,
      [entity],
    );
    const deletedComments = parseInt(commentsResult[0]?.count ?? "0", 10);

    // Delete all decisions for this entity
    const decisionsResult = await query<{ count: string }>(
      `WITH deleted AS (
        DELETE FROM mandates_housekeeping.mandate_decisions
        WHERE entity = $1
        RETURNING 1
      )
      SELECT COUNT(*)::text as count FROM deleted`,
      [entity],
    );
    const deletedDecisions = parseInt(decisionsResult[0]?.count ?? "0", 10);

    revalidatePath(`/entity/${encodeURIComponent(entity)}`);

    return {
      success: true,
      data: {
        deletedDecisions,
        deletedComments,
      },
    };
  } catch (error) {
    console.error("Failed to clear entity decisions:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to clear data",
    };
  }
}
