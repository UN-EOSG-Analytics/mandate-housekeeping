/**
 * Centralized mandate warning system
 * Define all warning conditions and messages here for easy maintenance
 */

import type { Mandate, NewerVersion, NewerVersionInfo } from "@/types";
import type { WarningIconType } from "@/components/WarningIcon";

import {
  citationSection,
  citationSymbolKey,
  type CitationLocation,
  type EntityCitationIndex,
} from "./citation-locations";

export interface CitationWarningContext {
  citations: EntityCitationIndex;
  subprogramme: string | null;
  /** Original row when displaying an update replacement. */
  sourceSymbol?: string;
}

export interface MandateWarning {
  id: string;
  message: string;
  /** Optional suffix to display after linkedSymbol */
  messageSuffix?: string;
  severity: "error" | "warning" | "info";
  /** For update warnings: the symbol to pre-select for update */
  suggestedUpdate?: string;
  /** Action type: 'update' (opens search) or 'remove' (direct action) */
  action?: "update" | "remove";
  /** Icon to display for this warning */
  icon?: WarningIconType;
  /** Button color scheme */
  colorScheme?: "blue" | "red" | "amber";
  /** Document symbol to display as external link */
  linkedSymbol?: string;
  /** Year of the linked symbol (for diff comparisons) */
  linkedYear?: number;
  locations?: { label: string; detail: string }[];
  advice?: string;
}

interface WarningDefinition {
  id: string;
  message: string | ((mandate: Mandate) => string);
  severity: "error" | "warning" | "info";
  condition: (mandate: Mandate) => boolean;
  /** Extract suggested update symbol from mandate */
  getSuggestedUpdate?: (mandate: Mandate) => string | undefined;
  /** Action type for this warning */
  action?: "update" | "remove";
  /** Icon to display */
  icon?: WarningIconType;
  /** Button color scheme */
  colorScheme?: "blue" | "red" | "amber";
  /** Extract symbol to display as external link */
  getLinkedSymbol?: (mandate: Mandate) => string | undefined;
  /** Extract year of linked symbol */
  getLinkedYear?: (mandate: Mandate) => number | undefined;
}

/**
 * Find the newest version among those that are already cited
 * @param newerVersion The newer version info for a mandate
 * @param citedSymbols Set of all symbols currently cited in the entity
 * @returns The newest cited version info, or null if none are cited
 */
export function findNewestCitedVersion(
  newerVersion: NewerVersion | undefined,
  citedSymbols: Set<string> | undefined,
): NewerVersionInfo | null {
  if (!newerVersion?.allNewer || !citedSymbols) return null;

  const citedVersions = newerVersion.allNewer.filter((v) =>
    citedSymbols.has(v.symbol),
  );

  if (citedVersions.length === 0) return null;

  return citedVersions.reduce((newest, v) =>
    v.year > newest.year ? v : newest,
  );
}

/**
 * All warning definitions
 * Add new warnings here with their conditions
 */
const WARNING_DEFINITIONS: WarningDefinition[] = [
  {
    id: "no-metadata",
    message:
      "Document symbol not found in UN Library metadata – data may be incomplete or symbol may be incorrect. Consider updating with the correct symbol.",
    severity: "warning",
    condition: (mandate) => mandate.metadataFromDb === false,
    getSuggestedUpdate: (mandate) => mandate.symbol,
    action: "update",
    icon: "file-question",
    colorScheme: "amber",
  },
  {
    id: "missing-link",
    message:
      "This citation is missing a link to the document's fulltext – please consider updating with the correct document symbol or manually add again with the fulltext link included.",
    severity: "warning",
    condition: (mandate) => !mandate.link,
    getSuggestedUpdate: (mandate) => mandate.symbol,
    action: "update",
    icon: "file",
    colorScheme: "amber",
  },
  {
    id: "newer-available",
    message: "Newer version available from",
    severity: "info",
    condition: (mandate) => !!mandate.newerVersion,
    getSuggestedUpdate: (mandate) => mandate.newerVersion?.symbol,
    getLinkedSymbol: (mandate) => mandate.newerVersion?.symbol,
    getLinkedYear: (mandate) => mandate.newerVersion?.year,
    action: "update",
    icon: "arrow-up",
    colorScheme: "blue",
  },
];

function ownCitation(
  location: CitationLocation,
  mandate: Pick<Mandate, "symbol">,
  context: CitationWarningContext,
) {
  return (
    location.subprogramme === context.subprogramme &&
    citationSymbolKey(location.sourceSymbol) ===
      citationSymbolKey(context.sourceSymbol ?? mandate.symbol)
  );
}

function warningLocations(
  locations: readonly CitationLocation[],
  context: CitationWarningContext,
) {
  return locations.map((location) => ({
    label: location.label,
    detail: [
      location.level === "subprogramme"
        ? location.subprogramme === context.subprogramme
          ? "Same subprogramme"
          : "Different subprogramme"
        : null,
      location.kind === "replacement"
        ? `Via update of ${location.sourceSymbol}`
        : location.kind === "addition"
          ? "Added citation"
          : "Existing citation",
    ]
      .filter(Boolean)
      .join(" · "),
  }));
}

function duplicateWarning(
  mandate: Pick<Mandate, "symbol" | "isAdded">,
  context: CitationWarningContext,
): MandateWarning | null {
  // Background references coexist with legislative citations by design.
  if (citationSection(context.subprogramme).level === "background") return null;
  const locations = (
    context.citations.get(citationSymbolKey(mandate.symbol)) ?? []
  ).filter((location) => location.level !== "background");
  if (!locations.some((location) => ownCitation(location, mandate, context)))
    return null;
  const others = locations.filter(
    (location) => !ownCitation(location, mandate, context),
  );
  if (!others.length) return null;
  const atProgrammeLevel = locations.some(
    (location) => location.level === "programme",
  );
  const subprogrammes = new Set(
    locations
      .filter((location) => location.level === "subprogramme")
      .map((location) => location.subprogramme),
  );
  return {
    id: "duplicate-citation",
    message: mandate.isAdded
      ? "This added resolution is already included in this entity."
      : "This resolution is cited more than once in this entity.",
    severity: "info",
    icon: "info",
    colorScheme: "blue",
    locations: warningLocations(others, context),
    advice:
      atProgrammeLevel && subprogrammes.size
        ? "Consider keeping a single citation at programme level."
        : subprogrammes.size > 1
          ? "Consider moving this citation to programme level instead of repeating it across subprogrammes."
          : undefined,
  };
}

/** Preview the same duplicate notice before an addition/replacement is saved. */
export function getPendingCitationWarning(
  symbol: string,
  subprogramme: string | null,
  citations: EntityCitationIndex,
  sourceSymbol?: string,
): MandateWarning | null {
  const key = citationSymbolKey(symbol);
  const projected = new Map(citations);
  const current: CitationLocation = {
    subprogramme,
    ...citationSection(subprogramme),
    sourceSymbol: sourceSymbol ?? symbol,
    kind: sourceSymbol ? "replacement" : "addition",
  };
  const existing = citations.get(key) ?? [];
  projected.set(key, [...existing, current]);
  return duplicateWarning(
    { symbol, isAdded: !sourceSymbol },
    {
      citations: projected,
      subprogramme,
      sourceSymbol,
    },
  );
}

/** Citation context must come from the selected entity/cycle, before filters. */
export function getMandateWarnings(
  mandate: Mandate,
  allSymbols?: Set<string>,
  isNewestWithNewerVersion?: boolean,
  context?: CitationWarningContext,
): MandateWarning[] {
  const citedSymbols = context
    ? new Set(
        (mandate.newerVersion?.allNewer ?? [])
          .filter((version) =>
            context.citations
              .get(citationSymbolKey(version.symbol))
              ?.some((location) => !ownCitation(location, mandate, context)),
          )
          .map((version) => version.symbol),
      )
    : allSymbols;
  const citedNewer = findNewestCitedVersion(mandate.newerVersion, citedSymbols);
  const warnings: MandateWarning[] = [];
  const duplicate = context ? duplicateWarning(mandate, context) : null;
  if (duplicate) warnings.push(duplicate);
  if (citedNewer) {
    const locations = context
      ? (
          context.citations.get(citationSymbolKey(citedNewer.symbol)) ?? []
        ).filter((location) => !ownCitation(location, mandate, context))
      : [];
    warnings.push({
      id: "newer-already-cited",
      message: "Newer version from",
      messageSuffix: "already cited:",
      severity: "warning",
      linkedSymbol: citedNewer.symbol,
      linkedYear: citedNewer.year,
      action: "remove",
      icon: "x",
      colorScheme: "red",
      locations: context ? warningLocations(locations, context) : undefined,
    });
  }
  return [
    ...warnings,
    ...WARNING_DEFINITIONS.filter(
      (def) =>
        def.condition(mandate) &&
        (def.id !== "newer-available" ||
          (!citedNewer && isNewestWithNewerVersion !== false)),
    ).map((def) => ({
      id: def.id,
      message:
        typeof def.message === "function" ? def.message(mandate) : def.message,
      severity: def.severity,
      suggestedUpdate: def.getSuggestedUpdate?.(mandate),
      action: def.action,
      icon: def.icon,
      colorScheme: def.colorScheme,
      linkedSymbol: def.getLinkedSymbol?.(mandate),
      linkedYear: def.getLinkedYear?.(mandate),
    })),
  ];
}

/**
 * Check if a mandate has any warnings
 */
export function hasWarnings(mandate: Mandate): boolean {
  return WARNING_DEFINITIONS.some((def) => def.condition(mandate));
}

/**
 * Get warning icon based on severity
 */
export function getWarningIcon(
  severity: MandateWarning["severity"],
): WarningIconType {
  switch (severity) {
    case "error":
      return "x-circle";
    case "warning":
      return "alert";
    case "info":
      return "info";
  }
}

/**
 * Get warning color class based on severity
 */
export function getWarningColorClass(
  severity: MandateWarning["severity"],
): string {
  switch (severity) {
    case "error":
      return "text-red-500";
    case "warning":
      return "text-amber-500";
    case "info":
      return "text-blue-500";
  }
}
