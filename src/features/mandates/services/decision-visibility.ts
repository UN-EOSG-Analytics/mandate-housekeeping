import { getEntityPermissions } from "@/features/auth/permissions";
import type { MandateDecision } from "@/types";

/** Other entities expose only the current event in each decision track. */
export function getVisibleDecisions(
  decisions: MandateDecision[],
  user: { entity: string | null; isReviewer: boolean },
): MandateDecision[] {
  const latest = new Map<string, MandateDecision>();
  for (const decision of decisions) {
    if (getEntityPermissions(user, decision.entity).canViewConversation)
      continue;
    const key = JSON.stringify([
      decision.entity,
      decision.documentSymbol,
      decision.subprogramme,
      decision.decisionTrack ?? "entity",
    ]);
    const previous = latest.get(key);
    if (
      !previous ||
      new Date(decision.createdAt).getTime() >
        new Date(previous.createdAt).getTime() ||
      (new Date(decision.createdAt).getTime() ===
        new Date(previous.createdAt).getTime() &&
        decision.id.localeCompare(previous.id) > 0)
    ) {
      latest.set(key, decision);
    }
  }
  const visibleIds = new Set(
    [...latest.values()].map((decision) => decision.id),
  );
  return decisions.filter(
    (decision) =>
      getEntityPermissions(user, decision.entity).canViewConversation ||
      visibleIds.has(decision.id),
  );
}
