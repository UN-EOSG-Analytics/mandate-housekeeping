"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  REVIEW_POLL_INTERVAL_MS,
  REVIEW_POLL_MAX_RETRY_MS,
  REVIEW_RECONCILE_INTERVAL_MS,
} from "@/lib/polling";
import { getRealtimeChangesAction } from "@/features/mandates/services/client-reads";
import type { BudgetVersion } from "@/lib/db/budget-version";
import type {
  RealtimeChange,
  ReviewModeStatus,
} from "@/features/mandates/actions/realtime";

export type { RealtimeChange, ReviewModeStatus };

interface UseRealtimeDecisionsOptions {
  entity: string;
  budgetVersion?: BudgetVersion;
  /** All changed documents are refreshed together before advancing the cursor. */
  onRemoteChanges?: (changes: RealtimeChange[]) => void | Promise<void>;
  onReviewModeChange?: (status: ReviewModeStatus) => void | Promise<void>;
  enabled?: boolean;
  pollIntervalMs?: number;
}

/** Single-flight polling pauses in hidden tabs and backs off after failures. */
export function useRealtimeDecisions({
  entity,
  budgetVersion,
  onRemoteChanges,
  onReviewModeChange,
  enabled = true,
  pollIntervalMs = REVIEW_POLL_INTERVAL_MS,
}: UseRealtimeDecisionsOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewModeStatus, setReviewModeStatus] =
    useState<ReviewModeStatus | null>(null);
  const callbacks = useRef({ onRemoteChanges, onReviewModeChange });
  const inFlight = useRef(false);
  const pollRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    callbacks.current = { onRemoteChanges, onReviewModeChange };
  }, [onRemoteChanges, onReviewModeChange]);

  useEffect(() => {
    if (!enabled || !entity) return;
    let cancelled = false;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cursor: string | undefined;
    let failures = 0;
    let lastReconciledAt = 0;
    let previousStatus: ReviewModeStatus | null = null;
    const processed = new Set<string>();
    const schedule = () => {
      clearTimeout(timer);
      if (!cancelled && document.visibilityState === "visible") {
        timer = setTimeout(
          () => void poll(),
          Math.max(
            pollIntervalMs,
            Math.min(
              pollIntervalMs * 2 ** Math.min(failures, 4),
              REVIEW_POLL_MAX_RETRY_MS,
            ),
          ),
        );
      }
    };
    const poll = async () => {
      if (cancelled || document.visibilityState !== "visible") return;
      if (inFlight.current) {
        schedule();
        return;
      }
      clearTimeout(timer);
      inFlight.current = true;
      try {
        const reconcile =
          !cursor ||
          Date.now() - lastReconciledAt >= REVIEW_RECONCILE_INTERVAL_MS;
        const result = await getRealtimeChangesAction(
          entity,
          reconcile ? undefined : cursor,
          budgetVersion,
          controller.signal,
        );
        if (cancelled) return;
        if (!result.success) throw new Error(result.error);
        const data = result.data;
        const changes = data.changes.filter(
          (change) =>
            reconcile || !processed.has(`${change.id}:${change.created_at}`),
        );
        if (changes.length) await callbacks.current.onRemoteChanges?.(changes);
        if (cancelled) return;
        const status = data.reviewMode;
        if (
          !previousStatus ||
          previousStatus.isUnderReview !== status.isUnderReview ||
          previousStatus.reviewSessionId !== status.reviewSessionId ||
          previousStatus.reviewStartedBy !== status.reviewStartedBy
        ) {
          await callbacks.current.onReviewModeChange?.(status);
          if (cancelled) return;
          previousStatus = status;
          setReviewModeStatus(status);
        }
        for (const change of changes)
          processed.add(`${change.id}:${change.created_at}`);
        // IDs only suppress the bounded overlap window; no unbounded tab growth.
        if (processed.size > 2000) {
          const recent = [...processed].slice(-1000);
          processed.clear();
          recent.forEach((id) => processed.add(id));
        }
        cursor = data.serverTime;
        if (reconcile) lastReconciledAt = Date.now();
        failures = 0;
        setIsConnected(true);
        setError(null);
      } catch (err) {
        if (!cancelled) {
          failures++;
          setError(err instanceof Error ? err.message : "Poll failed");
          setIsConnected(false);
        }
      } finally {
        inFlight.current = false;
        schedule();
      }
    };
    const refreshVisible = () => {
      clearTimeout(timer);
      if (document.visibilityState === "visible") void poll();
    };
    pollRef.current = refreshVisible;
    document.addEventListener("visibilitychange", refreshVisible);
    void poll();
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
      pollRef.current = null;
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [enabled, entity, budgetVersion, pollIntervalMs]);

  const refresh = useCallback(() => pollRef.current?.(), []);
  return { isConnected, error, reviewModeStatus, refresh };
}
