import type { BudgetVersion } from "@/lib/db/budget-version";
import type { getRealtimeChangesAction as realtime } from "../actions/realtime";
import type {
  getEntityDecisionsAction as states,
  getDocumentDecisionsAction as activity,
} from "../actions/decisions";
import type { getCommentNotificationsAction as notifications } from "../actions/comment-notifications";
import type {
  getDocumentVersionsAction as versions,
  getDocumentMetadataAction as metadata,
  searchDocumentsAction as search,
} from "./documents/document-fetching";
import type { fetchFulltextAction as paragraphs } from "../actions/fulltext";
import type { getReviewModeStatusAction as reviewStatus } from "../actions/review-mode";
import type { getEntityReviewChangesAction as reviewChanges } from "../actions/review-baselines";
import type { getUserRoleAction as userRole } from "@/features/auth/user";

type Params = Record<string, string | string[] | undefined>;

/** GET reads have their own request lifetime, independent of Next's action queue. */
export async function readReviewData<T>(
  resource: string,
  params: Params = {},
  signal?: AbortSignal,
): Promise<T> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) value.forEach((item) => query.append(key, item));
    else if (value !== undefined) query.set(key, value);
  }
  const response = await fetch(`/api/review/${resource}/?${query}`, {
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok)
    throw new Error(
      response.status === 401
        ? "Your session has expired. Reload to sign in."
        : response.status === 409
          ? "The submission cycle has changed. Reload this page."
          : "Could not load review data. Please try again.",
    );
  return response.json() as Promise<T>;
}

export const getRealtimeChangesAction = (
  entity: string,
  since?: string,
  version?: BudgetVersion,
  signal?: AbortSignal,
) =>
  readReviewData<Awaited<ReturnType<typeof realtime>>>(
    "realtime",
    { entity, since, version },
    signal,
  );
export async function getEntityDecisionsAction(
  entity: string,
  symbols?: string[],
  version?: BudgetVersion,
): Promise<Awaited<ReturnType<typeof states>>> {
  if (!symbols || symbols.length <= 100)
    return readReviewData("states", { entity, symbols, version });
  const data: NonNullable<
    Extract<Awaited<ReturnType<typeof states>>, { success: true }>["data"]
  > = { states: [], totalComments: {} };
  // Bound URL length after long idle periods without issuing one read per row.
  const unique = [...new Set(symbols)];
  for (let index = 0; index < unique.length; index += 100) {
    const result = await readReviewData<Awaited<ReturnType<typeof states>>>(
      "states",
      { entity, symbols: unique.slice(index, index + 100), version },
    );
    if (!result.success || !result.data) return result;
    data.states.push(...result.data.states);
    Object.assign(data.totalComments, result.data.totalComments);
  }
  return { success: true, data };
}
export const getDocumentDecisionsAction = (
  symbol: string,
  version: BudgetVersion,
  since?: string,
  signal?: AbortSignal,
  viewer?: string,
) =>
  readReviewData<Awaited<ReturnType<typeof activity>>>(
    "activity",
    { symbol, version, since, viewer },
    signal,
  );
export const getCommentNotificationsAction = (version: BudgetVersion) =>
  readReviewData<Awaited<ReturnType<typeof notifications>>>("notifications", {
    version,
  });
export const getDocumentVersionsAction = (symbol: string) =>
  readReviewData<Awaited<ReturnType<typeof versions>>>("versions", { symbol });
export async function getDocumentMetadataAction(
  symbols: string[],
): Promise<Awaited<ReturnType<typeof metadata>>> {
  if (symbols.length <= 100) return readReviewData("metadata", { symbols });
  const data: NonNullable<
    Extract<Awaited<ReturnType<typeof metadata>>, { success: true }>["data"]
  > = {};
  const unique = [...new Set(symbols)];
  for (let index = 0; index < unique.length; index += 100) {
    const result = await readReviewData<Awaited<ReturnType<typeof metadata>>>(
      "metadata",
      { symbols: unique.slice(index, index + 100) },
    );
    if (!result.success || !result.data) return result;
    Object.assign(data, result.data);
  }
  return { success: true, data };
}
export const searchDocumentsAction = (q: string, signal?: AbortSignal) =>
  readReviewData<Awaited<ReturnType<typeof search>>>("search", { q }, signal);
export const fetchFulltext = (symbol: string) =>
  readReviewData<Awaited<ReturnType<typeof paragraphs>>>("paragraphs", {
    symbol,
  });
export const getReviewModeStatusAction = (entity: string) =>
  readReviewData<Awaited<ReturnType<typeof reviewStatus>>>("review-status", {
    entity,
  });
export const getEntityReviewChangesAction = (entity: string, session: string) =>
  readReviewData<Awaited<ReturnType<typeof reviewChanges>>>("review-changes", {
    entity,
    session,
  });
export const getUserRoleAction = () =>
  readReviewData<Awaited<ReturnType<typeof userRole>>>("user");

export const getIssuingBodies = () =>
  readReviewData<string[]>("issuing-bodies");
