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
import { typography } from "@un-eosg/ui/typography";
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

const GROUP_GRID =
  "grid grid-cols-[minmax(120px,1fr)_110px_140px_28px] items-center gap-x-2 px-3";

const COMMENT_BUBBLE =
  "relative ml-2 rounded-xl rounded-tl-sm border border-border bg-white p-3 shadow-sm before:absolute before:top-4 before:-left-1 before:h-2 before:w-2 before:rotate-45 before:border-b before:border-l before:border-border before:bg-white";

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
      <span className="font-medium" title={decision.userEmail}>
        {decision.userEmail}
      </span>
      <time dateTime={decision.createdAt}>{dateLabel(decision.createdAt)}</time>
      <span
        className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 ${style}`}
        title={
          decision.decisionTrack === "review"
            ? "Reviewer decision"
            : "Entity submission"
        }
      >
        <Icon className="h-3 w-3" />
        {decision.decision === "cancel"
          ? "Cleared"
          : decision.decision.charAt(0).toUpperCase() +
            decision.decision.slice(1)}
        {decision.newSymbol ? ` → ${decision.newSymbol}` : ""}
      </span>
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
  loading = false,
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
  loading?: boolean;
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
  // Include persisted local events immediately, before the next activity poll.
  const decisionEvents = [
    ...new Map(
      [
        ...decisions,
        ...(state?.decisions || []),
        ...(state?.decision ? [state.decision] : []),
        ...(state?.reviewDecision ? [state.reviewDecision] : []),
      ]
        .filter((decision) => !!decision.id)
        .map((decision) => [decision.id, decision]),
    ).values(),
  ];
  const groups = conversationGroups({
    entity,
    subprogramme,
    entitySubprogrammes,
    allEntities,
    comments,
    decisions: decisionEvents,
  });
  const target = comments.find((c) => c.id === targetCommentId);
  const targetKey = target
    ? conversationGroupKey(target.entity, target.subprogramme)
    : null;
  const scrolledRef = useRef<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const resize = () => {
      if (!textarea.clientWidth) return;
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
    };
    let width = textarea.clientWidth;
    resize();
    // Refit wrapped lines when the sidebar width or its visibility changes.
    const observer = new ResizeObserver(() => {
      const nextWidth = textarea.clientWidth;
      if (nextWidth > 0 && nextWidth !== width) {
        width = nextWidth;
        resize();
      }
    });
    observer.observe(textarea);
    return () => observer.disconnect();
  }, [draft, expanded]);

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
    <div
      ref={rootRef}
      className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm"
    >
      <div className="min-w-[446px]">
        <h3 className={`${typography.eyebrow} px-3 py-3`}>
          Decisions &amp; Comments
        </h3>
        {loading && (
          <p
            role="status"
            className="border-t border-border px-3 py-2 text-xs text-foreground"
          >
            Loading comments and decision history…
          </p>
        )}
        <div
          className={`${GROUP_GRID} border-y border-border bg-muted py-2 text-xs font-medium text-foreground`}
        >
          <span>Entity / Programme</span>
          <span>Decision</span>
          <span>Reviewer</span>
          <span title="Comments">
            <MessageSquare className="h-3.5 w-3.5" aria-label="Comments" />
          </span>
        </div>
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
          const groupId = `conversation-${encodeURIComponent(symbol)}-${encodeURIComponent(group.key)}`;
          return (
            <section
              key={group.key}
              data-conversation-key={group.key}
              className="border-b border-border last:border-b-0"
            >
              <div className={`${GROUP_GRID} min-h-12 py-2`}>
                <button
                  type="button"
                  aria-expanded={isExpanded}
                  aria-controls={groupId}
                  onClick={() =>
                    setExpanded((previous) => {
                      const next = new Set(previous);
                      if (next.has(group.key)) next.delete(group.key);
                      else next.add(group.key);
                      return next;
                    })
                  }
                  className="flex min-w-0 items-center gap-2 rounded text-left focus-visible:ring-2 focus-visible:ring-un-blue"
                >
                  <ChevronDown
                    className={`h-3.5 w-3.5 shrink-0 transition-transform ${isExpanded ? "" : "-rotate-90"}`}
                  />
                  <span className="min-w-0 text-foreground">
                    <span
                      className="block truncate text-sm font-semibold"
                      title={group.entity}
                    >
                      {group.entity}
                    </span>
                    <span
                      className="block text-xs"
                      title={group.subprogramme || "Programme level"}
                    >
                      {group.subprogramme || "Programme level"}
                    </span>
                  </span>
                </button>
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
                <ReviewDecisionControl
                  compact
                  entity={group.entity}
                  symbol={symbol}
                  subprogramme={group.subprogramme}
                  submission={submission ?? null}
                  review={review ?? null}
                  editable={isCurrent && !readOnly && !!context?.canReview}
                  onSaved={onDecisionSaved}
                />
                <span
                  className="inline-flex items-center gap-1 text-xs"
                  title={`${group.comments.length} comments${unread ? `, ${unread} unread` : ""}`}
                >
                  {loading && !group.comments.length
                    ? "…"
                    : group.comments.length}
                  {unread > 0 && (
                    <span
                      className="h-2 w-2 shrink-0 rounded-full bg-un-blue-text"
                      aria-label={`${unread} unread comments`}
                    />
                  )}
                </span>
              </div>
              {isExpanded && (
                <div
                  id={groupId}
                  className="space-y-3 border-t border-border bg-muted/60 px-3 py-3"
                >
                  {conversationTimeline(group.comments, group.decisions).map(
                    (entry) => {
                      if (entry.type === "comment")
                        return (
                          <article
                            key={entry.comment.id}
                            id={`comment-${entry.comment.id}`}
                            data-comment-id={entry.comment.id}
                            data-author={entry.comment.userEmail}
                            tabIndex={-1}
                            className={`${COMMENT_BUBBLE} focus-visible:ring-2 focus-visible:ring-un-blue ${entry.comment.id === targetCommentId ? "ring-1 ring-un-blue" : ""}`}
                          >
                            <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-foreground">
                              <strong>{entry.comment.userEmail}</strong>
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
                        );
                      // Both current tracks are shown in the group header. Keep
                      // just the last event visible in each uninterrupted run.
                      const latest = entry.decisions.at(-1);
                      if (!latest) return null;
                      const earlier = entry.decisions.slice(0, -1);
                      return (
                        <div
                          key={`decisions-${entry.decisions[0].id}`}
                          className="ml-2 border-l-2 border-border pl-3"
                        >
                          {earlier.length > 0 && (
                            <details className="mb-1">
                              <summary className="flex cursor-pointer items-center gap-1 py-0.5 text-xs text-un-blue-text">
                                <History className="h-3 w-3" />
                                Show history ({earlier.length} earlier{" "}
                                {earlier.length === 1 ? "change" : "changes"})
                              </summary>
                              <div className="mt-1">
                                {earlier.map((decision) => (
                                  <DecisionLine
                                    key={decision.id}
                                    decision={decision}
                                  />
                                ))}
                              </div>
                            </details>
                          )}
                          <DecisionLine decision={latest} />
                        </div>
                      );
                    },
                  )}

                  {!loading &&
                    !group.comments.length &&
                    !group.decisions.length && (
                      <p className="text-sm text-foreground">
                        No comments yet.
                      </p>
                    )}
                  {isCurrent && onComment && !readOnly && (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        void send();
                      }}
                      className="space-y-2"
                      aria-label={`Comment on ${group.entity} · ${group.subprogramme || "Programme level"}`}
                    >
                      <div className={COMMENT_BUBBLE}>
                        <label
                          htmlFor={`comment-draft-${symbol}`}
                          className="sr-only"
                        >
                          Add comment
                        </label>
                        <textarea
                          ref={textareaRef}
                          id={`comment-draft-${symbol}`}
                          value={draft}
                          onChange={(event) => setDraft(event.target.value)}
                          disabled={sending}
                          rows={2}
                          maxLength={20000}
                          placeholder="Add to the conversation…"
                          className="block min-h-10 w-full resize-none overflow-hidden rounded bg-transparent text-sm text-foreground focus-visible:ring-2 focus-visible:ring-un-blue focus-visible:outline-none"
                        />
                      </div>
                      {error && (
                        <p role="alert" className="text-sm text-red-700">
                          {error}
                        </p>
                      )}
                      <div className="flex justify-end">
                        <button
                          type="submit"
                          disabled={sending || !draft.trim()}
                          className="rounded bg-un-blue-text px-2.5 py-1 text-xs font-medium text-white disabled:opacity-60"
                        >
                          {sending
                            ? "Sending…"
                            : error
                              ? "Retry comment"
                              : "Send comment"}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
