import type { MandateDecision, ExportDecisionMode } from "@/types";

/** Resolve each track independently; ties match SQL created_at/id ordering. */
export function getDecisionTracks(decisions: MandateDecision[]) {
  let submission: MandateDecision | null = null;
  let review: MandateDecision | null = null;
  const ordered = [...decisions].sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() ||
      a.id.localeCompare(b.id),
  );
  for (const event of ordered) {
    if (event.decisionTrack === "review") review = event;
    else submission = event;
  }
  const reviewStale =
    !!review &&
    review.decision !== "cancel" &&
    (review.reviewedSubmissionId ?? null) !== (submission?.id ?? null);
  const currentReview =
    review && review.decision !== "cancel" && !reviewStale ? review : null;
  return { submission, review, reviewStale, currentReview };
}

export function getEffectiveDecision(
  decisions: MandateDecision[],
  mode: ExportDecisionMode,
) {
  const { submission, currentReview } = getDecisionTracks(decisions);
  return mode === "reviewed" ? (currentReview ?? submission) : submission;
}
