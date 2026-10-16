"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { query } from "@/lib/db/db";
import { versionPredicateSqlFor } from "@/lib/db/budget-version";
import { getCurrentUser } from "@/features/auth/auth";
import { parseBudgetVersion, REVIEW_CYCLE_COOKIE } from "@/lib/db/review-cycle";

export async function selectReviewCycle(form: FormData): Promise<void> {
  if (!(await getCurrentUser())) throw new Error("Unauthorized");
  const version = parseBudgetVersion(String(form.get("version")));
  (await cookies()).set(REVIEW_CYCLE_COOKIE, version, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  const returnTo = String(form.get("returnTo") ?? "/");
  // Keep the current review page; cycle-keyed client state remounts after selection.
  const localReviewPage =
    returnTo === "/" ||
    /^\/analysis\/?$/.test(returnTo) ||
    /^\/entity\/[^/\\?#]+\/?$/.test(returnTo);
  if (localReviewPage && returnTo.startsWith("/entity/")) {
    let entity: string;
    try {
      entity = decodeURIComponent(
        returnTo.slice("/entity/".length).replace(/\/$/, ""),
      );
    } catch {
      redirect("/");
    }
    const exists = await query<{ present: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM ppb2026.source_document_citations c
        WHERE c.entity = $1 AND ${versionPredicateSqlFor("c", version)}) AS present`,
      [entity],
      version,
    );
    if (!exists[0]?.present) redirect("/");
  }
  redirect(localReviewPage ? returnTo : "/");
}
