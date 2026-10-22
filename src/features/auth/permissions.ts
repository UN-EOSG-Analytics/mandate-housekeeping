/** Entity membership owns primary submissions; the reviewer allowlist grants
 * review access across all entities, independently of selected membership. */
export function getEntityPermissions(
  user: { entity: string | null; isReviewer: boolean },
  entity: string,
  { cycleReadOnly = false, submissionLocked = false } = {},
) {
  const ownsEntity = !!user.entity && user.entity === entity;
  return {
    ownsEntity,
    canEditSubmission: !cycleReadOnly && ownsEntity && !submissionLocked,
    canReview: !cycleReadOnly && user.isReviewer,
    canComment: !cycleReadOnly && (ownsEntity || user.isReviewer),
  };
}
