"use server";

import { getCurrentUser } from "@/features/auth/auth";
import { transaction } from "@/lib/db/db";
import {
  getBudgetVersion,
  parseBudgetVersion,
  REVIEW_CYCLE_COOKIE,
} from "@/lib/db/review-cycle";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  getCommentNotificationSummary,
  getCommentReadState,
} from "@/features/mandates/services/comment-notifications";
import type { CommentNotificationSummary } from "@/types/comments";

export async function getCommentNotificationsAction(
  expectedBudgetVersion: string,
): Promise<CommentNotificationSummary | null> {
  const version = await getBudgetVersion();
  if (expectedBudgetVersion !== version) return null;
  return transaction(async (tx) => {
    const user = await getCurrentUser(tx);
    if (!user) return null;
    return getCommentNotificationSummary(tx, user, version);
  }, version);
}

export async function getCommentReadStateAction(
  documentSymbol: string,
  expectedBudgetVersion: string,
): Promise<{ readCommentIds: string[] } | null> {
  const version = await getBudgetVersion();
  if (expectedBudgetVersion !== version || !documentSymbol) return null;
  return transaction(async (tx) => {
    const user = await getCurrentUser(tx);
    if (!user) return null;
    return {
      readCommentIds: await getCommentReadState(
        tx,
        user.email,
        documentSymbol,
        version,
      ),
    };
  }, version);
}

export async function markCommentsReadAction(
  commentIds: string[],
  expectedBudgetVersion: string,
): Promise<{ success: boolean; error?: string }> {
  const version = await getBudgetVersion();
  // Read receipts are personal state: allowed on archived cycles, but never on
  // behalf of a stale page whose cycle no longer matches the selected cookie.
  if (expectedBudgetVersion !== version)
    return {
      success: false,
      error: "The submission cycle has changed. Reload this page.",
    };
  if (
    commentIds.length > 1000 ||
    commentIds.some(
      (id) =>
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          id,
        ),
    )
  )
    return { success: false, error: "Invalid comment IDs" };
  return transaction(async (tx) => {
    const user = await getCurrentUser(tx);
    if (!user) return { success: false, error: "unauthorized" };
    if (!commentIds.length) return { success: true };
    await tx("SELECT set_config('app.user_email', $1, true)", [user.email]);
    await tx(
      `INSERT INTO mandates_housekeeping.comment_reads (comment_id, budget_version, user_email)
       SELECT c.id, c.budget_version, $1 FROM mandates_housekeeping.mandate_comments c
       WHERE c.id = ANY($2::uuid[]) AND c.budget_version = $3 AND c.user_email <> $1
       ON CONFLICT (user_email, budget_version, comment_id) DO NOTHING`,
      [user.email, [...new Set(commentIds)], version],
    );
    return { success: true };
  }, version);
}

/** Resolve a stored message to its context before changing the selected cycle.
 * Opening a notification never marks its contents read. */
export async function openCommentNotificationAction(
  commentId: string,
  expectedBudgetVersion: string,
): Promise<{ error: string }> {
  const version = parseBudgetVersion(expectedBudgetVersion);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      commentId,
    )
  )
    return { error: "Invalid comment ID" };
  const row = await transaction(async (tx) => {
    if (!(await getCurrentUser(tx))) return null;
    const rows = await tx<{
      entity: string;
      document_symbol: string;
      subprogramme: string | null;
    }>(
      `SELECT entity, document_symbol, subprogramme
       FROM mandates_housekeeping.mandate_comments WHERE id = $1 AND budget_version = $2`,
      [commentId, version],
    );
    return rows[0] ?? null;
  }, version);
  if (!row)
    return {
      error: "The comment is unavailable. Please refresh and try again.",
    };
  (await cookies()).set(REVIEW_CYCLE_COOKIE, version, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  const params = new URLSearchParams({
    document: row.document_symbol,
    subprogramme: row.subprogramme ?? "",
    comment: commentId,
    cycle: version,
  });
  redirect(`/entity/${encodeURIComponent(row.entity)}?${params}`);
}
