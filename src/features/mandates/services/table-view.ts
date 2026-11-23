import { buildEntityCitationIndex } from "./citation-locations";
import {
  getMandateWarnings,
  newestVersionWarningSymbols,
} from "./mandate-warnings";
import type { Mandate, MandateState } from "@/types";
import { getDecisionTracks } from "./decision-tracks";
import { getAgeIndicator } from "./age-indicator";

export type TableSortColumn = "symbol" | "title" | "body" | "year" | "others";
export interface TableSort {
  column: TableSortColumn;
  direction: "asc" | "desc";
}
export interface TableFilters {
  search: string;
  symbol: string;
  title: string;
  yearFrom: string;
  yearTo: string;
  bodies: string[];
  types: string[];
  ages: string[];
  others: string[];
  submissions: string[];
  reviews: string[];
  reviewStatus: string[];
  comments: string[];
  notes: string[];
}
export const EMPTY_TABLE_FILTERS: TableFilters = {
  search: "",
  symbol: "",
  title: "",
  yearFrom: "",
  yearTo: "",
  bodies: [],
  types: [],
  ages: [],
  others: [],
  submissions: [],
  reviews: [],
  reviewStatus: [],
  comments: [],
  notes: [],
};
export type TableFacet =
  | "bodies"
  | "types"
  | "ages"
  | "others"
  | "submissions"
  | "reviews"
  | "reviewStatus"
  | "comments"
  | "notes";
export interface FacetOption {
  value: string;
  label: string;
  count: number;
}
export interface TableReplacement {
  symbol: string;
  title?: string | null;
  body?: string | null;
  year?: number | null;
  docType?: string | null;
  link?: string | null;
  source: "submission" | "review" | "both";
  metadataFromDb: boolean;
}
export type ReplacementMetadata = Record<
  string,
  { title: string | null; year: number | null; body: string | null } | null
>;

/** Render and filter the same current proposals; stale reviews remain in history. */
export function getTableReplacements(
  tracks: ReturnType<typeof getDecisionTracks>,
  metadata: ReplacementMetadata,
): TableReplacement[] {
  const replacements = new Map<string, TableReplacement>();
  for (const [source, decision] of [
    ["submission", tracks.submission],
    ["review", tracks.currentReview],
  ] as const) {
    if (decision?.decision !== "update" || !decision.newSymbol) continue;
    const previous = replacements.get(decision.newSymbol);
    replacements.set(decision.newSymbol, {
      ...metadata[decision.newSymbol],
      ...previous,
      symbol: decision.newSymbol,
      ...decision.manualMetadata,
      source: previous ? "both" : source,
      metadataFromDb: !!metadata[decision.newSymbol],
    });
  }
  return [...replacements.values()];
}

export function replacementTableMandate(
  original: Mandate,
  replacement: TableReplacement,
): Mandate {
  return {
    ...original,
    symbol: replacement.symbol,
    title: replacement.title ?? "",
    body: replacement.body ?? null,
    year: replacement.year ?? null,
    docType: replacement.docType ?? null,
    link: replacement.link ?? null,
    metadataFromDb: replacement.metadataFromDb,
    isAdded: false,
  };
}

export const REPLACEMENT_LABELS: Record<TableReplacement["source"], string> = {
  submission: "Submission replacement",
  review: "Reviewer replacement",
  both: "Submission + reviewer replacement",
};

export interface TableItem {
  mandate: Mandate;
  warningIds?: string[];
  subprogramme: string | null;
  entity?: string;
  state?: MandateState;
  tracks?: ReturnType<typeof getDecisionTracks>;
  totalComments: number;
  unreadComments: number;
  /** Current proposals remain grouped with their original citation. */
  replacements: TableReplacement[];
}

export function hasTableFilters(filters: TableFilters) {
  return Object.values(filters).some((value) =>
    Array.isArray(value) ? value.length > 0 : value.trim() !== "",
  );
}

function values(item: TableItem, facet: TableFacet): string[] {
  const { mandate: m, state } = item;
  const tracks = item.tracks ?? getDecisionTracks(state?.decisions || []);
  const submission = tracks.submission;
  const review = tracks.review;
  const submissionValue =
    !submission || submission.decision === "cancel"
      ? "none"
      : submission.decision;
  const reviewValue =
    !review || review.decision === "cancel" ? "none" : review.decision;
  switch (facet) {
    case "bodies":
      return [
        ...new Set([
          m.body || "Unknown",
          ...item.replacements
            .map((r) => r.body)
            .filter((v): v is string => !!v),
        ]),
      ];
    case "types":
      return [
        ...new Set(
          [m, ...item.replacements].map(
            (document) =>
              document.docType ||
              (/\/RES\//i.test(document.symbol)
                ? "Resolution"
                : /\/DEC\//i.test(document.symbol)
                  ? "Decision"
                  : "Unknown"),
          ),
        ),
      ];
    case "ages":
      return [getAgeIndicator(m.year).label];
    case "others":
      return [
        ...new Set(
          m.allEntities.filter(
            (entity) => entity !== item.entity && entity !== m.entity,
          ),
        ),
      ];
    case "submissions":
      return [submissionValue];
    case "reviews":
      return [reviewValue];
    case "reviewStatus": {
      if (!review || review.decision === "cancel") return ["unreviewed"];
      if (tracks.reviewStale) return ["outdated"];
      const same =
        !!submission &&
        submission.decision === review.decision &&
        submission.newSymbol === review.newSymbol;
      return ["reviewed", same ? "agree" : "different"];
    }
    case "comments":
      return [
        item.totalComments ? "has" : "none",
        ...(item.unreadComments ? ["unread"] : []),
      ];
    case "notes": {
      const notes = [
        ...((
          item.warningIds ?? getMandateWarnings(m).map((warning) => warning.id)
        ).length
          ? ["with-notes"]
          : []),
        ...(m.newerVersion ? ["newer"] : []),
        ...(item.replacements.length ? ["replacement"] : []),
        ...(m.isAdded ? ["added"] : []),
      ];
      return notes.length ? notes : ["none"];
    }
  }
}

export function matchesTableItem(
  item: TableItem,
  filters: TableFilters,
  sharedEntity: string | null = null,
  omit?: TableFacet,
): boolean {
  const m = item.mandate;
  if (sharedEntity && !m.allEntities.includes(sharedEntity)) return false;
  const candidates = [m, ...item.replacements];
  const contains = (text: string | null | undefined, query: string) =>
    (text || "").toLowerCase().includes(query.trim().toLowerCase());
  if (
    filters.search.trim() &&
    !candidates.some((c) =>
      contains(`${c.symbol} ${c.title || ""} ${c.body || ""}`, filters.search),
    )
  )
    return false;
  if (
    filters.symbol.trim() &&
    !candidates.some((c) => contains(c.symbol, filters.symbol))
  )
    return false;
  if (
    filters.title.trim() &&
    !candidates.some((c) => contains(c.title, filters.title))
  )
    return false;
  if (
    (filters.yearFrom || filters.yearTo) &&
    !candidates.some(
      (c) =>
        c.year != null &&
        (!filters.yearFrom || c.year >= Number(filters.yearFrom)) &&
        (!filters.yearTo || c.year <= Number(filters.yearTo)),
    )
  )
    return false;
  for (const facet of [
    "bodies",
    "types",
    "ages",
    "others",
    "submissions",
    "reviews",
    "reviewStatus",
    "comments",
    "notes",
  ] as const) {
    if (
      facet !== omit &&
      filters[facet].length &&
      !filters[facet].some((v) => values(item, facet).includes(v))
    )
      return false;
  }
  return true;
}

const LABELS: Record<string, string> = {
  none: "No decision",
  retain: "Retain",
  remove: "Remove",
  update: "Update",
  add: "Add",
  shared: "Cited by other entities",
  only: "Only this entity",
  unreviewed: "Not reviewed",
  outdated: "Submission changed — review needed",
  reviewed: "Reviewed",
  agree: "Decisions agree",
  different: "Decisions differ",
  has: "Has comments",
  unread: "Has unread comments",
  "with-notes": "With notes",
  newer: "Newer version available",
  replacement: "Proposed replacement",
  added: "Added citation",
};
export function tableFacetOptions(
  items: TableItem[],
  filters: TableFilters,
  facet: TableFacet,
  sharedEntity: string | null,
): FacetOption[] {
  const counts = new Map<string, number>();
  // Keep selected options visible even when another filter leaves them with zero matches.
  for (const value of filters[facet]) counts.set(value, 0);
  for (const item of items) {
    for (const value of values(item, facet))
      if (!counts.has(value)) counts.set(value, 0);
    if (matchesTableItem(item, filters, sharedEntity, facet)) {
      for (const value of values(item, facet))
        counts.set(value, (counts.get(value) || 0) + 1);
    }
  }
  return [...counts]
    .map(([value, count]) => ({
      value,
      count,
      label:
        value === "none" && facet === "comments"
          ? "No comments"
          : value === "none" && facet === "reviews"
            ? "Not reviewed"
            : value === "none" && facet === "notes"
              ? "No notes"
              : LABELS[value] || value,
    }))
    .sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { numeric: true }),
    );
}

export function sortTableItems(
  items: TableItem[],
  sort: TableSort,
): TableItem[] {
  const text = (a: string, b: string) =>
    a.localeCompare(b, undefined, { numeric: true });
  return [...items].sort((a, b) => {
    const x = a.mandate,
      y = b.mandate;
    const av = sort.column === "others" ? x.otherEntitiesCount : x[sort.column];
    const bv = sort.column === "others" ? y.otherEntitiesCount : y[sort.column];
    // Missing values stay last in either direction.
    if (av == null || av === "")
      return bv == null || bv === "" ? text(x.symbol, y.symbol) : 1;
    if (bv == null || bv === "") return -1;
    let comparison =
      typeof av === "number" && typeof bv === "number"
        ? av - bv
        : text(String(av), String(bv));
    if (!comparison && sort.column === "title") {
      if (x.year == null && y.year != null) return 1;
      if (y.year == null && x.year != null) return -1;
      comparison = (x.year ?? 0) - (y.year ?? 0);
    } else if (!comparison && sort.column === "year") {
      comparison = text(x.title, y.title);
    }
    return (
      (sort.direction === "asc" ? comparison : -comparison) ||
      text(x.symbol, y.symbol)
    );
  });
}

export interface AddedMetadata {
  title: string | null;
  year: number | null;
  body: string | null;
  docType: string | null;
  link: string | null;
}
export function isVisibleAddedState(state: MandateState) {
  const { submission, currentReview } = getDecisionTracks(state.decisions);
  return (
    state.decisions.some((e) => e.decision === "add") &&
    ((!!submission && submission.decision !== "cancel") || !!currentReview)
  );
}
export function addedTableMandate(
  state: MandateState,
  meta: AddedMetadata | null | undefined,
  entityLong: string | null,
): Mandate | null {
  const { submission, review } = getDecisionTracks(state.decisions);
  if (!isVisibleAddedState(state)) return null;
  const manual =
    submission?.manualMetadata ??
    review?.manualMetadata ??
    [...state.decisions].reverse().find((e) => e.manualMetadata)
      ?.manualMetadata;
  return {
    symbol: state.documentSymbol,
    title: manual?.title ?? meta?.title ?? "",
    link: manual?.link ?? meta?.link ?? null,
    year: manual?.year ?? meta?.year ?? null,
    body: manual?.body ?? meta?.body ?? null,
    docType: meta?.docType ?? null,
    entity: state.entity,
    entityLong,
    isBackground: state.subprogramme === null,
    isAdded: true,
    action: null,
    relevanceCount: 0,
    relevanceIndices: [],
    aiComments: {},
    otherEntitiesCount: 0,
    allEntities: [state.entity],
    entitySubprogrammes: state.subprogramme
      ? { [state.entity]: [state.subprogramme] }
      : {},
    entityLongMap: entityLong ? { [state.entity]: entityLong } : {},
    allEntityRelevance: {},
    metadataFromDb: !!meta,
  };
}

export function sectionAnchor(subprogramme: string | null): string {
  return subprogramme === null
    ? "mandates-background"
    : `mandates-${encodeURIComponent(subprogramme)}`;
}
export function compareSubprogrammes(a: string | null, b: string | null) {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const isAll = (s: string) =>
    /all subprogramme|^legislative mandates$/i.test(s);
  return (
    Number(isAll(b)) - Number(isAll(a)) ||
    a.localeCompare(b, undefined, { numeric: true })
  );
}

/** Entity submissions required for progress; reviewer-only proposals remain optional. */
export function isRequiredSubmission(item: TableItem) {
  const submission = (
    item.tracks ?? getDecisionTracks(item.state?.decisions || [])
  ).submission;
  return (
    item.subprogramme !== null &&
    (!item.mandate.isAdded ||
      (!!submission && submission.decision !== "cancel"))
  );
}
export function hasSubmissionDecision(item: TableItem) {
  const submission = (
    item.tracks ?? getDecisionTracks(item.state?.decisions || [])
  ).submission;
  return (
    !!submission &&
    submission.decision !== "cancel" &&
    (submission.decision !== "update" || !!submission.newSymbol)
  );
}

export function buildEntityTableView({
  entity,
  legislativeMandates,
  backgroundMandates,
  states,
  addedMetadata,
  updateTargetMetadata,
  entityLong,
  counts,
  filters,
  sort,
  sharedEntity,
  showRemaining = false,
}: {
  entity: string;
  legislativeMandates: Record<string, Mandate[]>;
  backgroundMandates: Mandate[];
  states: Record<string, MandateState>;
  addedMetadata: Record<string, AddedMetadata | null>;
  updateTargetMetadata: ReplacementMetadata;
  entityLong: string | null;
  counts: Record<string, { total: number; unread: number }>;
  filters: TableFilters;
  sort: TableSort;
  sharedEntity: string | null;
  showRemaining?: boolean;
}) {
  const tableStates = Object.fromEntries(
    Object.entries(states).map(([key, state]) => {
      const tracks = getDecisionTracks(state.decisions || []);
      return [
        key,
        {
          ...state,
          decision: tracks.submission,
          reviewDecision: tracks.review,
          reviewStale: tracks.reviewStale,
        },
      ];
    }),
  );
  const sourceSections = new Map<string | null, Mandate[]>([
    ...Object.entries(legislativeMandates),
    [null, backgroundMandates],
  ]);
  for (const state of Object.values(tableStates)) {
    const rows = sourceSections.get(state.subprogramme) || [];
    if (rows.some((row) => row.symbol === state.documentSymbol)) continue;
    const added = addedTableMandate(
      state,
      addedMetadata[state.documentSymbol],
      entityLong,
    );
    if (added) sourceSections.set(state.subprogramme, [...rows, added]);
  }
  const tableItems: TableItem[] = [...sourceSections].flatMap(
    ([subprogramme, mandates]) =>
      mandates.map((mandate) => {
        const state = tableStates[`${mandate.symbol}:${subprogramme || ""}`];
        const tracks = getDecisionTracks(state?.decisions || []);
        const replacements = getTableReplacements(tracks, updateTargetMetadata);
        const commentCounts = counts[mandate.symbol];
        return {
          mandate,
          subprogramme,
          entity,
          state,
          tracks,
          replacements,
          totalComments: commentCounts?.total ?? 0,
          unreadComments: commentCounts?.unread ?? 0,
        };
      }),
  );
  const citations = buildEntityCitationIndex(tableItems, entity);
  const newestBySection = new Map(
    [...sourceSections].map(([section, rows]) => [
      section,
      newestVersionWarningSymbols(rows),
    ]),
  );
  for (const item of tableItems) {
    const context = { citations, subprogramme: item.subprogramme };
    const warnings = getMandateWarnings(
      item.mandate,
      undefined,
      newestBySection.get(item.subprogramme)?.has(item.mandate.symbol),
      context,
    );
    for (const replacement of item.replacements) {
      warnings.push(
        ...getMandateWarnings(
          replacementTableMandate(item.mandate, replacement),
          undefined,
          undefined,
          { ...context, sourceSymbol: item.mandate.symbol },
        ).filter((warning) => warning.id === "duplicate-citation"),
      );
    }
    item.warningIds = warnings.map((warning) => warning.id);
  }
  const orderedItems = sortTableItems(tableItems, sort);
  const visibleItems = orderedItems.filter(
    (item) =>
      matchesTableItem(item, filters, sharedEntity) &&
      (!showRemaining ||
        (isRequiredSubmission(item) && !hasSubmissionDecision(item))),
  );
  const sectionViews = [...sourceSections]
    .sort(([a], [b]) => compareSubprogrammes(a, b))
    .filter(([, rows]) => rows.length > 0)
    .map(([subprogramme]) => ({
      subprogramme,
      mandates: orderedItems
        .filter((item) => item.subprogramme === subprogramme)
        .map((item) => item.mandate),
      visibleMandates: visibleItems
        .filter((item) => item.subprogramme === subprogramme)
        .map((item) => item.mandate),
      title:
        subprogramme === null
          ? "Mandates and background"
          : /all subprogramme|^legislative mandates$/i.test(subprogramme)
            ? "Programme level"
            : subprogramme,
      id: sectionAnchor(subprogramme),
    }));

  const facetItems = showRemaining
    ? tableItems.filter(
        (item) => isRequiredSubmission(item) && !hasSubmissionDecision(item),
      )
    : tableItems;
  const facets = Object.fromEntries(
    (
      [
        "bodies",
        "types",
        "ages",
        "others",
        "notes",
        "submissions",
        "reviews",
        "reviewStatus",
        "comments",
      ] as TableFacet[]
    ).map((facet) => [
      facet,
      tableFacetOptions(facetItems, filters, facet, sharedEntity),
    ]),
  ) as Record<TableFacet, FacetOption[]>;
  return {
    tableStates,
    tableItems,
    visibleItems,
    sectionViews,
    facets,
    citationIndex: citations,
  };
}
