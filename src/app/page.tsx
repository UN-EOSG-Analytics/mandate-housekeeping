import { Suspense } from "react";
import { getBudgetVersion } from "@/lib/db/review-cycle";
import { SubmissionCycleControl } from "@/features/mandates/ui/SubmissionCycleControl";
import { EntityOverview } from "@/components/EntityOverview";
import { FooterFootnote } from "@/components/core/FooterFootnote";
import { PageHeader } from "@/components/core/PageHeader";
import { getCurrentUser } from "@/features/auth/auth";
import { fetchOverviewPageData } from "@/features/mandates/services/data-service";

async function OverviewData() {
  const [parts, user] = await Promise.all([
    fetchOverviewPageData(),
    getCurrentUser(),
  ]);
  return <EntityOverview parts={parts} userEntity={user?.entity} />;
}

function OverviewSkeleton() {
  return (
    <section
      aria-busy="true"
      aria-label="Loading entities"
      className="space-y-6"
    >
      <p role="status" className="sr-only">
        Loading entities
      </p>
      <div
        aria-hidden="true"
        className="animate-pulse space-y-6 motion-reduce:animate-none"
      >
        <div className="h-10 w-80 max-w-full rounded-lg bg-gray-100" />
        {[0, 1, 2].map((part) => (
          <div key={part} className="space-y-3">
            <div className="h-5 w-56 rounded bg-gray-200" />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {[0, 1, 2, 3].map((entity) => (
                <div key={entity} className="h-16 rounded-lg bg-gray-100" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default async function Home() {
  const budgetVersion = await getBudgetVersion();
  return (
    <>
      <PageHeader budgetVersion={budgetVersion} />
      <main className="mx-auto w-full max-w-7xl px-3 py-8 sm:px-4">
        <h1 className="sr-only">Entities</h1>
        <SubmissionCycleControl />
        <Suspense key={budgetVersion} fallback={<OverviewSkeleton />}>
          <OverviewData />
        </Suspense>
      </main>
      <FooterFootnote />
    </>
  );
}
