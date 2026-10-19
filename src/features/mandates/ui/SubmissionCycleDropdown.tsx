"use client";

import { useState, useTransition } from "react";
import { unstable_rethrow, usePathname } from "next/navigation";
import { HierarchicalSingleSelect } from "@un-eosg/ui/components/hierarchical-single-select";
import { selectReviewCycle } from "../actions/review-cycle";
import {
  SUBMISSION_CYCLES,
  CURRENT_BUDGET_VERSION,
  type BudgetVersion,
} from "@/lib/db/budget-version";

const options = Object.entries(SUBMISSION_CYCLES).map(([id, cycle]) => ({
  id,
  label: cycle.label + (id !== CURRENT_BUDGET_VERSION ? " · read-only" : ""),
  children: [],
}));

export function SubmissionCycleDropdown({
  version,
}: {
  version: BudgetVersion;
}) {
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div aria-busy={pending}>
      <HierarchicalSingleSelect
        groups={options}
        selected={version}
        className={pending ? "pointer-events-none opacity-60" : undefined}
        onChange={(next) => {
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
      />
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
