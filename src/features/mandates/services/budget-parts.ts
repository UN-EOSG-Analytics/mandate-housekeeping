import { BUDGET_PARTS_META } from "@/lib/constants";
import type { BudgetPartMeta } from "@/types";

/** Only formatting and explicit historical aliases are normalized. Unknown
 * titles remain visible instead of being guessed from an entity or section. */
export function normalizeBudgetPartTitle(title: string): string {
  return title.normalize("NFKC").replace(/\s+/gu, " ").trim().toLowerCase();
}

export function budgetPartAliases(
  metadata: readonly BudgetPartMeta[] = BUDGET_PARTS_META,
): Record<string, string> {
  const aliases: Record<string, string> = Object.create(null);
  for (const part of metadata) {
    for (const title of [part.key, ...(part.aliases || [])]) {
      const key = normalizeBudgetPartTitle(title);
      if (aliases[key] && aliases[key] !== part.key)
        throw new Error(`Conflicting budget part alias: ${title}`);
      aliases[key] = part.key;
    }
  }
  return aliases;
}

export function createBudgetPartResolver(
  metadata: readonly BudgetPartMeta[] = BUDGET_PARTS_META,
) {
  const aliases = budgetPartAliases(metadata);
  const parts = new Map(metadata.map((part) => [part.key, part]));
  return (title: string | null | undefined) => {
    const source = title?.trim() || "Other";
    const key = aliases[normalizeBudgetPartTitle(source)] ?? source;
    return { key, meta: parts.get(key) ?? null };
  };
}

export const resolveBudgetPart = createBudgetPartResolver();
