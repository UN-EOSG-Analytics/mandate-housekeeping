// Modal is client-side
"use client";

import { type BudgetVersion } from "@/lib/db/budget-version";
import { CommentsDecisionPanel } from "./CommentsDecisionPanel";

import React, { useContext } from "react";
import { DecisionTracksContext } from "./ReviewDecisionControl";
import { CommentConversationContext } from "./CommentConversationContext";
import { DocumentSymbol as SharedDocumentSymbol } from "@un-eosg/ui/components/document-symbol";
import { typography } from "@un-eosg/ui/typography";
import { cn } from "@/lib/utils";
import {
  isContentElement,
  resolveVisibilityTier,
  isMainPreambular,
  shouldCollapsePreamble,
} from "@/features/mandates/services/documents/paragraph-presentation";
import { getAgeIndicator } from "@/features/mandates/services/age-indicator";
import { fetchParagraphs } from "@/features/mandates/services/documents/client-data-service";
import { getDocumentDecisionsAction } from "@/features/mandates/actions/decisions";
import { getDocumentVersionsAction } from "@/features/mandates/services/documents/document-fetching";
import type { DocumentVersion } from "@/features/mandates/services/documents/document-versions";
import { DiffModal } from "./DiffModal";
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
  MessageSquare,
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

function highlightSearchAndEntity(
  text: string,
  searchQuery?: string,
  entity?: string,
  entityLong?: string | null,
): React.ReactNode {
  if (!searchQuery && !entity && !entityLong) return text;

  const terms: { term: string; type: "search" | "entity" }[] = [];

  if (searchQuery && searchQuery.trim()) {
    terms.push({ term: searchQuery.trim(), type: "search" });
  }

  if (entity) terms.push({ term: entity, type: "entity" });
  if (entityLong) terms.push({ term: entityLong, type: "entity" });

  if (terms.length === 0) return text;

  // Create pattern that matches any of the terms
  const pattern = new RegExp(
    `(${terms.map(({ term }) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
    "gi",
  );

  const parts = text.split(pattern);
  if (parts.length === 1) return text;

  return parts.map((part, i) => {
    const matchingTerm = terms.find(
      ({ term }) => term.toLowerCase() === part.toLowerCase(),
    );

    if (matchingTerm) {
      if (matchingTerm.type === "search") {
        return (
          <mark
            key={i}
            className="rounded bg-yellow-200 px-0.5 text-foreground"
          >
            {part}
          </mark>
        );
      } else {
        return (
          <strong key={i} className="text-foreground">
            {part}
          </strong>
        );
      }
    }
    return part;
  });
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
            {highlightSearchAndEntity(p.text, searchQuery, entity, entityLong)}
          </p>
          {p.mandates?.[0] && (
            <span
              className="text-xs text-gray-500"
              title="Automatic action annotation"
            >
              {p.mandates[0].action_verb}
            </span>
          )}
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
  const [fulltextError, setFulltextError] = useState(false);
  const [paragraphs, setParagraphs] = useState<Paragraph[] | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "info" | "decisions" | "activity" | "paragraphs"
  >(initialTab ?? "info");
  const [allDecisions, setAllDecisions] = useState<MandateDecision[]>([]);
  const [allComments, setAllComments] = useState<MandateComment[]>([]);
  const [readCommentIds, setReadCommentIds] = useState<string[] | null>(null);
  const handleRead = useCallback(
    (ids: string[]) =>
      setReadCommentIds((previous) => [
        ...new Set([...(previous || []), ...ids]),
      ]),
    [],
  );
  const [documentVersions, setDocumentVersions] = useState<DocumentVersion[]>(
    [],
  );
  const [diffModalOpen, setDiffModalOpen] = useState(false);
  const [diffCompareSymbol, setDiffCompareSymbol] = useState<{
    symbol: string;
    year: number;
    title?: string | null;
  } | null>(null);
  const [diffOriginalOverride, setDiffOriginalOverride] = useState<{
    symbol: string;
    year: number;
    title?: string | null;
  } | null>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, setOpen]);

  // Set initial tab when modal opens with a specific tab
  useEffect(() => {
    if (open && initialTab) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Sync state with props on modal open
      setActiveTab(initialTab);
    }
  }, [open, initialTab]);

  // Track last fetched symbol to detect changes
  const lastFetchedSymbolRef = useRef<string | null>(null);

  // Fetch static data (paragraphs, versions) once per symbol
  useEffect(() => {
    if (!open || lastFetchedSymbolRef.current === symbol) return;
    lastFetchedSymbolRef.current = symbol;

    setLoading(true);
    setFulltextError(false);

    Promise.all([
      fetchParagraphs(symbol).catch(() => {
        setFulltextError(true);
        return [];
      }),
      getDocumentVersionsAction(symbol).catch(() => ({
        success: false as const,
        error: "Failed to load",
      })),
    ]).then(([parasData, versionsResult]) => {
      setParagraphs(parasData || []);
      if (versionsResult.success && versionsResult.data) {
        setDocumentVersions(versionsResult.data);
      }
      setLoading(false);
    });
  }, [open, symbol]);

  // Reset static data when symbol changes
  useEffect(() => {
    lastFetchedSymbolRef.current = null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Reset state when symbol prop changes
    setParagraphs(null);
    setDocumentVersions([]);
  }, [symbol]);

  // Poll activity data (decisions, comments) every 3s while open
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
      ).catch(() => ({
        success: false as const,
        error: "Failed to load",
      }));
      pending = false;
      if (!cancelled && result.success && result.data) {
        setReadCommentIds((previous) => [
          ...new Set([...(previous || []), ...result.data!.readCommentIds]),
        ]);
        setAllDecisions(result.data.decisions || []);
        setAllComments(result.data.comments || []);
      }
    };

    fetchActivity(); // Initial fetch
    const interval = setInterval(fetchActivity, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [open, symbol, budgetVersion]);

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

  // In controlled mode (isOpen passed), only render the sidebar
  const sidebarOnly = controlledOpen !== undefined;

  return (
    <>
      {!sidebarOnly &&
        (isTruncated ? <Tooltip content={symbol}>{btn}</Tooltip> : btn)}

      {open && (
        <div className="fixed inset-0 z-50 flex cursor-default justify-end">
          <div
            className="absolute inset-0 cursor-pointer bg-black/20"
            onClick={() => setOpen(false)}
          />

          <div
            ref={sidebarRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="sidebar-title"
            className="relative flex h-full w-full max-w-xl cursor-default flex-col bg-white shadow-xl"
          >
            <div className="border-b p-5 pb-0">
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3">
                    <h2
                      id="sidebar-title"
                      className="text-xl font-semibold text-foreground"
                    >
                      {symbol}
                    </h2>
                    {isFoundational && (
                      <Tooltip content="Also cited in the Mandates and Background section">
                        <span className="inline-flex items-center gap-1 rounded-full bg-un-blue/10 px-2.5 py-0.5 text-xs font-medium text-un-blue-text">
                          <Star
                            className="h-3 w-3 fill-un-blue"
                            strokeWidth={0}
                          />
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
                  onClick={() => setActiveTab("activity")}
                  className={`flex items-center gap-1.5 rounded-t-lg px-4 py-2.5 text-sm font-medium transition-colors ${activeTab === "activity" || activeTab === "decisions" ? "bg-gray-100 text-foreground" : "text-foreground hover:bg-gray-50"}`}
                >
                  <MessageSquare className="h-4 w-4" />
                  Comments &amp; decisions
                  {allComments.length > 0 && (
                    <span className="rounded-full bg-gray-200 px-1.5 py-0.5 text-xs">
                      {allComments.length}
                    </span>
                  )}
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
              {/* Info Tab */}
              {activeTab === "info" && (
                <div className="space-y-4">
                  <div className="rounded-xl bg-white p-4 shadow-sm">
                    <h3 className={cn(typography.eyebrow, "mb-3")}>
                      Document Details
                    </h3>
                    <dl className="space-y-2 text-sm">
                      {year &&
                        (() => {
                          const ageInfo = getAgeIndicator(year);
                          return (
                            <div className="flex items-center justify-between border-b border-gray-100 py-1.5">
                              <dt className="text-gray-500">Year</dt>
                              <dd className="flex items-center gap-2 font-medium text-foreground">
                                {year}
                                <Tooltip content={ageInfo.tooltip}>
                                  <span
                                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${ageInfo.color} ${ageInfo.bgColor}`}
                                  >
                                    {ageInfo.label}
                                  </span>
                                </Tooltip>
                              </dd>
                            </div>
                          );
                        })()}
                      {body && (
                        <div className="flex items-center justify-between border-b border-gray-100 py-1.5">
                          <dt className="text-gray-500">Issuing body</dt>
                          <dd className="font-medium text-foreground">
                            {body}
                          </dd>
                        </div>
                      )}
                      {docType && (
                        <div className="flex items-center justify-between border-b border-gray-100 py-1.5">
                          <dt className="text-gray-500">Document type</dt>
                          <dd className="font-medium text-foreground">
                            {docType}
                          </dd>
                        </div>
                      )}
                      {otherEntitiesCount !== undefined &&
                        otherEntitiesCount > 0 && (
                          <div className="flex items-center justify-between border-b border-gray-100 py-1.5">
                            <dt className="text-gray-500">Also cited by</dt>
                            <dd className="font-medium text-foreground">
                              {otherEntitiesCount} other{" "}
                              {otherEntitiesCount === 1 ? "entity" : "entities"}
                            </dd>
                          </div>
                        )}
                      {link && (
                        <div className="flex items-center justify-between py-1.5">
                          <dt className="text-gray-500">Source</dt>
                          <dd>
                            <a
                              href={link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 font-medium text-un-blue-text hover:underline"
                            >
                              View PDF →
                            </a>
                          </dd>
                        </div>
                      )}
                    </dl>
                  </div>

                  {/* Newer Versions */}
                  {!loading &&
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
                              <span className="font-medium text-gray-500">
                                Year
                              </span>
                              <span className="font-medium text-gray-500">
                                Symbol
                              </span>
                              <span className="text-center font-medium text-gray-500">
                                vs Original
                              </span>
                              <span className="text-center font-medium text-gray-500">
                                vs Previous
                              </span>
                              <span className="font-medium text-gray-500">
                                PDF
                              </span>
                              <span className="font-medium text-gray-500">
                                Action
                              </span>

                              {newerVersions.map((version, idx) => {
                                // Previous version is either the one before in newerVersions, or the current document
                                const previousSymbol =
                                  idx === 0
                                    ? symbol
                                    : newerVersions[idx - 1].symbol;
                                const previousYear =
                                  idx === 0
                                    ? (year ?? 0)
                                    : newerVersions[idx - 1].year;

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
                                    <button
                                      onClick={() => {
                                        setDiffOriginalOverride(null); // Use main document as original
                                        setDiffCompareSymbol({
                                          symbol: version.symbol,
                                          year: version.year,
                                          title: version.title,
                                        });
                                        setDiffModalOpen(true);
                                      }}
                                      className={`inline-flex items-center justify-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors ${UN_BLUE.badge}`}
                                      title={`Compare ${version.symbol} with ${symbol}`}
                                    >
                                      <ArrowLeftRight className="h-3 w-3" />
                                    </button>

                                    {/* Compare with Previous */}
                                    <button
                                      onClick={() => {
                                        // For comparing with previous version
                                        setDiffOriginalOverride({
                                          symbol: previousSymbol,
                                          year: previousYear,
                                          title:
                                            idx === 0
                                              ? title
                                              : newerVersions[idx - 1].title,
                                        });
                                        setDiffCompareSymbol({
                                          symbol: version.symbol,
                                          year: version.year,
                                          title: version.title,
                                        });
                                        setDiffModalOpen(true);
                                      }}
                                      className={`inline-flex items-center justify-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
                                        idx === 0
                                          ? "cursor-not-allowed bg-gray-100 text-gray-400"
                                          : UN_BLUE.badge
                                      }`}
                                      title={
                                        idx === 0
                                          ? "Same as original"
                                          : `Compare ${version.symbol} with ${previousSymbol}`
                                      }
                                      disabled={idx === 0}
                                    >
                                      <ArrowLeftRight className="h-3 w-3" />
                                    </button>

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
                                      <span className="text-xs text-gray-400">
                                        —
                                      </span>
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
              )}

              {/* Keep the composer mounted while changing tabs so drafts survive. */}
              <div
                hidden={activeTab !== "activity" && activeTab !== "decisions"}
              >
                <CommentsDecisionPanel
                  key={`${budgetVersion}:${symbol}:${entity}:${subprogramme || ""}`}
                  symbol={symbol}
                  entity={entity}
                  subprogramme={subprogramme}
                  entitySubprogrammes={entitySubprogrammes}
                  allEntities={allEntities}
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
                        {paragraphs.find((p) => p.part_letter)?.part_letter}{" "}
                        only.
                      </p>
                    )}
                    {loading ? (
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
                          The parsed document text is not available in our
                          database
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
          </div>
        </div>
      )}

      {/* Diff Modal */}
      {diffCompareSymbol && (
        <DiffModal
          isOpen={diffModalOpen}
          onClose={() => {
            setDiffModalOpen(false);
            setDiffCompareSymbol(null);
            setDiffOriginalOverride(null);
          }}
          originalSymbol={diffOriginalOverride?.symbol ?? symbol}
          originalYear={diffOriginalOverride?.year ?? year ?? 0}
          originalTitle={diffOriginalOverride?.title ?? title}
          compareSymbol={diffCompareSymbol.symbol}
          compareYear={diffCompareSymbol.year}
          compareTitle={diffCompareSymbol.title ?? undefined}
        />
      )}
    </>
  );
}
