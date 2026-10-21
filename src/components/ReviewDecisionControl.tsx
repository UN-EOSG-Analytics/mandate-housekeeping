"use client";

import { createContext, useContext, useState } from "react";
import { Check, MoreHorizontal, AlertCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import type { Decision, MandateDecision, ManualMetadata } from "@/types";
import {
  createDecisionAction,
  updateDecisionReasonAction,
} from "@/features/mandates/actions/decisions";
import { getDecisionTracks } from "@/features/mandates/services/decision-tracks";
import { CURRENT_BUDGET_VERSION } from "@/lib/db/budget-version";
import {
  ManualDocumentForm,
  type ManualEntryData,
} from "@/features/mandates/ui/ManualDocumentForm";
import { DecisionDropdown } from "./DecisionDropdown";
import { DocumentSearchInput } from "@/features/mandates/ui/DocumentSearchInput";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";

export const DecisionTracksContext = createContext<{
  entity: string;
  canEditSubmission: boolean;
  canReview: boolean;
  onSaved: (event: MandateDecision) => void;
} | null>(null);

/** Shared by the entity table and the document sidebar. */
export function ReviewDecisionControl({
  entity,
  symbol,
  subprogramme,
  submission,
  review,
  editable = false,
  compact = false,
  onSaved,
}: {
  entity: string;
  symbol: string;
  subprogramme: string | null;
  submission: MandateDecision | null;
  review: MandateDecision | null;
  editable?: boolean;
  compact?: boolean;
  onSaved?: (event: MandateDecision) => void;
}) {
  const context = useContext(DecisionTracksContext);
  const canEdit =
    editable && (!context || (context.entity === entity && context.canReview));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showReplacement, setShowReplacement] = useState(false);
  const [showEditMetadata, setShowEditMetadata] = useState(false);
  const [showReason, setShowReason] = useState(false);
  const { reviewStale } = getDecisionTracks([
    ...(submission ? [submission] : []),
    ...(review ? [review] : []),
  ]);
  const saved = (event: MandateDecision) => {
    context?.onSaved(event);
    onSaved?.(event);
  };
  const save = async (
    decision: Decision,
    newSymbol?: string,
    manualMetadata?: ManualMetadata,
    agree = false,
  ) => {
    if (!canEdit || busy) return null;
    setError(null);
    setBusy(true);
    try {
      const result = await createDecisionAction(
        {
          documentSymbol: symbol,
          entity,
          subprogramme,
          decision,
          newSymbol,
          manualMetadata,
          decisionTrack: "review",
          reviewedSubmissionId: submission?.id ?? null,
          agreeWithSubmission: agree,
        },
        CURRENT_BUDGET_VERSION,
      );
      if (!result.success || !result.data) {
        setError(result.success ? "Could not save review" : result.error);
        return null;
      }
      saved(result.data);
      return result.data;
    } catch {
      setError("Could not save review. Please try again.");
      return null;
    } finally {
      setBusy(false);
    }
  };
  const reason = async (
    decisionReason: string | null,
    otherReason: string | null,
    event?: MandateDecision,
  ) => {
    const target = event ?? review;
    if (!canEdit || !target?.id) return false;
    try {
      const result = await updateDecisionReasonAction(
        { decisionId: target.id, decisionReason, otherReason },
        CURRENT_BUDGET_VERSION,
      );
      if (!result.success || !result.data) {
        setError(result.success ? "Could not save reason" : result.error);
        return false;
      }
      saved(result.data);
      return true;
    } catch {
      setError("Could not save reason. Please try again.");
      return false;
    }
  };
  const confirm = async () => {
    if (!canEdit || !review || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await createDecisionAction(
        {
          documentSymbol: symbol,
          entity,
          subprogramme,
          decision: review.decision,
          newSymbol: review.newSymbol ?? undefined,
          manualMetadata: review.manualMetadata ?? undefined,
          decisionReason: review.decisionReason,
          otherReason: review.otherReason,
          decisionTrack: "review",
          reviewedSubmissionId: submission?.id ?? null,
        },
        CURRENT_BUDGET_VERSION,
      );
      if (result.success && result.data) saved(result.data);
      else if (!result.success) setError(result.error);
    } catch {
      setError("Could not confirm review. Please try again.");
    } finally {
      setBusy(false);
    }
  };
  const editMetadata = async (data: ManualEntryData) => {
    if (!canEdit || !review || busy) return;
    if (review.decision === "add" && data.symbol !== symbol) {
      setError(
        "To change the symbol, clear this addition and add the correct document.",
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await createDecisionAction(
        {
          documentSymbol: symbol,
          entity,
          subprogramme,
          decision: review.decision,
          newSymbol: review.decision === "update" ? data.symbol : undefined,
          manualMetadata: {
            title: data.title || undefined,
            body: data.body || undefined,
            year: data.year ? Number(data.year) : undefined,
            link: data.link || undefined,
          },
          decisionReason: review.decisionReason,
          otherReason: review.otherReason,
          decisionTrack: "review",
          reviewedSubmissionId: review.reviewedSubmissionId ?? null,
        },
        CURRENT_BUDGET_VERSION,
      );
      if (result.success && result.data) {
        saved(result.data);
        setShowEditMetadata(false);
      } else if (!result.success) setError(result.error);
    } catch {
      setError("Could not save metadata. Please try again.");
    } finally {
      setBusy(false);
    }
  };
  const hasReview = !!review && review.decision !== "cancel";
  const agreeWithSubmission = () => {
    if (submission)
      return save(submission.decision, undefined, undefined, true);
  };
  const moreActions = (
    <>
      {compact &&
        hasReview &&
        canEdit &&
        submission &&
        submission.decision !== "cancel" && (
          <button
            type="button"
            disabled={busy}
            onClick={agreeWithSubmission}
            className="text-left text-xs text-un-blue-text underline underline-offset-2 disabled:opacity-60"
          >
            Agree with submission
          </button>
        )}
      {canEdit && reviewStale && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void confirm()}
          className="text-left text-xs text-un-blue-text underline underline-offset-2"
        >
          Confirm review decision
        </button>
      )}
      {canEdit &&
        submission?.decision === "add" &&
        review?.decision !== "remove" && (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              if (await save("remove")) setShowReason(true);
            }}
            className="text-left text-xs text-un-blue-text underline underline-offset-2"
          >
            Reject addition
          </button>
        )}
      {canEdit && review && review.decision !== "cancel" && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void save("cancel")}
          className="text-left text-xs text-un-blue-text underline underline-offset-2"
        >
          Clear review
        </button>
      )}
      {canEdit &&
        review?.manualMetadata &&
        (review.decision === "add" || review.decision === "update") && (
          <button
            type="button"
            disabled={busy || reviewStale}
            onClick={() => setShowEditMetadata(true)}
            className="text-left text-xs text-un-blue-text underline underline-offset-2 disabled:opacity-60"
          >
            Edit review document details
          </button>
        )}
    </>
  );
  return (
    <div
      className={
        compact
          ? "flex min-w-0 flex-nowrap items-center gap-1"
          : "flex min-w-0 flex-col items-start gap-1"
      }
      title={
        compact && review?.decision === "update"
          ? `Replacement: ${review.newSymbol}`
          : undefined
      }
      onClick={(e) => e.stopPropagation()}
    >
      {(!review || review.decision === "cancel") && (!compact || !canEdit) ? (
        <span className="text-xs whitespace-nowrap text-foreground">
          Not reviewed
        </span>
      ) : null}
      {(canEdit || (review && review.decision !== "cancel")) && (
        <DecisionDropdown
          decision={review?.decision ?? null}
          onChange={save}
          disabled={!canEdit || busy}
          userEmail={review?.userEmail}
          userEntity={review?.userEntity}
          createdAt={review?.createdAt}
          reason={review?.decisionReason}
          otherReason={review?.otherReason}
          onReasonChange={canEdit ? reason : undefined}
          onUpdateClick={() => setShowReplacement(true)}
          symbol={symbol}
          showReasonPopup={showReason}
          onReasonPopupClose={() => setShowReason(false)}
        />
      )}
      {review?.decision === "update" && !compact && (
        <span className="text-xs break-all text-un-blue-text">
          → {review.newSymbol}
        </span>
      )}
      {reviewStale && (!compact || !canEdit) && (
        <span
          className="text-xs text-amber-800"
          title="Submission changed — review needed"
        >
          {compact ? (
            <>
              <AlertCircle className="h-3.5 w-3.5" />
              <span className="sr-only">
                Submission changed — review needed
              </span>
            </>
          ) : (
            "Submission changed — review needed"
          )}
        </span>
      )}
      {canEdit &&
        submission &&
        submission.decision !== "cancel" &&
        (!compact || !hasReview) && (
          <button
            type="button"
            disabled={busy}
            title="Agree with submission"
            aria-label="Agree with submission"
            className={
              compact
                ? "flex h-6 w-6 shrink-0 items-center justify-center rounded text-un-blue-text hover:bg-un-blue-surface disabled:opacity-60"
                : "text-left text-xs text-un-blue-text underline underline-offset-2 disabled:opacity-60"
            }
            onClick={agreeWithSubmission}
          >
            {compact ? (
              <Check className="h-3.5 w-3.5" />
            ) : busy ? (
              "Saving…"
            ) : (
              "Agree with submission"
            )}
          </button>
        )}
      {compact
        ? canEdit &&
          ((review && review.decision !== "cancel") ||
            submission?.decision === "add") && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  disabled={busy}
                  aria-label="More review actions"
                  title={
                    reviewStale
                      ? "Submission changed — review needed"
                      : "More review actions"
                  }
                  className="flex h-6 w-5 shrink-0 items-center justify-center rounded text-foreground hover:bg-secondary"
                >
                  {reviewStale ? (
                    <AlertCircle className="h-3.5 w-3.5 text-amber-800" />
                  ) : (
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="flex w-56 flex-col items-start gap-3 p-3"
              >
                {review?.decision === "update" && (
                  <span className="text-xs break-all text-un-blue-text">
                    Replacement: {review.newSymbol}
                  </span>
                )}
                {reviewStale && (
                  <span className="text-xs text-amber-800">
                    Submission changed — review needed
                  </span>
                )}
                {moreActions}
              </PopoverContent>
            </Popover>
          )
        : moreActions}
      <Dialog open={showEditMetadata} onOpenChange={setShowEditMetadata}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit review document details</DialogTitle>
          </DialogHeader>
          {review && (
            <ManualDocumentForm
              onSubmit={(data) => void editMetadata(data)}
              onCancel={() => setShowEditMetadata(false)}
              initialSymbol={review.newSymbol ?? symbol}
              initialTitle={review.manualMetadata?.title ?? ""}
              initialBody={review.manualMetadata?.body ?? ""}
              initialYear={review.manualMetadata?.year?.toString() ?? ""}
              initialLink={review.manualMetadata?.link ?? ""}
              originalSymbol={review.newSymbol ?? symbol}
              originalTitle={review.manualMetadata?.title ?? undefined}
              submitLabel={busy ? "Saving…" : "Save details"}
            />
          )}
        </DialogContent>
      </Dialog>
      {error && (
        <span role="alert" title={error} className="text-xs text-red-700">
          {compact ? (
            <>
              <AlertCircle className="h-4 w-4" />
              <span className="sr-only">{error}</span>
            </>
          ) : (
            error
          )}
        </span>
      )}
      <Dialog open={showReplacement} onOpenChange={setShowReplacement}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Select reviewer replacement for {symbol}</DialogTitle>
          </DialogHeader>
          <DocumentSearchInput
            onSelect={async (replacement) => {
              if (await save("update", replacement)) {
                setShowReplacement(false);
                setShowReason(true);
              }
            }}
            onManualSubmit={async (data) => {
              if (
                await save("update", data.symbol, {
                  title: data.title || undefined,
                  body: data.body || undefined,
                  year: data.year ? Number(data.year) : undefined,
                  link: data.link || undefined,
                })
              ) {
                setShowReplacement(false);
                setShowReason(true);
              }
            }}
            onCancel={() => setShowReplacement(false)}
            submitLabel="Use replacement"
            formTitle="Enter replacement manually"
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
