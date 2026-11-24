"use client";

// Adapted from mandates/website/src/components/table/ColumnHeaderFilter.tsx.
// Keep its separate sort/funnel controls, searchable pill choices and year range.
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChevronDown, ChevronUp, Filter, Search, Users, X } from "lucide-react";
import { Chip, ChipCount } from "@un-eosg/ui/components/chip";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Button } from "@un-eosg/ui/components/button";
import { POPUP_STYLES } from "@/lib/theme";
import type {
  FacetOption,
  TableFacet,
  TableFilters,
  TableSort,
  TableSortColumn,
} from "@/features/mandates/services/table-view";
import { Tooltip } from "@/components/Tooltip";

export const ENTITY_TOOLBAR_CONTROL =
  "h-9 rounded-md border-input bg-white px-3 text-sm font-medium text-foreground shadow-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-un-blue";

export interface EntityTableViewControls {
  showReviewerColumn: boolean;
  submissionLabel: string;
  filters: TableFilters;
  setFilters: (next: TableFilters) => void;
  sort: TableSort;
  onSort: (column: TableSortColumn, direction?: "asc" | "desc") => void;
  facets: Record<TableFacet, FacetOption[]>;
}
export const EntityTableFilterContext =
  createContext<EntityTableViewControls | null>(null);

const COLUMN_FACETS: Record<string, TableFacet[]> = {
  body: ["bodies", "types"],
  bodyFilter: ["bodies", "types"],
  year: ["ages"],
  age: ["ages"],
  others: ["others"],
  notes: ["notes"],
  submissions: ["submissions"],
  reviews: ["reviews", "reviewStatus"],
  comments: ["comments"],
};
const FACET_LABELS: Record<TableFacet, string> = {
  bodies: "Body",
  types: "Document type",
  ages: "Age",
  others: "Other entities",
  notes: "Notes",
  submissions: "Entity submission",
  reviews: "Review decision",
  reviewStatus: "Review status",
  comments: "Comments",
};

function PillFilter({
  facet,
  controls,
}: {
  facet: TableFacet;
  controls: EntityTableViewControls;
}) {
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const options = controls.facets[facet];
  const selected = controls.filters[facet];
  const filtered = options.filter((option) =>
    option.label.toLowerCase().includes(search.toLowerCase()),
  );
  const displayed = !showAll && !search ? filtered.slice(0, 20) : filtered;
  return (
    <fieldset className="w-64 space-y-3">
      <legend className="mb-2 text-xs font-semibold">
        {FACET_LABELS[facet]}
      </legend>
      {options.length > 8 && (
        <div className="relative">
          <Search className="absolute top-2 left-2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            aria-label={`Search ${FACET_LABELS[facet].toLowerCase()}`}
            placeholder={`Search ${FACET_LABELS[facet].toLowerCase()}…`}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-8 w-full rounded border border-input bg-white pr-2 pl-7 text-sm text-foreground placeholder:text-gray-600 focus-visible:ring-1 focus-visible:ring-un-blue"
          />
        </div>
      )}
      {selected.length > 0 && (
        <button
          type="button"
          onClick={() =>
            controls.setFilters({ ...controls.filters, [facet]: [] })
          }
          className="flex items-center gap-1 text-sm text-foreground"
        >
          <X className="h-3 w-3" />
          Clear filter
        </button>
      )}
      <div className="flex max-h-64 flex-wrap gap-1.5 overflow-y-auto">
        {displayed.map((option) => (
          <Tooltip asChild content={option.label} key={option.value}>
            <Chip
              density="dense"
              tone={selected.includes(option.value) ? "selected" : "neutral"}
              onClick={() =>
                controls.setFilters({
                  ...controls.filters,
                  [facet]: selected.includes(option.value)
                    ? selected.filter((value) => value !== option.value)
                    : [...selected, option.value],
                })
              }
              className="whitespace-nowrap"
            >
              {option.label}
              <ChipCount>{option.count}</ChipCount>
            </Chip>
          </Tooltip>
        ))}
        {!displayed.length && <p className="py-2 text-sm">No options found</p>}
      </div>
      {!showAll && !search && filtered.length > 20 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="text-sm text-un-blue-text"
        >
          Show {filtered.length - 20} more…
        </button>
      )}
    </fieldset>
  );
}

function YearRangeFilter({
  controls,
  onDone,
}: {
  controls: EntityTableViewControls;
  onDone: () => void;
}) {
  const [from, setFrom] = useState(controls.filters.yearFrom);
  const [to, setTo] = useState(controls.filters.yearTo);
  const apply = () => {
    controls.setFilters({ ...controls.filters, yearFrom: from, yearTo: to });
    onDone();
  };
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold">Year range</p>
      <div className="flex items-end gap-2">
        {(["From", "To"] as const).map((label, index) => (
          <label key={label} className="text-xs">
            {label}
            <input
              inputMode="numeric"
              pattern="[0-9]*"
              aria-label={`${label} year`}
              placeholder={index ? "Latest" : "Earliest"}
              value={index ? to : from}
              onChange={(event) =>
                (index ? setTo : setFrom)(
                  event.target.value.replace(/\D/g, "").slice(0, 4),
                )
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") apply();
              }}
              className="mt-1 block h-7 w-20 rounded border border-input bg-white px-2 text-sm placeholder:text-gray-600"
            />
          </label>
        ))}
        <button
          type="button"
          onClick={apply}
          className="h-7 rounded px-2 text-sm hover:bg-secondary"
        >
          Apply
        </button>
      </div>
      <button
        type="button"
        onClick={() => {
          controls.setFilters({
            ...controls.filters,
            yearFrom: "",
            yearTo: "",
          });
          onDone();
        }}
        className="flex items-center gap-1 text-sm"
      >
        <X className="h-3 w-3" />
        Clear filter
      </button>
    </div>
  );
}

export function EntityTableColumnHeader({
  column,
  label,
  icon,
  controls,
}: {
  column: string;
  label: string;
  icon?: ReactNode;
  controls: EntityTableViewControls;
}) {
  const [open, setOpen] = useState(false);
  const compact = column === "others";
  const sortable = ["symbol", "title", "body", "year", "others"].includes(
    column,
  );
  const facets = COLUMN_FACETS[column] || [];
  const active =
    facets.some((facet) => controls.filters[facet].length > 0) ||
    (column === "symbol" && !!controls.filters.symbol) ||
    (column === "title" && !!controls.filters.title) ||
    (column === "year" &&
      !!(controls.filters.yearFrom || controls.filters.yearTo));
  const direction =
    controls.sort.column === column ? controls.sort.direction : null;
  const nextDirection = direction === "desc" ? "asc" : "desc";
  return (
    <div className="flex min-w-0 items-center gap-0.5 text-xs font-semibold whitespace-nowrap text-foreground">
      {sortable ? (
        <Tooltip
          asChild
          content={
            compact
              ? `Also cited by — sort ${nextDirection === "asc" ? "ascending" : "descending"}`
              : undefined
          }
        >
          <button
            type="button"
            onClick={() =>
              controls.onSort(column as TableSortColumn, nextDirection)
            }
            aria-label={`Sort ${label} ${nextDirection === "asc" ? "ascending" : "descending"}`}
            className="flex items-center gap-0.5 rounded focus-visible:ring-2 focus-visible:ring-un-blue"
          >
            {compact ? (
              <>
                <Users className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only">{label}</span>
              </>
            ) : (
              label
            )}
            {direction === "asc" ? (
              <ChevronUp className="h-3.5 w-3.5 text-un-blue-text" />
            ) : (
              <ChevronDown
                className={`h-3.5 w-3.5 ${direction ? "text-un-blue-text" : "text-foreground/70"}`}
              />
            )}
          </button>
        </Tooltip>
      ) : (
        !icon && <span>{label}</span>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Tooltip asChild content={`Filter by ${label}`}>
            <button
              type="button"
              aria-label={`Filter by ${label}`}
              className={`flex h-5 w-5 items-center justify-center rounded transition-colors focus-visible:ring-2 focus-visible:ring-un-blue ${active ? "bg-un-blue-text text-white" : "text-foreground/75 hover:bg-muted hover:text-foreground"}`}
            >
              {icon ?? <Filter className="h-3 w-3" />}
            </button>
          </Tooltip>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={4}
          className="max-h-[70vh] w-auto space-y-4 overflow-y-auto p-3 text-foreground"
        >
          {(column === "symbol" || column === "title") && (
            <label className="block w-64 text-sm">
              {label}
              <input
                aria-label={`Filter ${label.toLowerCase()}`}
                value={controls.filters[column]}
                onChange={(event) =>
                  controls.setFilters({
                    ...controls.filters,
                    [column]: event.target.value,
                  })
                }
                placeholder={`Search ${label.toLowerCase()}…`}
                className="mt-2 h-8 w-full rounded border border-input bg-white px-2 text-sm placeholder:text-gray-600"
              />
            </label>
          )}
          {column === "year" && (
            <YearRangeFilter
              controls={controls}
              onDone={() => setOpen(false)}
            />
          )}
          {facets.map((facet) => (
            <PillFilter key={facet} facet={facet} controls={controls} />
          ))}
        </PopoverContent>
      </Popover>
    </div>
  );
}

/** Body and type remain available when the table uses body group headings. */
export function BodyTypeFilter({
  controls,
}: {
  controls: EntityTableViewControls;
}) {
  const active =
    controls.filters.bodies.length > 0 || controls.filters.types.length > 0;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-label="Filter by body or document type"
          className={`${ENTITY_TOOLBAR_CONTROL} ${active ? "border-un-blue-text bg-un-blue-surface text-un-blue-text" : ""}`}
        >
          Body / document type
          <Filter className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="max-h-[70vh] w-auto space-y-4 overflow-y-auto p-3 text-foreground"
      >
        <PillFilter facet="bodies" controls={controls} />
        <PillFilter facet="types" controls={controls} />
      </PopoverContent>
    </Popover>
  );
}

/** Entity badges in a hover/focus card; each refines the same Others column. */
export function OtherEntitiesCell({
  entities,
  entityLongMap,
  symbol,
}: {
  entities: string[];
  entityLongMap: Record<string, string>;
  symbol: string;
}) {
  const controls = useContext(EntityTableFilterContext);
  const [open, setOpen] = useState(false);
  const openedByPointer = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enter = () => {
    if (timer.current) clearTimeout(timer.current);
    setOpen(true);
  };
  const leave = () => {
    timer.current = setTimeout(() => setOpen(false), 150);
  };
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  if (!entities.length)
    return (
      <Tooltip asChild content={"No other entities cite this document"}>
        <span className="text-xs text-foreground">0</span>
      </Tooltip>
    );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${entities.length} other entities cite ${symbol}`}
          onMouseEnter={() => {
            openedByPointer.current = true;
            enter();
          }}
          onMouseLeave={leave}
          onFocus={() => {
            openedByPointer.current = false;
            enter();
          }}
          onBlur={leave}
          onClick={(event) => {
            event.stopPropagation();
            event.preventDefault();
            openedByPointer.current = false;
            enter();
          }}
          className="w-fit rounded text-xs text-foreground tabular-nums underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-un-blue"
        >
          +{entities.length}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        onOpenAutoFocus={(event) => {
          if (openedByPointer.current) event.preventDefault();
        }}
        onCloseAutoFocus={(event) => {
          if (openedByPointer.current) event.preventDefault();
        }}
        onMouseEnter={enter}
        onMouseLeave={leave}
        onFocusCapture={enter}
        onBlurCapture={leave}
        onClick={(event) => event.stopPropagation()}
        className={`${POPUP_STYLES.tooltipSize} p-3`}
      >
        <p className="mb-2 text-xs font-medium text-foreground">
          Also cited by
        </p>
        <div className="flex max-h-64 flex-wrap gap-1.5 overflow-y-auto">
          {entities.map((entity) => (
            <Tooltip
              asChild
              content={entityLongMap[entity] || entity}
              key={entity}
            >
              <Chip
                density="dense"
                tone={
                  controls?.filters.others.includes(entity)
                    ? "selected"
                    : "neutral"
                }
                onClick={
                  controls
                    ? () =>
                        controls.setFilters({
                          ...controls.filters,
                          others: controls.filters.others.includes(entity)
                            ? controls.filters.others.filter(
                                (value) => value !== entity,
                              )
                            : [...controls.filters.others, entity],
                        })
                    : undefined
                }
              >
                {entity}
              </Chip>
            </Tooltip>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function ActiveTableFilters({
  controls,
  onClearAll,
  sharedEntity,
}: {
  controls: EntityTableViewControls;
  onClearAll: () => void;
  sharedEntity: string | null;
}) {
  const { filters, setFilters, facets } = controls;
  const chips: { key: string; label: string; clear: () => void }[] = [];
  for (const field of ["search", "symbol", "title"] as const)
    if (filters[field].trim())
      chips.push({
        key: field,
        label: `${field}: ${filters[field]}`,
        clear: () => setFilters({ ...filters, [field]: "" }),
      });
  if (filters.yearFrom || filters.yearTo)
    chips.push({
      key: "years",
      label: `Year: ${filters.yearFrom || "any"}–${filters.yearTo || "any"}`,
      clear: () => setFilters({ ...filters, yearFrom: "", yearTo: "" }),
    });
  for (const facet of Object.keys(FACET_LABELS) as TableFacet[])
    for (const value of filters[facet])
      chips.push({
        key: `${facet}:${value}`,
        label: `${FACET_LABELS[facet]}: ${facets[facet].find((o) => o.value === value)?.label || value}`,
        clear: () =>
          setFilters({
            ...filters,
            [facet]: filters[facet].filter((v) => v !== value),
          }),
      });
  if (!chips.length && !sharedEntity) return null;
  return (
    <div
      aria-label="Active filters"
      className="flex flex-wrap items-center gap-2"
    >
      {chips.map((chip) => (
        <button
          type="button"
          key={chip.key}
          onClick={chip.clear}
          className="inline-flex items-center gap-1 rounded-full border border-un-blue/30 bg-un-blue-surface px-2 py-1 text-xs text-foreground"
          aria-label={`Remove ${chip.label} filter`}
        >
          {chip.label}
          <X className="h-3 w-3" />
        </button>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        className="text-xs text-un-blue-text underline"
      >
        Clear all filters{sharedEntity ? ` (including ${sharedEntity})` : ""}
      </button>
    </div>
  );
}

export function SubprogrammeContents({
  sections,
}: {
  sections: { id: string; title: string; count: number; total: number }[];
}) {
  const [active, setActive] = useState<string | null>(null);
  const handledHash = useRef<string | null>(null);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const headerHeight =
          parseFloat(
            getComputedStyle(document.documentElement).scrollPaddingTop,
          ) || 0;
        const stickyOffset =
          headerHeight +
          (window.matchMedia("(min-width: 1024px)").matches ? 40 : 8);
        const candidates = sections
          .filter((section) => section.count > 0)
          .map((section) => ({
            id: section.id,
            top:
              document.getElementById(section.id)?.getBoundingClientRect()
                .top ?? Infinity,
          }));
        const atPageEnd =
          window.scrollY + window.innerHeight >=
          document.documentElement.scrollHeight - 2;
        setActive(
          atPageEnd
            ? (candidates.at(-1)?.id ?? null)
            : (candidates
                .filter((candidate) => candidate.top <= stickyOffset + 4)
                .at(-1)?.id ??
                candidates[0]?.id ??
                null),
        );
      });
    };
    const restoreHash = () => {
      const hash = window.location.hash;
      if (!hash || hash === handledHash.current) return;
      let id: string;
      try {
        id = decodeURIComponent(hash.slice(1));
      } catch {
        return;
      }
      const section = sections.find(
        (section) => section.id === id && section.count > 0,
      );
      const node = section ? document.getElementById(section.id) : null;
      if (!node) return;
      handledHash.current = hash;
      node.scrollIntoView({ block: "start" });
      setActive(id);
    };
    restoreHash();
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });
    window.addEventListener("hashchange", restoreHash);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("hashchange", restoreHash);
    };
  }, [sections]);

  return (
    <nav aria-label="Programme sections">
      <h2 className="mb-2 text-base font-semibold text-foreground">Sections</h2>
      <ul className="list-disc space-y-0.5 ps-5 text-sm leading-5 text-foreground">
        {sections.map((section) => (
          <li key={section.id}>
            {section.count > 0 ? (
              <a
                href={`#${encodeURIComponent(section.id)}`}
                onClick={(event) => {
                  if (
                    event.button !== 0 ||
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey
                  )
                    return;
                  const node = document.getElementById(section.id);
                  if (!node) return;
                  event.preventDefault();
                  const hash = `#${encodeURIComponent(section.id)}`;
                  if (window.location.hash !== hash)
                    window.history.pushState(null, "", hash);
                  handledHash.current = hash;
                  node.scrollIntoView({ block: "start" });
                  node.focus({ preventScroll: true });
                  setActive(section.id);
                }}
                aria-current={active === section.id ? "location" : undefined}
                className="rounded text-foreground underline-offset-4 hover:text-un-blue-text hover:underline focus-visible:ring-2 focus-visible:ring-un-blue focus-visible:ring-offset-2 aria-[current=location]:font-medium"
              >
                {section.title}{" "}
                <span className="tabular-nums">
                  ({section.count}
                  {section.count !== section.total ? ` / ${section.total}` : ""}
                  )
                </span>
              </a>
            ) : (
              <span className="text-foreground">
                {section.title}{" "}
                <span className="tabular-nums">(0 / {section.total})</span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
