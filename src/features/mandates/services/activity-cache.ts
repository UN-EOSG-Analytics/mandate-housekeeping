import type { MandateComment, MandateDecision } from "@/types";

export interface DocumentActivity {
  decisions: MandateDecision[];
  comments: MandateComment[];
  readCommentIds: string[];
}
interface CachedActivity {
  data: DocumentActivity;
  cursor: string;
  accessedAt: number;
  reconciledAt: number;
}
const cache = new Map<string, CachedActivity>();
const CACHE_TTL_MS = 5 * 60_000;
const MAX_DOCUMENTS = 50;

/** Memory only. Personal read state is isolated by user, cycle and document. */
export function getCachedActivity(
  key: string | null,
): CachedActivity | undefined {
  if (!key) return;
  const entry = cache.get(key);
  if (!entry) return;
  if (Date.now() - entry.accessedAt > CACHE_TTL_MS) {
    cache.delete(key);
    return;
  }
  cache.delete(key);
  cache.set(key, { ...entry, accessedAt: Date.now() });
  return entry;
}
export function cacheActivity(
  key: string | null,
  data: DocumentActivity,
  cursor: string,
  fullSnapshot = false,
) {
  if (!key) return;
  const reconciledAt = fullSnapshot
    ? Date.now()
    : (cache.get(key)?.reconciledAt ?? 0);
  cache.delete(key);
  cache.set(key, { data, cursor, accessedAt: Date.now(), reconciledAt });
  while (cache.size > MAX_DOCUMENTS) cache.delete(cache.keys().next().value!);
}

/** Preserve references for unchanged history so background polls don't rebuild it. */
export function mergeActivityRows<T extends { id: string; createdAt: string }>(
  previous: T[],
  changes: T[],
): T[] {
  if (!changes.length) return previous;
  const byId = new Map(previous.map((row) => [row.id, row]));
  let changed = false;
  for (const row of changes) {
    if (JSON.stringify(byId.get(row.id)) === JSON.stringify(row)) continue;
    byId.set(row.id, row);
    changed = true;
  }
  return changed
    ? [...byId.values()].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() ||
          a.id.localeCompare(b.id),
      )
    : previous;
}
export function mergeReadIds(previous: string[], incoming: string[]): string[] {
  const ids = [...new Set([...previous, ...incoming])];
  return ids.length === previous.length ? previous : ids;
}
