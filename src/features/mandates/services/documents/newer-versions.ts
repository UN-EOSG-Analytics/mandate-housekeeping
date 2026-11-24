import type { TransactionQueryFn } from "@/lib/db/db";
import type { NewerVersion } from "@/types";
import { fetchSeriesCandidates } from "./document-versions";
import { cleanTitle } from "./metadata";

/** Newer series members are review candidates, not legal supersession findings. */
export async function fetchNewerVersions(
  symbols: string[],
  runQuery?: TransactionQueryFn,
): Promise<Map<string, NewerVersion>> {
  const rows = await fetchSeriesCandidates(symbols, {
    newerOnly: true,
    runQuery,
  });
  const grouped = new Map<string, typeof rows>();
  for (const row of rows) {
    const group = grouped.get(row.currentSymbol) ?? [];
    group.push(row);
    grouped.set(row.currentSymbol, group);
  }
  const result = new Map<string, NewerVersion>();
  for (const [symbol, candidates] of grouped) {
    const latestYear = Math.max(...candidates.map((row) => row.year));
    const latest = candidates.filter((row) => row.year === latestYear);
    // The details list keeps all candidates; a note must identify one clear target.
    if (latest.length !== 1) continue;
    result.set(symbol, {
      symbol: latest[0].symbol,
      title: cleanTitle(latest[0].title),
      year: latestYear,
      body: latest[0].body,
      allNewer: candidates.map(({ symbol, year }) => ({ symbol, year })),
    });
  }
  return result;
}

export async function hasNewerVersion(
  symbol: string,
): Promise<NewerVersion | null> {
  return (await fetchNewerVersions([symbol])).get(symbol) ?? null;
}
