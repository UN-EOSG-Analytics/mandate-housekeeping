/** Read-only query plans; run with DATABASE_URL_CLAUDE and pnpm exec tsx.
 * pnpm exec tsx --env-file=.env scripts/profile-document-search.ts 'A/RES/80/1' 'human rights'
 * Does not use the application connection or change indexes/schema.
 */
import { Client } from "pg";
import {
  SYMBOL_SEARCH_SQL,
  TITLE_SEARCH_SQL,
  literalSearchPattern,
} from "../src/features/mandates/services/documents/search-sql";

async function main() {
  const connectionString = process.env.DATABASE_URL_CLAUDE;
  if (!connectionString) throw new Error("DATABASE_URL_CLAUDE is required");
  const terms = process.argv.slice(2);
  if (!terms.length)
    throw new Error("Provide document symbols or titles to profile");
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: true },
  });
  await client.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL statement_timeout = '15s'");
    for (const term of terms) {
      const symbolQuery = /^[A-Z][A-Z0-9_.()-]*\s*\//i.test(term)
        ? term.replace(/\s/g, "").toUpperCase()
        : term.toUpperCase();
      const prefix = `${literalSearchPattern(symbolQuery)}%`;
      for (const [branch, sql, params] of [
        ["symbol", SYMBOL_SEARCH_SQL, [prefix, symbolQuery, 20]],
        [
          "title",
          TITLE_SEARCH_SQL,
          [`%${literalSearchPattern(term)}%`, prefix, 20],
        ],
      ] as const) {
        const result = await client.query(
          `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`,
          [...params],
        );
        console.log(
          JSON.stringify({ term, branch, plan: result.rows[0]["QUERY PLAN"] }),
        );
      }
    }
    await client.query("ROLLBACK");
  } finally {
    await client.end();
  }
}
main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Search profiling failed",
  );
  process.exitCode = 1;
});
