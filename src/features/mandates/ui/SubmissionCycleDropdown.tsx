"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { unstable_rethrow, usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { selectReviewCycle } from "../actions/review-cycle";
import {
  SUBMISSION_CYCLES,
  CURRENT_BUDGET_VERSION,
  type BudgetVersion,
} from "@/lib/db/budget-version";

const options = Object.entries(SUBMISSION_CYCLES).map(([id, cycle]) => ({
  id,
  label: cycle.label + (id !== CURRENT_BUDGET_VERSION ? " · read-only" : ""),
}));

export function SubmissionCycleDropdown({
  version,
}: {
  version: BudgetVersion;
}) {
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selectedLabel = options.find((option) => option.id === version)!.label;

  useEffect(() => {
    if (error && !pending) triggerRef.current?.focus();
  }, [error, pending]);

  return (
    <div aria-busy={pending}>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            ref={triggerRef}
            type="button"
            disabled={pending}
            aria-label={`Submission cycle: ${selectedLabel}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-un-blue disabled:cursor-wait"
          >
            {selectedLabel}
            <ChevronDown className="h-3 w-3" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={8}
          className="rounded-lg bg-white shadow-lg"
        >
          <DropdownMenuRadioGroup
            aria-label="Submission cycle"
            value={version}
            onValueChange={(next) => {
              if (pending || next === version) return;
              setError(null);
              const form = new FormData();
              form.set("version", next);
              form.set("returnTo", pathname);
              startTransition(async () => {
                try {
                  await selectReviewCycle(form);
                } catch (error) {
                  unstable_rethrow(error);
                  setError(
                    "Could not change the submission year. Please try again.",
                  );
                }
              });
            }}
          >
            {options.map((option) => (
              <DropdownMenuRadioItem
                key={option.id}
                value={option.id}
                disabled={pending}
                className="py-2 text-sm text-foreground focus:bg-gray-50 focus:text-foreground data-[disabled]:text-gray-600 data-[disabled]:opacity-100"
              >
                {option.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {pending && (
        <span role="status" className="sr-only">
          Changing submission year…
        </span>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
