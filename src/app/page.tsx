import { SubmissionCycleControl } from "@/features/mandates/ui/SubmissionCycleControl";
import { EntityOverview } from "@/components/EntityOverview";
import { FooterFootnote } from "@/components/core/FooterFootnote";
import { Header } from "@/components/core/Header";
import { getCurrentUser } from "@/features/auth/auth";
import {
  fetchPPBRecords,
  getBudgetPartsMeta,
  fetchEntities,
  transformPPBData,
} from "@/features/mandates/services/data-service";
import { fetchNewerVersions } from "@/features/mandates/services/documents/newer-versions";

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

export default async function Home() {
  const [parts, user, entities] = await Promise.all([
    getData(),
    getCurrentUser(),
    fetchEntities(),
  ]);

  return (
    <>
      <Header user={user} entities={entities} />
      <main className="mx-auto w-full max-w-7xl px-3 py-8 sm:px-4">
        <SubmissionCycleControl />
        <EntityOverview parts={parts} userEntity={user?.entity} />
      </main>
      <FooterFootnote />
    </>
  );
}
