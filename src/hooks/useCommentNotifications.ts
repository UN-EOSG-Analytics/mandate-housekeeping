"use client";

import { useEffect, useSyncExternalStore } from "react";
import { REVIEW_POLL_INTERVAL_MS } from "@/lib/polling";
import { getCommentNotificationsAction } from "@/features/mandates/actions/comment-notifications";
import type { BudgetVersion } from "@/lib/db/budget-version";
import type { CommentNotificationSummary } from "@/types/comments";

interface Snapshot {
  summary: CommentNotificationSummary | null;
  loading: boolean;
  error: boolean;
}

const EMPTY: Snapshot = { summary: null, loading: false, error: false };

function createStore(version: BudgetVersion) {
  let snapshot = EMPTY;
  const listeners = new Set<() => void>();
  let interval: ReturnType<typeof setInterval> | undefined;
  let pending: Promise<void> | undefined;
  let refreshAgain = false;
  let generation = 0;

  function publish(next: Snapshot) {
    snapshot = next;
    listeners.forEach((listener) => listener());
  }

  function refresh(): Promise<void> {
    if (pending) {
      refreshAgain = true;
      return pending;
    }
    const requestGeneration = generation;
    publish({ ...snapshot, loading: true, error: false });
    pending = (async () => {
      try {
        const summary = await getCommentNotificationsAction(version);
        if (requestGeneration === generation) {
          publish({ summary, loading: false, error: summary === null });
        }
      } catch {
        if (requestGeneration === generation) {
          publish({ ...snapshot, loading: false, error: true });
        }
      } finally {
        pending = undefined;
        if (refreshAgain && listeners.size) {
          refreshAgain = false;
          void refresh();
        }
      }
    })();
    return pending;
  }

  return {
    getSnapshot: () => snapshot,
    refresh,
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (listeners.size === 1) {
        void refresh();
        interval = setInterval(() => {
          if (!pending && document.visibilityState === "visible")
            void refresh();
        }, REVIEW_POLL_INTERVAL_MS);
      }
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          clearInterval(interval);
          generation++;
          refreshAgain = false;
          snapshot = EMPTY;
        }
      };
    },
    get active() {
      return listeners.size > 0;
    },
  };
}

const stores = new Map<BudgetVersion, ReturnType<typeof createStore>>();

function getStore(version: BudgetVersion) {
  let store = stores.get(version);
  if (!store) {
    store = createStore(version);
    stores.set(version, store);
  }
  return store;
}

/** Refresh all mounted views after a comment is posted or displayed as read. */
export function dispatchCommentNotificationsRefresh() {
  for (const store of stores.values()) {
    if (store.active) void store.refresh();
  }
}

const noSubscribe = () => () => {};
const emptySnapshot = () => EMPTY;

/** One shared, non-overlapping polling request per mounted submission cycle. */
export function useCommentNotifications(
  budgetVersion: BudgetVersion,
  enabled = true,
) {
  const store = getStore(budgetVersion);
  const snapshot = useSyncExternalStore(
    enabled ? store.subscribe : noSubscribe,
    enabled ? store.getSnapshot : emptySnapshot,
    emptySnapshot,
  );

  useEffect(() => {
    if (!enabled) return;
    const refreshVisible = () => {
      if (document.visibilityState === "visible") void store.refresh();
    };
    document.addEventListener("visibilitychange", refreshVisible);
    return () =>
      document.removeEventListener("visibilitychange", refreshVisible);
  }, [enabled, store]);

  return { ...snapshot, refresh: store.refresh };
}
