import { getBudgetVersion } from "@/lib/db/review-cycle";
import { SubmissionCycleDropdown } from "./SubmissionCycleDropdown";

/** The review selector belongs to the page content, above its other controls. */
export async function SubmissionCycleControl() {
  const version = await getBudgetVersion();
  return (
    <div className="mb-6 flex justify-end">
      <SubmissionCycleDropdown key={version} version={version} />
    </div>
  );
}
