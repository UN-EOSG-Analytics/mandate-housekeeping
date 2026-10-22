// Modal is client-side
"use client";

import { REVIEW_POLL_INTERVAL_MS } from "@/lib/polling";
import { type BudgetVersion } from "@/lib/db/budget-version";
import { CommentsDecisionPanel } from "./CommentsDecisionPanel";

import React, { useContext } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
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
import { getAgeIndicator } from "@/features/mandates/services/age-indicator";
import { getParagraphTextSegments } from "@/features/mandates/services/documents/paragraph-highlights";
import { fetchParagraphs } from "@/features/mandates/services/documents/client-data-service";
import { getDocumentDecisionsAction } from "@/features/mandates/actions/decisions";
import { getDocumentVersionsAction } from "@/features/mandates/services/documents/document-fetching";
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
  Info,
  Loader2,
  Search,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Tooltip } from "./Tooltip";

interface Props {
  readOnly?: boolean;
  symbol: string;
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
  canReviewAnyEntity?: boolean;
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
  metadataFromDb?: boolean;
  initialTab?: "info" | "decisions" | "activity" | "paragraphs"; // Initial tab to open
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
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-un-blue text-[10px] font-medium text-white">
              {label}
            </span>
          )}
          <p className={cn(typography.body, "flex-1 text-foreground")}>
            {getParagraphTextSegments(p, searchQuery, entity, entityLong).map(
              (segment, index) =>
                segment.search ? (
                  <mark
                    key={index}
                    title={
                      segment.action ? "Automatic action annotation" : undefined
                    }
                    className={cn(
                      "rounded bg-yellow-200 px-0.5",
                      segment.action
                        ? "font-bold text-un-blue"
                        : "text-foreground",
                      segment.entity && "font-bold",
                    )}
                  >
                    {segment.text}
                  </mark>
                ) : segment.action || segment.entity ? (
                  <strong
                    key={index}
                    title={
                      segment.action ? "Automatic action annotation" : undefined
                    }
                    className={
                      segment.action ? "text-un-blue" : "text-foreground"
                    }
                  >
                    {segment.text}
                  </strong>
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
        <p className="mt-1 text-xs text-gray-500">
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
      className="flex w-full items-center gap-2 py-1.5 text-xs text-gray-400 hover:text-gray-600"
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
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          <p className="text-sm font-medium text-gray-600">No results found</p>
          <p className="mt-1 text-xs text-gray-400">
            Try a different search term
          </p>
        </div>
      )}

      {preamble.length > 0 && (
        <>
          <button
            onClick={() => setShowPreamble(!showPreamble)}
            className="flex items-center gap-2 py-1.5 text-xs text-gray-500 hover:text-foreground"
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
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          <p className="text-sm font-medium text-gray-600">No results found</p>
          <p className="mt-1 text-xs text-gray-400">
            Try a different search term
          </p>
        </div>
      )}

      {preamble.length > 0 && (
        <>
          <button
            onClick={() => setShowPreamble(!showPreamble)}
            className="flex items-center gap-2 py-1.5 text-xs text-gray-500 hover:text-foreground"
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

/** Load the conversation first; fulltext is only needed by the Paragraphs tab. */
export function useDocumentSidebarData({
  open,
  symbol,
  budgetVersion,
  activeTab,
}: {
  open: boolean;
  symbol: string;
  budgetVersion: BudgetVersion;
  activeTab: "info" | "paragraphs";
}) {
  const activityKey = `${budgetVersion}:${symbol}`;
  const [loadedActivityKey, setLoadedActivityKey] = useState<string | null>(
    null,
  );
  const [activityErrorKey, setActivityErrorKey] = useState<string | null>(null);
  const [allDecisions, setAllDecisions] = useState<MandateDecision[]>([]);
  const [allComments, setAllComments] = useState<MandateComment[]>([]);
  const [readCommentIds, setReadCommentIds] = useState<string[] | null>(null);
  const readKeyRef = useRef<string | null>(null);
  const handleRead = useCallback((ids: string[]) => {
    setReadCommentIds((previous) => [
      ...new Set([...(previous || []), ...ids]),
    ]);
  }, []);
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

  // Next's client router queues server actions. Start the activity request before
  // optional document queries so fulltext cannot block the initial conversation.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let pending = false;
    const fetchActivity = async () => {
      if (pending || document.visibilityState !== "visible") return;
      pending = true;
      const result = await getDocumentDecisionsAction(
        symbol,
        budgetVersion,
      ).catch(() => ({ success: false as const, error: "Failed to load" }));
      pending = false;
      if (cancelled) return;
      if (result.success && result.data) {
        const sameContext = readKeyRef.current === activityKey;
        readKeyRef.current = activityKey;
        setReadCommentIds((previous) => [
          ...new Set([
            ...(sameContext ? previous || [] : []),
            ...result.data!.readCommentIds,
          ]),
        ]);
        setAllDecisions(result.data.decisions || []);
        setAllComments(result.data.comments || []);
        setLoadedActivityKey(activityKey);
        setActivityErrorKey(null);
      } else {
        setActivityErrorKey(activityKey);
      }
    };
    void fetchActivity();
    const interval = setInterval(fetchActivity, REVIEW_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [open, symbol, budgetVersion, activityKey]);

  useEffect(() => {
    if (!open || activeTab !== "paragraphs") return;
    let cancelled = false;
    // Retain the request across tab switches and close/reopen, including while
    // pending. A late response for another document cannot overwrite this one.
    let request = paragraphRequests.current.get(symbol);
    if (!request) {
      request = fetchParagraphs(symbol).then(
        (paragraphs) => ({ paragraphs: paragraphs || [], error: false }),
        () => ({ paragraphs: [], error: true }),
      );
      paragraphRequests.current.set(symbol, request);
    }
    void request.then((result) => {
      if (!cancelled) setParagraphResult({ symbol, ...result });
    });
    return () => {
      cancelled = true;
    };
  }, [open, activeTab, symbol]);

  useEffect(() => {
    if (!open || loadedActivityKey !== activityKey) return;
    let cancelled = false;
    let request = versionRequests.current.get(symbol);
    if (!request) {
      request = getDocumentVersionsAction(symbol).catch(() => ({
        success: false as const,
        error: "Failed to load",
      }));
      versionRequests.current.set(symbol, request);
    }
    void request.then((result) => {
      if (!cancelled) {
        setVersionsResult({
          symbol,
          versions: result.success ? result.data || [] : [],
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, symbol, loadedActivityKey, activityKey]);

  const activityLoading = loadedActivityKey !== activityKey;
  return {
    activityLoading,
    activityError: activityErrorKey === activityKey,
    allDecisions: activityLoading ? [] : allDecisions,
    allComments: activityLoading ? [] : allComments,
    readCommentIds: activityLoading ? null : readCommentIds,
    setAllDecisions,
    setAllComments,
    handleRead,
    paragraphs:
      paragraphResult?.symbol === symbol ? paragraphResult.paragraphs : null,
    paragraphsLoading: paragraphResult?.symbol !== symbol,
    fulltextError: paragraphResult?.symbol === symbol && paragraphResult.error,
    documentVersions:
      versionsResult?.symbol === symbol ? versionsResult.versions : [],
    versionsLoading: versionsResult?.symbol !== symbol,
  };
}

export function DocumentSymbol({
  subprogramme,
  readOnly = false,
  symbol,
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
  initialTab,
  userEmail,
  budgetVersion: budgetVersionProp,
  targetCommentId,
}: Props) {
  const conversationContext = useContext(CommentConversationContext);
  const trackContext = useContext(DecisionTracksContext);
  const budgetVersion = budgetVersionProp ?? conversationContext.budgetVersion;
  const currentUserEmail = userEmail ?? conversationContext.userEmail;
  const onDecision = readOnly ? undefined : onDecisionProp;
  const onReasonChange = readOnly ? undefined : onReasonChangeProp;
  const onComment = conversationContext.canComment ? onCommentProp : undefined;
  const onUpdateClick = readOnly ? undefined : onUpdateClickProp;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  // Keep legacy entry points for comments/decisions opening the merged Info tab.
  const [activeTab, setActiveTab] = useState<"info" | "paragraphs">(
    initialTab === "paragraphs" ? "paragraphs" : "info",
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
  } = useDocumentSidebarData({ open, symbol, budgetVersion, activeTab });
  const openerRef = useRef<HTMLElement | null>(null);
  const commentsSectionRef = useRef<HTMLElement>(null);

  // Set initial tab when modal opens with a specific tab
  useEffect(() => {
    if (open && initialTab) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Sync state with props on modal open
      setActiveTab(initialTab === "paragraphs" ? "paragraphs" : "info");
    }
  }, [open, initialTab]);

  // Table comment buttons still land directly on the conversation section.
  // Notifications with an exact comment let the panel scroll to that message.
  useEffect(() => {
    if (
      !open ||
      activeTab !== "info" ||
      targetCommentId ||
      (initialTab !== "activity" && initialTab !== "decisions")
    )
      return;
    const frame = requestAnimationFrame(() =>
      commentsSectionRef.current?.scrollIntoView({ block: "start" }),
    );
    return () => cancelAnimationFrame(frame);
  }, [open, activeTab, initialTab, targetCommentId]);

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
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (openerRef.current?.isConnected) openerRef.current.focus();
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
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close sidebar"
              className="ml-2 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Tabs */}
          <div className="mt-5 flex gap-1">
            <button
              onClick={() => setActiveTab("info")}
              className={`flex items-center gap-1.5 rounded-t-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === "info"
                  ? "bg-gray-100 text-foreground"
                  : "text-gray-500 hover:bg-gray-50 hover:text-foreground"
              }`}
            >
              <Info className="h-4 w-4" />
              Info
            </button>
            <button
              onClick={() => setActiveTab("paragraphs")}
              className={`flex items-center gap-1.5 rounded-t-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === "paragraphs"
                  ? "bg-gray-100 text-foreground"
                  : "text-gray-500 hover:bg-gray-50 hover:text-foreground"
              }`}
            >
              <FileText className="h-4 w-4" />
              Paragraphs
              {paragraphs && paragraphs.length > 0 && (
                <span className="ml-1 rounded-full bg-gray-200 px-1.5 py-0.5 text-xs text-gray-600">
                  {paragraphs.length}
                </span>
              )}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-gray-100 p-5">
          {/* Keep Info mounted across tabs so comment drafts survive. */}
          <div hidden={activeTab !== "info"} className="space-y-4">
            <section className="rounded-xl bg-white p-3 shadow-sm">
              <h3 className={cn(typography.eyebrow, "mb-2")}>
                Document Details
              </h3>
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-4 gap-y-1.5 text-sm text-foreground">
                {year != null &&
                  (() => {
                    const ageInfo = getAgeIndicator(year);
                    return (
                      <>
                        <dt className="text-xs">Year</dt>
                        <dd className="flex items-center gap-2 font-medium">
                          {year}
                          <Tooltip content={ageInfo.tooltip}>
                            <span
                              className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${ageInfo.color} ${ageInfo.bgColor}`}
                            >
                              {ageInfo.label}
                            </span>
                          </Tooltip>
                        </dd>
                      </>
                    );
                  })()}
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
                {link && (
                  <>
                    <dt className="text-xs">Source</dt>
                    <dd>
                      <a
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-medium text-un-blue-text hover:underline"
                      >
                        View PDF <ExternalLink className="h-3 w-3" />
                      </a>
                    </dd>
                  </>
                )}
                {citingEntities.length > 0 ? (
                  <>
                    <dt className="self-start pt-0.5 text-xs">Also cited by</dt>
                    <dd className="flex flex-wrap gap-1">
                      {citingEntities.map((citingEntity) => (
                        <Chip
                          key={citingEntity}
                          density="dense"
                          tone="neutral"
                          href={`/entity/${encodeURIComponent(citingEntity)}/`}
                          title={entityLongMap?.[citingEntity] || citingEntity}
                        >
                          {citingEntity}
                        </Chip>
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

            <section ref={commentsSectionRef} className="scroll-mt-2">
              {activityError && (
                <p role="alert" className="mb-2 text-sm text-red-700">
                  Could not refresh comments and decisions. Retrying…
                </p>
              )}
              <CommentsDecisionPanel
                key={`${budgetVersion}:${symbol}:${entity}:${subprogramme || ""}`}
                symbol={symbol}
                entity={entity}
                subprogramme={subprogramme}
                entitySubprogrammes={entitySubprogrammes}
                allEntities={allEntities}
                loading={activityLoading}
                decisions={allDecisions}
                comments={allComments}
                readCommentIds={readCommentIds}
                userEmail={currentUserEmail}
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

            {/* Newer Versions */}
            {!versionsLoading &&
              (() => {
                // Find current document index
                const currentIndex = documentVersions.findIndex(
                  (v) => v.symbol === symbol,
                );
                // Only show versions newer than current (after current index in the sorted list)
                const newerVersions =
                  currentIndex >= 0
                    ? documentVersions.slice(currentIndex + 1)
                    : [];

                if (newerVersions.length > 0) {
                  return (
                    <div className="rounded-xl bg-white p-4 shadow-sm">
                      <h3 className={cn(typography.eyebrow, "mb-3")}>
                        Newer Versions ({newerVersions.length})
                      </h3>
                      {/* Header row */}
                      <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] items-center gap-x-3 gap-y-2 text-xs">
                        <span className="font-medium text-gray-500">Year</span>
                        <span className="font-medium text-gray-500">
                          Symbol
                        </span>
                        <span className="text-center font-medium text-gray-500">
                          vs Original
                        </span>
                        <span className="text-center font-medium text-gray-500">
                          vs Previous
                        </span>
                        <span className="font-medium text-gray-500">PDF</span>
                        <span className="font-medium text-gray-500">
                          Action
                        </span>

                        {newerVersions.map((version, idx) => {
                          // Previous version is either the one before in newerVersions, or the current document
                          const previousSymbol =
                            idx === 0 ? symbol : newerVersions[idx - 1].symbol;
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
                              <a
                                href={getDocumentComparisonUrl(
                                  symbol,
                                  version.symbol,
                                )}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`inline-flex items-center justify-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors ${UN_BLUE.badge}`}
                                title={`Compare ${version.symbol} with ${symbol} in a new tab`}
                              >
                                <ArrowLeftRight className="h-3 w-3" />
                              </a>

                              {/* Compare with Previous */}
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
                                    ? "cursor-not-allowed bg-gray-100 text-gray-400"
                                    : UN_BLUE.badge
                                }`}
                                title={
                                  idx === 0
                                    ? "Same as original"
                                    : `Compare ${version.symbol} with ${previousSymbol} in a new tab`
                                }
                              >
                                <ArrowLeftRight className="h-3 w-3" />
                              </a>

                              {/* View PDF */}
                              <a
                                href={`https://docs.un.org/en/${version.symbol}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-200"
                                title="View PDF in ODS in a new tab"
                              >
                                <ExternalLink className="h-3 w-3" />
                              </a>

                              {/* Update To */}
                              {trackContext?.canEditSubmission &&
                              onUpdateClick ? (
                                <button
                                  onClick={() => {
                                    onUpdateClick(version.symbol);
                                  }}
                                  className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100"
                                  title="Update the mandate citation to this newer version"
                                >
                                  <ArrowRight className="h-3 w-3" />
                                  Update
                                </button>
                              ) : (
                                <span className="text-xs text-gray-400">—</span>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </div>
                    </div>
                  );
                }

                return null;
              })()}
          </div>

          {/* Paragraphs Tab */}
          {activeTab === "paragraphs" && (
            <div className="space-y-4">
              {/* Search Box */}
              <div className="rounded-xl bg-white p-4 shadow-sm">
                <div className={cn(typography.eyebrow, "mb-2")}>
                  Search in document
                </div>
                <div className="relative">
                  <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search for keywords in paragraphs..."
                    className="w-full rounded-lg border border-gray-200 bg-white py-2 pr-4 pl-10 text-sm placeholder:text-gray-400 focus:border-un-blue focus:ring-2 focus:ring-un-blue/20 focus:outline-none"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute top-1/2 right-3 -translate-y-1/2 text-gray-400 hover:text-gray-600"
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
                          : "bg-gray-100 text-gray-500 hover:bg-gray-200"
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
                              ? "bg-un-blue text-white"
                              : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                          }`}
                        >
                          {e}{" "}
                          <span
                            className={
                              selectedEntity === e
                                ? "text-white/60"
                                : "text-gray-400"
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
                  <p className="mb-3 text-xs text-gray-500">
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
                      <AlertTriangle className="h-6 w-6 text-gray-400" />
                    </div>
                    <p className="text-sm font-medium text-gray-600">
                      {fulltextError
                        ? "Fulltext could not be loaded"
                        : "No readable fulltext available"}
                    </p>
                    <p className="mt-1 text-xs text-gray-400">
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
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
