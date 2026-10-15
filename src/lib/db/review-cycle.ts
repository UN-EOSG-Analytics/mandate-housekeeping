import { AsyncLocalStorage } from "node:async_hooks";
import { cookies } from "next/headers";
import { type BudgetVersion, KNOWN_BUDGET_VERSIONS } from "./budget-version";

const cycleContext = new AsyncLocalStorage<BudgetVersion>();

/** Explicit context for comparison services and read-only reconciliation scripts. */
export function withBudgetVersion<T>(version: BudgetVersion, fn: () => T): T {
  return cycleContext.run(parseBudgetVersion(version), fn);
}

export const REVIEW_CYCLE_COOKIE = "review_budget_version";

export function parseBudgetVersion(value: string): BudgetVersion {
  if (!KNOWN_BUDGET_VERSIONS.includes(value as BudgetVersion)) {
    throw new Error("Unknown budget version");
  }
  return value as BudgetVersion;
}

/** A missing selection always means the original review, never the registry default. */
export async function getBudgetVersion(): Promise<BudgetVersion> {
  const explicit = cycleContext.getStore();
  if (explicit) return explicit;
  const value = (await cookies()).get(REVIEW_CYCLE_COOKIE)?.value;
  return value ? parseBudgetVersion(value) : "ppb2026";
}

export function isReviewEnabled(version: BudgetVersion): boolean {
  return version === "ppb2026";
}

export async function assertReviewEnabled(): Promise<void> {
  if (!isReviewEnabled(await getBudgetVersion())) {
    throw new Error("PPB 2027 is read-only. Review is not enabled for this cycle.");
  }
}

export async function getReviewWriteError(): Promise<string | null> {
  return isReviewEnabled(await getBudgetVersion()) ? null : "PPB 2027 is read-only. Review is not enabled for this cycle.";
}
