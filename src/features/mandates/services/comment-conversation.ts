import type { MandateComment, MandateDecision } from "@/types";

export const conversationGroupKey = (
  entity: string,
  subprogramme: string | null,
) => JSON.stringify([entity, subprogramme || null]);

export type ConversationEntry =
  | { type: "comment"; comment: MandateComment }
  | {
      type: "decisions";
      decisions: MandateDecision[];
      latest: MandateDecision[];
    };

/** Collapse decision runs, retaining the last event in each independent track. */
export function conversationTimeline(
  comments: MandateComment[],
  decisions: MandateDecision[],
): ConversationEntry[] {
  const events = [
    ...comments.map((comment) => ({
      type: "comment" as const,
      comment,
      at: comment.createdAt,
      id: comment.id,
    })),
    ...decisions.map((decision) => ({
      type: "decision" as const,
      decision,
      at: decision.createdAt,
      id: decision.id,
    })),
  ].sort(
    (a, b) =>
      new Date(a.at).getTime() - new Date(b.at).getTime() ||
      a.id.localeCompare(b.id),
  );
  const result: ConversationEntry[] = [];
  for (const event of events) {
    if (event.type === "comment") {
      result.push({ type: "comment", comment: event.comment });
    } else {
      let run = result[result.length - 1];
      if (!run || run.type !== "decisions") {
        run = { type: "decisions", decisions: [], latest: [] };
        result.push(run);
      }
      run.decisions.push(event.decision);
      const track = event.decision.decisionTrack || "entity";
      run.latest = [
        ...run.latest.filter((d) => (d.decisionTrack || "entity") !== track),
        event.decision,
      ];
    }
  }
  return result;
}

export function conversationGroups({
  entity,
  subprogramme,
  entitySubprogrammes,
  allEntities,
  comments,
  decisions,
}: {
  entity?: string;
  subprogramme: string | null;
  entitySubprogrammes?: Record<string, string[]>;
  allEntities?: string[];
  comments: MandateComment[];
  decisions: MandateDecision[];
}) {
  const groups = new Map<
    string,
    { entity: string; subprogramme: string | null }
  >();
  const add = (entity: string, subprogramme: string | null) =>
    groups.set(conversationGroupKey(entity, subprogramme), {
      entity,
      subprogramme,
    });
  for (const [ent, programmes] of Object.entries(entitySubprogrammes || {})) {
    for (const programme of programmes) add(ent, programme);
  }
  for (const ent of allEntities || []) {
    if (![...groups.values()].some((g) => g.entity === ent)) add(ent, null);
  }
  for (const event of [...comments, ...decisions])
    add(event.entity, event.subprogramme);
  if (entity) add(entity, subprogramme);
  const current = entity ? conversationGroupKey(entity, subprogramme) : null;
  return [...groups.entries()]
    .sort(([ak, a], [bk, b]) => {
      if (ak === current) return -1;
      if (bk === current) return 1;
      return (
        a.entity.localeCompare(b.entity) ||
        (a.subprogramme || "").localeCompare(b.subprogramme || "")
      );
    })
    .map(([key, group]) => ({
      ...group,
      key,
      comments: comments.filter(
        (c) => conversationGroupKey(c.entity, c.subprogramme) === key,
      ),
      decisions: decisions.filter(
        (d) => conversationGroupKey(d.entity, d.subprogramme) === key,
      ),
    }));
}
