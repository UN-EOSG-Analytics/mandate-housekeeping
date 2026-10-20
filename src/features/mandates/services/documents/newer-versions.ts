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
  const result = new Map<string, NewerVersion>();
  for (const row of rows) {
    if (row.year <= row.currentYear) continue;
    const existing = result.get(row.currentSymbol);
    const allNewer = existing?.allNewer ?? [];
    if (!allNewer.some((d) => d.symbol === row.symbol))
      allNewer.push({ symbol: row.symbol, year: row.year });
    // Ambiguous latest-year candidates still require an explicit reviewer choice.
    if (!existing || row.year > existing.year)
      result.set(row.currentSymbol, {
        symbol: row.symbol,
        title: cleanTitle(row.title),
        year: row.year,
        body: row.body,
        allNewer,
      });
  }
  return result;
}

export async function hasNewerVersion(
  symbol: string,
): Promise<NewerVersion | null> {
  return (await fetchNewerVersions([symbol])).get(symbol) ?? null;
}
