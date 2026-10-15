import { Pool, type PoolConfig } from "pg";
import { getBudgetVersion, isReviewEnabled } from "./review-cycle";
import { KNOWN_BUDGET_VERSIONS, type BudgetVersion } from "./budget-version";

const globalForDb = global as unknown as {
  pool: Pool | undefined;
};

/**
 * Ensure sslmode=require is set when connecting via PgBouncer (port 6432).
 * Azure's built-in PgBouncer has a valid cert; rejectUnauthorized handles
 * verification on the Node side, so `require` is sufficient here.
 */
function getConnectionString(): string {
  const url = process.env.DATABASE_URL || "";
  if (!url) throw new Error("DATABASE_URL is required; local database fallback is disabled");
  if (url.includes("sslmode=")) return url;
  return url + (url.includes("?") ? "&" : "?") + "sslmode=require";
}

/**
 * Pool configuration for Vercel Serverless → Azure PgBouncer → Azure Postgres
 *
 * Topology:
 *   Vercel fn  →  PgBouncer :6432 (transaction pooling)  →  Postgres :5432
 *
 * Because PgBouncer multiplexes virtual connections to a small set of real
 * backend connections, each Vercel instance can hold more connections without
 * exhausting Postgres's limit. PgBouncer is the bottleneck, not Postgres.
 *
 * PgBouncer compatibility: the `pg` driver uses unnamed (Parse/Bind/Execute)
 * extended query protocol for parameterized queries — no named prepared
 * statements — so transaction pooling mode works without any extra flags.
 *
 * Settings:
 * - max: 10  — PgBouncer queues excess; safe across many concurrent fn instances
 * - idleTimeoutMillis: 10s — release quickly; serverless fns are short-lived
 * - connectionTimeoutMillis: 5s — fail fast if PgBouncer is overloaded
 * - allowExitOnIdle: true — clean Node exit between invocations
 */
const poolConfig: PoolConfig = {
  connectionString: getConnectionString(),
  max: 10,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000,
  allowExitOnIdle: true,
  ssl: {
    rejectUnauthorized: true,
  },
};

// Reuse pool across hot reloads in development
export const pool = globalForDb.pool || new Pool(poolConfig);

if (process.env.NODE_ENV !== "production") {
  globalForDb.pool = pool;
}

/**
 * Execute a SQL query with automatic connection management.
 * Connection is acquired from pool and released after query completes.
 */
export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[],
  version?: BudgetVersion,
): Promise<T[]> {
  return transaction((tx) => tx<T>(text, params), version);
}

/**
 * Query function type for use in transactions
 */
type TransactionQueryFn = <R = Record<string, unknown>>(
  text: string,
  params?: unknown[],
) => Promise<R[]>;

/**
 * Execute a transaction with automatic rollback on error.
 * Useful for multi-statement operations that must be atomic.
 */
export async function transaction<T>(
  fn: (query: TransactionQueryFn) => Promise<T>,
  version?: BudgetVersion,
): Promise<T> {
  const selectedVersion = version ?? await getBudgetVersion();
  if (!KNOWN_BUDGET_VERSIONS.includes(selectedVersion)) throw new Error("Unknown budget version");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // SET LOCAL is transaction scoped: safe with PgBouncer and pooled connections.
    // RLS scopes every workflow table, including joins, aggregates and ID lookups.
    await client.query("SELECT set_config('app.budget_version', $1, true)", [selectedVersion]);
    const txQuery: TransactionQueryFn = async (text, params) => {
      if (!isReviewEnabled(selectedVersion) &&
          /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+mandates_housekeeping\.(?:mandate_decisions|mandate_comments|entity_review_mode|review_change_responses|docx_uploads)\b/i.test(text)) {
        throw new Error("Review is disabled for this budget cycle");
      }
      const result = await client.query(text, params);
      return result.rows;
    };
    const result = await fn(txQuery);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export default pool;
