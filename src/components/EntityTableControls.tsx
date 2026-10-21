"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Filter, X } from "lucide-react";
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

function Options({
  facet,
  label,
  controls,
}: {
  facet: TableFacet;
  label: string;
  controls: EntityTableViewControls;
}) {
  const [search, setSearch] = useState("");
  const options = controls.facets[facet];
  const selected = controls.filters[facet];
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-xs font-semibold text-foreground">
        {label}
      </legend>
      {options.length > 10 && (
        <input
          aria-label={`Search ${label.toLowerCase()} options`}
          placeholder="Search options…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded border border-input bg-white px-2 py-1.5 text-sm"
        />
      )}
      <div className="max-h-52 space-y-1 overflow-y-auto">
        {options
          .filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
          .map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-secondary"
            >
              <input
                type="checkbox"
                checked={selected.includes(option.value)}
                onChange={() =>
                  controls.setFilters({
                    ...controls.filters,
                    [facet]: selected.includes(option.value)
                      ? selected.filter((v) => v !== option.value)
                      : [...selected, option.value],
                  })
                }
                className="accent-un-blue-text"
              />
              <span className="min-w-0 flex-1">{option.label}</span>
              <span className="text-xs tabular-nums">{option.count}</span>
            </label>
          ))}
        {!options.length && <p className="text-sm">No options</p>}
      </div>
      {selected.length > 0 && (
        <button
          type="button"
          onClick={() =>
            controls.setFilters({ ...controls.filters, [facet]: [] })
          }
          className="text-xs text-un-blue-text underline"
        >
          Clear {label.toLowerCase()}
        </button>
      )}
    </fieldset>
  );
}

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

/** Local version of the mandates registry's sortable column/filter popover. */
export function EntityTableColumnHeader({
  column,
  label,
  controls,
}: {
  column: string;
  label: string;
  controls: EntityTableViewControls;
}) {
  const sortable = ["symbol", "title", "body", "year", "others"].includes(
    column,
  );
  const facets = COLUMN_FACETS[column] || [];
  const active =
    facets.reduce((sum, facet) => sum + controls.filters[facet].length, 0) +
    (column === "symbol" && controls.filters.symbol ? 1 : 0) +
    (column === "title" && controls.filters.title ? 1 : 0) +
    (column === "year" && (controls.filters.yearFrom || controls.filters.yearTo)
      ? 1
      : 0);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${label}: sort and filter${active ? `, ${active} active` : ""}`}
          className={`inline-flex items-center gap-1 rounded py-1 text-left text-[10px] font-semibold uppercase focus-visible:ring-2 focus-visible:ring-un-blue ${active ? "text-un-blue-text" : "text-foreground"}`}
        >
          {label}
          {active ? (
            <Filter className="h-3 w-3 shrink-0 fill-current" />
          ) : controls.sort.column === column ? (
            controls.sort.direction === "asc" ? (
              <ChevronUp className="h-3 w-3 shrink-0" />
            ) : (
              <ChevronDown className="h-3 w-3 shrink-0" />
            )
          ) : (
            <ChevronDown className="h-2.5 w-2.5 shrink-0" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="max-h-[70vh] w-72 space-y-4 overflow-y-auto text-foreground"
      >
        <h4 className="text-sm font-semibold">{label}</h4>
        {sortable && (
          <div className="flex gap-2 border-b border-border pb-3">
            {(["asc", "desc"] as const).map((direction) => (
              <button
                type="button"
                key={direction}
                aria-pressed={
                  controls.sort.column === column &&
                  controls.sort.direction === direction
                }
                onClick={() =>
                  controls.onSort(column as TableSortColumn, direction)
                }
                className="rounded border border-input px-2 py-1 text-xs aria-pressed:border-un-blue aria-pressed:bg-un-blue-surface"
              >
                Sort {direction === "asc" ? "ascending" : "descending"}
              </button>
            ))}
          </div>
        )}
        {(column === "symbol" || column === "title") && (
          <label className="block text-sm">
            Contains
            <input
              value={controls.filters[column]}
              onChange={(e) =>
                controls.setFilters({
                  ...controls.filters,
                  [column]: e.target.value,
                })
              }
              className="mt-1 w-full rounded border border-input bg-white px-2 py-1.5"
              placeholder={`Filter ${label.toLowerCase()}…`}
            />
          </label>
        )}
        {column === "year" && (
          <fieldset>
            <legend className="mb-2 text-sm">Year range (inclusive)</legend>
            <div className="flex gap-2">
              {(["yearFrom", "yearTo"] as const).map((field, i) => (
                <label key={field} className="min-w-0 flex-1 text-xs">
                  {i === 0 ? "From" : "To"}
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={9999}
                    value={controls.filters[field]}
                    onChange={(e) =>
                      controls.setFilters({
                        ...controls.filters,
                        [field]: e.target.value.replace(/\D/g, "").slice(0, 4),
                      })
                    }
                    className="mt-1 w-full rounded border border-input bg-white px-2 py-1.5 text-sm"
                  />
                </label>
              ))}
            </div>
            <button
              type="button"
              onClick={() =>
                controls.setFilters({
                  ...controls.filters,
                  yearFrom: "",
                  yearTo: "",
                })
              }
              className="mt-2 text-xs text-un-blue-text underline"
            >
              Clear year range
            </button>
          </fieldset>
        )}
        {facets.map((facet) => (
          <Options
            key={facet}
            facet={facet}
            label={FACET_LABELS[facet]}
            controls={controls}
          />
        ))}
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
      className="rounded-lg border border-border bg-white p-4"
    >
      <h2 className="mb-3 text-sm font-semibold text-foreground">
        On this page
      </h2>
      <ol className="grid gap-x-6 gap-y-2 sm:grid-cols-2 xl:grid-cols-3">
        {sections.map((section) => (
          <li key={section.id} className="min-w-0 text-sm">
            {section.count > 0 ? (
              <a
                href={`#${encodeURIComponent(section.id)}`}
                aria-current={active === section.id ? "location" : undefined}
                className="flex items-baseline justify-between gap-2 rounded text-foreground underline-offset-4 hover:text-un-blue-text hover:underline focus-visible:ring-2 focus-visible:ring-un-blue aria-[current=location]:font-semibold"
              >
                <span>{section.title}</span>
                <span className="shrink-0 text-xs tabular-nums">
                  {section.count}
                  {section.count !== section.total ? ` / ${section.total}` : ""}
                </span>
              </a>
            ) : (
              <span className="flex justify-between gap-2 text-muted-foreground">
                <span>{section.title}</span>
                <span className="shrink-0 text-xs">0 / {section.total}</span>
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
