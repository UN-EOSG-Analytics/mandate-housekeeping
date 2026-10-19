import { AsyncLocalStorage } from "node:async_hooks";
import { cookies } from "next/headers";
import {
  type BudgetVersion,
  KNOWN_BUDGET_VERSIONS,
  CURRENT_BUDGET_VERSION,
  DISABLED_REVIEW_MESSAGE,
} from "./budget-version";

const cycleContext = new AsyncLocalStorage<BudgetVersion>();

/** Explicit context for comparison services and read-only reconciliation scripts. */
export function withBudgetVersion<T>(version: BudgetVersion, fn: () => T): T {
  return cycleContext.run(parseBudgetVersion(version), fn);
}

export const REVIEW_CYCLE_COOKIE = "review_budget_version_2028";

export function parseBudgetVersion(value: string): BudgetVersion {
  if (!KNOWN_BUDGET_VERSIONS.includes(value as BudgetVersion)) {
    throw new Error("Unknown budget version");
  }
  return value as BudgetVersion;
}

/** Start on the active review; an explicit selection can open the archived cycle. */
export async function getBudgetVersion(): Promise<BudgetVersion> {
  const explicit = cycleContext.getStore();
  if (explicit) return explicit;
  const value = (await cookies()).get(REVIEW_CYCLE_COOKIE)?.value;
  return value ? parseBudgetVersion(value) : CURRENT_BUDGET_VERSION;
}

export function isReviewEnabled(version: BudgetVersion): boolean {
  return version === CURRENT_BUDGET_VERSION;
}

export async function assertReviewEnabled(): Promise<void> {
  if (!isReviewEnabled(await getBudgetVersion())) {
    throw new Error(DISABLED_REVIEW_MESSAGE);
  }
}

/** Reject old bundles and pages whose review cycle differs from the request. */
export async function getReviewWriteError(
  expectedBudgetVersion: string | null | undefined,
): Promise<string | null> {
  const selected = await getBudgetVersion();
  if (!isReviewEnabled(selected)) return DISABLED_REVIEW_MESSAGE;
  if (expectedBudgetVersion !== selected) {
    return "The submission cycle has changed. Reload this page before saving.";
  }
  return null;
}
