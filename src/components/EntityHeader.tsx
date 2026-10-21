import { typography } from "@un-eosg/ui/typography";
import { cn } from "@/lib/utils";
import { Eye, MoreHorizontal, Trash2 } from "lucide-react";
import { ExportDropdown } from "./ExportDropdown";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  canReviewAnyEntity?: boolean;
  isUnderReview?: boolean;
  onStartReview?: () => void;
  onClearAll?: () => void;
  isClearingAll?: boolean;
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
  canReviewAnyEntity,
  isUnderReview,
  onStartReview,
  onClearAll,
  isClearingAll,
}: Props) {
  const uniqueDocs = filtersActive
    ? filteredUniqueDocuments
    : totalUniqueDocuments;
  const citations = filtersActive ? filteredCitations : totalCitations;

  return (
    <div className="rounded-xl border border-gray-200 bg-white px-6 py-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <h1 className={typography.pageTitle}>{entity}</h1>
          {entityLong && <p className={typography.lead}>{entityLong}</p>}
          {partName && (
            <p className={cn(typography.body, "mt-1 text-foreground")}>
              {partName}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-3">
          <div className="flex flex-col items-end gap-2">
            <div className="text-right">
              <div className="text-4xl leading-tight font-bold text-foreground">
                {uniqueDocs}
              </div>
              <div className="-mt-0.5 text-sm text-foreground">
                {filtersActive && (
                  <span className="text-muted-foreground">
                    of {totalUniqueDocuments}{" "}
                  </span>
                )}
                Mandate Document{totalUniqueDocuments !== 1 ? "s" : ""}
              </div>
            </div>
            <div className="text-right">
              <div className="text-lg leading-tight font-semibold text-foreground">
                {citations}
              </div>
              <div className="-mt-0.5 text-xs text-foreground">
                {filtersActive && <>of {totalCitations} </>}
                Citation{totalCitations !== 1 ? "s" : ""}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canReviewAnyEntity && !isUnderReview && onStartReview && (
              <button
                onClick={onStartReview}
                className="flex items-center gap-1.5 rounded-md bg-amber-500 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-amber-600"
                title="Start review mode - this will prevent entity users from making changes"
              >
                <Eye className="h-4 w-4" />
                Start Review
              </button>
            )}
            <ExportDropdown entity={entity} />
            {canReviewAnyEntity && !isUnderReview && onClearAll && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    disabled={isClearingAll}
                    className="flex items-center justify-center rounded-md border border-gray-200 bg-white p-1.5 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                    title="More options"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={onClearAll}
                    disabled={isClearingAll}
                    className="text-red-600/70 focus:bg-red-50 focus:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4 text-red-500/70" />
                    {isClearingAll
                      ? "Clearing..."
                      : "Clear All Decisions for Entity"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </div>
      {navigation}
    </div>
  );
}
