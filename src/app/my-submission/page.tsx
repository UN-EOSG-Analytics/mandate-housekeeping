import { redirect } from "next/navigation";
import { getCurrentUser } from "@/features/auth/auth";
import { fetchEntities } from "@/features/mandates/services/data-service";
import { Header } from "@/components/core/Header";
import { MissingSubmission } from "@/features/auth/ui/MissingSubmission";
import { SubmissionCycleControl } from "@/features/mandates/ui/SubmissionCycleControl";

export default async function MySubmissionPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.isReviewer) redirect("/");

  const entities = await fetchEntities();
  const ownEntity = entities.find((option) => option.entity === user.entity);
  if (ownEntity) redirect(`/entity/${encodeURIComponent(ownEntity.entity)}`);

  return (
    <>
      <Header user={user} entities={entities} />
      <main className="mx-auto w-full max-w-7xl px-3 py-8 sm:px-4">
        <SubmissionCycleControl />
        <MissingSubmission entity={user.entity} entities={entities} />
      </main>
    </>
  );
}
