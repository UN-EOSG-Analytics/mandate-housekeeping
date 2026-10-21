"use server";

import { getReviewWriteError } from "@/lib/db/review-cycle";
import { revalidatePath } from "next/cache";
import { query, transaction } from "@/lib/db/db";
import { lockEntityReview } from "@/lib/db/review-lock";
import { getCurrentUser } from "@/features/auth/auth";

// Return type for actions
type ActionResult<T = void> =
  | { success: true; data?: T }
  | { success: false; error: string };

export interface ReviewModeStatus {
  isUnderReview: boolean;
  /** ID of the current/last review session (for tracking changes) */
  reviewSessionId: string | null;
  startedBy: string | null;
  startedByEntity: string | null;
  startedAt: string | null;
}

/**
 * Check if an entity is currently under review
 */
export async function getReviewModeStatusAction(
  entity: string,
): Promise<ActionResult<ReviewModeStatus>> {
  if (!entity) {
    return { success: false, error: "entity required" };
  }

  const rows = await query<{
    id: string;
    started_by: string;
    started_at: string;
    user_entity: string | null;
  }>(
    `SELECT r.id, r.started_by, r.started_at, u.entity as user_entity
     FROM mandates_housekeeping.entity_review_mode r
     LEFT JOIN mandates_housekeeping.users u ON r.started_by = u.email
     WHERE r.entity = $1 AND r.ended_at IS NULL`,
    [entity],
  );

  if (rows.length === 0) {
    // Check if there's a recently completed review (for showing change indicators post-review)
    const recentReviewRows = await query<{ id: string }>(
      `SELECT id FROM mandates_housekeeping.entity_review_mode 
       WHERE entity = $1 AND ended_at IS NOT NULL
       ORDER BY ended_at DESC LIMIT 1`,
      [entity],
    );

    return {
      success: true,
      data: {
        isUnderReview: false,
        reviewSessionId: recentReviewRows[0]?.id || null,
        startedBy: null,
        startedByEntity: null,
        startedAt: null,
      },
    };
  }

  return {
    success: true,
    data: {
      isUnderReview: true,
      reviewSessionId: rows[0].id,
      startedBy: rows[0].started_by,
      startedByEntity: rows[0].user_entity,
      startedAt: rows[0].started_at,
    },
  };
}

/**
 * Start review mode for an entity (reviewers only)
 */
export async function startReviewModeAction(
  entity: string,
  expectedBudgetVersion?: string,
): Promise<ActionResult<ReviewModeStatus>> {
  const cycleError = await getReviewWriteError(expectedBudgetVersion);
  if (cycleError) return { success: false, error: cycleError };

  if (!entity) return { success: false, error: "entity required" };
  const result = await transaction<ActionResult<ReviewModeStatus>>(
    async (tx) => {
      const user = await getCurrentUser(tx);
      if (!user) return { success: false, error: "unauthorized" };
      if (
        !user.isReviewer ||
        (!user.canReviewAnyEntity && user.entity !== entity)
      )
        return {
          success: false,
          error: "Only authorized reviewers can start review for this entity",
        };
      await lockEntityReview(tx, entity);
      const existing = await tx<{ started_by: string }>(
        `SELECT started_by FROM mandates_housekeeping.entity_review_mode WHERE entity = $1 AND ended_at IS NULL`,
        [entity],
      );
      if (existing.length)
        return {
          success: false,
          error: `Entity is already under review by ${existing[0].started_by}`,
        };
      const inserted = await tx<{ id: string; started_at: string }>(
        `INSERT INTO mandates_housekeeping.entity_review_mode (entity, started_by) VALUES ($1, $2) RETURNING id, started_at`,
        [entity, user.email],
      );
      return {
        success: true,
        data: {
          isUnderReview: true,
          reviewSessionId: inserted[0].id,
          startedBy: user.email,
          startedByEntity: user.entity,
          startedAt: inserted[0].started_at,
        },
      };
    },
  );
  if (result.success) revalidatePath(`/entity/${encodeURIComponent(entity)}`);
  return result;
}

/**
 * End review mode for an entity (reviewers only)
 */
export async function endReviewModeAction(
  entity: string,
  expectedBudgetVersion?: string,
): Promise<ActionResult<ReviewModeStatus>> {
  const cycleError = await getReviewWriteError(expectedBudgetVersion);
  if (cycleError) return { success: false, error: cycleError };

  if (!entity) return { success: false, error: "entity required" };
  const result = await transaction<ActionResult<ReviewModeStatus>>(
    async (tx) => {
      const user = await getCurrentUser(tx);
      if (!user) return { success: false, error: "unauthorized" };
      if (
        !user.isReviewer ||
        (!user.canReviewAnyEntity && user.entity !== entity)
      )
        return {
          success: false,
          error: "Only authorized reviewers can end review for this entity",
        };
      await lockEntityReview(tx, entity);
      const ended = await tx<{ id: string }>(
        `UPDATE mandates_housekeeping.entity_review_mode SET ended_at = NOW(), ended_by = $2
       WHERE entity = $1 AND ended_at IS NULL RETURNING id`,
        [entity, user.email],
      );
      return {
        success: true,
        data: {
          isUnderReview: false,
          reviewSessionId: ended[0]?.id ?? null,
          startedBy: null,
          startedByEntity: null,
          startedAt: null,
        },
      };
    },
  );
  if (result.success) revalidatePath(`/entity/${encodeURIComponent(entity)}`);
  return result;
}

/**
 * Check if entity is under review - for use in decision actions
 * Returns error string if blocked, null if allowed
 */
export async function checkReviewModeBlock(
  entity: string,
  userEmail: string,
  isReviewer: boolean,
): Promise<string | null> {
  // Reviewers can always make changes
  if (isReviewer) {
    return null;
  }

  const rows = await query<{ started_by: string }>(
    `SELECT started_by FROM mandates_housekeeping.entity_review_mode 
     WHERE entity = $1 AND ended_at IS NULL`,
    [entity],
  );

  if (rows.length > 0) {
    return "review_mode_blocked";
  }

  return null;
}
