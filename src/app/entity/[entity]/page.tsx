import { SubmissionCycleControl } from "@/features/mandates/ui/SubmissionCycleControl";
import { getBudgetVersion, isReviewEnabled } from "@/lib/db/review-cycle";
import { EntityDetail } from "@/components/EntityDetail";
import { FooterFootnote } from "@/components/core/FooterFootnote";
import { Header } from "@/components/core/Header";
import { getCurrentUser } from "@/features/auth/auth";
import {
  collectEntityData,
  fetchEntities,
  fetchPPBRecords,
  getBudgetPartsMeta,
  transformPPBData,
} from "@/features/mandates/services/data-service";
import { fetchNewerVersions } from "@/features/mandates/services/documents/newer-versions";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

interface PageProps {
  params: Promise<{ entity: string }>;
}

async function getData() {
  const records = await fetchPPBRecords();
  const budgetPartsMeta = getBudgetPartsMeta();

  // Get all unique document symbols that have metadata from DB
  const symbolsWithDbMetadata = records
    .filter((r) => r.metadata_from_db && r.document_symbol)
    .map((r) => r.document_symbol as string);

  // Fetch newer versions for documents with DB metadata
  const newerVersions = await fetchNewerVersions(symbolsWithDbMetadata);

  return transformPPBData(records, budgetPartsMeta, newerVersions);
}

export default async function EntityPage({ params }: PageProps) {
  const { entity: entityParam } = await params;
  const budgetVersion = await getBudgetVersion();
  const entityCode = decodeURIComponent(entityParam);
  const [parts, user, entities] = await Promise.all([
    getData(),
    getCurrentUser(),
    fetchEntities(),
  ]);

  const match = collectEntityData(parts, entityCode);
  if (!match) notFound();
  const { data: entityData, partName } = match;

  return (
    <>
      <Header user={user} entities={entities} />
      <main className="mx-auto max-w-7xl px-3 py-8 sm:px-4">
        <SubmissionCycleControl />
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-2 text-sm text-gray-500 transition-colors hover:text-un-blue"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to all entities</span>
        </Link>
        <EntityDetail
          key={`${budgetVersion}:${entityData.entity}`}
          cycleReadOnly={!isReviewEnabled(budgetVersion)}
          entity={entityData.entity}
          entityLong={entityData.entityLong}
          partName={partName}
          backgroundMandates={entityData.backgroundMandates}
          legislativeMandates={entityData.legislativeMandates}
        />
      </main>
      <FooterFootnote />
    </>
  );
}
