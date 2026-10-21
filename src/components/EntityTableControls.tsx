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
import { ChevronDown, ChevronUp, Filter, Search, X } from "lucide-react";
import { Chip, ChipCount } from "@un-eosg/ui/components/chip";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import type {
  FacetOption,
  TableFacet,
  TableFilters,
  TableSort,
  TableSortColumn,
} from "@/features/mandates/services/table-view";

export interface EntityTableViewControls {
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
            className="h-8 w-full rounded border border-input bg-white pr-2 pl-7 text-sm focus-visible:ring-1 focus-visible:ring-un-blue"
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
          <Chip
            key={option.value}
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
            title={option.label}
            className="whitespace-nowrap"
          >
            {option.label}
            <ChipCount>{option.count}</ChipCount>
          </Chip>
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
              className="mt-1 block h-7 w-20 rounded border border-input bg-white px-2 text-sm"
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
    <div className="flex items-center gap-0.5 text-xs font-medium whitespace-nowrap text-foreground">
      {sortable ? (
        <button
          type="button"
          onClick={() =>
            controls.onSort(column as TableSortColumn, nextDirection)
          }
          aria-label={`Sort ${label} ${nextDirection === "asc" ? "ascending" : "descending"}`}
          className="flex items-center gap-0.5 rounded focus-visible:ring-2 focus-visible:ring-un-blue"
        >
          {label}
          {direction === "asc" ? (
            <ChevronUp className="h-3.5 w-3.5 text-un-blue-text" />
          ) : (
            <ChevronDown
              className={`h-3.5 w-3.5 ${direction ? "text-un-blue-text" : "opacity-40"}`}
            />
          )}
        </button>
      ) : (
        !icon && <span>{label}</span>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Filter by ${label}`}
            title={label}
            className={`flex h-5 w-5 items-center justify-center rounded transition-colors focus-visible:ring-2 focus-visible:ring-un-blue ${active ? "bg-un-blue-text text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
          >
            {icon ?? <Filter className="h-3 w-3" />}
          </button>
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
                className="mt-2 h-8 w-full rounded border border-input bg-white px-2 text-sm"
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
    return <span className="text-xs text-foreground">—</span>;
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
        className="w-72 p-3"
      >
        <p className="mb-2 text-xs font-medium text-foreground">
          Also cited by
        </p>
        <div className="flex max-h-64 flex-wrap gap-1.5 overflow-y-auto">
          {entities.map((entity) => (
            <Chip
              key={entity}
              density="dense"
              tone={
                controls?.filters.others.includes(entity)
                  ? "selected"
                  : "neutral"
              }
              title={entityLongMap[entity] || entity}
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
  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const candidates = sections
          .filter((section) => section.count > 0)
          .map((section) => ({
            id: section.id,
            top:
              document.getElementById(section.id)?.getBoundingClientRect()
                .top ?? Infinity,
          }));
        setActive(
          candidates.filter((candidate) => candidate.top <= 100).at(-1)?.id ??
            candidates[0]?.id ??
            null,
        );
      });
    };
    update();
    window.addEventListener("scroll", update, { passive: true, capture: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update, true);
    };
  }, [sections]);
  return (
    <nav
      aria-label="Subprogramme contents"
      className="mt-4 overflow-x-auto border-t border-border pt-3"
    >
      <ol className="flex w-max min-w-full flex-nowrap items-center gap-4 whitespace-nowrap">
        {sections.map((section) => (
          <li key={section.id} className="shrink-0 text-xs">
            {section.count > 0 ? (
              <a
                href={`#${encodeURIComponent(section.id)}`}
                aria-current={active === section.id ? "location" : undefined}
                className="inline-flex items-baseline gap-1.5 rounded text-foreground underline-offset-4 hover:text-un-blue-text hover:underline focus-visible:ring-2 focus-visible:ring-un-blue aria-[current=location]:font-semibold"
              >
                <span>{section.title}</span>
                <span className="text-muted-foreground tabular-nums">
                  {section.count}
                  {section.count !== section.total ? `/${section.total}` : ""}
                </span>
              </a>
            ) : (
              <span className="text-muted-foreground">
                {section.title}{" "}
                <span className="tabular-nums">0/{section.total}</span>
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
