import type { TransactionQueryFn } from "@/lib/db/db";
import type { BudgetVersion } from "@/lib/db/budget-version";
import type {
  CommentNotification,
  CommentNotificationSummary,
} from "@/types/comments";

interface NotificationRow {
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
  is_read: boolean;
}

export const toCommentNotification = (
  row: NotificationRow,
): CommentNotification => ({
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
  isRead: row.is_read,
});

/** All rows are selected-cycle scoped by RLS, and explicitly by cycle for clarity. */
export async function getCommentNotificationSummary(
  tx: TransactionQueryFn,
  user: { email: string; entity: string | null },
  budgetVersion: BudgetVersion,
): Promise<CommentNotificationSummary> {
  await tx("SELECT set_config('app.user_email', $1, true)", [user.email]);
  const params = [user.email, user.entity, budgetVersion];
  // Participation is in the whole resolution conversation within this cycle.
  // Own-entity eligibility concerns the message's context, not its author's entity.
  const eligible = `c.user_email <> $1 AND (c.entity = $2 OR EXISTS (
    SELECT 1 FROM mandates_housekeeping.mandate_comments participation
    WHERE participation.budget_version = c.budget_version
      AND participation.document_symbol = c.document_symbol
      AND participation.user_email = $1
  ))`;
  const notifications = await tx<NotificationRow>(
    `SELECT c.*, u.entity AS user_entity, (r.comment_id IS NOT NULL) AS is_read
     FROM mandates_housekeeping.mandate_comments c
     LEFT JOIN mandates_housekeeping.users u ON u.email = c.user_email
     LEFT JOIN mandates_housekeeping.comment_reads r
       ON r.comment_id = c.id AND r.budget_version = c.budget_version AND r.user_email = $1
     WHERE c.budget_version = $3 AND ${eligible}
     ORDER BY c.created_at DESC, c.id DESC LIMIT 100`,
    params,
  );
  const totals = await tx<{ unread: number }>(
    `SELECT count(*)::int AS unread FROM mandates_housekeeping.mandate_comments c
     LEFT JOIN mandates_housekeeping.comment_reads r
       ON r.comment_id = c.id AND r.budget_version = c.budget_version AND r.user_email = $1
     WHERE c.budget_version = $3 AND ${eligible} AND r.comment_id IS NULL`,
    params,
  );
  // The resolution table displays the whole shared conversation, including groups
  // which do not qualify for a personal header notification.
  const counts = await tx<{
    document_symbol: string;
    total: number;
    unread: number;
  }>(
    `SELECT c.document_symbol, count(*)::int AS total,
       count(*) FILTER (WHERE c.user_email <> $1 AND r.comment_id IS NULL)::int AS unread
     FROM mandates_housekeeping.mandate_comments c
     LEFT JOIN mandates_housekeeping.comment_reads r
       ON r.comment_id = c.id AND r.budget_version = c.budget_version AND r.user_email = $1
     WHERE c.budget_version = $2 GROUP BY c.document_symbol`,
    [user.email, budgetVersion],
  );
  return {
    budgetVersion,
    totalUnread: totals[0]?.unread ?? 0,
    notifications: notifications.map(toCommentNotification),
    resolutions: Object.fromEntries(
      counts.map((row) => [
        row.document_symbol,
        { total: row.total, unread: row.unread },
      ]),
    ),
  };
}

export async function getCommentReadState(
  tx: TransactionQueryFn,
  userEmail: string,
  documentSymbol: string,
  budgetVersion: BudgetVersion,
): Promise<string[]> {
  await tx("SELECT set_config('app.user_email', $1, true)", [userEmail]);
  const rows = await tx<{ id: string }>(
    `SELECT c.id FROM mandates_housekeeping.mandate_comments c
     LEFT JOIN mandates_housekeeping.comment_reads r
       ON r.comment_id = c.id AND r.budget_version = c.budget_version AND r.user_email = $1
     WHERE c.document_symbol = $2 AND c.budget_version = $3
       AND (c.user_email = $1 OR r.comment_id IS NOT NULL)`,
    [userEmail, documentSymbol, budgetVersion],
  );
  return rows.map((row) => row.id);
}
