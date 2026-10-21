import { Suspense } from "react";
import { SubmissionCycleControl } from "@/features/mandates/ui/SubmissionCycleControl";
import { getBudgetVersion, isReviewEnabled } from "@/lib/db/review-cycle";
import type { BudgetVersion } from "@/lib/db/budget-version";
import { EntityDetail } from "@/components/EntityDetail";
import { FooterFootnote } from "@/components/core/FooterFootnote";
import { PageHeader } from "@/components/core/PageHeader";
import { fetchEntityPageData } from "@/features/mandates/services/data-service";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

interface PageProps {
  params: Promise<{ entity: string }>;
}

function EntityDataSkeleton({ entityCode }: { entityCode: string }) {
  return (
    <section
      aria-busy="true"
      aria-label={`Loading mandates for ${entityCode}`}
      className="space-y-5"
    >
      <div>
        <h1 className="text-2xl font-bold text-foreground">{entityCode}</h1>
        <p role="status" className="sr-only">
          Loading entity mandates
        </p>
      </div>
      <div
        aria-hidden="true"
        className="animate-pulse space-y-4 motion-reduce:animate-none"
      >
        <div className="h-4 w-2/3 max-w-lg rounded bg-gray-200" />
        <div className="h-10 w-full rounded bg-gray-100" />
        {[0, 1, 2].map((row) => (
          <div
            key={row}
            className="space-y-3 rounded-lg border border-gray-200 p-5"
          >
            <div className="h-4 w-32 rounded bg-gray-200" />
            <div className="h-4 w-3/4 rounded bg-gray-100" />
            <div className="h-4 w-1/2 rounded bg-gray-100" />
          </div>
        ))}
      </div>
    </section>
  );
}

async function EntityData({
  entityCode,
  budgetVersion,
}: {
  entityCode: string;
  budgetVersion: BudgetVersion;
}) {
  const match = await fetchEntityPageData(entityCode);
  if (!match) notFound();
  const { data: entityData, partName } = match;
  return (
    <EntityDetail
      key={`${budgetVersion}:${entityData.entity}`}
      budgetVersion={budgetVersion}
      cycleReadOnly={!isReviewEnabled(budgetVersion)}
      entity={entityData.entity}
      entityLong={entityData.entityLong}
      partName={partName}
      backgroundMandates={entityData.backgroundMandates}
      legislativeMandates={entityData.legislativeMandates}
    />
  );
}

export default async function EntityPage({ params }: PageProps) {
  const [{ entity: entityParam }, budgetVersion] = await Promise.all([
    params,
    getBudgetVersion(),
  ]);
  const entityCode = decodeURIComponent(entityParam);
  return (
    <>
      <PageHeader />
      <main className="mx-auto max-w-7xl px-3 py-8 sm:px-4">
        <SubmissionCycleControl>
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-foreground transition-colors hover:text-un-blue-text focus-visible:rounded focus-visible:ring-2 focus-visible:ring-un-blue focus-visible:ring-offset-2"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to all entities</span>
          </Link>
        </SubmissionCycleControl>
        <Suspense
          key={`${budgetVersion}:${entityCode}`}
          fallback={<EntityDataSkeleton entityCode={entityCode} />}
        >
          <EntityData entityCode={entityCode} budgetVersion={budgetVersion} />
        </Suspense>
      </main>
      <FooterFootnote />
    </>
  );
}
