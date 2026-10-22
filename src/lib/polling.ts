/** Shared refresh cadence for collaborative review data and notifications. */
export const REVIEW_POLL_INTERVAL_MS = 30_000;

/** Slow down after repeated failures without increasing the normal cadence. */
export const REVIEW_POLL_MAX_RETRY_MS = 120_000;
