"use server";

/**
 * Server actions for mandate comments
 * Users can add comments/questions about specific mandates during review.
 * Comments are allowed even during review mode (unlike decisions).
 */

import { getReviewWriteError } from "@/lib/db/review-cycle";
import { revalidatePath } from "next/cache";
import { query } from "@/lib/db/db";
import { getCurrentUser } from "@/features/auth/auth";
import type { MandateComment } from "@/types";

// Return type for actions
type ActionResult<T = void> =
  | { success: true; data?: T }
  | { success: false; error: string };

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
 * Create a new comment on a mandate
 * @param params Comment details (documentSymbol, entity, subprogramme, comment text)
 * Permissions: Users can comment on their own entity, reviewers can comment on any entity
 * Note: Comments allowed during review mode (unlike decisions)
 */
export async function createCommentAction(params: {
  documentSymbol: string;
  entity: string;
  subprogramme: string | null;
  comment: string;
}): Promise<ActionResult<MandateComment>> {
  const cycleError = await getReviewWriteError();
  if (cycleError) return { success: false, error: cycleError };

  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "unauthorized" };
  }

  const { documentSymbol, entity, subprogramme, comment } = params;

  if (/^\d+\/\d+$/.test(documentSymbol?.trim())) {
    return {
      success: false,
      error: "An issuer-scoped document identity is required",
    };
  }
  if (!documentSymbol || !entity || !comment?.trim()) {
    return { success: false, error: "invalid request" };
  }

  // Reviewers (DMSPC entity + in allowed_reviewers list) can comment on any entity
  if (!user.canReviewAnyEntity && user.entity !== entity) {
    return { success: false, error: "You can only comment on your own entity" };
  }

  if (!user.entity && !user.canReviewAnyEntity) {
    return { success: false, error: "You must have an entity assigned" };
  }

  // Note: Comments are always allowed, even during review mode
  // Only decisions are blocked during review

  const rows = await query<CommentRow>(
    `WITH inserted AS (
      INSERT INTO mandates_housekeeping.mandate_comments 
        (document_symbol, entity, subprogramme, comment, user_email)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    )
    SELECT i.*, u.entity as user_entity
    FROM inserted i
    LEFT JOIN mandates_housekeeping.users u ON i.user_email = u.email`,
    [documentSymbol, entity, subprogramme || null, comment.trim(), user.email],
  );

  revalidatePath(`/entity/${entity}`);

  return { success: true, data: toComment(rows[0]) };
}

/**
 * Resolve or unresolve a comment
 * @param commentId The comment UUID to resolve/unresolve
 * @param resolved True to mark resolved, false to unresolve
 * Permissions: Reviewers (DMSPC) can resolve any comment, entities can resolve their own
 */
export async function resolveCommentAction(
  commentId: string,
  resolved: boolean,
): Promise<ActionResult<MandateComment>> {
  const cycleError = await getReviewWriteError();
  if (cycleError) return { success: false, error: cycleError };

  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "unauthorized" };
  }

  if (!commentId) {
    return { success: false, error: "commentId required" };
  }

  // Get the comment to check permissions
  const existingRows = await query<CommentRow>(
    `SELECT c.*, u.entity as user_entity
     FROM mandates_housekeeping.mandate_comments c
     LEFT JOIN mandates_housekeeping.users u ON c.user_email = u.email
     WHERE c.id = $1`,
    [commentId],
  );

  if (existingRows.length === 0) {
    return { success: false, error: "Comment not found" };
  }

  const existing = existingRows[0];

  // Only DMSPC (reviewers) can resolve comments, or the entity can resolve their own comments
  if (!user.canReviewAnyEntity && user.entity !== existing.entity) {
    return { success: false, error: "Not authorized to resolve this comment" };
  }

  const rows = await query<CommentRow>(
    `WITH updated AS (
      UPDATE mandates_housekeeping.mandate_comments 
      SET resolved_at = $2, resolved_by = $3
      WHERE id = $1
      RETURNING *
    )
    SELECT u2.*, users.entity as user_entity
    FROM updated u2
    LEFT JOIN mandates_housekeeping.users users ON u2.user_email = users.email`,
    [
      commentId,
      resolved ? new Date().toISOString() : null,
      resolved ? user.email : null,
    ],
  );

  revalidatePath(`/entity/${existing.entity}`);

  return { success: true, data: toComment(rows[0]) };
}
