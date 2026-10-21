import type { Paragraph } from "@/types";

type Highlight = "action" | "search" | "entity";
interface Span {
  start: number;
  end: number;
  kind: Highlight;
}

export interface ParagraphTextSegment {
  text: string;
  action: boolean;
  search: boolean;
  entity: boolean;
}

/** Partition literal text so overlapping action, search and entity matches coexist. */
export function getParagraphTextSegments(
  paragraph: Pick<Paragraph, "text" | "mandates">,
  searchQuery?: string,
  entity?: string,
  entityLong?: string | null,
): ParagraphTextSegment[] {
  const { text } = paragraph;
  const spans: Span[] = [];
  const addMatches = (value: string | null | undefined, kind: Highlight) => {
    const term = value?.trim();
    if (!term) return;
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(
      kind === "action" ? `\\b${escaped}\\b` : escaped,
      "gi",
    );
    for (const match of text.matchAll(pattern)) {
      spans.push({
        start: match.index,
        end: match.index + match[0].length,
        kind,
      });
      // An annotation identifies the action, not later repetitions of the verb.
      if (kind === "action") break;
    }
  };

  for (const mandate of paragraph.mandates ?? []) {
    addMatches(mandate.action_verb, "action");
  }
  addMatches(searchQuery, "search");
  addMatches(entity, "entity");
  addMatches(entityLong, "entity");

  const boundaries = [
    ...new Set([
      0,
      text.length,
      ...spans.flatMap(({ start, end }) => [start, end]),
    ]),
  ].sort((a, b) => a - b);
  return boundaries.slice(0, -1).map((start, index) => {
    const end = boundaries[index + 1];
    const matches = spans.filter(
      (span) => span.start <= start && span.end >= end,
    );
    return {
      text: text.slice(start, end),
      action: matches.some((span) => span.kind === "action"),
      search: matches.some((span) => span.kind === "search"),
      entity: matches.some((span) => span.kind === "entity"),
    };
  });
}
