import type { TransactionQueryFn } from "./db";

/** Serialize session transitions and decision writes per entity and cycle. */
export async function lockEntityReview(tx: TransactionQueryFn, entity: string) {
  await tx(
    `SELECT pg_advisory_xact_lock(hashtextextended(
    current_setting('app.budget_version') || ':' || $1, 0))`,
    [entity],
  );
}
