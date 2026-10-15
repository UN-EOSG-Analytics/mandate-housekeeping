"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
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
  // Full navigation resets all client review state and realtime cursors.
  redirect("/");
}
