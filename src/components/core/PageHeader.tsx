import { Suspense } from "react";
import { Header } from "./Header";
import { getCurrentUser } from "@/features/auth/auth";
import { fetchEntities } from "@/features/mandates/services/data-service";

async function Navigation() {
  const [user, entities] = await Promise.all([
    getCurrentUser(),
    fetchEntities(),
  ]);
  return <Header user={user} entities={entities} />;
}

/** Keep page branding visible while account and entity navigation are resolved. */
export function PageHeader() {
  return (
    <Suspense fallback={<Header navigationPending />}>
      <Navigation />
    </Suspense>
  );
}
