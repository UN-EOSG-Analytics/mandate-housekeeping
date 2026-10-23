"use server";

import { getCurrentUser } from "@/features/auth/auth";
import { transaction } from "@/lib/db/db";

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export interface RealtimeChange {
  id: string;
  table: "mandate_decisions" | "mandate_comments";
  document_symbol: string;
  subprogramme: string | null;
  created_at: string;
}

export interface ReviewModeStatus {
  isUnderReview: boolean;
  reviewSessionId: string | null;
  reviewStartedBy: string | null;
}

export interface RealtimeChangesData {
  changes: RealtimeChange[];
  serverTime: string;
  hasChanges: boolean;
  reviewMode: ReviewModeStatus;
}

/** Read changes and status in one authenticated, cycle-scoped transaction. */
export async function getRealtimeChangesAction(
  entity: string,
  since?: string,
): Promise<ActionResult<RealtimeChangesData>> {
  if (!entity) return { success: false, error: "Entity required" };
  const sinceDate = since
    ? new Date(isNaN(Number(since)) ? since : Number(since))
    : new Date(0);
  if (!Number.isFinite(sinceDate.getTime()))
    return { success: false, error: "Invalid change cursor" };

  try {
    return await transaction(async (tx) => {
      const user = await getCurrentUser(tx);
      if (!user) return { success: false as const, error: "Unauthorized" };
      // Capture database time before reads and overlap incremental windows.
      // A missing cursor reconciles all document keys, including transactions
      // that committed too late for the overlap window. Return the latest event
      // for each key rather than replaying its entire audit history.
      const [clock] = await tx<{ server_time: string }>(
        "SELECT clock_timestamp()::text AS server_time",
      );
      const changes = await tx<RealtimeChange>(
        `SELECT ${since ? "*" : 'DISTINCT ON ("table", document_symbol, subprogramme) *'}
         FROM (
           SELECT id, 'mandate_decisions'::text AS "table", document_symbol,
             subprogramme, created_at::text
           FROM mandates_housekeeping.mandate_decisions
           WHERE entity = $1 AND created_at >= $2::timestamptz - interval '30 seconds'
             AND created_at <= $3::timestamptz
             AND ($4::boolean OR entity = $5 OR id IN (
               SELECT DISTINCT ON (document_symbol, subprogramme, decision_track) id
               FROM mandates_housekeeping.mandate_decisions
               WHERE entity = $1
               ORDER BY document_symbol, subprogramme, decision_track, created_at DESC, id DESC
             ))
           UNION ALL
           SELECT id, 'mandate_comments'::text AS "table", document_symbol,
             subprogramme, GREATEST(created_at, updated_at, resolved_at)::text AS created_at
           FROM mandates_housekeeping.mandate_comments
           WHERE entity = $1 AND GREATEST(created_at, updated_at, resolved_at) >= $2::timestamptz - interval '30 seconds'
             AND ($4::boolean OR entity = $5)
             AND GREATEST(created_at, updated_at, resolved_at) <= $3::timestamptz
         ) events
         ORDER BY ${since ? "" : '"table", document_symbol, subprogramme,'} created_at::timestamptz DESC, id DESC`,
        [
          entity,
          sinceDate.toISOString(),
          clock.server_time,
          user.isReviewer,
          user.entity,
        ],
      );
      const sessions = await tx<{ id: string; started_by: string | null }>(
        `SELECT id::text, started_by FROM mandates_housekeeping.entity_review_mode
         WHERE entity = $1 AND ended_at IS NULL`,
        [entity],
      );
      return {
        success: true as const,
        data: {
          changes,
          serverTime: clock.server_time,
          hasChanges: changes.length > 0,
          reviewMode: {
            isUnderReview: sessions.length > 0,
            reviewSessionId: sessions[0]?.id ?? null,
            reviewStartedBy: sessions[0]?.started_by ?? null,
          },
        },
      };
    });
  } catch (error) {
    console.error("[Realtime] Poll error:", error);
    return { success: false, error: "Failed to fetch changes" };
  }
}
