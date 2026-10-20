import type { ReactNode } from "react";
import { getBudgetVersion } from "@/lib/db/review-cycle";
import { SubmissionCycleDropdown } from "./SubmissionCycleDropdown";

/** The review selector belongs to the page content, above its other controls. */
export async function SubmissionCycleControl({
  children,
}: {
  children?: ReactNode;
}) {
  const version = await getBudgetVersion();
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      {children}
      <div className="ms-auto shrink-0">
        <SubmissionCycleDropdown key={version} version={version} />
      </div>
    </div>
  );
}
