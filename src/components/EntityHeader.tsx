import { typography } from "@un-eosg/ui/typography";
import { Eye, MoreHorizontal, Trash2 } from "lucide-react";
import { ExportDropdown } from "./ExportDropdown";
import { EntityWorkspaceGuide } from "./EntityWorkspaceGuide";
import { Button } from "@un-eosg/ui/components/button";
import { Chip } from "@un-eosg/ui/components/chip";
import {
  CURRENT_BUDGET_VERSION,
  type BudgetVersion,
} from "@/lib/db/budget-version";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip } from "@/components/Tooltip";

interface Props {
  navigation?: React.ReactNode;
  entity: string;
  entityLong: string | null;
  partName: string | null;
  filterEntity: string | null;
  filtersActive?: boolean;
  filteredCitations: number;
  totalCitations: number;
  filteredUniqueDocuments: number;
  totalUniqueDocuments: number;
  canReview?: boolean;
  isUnderReview?: boolean;
  onStartReview?: () => void;
  onClearAll?: () => void;
  isClearingAll?: boolean;
  decidedCitations?: number;
  requiredCitations?: number;
  showRemaining?: boolean;
  onShowRemainingChange?: (show: boolean) => void;
  budgetVersion?: BudgetVersion;
  canEditSubmission?: boolean;
  cycleReadOnly?: boolean;
}

export function EntityHeader({
  navigation,
  entity,
  entityLong,
  partName,
  filterEntity,
  filtersActive = !!filterEntity,
  filteredCitations,
  totalCitations,
  filteredUniqueDocuments,
  totalUniqueDocuments,
  canReview,
  isUnderReview,
  onStartReview,
  onClearAll,
  isClearingAll,
  decidedCitations,
  requiredCitations = totalCitations,
  showRemaining = false,
  onShowRemainingChange,
  budgetVersion = CURRENT_BUDGET_VERSION,
  canEditSubmission = false,
  cycleReadOnly = false,
}: Props) {
  return (
    <header className="space-y-5 border-b border-border pb-5">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1 basis-72">
          <h1 className={typography.pageTitle}>{entity}</h1>
          {entityLong && (
            <p className={`${typography.lead} mt-1`}>{entityLong}</p>
          )}
          {partName && (
            <p className={`${typography.body} mt-1 text-foreground`}>
              {partName}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canReview && !isUnderReview && onStartReview && (
            <Tooltip
              asChild
              content={
                "Start review mode - this will prevent entity users from making changes"
              }
            >
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={onStartReview}
              >
                <Eye className="h-4 w-4" />
                Start Review
              </Button>
            </Tooltip>
          )}
          <div data-workspace-export>
            <ExportDropdown entity={entity} />
          </div>
          {canReview && !isUnderReview && onClearAll && (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Tooltip asChild content={"More options"}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    disabled={isClearingAll}
                    aria-label="More entity options"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </Tooltip>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={onClearAll}
                  disabled={isClearingAll}
                  className="text-red-700 focus:bg-red-50 focus:text-red-800 data-[disabled]:cursor-not-allowed data-[disabled]:text-gray-600 data-[disabled]:opacity-100 data-[disabled]:[&_svg]:text-gray-600"
                >
                  <Trash2 className="h-4 w-4 text-red-700" />
                  {isClearingAll
                    ? "Clearing..."
                    : "Clear All Decisions for Entity"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
      <div className="grid items-start gap-x-10 gap-y-5 md:grid-cols-[minmax(0,1fr)_minmax(17rem,22rem)]">
        {navigation && <div className="min-w-0">{navigation}</div>}
        <div className="min-w-0 space-y-5">
          <section aria-label="Citation review progress" className="space-y-3">
            <h2 className={typography.subTitle}>Review progress</h2>
            <p className={`${typography.body} text-foreground`}>
              <span className="font-semibold tabular-nums">
                {totalCitations} citation{totalCitations !== 1 ? "s" : ""}
              </span>{" "}
              <span>
                across {totalUniqueDocuments} unique document
                {totalUniqueDocuments !== 1 ? "s" : ""}
              </span>
            </p>
            {filtersActive && (
              <p className={`${typography.body} text-foreground`} role="status">
                Showing {filteredCitations} citation
                {filteredCitations !== 1 ? "s" : ""} across{" "}
                {filteredUniqueDocuments} unique document
                {filteredUniqueDocuments !== 1 ? "s" : ""}
              </p>
            )}
            {decidedCitations !== undefined && (
              <div className="space-y-2" aria-live="polite">
                <p className={`${typography.body} text-foreground`}>
                  <span className="font-medium text-foreground tabular-nums">
                    {decidedCitations} of {requiredCitations}
                  </span>{" "}
                  submission citations decided
                </p>
                <progress
                  value={decidedCitations}
                  max={requiredCitations || 1}
                  aria-label="Submission citations with a decision; background references excluded"
                  className="block h-2 w-full overflow-hidden rounded-full border-0 bg-un-blue-tint-50 [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-un-blue/70 [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-un-blue-tint-50 [&::-webkit-progress-inner-element]:rounded-full [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-un-blue/70"
                  style={{ appearance: "none" }}
                />
              </div>
            )}
            {onShowRemainingChange &&
              !cycleReadOnly &&
              (canEditSubmission || showRemaining) && (
                <Chip
                  density="comfortable"
                  tone={showRemaining ? "selected" : "neutral"}
                  data-workspace-remaining
                  aria-pressed={showRemaining}
                  onClick={() => onShowRemainingChange(!showRemaining)}
                >
                  Show remaining
                </Chip>
              )}
          </section>
          <EntityWorkspaceGuide
            budgetVersion={budgetVersion}
            canEditSubmission={canEditSubmission}
            cycleReadOnly={cycleReadOnly}
          />
        </div>
      </div>
    </header>
  );
}
