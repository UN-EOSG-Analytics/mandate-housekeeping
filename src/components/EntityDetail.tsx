"use client";

import {
  citationSymbolKey,
  type CitationLocation,
  type EntityCitationIndex,
} from "@/features/mandates/services/citation-locations";
import { useCitationConfirmation } from "@/hooks/useCitationConfirmation";
import { CommentConversationContext } from "./CommentConversationContext";
import {
  useCommentNotifications,
  dispatchCommentNotificationsRefresh,
} from "@/hooks/useCommentNotifications";
import type { BudgetVersion } from "@/lib/db/budget-version";
import { useSearchParams } from "next/navigation";
import type {
  DecisionChangeHandler,
  DecisionReasonChangeHandler,
} from "@/types";
import { DocumentSymbol as DocumentSymbolBadge } from "@un-eosg/ui/components/document-symbol";
import { Button } from "@un-eosg/ui/components/button";
import { typography } from "@un-eosg/ui/typography";

import {
  CURRENT_BUDGET_VERSION,
  DISABLED_REVIEW_MESSAGE,
} from "@/lib/db/budget-version";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useRealtimeDecisions,
  type RealtimeChange,
} from "@/hooks/useRealtimeDecisions";
import { FEATURE_FLAGS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  DECISION_THEME,
  DECISION_BADGE_STYLES,
  POPUP_STYLES,
  CHANGE_INDICATOR,
  UN_BLUE,
} from "@/lib/theme";
import { groupCitations } from "@/features/mandates/services/citation-groups";
import { ViewDetailsLabel } from "./ViewDetailsLabel";
import { CitationYear } from "./CitationYear";
import {
  clearAllEntityDecisionsAction,
  createDecisionAction,
  updateDecisionReasonAction,
} from "@/features/mandates/actions/decisions";
import {
  acceptReviewChangeAction,
  revertReviewChangeAction,
} from "@/features/mandates/actions/review-baselines";
import { createCommentAction } from "@/features/mandates/actions/comments";
import {
  endReviewModeAction,
  startReviewModeAction,
} from "@/features/mandates/actions/review-mode";
import {
  getEntityDecisionsAction,
  getEntityReviewChangesAction,
  getReviewModeStatusAction,
  getDocumentMetadataAction,
  getUserRoleAction,
} from "@/features/mandates/services/client-reads";
import { getEntityPermissions } from "@/features/auth/permissions";
import {
  getMandateWarnings,
  getWarningIcon,
  getWarningSummary,
  newestVersionWarningSymbols,
} from "@/features/mandates/services/mandate-warnings";
import type {
  Decision,
  Mandate,
  MandateComment,
  MandateDecision,
  MandateState,
  ReviewChangeInfo,
} from "@/types";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ArrowRightLeft,
  ArrowUpCircle,
  Building,
  Check,
  CheckCircle,
  FileText,
  GitBranch,
  Layers,
  Lightbulb,
  MoreHorizontal,
  MessageSquare,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Star,
  Target,
  Users,
  X,
} from "lucide-react";
import {
  ActiveTableFilters,
  EntityTableColumnHeader,
  SubprogrammeContents,
  EntityTableFilterContext,
  OtherEntitiesCell,
  BodyTypeFilter,
  ENTITY_TOOLBAR_CONTROL,
  type EntityTableViewControls,
} from "./EntityTableControls";
import {
  EMPTY_TABLE_FILTERS,
  isVisibleAddedState,
  buildEntityTableView,
  hasTableFilters,
  isRequiredSubmission,
  hasSubmissionDecision,
  getTableReplacements,
  replacementTableMandate,
  REPLACEMENT_LABELS,
  type ReplacementMetadata,
  type TableFilters,
  type TableSort,
  type TableSortColumn,
} from "@/features/mandates/services/table-view";
import {
  Children,
  type ComponentProps,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ReadOnlyNoticeBanner,
  ReviewerModeBanner,
  ReviewInProgressBanner,
} from "./Banner";
import { ClearAllDecisionsDialog } from "./ClearAllDecisionsDialog";
import {
  DecisionTracksContext,
  ReviewDecisionControl,
} from "./ReviewDecisionControl";
import { getDecisionTracks } from "@/features/mandates/services/decision-tracks";
import { DecisionDropdown } from "./DecisionDropdown";
import { DocumentSymbol } from "./DocumentModal";
import { DocumentSearchInput } from "../features/mandates/ui/DocumentSearchInput";
import { ManualDocumentForm } from "../features/mandates/ui/ManualDocumentForm";
import { EntityHeader } from "./EntityHeader";
import type { ManualEntryData } from "../features/mandates/ui/ManualDocumentForm";
import { ReviewBlockedDialog } from "./ReviewBlockedDialog";
import { Tooltip } from "./Tooltip";
import { WarningIcon } from "./WarningIcon";
import { WarningTooltip } from "./WarningTooltip";
import {
  getReasonLabel,
  getReasonIcon,
  type DecisionType,
} from "@/features/mandates/services/decision-reasons";

interface Props {
  bodyFullNames: Record<string, string>;
  cycleReadOnly?: boolean;
  budgetVersion?: BudgetVersion;
  entity: string;
  entityLong: string | null;
  partName: string | null;
  backgroundMandates: Mandate[];
  legislativeMandates: Record<string, Mandate[]>;
}

// Transform subprogramme name for display
function formatSubprogrammeName(subprog: string): string {
  if (
    subprog === "Legislative mandates" ||
    subprog.toLowerCase().includes("all subprogramme")
  ) {
    return "Programme level";
  }
  return subprog;
}

// Helper to get decision display info (color, label - no icon)
function getDecisionDisplayInfo(decision: string, newSymbol?: string) {
  const decisionLower = decision.toLowerCase();

  const decisionMap: Record<string, { label: string; color: string }> = {
    add: { label: "Add", color: DECISION_BADGE_STYLES.add },
    retain: { label: "Retain", color: DECISION_BADGE_STYLES.retain },
    update: { label: "Update", color: DECISION_BADGE_STYLES.update },
    remove: { label: "Remove", color: DECISION_BADGE_STYLES.remove },
    "no decision": {
      label: "No Decision",
      color: DECISION_BADGE_STYLES["no decision"],
    },
  };

  const info = decisionMap[decisionLower] || {
    label: decision,
    color: DECISION_BADGE_STYLES["no decision"],
  };

  // For updates, append target symbol to label
  if (decisionLower === "update" && newSymbol) {
    return { ...info, displayLabel: `${info.label} → ${newSymbol}` };
  }

  return { ...info, displayLabel: info.label };
}

// Map icon names from decision-reasons.ts to lucide-react components
function getIconComponent(iconName: string | null) {
  const iconMap: Record<string, LucideIcon> = {
    Target,
    Lightbulb,
    Building,
    MoreHorizontal,
    ArrowRightLeft,
    GitBranch,
    CheckCircle,
    Users,
    ArrowUpCircle,
    Layers,
  };
  return iconName ? iconMap[iconName] : null;
}

// Helper to format reason label from ID
function formatReasonLabel(
  reasonId: string,
  reasonLabel: string | null,
): string {
  if (reasonLabel) {
    // Remove markdown formatting and clean up
    return reasonLabel.replace(/\*\*/g, "").replace(/\.$/, "").trim();
  }
  // Fallback: format the ID nicely
  return reasonId
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Detect if decision changed during review and format change description
function getDecisionChange(
  baseline: MandateDecision | null | undefined,
  current: MandateDecision | null | undefined,
): {
  hasChange: boolean;
  before: {
    decision: string;
    reason: string | null;
    newSymbol?: string;
  };
  after: {
    decision: string;
    reason: string | null;
    newSymbol?: string;
  };
} | null {
  // No baseline means review not started or this wasn't tracked
  if (!baseline) return null;

  // Both null/undefined - no change
  if (!baseline && !current) return null;

  const baselineReason =
    baseline?.decisionReason || baseline?.otherReason || null;
  const currentReason = current?.decisionReason || current?.otherReason || null;

  // Added during review
  if (!baseline && current) {
    return {
      hasChange: true,
      before: {
        decision: "No decision",
        reason: null,
      },
      after: {
        decision: current.decision,
        reason: currentReason,
        newSymbol: current.newSymbol || undefined,
      },
    };
  }

  // Removed during review
  if (baseline && !current) {
    return {
      hasChange: true,
      before: {
        decision: baseline.decision,
        reason: baselineReason,
        newSymbol: baseline.newSymbol || undefined,
      },
      after: {
        decision: "No decision",
        reason: null,
      },
    };
  }

  if (!current) return null;

  // Check if anything changed
  const decisionChanged = baseline.decision !== current.decision;
  const symbolChanged = baseline.newSymbol !== current.newSymbol;
  const reasonChanged = baselineReason !== currentReason;

  if (decisionChanged || symbolChanged || reasonChanged) {
    return {
      hasChange: true,
      before: {
        decision: baseline.decision,
        reason: baselineReason,
        newSymbol: baseline.newSymbol || undefined,
      },
      after: {
        decision: current.decision,
        reason: currentReason,
        newSymbol: current.newSymbol || undefined,
      },
    };
  }

  return null;
}

// PhaseTracker component commented out - for future use
// function PhaseTracker() {
//   const phases = [
//     { id: 1, name: "Internal Review", type: "internal" },
//     { id: 2, name: "OPPFB Review", type: "ppbd" },
//     { id: 3, name: "Internal Review", type: "internal" },
//     { id: 4, name: "OPPFB Review", type: "ppbd" },
//   ];
//   const currentPhase = 1; // Mockup: always phase 1
//
//   return (
//     <div className="rounded-lg border border-gray-200 bg-white px-6 py-3 shadow-sm">
//       <div className="flex items-center gap-6">
//         <span className="text-xs font-medium text-gray-500 uppercase">
//           Review phases
//         </span>
//         <div className="flex flex-1 items-center gap-1">
//           {phases.map((phase, i) => (
//             <div key={phase.id} className="flex items-center">
//               {i > 0 && <div className="mx-1 h-px w-6 bg-gray-200" />}
//               <div
//                 className={`flex items-center gap-1.5 rounded-full ${i === 0 ? "pr-3 pl-5" : "px-3"} py-1 text-xs font-medium transition-colors ${
//                   phase.id < currentPhase
//                     ? "bg-green-100 text-green-700"
//                     : phase.id === currentPhase
//                       ? phase.type === "internal"
//                         ? "bg-un-blue text-white"
//                         : "bg-amber-500 text-white"
//                       : "bg-gray-100 text-gray-400"
//                 }`}
//               >
//                 {phase.id < currentPhase && <Check className="h-3 w-3" />}
//                 <span className="tabular-nums">{phase.id}.</span>
//                 {phase.name}
//               </div>
//             </div>
//           ))}
//         </div>
//         {currentPhase <= phases.length && (
//           <button
//             onClick={() => alert("Phase completion not yet implemented")}
//             className="rounded bg-un-blue px-3 py-1 text-xs font-medium text-white hover:bg-un-blue/90"
//           >
//             Complete Phase {currentPhase}
//           </button>
//         )}
//       </div>
//     </div>
//   );
// }

function tableGrid(showReviewer: boolean) {
  return showReviewer
    ? "grid-cols-[106px_minmax(128px,1fr)_60px_56px_112px_120px_128px_28px_80px] xl:grid-cols-[136px_minmax(220px,1fr)_68px_60px_138px_132px_142px_40px_84px]"
    : "grid-cols-[112px_minmax(160px,1fr)_60px_56px_118px_120px_28px_80px] xl:grid-cols-[136px_minmax(220px,1fr)_68px_60px_138px_132px_40px_84px]";
}

// Preserve the responsive CSS layout while exposing real row/column relationships.
function CitationTableRow({
  children,
  header = false,
  spanAll = false,
  ...props
}: ComponentProps<"div"> & { header?: boolean; spanAll?: boolean }) {
  const controls = useContext(EntityTableFilterContext);
  return (
    <div {...props} role="row">
      {Children.map(children, (child) =>
        child == null ? null : (
          <div
            role={header ? "columnheader" : "cell"}
            aria-colspan={
              spanAll ? (controls?.showReviewerColumn ? 9 : 8) : undefined
            }
            className="contents"
          >
            {child}
          </div>
        ),
      )}
    </div>
  );
}

function ColumnHeaders({ controls }: { controls: EntityTableViewControls }) {
  return (
    <CitationTableRow
      header
      className={cn(
        typography.tableHeader,
        `grid ${tableGrid(controls.showReviewerColumn)} h-10 items-center gap-x-1.5 tracking-normal text-foreground normal-case xl:gap-x-2`,
      )}
    >
      <div className="pl-3">
        <EntityTableColumnHeader
          column="symbol"
          label="Symbol"
          controls={controls}
        />
      </div>
      <div className="min-w-0">
        <EntityTableColumnHeader
          column="title"
          label="Title"
          controls={controls}
        />
      </div>
      <EntityTableColumnHeader column="year" label="Year" controls={controls} />
      <EntityTableColumnHeader
        column="others"
        label="Also cited by"
        controls={controls}
      />
      <EntityTableColumnHeader
        column="notes"
        label="Notes"
        controls={controls}
      />
      <EntityTableColumnHeader
        column="submissions"
        label={controls.submissionLabel}
        controls={controls}
      />
      {controls.showReviewerColumn && (
        <EntityTableColumnHeader
          column="reviews"
          label="Reviewer decision"
          controls={controls}
        />
      )}
      <EntityTableColumnHeader
        column="comments"
        label="Comments"
        icon={<MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />}
        controls={controls}
      />
      <span className="sr-only">Document details</span>
    </CitationTableRow>
  );
}

// Inner row content (shared between normal and update target rows)
function MandateRowContent({
  mandate,
  subprogramme = null,
  state,
  commentCount,
  isUpdateTarget,
  rowLabel,
  sourceSymbol,
  readOnly,
  isFoundational,
  allSymbols,
  citationIndex,
  newestWithNewerVersion,
  onOpenSidebar,
  onOpenActivityTab,
  onDecision,
  onReasonChange,
  onUpdateClick,
  showReasonPopup,
  onReasonPopupClose,
  onEdit,
}: {
  mandate: Mandate;
  subprogramme?: string | null;
  state?: MandateState;
  commentCount: number;
  isReviewer: boolean;
  sourceSymbol?: string;
  isUpdateTarget?: boolean; // True for the "new" row in update view (no dropdowns)
  rowLabel?: string;
  readOnly?: boolean; // True for background section (no interactivity)
  isFoundational?: boolean; // True if mandate is also in background mandates
  allSymbols?: Set<string>; // All symbols in current section for warning system
  citationIndex?: EntityCitationIndex; // Unfiltered, effective citations across this entity
  newestWithNewerVersion?: Set<string>; // Symbols that are newest among those with same newer version
  reviewChangeInfo?: ReviewChangeInfo | null; // Review change info from server
  isUnderReview?: boolean; // Whether entity is currently under review
  onOpenSidebar?: () => void;
  onOpenActivityTab?: () => void;
  onDecision: DecisionChangeHandler;
  onReasonChange?: DecisionReasonChangeHandler;
  onUpdateClick?: (prefillSymbol?: string) => void;
  showReasonPopup?: boolean;
  onReasonPopupClose?: () => void;
  onEdit?: () => void;
  onAcceptChange?: () => void;
  onRevertChange?: () => void;
}) {
  const conversationContext = useContext(CommentConversationContext);
  const sharedCounts = conversationContext.counts[mandate.symbol];
  const displayedCommentCount = sharedCounts?.total ?? commentCount;
  const unreadCommentCount = sharedCounts?.unread ?? 0;
  const trackContext = useContext(DecisionTracksContext);
  const canEditSubmission = !readOnly && !!trackContext?.canEditSubmission;
  const currentDecision = state?.decision;
  const citationRow = useRef<HTMLDivElement>(null);
  async function dropFromNote(location: CitationLocation) {
    const details = [
      ...document.querySelectorAll<HTMLButtonElement>(
        "[data-citation-visible='true'] [data-view-details]",
      ),
    ];
    const here = citationRow.current?.querySelector<HTMLButtonElement>(
      "[data-view-details]",
    );
    const index = here ? details.indexOf(here) : -1;
    const saved = await trackContext?.onDropCitation?.(location);
    if (saved)
      requestAnimationFrame(() => {
        // Removing the final duplicate can unmount a focused note button.
        if (document.activeElement !== document.body) return;
        const candidates = [
          here,
          ...details.slice(index + 1),
          ...details.slice(0, Math.max(index, 0)).reverse(),
        ];
        (
          candidates.find(
            (button) => button?.isConnected && button.getClientRects().length,
          ) ??
          document.querySelector<HTMLInputElement>("[data-workspace-search]")
        )?.focus();
      });
    return !!saved;
  }
  const tableControls = useContext(EntityTableFilterContext);
  const bodyFilters = tableControls?.filters.bodies ?? [];
  const bodyFilterActive = bodyFilters.length > 0;
  const matchesBodyFilter = bodyFilters.includes(mandate.body || "Unknown");
  const rowDescription = [
    rowLabel,
    bodyFilterActive && !matchesBodyFilter ? "Shown for context" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const bgColorClass = isUpdateTarget ? "bg-secondary/40" : "";

  return (
    <div className="relative" ref={citationRow}>
      <CitationTableRow
        className={`grid ${tableGrid(!!tableControls?.showReviewerColumn)} min-h-12 cursor-pointer items-center gap-x-1.5 border-b border-border py-1 text-sm transition-colors xl:gap-x-2 ${
          bgColorClass || "hover:bg-muted"
        }`}
        onClick={onOpenSidebar}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1 pl-3"
        >
          {isUpdateTarget && (
            <span className="mr-1 text-xs text-amber-800">↳</span>
          )}
          <Tooltip
            asChild
            content={mandate.symbol.length > 18 ? mandate.symbol : undefined}
          >
            <a
              href={mandate.link || "#"}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={mandate.symbol}
              className="min-w-0 truncate whitespace-nowrap focus-visible:rounded focus-visible:ring-2 focus-visible:ring-un-blue focus-visible:ring-offset-2"
              onClick={(e) => !mandate.link && e.preventDefault()}
            >
              <DocumentSymbolBadge>
                {mandate.symbol.length > 18
                  ? `${mandate.symbol.slice(0, 18)}…`
                  : mandate.symbol}
              </DocumentSymbolBadge>
            </a>
          </Tooltip>
          {isFoundational && (
            <Tooltip content="Also cited in Mandates and background">
              <span className="inline-flex shrink-0">
                <Star
                  aria-hidden="true"
                  className="h-3.5 w-3.5 fill-un-blue text-un-blue"
                  strokeWidth={0.5}
                />
                <span className="sr-only">Foundational mandate</span>
              </span>
            </Tooltip>
          )}
        </div>
        <div className="flex min-w-0 items-center text-foreground">
          <Tooltip asChild content={mandate.title || undefined}>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onOpenSidebar?.();
              }}
              aria-label={`Review document ${mandate.symbol}`}
              className="min-w-0 flex-1 text-left focus-visible:ring-2 focus-visible:ring-un-blue"
            >
              <span className="line-clamp-2 leading-snug">
                {mandate.title || (
                  <span className="text-muted-foreground italic">No title</span>
                )}
              </span>
              {rowDescription && (
                <span className="block truncate text-xs font-normal text-muted-foreground">
                  {rowDescription}
                </span>
              )}
            </button>
          </Tooltip>
        </div>
        <CitationYear year={mandate.year} />
        <OtherEntitiesCell
          entities={[
            ...new Set(
              mandate.allEntities.filter((entity) => entity !== mandate.entity),
            ),
          ]}
          entityLongMap={mandate.entityLongMap}
          symbol={mandate.symbol}
        />
        <div className="flex items-center justify-start pr-2">
          {(!isUpdateTarget || !!citationIndex) &&
            (() => {
              const isNewestWithNewerVersion = newestWithNewerVersion?.has(
                mandate.symbol,
              );
              const warnings = getMandateWarnings(
                mandate,
                allSymbols,
                isNewestWithNewerVersion,
                citationIndex
                  ? { citations: citationIndex, subprogramme, sourceSymbol }
                  : undefined,
              ).filter(
                (warning) =>
                  !isUpdateTarget || warning.id === "duplicate-citation",
              );
              if (warnings.length === 0) return null;

              const actionableWarnings = warnings.filter((w) => w.action);
              const primaryWarning =
                warnings.find(
                  (warning) => warning.id === "duplicate-citation",
                ) ||
                actionableWarnings[0] ||
                warnings[0];
              const isAddressed =
                !!primaryWarning.action &&
                (currentDecision?.decision === "remove" ||
                  currentDecision?.decision === "update");

              const icon =
                primaryWarning.icon || getWarningIcon(primaryWarning.severity);
              const colorScheme = primaryWarning.colorScheme || "amber";

              const colorClasses = {
                blue: UN_BLUE.badgeSubtle,
                red: `${DECISION_THEME.remove.bg} ${DECISION_THEME.remove.iconText} ${DECISION_THEME.remove.hoverBg}`,
                amber: `${DECISION_THEME.update.bg} ${DECISION_THEME.update.iconText} ${DECISION_THEME.update.hoverBg}`,
              };

              const handleAction = (warning: typeof primaryWarning) => {
                if (!canEditSubmission) return;
                if (warning.action === "remove") {
                  onDecision("remove");
                } else if (warning.action === "update" && onUpdateClick) {
                  onUpdateClick(warning.suggestedUpdate);
                }
              };

              return (
                <WarningTooltip
                  warnings={warnings}
                  onAction={handleAction}
                  canDropCitation={trackContext?.canDropCitation}
                  onDropCitation={dropFromNote}
                  disabled={isAddressed || !canEditSubmission}
                  currentSymbol={mandate.symbol}
                >
                  <button
                    type="button"
                    aria-label={`View citation notes: ${warnings.map(getWarningSummary).join(", ")}`}
                    onClick={(event) => event.stopPropagation()}
                    className={`relative inline-grid min-h-6 max-w-full grid-cols-[auto_minmax(0,1fr)] items-start gap-1 rounded-md px-1.5 py-1 text-left transition-colors ${
                      isAddressed
                        ? "cursor-pointer bg-gray-100 text-gray-600"
                        : colorClasses[colorScheme]
                    }`}
                  >
                    <span aria-hidden="true" className="mt-px">
                      <WarningIcon icon={icon} />
                    </span>
                    {warnings.length > 1 && (
                      <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-800 text-[10px] font-medium text-white shadow-sm">
                        {warnings.length}
                      </span>
                    )}
                    <span className="min-w-0 text-xs leading-4">
                      {getWarningSummary(primaryWarning)}
                    </span>
                  </button>
                </WarningTooltip>
              );
            })()}
        </div>
        <div
          onClick={(e) => e.stopPropagation()}
          className="relative flex items-center"
          data-workspace-decision
        >
          {!isUpdateTarget &&
            canEditSubmission &&
            currentDecision?.decision === "add" &&
            currentDecision?.manualMetadata &&
            onEdit && (
              <Tooltip content="Edit manual entry">
                <button
                  onClick={onEdit}
                  className="absolute top-1/2 -left-7 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded border border-emerald-200 bg-emerald-50 text-emerald-700 transition-colors hover:border-emerald-300 hover:bg-emerald-100"
                >
                  <FileText className="h-3.5 w-3.5" />
                </button>
              </Tooltip>
            )}
          {!isUpdateTarget && (
            <DecisionDropdown
              decision={currentDecision?.decision ?? null}
              userEmail={currentDecision?.userEmail ?? null}
              userEntity={currentDecision?.userEntity ?? null}
              createdAt={currentDecision?.createdAt ?? null}
              onChange={onDecision}
              onUpdateClick={onUpdateClick}
              disabled={
                !canEditSubmission || (!!currentDecision && !currentDecision.id)
              }
              reason={currentDecision?.decisionReason}
              otherReason={currentDecision?.otherReason}
              onReasonChange={canEditSubmission ? onReasonChange : undefined}
              symbol={mandate.symbol}
              showReasonPopup={showReasonPopup}
              onReasonPopupClose={onReasonPopupClose}
            />
          )}
        </div>
        {tableControls?.showReviewerColumn && (
          <div>
            {!isUpdateTarget && (
              <ReviewDecisionControl
                compact
                entity={mandate.entity || trackContext?.entity || ""}
                symbol={mandate.symbol}
                citationMetadata={mandate}
                subprogramme={subprogramme}
                submission={state?.decision ?? null}
                review={state?.reviewDecision ?? null}
                editable={!readOnly}
              />
            )}
          </div>
        )}
        <div>
          {!isUpdateTarget && (
            <Tooltip
              content={
                unreadCommentCount > 0
                  ? `${unreadCommentCount} unread comments`
                  : displayedCommentCount > 0
                    ? "View comments"
                    : conversationContext.canComment
                      ? "Add a comment"
                      : "No comments — commenting is unavailable for this view"
              }
            >
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenActivityTab?.();
                }}
                aria-label={`${mandate.symbol}: ${displayedCommentCount} comments${unreadCommentCount ? `, ${unreadCommentCount} unread` : ""}`}
                className={`inline-flex cursor-pointer items-center gap-1 text-xs ${displayedCommentCount > 0 ? "font-medium text-un-blue-text" : "text-foreground"}`}
              >
                <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{displayedCommentCount}</span>
                {unreadCommentCount > 0 && (
                  <span
                    className="h-2 w-2 rounded-full bg-un-blue-text"
                    aria-hidden="true"
                  />
                )}
              </button>
            </Tooltip>
          )}
        </div>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onOpenSidebar?.();
          }}
          data-view-details
          aria-label={`View details for ${mandate.symbol}`}
          className="group me-2 inline-flex justify-self-end rounded focus-visible:ring-2 focus-visible:ring-un-blue"
        >
          <ViewDetailsLabel />
        </button>
      </CitationTableRow>
    </div>
  );
}

function MandateRow({
  mandate,
  visible = true,
  subprogramme,
  state,
  commentCount,
  isReviewer,
  userEmail,
  userEntity,
  onDecision,
  onReasonChange,
  onUpdateWithManual,
  onEditManual,
  onComment,
  readOnly,
  isFoundational,
  updateTargetMetadata,
  allSymbols,
  citationIndex,
  newestWithNewerVersion,
  reviewChangeInfo,
  isUnderReview,
  onAcceptChange,
  onRevertChange,
}: {
  mandate: Mandate;
  visible?: boolean;
  subprogramme: string | null;
  state?: MandateState;
  commentCount: number;
  isReviewer: boolean;
  userEmail: string | null;
  userEntity: string | null;
  onDecision: DecisionChangeHandler;
  onReasonChange: DecisionReasonChangeHandler;
  onUpdateWithManual: (
    newSymbol: string,
    manualData: ManualEntryData,
  ) => Promise<boolean>;
  onEditManual?: (data: ManualEntryData) => void;
  onComment: (comment: string) => Promise<MandateComment | null>;
  onOpenActivityTab?: () => void;
  isAdded?: boolean;
  readOnly?: boolean;
  isFoundational?: boolean;
  updateTargetMetadata: ReplacementMetadata;
  allSymbols?: Set<string>;
  citationIndex?: EntityCitationIndex;
  newestWithNewerVersion?: Set<string>;
  reviewChangeInfo?: ReviewChangeInfo | null;
  isUnderReview?: boolean;
  onAcceptChange?: () => void;
  onRevertChange?: () => void;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [continuingDecision, setContinuingDecision] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const rowVisible = visible || continuingDecision;
  const closeReasonPopup = () => {
    setShowReasonPopup(false);
    setContinuingDecision(false);
    if (!visible) {
      const rows = [
        ...document.querySelectorAll<HTMLElement>(
          "[data-citation-visible='true']",
        ),
      ];
      const index = rows.indexOf(rowRef.current!);
      const next = rows[index + 1] ?? rows[index - 1];
      requestAnimationFrame(() => {
        if (next)
          next.querySelector<HTMLButtonElement>("[data-view-details]")?.focus();
        else
          document
            .querySelector<HTMLInputElement>("[data-workspace-search]")
            ?.focus();
      });
    }
  };
  const continueDecision: DecisionChangeHandler = async (
    decision,
    newSymbol,
  ) => {
    setContinuingDecision(decision !== "cancel");
    return onDecision(decision, newSymbol);
  };
  const [sidebarInitialTab, setSidebarInitialTab] = useState<
    "info" | "decisions" | "activity" | "paragraphs" | undefined
  >(undefined);
  const [openReplacementSymbol, setOpenReplacementSymbol] = useState<
    string | null
  >(null);
  const [showUpdateSearch, setShowUpdateSearch] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  // Reason popup should only open when user actively makes a decision, not on mount
  const [showReasonPopup, setShowReasonPopup] = useState(false);
  const [updatePrefillSymbol, setUpdatePrefillSymbol] = useState<
    string | undefined
  >(undefined);
  // Get suggested update symbol from warnings (for newer-available)
  const isNewestForNewerVersion = newestWithNewerVersion?.has(mandate.symbol);
  const warnings = getMandateWarnings(
    mandate,
    allSymbols,
    isNewestForNewerVersion,
    citationIndex ? { citations: citationIndex, subprogramme } : undefined,
  );
  const suggestedUpdateSymbol = warnings.find(
    (w) => w.suggestedUpdate,
  )?.suggestedUpdate;

  const replacements = getTableReplacements(
    getDecisionTracks(state?.decisions ?? []),
    updateTargetMetadata,
  );
  const replacementRows = replacements.map((replacement) => ({
    mandate: replacementTableMandate(mandate, replacement),
    label: REPLACEMENT_LABELS[replacement.source],
  }));

  const handleUpdateSelect = async (symbol: string) => {
    if (!(await continueDecision("update", symbol))) return;
    setShowUpdateSearch(false);
    setShowReasonPopup(true);
    setUpdatePrefillSymbol(undefined);
  };

  const handleUpdateManual = async (data: ManualEntryData) => {
    setContinuingDecision(true);
    if (!(await onUpdateWithManual(data.symbol, data))) return;
    setShowUpdateSearch(false);
    setShowReasonPopup(true);
    setUpdatePrefillSymbol(undefined);
  };

  const openUpdateSearch = (prefillSymbol?: string) => {
    setSidebarOpen(false);
    setOpenReplacementSymbol(null);
    setUpdatePrefillSymbol(prefillSymbol);
    setShowUpdateSearch(true);
  };

  const handleCancelUpdate = () => {
    // Just close the update search UI - don't make any server call
    // User's prior decision state (if any) remains unchanged
    setShowUpdateSearch(false);
    setUpdatePrefillSymbol(undefined);
  };

  const handleEdit = () => {
    setShowEditModal(true);
  };

  const handleEditSubmit = (data: ManualEntryData) => {
    if (onEditManual) {
      onEditManual(data);
    }
    setShowEditModal(false);
  };

  const handleEditCancel = () => {
    setShowEditModal(false);
  };

  // Check for decision changes during review (for badge display)
  // Use server-side reviewChangeInfo if available
  const decisionChange = reviewChangeInfo?.hasChange
    ? getDecisionChange(reviewChangeInfo.baseline, state?.decision)
    : null;

  // Check if change has been responded to (accepted/reverted)
  // If the decision was modified after the response, treat it as no response (pending again)
  const rawResponse = reviewChangeInfo?.response;
  const changeResponse =
    rawResponse && state?.decision?.createdAt && rawResponse.respondedAt
      ? new Date(state.decision.createdAt) <= new Date(rawResponse.respondedAt)
        ? rawResponse
        : null // Decision was modified after response, show as pending
      : rawResponse;

  return (
    <div className="relative" ref={rowRef} data-citation-visible={rowVisible}>
      <div className="overflow-visible bg-white">
        <div hidden={!rowVisible}>
          {/* Original row */}
          <MandateRowContent
            subprogramme={subprogramme}
            mandate={mandate}
            rowLabel={replacementRows.length ? "Original citation" : undefined}
            state={state}
            commentCount={commentCount}
            isReviewer={isReviewer}
            readOnly={readOnly}
            isFoundational={isFoundational}
            allSymbols={allSymbols}
            citationIndex={citationIndex}
            newestWithNewerVersion={newestWithNewerVersion}
            reviewChangeInfo={reviewChangeInfo}
            isUnderReview={isUnderReview}
            onOpenSidebar={() => {
              setSidebarInitialTab(undefined);
              setSidebarOpen(true);
            }}
            onOpenActivityTab={() => {
              setSidebarInitialTab("activity");
              setSidebarOpen(true);
            }}
            onDecision={continueDecision}
            onReasonChange={onReasonChange}
            onUpdateClick={openUpdateSearch}
            showReasonPopup={showReasonPopup}
            onReasonPopupClose={closeReasonPopup}
            onEdit={handleEdit}
            onAcceptChange={onAcceptChange}
            onRevertChange={onRevertChange}
          />

          {/* Update search input (shown when user selects "update" from dropdown) */}
          {!readOnly && showUpdateSearch && (
            <div className="border-t border-gray-100 bg-amber-50/30 px-4 py-3">
              <div className="mb-3 text-xs font-medium text-amber-800">
                Select replacement document:
              </div>
              <DocumentSearchInput
                onSelect={handleUpdateSelect}
                onManualSubmit={handleUpdateManual}
                onCancel={handleCancelUpdate}
                placeholder="Search for replacement document..."
                submitLabel="Update"
                formTitle="Enter replacement document manually"
                compact
                initialQuery={updatePrefillSymbol || suggestedUpdateSymbol}
                manualUpdate={mandate}
              />
            </div>
          )}

          {/* Edit manual entry form (shown when user clicks edit button) */}
          {!readOnly &&
            showEditModal &&
            state?.decision?.decision === "add" &&
            state?.decision?.manualMetadata && (
              <div className="border-t border-gray-100 bg-emerald-50/30 px-4 py-3">
                <div className="mb-3 text-xs font-medium text-emerald-600">
                  Edit manual entry:
                </div>
                <ManualDocumentForm
                  onSubmit={handleEditSubmit}
                  onCancel={handleEditCancel}
                  initialSymbol={mandate.symbol}
                  initialTitle={state.decision.manualMetadata.title || ""}
                  initialBody={state.decision.manualMetadata.body || ""}
                  initialYear={
                    state.decision.manualMetadata.year?.toString() || ""
                  }
                  initialLink={state.decision.manualMetadata.link || ""}
                  submitLabel="Save Changes"
                  formTitle=""
                  hideDescription
                />
              </div>
            )}

          {/* Each current replacement is visible, with identical proposals combined. */}
          {replacementRows.map(({ mandate: replacementMandate, label }) => (
            <MandateRowContent
              key={replacementMandate.symbol}
              mandate={replacementMandate}
              rowLabel={label}
              subprogramme={subprogramme}
              sourceSymbol={mandate.symbol}
              state={undefined}
              commentCount={0}
              isReviewer={false}
              isUpdateTarget
              isFoundational={citationIndex
                ?.get(citationSymbolKey(replacementMandate.symbol))
                ?.some((location) => location.level === "background")}
              citationIndex={citationIndex}
              newestWithNewerVersion={newestWithNewerVersion}
              onOpenSidebar={() =>
                setOpenReplacementSymbol(replacementMandate.symbol)
              }
              onDecision={async () => null}
            />
          ))}
        </div>
        {/* Sidebars and portal-based reason popups survive a filter changing while the user is interacting. */}
        {/* Sidebar (reuse DocumentSymbol for full sidebar) */}
        <div onClick={(e) => e.stopPropagation()}>
          <DocumentSymbol
            readOnly={readOnly}
            subprogramme={subprogramme}
            symbol={mandate.symbol}
            link={mandate.link}
            title={mandate.title}
            year={mandate.year}
            body={mandate.body}
            otherEntitiesCount={mandate.otherEntitiesCount}
            relevanceCount={mandate.relevanceCount}
            relevanceIndices={mandate.relevanceIndices}
            aiComments={mandate.aiComments}
            entity={mandate.entity}
            entityLong={mandate.entityLong}
            allEntities={mandate.allEntities}
            entitySubprogrammes={mandate.entitySubprogrammes}
            entityLongMap={mandate.entityLongMap}
            allEntityRelevance={mandate.allEntityRelevance}
            isOpen={sidebarOpen}
            onOpenChange={(open) => {
              setSidebarOpen(open);
              if (!open) setSidebarInitialTab(undefined);
            }}
            state={state}
            isReviewer={isReviewer}
            userEmail={userEmail}
            userEntity={userEntity}
            isFoundational={isFoundational}
            onDecision={onDecision}
            onReasonChange={onReasonChange}
            onComment={onComment}
            onUpdateClick={openUpdateSearch}
            metadataFromDb={mandate.metadataFromDb}
            docType={mandate.docType}
            initialTab={sidebarInitialTab}
          />
          {/* Sidebars use the same documents and metadata as the replacement rows. */}
          {replacementRows.map(({ mandate: newMandate }) => (
            <DocumentSymbol
              key={newMandate.symbol}
              readOnly={readOnly}
              subprogramme={subprogramme}
              symbol={newMandate.symbol}
              sourceCitation={mandate}
              isFoundational={citationIndex
                ?.get(citationSymbolKey(newMandate.symbol))
                ?.some((location) => location.level === "background")}
              link={newMandate.link}
              title={newMandate.title}
              year={newMandate.year}
              body={newMandate.body}
              otherEntitiesCount={newMandate.otherEntitiesCount}
              relevanceCount={newMandate.relevanceCount}
              relevanceIndices={newMandate.relevanceIndices}
              aiComments={newMandate.aiComments}
              entity={newMandate.entity}
              entityLong={newMandate.entityLong}
              allEntities={newMandate.allEntities}
              entitySubprogrammes={newMandate.entitySubprogrammes}
              entityLongMap={newMandate.entityLongMap}
              allEntityRelevance={newMandate.allEntityRelevance}
              isOpen={openReplacementSymbol === newMandate.symbol}
              onOpenChange={(open) =>
                setOpenReplacementSymbol(open ? newMandate.symbol : null)
              }
              state={state}
              isReviewer={isReviewer}
              userEmail={userEmail}
              userEntity={userEntity}
              onDecision={onDecision}
              onReasonChange={onReasonChange}
              onComment={onComment}
              onUpdateClick={openUpdateSearch}
              metadataFromDb={newMandate.metadataFromDb}
              docType={newMandate.docType}
            />
          ))}
        </div>
      </div>

      {/* Review change indicator - positioned outside the card as a speech bubble */}
      {FEATURE_FLAGS.reviewChangeIndicator &&
        decisionChange?.hasChange &&
        (() => {
          const beforeInfo = getDecisionDisplayInfo(
            decisionChange.before.decision,
            decisionChange.before.newSymbol,
          );
          const afterInfo = getDecisionDisplayInfo(
            decisionChange.after.decision,
            decisionChange.after.newSymbol,
          );

          // Get reason labels and icons
          const beforeReasonLabel = decisionChange.before.reason
            ? getReasonLabel(
                decisionChange.before.decision.toLowerCase() as DecisionType,
                decisionChange.before.reason,
              )
            : null;
          const afterReasonLabel = decisionChange.after.reason
            ? getReasonLabel(
                decisionChange.after.decision.toLowerCase() as DecisionType,
                decisionChange.after.reason,
              )
            : null;

          const beforeReasonIconName = decisionChange.before.reason
            ? getReasonIcon(
                decisionChange.before.decision.toLowerCase() as DecisionType,
                decisionChange.before.reason,
              )
            : null;
          const afterReasonIconName = decisionChange.after.reason
            ? getReasonIcon(
                decisionChange.after.decision.toLowerCase() as DecisionType,
                decisionChange.after.reason,
              )
            : null;

          const BeforeReasonIcon = getIconComponent(beforeReasonIconName);
          const AfterReasonIcon = getIconComponent(afterReasonIconName);

          const formattedBeforeReason = decisionChange.before.reason
            ? formatReasonLabel(decisionChange.before.reason, beforeReasonLabel)
            : null;
          const formattedAfterReason = decisionChange.after.reason
            ? formatReasonLabel(decisionChange.after.reason, afterReasonLabel)
            : null;

          return (
            <div className="group/change absolute top-1/2 left-full z-10 ml-3 -translate-y-1/2">
              {/* Tooltip content - flows out of the circle with corner covered by circle */}
              <div className="pointer-events-none absolute right-0 bottom-0 mr-3.5 mb-3.5 opacity-0 transition-opacity duration-200 group-hover/change:pointer-events-auto group-hover/change:opacity-100">
                <div
                  className={`${POPUP_STYLES.tooltip} ${POPUP_STYLES.tooltipSize} space-y-2.5 p-3`}
                >
                  <div
                    className={`text-xs font-semibold tracking-wide whitespace-nowrap uppercase ${
                      changeResponse?.responseType === "accept"
                        ? "text-emerald-700"
                        : changeResponse?.responseType === "revert"
                          ? "text-gray-600"
                          : "text-gray-700"
                    }`}
                  >
                    {changeResponse?.responseType === "accept"
                      ? "Change Accepted"
                      : changeResponse?.responseType === "revert"
                        ? "Change Reverted"
                        : "Decision Changed"}
                  </div>
                  <div className="space-y-2.5">
                    {/* Before Review */}
                    <div>
                      <div className="text-[10px] font-medium tracking-wide whitespace-nowrap text-gray-700 uppercase">
                        Before Review
                      </div>
                      <div className="space-y-1.5">
                        <div
                          className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold ${beforeInfo.color}`}
                        >
                          {beforeInfo.displayLabel}
                        </div>
                        {formattedBeforeReason && (
                          <div className="flex items-start gap-2">
                            {BeforeReasonIcon && (
                              <div className="mt-0.5 shrink-0">
                                <BeforeReasonIcon className="h-3.5 w-3.5 text-gray-400" />
                              </div>
                            )}
                            <div className="line-clamp-2 text-xs leading-relaxed text-gray-600">
                              {formattedBeforeReason}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* After Review */}
                    <div className="space-y-1.5">
                      <div className="text-[10px] font-medium tracking-wide whitespace-nowrap text-gray-700 uppercase">
                        After Review
                      </div>
                      <div className="space-y-1.5">
                        <div
                          className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold ${afterInfo.color}`}
                        >
                          {afterInfo.displayLabel}
                        </div>
                        {formattedAfterReason && (
                          <div className="flex items-start gap-2">
                            {AfterReasonIcon && (
                              <div className="mt-0.5 shrink-0">
                                <AfterReasonIcon className="h-3.5 w-3.5 text-gray-400" />
                              </div>
                            )}
                            <div className="line-clamp-2 text-xs leading-relaxed text-gray-600">
                              {formattedAfterReason}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Response status or action buttons */}
                  {changeResponse ? (
                    <div className="border-t border-gray-200 pt-2.5">
                      <div
                        className={`flex items-center gap-1.5 text-xs ${
                          changeResponse.responseType === "accept"
                            ? "text-green-800"
                            : "text-amber-800"
                        }`}
                      >
                        {changeResponse.responseType === "accept" ? (
                          <>
                            <Check className="h-3.5 w-3.5" />
                            <span>Change accepted</span>
                          </>
                        ) : (
                          <>
                            <RefreshCw className="h-3.5 w-3.5" />
                            <span>Reverted to baseline</span>
                          </>
                        )}
                      </div>
                    </div>
                  ) : (
                    (onAcceptChange || onRevertChange) && (
                      <div className="flex gap-2 border-t border-gray-200 pt-2.5">
                        {onAcceptChange && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onAcceptChange();
                            }}
                            className="flex items-center gap-1 rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700 transition-colors hover:bg-green-100"
                          >
                            <Check className="h-3 w-3" />
                            Accept
                          </button>
                        )}
                        {onRevertChange && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onRevertChange();
                            }}
                            className="flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100"
                          >
                            <RefreshCw className="h-3 w-3" />
                            Revert
                          </button>
                        )}
                      </div>
                    )
                  )}
                </div>
              </div>

              {/* Circle badge with spike - overlaps tooltip corner */}
              {(() => {
                const tailColor =
                  changeResponse?.responseType === "accept"
                    ? "border-r-emerald-500"
                    : changeResponse?.responseType === "revert"
                      ? "border-r-gray-400"
                      : CHANGE_INDICATOR.tail;

                return (
                  <div
                    className={`relative flex h-7 w-7 items-center justify-center rounded-full ${changeResponse?.responseType === "accept" ? "bg-emerald-500" : changeResponse?.responseType === "revert" ? "bg-gray-400" : CHANGE_INDICATOR.badge} text-white shadow-sm transition-all ${CHANGE_INDICATOR.badgeHover} cursor-pointer`}
                  >
                    {changeResponse?.responseType === "accept" ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : changeResponse?.responseType === "revert" ? (
                      <RefreshCw className="h-3.5 w-3.5" />
                    ) : (
                      <Pencil className="h-3.5 w-3.5" />
                    )}
                    {/* Speech bubble tail pointing left */}
                    <div
                      className={`absolute top-1/2 left-0 h-0 w-0 -translate-x-1 -translate-y-1/2 border-t-[6px] border-r-[6px] border-b-[6px] border-t-transparent border-b-transparent ${tailColor}`}
                    />
                  </div>
                );
              })()}
            </div>
          );
        })()}
    </div>
  );
}

function AddEntryRow({
  onAdd,
  onAddManual,
  sectionTitle,
}: {
  onAdd: (symbol: string) => void;
  onAddManual: (data: ManualEntryData) => void;
  sectionTitle: string;
}) {
  return (
    <DocumentSearchInput
      onSelect={onAdd}
      onManualSubmit={onAddManual}
      placeholder={`Add a citation to ${sectionTitle} — search by symbol or title`}
      submitLabel="Add"
      formTitle="Add document manually"
    />
  );
}

function MandateSection({
  title,
  mandates,
  entity,
  subprogramme,
  states,
  totalComments,
  updateTargetMetadata,
  isReviewer,
  userEmail,
  userEntity,
  readOnly,
  foundationalSymbols,
  citationIndex,
  reviewChanges,
  isUnderReview,
  onDecision,
  onReasonChange,
  onUpdateWithManual,
  onEditManual,
  onComment,
  onAdd,
  onAddManual,
  onAcceptChange,
  onRevertChange,
  visibleMandates,
  sectionId,
  bodyFullNames,
}: {
  bodyFullNames: Record<string, string>;
  title: string;
  mandates: Mandate[];
  entity: string;
  entityLong: string | null;
  subprogramme: string | null;
  states: Record<string, MandateState>;
  totalComments: Record<string, number>;
  addedMetadata: Record<
    string,
    {
      title: string | null;
      year: number | null;
      body: string | null;
      docType: string | null;
      link: string | null;
    } | null
  >;
  updateTargetMetadata: Record<
    string,
    { title: string | null; year: number | null; body: string | null } | null
  >;
  isReviewer: boolean;
  userEmail: string | null;
  userEntity: string | null;
  readOnly?: boolean;
  foundationalSymbols?: Set<string>;
  citationIndex?: EntityCitationIndex;
  reviewChanges?: Record<string, ReviewChangeInfo>;
  isUnderReview?: boolean;
  reviewSessionId?: string | null;
  onDecision: (
    symbol: string,
    decision: Decision,
    newSymbol?: string,
  ) => Promise<MandateDecision | null>;
  onReasonChange: (
    symbol: string,
    decisionReason: string | null,
    otherReason: string | null,
    savedDecision?: MandateDecision,
  ) => Promise<boolean>;
  onUpdateWithManual: (
    symbol: string,
    newSymbol: string,
    manualData: ManualEntryData,
  ) => Promise<boolean>;
  onEditManual?: (symbol: string, data: ManualEntryData) => void;
  onComment: (
    symbol: string,
    comment: string,
  ) => Promise<MandateComment | null>;
  onAdd: (symbol: string) => void;
  onAddManual: (data: ManualEntryData) => void;
  onAcceptChange?: (symbol: string) => void;
  onRevertChange?: (symbol: string) => void;
  visibleMandates: Mandate[];
  sectionId: string;
}) {
  const tracksContext = useContext(DecisionTracksContext);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAddCitation, setShowAddCitation] = useState(false);
  const stateKey = (symbol: string) => `${symbol}:${subprogramme || ""}`;
  const visibleSymbols = new Set(
    visibleMandates.map((mandate) => mandate.symbol),
  );
  const citationGroups = groupCitations(mandates, bodyFullNames);
  const canAddCitation =
    !readOnly && (tracksContext?.canEditSubmission || tracksContext?.canReview);

  // Build set of all symbols for warning system (to detect newer-already-cited)
  const allSymbols = useMemo(
    () => new Set(mandates.map((m) => m.symbol)),
    [mandates],
  );

  const newestWithNewerVersion = useMemo(
    () => newestVersionWarningSymbols(mandates),
    [mandates],
  );

  return (
    <section
      id={sectionId}
      role="rowgroup"
      aria-label={title}
      className="scroll-mt-2 focus:outline-none lg:scroll-mt-10"
      tabIndex={-1}
      style={visibleMandates.length ? undefined : { display: "contents" }}
    >
      <CitationTableRow
        spanAll
        hidden={!visibleMandates.length && !canAddCitation}
        className="lg:sticky lg:top-[calc(var(--site-header-height,0px)+2.5rem)] lg:z-10"
      >
        <div className="flex h-10 items-center gap-2 border-y border-foreground/15 bg-secondary px-3 text-sm">
          <h3 className="truncate font-semibold text-foreground">{title}</h3>
          <span className="shrink-0 text-xs text-foreground tabular-nums">
            {visibleMandates.length}
            {visibleMandates.length !== mandates.length
              ? ` / ${mandates.length}`
              : ""}
          </span>
          {!readOnly && title !== "Programme level" && (
            <Tooltip asChild content="Edit subprogramme">
              <button
                type="button"
                onClick={() => setShowEditModal(true)}
                className="rounded text-foreground"
                aria-label="Edit subprogramme"
              >
                <Pencil className="h-3 w-3" />
              </button>
            </Tooltip>
          )}
          {readOnly && (
            <span className="text-xs text-foreground">· reference</span>
          )}
          {canAddCitation && (
            <button
              type="button"
              data-workspace-add
              onClick={() => setShowAddCitation((open) => !open)}
              aria-expanded={showAddCitation}
              className="ml-2 inline-flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs font-medium text-un-blue-text-aaa hover:bg-un-blue-surface focus-visible:ring-2 focus-visible:ring-un-blue"
            >
              <Plus className="h-3.5 w-3.5" /> Add citation
            </button>
          )}
        </div>
      </CitationTableRow>

      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Subprogramme</DialogTitle>
            <DialogDescription className="pt-2">
              Editing subprogrammes is not yet supported. If changes are
              necessary, please reach out to{" "}
              <a
                href="mailto:support@eosg.dev"
                className="text-un-blue-text hover:underline"
              >
                support@eosg.dev
              </a>
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
      <div>
        {showAddCitation && canAddCitation && visibleMandates.length > 0 && (
          <CitationTableRow spanAll>
            <AddEntryRow
              sectionTitle={title}
              onAdd={onAdd}
              onAddManual={onAddManual}
            />
          </CitationTableRow>
        )}
        {citationGroups.map((group) => (
          <div key={group.key}>
            <CitationTableRow
              spanAll
              hidden={
                !group.citations.some((m) => visibleSymbols.has(m.symbol))
              }
              className="lg:sticky lg:top-[calc(var(--site-header-height,0px)+5rem)] lg:z-9"
            >
              <h4 className="flex min-h-8 items-center border-b border-border bg-white px-3 py-1.5 text-xs font-semibold text-foreground">
                {group.label}
              </h4>
            </CitationTableRow>
            {group.citations.map((m) => {
              return (
                <MandateRow
                  subprogramme={subprogramme}
                  key={m.symbol}
                  visible={visibleSymbols.has(m.symbol)}
                  mandate={{ ...m, entity }}
                  isAdded={m.isAdded}
                  state={states[stateKey(m.symbol)]}
                  commentCount={totalComments[m.symbol] || 0}
                  isReviewer={isReviewer}
                  userEmail={userEmail}
                  userEntity={userEntity}
                  readOnly={readOnly}
                  isFoundational={foundationalSymbols?.has(
                    citationSymbolKey(m.symbol),
                  )}
                  allSymbols={allSymbols}
                  citationIndex={citationIndex}
                  newestWithNewerVersion={newestWithNewerVersion}
                  reviewChangeInfo={reviewChanges?.[stateKey(m.symbol)]}
                  isUnderReview={isUnderReview}
                  onDecision={(decision, newSymbol) =>
                    onDecision(m.symbol, decision, newSymbol)
                  }
                  onReasonChange={(reason, otherReason, savedDecision) =>
                    onReasonChange(m.symbol, reason, otherReason, savedDecision)
                  }
                  onUpdateWithManual={(newSymbol, manualData) =>
                    onUpdateWithManual(m.symbol, newSymbol, manualData)
                  }
                  onEditManual={
                    onEditManual
                      ? (data) => onEditManual(m.symbol, data)
                      : undefined
                  }
                  onComment={(comment) => onComment(m.symbol, comment)}
                  updateTargetMetadata={updateTargetMetadata}
                  onAcceptChange={
                    onAcceptChange ? () => onAcceptChange(m.symbol) : undefined
                  }
                  onRevertChange={
                    onRevertChange ? () => onRevertChange(m.symbol) : undefined
                  }
                />
              );
            })}
          </div>
        ))}
        {!showAddCitation && canAddCitation && visibleMandates.length > 0 && (
          <CitationTableRow spanAll>
            <AddEntryRow
              sectionTitle={title}
              onAdd={onAdd}
              onAddManual={onAddManual}
            />
          </CitationTableRow>
        )}
      </div>
    </section>
  );
}

export function EntityDetail({
  bodyFullNames,
  cycleReadOnly = false,
  budgetVersion = CURRENT_BUDGET_VERSION,
  entity,
  entityLong,
  partName,
  backgroundMandates,
  legislativeMandates,
}: Props) {
  const searchParams = useSearchParams();
  const { summary: commentSummary } = useCommentNotifications(budgetVersion);
  const [dismissedNotification, setDismissedNotification] = useState<
    string | null
  >(null);
  const notificationId = searchParams.get("comment");
  const notificationSymbol = searchParams.get("document");
  const notificationSubprogramme = searchParams.get("subprogramme") || null;
  const notificationCycle = searchParams.get("cycle");
  const notificationOpen =
    !!notificationId &&
    !!notificationSymbol &&
    notificationId !== dismissedNotification &&
    notificationCycle === budgetVersion;
  const filterEntity: string | null = null;
  const [remainingSelected, setShowRemaining] = useState(false);
  const [localTableFilters, setLocalTableFilters] =
    useState<TableFilters>(EMPTY_TABLE_FILTERS);
  // Only the comments filter is shareable; other table controls stay local.
  const commentsParam = searchParams.get("comments");
  const tableFilters = useMemo<TableFilters>(
    () => ({
      ...localTableFilters,
      comments: [
        ...new Set(
          (commentsParam || "")
            .split(",")
            .filter((value) => ["has", "none", "unread"].includes(value)),
        ),
      ],
    }),
    [localTableFilters, commentsParam],
  );
  const setTableFilters = (next: TableFilters) => {
    setLocalTableFilters(next);
    const url = new URL(window.location.href);
    if (next.comments.length) {
      url.searchParams.set("comments", next.comments.join(","));
    } else {
      url.searchParams.delete("comments");
    }
    if (url.href !== window.location.href) {
      window.history.replaceState(null, "", url);
    }
  };
  const [tableSort, setTableSort] = useState<TableSort>({
    column: "title",
    direction: "asc",
  });
  const loadKey = `${entity}:${budgetVersion}`;
  const [initialStatus, setInitialStatus] = useState<{
    context: string;
    loaded: boolean;
    error: string | null;
  } | null>(null);
  const initialLoaded =
    initialStatus?.context === loadKey && initialStatus.loaded;
  const initialError =
    initialStatus?.context === loadKey ? initialStatus.error : null;
  const pendingDrops = useRef(new Set<string>());
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [states, setStates] = useState<Record<string, MandateState>>({});
  const [totalComments, setTotalComments] = useState<Record<string, number>>(
    {},
  );
  const [isReviewer, setIsReviewer] = useState(false);
  const [canViewAllConversations, setCanViewAllConversations] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userEntity, setUserEntity] = useState<string | null>(null);
  const [isUnderReview, setIsUnderReview] = useState(false);
  const [reviewModeLoaded, setReviewModeLoaded] = useState(false);
  const [reviewStartedBy, setReviewStartedBy] = useState<string | null>(null);
  const [reviewSessionId, setReviewSessionId] = useState<string | null>(null);
  const [showReviewBlockedDialog, setShowReviewBlockedDialog] = useState(false);
  const [showClearAllDialog, setShowClearAllDialog] = useState(false);
  const [isClearingAll, setIsClearingAll] = useState(false);
  // Review change info from server (persisted baselines)
  const [reviewChanges, setReviewChanges] = useState<
    Record<string, ReviewChangeInfo>
  >({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Auto-dismiss error after 8 seconds
  useEffect(() => {
    if (!errorMessage) return;
    const timer = setTimeout(() => setErrorMessage(null), 8000);
    return () => clearTimeout(timer);
  }, [errorMessage]);

  const showError = useCallback((msg: string) => {
    setErrorMessage(msg);
    console.error("Action failed:", msg);
  }, []);

  const [addedMetadata, setAddedMetadata] = useState<
    Record<
      string,
      {
        title: string | null;
        year: number | null;
        body: string | null;
        docType: string | null;
        link: string | null;
      } | null
    >
  >({});
  const [updateTargetMetadata, setUpdateTargetMetadata] = useState<
    Record<
      string,
      { title: string | null; year: number | null; body: string | null } | null
    >
  >({});

  const permissions = getEntityPermissions(
    { entity: userEntity, isReviewer },
    entity,
    {
      cycleReadOnly: cycleReadOnly || !initialLoaded,
      submissionLocked: isUnderReview,
    },
  );
  const isOwnEntity = initialLoaded && permissions.ownsEntity;
  const { canEditSubmission, canReview, canComment } = permissions;
  const showRemaining = canEditSubmission && remainingSelected;
  // Additions belong to the entity submission when the viewer can edit it.
  // Reviewers working on a locked or another entity's submission add to review.
  const additionTrack = canEditSubmission ? "entity" : "review";

  // Helper to refetch review changes after a decision is made during review
  const refreshReviewChanges = useCallback(async () => {
    if (!FEATURE_FLAGS.reviewChangeIndicator) return; // Skip if feature disabled
    if (!reviewSessionId) return;
    const changesResult = await getEntityReviewChangesAction(
      entity,
      reviewSessionId,
    );
    if (changesResult.success && changesResult.data) {
      setReviewChanges(changesResult.data);
    }
  }, [entity, reviewSessionId]);

  // These three results form one editable snapshot. A partial load must not look
  // like an empty submission or enable edits against an unknown review lock.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [role, decisions, review] = await Promise.all([
          getUserRoleAction(),
          getEntityDecisionsAction(entity, undefined, budgetVersion),
          getReviewModeStatusAction(entity),
        ]);
        if (
          !role.success ||
          !role.data ||
          !decisions.success ||
          !decisions.data ||
          !review.success ||
          !review.data
        ) {
          throw new Error(
            "Could not load your permissions and saved review decisions.",
          );
        }
        if (cancelled) return;
        const map: Record<string, MandateState> = {};
        for (const state of decisions.data.states) {
          map[`${state.documentSymbol}:${state.subprogramme || ""}`] = state;
        }
        setStates(map);
        setTotalComments(decisions.data.totalComments);
        setIsReviewer(!cycleReadOnly && (role.data.isReviewer ?? false));
        setCanViewAllConversations(role.data.isReviewer);
        setUserEmail(role.data.email);
        setUserEntity(role.data.entity ?? null);
        setIsUnderReview(review.data.isUnderReview);
        setReviewStartedBy(review.data.startedBy);
        setReviewSessionId(review.data.reviewSessionId);
        setReviewModeLoaded(true);
        setInitialStatus({ context: loadKey, loaded: true, error: null });
        if (
          FEATURE_FLAGS.reviewChangeIndicator &&
          review.data.reviewSessionId
        ) {
          // This optional indicator cannot invalidate the required snapshot.
          void getEntityReviewChangesAction(entity, review.data.reviewSessionId)
            .then((changes) => {
              if (!cancelled && changes.success && changes.data)
                setReviewChanges(changes.data);
            })
            .catch(() => {});
        }
      } catch {
        if (!cancelled)
          setInitialStatus({
            context: loadKey,
            loaded: false,
            error:
              "Could not load permissions and saved decisions. Please retry before reviewing mandates.",
          });
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [entity, cycleReadOnly, loadAttempt, loadKey, budgetVersion]);

  // Refresh all changed symbols in one request, including every subprogramme.
  const handleRemoteChanges = useCallback(
    async (changes: RealtimeChange[]) => {
      const symbols = [
        ...new Set(changes.map((change) => change.document_symbol)),
      ];
      const result = await getEntityDecisionsAction(
        entity,
        symbols,
        budgetVersion,
      );
      if (!result.success || !result.data) {
        throw new Error(
          result.success ? "Could not refresh decisions" : result.error,
        );
      }
      const updates = result.data;
      setStates((previous) => {
        const next = { ...previous };
        for (const state of updates.states) {
          next[`${state.documentSymbol}:${state.subprogramme || ""}`] = state;
        }
        return next;
      });
      setTotalComments((previous) => ({
        ...previous,
        ...Object.fromEntries(
          symbols.map((symbol) => [symbol, updates.totalComments[symbol] ?? 0]),
        ),
      }));
    },
    [entity, budgetVersion],
  );

  // Real-time sync via polling (works with Vercel serverless)
  // Polls both decisions/comments AND review mode status
  useRealtimeDecisions({
    entity,
    budgetVersion,
    onRemoteChanges: handleRemoteChanges,
    onReviewModeChange: async (status) => {
      setIsUnderReview(status.isUnderReview);
      setReviewStartedBy(status.reviewStartedBy);

      // Update session ID and fetch changes if session changed
      if (status.reviewSessionId !== reviewSessionId) {
        setReviewSessionId(status.reviewSessionId);
        if (status.reviewSessionId) {
          const changesResult = await getEntityReviewChangesAction(
            entity,
            status.reviewSessionId,
          );
          if (changesResult.success && changesResult.data) {
            setReviewChanges(changesResult.data);
          }
        }
      }
    },
    enabled: initialLoaded && !cycleReadOnly,
  });

  // Fetch metadata for added documents
  useEffect(() => {
    const existingSymbols = new Set([
      ...backgroundMandates.map((m) => m.symbol),
      ...Object.values(legislativeMandates)
        .flat()
        .map((m) => m.symbol),
    ]);
    const addedSymbols = Object.values(states)
      .filter(
        (s) => isVisibleAddedState(s) && !existingSymbols.has(s.documentSymbol),
      )
      .map((s) => s.documentSymbol)
      .filter((sym) => !(sym in addedMetadata)); // Use "in" to check if key exists (even if null)

    if (addedSymbols.length === 0) return;

    getDocumentMetadataAction(addedSymbols)
      .then((result) => {
        if (!result.success) return;
        const data = result.data ?? {};
        // Mark all looked-up symbols, even if no data found (to prevent re-fetching)
        const resultMap: Record<
          string,
          {
            title: string | null;
            year: number | null;
            body: string | null;
            docType: string | null;
            link: string | null;
          } | null
        > = {};
        for (const sym of addedSymbols) {
          resultMap[sym] = data[sym] || null; // null means "looked up but not found"
        }
        setAddedMetadata((prev) => ({ ...prev, ...resultMap }));
      })
      .catch(() => {});
  }, [states, backgroundMandates, legislativeMandates, addedMetadata]);

  // Fetch metadata for update target documents
  useEffect(() => {
    const updateTargetSymbols = [
      ...new Set(
        Object.values(states).flatMap((state) => {
          const tracks = getDecisionTracks(state.decisions || []);
          return [tracks.submission, tracks.currentReview]
            .filter((decision) => decision?.decision === "update")
            .map((decision) => decision?.newSymbol)
            .filter((symbol): symbol is string => !!symbol);
        }),
      ),
    ].filter((symbol) => !(symbol in updateTargetMetadata));

    if (updateTargetSymbols.length === 0) return;

    getDocumentMetadataAction(updateTargetSymbols)
      .then((result) => {
        if (!result.success) return;
        const data = result.data ?? {};
        const resultMap: Record<
          string,
          {
            title: string | null;
            year: number | null;
            body: string | null;
          } | null
        > = {};
        for (const sym of updateTargetSymbols) {
          resultMap[sym] = data[sym] || null;
        }
        setUpdateTargetMetadata((prev) => ({ ...prev, ...resultMap }));
      })
      .catch(() => {});
  }, [states, updateTargetMetadata]);

  const rollbackDecision = useCallback((key: string) => {
    setStates((prev) => {
      const decisions = prev[key]?.decisions?.filter((d) => d.id) || [];
      return {
        ...prev,
        [key]: {
          ...prev[key],
          decision: getDecisionTracks(decisions).submission,
          reviewDecision: getDecisionTracks(decisions).review,
          reviewStale: getDecisionTracks(decisions).reviewStale,
          decisions,
        },
      };
    });
  }, []);

  const saveDecision = useCallback(
    async (
      symbol: string,
      subprogramme: string | null,
      decision: Decision,
      newSymbol?: string,
      decisionTrack: "entity" | "review" = "entity",
    ) => {
      if (!userEmail || (decisionTrack === "entity" && !canEditSubmission))
        return null;
      if (decisionTrack === "review") {
        const result = await createDecisionAction(
          {
            documentSymbol: symbol,
            entity,
            subprogramme,
            decision,
            newSymbol,
            decisionTrack: "review",
            reviewedSubmissionId:
              states[`${symbol}:${subprogramme || ""}`]?.decision?.id ?? null,
          },
          CURRENT_BUDGET_VERSION,
        );
        if (result.success && result.data) {
          onTrackSaved(result.data);
          return result.data;
        }
        if (!result.success) showError(result.error);
        return null;
      }
      const key = `${symbol}:${subprogramme || ""}`;
      const now = new Date().toISOString();
      const newDecision: MandateDecision = {
        id: "",
        documentSymbol: symbol,
        entity,
        subprogramme,
        decision,
        newSymbol: newSymbol || null,
        decisionReason: null,
        otherReason: null,
        userEmail,
        userEntity,
        createdAt: now,
        approvedBy: null,
        approvedByEntity: null,
        approvedAt: null,
        reviewSessionId: reviewSessionId || null,
      };
      // Optimistic update
      setStates((prev) => ({
        ...prev,
        [key]: {
          ...prev[key],
          documentSymbol: symbol,
          entity,
          subprogramme,
          decision: newDecision,
          decisions: [...(prev[key]?.decisions || []), newDecision],
        },
      }));

      const result = await createDecisionAction(
        {
          documentSymbol: symbol,
          entity,
          subprogramme,
          decision,
          newSymbol,
        },
        CURRENT_BUDGET_VERSION,
      ).catch(() => ({
        success: false as const,
        error: "The change could not be saved. Please try again.",
      }));
      if (result.success && result.data) {
        const updated = result.data;
        setStates((prev) => ({
          ...prev,
          [key]: {
            ...prev[key],
            decision: updated,
            decisions: [
              ...(prev[key]?.decisions?.filter((d) => d.id) || []),
              updated,
            ],
          },
        }));
        // Refresh review changes to update change indicators
        if (reviewSessionId) {
          refreshReviewChanges();
        }
      } else if (!result.success) {
        rollbackDecision(key);
        if (result.error === "review_mode_blocked") {
          setShowReviewBlockedDialog(true);
          return null;
        }
        // Restore the last persisted event when saving fails.
        showError(`Failed to save decision: ${result.error}`);
      }
      return result.success ? (result.data ?? null) : null;
    },
    [
      entity,
      userEmail,
      canEditSubmission,
      states,
      userEntity,
      reviewSessionId,
      refreshReviewChanges,
      showError,
      rollbackDecision,
    ],
  );

  const handleReasonChange = useCallback(
    async (
      symbol: string,
      subprogramme: string | null,
      decisionReason: string | null,
      otherReason: string | null,
      savedDecision?: MandateDecision,
    ) => {
      const key = `${symbol}:${subprogramme || ""}`;
      const currentDecision = savedDecision ?? states[key]?.decision;
      const decisionId = currentDecision?.id;

      if (!decisionId) {
        showError(
          "The decision is still saving. Please wait before setting its reason.",
        );
        return false;
      }

      // Optimistic update
      setStates((prev) => ({
        ...prev,
        [key]: {
          ...prev[key],
          decision: prev[key]?.decision
            ? {
                ...prev[key].decision!,
                decisionReason,
                otherReason: decisionReason === "other" ? otherReason : null,
              }
            : null,
        },
      }));

      const result = await updateDecisionReasonAction(
        {
          decisionId,
          decisionReason,
          otherReason: decisionReason === "other" ? otherReason : null,
        },
        CURRENT_BUDGET_VERSION,
      ).catch(() => ({
        success: false as const,
        error: "The change could not be saved. Please try again.",
      }));

      if (result.success && result.data) {
        const updated = result.data;
        setStates((prev) => ({
          ...prev,
          [key]: {
            ...prev[key],
            decision: updated,
            decisions: [
              ...(prev[key]?.decisions?.filter((d) => d.id !== updated.id) ||
                []),
              updated,
            ],
          },
        }));
        // Refresh review changes to update change indicators
        if (reviewSessionId) {
          refreshReviewChanges();
        }
      } else if (!result.success) {
        setStates((prev) =>
          prev[key]?.decision?.id === decisionId
            ? {
                ...prev,
                [key]: { ...prev[key], decision: currentDecision },
              }
            : prev,
        );
        if (result.error === "review_mode_blocked") {
          setShowReviewBlockedDialog(true);
        } else {
          showError(`Failed to save: ${result.error}`);
        }
      }
      return result.success && !!result.data;
    },
    [states, reviewSessionId, refreshReviewChanges, showError],
  );

  const saveUpdateWithManual = useCallback(
    async (
      symbol: string,
      subprogramme: string | null,
      newSymbol: string,
      manualData: ManualEntryData,
    ) => {
      if (!userEmail) return false;
      const key = `${symbol}:${subprogramme || ""}`;
      const now = new Date().toISOString();
      const manualMetadata = {
        title: manualData.title || undefined,
        body: manualData.body || undefined,
        year: manualData.year ? parseInt(manualData.year) : undefined,
        link: manualData.link || undefined,
      };
      const newDecision: MandateDecision = {
        id: "",
        documentSymbol: symbol,
        entity,
        subprogramme,
        decision: "update" as Decision,
        newSymbol,
        manualMetadata,
        decisionReason: null,
        otherReason: null,
        userEmail,
        userEntity,
        createdAt: now,
        approvedBy: null,
        approvedByEntity: null,
        approvedAt: null,
        reviewSessionId: reviewSessionId || null,
      };
      // Optimistic update
      setStates((prev) => ({
        ...prev,
        [key]: {
          ...prev[key],
          documentSymbol: symbol,
          entity,
          subprogramme,
          decision: newDecision,
          decisions: [...(prev[key]?.decisions || []), newDecision],
        },
      }));
      const result = await createDecisionAction(
        {
          documentSymbol: symbol,
          entity,
          subprogramme,
          decision: "update",
          newSymbol,
          manualMetadata,
        },
        CURRENT_BUDGET_VERSION,
      ).catch(() => ({
        success: false as const,
        error: "The change could not be saved. Please try again.",
      }));
      if (result.success && result.data) {
        const updated = result.data;
        // Also add to updateTargetMetadata for display
        setUpdateTargetMetadata((prev) => ({
          ...prev,
          [newSymbol]: {
            title: manualData.title || null,
            year: manualData.year ? parseInt(manualData.year) : null,
            body: manualData.body || null,
          },
        }));

        setStates((prev) => ({
          ...prev,
          [key]: {
            ...prev[key],
            decision: updated,
            decisions: [
              ...(prev[key]?.decisions?.filter((d) => d.id) || []),
              updated,
            ],
          },
        }));
        // Refresh review changes to update change indicators
        if (reviewSessionId) {
          refreshReviewChanges();
        }
      } else if (!result.success) {
        rollbackDecision(key);
        if (result.error === "review_mode_blocked") {
          setShowReviewBlockedDialog(true);
        } else {
          showError(`Failed to save: ${result.error}`);
        }
      }
      return result.success && !!result.data;
    },
    [
      entity,
      userEmail,
      userEntity,
      reviewSessionId,
      refreshReviewChanges,
      showError,
      rollbackDecision,
    ],
  );

  const saveAddManual = useCallback(
    async (subprogramme: string | null, data: ManualEntryData) => {
      if (!userEmail) return;
      if (isReviewer && additionTrack === "review") {
        const result = await createDecisionAction(
          {
            documentSymbol: data.symbol,
            entity,
            subprogramme,
            decision: "add",
            manualMetadata: {
              title: data.title || undefined,
              body: data.body || undefined,
              year: data.year ? Number(data.year) : undefined,
              link: data.link || undefined,
            },
            decisionTrack: "review",
            reviewedSubmissionId: null,
          },
          CURRENT_BUDGET_VERSION,
        );
        if (result.success && result.data) onTrackSaved(result.data);
        else if (!result.success) showError(result.error);
        return;
      }
      if (!canEditSubmission) return;
      const key = `${data.symbol}:${subprogramme || ""}`;
      const now = new Date().toISOString();
      const manualMetadata = {
        title: data.title || undefined,
        body: data.body || undefined,
        year: data.year ? parseInt(data.year) : undefined,
        link: data.link || undefined,
      };
      const newDecision: MandateDecision = {
        id: "",
        documentSymbol: data.symbol,
        entity,
        subprogramme,
        decision: "add" as Decision,
        newSymbol: null,
        manualMetadata,
        decisionReason: null,
        otherReason: null,
        userEmail,
        userEntity,
        createdAt: now,
        approvedBy: null,
        approvedByEntity: null,
        approvedAt: null,
        reviewSessionId: reviewSessionId || null,
      };
      // Optimistic update
      setStates((prev) => ({
        ...prev,
        [key]: {
          ...prev[key],
          documentSymbol: data.symbol,
          entity,
          subprogramme,
          decision: newDecision,
          decisions: [...(prev[key]?.decisions || []), newDecision],
        },
      }));
      const result = await createDecisionAction(
        {
          documentSymbol: data.symbol,
          entity,
          subprogramme,
          decision: "add",
          manualMetadata,
        },
        CURRENT_BUDGET_VERSION,
      ).catch(() => ({
        success: false as const,
        error: "The change could not be saved. Please try again.",
      }));
      if (result.success && result.data) {
        const updated = result.data;
        // Also add to addedMetadata for display
        setAddedMetadata((prev) => ({
          ...prev,
          [data.symbol]: {
            title: data.title || null,
            year: data.year ? parseInt(data.year) : null,
            body: data.body || null,
            docType: null,
            link: data.link || null,
          },
        }));

        setStates((prev) => ({
          ...prev,
          [key]: {
            ...prev[key],
            decision: updated,
            decisions: [
              ...(prev[key]?.decisions?.filter((d) => d.id) || []),
              updated,
            ],
          },
        }));
        // Refresh review changes to update change indicators
        if (reviewSessionId) {
          refreshReviewChanges();
        }
      } else if (!result.success) {
        rollbackDecision(key);
        if (result.error === "review_mode_blocked") {
          setShowReviewBlockedDialog(true);
        } else {
          showError(`Failed to save: ${result.error}`);
        }
      }
    },
    [
      entity,
      userEmail,
      isReviewer,
      additionTrack,
      canEditSubmission,
      userEntity,
      reviewSessionId,
      refreshReviewChanges,
      showError,
      rollbackDecision,
    ],
  );

  const handleEditManual = useCallback(
    async (
      symbol: string,
      subprogramme: string | null,
      data: ManualEntryData,
    ) => {
      if (!userEmail) return;
      const key = `${symbol}:${subprogramme || ""}`;
      const currentState = states[key];
      const currentDecision = currentState?.decision;

      if (!currentDecision) return;

      const manualMetadata = {
        title: data.title || undefined,
        body: data.body || undefined,
        year: data.year ? parseInt(data.year) : undefined,
        link: data.link || undefined,
      };

      // Optimistic update
      const updatedDecision = {
        ...currentDecision,
        manualMetadata,
      };

      setStates((prev) => ({
        ...prev,
        [key]: {
          ...prev[key],
          decision: updatedDecision,
        },
      }));

      // Save to server
      const result = await createDecisionAction(
        {
          documentSymbol: symbol,
          entity,
          subprogramme,
          decision: currentDecision.decision,
          newSymbol: currentDecision.newSymbol || undefined,
          decisionReason: currentDecision.decisionReason,
          otherReason: currentDecision.otherReason,
          manualMetadata,
        },
        CURRENT_BUDGET_VERSION,
      ).catch(() => ({
        success: false as const,
        error: "The change could not be saved. Please try again.",
      }));

      if (result.success && result.data) {
        const updated = result.data;
        setStates((prev) => ({
          ...prev,
          [key]: {
            ...prev[key],
            decision: updated,
            decisions: [
              ...(prev[key]?.decisions?.filter((d) => d.id !== updated.id) ||
                []),
              updated,
            ],
          },
        }));
        // Update addedMetadata if this is an "add" decision
        if (currentDecision.decision === "add") {
          setAddedMetadata((prev) => ({
            ...prev,
            [symbol]: {
              title: data.title || null,
              year: data.year ? parseInt(data.year) : null,
              body: data.body || null,
              docType: null,
              link: data.link || null,
            },
          }));
        }

        // Update updateTargetMetadata if this is an "update" decision
        if (
          currentDecision.decision === "update" &&
          currentDecision.newSymbol
        ) {
          setUpdateTargetMetadata((prev) => ({
            ...prev,
            [currentDecision.newSymbol!]: {
              title: data.title || null,
              year: data.year ? parseInt(data.year) : null,
              body: data.body || null,
            },
          }));
        }

        // Refresh review changes to update change indicators
        if (reviewSessionId) {
          refreshReviewChanges();
        }
      } else if (!result.success) {
        setStates((prev) =>
          prev[key]?.decision?.id === currentDecision.id
            ? { ...prev, [key]: currentState }
            : prev,
        );
        if (result.error === "review_mode_blocked") {
          setShowReviewBlockedDialog(true);
        } else {
          showError(`Failed to save: ${result.error}`);
        }
      }
    },
    [
      entity,
      userEmail,
      states,
      reviewSessionId,
      refreshReviewChanges,
      showError,
    ],
  );

  const handleComment = useCallback(
    async (
      symbol: string,
      subprogramme: string | null,
      comment: string,
    ): Promise<MandateComment | null> => {
      if (!userEmail || cycleReadOnly) return null;
      const key = `${symbol}:${subprogramme || ""}`;
      try {
        const result = await createCommentAction(
          { documentSymbol: symbol, entity, subprogramme, comment },
          budgetVersion,
        );
        if (!result.success || !result.data) {
          showError(
            `Failed to save comment: ${result.success ? "No comment returned" : result.error}`,
          );
          return null;
        }
        const added = result.data;
        setStates((previous) => ({
          ...previous,
          [key]: {
            ...previous[key],
            decision: previous[key]?.decision ?? null,
            decisions: previous[key]?.decisions ?? [],
            documentSymbol: symbol,
            entity,
            subprogramme,
            comments: [
              ...(previous[key]?.comments || []).filter(
                (c) => c.id !== added.id,
              ),
              added,
            ],
          },
        }));
        setTotalComments((previous) => ({
          ...previous,
          [symbol]: (previous[symbol] || 0) + 1,
        }));
        dispatchCommentNotificationsRefresh();
        return added;
      } catch {
        showError("Failed to save comment. Please try again.");
        return null;
      }
    },
    [entity, userEmail, cycleReadOnly, budgetVersion, showError],
  );

  const handleStartReview = useCallback(async () => {
    const result = await startReviewModeAction(entity, CURRENT_BUDGET_VERSION);
    if (result.success && result.data) {
      setIsUnderReview(result.data.isUnderReview);
      setReviewStartedBy(result.data.startedBy);
      setReviewSessionId(result.data.reviewSessionId);
      // Clear old review changes - new session starts fresh
      setReviewChanges({});
    } else if (!result.success) {
      showError(`Failed to start review: ${result.error}`);
    }
  }, [entity, showError]);

  const handleEndReview = useCallback(async () => {
    const result = await endReviewModeAction(entity, CURRENT_BUDGET_VERSION);
    if (result.success && result.data) {
      setIsUnderReview(result.data.isUnderReview);
      setReviewStartedBy(null);
      // Keep reviewSessionId and reviewChanges - they persist after review ends
      // to show change indicators to all users
    } else if (!result.success) {
      showError(`Failed to end review: ${result.error}`);
    }
  }, [entity, showError]);

  const handleClearAll = useCallback(async () => {
    const result = await clearAllEntityDecisionsAction(
      entity,
      CURRENT_BUDGET_VERSION,
    );
    if (result.success && result.data) {
      // Clear all local state
      setStates({});
      setTotalComments({});
      setAddedMetadata({});
      setUpdateTargetMetadata({});
    } else if (!result.success) {
      throw new Error(result.error);
    }
  }, [entity]);

  // Refresh decisions from server (used after review blocked dialog closes)
  const refreshDecisions = useCallback(async () => {
    const result = await getEntityDecisionsAction(
      entity,
      undefined,
      budgetVersion,
    );
    if (result.success && result.data) {
      const map: Record<string, MandateState> = {};
      for (const s of result.data.states) {
        map[`${s.documentSymbol}:${s.subprogramme || ""}`] = s;
      }
      setStates(map);
      setTotalComments(result.data.totalComments);
    }
  }, [entity, budgetVersion]);

  // Handle accepting a review change
  const handleAcceptChange = useCallback(
    async (symbol: string, subprogramme: string | null) => {
      if (!FEATURE_FLAGS.reviewChangeIndicator) return; // Feature disabled
      if (!reviewSessionId) return;

      const result = await acceptReviewChangeAction(
        {
          entity,
          documentSymbol: symbol,
          subprogramme,
          reviewSessionId,
        },
        CURRENT_BUDGET_VERSION,
      );

      if (result.success && result.data) {
        const key = `${symbol}:${subprogramme || ""}`;
        setReviewChanges((prev) => ({
          ...prev,
          [key]: {
            ...prev[key],
            response: result.data!,
          },
        }));
        // Also refresh to get any server-side updates
        refreshReviewChanges();
      }
    },
    [entity, reviewSessionId, refreshReviewChanges],
  );

  // Handle reverting a review change
  const handleRevertChange = useCallback(
    async (symbol: string, subprogramme: string | null) => {
      if (!FEATURE_FLAGS.reviewChangeIndicator) return; // Feature disabled
      if (!reviewSessionId) return;

      const result = await revertReviewChangeAction(
        {
          entity,
          documentSymbol: symbol,
          subprogramme,
          reviewSessionId,
        },
        CURRENT_BUDGET_VERSION,
      );

      if (result.success && result.data) {
        const key = `${symbol}:${subprogramme || ""}`;
        setReviewChanges((prev) => ({
          ...prev,
          [key]: {
            ...prev[key],
            response: result.data!,
          },
        }));
        // Refresh decisions to show the reverted state
        refreshDecisions();
        // Also refresh review changes to get server-side updates
        refreshReviewChanges();
      }
    },
    [entity, reviewSessionId, refreshDecisions, refreshReviewChanges],
  );

  const tableView = useMemo(
    () =>
      buildEntityTableView({
        entity,
        legislativeMandates,
        backgroundMandates,
        states,
        addedMetadata,
        updateTargetMetadata,
        entityLong,
        counts:
          commentSummary?.resolutions ??
          Object.fromEntries(
            Object.entries(totalComments).map(([symbol, total]) => [
              symbol,
              { total, unread: 0 },
            ]),
          ),
        filters: tableFilters,
        sort: tableSort,
        sharedEntity: filterEntity,
        showRemaining,
      }),
    [
      entity,
      legislativeMandates,
      backgroundMandates,
      states,
      addedMetadata,
      updateTargetMetadata,
      entityLong,
      commentSummary,
      totalComments,
      tableFilters,
      tableSort,
      filterEntity,
      showRemaining,
    ],
  );
  const { tableStates, tableItems, visibleItems, sectionViews, citationIndex } =
    tableView;
  const foundationalSymbols = useMemo(
    () =>
      new Set(
        [...citationIndex]
          .filter(([, locations]) =>
            locations.some((location) => location.level === "background"),
          )
          .map(([symbol]) => symbol),
      ),
    [citationIndex],
  );
  const unreadEntryCount = tableItems.filter(
    (item) => item.unreadComments > 0,
  ).length;
  const unreadFocused =
    tableFilters.comments.length === 1 && tableFilters.comments[0] === "unread";
  // Notification links use the same unfiltered citation data as row sidebars,
  // including additions. Filters must not strip metadata from a deep link.
  const notificationMandate = notificationOpen
    ? (
        tableItems.find(
          (item) =>
            item.mandate.symbol === notificationSymbol &&
            item.subprogramme === notificationSubprogramme,
        ) ??
        tableItems.find((item) => item.mandate.symbol === notificationSymbol)
      )?.mandate
    : undefined;
  const notificationMetadata =
    notificationMandate ?? addedMetadata[notificationSymbol || ""];

  const showReviewerColumn =
    canReview ||
    isUnderReview ||
    tableItems.some((item) =>
      item.state?.decisions.some(
        (decision) => decision.decisionTrack === "review",
      ),
    );
  const tableControls: EntityTableViewControls = {
    showReviewerColumn,
    submissionLabel: isOwnEntity ? "Your submission" : "Entity submission",
    filters: tableFilters,
    setFilters: setTableFilters,
    sort: tableSort,
    onSort: (column: TableSortColumn, direction) =>
      setTableSort((previous) => ({
        column,
        direction:
          direction ??
          (previous.column === column && previous.direction === "asc"
            ? "desc"
            : "asc"),
      })),
    facets: tableView.facets,
  };
  const clearTableFilters = () => {
    setTableFilters(EMPTY_TABLE_FILTERS);
    setShowRemaining(false);
  };
  const filtersActive =
    hasTableFilters(tableFilters) || !!filterEntity || showRemaining;
  const requiredItems = tableItems.filter(isRequiredSubmission);
  const decidedCitations = requiredItems.filter(hasSubmissionDecision).length;
  const totalMandates = tableItems.length;
  const filteredTotal = visibleItems.length;
  const totalUniqueDocuments = new Set(
    tableItems.map((item) => item.mandate.symbol),
  ).size;
  const filteredUniqueDocuments = new Set(
    visibleItems.map((item) => item.mandate.symbol),
  ).size;

  function onTrackSaved(event: MandateDecision) {
    const key = `${event.documentSymbol}:${event.subprogramme || ""}`;
    setStates((prev) => {
      const decisions = [
        ...(prev[key]?.decisions?.filter((d) => d.id && d.id !== event.id) ||
          []),
        event,
      ];
      const tracks = getDecisionTracks(decisions);
      return {
        ...prev,
        [key]: {
          ...prev[key],
          documentSymbol: event.documentSymbol,
          entity: event.entity,
          subprogramme: event.subprogramme,
          decisions,
          decision: tracks.submission,
          reviewDecision: tracks.review,
          reviewStale: tracks.reviewStale,
        },
      };
    });
  }

  function canDropCitation(location: CitationLocation) {
    if (!canEditSubmission || location.subprogramme === null) return false;
    const state =
      tableStates[`${location.sourceSymbol}:${location.subprogramme}`];
    if (state?.decisions.some((event) => !event.id)) return false;
    // Only withdraw an addition or replacement proposed by this entity.
    if (
      location.isAdded &&
      (!state?.decision ||
        state.decision.decision === "cancel" ||
        !state.decisions.some(
          (event) =>
            event.decisionTrack !== "review" && event.decision === "add",
        ))
    )
      return false;
    if (location.kind === "replacement") {
      const { submission, currentReview } = getDecisionTracks(
        state?.decisions || [],
      );
      return (
        submission?.decision === "update" &&
        !!submission.newSymbol &&
        (!currentReview ||
          (currentReview.decision === "update" &&
            citationSymbolKey(currentReview.newSymbol || "") ===
              citationSymbolKey(submission.newSymbol)))
      );
    }
    return true;
  }

  async function dropCitation(location: CitationLocation) {
    if (!canDropCitation(location)) return false;
    const key = `${location.sourceSymbol}:${location.subprogramme}`;
    if (pendingDrops.current.has(key)) return false;
    pendingDrops.current.add(key);
    const state = tableStates[key];
    try {
      const result = await createDecisionAction(
        {
          entity,
          documentSymbol: location.sourceSymbol,
          subprogramme: location.subprogramme,
          decision: location.isAdded ? "cancel" : "remove",
          expectedDecisionId: state?.decision?.id ?? null,
          expectedReviewId: state?.reviewDecision?.id ?? null,
        },
        budgetVersion,
      );
      if (result.success && result.data) {
        onTrackSaved(result.data);
        if (reviewSessionId) refreshReviewChanges();
        return true;
      }
      if (!result.success) {
        if (result.error === "review_mode_blocked")
          setShowReviewBlockedDialog(true);
        else showError(result.error);
        await refreshDecisions();
      }
      return false;
    } finally {
      pendingDrops.current.delete(key);
    }
  }

  // Shared props for all MandateSection instances
  const sharedSectionProps = {
    entity,
    entityLong,
    states: tableStates,
    totalComments,
    addedMetadata,
    updateTargetMetadata,
    isReviewer,
    userEmail,
    userEntity,
    citationIndex,
    // Only pass review changes if feature is enabled
    ...(FEATURE_FLAGS.reviewChangeIndicator ? { reviewChanges } : {}),
    isUnderReview,
    reviewSessionId,
  };

  const { confirmCitation, citationConfirmation } =
    useCitationConfirmation(citationIndex);
  const handleDecision = async (
    symbol: string,
    subprogramme: string | null,
    decision: Decision,
    newSymbol?: string,
    decisionTrack: "entity" | "review" = "entity",
  ) => {
    const target =
      decision === "add"
        ? symbol
        : decision === "update"
          ? newSymbol
          : undefined;
    if (
      target &&
      !(await confirmCitation(
        target,
        subprogramme,
        decision === "update" ? symbol : undefined,
      ))
    )
      return null;
    return saveDecision(
      symbol,
      subprogramme,
      decision,
      newSymbol,
      decisionTrack,
    );
  };
  const handleUpdateWithManual = async (
    symbol: string,
    subprogramme: string | null,
    newSymbol: string,
    data: ManualEntryData,
  ) => {
    if (!(await confirmCitation(newSymbol, subprogramme, symbol))) return false;
    return saveUpdateWithManual(symbol, subprogramme, newSymbol, data);
  };
  const handleAddManual = async (
    subprogramme: string | null,
    data: ManualEntryData,
  ) => {
    if (!(await confirmCitation(data.symbol, subprogramme))) return;
    return saveAddManual(subprogramme, data);
  };

  // Create handlers for a specific subprogramme
  const makeSubprogHandlers = (subprog: string | null) => ({
    onDecision: (symbol: string, decision: Decision, newSymbol?: string) =>
      handleDecision(symbol, subprog, decision, newSymbol),
    onReasonChange: (
      symbol: string,
      decisionReason: string | null,
      otherReason: string | null,
      savedDecision?: MandateDecision,
    ) =>
      handleReasonChange(
        symbol,
        subprog,
        decisionReason,
        otherReason,
        savedDecision,
      ),
    onUpdateWithManual: (
      symbol: string,
      newSymbol: string,
      manualData: ManualEntryData,
    ) => handleUpdateWithManual(symbol, subprog, newSymbol, manualData),
    onEditManual: (symbol: string, data: ManualEntryData) =>
      handleEditManual(symbol, subprog, data),
    onComment: (symbol: string, comment: string) =>
      handleComment(symbol, subprog, comment),
    onAdd: (symbol: string) =>
      handleDecision(symbol, subprog, "add", undefined, additionTrack),
    onAddManual: (data: ManualEntryData) => handleAddManual(subprog, data),
    // Only include accept/revert handlers if feature is enabled
    ...(FEATURE_FLAGS.reviewChangeIndicator
      ? {
          onAcceptChange: (symbol: string) =>
            handleAcceptChange(symbol, subprog),
          onRevertChange: (symbol: string) =>
            handleRevertChange(symbol, subprog),
        }
      : {}),
  });

  if (!initialLoaded) {
    return (
      <section
        aria-busy={!initialError}
        className="rounded-lg border border-border bg-white p-6"
      >
        <h1 className={typography.pageTitle}>{entity}</h1>
        {initialError ? (
          <div className="mt-3 space-y-3">
            <p role="alert">{initialError}</p>
            <button
              type="button"
              onClick={() => {
                setInitialStatus(null);
                setLoadAttempt((attempt) => attempt + 1);
              }}
              className="rounded bg-un-blue-text px-3 py-2 text-sm text-white focus-visible:ring-2 focus-visible:ring-un-blue"
            >
              Retry loading review
            </button>
          </div>
        ) : (
          <p role="status" className="mt-3">
            Loading permissions and saved decisions…
          </p>
        )}
      </section>
    );
  }

  return (
    <CommentConversationContext.Provider
      value={{
        budgetVersion,
        userEmail,
        userEntity,
        isReviewer: canViewAllConversations,
        canComment,
        counts: commentSummary?.resolutions || {},
      }}
    >
      <DecisionTracksContext.Provider
        value={{
          entity,
          canEditSubmission,
          canReview,
          onSaved: onTrackSaved,
          confirmCitation,
          canDropCitation,
          onDropCitation: dropCitation,
        }}
      >
        <EntityTableFilterContext.Provider value={tableControls}>
          <div className="space-y-5">
            {notificationOpen && notificationSymbol && (
              <DocumentSymbol
                symbol={notificationSymbol}
                entity={entity}
                entityLong={entityLong}
                subprogramme={notificationSubprogramme}
                title={notificationMetadata?.title || undefined}
                link={notificationMetadata?.link ?? null}
                year={notificationMetadata?.year}
                body={notificationMetadata?.body}
                docType={notificationMetadata?.docType}
                otherEntitiesCount={notificationMandate?.otherEntitiesCount}
                allEntities={notificationMandate?.allEntities}
                entitySubprogrammes={notificationMandate?.entitySubprogrammes}
                entityLongMap={notificationMandate?.entityLongMap}
                relevanceCount={notificationMandate?.relevanceCount ?? 0}
                relevanceIndices={notificationMandate?.relevanceIndices ?? []}
                aiComments={notificationMandate?.aiComments ?? {}}
                allEntityRelevance={
                  notificationMandate?.allEntityRelevance ?? {}
                }
                metadataFromDb={notificationMandate?.metadataFromDb}
                isFoundational={foundationalSymbols.has(
                  citationSymbolKey(notificationSymbol),
                )}
                budgetVersion={budgetVersion}
                targetCommentId={notificationId}
                isOpen
                onOpenChange={(open) => {
                  if (!open) setDismissedNotification(notificationId);
                }}
                initialTab="activity"
                readOnly={cycleReadOnly}
                userEmail={userEmail}
                userEntity={userEntity}
                state={
                  sharedSectionProps.states[
                    `${notificationSymbol}:${notificationSubprogramme || ""}`
                  ]
                }
                onDecision={(decision, newSymbol) =>
                  handleDecision(
                    notificationSymbol,
                    notificationSubprogramme,
                    decision,
                    newSymbol,
                  )
                }
                onReasonChange={(reason, other, saved) =>
                  handleReasonChange(
                    notificationSymbol,
                    notificationSubprogramme,
                    reason,
                    other,
                    saved,
                  )
                }
                onUpdateWithManual={(newSymbol, data) =>
                  handleUpdateWithManual(
                    notificationSymbol,
                    notificationSubprogramme,
                    newSymbol,
                    data,
                  )
                }
                onComment={
                  canComment
                    ? (text) =>
                        handleComment(
                          notificationSymbol,
                          notificationSubprogramme,
                          text,
                        )
                    : undefined
                }
              />
            )}
            {notificationId &&
              notificationCycle &&
              notificationCycle !== budgetVersion && (
                <p
                  role="alert"
                  className="rounded border border-amber-200 bg-amber-50 p-3 text-sm"
                >
                  This comment belongs to a different submission cycle. Select
                  that cycle to view it.
                </p>
              )}
            {/* Error toast */}
            {errorMessage && (
              <div
                role="alert"
                className="fixed right-4 bottom-4 z-50 flex max-w-md items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 shadow-lg"
              >
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
                <p className="text-sm text-red-800">{errorMessage}</p>
                <button
                  onClick={() => setErrorMessage(null)}
                  aria-label="Dismiss error"
                  className="ml-auto shrink-0 text-red-700 hover:text-red-800"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {cycleReadOnly && (
              <p className="rounded border border-blue-200 bg-blue-50 p-3 text-sm">
                {DISABLED_REVIEW_MESSAGE}
              </p>
            )}
            {/* Read-only notice */}
            {!cycleReadOnly && !isOwnEntity && userEntity && !canReview && (
              <ReadOnlyNoticeBanner
                viewingEntity={entity}
                userEntity={userEntity}
              />
            )}
            {canReview && userEntity !== entity && (
              <ReviewerModeBanner reviewingEntity={entity} />
            )}
            {isUnderReview && (
              <ReviewInProgressBanner
                startedBy={reviewStartedBy}
                isReviewer={isReviewer}
                onEndReview={isReviewer ? handleEndReview : undefined}
              />
            )}

            <EntityHeader
              entity={entity}
              entityLong={entityLong}
              partName={partName}
              decidedCitations={decidedCitations}
              requiredCitations={requiredItems.length}
              showRemaining={showRemaining}
              onShowRemainingChange={setShowRemaining}
              budgetVersion={budgetVersion}
              canEditSubmission={canEditSubmission}
              cycleReadOnly={cycleReadOnly}
              filterEntity={filterEntity}
              filtersActive={filtersActive}
              filteredCitations={filteredTotal}
              totalCitations={totalMandates}
              filteredUniqueDocuments={filteredUniqueDocuments}
              totalUniqueDocuments={totalUniqueDocuments}
              canReview={canReview}
              isUnderReview={isUnderReview}
              onStartReview={
                !cycleReadOnly && reviewModeLoaded
                  ? handleStartReview
                  : undefined
              }
              isClearingAll={isClearingAll}
              navigation={
                <SubprogrammeContents
                  sections={sectionViews.map((section) => ({
                    id: section.id,
                    title: section.title,
                    count: section.visibleMandates.length,
                    total: section.mandates.length,
                  }))}
                />
              }
            />

            {/* Phase Tracker */}
            {/* <PhaseTracker /> */}

            <div
              role="search"
              aria-label="Search and filter citations"
              className="flex flex-wrap items-center gap-2"
            >
              <div className="relative min-w-56 flex-1">
                <Search
                  className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-foreground/75"
                  aria-hidden="true"
                />
                <input
                  type="text"
                  data-workspace-search
                  aria-label="Search all citations"
                  placeholder="Search symbol, title or body…"
                  value={tableFilters.search}
                  onChange={(event) =>
                    setTableFilters({
                      ...tableFilters,
                      search: event.target.value,
                    })
                  }
                  className="h-9 w-full rounded-md border border-input bg-white pr-9 pl-9 text-sm text-foreground placeholder:text-gray-600 focus-visible:ring-2 focus-visible:ring-un-blue focus-visible:outline-none"
                />
                {tableFilters.search && (
                  <button
                    type="button"
                    aria-label="Clear citation search"
                    onClick={() =>
                      setTableFilters({ ...tableFilters, search: "" })
                    }
                    className="absolute top-1/2 right-2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-foreground/75 hover:bg-muted focus-visible:ring-2 focus-visible:ring-un-blue"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </div>
              <BodyTypeFilter controls={tableControls} />
              <Button
                type="button"
                variant="outline"
                aria-pressed={tableFilters.notes.includes("with-notes")}
                onClick={() =>
                  setTableFilters({
                    ...tableFilters,
                    notes: tableFilters.notes.includes("with-notes")
                      ? []
                      : ["with-notes"],
                  })
                }
                className={cn(
                  ENTITY_TOOLBAR_CONTROL,
                  tableFilters.notes.includes("with-notes") &&
                    "border-un-blue-text bg-un-blue-surface text-un-blue-text",
                )}
              >
                With notes{" "}
                <span className="text-foreground tabular-nums">
                  {
                    tableItems.filter(
                      (item) => (item.warningIds?.length ?? 0) > 0,
                    ).length
                  }
                </span>
              </Button>
              {(unreadEntryCount > 0 || unreadFocused) && (
                <>
                  <span role="status" className="sr-only">
                    {unreadEntryCount > 0
                      ? `${unreadEntryCount} ${unreadEntryCount === 1 ? "entry has" : "entries have"} unread comments`
                      : "No unread comments remaining"}
                  </span>
                  <Tooltip
                    asChild
                    content={
                      unreadFocused
                        ? "Show all entries"
                        : "Focus on unread comments"
                    }
                  >
                    <Button
                      type="button"
                      variant="outline"
                      aria-pressed={unreadFocused}
                      aria-label={
                        unreadFocused
                          ? "Show all entries, clear unread comments filter"
                          : `Focus on ${unreadEntryCount} ${unreadEntryCount === 1 ? "entry" : "entries"} with unread comments`
                      }
                      onClick={() =>
                        setTableFilters({
                          ...tableFilters,
                          comments: unreadFocused ? [] : ["unread"],
                        })
                      }
                      className={cn(
                        ENTITY_TOOLBAR_CONTROL,
                        unreadFocused &&
                          "border-un-blue-text bg-un-blue-surface text-un-blue-text",
                      )}
                    >
                      <MessageSquare className="h-4 w-4" aria-hidden="true" />
                      Unread comments{" "}
                      <span className="text-foreground tabular-nums">
                        {unreadEntryCount}
                      </span>
                    </Button>
                  </Tooltip>
                </>
              )}
            </div>

            <ActiveTableFilters
              controls={tableControls}
              sharedEntity={null}
              onClearAll={clearTableFilters}
            />
            {/* The page scrolls vertically; narrower screens retain horizontal access to all columns. */}
            <div
              role="region"
              aria-label="Resolution review sections"
              tabIndex={0}
              className="relative isolate overflow-x-auto rounded-lg border border-border bg-white focus-visible:ring-2 focus-visible:ring-un-blue lg:overflow-visible"
            >
              <div
                role="table"
                aria-label={`${entity} mandate review decisions`}
                aria-colcount={showReviewerColumn ? 9 : 8}
                className={
                  showReviewerColumn ? "min-w-[966px]" : "min-w-[876px]"
                }
              >
                <div
                  role="rowgroup"
                  className="rounded-t-lg border-b border-foreground/20 bg-muted lg:sticky lg:top-[var(--site-header-height,0px)] lg:z-20"
                >
                  <ColumnHeaders controls={tableControls} />
                </div>
                {sectionViews.map((section) => (
                  <MandateSection
                    key={section.id}
                    title={
                      section.subprogramme === null
                        ? section.title
                        : formatSubprogrammeName(section.subprogramme)
                    }
                    sectionId={section.id}
                    bodyFullNames={bodyFullNames}
                    mandates={section.mandates}
                    visibleMandates={section.visibleMandates}
                    subprogramme={section.subprogramme}
                    foundationalSymbols={foundationalSymbols}
                    readOnly={
                      section.subprogramme !== null ? !canComment : !canReview
                    }
                    {...sharedSectionProps}
                    {...makeSubprogHandlers(section.subprogramme)}
                  />
                ))}
              </div>
            </div>
            {filteredTotal === 0 && (
              <div className="rounded-lg border border-border bg-white p-8 text-center text-foreground">
                <p>
                  {showRemaining &&
                  requiredItems.length > 0 &&
                  decidedCitations === requiredItems.length
                    ? "All submission citations have a recorded decision."
                    : "No citations match these filters."}
                </p>
                <button
                  type="button"
                  onClick={clearTableFilters}
                  className="mt-3 text-un-blue-text underline"
                >
                  Clear all filters
                </button>
              </div>
            )}

            {/* Review blocked dialog - shown when user tries to save while under review */}
            <ReviewBlockedDialog
              isOpen={showReviewBlockedDialog}
              onClose={() => {
                setShowReviewBlockedDialog(false);
                refreshDecisions();
              }}
            />

            {/* Clear all decisions dialog - shown when reviewer clicks Clear All */}
            <ClearAllDecisionsDialog
              isOpen={showClearAllDialog}
              onClose={() => setShowClearAllDialog(false)}
              onConfirm={handleClearAll}
              entityName={entity}
              onClearingStateChange={setIsClearingAll}
            />
          </div>
          {citationConfirmation}
        </EntityTableFilterContext.Provider>
      </DecisionTracksContext.Provider>
    </CommentConversationContext.Provider>
  );
}
