"use server";

/**
 * Mandate decision management
 *
 * Handles the core workflow for mandate housekeeping:
 * - Entities make decisions about each mandate
 * - Decisions include optional justifications and replacement document symbols
 * - Reviewers record independent review decisions
 * - Review sessions lock entity submissions; review edits remain available
 *
 * Each decision represents an entity's proposed action on a specific mandate citation.
 */

import { getCommentReadState } from "../services/comment-notifications";
import { getBudgetVersion } from "@/lib/db/review-cycle";
import { getReviewWriteError } from "@/lib/db/review-cycle";
import { getCurrentUser } from "@/features/auth/auth";
import { getEntityPermissions } from "@/features/auth/permissions";
import { lockEntityReview } from "@/lib/db/review-lock";
import { getDecisionTracks } from "../services/decision-tracks";
import { getVisibleDecisions } from "../services/decision-visibility";
import { query, transaction } from "@/lib/db/db";
import type { MandateComment, MandateDecision, MandateState } from "@/types";

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
  decision_track: "entity" | "review";
  reviewed_submission_id: string | null;
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
  decisionTrack: row.decision_track ?? "entity",
  reviewedSubmissionId: row.reviewed_submission_id ?? null,
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
export async function getEntityDecisionsAction(
  entity: string,
  documentSymbols?: string[],
): Promise<
  ActionResult<{
    states: MandateState[];
    totalComments: Record<string, number>;
  }>
> {
  if (!entity) {
    return { success: false, error: "entity required" };
  }

  if (
    documentSymbols &&
    (documentSymbols.length > 10000 ||
      documentSymbols.some((symbol) => typeof symbol !== "string"))
  ) {
    return { success: false, error: "Invalid document symbols" };
  }
  return transaction(async (tx) => {
    // Related reads share one cycle-scoped transaction, including batch refreshes.
    const user = await getCurrentUser(tx);
    if (!user) return { success: false as const, error: "unauthorized" };
    const canViewConversation = getEntityPermissions(
      user,
      entity,
    ).canViewConversation;
    const [decisionRows, commentRows, totalCommentRows] = await Promise.all([
      tx<DecisionRow>(
        `SELECT d.*, u.entity as user_entity, approver.entity as approved_by_entity
       FROM mandates_housekeeping.mandate_decisions d
       LEFT JOIN mandates_housekeeping.users u ON d.user_email = u.email
       LEFT JOIN mandates_housekeeping.users approver ON d.approved_by = approver.email
       WHERE d.entity = $1 AND ($2::text[] IS NULL OR d.document_symbol = ANY($2))
       ORDER BY d.created_at, d.id`,
        [entity, documentSymbols ?? null],
      ),
      canViewConversation
        ? tx<CommentRow>(
            `SELECT c.*, u.entity as user_entity
       FROM mandates_housekeeping.mandate_comments c
       LEFT JOIN mandates_housekeeping.users u ON c.user_email = u.email
       WHERE c.entity = $1 AND ($2::text[] IS NULL OR c.document_symbol = ANY($2))
       ORDER BY c.created_at`,
            [entity, documentSymbols ?? null],
          )
        : Promise.resolve<CommentRow[]>([]),
      tx<{ document_symbol: string; count: string }>(
        `SELECT document_symbol, COUNT(*)::text as count
       FROM mandates_housekeeping.mandate_comments
       WHERE ($1::text[] IS NULL OR document_symbol = ANY($1))
         AND ($2::boolean OR entity = $3)
       GROUP BY document_symbol`,
        [documentSymbols ?? null, user.isReviewer, user.entity],
      ),
    ]);

    // Build total comments lookup
    const totalCommentsMap: Record<string, number> = {};
    for (const row of totalCommentRows) {
      totalCommentsMap[row.document_symbol] = parseInt(row.count);
    }

    // Group into MandateState objects
    const stateMap: Record<string, MandateState> = {};

    for (const decision of getVisibleDecisions(
      decisionRows.map(toDecision),
      user,
    )) {
      const key = `${decision.documentSymbol}:${decision.subprogramme || ""}`;
      if (!stateMap[key]) {
        stateMap[key] = {
          documentSymbol: decision.documentSymbol,
          entity: decision.entity,
          subprogramme: decision.subprogramme,
          decision: null,
          decisions: [],
          comments: [],
        };
      }
      stateMap[key].decisions.push(decision);
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

    // Resolve each history once, after grouping, rather than sorting every prefix.
    for (const state of Object.values(stateMap)) {
      const tracks = getDecisionTracks(state.decisions);
      state.decision = tracks.submission;
      state.reviewDecision = tracks.review;
      state.reviewStale = tracks.reviewStale;
    }
    return {
      success: true as const,
      data: {
        states: Object.values(stateMap),
        totalComments: totalCommentsMap,
      },
    };
  });
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

  const user = await getCurrentUser();
  if (!user) return { success: false, error: "unauthorized" };
  const canViewConversation = getEntityPermissions(
    user,
    entity,
  ).canViewConversation;

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
       ORDER BY d.created_at, d.id`,
      queryParams,
    ),
    canViewConversation
      ? query<CommentRow>(
          `SELECT c.*, u.entity as user_entity
       FROM mandates_housekeeping.mandate_comments c
       LEFT JOIN mandates_housekeeping.users u ON c.user_email = u.email
       WHERE c.document_symbol = $1 AND c.entity = $2 ${commentSubprogrammeCondition}
       ORDER BY c.created_at`,
          queryParams,
        )
      : Promise.resolve<CommentRow[]>([]),
  ]);

  if (decisionRows.length === 0 && commentRows.length === 0) {
    return { success: true, data: null };
  }

  const decisions = getVisibleDecisions(decisionRows.map(toDecision), user);
  const comments = commentRows.map(toComment);

  return {
    success: true,
    data: {
      documentSymbol,
      entity,
      subprogramme,
      decision: getDecisionTracks(decisions).submission,
      reviewDecision: getDecisionTracks(decisions).review,
      reviewStale: getDecisionTracks(decisions).reviewStale,
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
  expectedBudgetVersion?: string,
  since?: string,
  expectedViewer?: string,
): Promise<
  ActionResult<{
    decisions: MandateDecision[];
    comments: MandateComment[];
    readCommentIds: string[];
    serverTime: string;
  }>
> {
  if (!symbol) return { success: false, error: "symbol required" };
  const sinceDate = since ? new Date(since) : null;
  if (sinceDate && !Number.isFinite(sinceDate.getTime()))
    return { success: false, error: "Invalid activity cursor" };
  const version = await getBudgetVersion();
  if (expectedBudgetVersion && expectedBudgetVersion !== version)
    return {
      success: false,
      error: "The submission cycle has changed. Reload this page.",
    };
  return transaction(async (tx) => {
    const user = await getCurrentUser(tx);
    if (!user || (expectedViewer && expectedViewer !== user.email))
      return { success: false, error: "unauthorized" };
    const [clock] = await tx<{ server_time: string }>(
      "SELECT clock_timestamp()::text AS server_time",
    );
    const decisionRows = await tx<DecisionRow>(
      `SELECT d.*, u.entity as user_entity, approver.entity as approved_by_entity
       FROM mandates_housekeeping.mandate_decisions d
       LEFT JOIN mandates_housekeeping.users u ON d.user_email = u.email
       LEFT JOIN mandates_housekeeping.users approver ON d.approved_by = approver.email
       WHERE d.document_symbol = $1
         AND ($2::timestamptz IS NULL OR d.created_at >= $2::timestamptz - interval '30 seconds'
           OR (NOT $3::boolean AND d.entity IS DISTINCT FROM $4))
       ORDER BY d.created_at, d.id`,
      [symbol, sinceDate?.toISOString() ?? null, user.isReviewer, user.entity],
    );
    const commentRows = await tx<CommentRow>(
      `SELECT c.*, u.entity as user_entity
       FROM mandates_housekeeping.mandate_comments c
       LEFT JOIN mandates_housekeeping.users u ON c.user_email = u.email
       WHERE c.document_symbol = $1
         AND ($2::timestamptz IS NULL OR GREATEST(c.created_at, c.updated_at, c.resolved_at) >= $2::timestamptz - interval '30 seconds')
         AND ($3::boolean OR c.entity = $4)
       ORDER BY c.created_at, c.id`,
      [symbol, sinceDate?.toISOString() ?? null, user.isReviewer, user.entity],
    );
    const readCommentIds = await getCommentReadState(tx, user, symbol, version);
    return {
      success: true,
      data: {
        decisions: getVisibleDecisions(
          decisionRows.map(toDecision),
          user,
        ).filter(
          (decision) =>
            !sinceDate ||
            new Date(decision.createdAt).getTime() >=
              sinceDate.getTime() - 30_000,
        ),
        comments: commentRows.map(toComment),
        readCommentIds,
        serverTime: clock.server_time,
      },
    };
  }, version);
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
    decisionTrack?: "entity" | "review";
    reviewedSubmissionId?: string | null;
    agreeWithSubmission?: boolean;
    newSymbol?: string | null;
    manualMetadata?: ManualMetadata | null;
    decisionReason?: string | null;
    otherReason?: string | null;
  },
  expectedBudgetVersion?: string,
): Promise<ActionResult<MandateDecision>> {
  const cycleError = await getReviewWriteError(expectedBudgetVersion);
  if (cycleError) return { success: false, error: cycleError };

  // Auth, review status and the event write share one cycle-scoped transaction.
  // The returned event updates the caller; polling supplies fresh activity.
  return transaction<ActionResult<MandateDecision>>(async (tx) => {
    const user = await getCurrentUser(tx);
    if (!user) {
      return { success: false, error: "unauthorized" };
    }

    const {
      documentSymbol,
      entity,
      subprogramme,
      decision: requestedDecision,
      newSymbol: requestedNewSymbol,
      manualMetadata: requestedMetadata,
    } = params;
    let decision = requestedDecision;
    let newSymbol = requestedNewSymbol;
    let manualMetadata = requestedMetadata;
    let decisionReason = params.decisionReason || null;
    let otherReason = params.otherReason || null;
    const track = params.decisionTrack ?? "entity";
    if (track !== "entity" && track !== "review")
      return { success: false, error: "Invalid decision track" };
    const permissions = getEntityPermissions(user, entity);
    if (track === "entity" && !permissions.canEditSubmission)
      return {
        success: false,
        error: "Entity submissions can only be edited by their own entity",
      };
    if (track === "review" && !permissions.canReview)
      return {
        success: false,
        error: "Only reviewers can edit review decisions",
      };
    await lockEntityReview(tx, entity);
    const submissions = await tx<DecisionRow>(
      `SELECT * FROM mandates_housekeeping.mandate_decisions
      WHERE entity = $1 AND document_symbol = $2 AND subprogramme IS NOT DISTINCT FROM $3
        AND decision_track = 'entity' ORDER BY created_at DESC, id DESC LIMIT 1`,
      [entity, documentSymbol, subprogramme || null],
    );
    const submission = submissions[0];
    if (
      track === "review" &&
      params.reviewedSubmissionId !== (submission?.id ?? null)
    )
      return {
        success: false,
        error: "Submission changed. Refresh and review the latest submission.",
      };
    if (params.agreeWithSubmission) {
      if (track !== "review" || !submission || submission.decision === "cancel")
        return { success: false, error: "No entity submission to agree with" };
      decision = submission.decision;
      newSymbol = submission.new_symbol || undefined;
      manualMetadata = submission.manual_metadata || undefined;
      decisionReason = submission.decision_reason;
      otherReason = submission.other_reason;
    }

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

    // Get the active review session ID (if any) to link this decision to it
    const reviewSessionRows = await tx<{ id: string }>(
      `SELECT id FROM mandates_housekeeping.entity_review_mode
     WHERE entity = $1 AND ended_at IS NULL`,
      [entity],
    );
    const reviewSessionId = reviewSessionRows[0]?.id || null;
    if (reviewSessionId && track === "entity") {
      return { success: false, error: "review_mode_blocked" };
    }

    // Insert new decision event
    const rows = await tx<DecisionRow>(
      `WITH inserted AS (
      INSERT INTO mandates_housekeeping.mandate_decisions 
        (document_symbol, entity, subprogramme, decision, new_symbol, manual_metadata, decision_reason, other_reason, user_email, review_session_id, decision_track, reviewed_submission_id, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, clock_timestamp())
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
        decisionReason,
        decisionReason === "other" ? otherReason : null,
        user.email,
        track === "review" ? reviewSessionId : null,
        track,
        track === "review" ? (submission?.id ?? null) : null,
      ],
    );

    return { success: true, data: toDecision(rows[0]) };
  });
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
  void decisionId;
  void approved;
  void expectedBudgetVersion;
  return {
    success: false,
    error:
      "Use the review decision column to agree or record a different decision.",
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

  // Auth, review status and the event write share one cycle-scoped transaction.
  // The returned event updates the caller; polling supplies fresh activity.
  return transaction<ActionResult<MandateDecision>>(async (tx) => {
    const user = await getCurrentUser(tx);
    if (!user) {
      return { success: false, error: "unauthorized" };
    }

    const { decisionId, decisionReason, otherReason } = params;

    if (!decisionId) {
      return { success: false, error: "decisionId required" };
    }

    // Get the existing decision to check permissions
    const existingRows = await tx<DecisionRow & { review_active: boolean }>(
      `SELECT d.*, EXISTS (SELECT 1 FROM mandates_housekeeping.entity_review_mode r
       WHERE r.entity = d.entity AND r.ended_at IS NULL) AS review_active, u.entity as user_entity, approver.entity as approved_by_entity
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
    if (existing.decision === "cancel")
      return {
        success: false,
        error: "A cleared decision has no editable reason",
      };

    const permissions = getEntityPermissions(user, existing.entity);
    if (
      (existing.decision_track ?? "entity") === "entity" &&
      !permissions.canEditSubmission
    )
      return {
        success: false,
        error:
          "Entity submission reasons can only be edited by their own entity",
      };
    if (existing.decision_track === "review" && !permissions.canReview)
      return {
        success: false,
        error: "Only reviewers can edit review decisions",
      };
    await lockEntityReview(tx, existing.entity);
    const latest = await tx<{ id: string }>(
      `SELECT id FROM mandates_housekeeping.mandate_decisions
      WHERE entity = $1 AND document_symbol = $2 AND subprogramme IS NOT DISTINCT FROM $3
        AND decision_track = $4 ORDER BY created_at DESC, id DESC LIMIT 1`,
      [
        existing.entity,
        existing.document_symbol,
        existing.subprogramme,
        existing.decision_track ?? "entity",
      ],
    );
    if (latest[0]?.id !== decisionId)
      return {
        success: false,
        error: "Decision changed. Refresh before editing its reason.",
      };
    const sessions = await tx<{ id: string }>(
      `SELECT id FROM mandates_housekeeping.entity_review_mode WHERE entity = $1 AND ended_at IS NULL`,
      [existing.entity],
    );
    if (sessions.length && existing.decision_track !== "review") {
      return { success: false, error: "review_mode_blocked" };
    }

    // Create a new decision record to preserve reason history (append-only)
    // This creates a new entry with the same decision type but updated reason
    const rows = await tx<DecisionRow>(
      `WITH inserted AS (
      INSERT INTO mandates_housekeeping.mandate_decisions 
        (document_symbol, entity, subprogramme, decision, new_symbol, manual_metadata, decision_reason, other_reason, user_email, review_session_id, decision_track, reviewed_submission_id, created_at)
      SELECT 
        document_symbol, 
        entity, 
        subprogramme, 
        decision, 
        new_symbol, 
        manual_metadata,
        $2,  -- new decision_reason
        $3,  -- new other_reason
        $4,  -- current user (who is updating the reason)
        $5, decision_track, reviewed_submission_id, clock_timestamp()
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
        existing.decision_track === "review" ? (sessions[0]?.id ?? null) : null,
      ],
    );

    return { success: true, data: toDecision(rows[0]) };
  });
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
  void entity;
  void expectedBudgetVersion;
  return {
    success: false,
    error:
      "Bulk deletion is no longer available. Clear individual review decisions to preserve submission history.",
  };
}
