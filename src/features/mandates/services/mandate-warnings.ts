/**
 * Centralized mandate warning system
 * Define all warning conditions and messages here for easy maintenance
 */

import type { Mandate, NewerVersion, NewerVersionInfo } from "@/types";
import type { WarningIconType } from "@/components/WarningIcon";
import { safeNewerVersion } from "./documents/series-identity";

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

export interface WarningLocation {
  label: string;
  detail: string;
  /** Present only when this notice can identify an actual saved citation. */
  target?: CitationLocation;
  isCurrent?: boolean;
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
  actionLabel?: string;
  /** Icon to display for this warning */
  icon?: WarningIconType;
  /** Button color scheme */
  colorScheme?: "blue" | "red" | "amber";
  /** Document symbol to display as external link */
  linkedSymbol?: string;
  /** Year of the linked symbol (for diff comparisons) */
  linkedYear?: number;
  locations?: WarningLocation[];
  citationCount?: number;
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
  actionLabel?: string;
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

  const citedKeys = new Set([...citedSymbols].map(citationSymbolKey));
  const citedVersions = newerVersion.allNewer.filter((v) =>
    citedKeys.has(citationSymbolKey(v.symbol)),
  );

  if (citedVersions.length === 0) return null;

  const latestYear = Math.max(...citedVersions.map((version) => version.year));
  const latest = citedVersions.filter((version) => version.year === latestYear);
  return latest.length === 1 ? latest[0] : null;
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
    message: "This citation has no link to the document.",
    severity: "warning",
    condition: (mandate) => !mandate.link,
    actionLabel: "Update with library symbol or manual link",
    getSuggestedUpdate: (mandate) => mandate.symbol,
    action: "update",
    icon: "file",
    colorScheme: "amber",
  },
  {
    id: "newer-available",
    message:
      "The same issuing body published a later document in this series in",
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
    target: location,
    isCurrent:
      location.subprogramme === context.subprogramme &&
      citationSymbolKey(location.sourceSymbol) ===
        citationSymbolKey(context.sourceSymbol ?? ""),
    detail: [
      location.level === "subprogramme"
        ? location.subprogramme === context.subprogramme
          ? "Same subprogramme"
          : "Different subprogramme"
        : null,
      location.kind === "replacement"
        ? `Via update of ${location.isAdded ? "added citation " : ""}${location.sourceSymbol}`
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
  if (context.subprogramme === null) return null;
  const locations = (
    context.citations.get(citationSymbolKey(mandate.symbol)) ?? []
  )
    .filter((location) => location.level !== "background")
    .sort(
      (a, b) =>
        Number(b.level === "programme") - Number(a.level === "programme") ||
        (a.subprogramme ?? "").localeCompare(b.subprogramme ?? "", undefined, {
          numeric: true,
        }) ||
        a.sourceSymbol.localeCompare(b.sourceSymbol, undefined, {
          numeric: true,
        }),
    );
  if (
    !locations.some((location) => ownCitation(location, mandate, context)) ||
    locations.length < 2
  )
    return null;
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
    message: `This document is cited ${locations.length === 2 ? "twice" : `${locations.length} times`} in the legislative mandates.`,
    citationCount: locations.length,
    severity: "info",
    icon: "info",
    colorScheme: "blue",
    locations: warningLocations(locations, {
      ...context,
      sourceSymbol: context.sourceSymbol ?? mandate.symbol,
    }),
    advice:
      atProgrammeLevel && subprogrammes.size
        ? "Consider keeping a single citation at programme level."
        : subprogrammes.size > 1
          ? "Consider moving this citation to programme level instead of repeating it across subprogrammes."
          : undefined,
  };
}

/** Background references are expected; confirm legislative overlap or an actual same-section collision. */
export function getPendingCitationWarning(
  symbol: string,
  subprogramme: string | null,
  citations: EntityCitationIndex,
  sourceSymbol?: string,
): MandateWarning | null {
  const context = { citations, subprogramme, sourceSymbol };
  const others = (citations.get(citationSymbolKey(symbol)) ?? []).filter(
    (location) =>
      (!sourceSymbol || !ownCitation(location, { symbol }, context)) &&
      ((subprogramme !== null && location.level !== "background") ||
        location.subprogramme === subprogramme),
  );
  if (!others.length) return null;
  const levels = [
    ...others,
    { subprogramme, ...citationSection(subprogramme) },
  ];
  const hasProgramme = levels.some(
    (location) => location.level === "programme",
  );
  const subprogrammes = new Set(
    levels
      .filter((location) => location.level === "subprogramme")
      .map((location) => location.subprogramme),
  );
  return {
    id: "duplicate-citation",
    message: "This resolution is already included in this entity.",
    severity: "info",
    icon: "info",
    colorScheme: "blue",
    locations: warningLocations(others, context),
    advice:
      hasProgramme && subprogrammes.size
        ? "Consider keeping a single citation at programme level."
        : subprogrammes.size > 1
          ? "Consider moving this citation to programme level instead of repeating it across subprogrammes."
          : undefined,
  };
}

/** Citation context must come from the selected entity/cycle, before filters. */
export function getMandateWarnings(
  mandate: Mandate,
  allSymbols?: Set<string>,
  isNewestWithNewerVersion?: boolean,
  context?: CitationWarningContext,
): MandateWarning[] {
  mandate = {
    ...mandate,
    newerVersion: safeNewerVersion(mandate.symbol, mandate.newerVersion),
  };
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
      message: "Your entity already cites a later document in this series from",
      advice:
        "Compare the documents to decide whether both citations are needed.",
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
      actionLabel: def.actionLabel,
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
  mandate = {
    ...mandate,
    newerVersion: safeNewerVersion(mandate.symbol, mandate.newerVersion),
  };
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

/** Keep table notes and their shortcut grounded in the same warning rules. */
export function getWarningSummary(
  warning: Pick<MandateWarning, "id" | "citationCount">,
): string {
  if (warning.id === "duplicate-citation" && warning.citationCount) {
    return warning.citationCount === 2
      ? "Cited twice"
      : `Cited ${warning.citationCount}x`;
  }
  const labels: Record<string, string> = {
    "duplicate-citation": "Also cited elsewhere",
    "newer-already-cited": "Later document cited",
    "newer-available": "Possible update",
    "no-metadata": "Check symbol",
    "missing-link": "Missing link",
  };
  return labels[warning.id] || "Citation note";
}

export function newestVersionWarningSymbols(mandates: Mandate[]): Set<string> {
  const groups = new Map<string, Mandate>();
  for (const mandate of mandates) {
    const symbol = safeNewerVersion(
      mandate.symbol,
      mandate.newerVersion,
    )?.symbol;
    if (!symbol) continue;
    const key = citationSymbolKey(symbol);
    const previous = groups.get(key);
    if (!previous || (mandate.year ?? 0) > (previous.year ?? 0))
      groups.set(key, mandate);
  }
  return new Set([...groups.values()].map((mandate) => mandate.symbol));
}
