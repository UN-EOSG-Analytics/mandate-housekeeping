import { unstable_cache } from "next/cache";
import { transaction } from "@/lib/db/db";
import { getBudgetVersion } from "@/lib/db/review-cycle";
import type { BudgetVersion } from "@/lib/db/budget-version";
import type { DocumentSearchResult } from "./document-fetching";
import { cleanTitle, normalizeSymbol } from "./metadata";
import {
  SYMBOL_SEARCH_SQL,
  TITLE_SEARCH_SQL,
  literalSearchPattern,
} from "./search-sql";

const searchCatalogue = unstable_cache(
  async (
    q: string,
    version: BudgetVersion,
  ): Promise<DocumentSearchResult[]> => {
    const symbolQuery = /^[A-Z][A-Z0-9_.()-]*\s*\//i.test(q)
      ? normalizeSymbol(q)
      : q.toUpperCase();
    const prefix = `${literalSearchPattern(symbolQuery)}%`;
    return transaction(async (tx) => {
      // Exact and prefix hits always rank first. A full symbol result set avoids
      // the title substring query altogether, including for broad prefixes.
      const symbols = await tx<DocumentSearchResult>(SYMBOL_SEARCH_SQL, [
        prefix,
        symbolQuery,
        20,
      ]);
      if (symbols.length === 20)
        return symbols.map((row) => ({ ...row, title: cleanTitle(row.title) }));
      const titles = await tx<DocumentSearchResult>(TITLE_SEARCH_SQL, [
        `%${literalSearchPattern(q)}%`,
        prefix,
        20 - symbols.length,
      ]);
      return [...symbols, ...titles].map((row) => ({
        ...row,
        title: cleanTitle(row.title),
      }));
    }, version);
  },
  ["document-search", "digital-library-only"],
  { revalidate: 60 },
);

/** Search catalogue metadata only for documents present in the Digital Library. */
export async function searchDocuments(
  searchQuery: string,
): Promise<DocumentSearchResult[]> {
  const q = searchQuery.trim();
  if (q.length < 2 || q.length > 300) return [];
  return searchCatalogue(q, await getBudgetVersion());
}
