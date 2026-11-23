"use client";

import type {
  EntityOverviewSummary,
  PartOverviewSummary,
} from "@/types/overview";
import { Building2, ChevronRight, Layers, Search, X } from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";
import { typography } from "@un-eosg/ui/typography";
import { Button } from "@un-eosg/ui/components/button";
import { Chip } from "@un-eosg/ui/components/chip";
import { cn } from "@/lib/utils";
import { ExportDropdown } from "./ExportDropdown";
import { SubmissionCycleDropdown } from "@/features/mandates/ui/SubmissionCycleDropdown";
import { SUBMISSION_CYCLES, type BudgetVersion } from "@/lib/db/budget-version";
import { Tooltip } from "@/components/Tooltip";

interface Props {
  parts: PartOverviewSummary[];
  userEntity?: string | null;
  budgetVersion: BudgetVersion;
}

function EntityCard({
  entityData,
  highlight,
  workspaceYear,
}: {
  entityData: EntityOverviewSummary;
  highlight?: boolean;
  workspaceYear?: number;
}) {
  const mandateCount = entityData.mandateCount;

  return (
    <Tooltip asChild content={entityData.entityLong || entityData.entity}>
      <Link
        href={`/entity/${encodeURIComponent(entityData.entity)}`}
        className={cn(
          "group flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 transition-colors hover:bg-un-blue-surface focus-visible:ring-2 focus-visible:ring-un-blue focus-visible:ring-offset-2",
          highlight
            ? "border-un-blue-text/30 bg-un-blue-surface"
            : "border-border bg-gray-50",
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                typography.body,
                "truncate font-medium text-foreground",
              )}
            >
              {entityData.entity}
            </span>
            <span
              className={cn(
                typography.label,
                "shrink-0 text-foreground tabular-nums",
              )}
            >
              {mandateCount} citation{mandateCount !== 1 ? "s" : ""}
            </span>
          </div>
          {entityData.entityLong && (
            <div className={cn(typography.caption, "truncate text-foreground")}>
              {entityData.entityLong}
            </div>
          )}
          {workspaceYear && (
            <p className={cn(typography.label, "mt-2 text-un-blue-text-aaa")}>
              Open PPB {workspaceYear} workspace
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ChevronRight className="h-4 w-4 text-un-blue-text-aaa" />
        </div>
      </Link>
    </Tooltip>
  );
}

export function EntityOverview({ parts, userEntity, budgetVersion }: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [showSections, setShowSections] = useState(false);

  // Read from localStorage after hydration (deferred to avoid SSR mismatch)
  useEffect(() => {
    const saved = localStorage.getItem("showSections");
    if (saved === "true") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowSections(true);
    }
  }, []);

  // Save to localStorage when value changes
  useEffect(() => {
    localStorage.setItem("showSections", String(showSections));
  }, [showSections]);

  // Find user's entity data
  const myEntityData = userEntity
    ? parts.flatMap((p) => p.entities).find((e) => e.entity === userEntity)
    : null;

  // Filter parts based on search query
  const filteredParts = searchQuery.trim()
    ? parts
        .map((partData) => ({
          ...partData,
          entities: partData.entities.filter(
            (e) =>
              e.entity.toLowerCase().includes(searchQuery.toLowerCase()) ||
              e.entityLong?.toLowerCase().includes(searchQuery.toLowerCase()),
          ),
        }))
        .filter((partData) => partData.entities.length > 0)
    : parts;

  const totalMatchingEntities = filteredParts.reduce(
    (sum, part) => sum + part.entities.length,
    0,
  );

  // Group entities by section within each part
  const groupEntitiesBySection = (entities: EntityOverviewSummary[]) => {
    const grouped: Record<
      string,
      { title: string | null; entities: EntityOverviewSummary[] }
    > = {};
    for (const entity of entities) {
      const key = entity.section || "_none";
      if (!grouped[key]) {
        grouped[key] = { title: entity.sectionTitle, entities: [] };
      }
      grouped[key].entities.push(entity);
    }
    // Sort sections by section number, _none at end
    return Object.entries(grouped).sort(([a], [b]) => {
      if (a === "_none") return 1;
      if (b === "_none") return -1;
      return a.localeCompare(b, undefined, { numeric: true });
    });
  };

  return (
    <div className="min-w-0 space-y-6">
      {/* My Entity card - shown for non-reviewer users */}
      {myEntityData && !searchQuery && (
        <div>
          <div
            className={cn(
              typography.body,
              "mb-2 flex items-center gap-2 font-medium text-un-blue-text-aaa",
            )}
          >
            <Building2 className="h-4 w-4" aria-hidden="true" />
            Your entity
          </div>
          <div className="max-w-lg">
            <EntityCard
              entityData={myEntityData}
              highlight
              workspaceYear={SUBMISSION_CYCLES[budgetVersion].year}
            />
          </div>
        </div>
      )}

      {/* Search box and controls */}
      <div className="flex w-full flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex max-w-full flex-wrap items-center gap-3">
          <div className="w-80 max-w-full">
            <div className="relative">
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                aria-label="Search entities"
                placeholder="Search entities..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-md border border-input bg-white py-2 pr-9 pl-10 text-sm focus:border-un-blue focus:ring-1 focus:ring-un-blue focus:outline-none"
              />
              {searchQuery && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => setSearchQuery("")}
                  aria-label="Clear entity search"
                  className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            {searchQuery && (
              <div className={cn(typography.caption, "mt-2")}>
                Found {totalMatchingEntities} entit
                {totalMatchingEntities !== 1 ? "ies" : "y"}
              </div>
            )}
          </div>
          <Tooltip asChild content={"Group entities by budget section"}>
            <Chip
              density="comfortable"
              tone={showSections ? "selected" : "neutral"}
              onClick={() => setShowSections(!showSections)}
              aria-pressed={showSections}
            >
              <Layers className="h-3 w-3 self-center" aria-hidden="true" />
              View sections
            </Chip>
          </Tooltip>
        </div>
        <div className="ms-auto flex max-w-full flex-wrap items-center justify-end gap-3">
          <SubmissionCycleDropdown
            key={budgetVersion}
            version={budgetVersion}
          />
          <ExportDropdown label="Export All" />
        </div>
      </div>

      {filteredParts.map((partData) => (
        <div key={partData.part}>
          <div className="mb-3 flex items-baseline gap-1.5">
            {partData.numeral && (
              <span className={cn(typography.subTitle, "font-medium")}>
                PART {partData.numeral}.
              </span>
            )}
            <span className={typography.subTitle}>{partData.part}</span>
          </div>

          {showSections ? (
            // Grouped by section
            <div className="space-y-4">
              {groupEntitiesBySection(partData.entities).map(
                ([sectionKey, { title, entities }]) => (
                  <div key={sectionKey}>
                    {sectionKey !== "_none" && (
                      <div className="mb-2 ml-1 flex items-baseline gap-1.5">
                        <span className="text-sm font-medium text-foreground">
                          Section {sectionKey}.
                        </span>
                        {title && (
                          <span className="text-sm font-medium text-foreground">
                            {title}
                          </span>
                        )}
                      </div>
                    )}
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                      {entities.map((entityData) => (
                        <EntityCard
                          key={entityData.entity}
                          entityData={entityData}
                          highlight={userEntity === entityData.entity}
                        />
                      ))}
                    </div>
                  </div>
                ),
              )}
            </div>
          ) : (
            // Flat list
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {partData.entities.map((entityData) => (
                <EntityCard
                  key={entityData.entity}
                  entityData={entityData}
                  highlight={userEntity === entityData.entity}
                />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
