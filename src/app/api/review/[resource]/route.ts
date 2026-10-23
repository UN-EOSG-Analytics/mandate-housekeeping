import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getSession } from "@/features/auth/auth";
import { getBudgetVersion } from "@/lib/db/review-cycle";
import { getRealtimeChangesAction } from "@/features/mandates/actions/realtime";
import {
  getEntityDecisionsAction,
  getDocumentDecisionsAction,
} from "@/features/mandates/actions/decisions";
import { getCommentNotificationsAction } from "@/features/mandates/actions/comment-notifications";
import {
  getDocumentVersionsAction,
  getDocumentMetadataAction,
  searchDocumentsAction,
} from "@/features/mandates/services/documents/document-fetching";
import { fetchFulltextAction } from "@/features/mandates/actions/fulltext";
import { getReviewModeStatusAction } from "@/features/mandates/actions/review-mode";
import { getEntityReviewChangesAction } from "@/features/mandates/actions/review-baselines";
import { getIssuingBodies } from "@/features/mandates/services/reference-data";
import { getUserRoleAction } from "@/features/auth/user";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers });

/** Read-only HTTP transport; delegates to the same handlers as server actions. */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ resource: string }> },
) {
  if (!(await getSession())) return json({ error: "Unauthorized" }, 401);
  const { resource } = await context.params;
  const params = request.nextUrl.searchParams;
  const version = await getBudgetVersion();
  if (params.has("version") && params.get("version") !== version)
    return json({ error: "The submission cycle has changed" }, 409);
  const value = (key: string, required = false, max = 300) => {
    const text = params.get(key)?.trim();
    if ((required && !text) || (text && text.length > max))
      throw new RangeError(`Invalid ${key}`);
    return text;
  };
  const symbols = () => {
    const values = params.getAll("symbols");
    if (
      values.length > 10000 ||
      values.some((symbol) => !symbol.trim() || symbol.length > 300)
    )
      throw new RangeError("Invalid symbols");
    return params.has("symbols") ? values : undefined;
  };
  // These handlers already resolve the live user in their own transaction.
  const authenticatesUser = [
    "realtime",
    "states",
    "activity",
    "notifications",
    "paragraphs",
    "user",
  ].includes(resource);
  if (!authenticatesUser && !(await getCurrentUser()))
    return json({ error: "Unauthorized" }, 401);
  try {
    let result: unknown;
    switch (resource) {
      case "realtime":
        result = await getRealtimeChangesAction(
          value("entity", true)!,
          value("since"),
        );
        break;
      case "states":
        result = await getEntityDecisionsAction(
          value("entity", true)!,
          symbols(),
        );
        break;
      case "activity":
        result = await getDocumentDecisionsAction(
          value("symbol", true)!,
          version,
          value("since"),
          value("viewer"),
        );
        break;
      case "notifications":
        result = await getCommentNotificationsAction(version);
        break;
      case "search":
        result = await searchDocumentsAction(value("q", true)!);
        break;
      case "versions":
        result = await getDocumentVersionsAction(value("symbol", true)!);
        break;
      case "metadata":
        result = await getDocumentMetadataAction(symbols() ?? []);
        break;
      case "paragraphs":
        result = await fetchFulltextAction(value("symbol", true)!);
        break;
      case "review-status":
        result = await getReviewModeStatusAction(value("entity", true)!);
        break;
      case "review-changes": {
        const session = value("session", true)!;
        if (!/^[0-9a-f-]{36}$/i.test(session))
          throw new RangeError("Invalid session");
        result = await getEntityReviewChangesAction(
          value("entity", true)!,
          session,
        );
        break;
      }
      case "issuing-bodies":
        result = await getIssuingBodies();
        break;
      case "user":
        result = await getUserRoleAction();
        break;
      default:
        return json({ error: "Unknown review resource" }, 404);
    }
    if (
      result === null ||
      (typeof result === "object" &&
        result &&
        "success" in result &&
        !result.success &&
        "error" in result &&
        /unauthorized/i.test(String(result.error)))
    )
      return json({ error: "Unauthorized" }, 401);
    return json(result);
  } catch (error) {
    if (error instanceof RangeError) return json({ error: error.message }, 400);
    console.error(`Review read failed: ${resource}`, error);
    return json({ error: "Could not load review data" }, 500);
  }
}
