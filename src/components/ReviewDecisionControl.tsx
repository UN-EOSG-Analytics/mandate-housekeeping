"use client";

import { createContext, useContext, useRef, useState } from "react";
import { Copy, MoreHorizontal, AlertCircle, Loader2 } from "lucide-react";
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
  confirmCitation?: (
    symbol: string,
    subprogramme: string | null,
    sourceSymbol?: string,
  ) => Promise<boolean>;
} | null>(null);

/** Shared by the entity table and the document sidebar. */
export function ReviewDecisionControl({
  entity,
  symbol,
  subprogramme,
  submission,
  review: persistedReview,
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
  const busyRef = useRef(false);
  const [preview, setPreview] = useState<MandateDecision | null>(null);
  const [confirmed, setConfirmed] = useState<MandateDecision | null>(null);
  // Keep a confirmed response visible until parent props catch up, while allowing
  // a newer remote event to supersede it. Pending previews never enter history.
  const confirmedTime = confirmed ? new Date(confirmed.createdAt).getTime() : 0;
  const persistedTime = persistedReview
    ? new Date(persistedReview.createdAt).getTime()
    : 0;
  const latest =
    confirmed &&
    (!persistedReview ||
      confirmedTime > persistedTime ||
      (confirmedTime === persistedTime &&
        confirmed.id.localeCompare(persistedReview.id) > 0))
      ? confirmed
      : persistedReview;
  const review = preview ?? latest;
  const [error, setError] = useState<string | null>(null);
  const [showReplacement, setShowReplacement] = useState(false);
  const [showEditMetadata, setShowEditMetadata] = useState(false);
  const [showReason, setShowReason] = useState(false);
  const { reviewStale } = getDecisionTracks([
    ...(submission ? [submission] : []),
    ...(review ? [review] : []),
  ]);
  const saved = (event: MandateDecision) => {
    setConfirmed(event);
    context?.onSaved(event);
    onSaved?.(event);
  };
  const save = async (
    decision: Decision,
    newSymbol?: string,
    manualMetadata?: ManualMetadata,
    agree = false,
    details?: Pick<
      MandateDecision,
      "decisionReason" | "otherReason" | "reviewedSubmissionId"
    >,
  ) => {
    if (!canEdit || busyRef.current) return null;
    busyRef.current = true;
    const targetDecision = agree ? submission?.decision : decision;
    const targetSymbol =
      targetDecision === "add"
        ? symbol
        : targetDecision === "update"
          ? agree
            ? submission?.newSymbol
            : newSymbol
          : null;
    if (targetSymbol && context?.confirmCitation) {
      const proceed = await context.confirmCitation(
        targetSymbol,
        subprogramme,
        targetDecision === "update" ? symbol : undefined,
      );
      if (!proceed) {
        busyRef.current = false;
        return null;
      }
    }
    setError(null);
    setBusy(true);
    const copied = agree ? submission : null;
    setPreview({
      id: "",
      documentSymbol: symbol,
      entity,
      subprogramme,
      decision: copied?.decision ?? decision,
      newSymbol: copied?.newSymbol ?? newSymbol ?? null,
      manualMetadata: copied?.manualMetadata ?? manualMetadata ?? null,
      decisionReason: copied?.decisionReason ?? details?.decisionReason ?? null,
      otherReason: copied?.otherReason ?? details?.otherReason ?? null,
      decisionTrack: "review",
      reviewedSubmissionId:
        details?.reviewedSubmissionId ?? submission?.id ?? null,
      userEmail: review?.userEmail ?? "",
      userEntity: review?.userEntity ?? null,
      createdAt: new Date().toISOString(),
      approvedBy: null,
      approvedByEntity: null,
      approvedAt: null,
      reviewSessionId: review?.reviewSessionId ?? null,
    });
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
          ...details,
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
      setPreview(null);
      busyRef.current = false;
      setBusy(false);
    }
  };
  const reason = async (
    decisionReason: string | null,
    otherReason: string | null,
    event?: MandateDecision,
  ) => {
    const target = event ?? latest;
    if (!canEdit || !target?.id || busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setPreview({
      ...target,
      decisionReason,
      otherReason: decisionReason === "other" ? otherReason : null,
    });
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
    } finally {
      setPreview(null);
      busyRef.current = false;
      setBusy(false);
    }
  };
  const confirm = async () => {
    if (!review) return;
    await save(
      review.decision,
      review.newSymbol ?? undefined,
      review.manualMetadata ?? undefined,
      false,
      {
        decisionReason: review.decisionReason,
        otherReason: review.otherReason,
        reviewedSubmissionId: submission?.id ?? null,
      },
    );
  };
  const editMetadata = async (data: ManualEntryData) => {
    if (!review) return;
    if (review.decision === "add" && data.symbol !== symbol) {
      setError(
        "To change the symbol, clear this addition and add the correct document.",
      );
      return;
    }
    const result = await save(
      review.decision,
      review.decision === "update" ? data.symbol : undefined,
      {
        title: data.title || undefined,
        body: data.body || undefined,
        year: data.year ? Number(data.year) : undefined,
        link: data.link || undefined,
      },
      false,
      {
        decisionReason: review.decisionReason,
        otherReason: review.otherReason,
        reviewedSubmissionId: review.reviewedSubmissionId ?? null,
      },
    );
    if (result) setShowEditMetadata(false);
  };
  const hasReview = !!review && review.decision !== "cancel";
  const hasMoreActions =
    reviewStale ||
    (!!review?.manualMetadata &&
      (review.decision === "add" || review.decision === "update"));
  const agreeWithSubmission = () => {
    if (submission)
      return save(submission.decision, undefined, undefined, true);
  };
  const moreActions = (
    <>
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
      aria-busy={busy}
      onClick={(e) => e.stopPropagation()}
    >
      {busy && (
        <span
          role="status"
          className="inline-flex items-center gap-1 text-xs text-foreground"
          title={compact ? "Saving review…" : undefined}
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span className={compact ? "sr-only" : undefined}>Saving…</span>
        </span>
      )}
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
          title={compact ? "Submission changed — review needed" : undefined}
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
        !hasReview && (
          <button
            type="button"
            disabled={busy}
            title={compact ? "Copy submission decision" : undefined}
            aria-label="Copy submission decision"
            className={
              compact
                ? "flex h-6 w-6 shrink-0 items-center justify-center rounded text-un-blue-text hover:bg-un-blue-surface disabled:opacity-60"
                : "text-left text-xs text-un-blue-text underline underline-offset-2 disabled:opacity-60"
            }
            onClick={agreeWithSubmission}
          >
            {compact ? (
              <Copy className="h-3.5 w-3.5" />
            ) : busy ? (
              "Saving…"
            ) : (
              "Copy submission decision"
            )}
          </button>
        )}
      {compact
        ? canEdit &&
          hasMoreActions && (
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
        <span
          role="alert"
          title={compact ? error : undefined}
          className="text-xs text-red-700"
        >
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
