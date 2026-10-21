"use client";

import { useContext, useEffect, useRef, useState } from "react";
import {
  ArrowRightLeft,
  Check,
  ChevronDown,
  History,
  MessageSquare,
  Plus,
  X,
} from "lucide-react";
import type {
  DecisionChangeHandler,
  DecisionReasonChangeHandler,
  MandateComment,
  MandateDecision,
  MandateState,
} from "@/types";
import type { BudgetVersion } from "@/lib/db/budget-version";
import { DECISION_BADGE_STYLES } from "@/lib/theme";
import {
  conversationGroups,
  conversationGroupKey,
  conversationTimeline,
} from "@/features/mandates/services/comment-conversation";
import { markCommentsReadAction } from "@/features/mandates/actions/comment-notifications";
import { dispatchCommentNotificationsRefresh } from "@/hooks/useCommentNotifications";
import { getDecisionTracks } from "@/features/mandates/services/decision-tracks";
import { DecisionDropdown } from "./DecisionDropdown";
import {
  DecisionTracksContext,
  ReviewDecisionControl,
} from "./ReviewDecisionControl";

const dateLabel = (date: string) => new Date(date).toLocaleString();

function DecisionLine({ decision }: { decision: MandateDecision }) {
  const Icon =
    decision.decision === "retain"
      ? Check
      : decision.decision === "remove"
        ? X
        : decision.decision === "add"
          ? Plus
          : ArrowRightLeft;
  const style =
    DECISION_BADGE_STYLES[
      decision.decision === "cancel" ? "no decision" : decision.decision
    ];
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1 text-xs text-foreground">
      <span>
        {decision.decisionTrack === "review" ? "Review" : "Submission"}
      </span>
      <span
        className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 ${style}`}
      >
        <Icon className="h-3 w-3" />
        {decision.decision === "cancel" ? "Cleared" : decision.decision}
        {decision.newSymbol ? ` → ${decision.newSymbol}` : ""}
      </span>
      <span>{decision.userEmail}</span>
      <time dateTime={decision.createdAt}>{dateLabel(decision.createdAt)}</time>
    </div>
  );
}

export function CommentsDecisionPanel({
  symbol,
  entity,
  subprogramme,
  entitySubprogrammes,
  allEntities,
  decisions,
  comments,
  readCommentIds,
  userEmail,
  budgetVersion,
  readOnly,
  state,
  onDecision,
  onReasonChange,
  onUpdateClick,
  onComment,
  onDecisionSaved,
  onRead,
  targetCommentId,
}: {
  symbol: string;
  entity?: string;
  subprogramme: string | null;
  entitySubprogrammes?: Record<string, string[]>;
  allEntities?: string[];
  decisions: MandateDecision[];
  comments: MandateComment[];
  readCommentIds: string[] | null;
  userEmail?: string | null;
  budgetVersion: BudgetVersion;
  readOnly: boolean;
  state?: MandateState;
  onDecision?: DecisionChangeHandler;
  onReasonChange?: DecisionReasonChangeHandler;
  onUpdateClick?: (prefillSymbol?: string) => void;
  onComment?: (comment: string) => Promise<MandateComment | null>;
  onDecisionSaved: (decision: MandateDecision) => void;
  onRead: (ids: string[]) => void;
  targetCommentId?: string | null;
}) {
  const context = useContext(DecisionTracksContext);
  const originKey = entity ? conversationGroupKey(entity, subprogramme) : "";
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set([originKey]),
  );
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const queuedRef = useRef(new Set<string>());
  const acknowledgedRef = useRef(new Set<string>());
  const readIds = new Set(readCommentIds || []);
  const groups = conversationGroups({
    entity,
    subprogramme,
    entitySubprogrammes,
    allEntities,
    comments,
    decisions,
  });
  const target = comments.find((c) => c.id === targetCommentId);
  const targetKey = target
    ? conversationGroupKey(target.entity, target.subprogramme)
    : null;
  const scrolledRef = useRef<string | null>(null);
  useEffect(() => {
    if (!targetKey) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Open the exact group addressed by a notification.
    setExpanded((previous) =>
      previous.has(targetKey) ? previous : new Set([...previous, targetKey]),
    );
  }, [targetKey]);
  useEffect(() => {
    if (!targetCommentId || scrolledRef.current === targetCommentId) return;
    const element = rootRef.current?.querySelector<HTMLElement>(
      `[data-comment-id="${CSS.escape(targetCommentId)}"]`,
    );
    if (element) {
      element.scrollIntoView({ block: "center", behavior: "smooth" });
      element.focus({ preventScroll: true });
      scrolledRef.current = targetCommentId;
    }
  }, [targetCommentId, expanded, comments]);

  // Exact IDs, visible viewport only. A closed group never mounts its messages.
  useEffect(() => {
    if (!userEmail || readCommentIds === null || !rootRef.current) return;
    let disposed = false;
    const queued = queuedRef.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const flush = async () => {
      timer = undefined;
      if (document.visibilityState !== "visible") {
        queuedRef.current.clear();
        return;
      }
      const ids = [...queuedRef.current];
      queuedRef.current.clear();
      if (!ids.length) return;
      for (const id of ids) acknowledgedRef.current.add(id);
      try {
        const result = await markCommentsReadAction(ids, budgetVersion);
        if (!result.success) {
          for (const id of ids) acknowledgedRef.current.delete(id);
          return;
        }
        if (!disposed) onRead(ids);
        dispatchCommentNotificationsRefresh();
      } catch {
        for (const id of ids) acknowledgedRef.current.delete(id);
      }
    };
    const visible = new Set<Element>();
    const consider = () => {
      if (document.visibilityState !== "visible") return;
      for (const element of visible) {
        const id = (element as HTMLElement).dataset.commentId;
        if (id && !readIds.has(id) && !acknowledgedRef.current.has(id))
          queuedRef.current.add(id);
      }
      if (queuedRef.current.size && !timer)
        timer = setTimeout(() => {
          void flush();
        }, 350);
    };
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRect.height > 0)
            visible.add(entry.target);
          else {
            visible.delete(entry.target);
            const id = (entry.target as HTMLElement).dataset.commentId;
            if (id) queuedRef.current.delete(id);
          }
        }
        consider();
      },
      { threshold: 0 },
    );
    for (const element of rootRef.current.querySelectorAll<HTMLElement>(
      "[data-comment-id]",
    )) {
      if (element.dataset.author !== userEmail) observer.observe(element);
    }
    document.addEventListener("visibilitychange", consider);
    return () => {
      disposed = true;
      observer.disconnect();
      document.removeEventListener("visibilitychange", consider);
      if (timer) clearTimeout(timer);
      queued.clear();
    };
    // IDs and group mounts determine visibility; onRead is provided as a stable callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comments, expanded, readCommentIds, userEmail, budgetVersion]);

  const send = async () => {
    if (!onComment || sending || !draft.trim()) return;
    setSending(true);
    setError(null);
    try {
      const saved = await onComment(draft.trim());
      if (!saved) {
        setError(
          "Comment could not be saved. Your text is preserved; please retry.",
        );
        return;
      }
      setDraft("");
      setExpanded((previous) => new Set([...previous, originKey]));
      dispatchCommentNotificationsRefresh();
    } catch {
      setError(
        "Comment could not be saved. Your text is preserved; please retry.",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <div ref={rootRef} className="space-y-3">
      <p className="text-sm text-foreground">
        One shared conversation for {symbol}. Messages are grouped by the entity
        and subprogramme they concern.
      </p>
      {groups.map((group) => {
        const isCurrent = group.key === originKey;
        const tracks = getDecisionTracks(group.decisions);
        const submission = isCurrent
          ? (state?.decision ?? tracks.submission)
          : tracks.submission;
        const review = isCurrent
          ? (state?.reviewDecision ?? tracks.review)
          : tracks.review;
        const unread =
          readCommentIds === null
            ? 0
            : group.comments.filter(
                (c) => c.userEmail !== userEmail && !readIds.has(c.id),
              ).length;
        const isExpanded = expanded.has(group.key);
        const canEdit =
          isCurrent &&
          !readOnly &&
          !!context?.canEditSubmission &&
          !!onDecision;
        return (
          <section
            key={group.key}
            className="rounded-lg border border-border bg-white"
          >
            <button
              type="button"
              aria-expanded={isExpanded}
              onClick={() =>
                setExpanded((previous) => {
                  const next = new Set(previous);
                  if (next.has(group.key)) next.delete(group.key);
                  else next.add(group.key);
                  return next;
                })
              }
              className="flex w-full items-start gap-2 rounded-lg px-4 py-3 text-left focus-visible:ring-2 focus-visible:ring-un-blue"
            >
              <ChevronDown
                className={`mt-0.5 h-4 w-4 shrink-0 transition-transform ${isExpanded ? "" : "-rotate-90"}`}
              />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-foreground">
                  {group.entity} · {group.subprogramme || "General"}
                </span>
                <span className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-foreground">
                  <span>
                    Entity submission:{" "}
                    <strong>
                      {submission?.decision === "cancel"
                        ? "No decision"
                        : submission?.decision || "No decision"}
                    </strong>
                  </span>
                  <span>
                    Review decision:{" "}
                    <strong>
                      {review?.decision === "cancel"
                        ? "Not reviewed"
                        : review?.decision || "Not reviewed"}
                    </strong>
                    {tracks.reviewStale ? " · Review needed" : ""}
                  </span>
                </span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 text-xs">
                <MessageSquare className="h-3.5 w-3.5" />
                {group.comments.length}
                {unread > 0 && (
                  <span className="rounded-full bg-un-blue-text px-1.5 py-0.5 font-semibold text-white">
                    {unread} unread
                  </span>
                )}
              </span>
            </button>
            {isExpanded && (
              <div className="space-y-3 border-t border-border px-4 py-3">
                <div className="grid grid-cols-2 gap-3 border-b border-border pb-3">
                  <div>
                    <div className="mb-1 text-xs font-medium">
                      Entity submission
                    </div>
                    <DecisionDropdown
                      decision={submission?.decision || null}
                      onChange={onDecision || (async () => null)}
                      disabled={!canEdit}
                      onUpdateClick={canEdit ? onUpdateClick : undefined}
                      onReasonChange={canEdit ? onReasonChange : undefined}
                      reason={submission?.decisionReason}
                      otherReason={submission?.otherReason}
                      symbol={symbol}
                      userEmail={submission?.userEmail}
                      userEntity={submission?.userEntity}
                      createdAt={submission?.createdAt}
                      size="sm"
                    />
                  </div>
                  <div>
                    <div className="mb-1 text-xs font-medium">
                      Review decision
                    </div>
                    <ReviewDecisionControl
                      entity={group.entity}
                      symbol={symbol}
                      subprogramme={group.subprogramme}
                      submission={submission ?? null}
                      review={review ?? null}
                      editable={isCurrent && !readOnly && !!context?.canReview}
                      onSaved={onDecisionSaved}
                    />
                  </div>
                </div>
                {conversationTimeline(group.comments, group.decisions).map(
                  (entry) =>
                    entry.type === "comment" ? (
                      <article
                        key={entry.comment.id}
                        id={`comment-${entry.comment.id}`}
                        data-comment-id={entry.comment.id}
                        data-author={entry.comment.userEmail}
                        tabIndex={-1}
                        className={`rounded-lg border p-3 focus-visible:ring-2 focus-visible:ring-un-blue ${entry.comment.id === targetCommentId ? "border-un-blue bg-blue-50/40" : "border-border"}`}
                      >
                        <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-foreground">
                          <strong>{entry.comment.userEmail}</strong>
                          {entry.comment.userEntity && (
                            <span>{entry.comment.userEntity}</span>
                          )}
                          <time dateTime={entry.comment.createdAt}>
                            {dateLabel(entry.comment.createdAt)}
                          </time>
                          {readCommentIds !== null &&
                            entry.comment.userEmail !== userEmail &&
                            !readIds.has(entry.comment.id) && (
                              <span className="font-semibold text-un-blue-text">
                                Unread
                              </span>
                            )}
                        </div>
                        <p className="text-sm leading-relaxed break-words whitespace-pre-wrap text-foreground">
                          {entry.comment.comment}
                        </p>
                      </article>
                    ) : (
                      <div
                        key={`decisions-${entry.decisions[0].id}`}
                        className="border-l-2 border-border pl-3"
                      >
                        {entry.latest.map((decision) => (
                          <DecisionLine key={decision.id} decision={decision} />
                        ))}
                        {entry.decisions.length > entry.latest.length && (
                          <details className="mt-1">
                            <summary className="flex cursor-pointer items-center gap-1 text-xs text-un-blue-text">
                              <History className="h-3 w-3" />
                              Show history (
                              {entry.decisions.length -
                                entry.latest.length}{" "}
                              earlier changes)
                            </summary>
                            <div className="mt-1">
                              {entry.decisions
                                .filter(
                                  (d) =>
                                    !entry.latest.some(
                                      (latest) => latest.id === d.id,
                                    ),
                                )
                                .map((d) => (
                                  <DecisionLine key={d.id} decision={d} />
                                ))}
                            </div>
                          </details>
                        )}
                      </div>
                    ),
                )}
                {!group.comments.length && (
                  <p className="text-sm text-foreground">No comments yet.</p>
                )}
              </div>
            )}
          </section>
        );
      })}
      {onComment && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
          className="space-y-2 rounded-lg border border-border bg-white p-4"
        >
          <label
            htmlFor={`comment-draft-${symbol}`}
            className="block text-sm font-medium"
          >
            Comment on {entity} · {subprogramme || "General"}
          </label>
          <textarea
            id={`comment-draft-${symbol}`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            disabled={sending}
            rows={4}
            maxLength={20000}
            placeholder="Add to the conversation…"
            className="w-full rounded border border-input bg-white px-3 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-un-blue"
          />
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            className="rounded bg-un-blue-text px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {sending ? "Sending…" : error ? "Retry comment" : "Send comment"}
          </button>
        </form>
      )}
    </div>
  );
}
