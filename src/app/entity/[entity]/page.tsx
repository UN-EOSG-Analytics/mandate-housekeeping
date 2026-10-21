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
import { typography } from "@un-eosg/ui/typography";

interface PageProps {
  params: Promise<{ entity: string }>;
}

function EntityDataSkeleton({ entityCode }: { entityCode: string }) {
  return (
    <section
      aria-busy="true"
      aria-label={`Loading mandates for ${entityCode}`}
      className="w-full min-w-0 space-y-5"
    >
      <p role="status" className="sr-only">
        Loading entity mandates
      </p>
      <div className="rounded-xl border border-border bg-white px-6 py-5 shadow-sm">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0 flex-1">
            <h1 className={typography.pageTitle}>{entityCode}</h1>
            <div
              aria-hidden="true"
              className="mt-3 animate-pulse space-y-3 motion-reduce:animate-none"
            >
              <div className="h-5 w-3/4 max-w-lg rounded bg-muted" />
              <div className="h-4 w-1/2 max-w-xs rounded bg-muted" />
            </div>
            <div
              aria-hidden="true"
              className="mt-3 animate-pulse space-y-2 ps-4 motion-reduce:animate-none"
            >
              <div className="h-3 w-28 max-w-full rounded bg-muted" />
              <div className="h-3 w-36 max-w-full rounded bg-muted" />
            </div>
          </div>
          <div
            aria-hidden="true"
            className="hidden animate-pulse space-y-3 motion-reduce:animate-none sm:block"
          >
            <div className="ms-auto h-9 w-16 rounded bg-muted" />
            <div className="h-4 w-32 rounded bg-muted" />
            <div className="ms-auto h-8 w-24 rounded bg-muted" />
          </div>
        </div>
      </div>
      <div
        aria-hidden="true"
        className="animate-pulse space-y-4 motion-reduce:animate-none"
      >
        <div className="flex h-10 items-center gap-3 rounded-lg border border-border px-3">
          <div className="size-4 shrink-0 rounded bg-muted" />
          <div className="h-4 w-2/3 max-w-lg rounded bg-muted" />
        </div>
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <div className="grid grid-cols-2 gap-6 border-b border-border bg-muted/50 px-4 py-4 sm:grid-cols-4">
            {[0, 1, 2, 3].map((column) => (
              <div
                key={column}
                className={`h-3 w-20 max-w-full rounded bg-muted ${column > 1 ? "hidden sm:block" : ""}`}
              />
            ))}
          </div>
          <div className="border-b border-border bg-muted/30 px-4 py-3">
            <div className="h-4 w-48 max-w-full rounded bg-muted" />
          </div>
          {Array.from({ length: 6 }, (_, row) => (
            <div
              key={row}
              className="grid grid-cols-2 items-center gap-6 border-b border-border px-4 py-5 last:border-0 sm:grid-cols-4"
            >
              <div className="space-y-2">
                <div className="h-4 w-24 max-w-full rounded bg-muted" />
                <div className="h-3 w-16 max-w-full rounded bg-muted" />
              </div>
              <div className="space-y-2">
                <div
                  className={`h-4 rounded bg-muted ${row % 2 ? "w-3/4" : "w-full"}`}
                />
                <div className="h-3 w-2/3 rounded bg-muted" />
              </div>
              <div className="hidden h-7 w-24 rounded bg-muted sm:block" />
              <div className="hidden h-7 w-24 rounded bg-muted sm:block" />
            </div>
          ))}
        </div>
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
      <main className="mx-auto w-full max-w-7xl min-w-0 px-3 py-8 sm:px-4">
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
