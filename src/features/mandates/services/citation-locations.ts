import type { TableItem } from "./table-view";
import { getEffectiveDecision } from "./decision-tracks";

export interface CitationLocation {
  subprogramme: string | null;
  label: string;
  level: "programme" | "subprogramme" | "background";
  sourceSymbol: string;
  kind: "existing" | "addition" | "replacement";
  /** The source entry was added by a review participant, even if later updated or retained. */
  isAdded: boolean;
}
export type EntityCitationIndex = ReadonlyMap<
  string,
  readonly CitationLocation[]
>;

/** Whitespace aliases only; retain the issuer, year and document type. */
export function citationSymbolKey(symbol: string): string {
  return symbol.replace(/\s/g, "").toUpperCase();
}

export function citationSection(subprogramme: string | null) {
  if (subprogramme === null) {
    return { label: "Mandates and background", level: "background" as const };
  }
  if (/all subprogramme|^legislative mandates$/i.test(subprogramme)) {
    return { label: "Programme level", level: "programme" as const };
  }
  return { label: subprogramme, level: "subprogramme" as const };
}

/** Use the full, unfiltered table for this entity/cycle. Match reviewed export
 * semantics: a current review wins, otherwise use the entity submission. */
export function buildEntityCitationIndex(
  items: readonly TableItem[],
  entity: string,
): EntityCitationIndex {
  const index = new Map<string, CitationLocation[]>();
  for (const item of items) {
    if ((item.entity ?? item.mandate.entity ?? entity) !== entity) continue;
    const decision = getEffectiveDecision(
      item.state?.decisions ?? [],
      "reviewed",
    );
    if (decision?.decision === "remove") continue;
    if (item.mandate.isAdded && (!decision || decision.decision === "cancel"))
      continue;
    const replacement =
      decision?.decision === "update" ? decision.newSymbol : null;
    const symbol = citationSymbolKey(replacement || item.mandate.symbol);
    const location: CitationLocation = {
      subprogramme: item.subprogramme,
      ...citationSection(item.subprogramme),
      sourceSymbol: item.mandate.symbol,
      isAdded: !!item.mandate.isAdded,
      kind: replacement
        ? "replacement"
        : item.mandate.isAdded
          ? "addition"
          : "existing",
    };
    const locations = index.get(symbol) ?? [];
    // Repeated source records in a section are one table citation. Different
    // originals updated to the same symbol remain separate occurrences.
    if (
      !locations.some(
        (other) =>
          other.subprogramme === location.subprogramme &&
          citationSymbolKey(other.sourceSymbol) ===
            citationSymbolKey(location.sourceSymbol),
      )
    )
      locations.push(location);
    index.set(symbol, locations);
  }
  return index;
}

/** Describe the source entry affected by a per-location drop. */
export function getCitationDropDescription(location: CitationLocation): string {
  if (location.isAdded || location.kind === "addition") {
    return location.kind === "replacement"
      ? `Dropping cancels the added citation for ${location.sourceSymbol}, including its proposed replacement.`
      : "Dropping cancels this added citation.";
  }
  return location.kind === "replacement"
    ? `Dropping removes the entire entry for ${location.sourceSymbol} from this section, including its proposed replacement.`
    : "Dropping marks this citation for removal from this section.";
}
