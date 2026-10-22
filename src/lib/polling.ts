/** Shared refresh cadence for collaborative review data and notifications. */
export const REVIEW_POLL_INTERVAL_MS = 30_000;

/** Slow down after repeated failures without increasing the normal cadence. */
export const REVIEW_POLL_MAX_RETRY_MS = 120_000;

/** Repair any missed events, including transactions longer than the overlap. */
export const REVIEW_RECONCILE_INTERVAL_MS = 5 * 60_000;
