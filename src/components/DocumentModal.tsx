// Modal is client-side
"use client";

import {
  cacheActivity,
  getCachedActivity,
  mergeActivityRows,
  mergeReadIds,
} from "@/features/mandates/services/activity-cache";
import {
  REVIEW_POLL_INTERVAL_MS,
  REVIEW_RECONCILE_INTERVAL_MS,
} from "@/lib/polling";
import { SUBMISSION_CYCLES, type BudgetVersion } from "@/lib/db/budget-version";
import { CommentsDecisionPanel } from "./CommentsDecisionPanel";

import React, { useContext } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DocumentSearchInput,
  type CitationForManualUpdate,
} from "@/features/mandates/ui/DocumentSearchInput";
import type { ManualEntryData } from "@/features/mandates/ui/ManualDocumentForm";
import { citationSection } from "@/features/mandates/services/citation-locations";
import { DecisionTracksContext } from "./ReviewDecisionControl";
import { CommentConversationContext } from "./CommentConversationContext";
import { DocumentSymbol as SharedDocumentSymbol } from "@un-eosg/ui/components/document-symbol";
import { typography } from "@un-eosg/ui/typography";
import { Chip } from "@un-eosg/ui/components/chip";
import { BODY_ABBREVS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  isContentElement,
  resolveVisibilityTier,
  isMainPreambular,
  shouldCollapsePreamble,
} from "@/features/mandates/services/documents/paragraph-presentation";
import { CitationYear } from "./CitationYear";
import { getParagraphTextSegments } from "@/features/mandates/services/documents/paragraph-highlights";
import { fetchParagraphs } from "@/features/mandates/services/documents/client-data-service";
import {
  getDocumentDecisionsAction,
  getDocumentVersionsAction,
} from "@/features/mandates/services/client-reads";
import type { DocumentVersion } from "@/features/mandates/services/documents/document-versions";
import { getDocumentComparisonUrl } from "@/features/mandates/services/documents/comparison-link";
import { UN_BLUE } from "@/lib/theme";
import type {
  DecisionChangeHandler,
  DecisionReasonChangeHandler,
  EntityRelevance,
  MandateComment,
  MandateDecision,
  MandateState,
  Paragraph,
} from "@/types";
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  ChevronDown,
  ExternalLink,
  FileText,
  MessageSquare,
  Loader2,
  Search,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Tooltip } from "./Tooltip";

interface Props {
  readOnly?: boolean;
  symbol: string;
  /** Original citation whose decisions/conversation apply to a displayed replacement. */
  sourceCitation?: CitationForManualUpdate;
  subprogramme: string | null;
  link: string | null;
  title?: string;
  year?: number | null;
  body?: string | null;
  docType?: string | null;
  otherEntitiesCount?: number;
  relevanceCount: number;
  relevanceIndices: number[];
  aiComments: Record<number, string>;
  entity?: string;
  entityLong?: string | null;
  allEntities?: string[];
  entitySubprogrammes?: Record<string, string[]>; // entity -> subprogrammes from PPB
  entityLongMap?: Record<string, string>;
  allEntityRelevance: Record<string, EntityRelevance>;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  state?: MandateState;
  isReviewer?: boolean;
  userEmail?: string | null;
  userEntity?: string | null;
  isFoundational?: boolean;
  onDecision?: DecisionChangeHandler;
  onReasonChange?: DecisionReasonChangeHandler;
  onApprove?: (decisionId: string, approved: boolean) => void;
  onComment?: (comment: string) => Promise<MandateComment | null>;
  budgetVersion?: BudgetVersion;
  targetCommentId?: string | null;
  onUpdateClick?: (prefillSymbol?: string) => void; // Called when user selects "update" from sidebar
  onUpdateWithManual?: (
    newSymbol: string,
    data: ManualEntryData,
  ) => Promise<boolean>;
  metadataFromDb?: boolean;
  initialTab?:
    | "review"
    | "document"
    | "info"
    | "decisions"
    | "activity"
    | "paragraphs";
}

type SidebarTab = "review" | "document";

function initialSidebarTab(
  initialTab: Props["initialTab"],
  targetCommentId?: string | null,
): SidebarTab {
  if (targetCommentId) return "review";
  return initialTab === "document" ||
    initialTab === "paragraphs" ||
    initialTab === "info"
    ? "document"
    : "review";
}

function cleanPrefix(prefix: string) {
  return prefix.replace(/[.\(\)\[\]]/g, "").trim();
}

function ParaBox({
  p,
  indent,
  entity,
  entityLong,
  aiComment,
  searchQuery,
}: {
  p: Paragraph;
  indent: number;
  entity?: string;
  entityLong?: string | null;
  aiComment?: string | null;
  searchQuery?: string;
}) {
  const label = p.prefix ? cleanPrefix(p.prefix) : null;

  return (
    <div style={{ marginLeft: indent }}>
      <div className="rounded-lg bg-gray-100 p-3">
        <div className="flex gap-2">
          {label && (
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-un-blue-text text-[10px] font-medium text-white">
              {label}
            </span>
          )}
          <p className={cn(typography.body, "flex-1 text-foreground")}>
            {getParagraphTextSegments(p, searchQuery, entity, entityLong).map(
              (segment, index) =>
                segment.search ? (
                  <Tooltip
                    asChild
                    content={
                      segment.action ? "Automatic action annotation" : undefined
                    }
                    key={index}
                  >
                    <mark
                      className={cn(
                        "rounded bg-yellow-200 px-0.5",
                        segment.action
                          ? "font-bold text-un-blue-text"
                          : "text-foreground",
                        segment.entity && "font-bold",
                      )}
                    >
                      {segment.text}
                    </mark>
                  </Tooltip>
                ) : segment.action || segment.entity ? (
                  <Tooltip
                    asChild
                    content={
                      segment.action ? "Automatic action annotation" : undefined
                    }
                    key={index}
                  >
                    <strong
                      className={
                        segment.action ? "text-un-blue-text" : "text-foreground"
                      }
                    >
                      {segment.text}
                    </strong>
                  </Tooltip>
                ) : (
                  segment.text
                ),
            )}
          </p>
          {aiComment && (
            <Tooltip content={aiComment}>
              <Sparkles className="h-3.5 w-3.5 shrink-0 cursor-help text-amber-500" />
            </Tooltip>
          )}
        </div>
      </div>
      {p.links?.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-2 text-xs">
          {p.links
            .filter(([, url]) => /^https?:\/\//i.test(url))
            .map(([label, url], i) => (
              <a
                key={i}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-un-blue-text underline"
              >
                {label}
              </a>
            ))}
        </div>
      )}
      {p.note_references?.length ? (
        <p className="mt-1 text-xs text-gray-600">
          Footnotes: {p.note_references.map((n) => n.note_id).join(", ")}
        </p>
      ) : null}
    </div>
  );
}

function getIndent(p: Paragraph) {
  if (p.paragraph_level && p.paragraph_level > 1)
    return (p.paragraph_level - 1) * 16;
  if (p.heading_level && p.heading_level > 1) return (p.heading_level - 1) * 12;
  return 0;
}

function CollapsedGap({
  count,
  entity,
  expanded,
  onToggle,
}: {
  count: number;
  entity: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="flex w-full items-center gap-2 py-1.5 text-xs text-gray-600 hover:text-gray-600"
    >
      <ChevronDown
        className={`h-3.5 w-3.5 transition-transform ${expanded ? "" : "-rotate-90"}`}
      />
      {expanded ? "Hide" : "Show"} {count} paragraph{count !== 1 && "s"} not
      mentioning {entity}
    </button>
  );
}

function matchesSearch(text: string, searchQuery?: string): boolean {
  if (!searchQuery || !searchQuery.trim()) return true;
  return text.toLowerCase().includes(searchQuery.trim().toLowerCase());
}

function FilteredParagraphTree({
  paragraphs,
  relevantIndices,
  aiComments,
  entity,
  entityLong,
  searchQuery,
}: {
  paragraphs: Paragraph[];
  relevantIndices: Set<number>;
  aiComments: Record<number, string>;
  entity: string;
  entityLong?: string | null;
  searchQuery?: string;
}) {
  const [expandedGaps, setExpandedGaps] = useState<Set<number>>(new Set());
  const [showPreamble, setShowPreamble] = useState(false);

  const contentIndices = paragraphs
    .map((p, i) => ({ p, origIdx: i }))
    .filter(({ p }) => isContentElement(p, resolveVisibilityTier(paragraphs)));

  const isRelevant = (origIdx: number) => relevantIndices.has(origIdx);

  const preamble = contentIndices.filter(
    ({ p }) =>
      isMainPreambular(p) &&
      shouldCollapsePreamble(paragraphs, !!searchQuery?.trim()) &&
      matchesSearch(p.text, searchQuery),
  );
  const operative = contentIndices.filter(
    ({ p }) =>
      !isMainPreambular(p) ||
      !shouldCollapsePreamble(paragraphs, !!searchQuery?.trim()),
  );

  type Segment = {
    type: "relevant" | "gap";
    items: { p: Paragraph; origIdx: number }[];
    gapIndex?: number;
  };
  const segments: Segment[] = [];
  let gapIndex = 0;
  let pendingHeadings: { p: Paragraph; origIdx: number }[] = [];

  for (const item of operative) {
    const relevant = isRelevant(item.origIdx);
    const matches = matchesSearch(item.p.text, searchQuery);

    // Skip items that don't match search (unless they're headings that might be needed)
    if (!matches && item.p.type !== "heading") {
      continue;
    }

    if (item.p.type === "heading" && !relevant) {
      pendingHeadings.push(item);
    } else if (relevant && matches) {
      const lastSeg = segments[segments.length - 1];
      if (lastSeg?.type === "relevant") {
        lastSeg.items.push(...pendingHeadings, item);
      } else {
        segments.push({ type: "relevant", items: [...pendingHeadings, item] });
      }
      pendingHeadings = [];
    } else if (matches) {
      const lastSeg = segments[segments.length - 1];
      if (lastSeg?.type === "gap") {
        lastSeg.items.push(...pendingHeadings, item);
      } else {
        segments.push({
          type: "gap",
          items: [...pendingHeadings, item],
          gapIndex: gapIndex++,
        });
      }
      pendingHeadings = [];
    }
  }
  if (pendingHeadings.length > 0) {
    const lastSeg = segments[segments.length - 1];
    if (lastSeg?.type === "gap") {
      lastSeg.items.push(...pendingHeadings);
    } else {
      segments.push({
        type: "gap",
        items: pendingHeadings,
        gapIndex: gapIndex++,
      });
    }
  }

  const toggleGap = (idx: number) => {
    setExpandedGaps((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  };

  const preambleRelevant = preamble.filter(({ origIdx }) =>
    isRelevant(origIdx),
  );

  const hasResults = preamble.length > 0 || segments.length > 0;
  const hasSearchQuery = searchQuery && searchQuery.trim();

  return (
    <div className="space-y-2">
      {hasSearchQuery && !hasResults && (
        <div className="py-8 text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">
            <Search className="h-5 w-5 text-gray-600" />
          </div>
          <p className="text-sm font-medium text-gray-600">No results found</p>
          <p className="mt-1 text-xs text-gray-600">
            Try a different search term
          </p>
        </div>
      )}

      {preamble.length > 0 && (
        <>
          <button
            onClick={() => setShowPreamble(!showPreamble)}
            className="flex items-center gap-2 py-1.5 text-xs text-gray-600 hover:text-foreground"
          >
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${showPreamble ? "" : "-rotate-90"}`}
            />
            {showPreamble ? "Hide" : "Show"} {preamble.length} preambular
            paragraph{preamble.length !== 1 && "s"}
            {hasSearchQuery && preamble.length > 0 && (
              <span className="text-un-blue-text">(matching search)</span>
            )}
            {!hasSearchQuery && preambleRelevant.length > 0 && (
              <span className="text-un-blue-text">
                ({preambleRelevant.length} mentioning {entity})
              </span>
            )}
          </button>
          {showPreamble && (
            <div className="space-y-2">
              {preamble.map(({ p, origIdx }, i) => (
                <ParaBox
                  key={`pp-${i}`}
                  p={p}
                  indent={getIndent(p)}
                  entity={entity}
                  entityLong={entityLong}
                  aiComment={aiComments[origIdx]}
                  searchQuery={searchQuery}
                />
              ))}
            </div>
          )}
        </>
      )}

      {segments.map((seg, i) => {
        if (seg.type === "relevant") {
          return seg.items.map(({ p, origIdx }, j) => {
            if (p.type === "heading") {
              const indent =
                p.heading_level && p.heading_level > 1
                  ? (p.heading_level - 1) * 12
                  : 0;
              return (
                <div
                  key={`seg-${i}-${j}`}
                  style={{ marginLeft: indent }}
                  className={`font-semibold text-foreground ${p.heading_level === 1 ? "mt-3 text-sm" : "mt-1.5 text-xs"}`}
                >
                  {p.text}
                </div>
              );
            }
            return (
              <ParaBox
                key={`seg-${i}-${j}`}
                p={p}
                indent={getIndent(p)}
                entity={entity}
                entityLong={entityLong}
                aiComment={aiComments[origIdx]}
                searchQuery={searchQuery}
              />
            );
          });
        }

        const expanded = expandedGaps.has(seg.gapIndex!);
        return (
          <div key={`gap-${seg.gapIndex}`}>
            <CollapsedGap
              count={seg.items.length}
              entity={entity}
              expanded={expanded}
              onToggle={() => toggleGap(seg.gapIndex!)}
            />
            {expanded && (
              <div className="space-y-2">
                {seg.items.map(({ p }, j) => {
                  if (p.type === "heading") {
                    const indent =
                      p.heading_level && p.heading_level > 1
                        ? (p.heading_level - 1) * 12
                        : 0;
                    return (
                      <div
                        key={`gap-${seg.gapIndex}-${j}`}
                        style={{ marginLeft: indent }}
                        className={`font-semibold text-foreground ${p.heading_level === 1 ? "mt-3 text-sm" : "mt-1.5 text-xs"}`}
                      >
                        {p.text}
                      </div>
                    );
                  }
                  return (
                    <ParaBox
                      key={`gap-${seg.gapIndex}-${j}`}
                      p={p}
                      indent={getIndent(p)}
                      entity={entity}
                      entityLong={entityLong}
                      searchQuery={searchQuery}
                    />
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function FullParagraphTree({
  paragraphs,
  searchQuery,
}: {
  paragraphs: Paragraph[];
  searchQuery?: string;
}) {
  const [showPreamble, setShowPreamble] = useState(false);

  const content = paragraphs.filter((p) =>
    isContentElement(p, resolveVisibilityTier(paragraphs)),
  );
  const preamble = content.filter(
    (p) =>
      isMainPreambular(p) &&
      shouldCollapsePreamble(paragraphs, !!searchQuery?.trim()) &&
      matchesSearch(p.text, searchQuery),
  );
  const operative = content.filter(
    (p) =>
      !isMainPreambular(p) ||
      !shouldCollapsePreamble(paragraphs, !!searchQuery?.trim()),
  );
  const filteredOperative = operative.filter(
    (p) => p.type === "heading" || matchesSearch(p.text, searchQuery),
  );

  const hasResults =
    preamble.length > 0 || filteredOperative.some((p) => p.type !== "heading");
  const hasSearchQuery = searchQuery && searchQuery.trim();

  return (
    <div className="space-y-2">
      {hasSearchQuery && !hasResults && (
        <div className="py-8 text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">
            <Search className="h-5 w-5 text-gray-600" />
          </div>
          <p className="text-sm font-medium text-gray-600">No results found</p>
          <p className="mt-1 text-xs text-gray-600">
            Try a different search term
          </p>
        </div>
      )}

      {preamble.length > 0 && (
        <>
          <button
            onClick={() => setShowPreamble(!showPreamble)}
            className="flex items-center gap-2 py-1.5 text-xs text-gray-600 hover:text-foreground"
          >
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${showPreamble ? "" : "-rotate-90"}`}
            />
            {showPreamble ? "Hide" : "Show"} {preamble.length} preambular
            paragraph{preamble.length !== 1 && "s"}
            {hasSearchQuery && (
              <span className="text-un-blue-text">(matching search)</span>
            )}
          </button>
          {showPreamble && (
            <div className="space-y-2">
              {preamble.map((p, i) => (
                <ParaBox
                  key={`pp-${i}`}
                  p={p}
                  indent={getIndent(p)}
                  searchQuery={searchQuery}
                />
              ))}
            </div>
          )}
        </>
      )}

      {filteredOperative.map((p, i) => {
        if (p.type === "heading") {
          const indent =
            p.heading_level && p.heading_level > 1
              ? (p.heading_level - 1) * 12
              : 0;
          return (
            <div
              key={`op-${i}`}
              style={{ marginLeft: indent }}
              className={`font-semibold text-foreground ${p.heading_level === 1 ? "mt-3 text-sm" : "mt-1.5 text-xs"}`}
            >
              {p.text}
            </div>
          );
        }
        if (isContentElement(p, resolveVisibilityTier(paragraphs))) {
          return (
            <ParaBox
              key={`op-${i}`}
              p={p}
              indent={getIndent(p)}
              searchQuery={searchQuery}
            />
          );
        }
        return null;
      })}
    </div>
  );
}

/** Load the conversation first; parsed text is only needed by the Document tab. */
export function useDocumentSidebarData({
  open,
  symbol,
  documentSymbol = symbol,
  budgetVersion,
  activeTab,
  userEmail = null,
}: {
  userEmail?: string | null;
  open: boolean;
  symbol: string;
  documentSymbol?: string;
  budgetVersion: BudgetVersion;
  activeTab: SidebarTab | "info" | "paragraphs";
}) {
  const activityKey = JSON.stringify([userEmail, budgetVersion, symbol]);
  const cacheKey = userEmail ? activityKey : null;
  const cachedActivity = open ? getCachedActivity(cacheKey) : undefined;
  const hasCachedActivity = !!cachedActivity;
  const [loadedActivityKey, setLoadedActivityKey] = useState<string | null>(
    null,
  );
  const [activityErrorKey, setActivityErrorKey] = useState<string | null>(null);
  const [allDecisions, setAllDecisions] = useState<MandateDecision[]>([]);
  const [allComments, setAllComments] = useState<MandateComment[]>([]);
  const [readCommentIds, setReadCommentIds] = useState<string[] | null>(null);
  const readKeyRef = useRef<string | null>(null);
  const [paragraphResult, setParagraphResult] = useState<{
    symbol: string;
    paragraphs: Paragraph[];
    error: boolean;
  } | null>(null);
  const paragraphRequests = useRef(
    new Map<string, Promise<{ paragraphs: Paragraph[]; error: boolean }>>(),
  );
  const [versionsResult, setVersionsResult] = useState<{
    symbol: string;
    versions: DocumentVersion[];
  } | null>(null);
  const versionRequests = useRef(
    new Map<string, ReturnType<typeof getDocumentVersionsAction>>(),
  );

  // HTTP reads run independently from mutation actions. Reopen from memory,
  // then request only events changed since the last successful refresh.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let pending = false;
    const controller = new AbortController();
    const initialCache = getCachedActivity(cacheKey);
    let cursor = initialCache?.cursor;
    let lastReconciledAt = initialCache?.reconciledAt ?? 0;
    const fetchActivity = async () => {
      if (pending || document.visibilityState !== "visible") return;
      pending = true;
      const reconcile =
        !cursor ||
        Date.now() - lastReconciledAt >= REVIEW_RECONCILE_INTERVAL_MS;
      const result = await getDocumentDecisionsAction(
        symbol,
        budgetVersion,
        reconcile ? undefined : cursor,
        controller.signal,
        userEmail ?? undefined,
      ).catch(() => ({ success: false as const, error: "Failed to load" }));
      pending = false;
      if (cancelled) return;
      if (result.success && result.data) {
        const update = result.data;
        const cached = getCachedActivity(cacheKey);
        const initial = reconcile;
        const sameContext = readKeyRef.current === activityKey;
        readKeyRef.current = activityKey;
        setAllDecisions((previous) =>
          mergeActivityRows(
            sameContext
              ? previous
              : initial
                ? []
                : (cached?.data.decisions ?? []),
            update.decisions || [],
          ),
        );
        setAllComments((previous) =>
          mergeActivityRows(
            sameContext
              ? previous
              : initial
                ? []
                : (cached?.data.comments ?? []),
            update.comments || [],
          ),
        );
        setReadCommentIds((previous) =>
          mergeReadIds(
            sameContext ? previous || [] : (cached?.data.readCommentIds ?? []),
            update.readCommentIds,
          ),
        );
        cursor = update.serverTime;
        if (reconcile) lastReconciledAt = Date.now();
        cacheActivity(
          cacheKey,
          {
            decisions: mergeActivityRows(
              initial ? [] : (cached?.data.decisions ?? []),
              update.decisions || [],
            ),
            comments: mergeActivityRows(
              initial ? [] : (cached?.data.comments ?? []),
              update.comments || [],
            ),
            readCommentIds: mergeReadIds(
              cached?.data.readCommentIds ?? [],
              update.readCommentIds,
            ),
          },
          cursor,
          reconcile,
        );
        setLoadedActivityKey(activityKey);
        setActivityErrorKey(null);
      } else {
        setActivityErrorKey(activityKey);
      }
    };
    void fetchActivity();
    const interval = setInterval(fetchActivity, REVIEW_POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", fetchActivity);
    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(interval);
      document.removeEventListener("visibilitychange", fetchActivity);
    };
  }, [open, symbol, budgetVersion, activityKey, cacheKey, userEmail]);

  // Include confirmed local comments, decisions and read receipts in reopen data.
  useEffect(() => {
    if (loadedActivityKey !== activityKey) return;
    const cached = getCachedActivity(cacheKey);
    if (cached)
      cacheActivity(
        cacheKey,
        {
          decisions: allDecisions,
          comments: allComments,
          readCommentIds: readCommentIds ?? [],
        },
        cached.cursor,
      );
  }, [
    loadedActivityKey,
    activityKey,
    cacheKey,
    allDecisions,
    allComments,
    readCommentIds,
  ]);

  useEffect(() => {
    if (!open || (activeTab !== "document" && activeTab !== "paragraphs"))
      return;
    let cancelled = false;
    // Retain the request across tab switches and close/reopen, including while
    // pending. A late response for another document cannot overwrite this one.
    let request = paragraphRequests.current.get(documentSymbol);
    if (!request) {
      request = fetchParagraphs(documentSymbol).then(
        (paragraphs) => ({ paragraphs: paragraphs || [], error: false }),
        () => ({ paragraphs: [], error: true }),
      );
      paragraphRequests.current.set(documentSymbol, request);
    }
    void request.then((result) => {
      if (!cancelled) setParagraphResult({ symbol: documentSymbol, ...result });
    });
    return () => {
      cancelled = true;
    };
  }, [open, activeTab, documentSymbol]);

  useEffect(() => {
    if (!open || (loadedActivityKey !== activityKey && !hasCachedActivity))
      return;
    let cancelled = false;
    let request = versionRequests.current.get(documentSymbol);
    if (!request) {
      request = getDocumentVersionsAction(documentSymbol).catch(() => ({
        success: false as const,
        error: "Failed to load",
      }));
      versionRequests.current.set(documentSymbol, request);
    }
    void request.then((result) => {
      if (!cancelled) {
        setVersionsResult({
          symbol: documentSymbol,
          versions: result.success ? result.data || [] : [],
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, documentSymbol, loadedActivityKey, activityKey, hasCachedActivity]);

  const localActivity =
    loadedActivityKey === activityKey
      ? {
          decisions: allDecisions,
          comments: allComments,
          readCommentIds: readCommentIds ?? [],
        }
      : (cachedActivity?.data ?? {
          decisions: [],
          comments: [],
          readCommentIds: [],
        });
  const saveLocalActivity = (data: typeof localActivity) => {
    readKeyRef.current = activityKey;
    setAllDecisions(data.decisions);
    setAllComments(data.comments);
    setReadCommentIds(data.readCommentIds);
    setLoadedActivityKey(activityKey);
    const cached = getCachedActivity(cacheKey);
    if (cached) cacheActivity(cacheKey, data, cached.cursor);
  };
  const setLocalDecisions: typeof setAllDecisions = (update) =>
    saveLocalActivity({
      ...localActivity,
      decisions:
        typeof update === "function" ? update(localActivity.decisions) : update,
    });
  const setLocalComments: typeof setAllComments = (update) =>
    saveLocalActivity({
      ...localActivity,
      comments:
        typeof update === "function" ? update(localActivity.comments) : update,
    });
  const handleRead = (ids: string[]) =>
    saveLocalActivity({
      ...localActivity,
      readCommentIds: mergeReadIds(localActivity.readCommentIds, ids),
    });
  const activityLoading = loadedActivityKey !== activityKey && !cachedActivity;
  const hasLocalActivity = loadedActivityKey === activityKey;
  return {
    activityLoading,
    activityError: activityErrorKey === activityKey,
    allDecisions: hasLocalActivity
      ? allDecisions
      : (cachedActivity?.data.decisions ?? []),
    allComments: hasLocalActivity
      ? allComments
      : (cachedActivity?.data.comments ?? []),
    readCommentIds: hasLocalActivity
      ? readCommentIds
      : (cachedActivity?.data.readCommentIds ?? null),
    setAllDecisions: setLocalDecisions,
    setAllComments: setLocalComments,
    handleRead,
    paragraphs:
      paragraphResult?.symbol === documentSymbol
        ? paragraphResult.paragraphs
        : null,
    paragraphsLoading: paragraphResult?.symbol !== documentSymbol,
    fulltextError:
      paragraphResult?.symbol === documentSymbol && paragraphResult.error,
    documentVersions:
      versionsResult?.symbol === documentSymbol ? versionsResult.versions : [],
    versionsLoading: versionsResult?.symbol !== documentSymbol,
  };
}

export function DocumentSymbol({
  subprogramme,
  readOnly = false,
  symbol,
  sourceCitation,
  link,
  title,
  year,
  body,
  docType,
  otherEntitiesCount,
  entity,
  allEntities,
  entitySubprogrammes,
  entityLongMap,
  allEntityRelevance,
  isOpen: controlledOpen,
  onOpenChange,
  state,
  isFoundational,
  onDecision: onDecisionProp,
  onReasonChange: onReasonChangeProp,
  onComment: onCommentProp,
  onUpdateClick: onUpdateClickProp,
  onUpdateWithManual,
  initialTab,
  userEmail,
  userEntity,
  isReviewer,
  budgetVersion: budgetVersionProp,
  targetCommentId,
}: Props) {
  const conversationContext = useContext(CommentConversationContext);
  const trackContext = useContext(DecisionTracksContext);
  const budgetVersion = budgetVersionProp ?? conversationContext.budgetVersion;
  const currentUserEmail = userEmail ?? conversationContext.userEmail;
  const sourceSymbol = sourceCitation?.symbol;
  const citation = sourceCitation ?? { symbol, title, body, year, link };
  const citationSymbol = citation.symbol;
  const onDecision = readOnly ? undefined : onDecisionProp;
  const onReasonChange = readOnly ? undefined : onReasonChangeProp;
  const onComment = conversationContext.canComment ? onCommentProp : undefined;
  const [replacementSearch, setReplacementSearch] = useState<{
    prefill?: string;
  } | null>(null);
  const [replacementSaving, setReplacementSaving] = useState(false);
  const [replacementError, setReplacementError] = useState<string | null>(null);
  const replacementSavingRef = useRef(false);
  const onUpdateClick = readOnly
    ? undefined
    : (onUpdateClickProp ??
      (onUpdateWithManual
        ? (prefill?: string) => {
            setReplacementError(null);
            setReplacementSearch({ prefill });
          }
        : undefined));
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeTab, setActiveTab] = useState<SidebarTab>(() =>
    initialSidebarTab(initialTab, targetCommentId),
  );
  const {
    activityLoading,
    activityError,
    allDecisions,
    allComments,
    readCommentIds,
    setAllDecisions,
    setAllComments,
    handleRead,
    paragraphs,
    paragraphsLoading,
    fulltextError,
    documentVersions,
    versionsLoading,
  } = useDocumentSidebarData({
    open,
    symbol: citationSymbol,
    documentSymbol: symbol,
    budgetVersion,
    activeTab,
    userEmail: currentUserEmail,
  });
  const openerRef = useRef<HTMLElement | null>(null);
  const openerRowRef = useRef<HTMLElement | null>(null);
  const tabId = useId();
  const reviewTabRef = useRef<HTMLButtonElement>(null);
  const documentTabRef = useRef<HTMLButtonElement>(null);

  // Set initial tab when modal opens with a specific tab
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Sync state with props on modal open
      setActiveTab(initialSidebarTab(initialTab, targetCommentId));
    }
  }, [open, initialTab, targetCommentId]);

  useEffect(() => {
    // A reopened sidebar starts in review rather than an abandoned picker.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!open) setReplacementSearch(null);
  }, [open]);

  async function saveReplacement(
    newSymbol: string,
    manualData?: ManualEntryData,
  ) {
    if (replacementSavingRef.current) return;
    replacementSavingRef.current = true;
    setReplacementSaving(true);
    setReplacementError(null);
    try {
      const saved = manualData
        ? await onUpdateWithManual?.(newSymbol, manualData)
        : await onDecision?.("update", newSymbol);
      if (saved) setReplacementSearch(null);
      else
        setReplacementError(
          "The replacement was not saved. Choose a document to try again.",
        );
    } catch {
      setReplacementError("Could not save the replacement. Please try again.");
    } finally {
      replacementSavingRef.current = false;
      setReplacementSaving(false);
    }
  }

  function handleTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next: SidebarTab =
      event.key === "Home"
        ? "review"
        : event.key === "End"
          ? "document"
          : activeTab === "review"
            ? "document"
            : "review";
    setActiveTab(next);
    (next === "review" ? reviewTabRef : documentTabRef).current?.focus();
  }

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setOpen(true);
    },
    [setOpen],
  );

  // Wrapper - just forward to parent, polling will update the list

  const isTruncated = symbol.length > 18;
  const displaySymbol = isTruncated ? symbol.slice(0, 18) + "…" : symbol;

  const btn = (
    <button
      onClick={handleClick}
      className="w-fit rounded whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-un-blue focus-visible:ring-offset-2 focus-visible:outline-none"
      aria-label={`Open document ${symbol}`}
    >
      <SharedDocumentSymbol>{displaySymbol}</SharedDocumentSymbol>
    </button>
  );

  // Compute mention indices for an entity (using both short and long name)
  const computeMentionIndices = (
    paras: Paragraph[],
    ent: string,
    entLong?: string,
  ): Set<number> => {
    const terms = [ent];
    if (entLong) terms.push(entLong);
    const pattern = new RegExp(
      `\\b(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`,
      "i",
    );
    const indices = new Set<number>();
    paras.forEach((p, i) => {
      if (p.text && p.type !== "heading" && pattern.test(p.text))
        indices.add(i);
    });
    return indices;
  };

  // Get relevance for an entity from allEntityRelevance (pre-computed) or compute mentions on-the-fly
  const getEntityRelevance = (
    paras: Paragraph[],
    ent: string,
    entLong?: string,
  ): { indices: Set<number>; aiComments: Record<number, string> } => {
    const relevance = allEntityRelevance[ent];
    if (relevance) {
      // Use pre-computed data from augmented JSON
      return {
        indices: new Set(relevance.indices),
        aiComments: relevance.ai_comments || {},
      };
    }
    // Fallback: compute mentions only (no AI comments)
    return {
      indices: computeMentionIndices(paras, ent, entLong),
      aiComments: {},
    };
  };

  // Compute relevance counts for all entities
  const entityRelevanceCounts: Record<string, number> = {};
  if (paragraphs && allEntities) {
    for (const ent of allEntities) {
      const entLong = entityLongMap?.[ent];
      entityRelevanceCounts[ent] = getEntityRelevance(
        paragraphs,
        ent,
        entLong,
      ).indices.size;
    }
  }

  const selectedEntityLong = selectedEntity
    ? entityLongMap?.[selectedEntity]
    : undefined;
  const selectedRelevance =
    paragraphs && selectedEntity
      ? getEntityRelevance(paragraphs, selectedEntity, selectedEntityLong)
      : { indices: new Set<number>(), aiComments: {} };

  const citingEntities = [
    ...new Set([
      ...(allEntities || []),
      ...Object.keys(entitySubprogrammes || {}),
    ]),
  ]
    .filter((citingEntity) => citingEntity !== entity)
    .sort((a, b) => a.localeCompare(b));
  const issuingBody = body
    ? Object.entries(BODY_ABBREVS).find(
        ([name, abbreviation]) =>
          name.toLowerCase() === body.trim().toLowerCase() ||
          abbreviation.toLowerCase() === body.trim().toLowerCase(),
      )?.[0] || body
    : null;

  // In controlled mode (isOpen passed), only render the sidebar
  const sidebarOnly = controlledOpen !== undefined;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!sidebarOnly &&
        (isTruncated ? <Tooltip content={symbol}>{btn}</Tooltip> : btn)}

      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        onOpenAutoFocus={() => {
          openerRef.current =
            document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null;
          openerRowRef.current =
            openerRef.current?.closest<HTMLElement>(
              "[data-citation-visible]",
            ) ?? null;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          requestAnimationFrame(() => {
            const active = document.activeElement;
            // Updating a citation moves directly into the replacement search.
            // Preserve focus when that next control has already claimed it.
            if (
              active instanceof HTMLElement &&
              active !== document.body &&
              active.isConnected &&
              active.getClientRects().length > 0 &&
              !active.closest('[data-state="closed"]')
            )
              return;
            const opener = openerRef.current;
            if (opener?.isConnected && opener.getClientRects().length > 0) {
              opener.focus();
              return;
            }
            // A saved action can hide its row in "Show remaining". Continue
            // with the next visible citation, or return to the list search.
            const details = [
              ...document.querySelectorAll<HTMLButtonElement>(
                "[data-citation-visible='true'] [data-view-details]",
              ),
            ].filter(
              (button) =>
                !button.disabled && button.getClientRects().length > 0,
            );
            const row = openerRowRef.current;
            const next = row?.isConnected
              ? details.find(
                  (button) =>
                    row.compareDocumentPosition(button) &
                    Node.DOCUMENT_POSITION_FOLLOWING,
                )
              : details[0];
            const previous = row?.isConnected
              ? details.findLast(
                  (button) =>
                    row.compareDocumentPosition(button) &
                    Node.DOCUMENT_POSITION_PRECEDING,
                )
              : undefined;
            (
              next ??
              previous ??
              document.querySelector<HTMLInputElement>(
                "[data-workspace-search]",
              )
            )?.focus();
          });
        }}
        className="top-0 right-0 left-auto flex h-dvh w-full max-w-full translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 bg-white p-0 shadow-xl data-[state=closed]:animate-none data-[state=open]:animate-none sm:max-w-xl"
      >
        <div className="border-b p-5 pb-0">
          <div className="flex items-start justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3">
                <DialogTitle className="text-xl font-semibold text-foreground">
                  {symbol}
                </DialogTitle>
                {isFoundational && (
                  <Tooltip content="Also cited in the Mandates and Background section">
                    <span className="inline-flex items-center gap-1 rounded-full bg-un-blue/10 px-2.5 py-0.5 text-xs font-medium text-un-blue-text">
                      <Star className="h-3 w-3 fill-un-blue" strokeWidth={0} />
                      Foundational
                    </span>
                  </Tooltip>
                )}
              </div>
              {title && (
                <p className={cn(typography.body, "mt-1 text-foreground")}>
                  {title}
                </p>
              )}
              {sourceSymbol && sourceSymbol !== symbol && (
                <p
                  className={cn(
                    typography.body,
                    "mt-2 font-medium text-foreground",
                  )}
                >
                  Proposed replacement for {sourceSymbol}
                </p>
              )}
              <p className="mt-2 text-xs leading-relaxed text-gray-600">
                {SUBMISSION_CYCLES[budgetVersion].label}
                {entity && <> · {entity}</>}
                {entity && <> · {citationSection(subprogramme).label}</>}
                {readOnly && (
                  <span className="ml-2 font-medium">Read-only</span>
                )}
              </p>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close sidebar"
              className="ml-2 rounded-lg p-1.5 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Tabs */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <div
              role="tablist"
              aria-label="Citation sidebar"
              className="flex gap-1"
            >
              <button
                ref={reviewTabRef}
                type="button"
                id={`${tabId}-review-tab`}
                role="tab"
                aria-selected={activeTab === "review"}
                aria-controls={`${tabId}-review-panel`}
                tabIndex={activeTab === "review" ? 0 : -1}
                onKeyDown={handleTabKeyDown}
                onClick={() => setActiveTab("review")}
                className={`flex items-center gap-1.5 rounded-t-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                  activeTab === "review"
                    ? "bg-gray-100 text-foreground"
                    : "text-gray-600 hover:bg-gray-50 hover:text-foreground"
                }`}
              >
                <MessageSquare className="h-4 w-4" aria-hidden="true" />
                Review
              </button>
              <button
                ref={documentTabRef}
                type="button"
                id={`${tabId}-document-tab`}
                role="tab"
                aria-selected={activeTab === "document"}
                aria-controls={`${tabId}-document-panel`}
                tabIndex={activeTab === "document" ? 0 : -1}
                onKeyDown={handleTabKeyDown}
                onClick={() => setActiveTab("document")}
                className={`flex items-center gap-1.5 rounded-t-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                  activeTab === "document"
                    ? "bg-gray-100 text-foreground"
                    : "text-gray-600 hover:bg-gray-50 hover:text-foreground"
                }`}
              >
                <FileText className="h-4 w-4" aria-hidden="true" />
                Document
              </button>
            </div>
            <a
              href={link || `https://docs.un.org/en/${symbol}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mb-1 inline-flex items-center gap-1.5 rounded px-2 py-1.5 text-sm font-medium text-un-blue-text-aaa hover:bg-un-blue-surface hover:underline focus-visible:ring-2 focus-visible:ring-un-blue"
            >
              View PDF{" "}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-gray-100 p-5">
          {/* Keep both panels mounted so comment and document drafts survive tab switches. */}
          <div
            id={`${tabId}-review-panel`}
            role="tabpanel"
            aria-labelledby={`${tabId}-review-tab`}
            hidden={activeTab !== "review"}
            tabIndex={0}
            className="space-y-4 rounded focus-visible:outline-2 focus-visible:outline-un-blue"
          >
            <section className="scroll-mt-2">
              {activityError && (
                <p role="alert" className="mb-2 text-sm text-red-700">
                  Could not refresh comments and decisions. Retrying…
                </p>
              )}
              <CommentsDecisionPanel
                key={`${budgetVersion}:${citationSymbol}:${entity}:${subprogramme || ""}`}
                symbol={citationSymbol}
                citationMetadata={citation}
                entityLongMap={entityLongMap}
                active={open && activeTab === "review"}
                focusComposer={
                  open &&
                  activeTab === "review" &&
                  initialTab === "activity" &&
                  !targetCommentId
                }
                entity={entity}
                subprogramme={subprogramme}
                entitySubprogrammes={entitySubprogrammes}
                allEntities={allEntities}
                loading={activityLoading && !activityError}
                activityError={activityError}
                decisions={allDecisions}
                comments={allComments}
                readCommentIds={readCommentIds}
                userEmail={currentUserEmail}
                userEntity={userEntity ?? conversationContext.userEntity}
                isReviewer={!!isReviewer || conversationContext.isReviewer}
                budgetVersion={budgetVersion}
                readOnly={readOnly}
                state={state}
                onDecision={onDecision}
                onReasonChange={onReasonChange}
                onUpdateClick={onUpdateClick}
                targetCommentId={targetCommentId}
                onComment={
                  onComment
                    ? async (text) => {
                        const saved = await onComment(text);
                        if (saved)
                          setAllComments((previous) => [
                            ...previous.filter((c) => c.id !== saved.id),
                            saved,
                          ]);
                        return saved;
                      }
                    : undefined
                }
                onDecisionSaved={(event) =>
                  setAllDecisions((previous) => [
                    ...previous.filter((d) => d.id !== event.id),
                    event,
                  ])
                }
                onRead={handleRead}
              />
            </section>
          </div>
          <div
            id={`${tabId}-document-panel`}
            role="tabpanel"
            aria-labelledby={`${tabId}-document-tab`}
            hidden={activeTab !== "document"}
            tabIndex={0}
            className="space-y-4 rounded focus-visible:outline-2 focus-visible:outline-un-blue"
          >
            <section className="rounded-xl bg-white p-3 shadow-sm">
              <h3 className={cn(typography.eyebrow, "mb-2")}>
                Document Details
              </h3>
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-4 gap-y-1.5 text-sm text-foreground">
                {year != null && (
                  <>
                    <dt className="text-xs">Year</dt>
                    <dd>
                      <CitationYear year={year} />
                    </dd>
                  </>
                )}
                {body && (
                  <>
                    <dt className="text-xs">Issuing body</dt>
                    <dd className="font-medium">{issuingBody}</dd>
                  </>
                )}
                {docType && (
                  <>
                    <dt className="text-xs">Document type</dt>
                    <dd className="font-medium">{docType}</dd>
                  </>
                )}
                {citingEntities.length > 0 ? (
                  <>
                    <dt className="self-start pt-0.5 text-xs">Also cited by</dt>
                    <dd className="flex flex-wrap gap-1">
                      {citingEntities.map((citingEntity) => (
                        <Tooltip
                          asChild
                          content={
                            entityLongMap?.[citingEntity] || citingEntity
                          }
                          key={citingEntity}
                        >
                          <Chip
                            density="dense"
                            tone="neutral"
                            href={`/entity/${encodeURIComponent(citingEntity)}/`}
                          >
                            {citingEntity}
                          </Chip>
                        </Tooltip>
                      ))}
                    </dd>
                  </>
                ) : otherEntitiesCount != null && otherEntitiesCount > 0 ? (
                  <>
                    <dt className="text-xs">Also cited by</dt>
                    <dd>
                      {otherEntitiesCount} other{" "}
                      {otherEntitiesCount === 1 ? "entity" : "entities"}
                    </dd>
                  </>
                ) : null}
              </dl>
            </section>

            {!versionsLoading && documentVersions.length > 0 && (
              <div className="rounded-xl bg-white p-4 shadow-sm">
                <h3 className={cn(typography.eyebrow, "mb-3")}>
                  Later documents in this series ({documentVersions.length})
                </h3>
                {/* Header row */}
                <div className="overflow-x-auto">
                  <div className="grid min-w-[26rem] grid-cols-[auto_1fr_auto_auto_auto_auto] items-center gap-x-3 gap-y-2 text-xs">
                    <span className="font-medium text-gray-600">Year</span>
                    <span className="font-medium text-gray-600">Symbol</span>
                    <span className="text-center font-medium text-gray-600">
                      vs Original
                    </span>
                    <span className="text-center font-medium text-gray-600">
                      vs row above
                    </span>
                    <span className="font-medium text-gray-600">PDF</span>
                    <span className="font-medium text-gray-600">Action</span>

                    {documentVersions.map((version, idx) => {
                      const previousSymbol =
                        idx === 0 ? symbol : documentVersions[idx - 1].symbol;
                      return (
                        <React.Fragment key={version.symbol}>
                          {/* Year */}
                          <span className="text-sm text-foreground">
                            {version.year}
                          </span>

                          {/* Symbol */}
                          <span className="truncate text-sm font-medium text-foreground">
                            {version.symbol}
                          </span>

                          {/* Compare with Original */}
                          <Tooltip
                            asChild
                            content={`Compare ${version.symbol} with ${symbol} in a new tab`}
                          >
                            <a
                              href={getDocumentComparisonUrl(
                                symbol,
                                version.symbol,
                              )}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`inline-flex items-center justify-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors ${UN_BLUE.badge}`}
                              aria-label={`Compare ${version.symbol} with ${symbol} in a new tab`}
                            >
                              <ArrowLeftRight className="h-3 w-3" />
                            </a>
                          </Tooltip>

                          {/* Compare with Previous */}
                          <Tooltip
                            asChild
                            content={
                              idx === 0
                                ? "Same as original"
                                : `Compare ${version.symbol} with ${previousSymbol} in a new tab`
                            }
                          >
                            <a
                              href={
                                idx === 0
                                  ? undefined
                                  : getDocumentComparisonUrl(
                                      previousSymbol,
                                      version.symbol,
                                    )
                              }
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-disabled={idx === 0}
                              tabIndex={idx === 0 ? -1 : undefined}
                              className={`inline-flex items-center justify-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
                                idx === 0
                                  ? "cursor-not-allowed bg-gray-100 text-gray-600"
                                  : UN_BLUE.badge
                              }`}
                              aria-label={
                                idx === 0
                                  ? "Same as original"
                                  : `Compare ${version.symbol} with ${previousSymbol} in a new tab`
                              }
                            >
                              <ArrowLeftRight className="h-3 w-3" />
                            </a>
                          </Tooltip>

                          {/* View PDF */}
                          <Tooltip
                            asChild
                            content={"View PDF in ODS in a new tab"}
                          >
                            <a
                              href={`https://docs.un.org/en/${version.symbol}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-200"
                              aria-label={"View PDF in ODS in a new tab"}
                            >
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </Tooltip>

                          {/* Update To */}
                          {trackContext?.canEditSubmission && onUpdateClick ? (
                            <Tooltip
                              asChild
                              content={"Use this document for the citation"}
                            >
                              <button
                                onClick={() => {
                                  onUpdateClick(version.symbol);
                                }}
                                className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100"
                              >
                                <ArrowRight className="h-3 w-3" />
                                Update
                              </button>
                            </Tooltip>
                          ) : (
                            <span className="text-xs text-gray-600">—</span>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
            <section className="space-y-4">
              <h3 className={typography.eyebrow}>Document text</h3>

              {/* Search Box */}
              <div className="rounded-xl bg-white p-4 shadow-sm">
                <div className={cn(typography.eyebrow, "mb-2")}>
                  Search in document
                </div>
                <div className="relative">
                  <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-600" />
                  <input
                    type="text"
                    aria-label="Search document text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search for keywords in paragraphs..."
                    className="w-full rounded-lg border border-gray-200 bg-white py-2 pr-4 pl-10 text-sm placeholder:text-gray-600 focus:border-un-blue focus:ring-2 focus:ring-un-blue/20 focus:outline-none"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      aria-label="Clear document search"
                      onClick={() => setSearchQuery("")}
                      className="absolute top-1/2 right-3 -translate-y-1/2 text-gray-600 hover:text-gray-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              {allEntities && allEntities.length > 0 && (
                <div className="rounded-xl bg-white p-4 shadow-sm">
                  <div className={cn(typography.eyebrow, "mb-2")}>
                    Filter by mentioned entity (Experimental)
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      onClick={() => setSelectedEntity(null)}
                      className={`rounded-full px-2 py-0.5 text-xs font-medium transition-colors ${
                        !selectedEntity
                          ? "bg-gray-700 text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      All
                    </button>
                    {allEntities.map((e) => {
                      const count = entityRelevanceCounts[e] || 0;
                      return (
                        <button
                          key={e}
                          onClick={() => setSelectedEntity(e)}
                          className={`rounded-full px-2 py-0.5 text-xs font-medium transition-colors ${
                            selectedEntity === e
                              ? "bg-un-blue-text text-white"
                              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                          }`}
                        >
                          {e}{" "}
                          <span
                            className={
                              selectedEntity === e
                                ? "text-white"
                                : "text-gray-600"
                            }
                          >
                            ({count})
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="rounded-xl bg-white p-5 shadow-sm">
                {paragraphs?.some((p) => p.extraction_quality_warning) && (
                  <p className="mb-3 text-sm text-amber-800">
                    Extraction warning: check this text against the original
                    document.
                  </p>
                )}
                {paragraphs?.some((p) => p.part_letter) && (
                  <p className="mb-3 text-xs text-gray-600">
                    Showing printed part{" "}
                    {paragraphs.find((p) => p.part_letter)?.part_letter} only.
                  </p>
                )}
                {paragraphsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-gray-300" />
                  </div>
                ) : paragraphs && paragraphs.length > 0 ? (
                  selectedEntity ? (
                    <FilteredParagraphTree
                      paragraphs={paragraphs}
                      relevantIndices={selectedRelevance.indices}
                      aiComments={selectedRelevance.aiComments}
                      entity={selectedEntity}
                      entityLong={selectedEntityLong || null}
                      searchQuery={searchQuery}
                    />
                  ) : (
                    <FullParagraphTree
                      paragraphs={paragraphs}
                      searchQuery={searchQuery}
                    />
                  )
                ) : (
                  <div className="py-12 text-center">
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
                      <AlertTriangle className="h-6 w-6 text-gray-600" />
                    </div>
                    <p className="text-sm font-medium text-gray-600">
                      {fulltextError
                        ? "Fulltext could not be loaded"
                        : "No readable fulltext available"}
                    </p>
                    <p className="mt-1 text-xs text-gray-600">
                      The parsed document text is not available in our database
                    </p>
                    {link && (
                      <a
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-un-blue-text hover:underline"
                      >
                        View original PDF →
                      </a>
                    )}
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
        <Dialog
          open={open && replacementSearch !== null}
          onOpenChange={(next) => {
            if (!next) setReplacementSearch(null);
          }}
        >
          <DialogContent
            className="sm:max-w-2xl"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              requestAnimationFrame(() => {
                const tab = (
                  activeTab === "review" ? reviewTabRef : documentTabRef
                ).current;
                if (tab?.getClientRects().length)
                  tab.focus({ preventScroll: true });
              });
            }}
          >
            <DialogHeader>
              <DialogTitle>Replace {citationSymbol}</DialogTitle>
              <DialogDescription>
                Choose a replacement for this citation in {entity}
                {entity ? " · " : ""}
                {citationSection(subprogramme).label}.
              </DialogDescription>
            </DialogHeader>
            <fieldset
              disabled={replacementSaving}
              className="min-w-0"
              aria-busy={replacementSaving}
            >
              <DocumentSearchInput
                onSelect={(newSymbol) => void saveReplacement(newSymbol)}
                onManualSubmit={(data) =>
                  void saveReplacement(data.symbol, data)
                }
                onCancel={() => setReplacementSearch(null)}
                initialQuery={replacementSearch?.prefill}
                manualUpdate={citation}
                placeholder="Search for replacement document..."
                submitLabel="Update"
                formTitle="Enter replacement document manually"
              />
            </fieldset>
            {replacementSaving && (
              <p role="status" className="text-sm text-foreground">
                Saving replacement…
              </p>
            )}
            {replacementError && (
              <p role="alert" className="text-sm text-red-700">
                {replacementError}
              </p>
            )}
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
