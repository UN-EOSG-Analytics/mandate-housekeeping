"use client";

import { useActionState, useState } from "react";
import { Bell, RefreshCw } from "lucide-react";
import { Button } from "@un-eosg/ui/components/button";
import { DocumentSymbol } from "@un-eosg/ui/components/document-symbol";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { openCommentNotificationAction } from "@/features/mandates/actions/comment-notifications";
import { useCommentNotifications } from "@/hooks/useCommentNotifications";
import { SUBMISSION_CYCLES, type BudgetVersion } from "@/lib/db/budget-version";
import { cn } from "@/lib/utils";

export function CommentNotifications({
  budgetVersion,
}: {
  budgetVersion: BudgetVersion;
}) {
  const [open, setOpen] = useState(false);
  const { summary, loading, error, refresh } =
    useCommentNotifications(budgetVersion);
  const unread = summary?.totalUnread ?? 0;
  const [openError, openMessage, opening] = useActionState(
    async (
      _previous: string | null,
      form: FormData,
    ): Promise<string | null> => {
      const result = await openCommentNotificationAction(
        String(form.get("commentId") ?? ""),
        budgetVersion,
      );
      return (
        result?.error ?? "Could not open this comment. Refresh and try again."
      );
    },
    null,
  );

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void refresh();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative text-foreground"
          aria-label={
            unread
              ? `Comment notifications, ${unread} unread messages`
              : "Comment notifications"
          }
          title="Comment notifications"
        >
          <Bell aria-hidden="true" />
          {unread > 0 && (
            <span className="absolute -end-1 -top-1 min-w-4 rounded-full bg-un-blue-text px-1 text-[10px] leading-4 font-semibold text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(26rem,calc(100vw-2rem))] p-0 text-foreground"
        aria-label="Recent comment notifications"
      >
        <div className="flex items-start justify-between gap-3 border-b p-4">
          <div>
            <h2 className="text-sm font-semibold">Comments</h2>
            <p className="mt-1 text-xs">
              {SUBMISSION_CYCLES[budgetVersion].label}
              {unread > 0 && ` · ${unread} unread`}
            </p>
            <p className="mt-1 text-xs text-foreground/80">
              Your entity and conversations you have participated in.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => void refresh()}
            disabled={loading}
            aria-label="Refresh comment notifications"
          >
            <RefreshCw
              aria-hidden="true"
              className={cn(
                loading && "animate-spin motion-reduce:animate-none",
              )}
            />
          </Button>
        </div>
        {openError && (
          <p role="alert" className="border-b px-4 py-3 text-sm">
            {openError}
          </p>
        )}
        {error && (
          <p role="status" className="border-b px-4 py-3 text-sm">
            Could not refresh comments. Please try again.
          </p>
        )}
        <div className="max-h-[min(32rem,65vh)] overflow-y-auto">
          {!summary && loading ? (
            <p role="status" className="p-4 text-sm">
              Loading comments…
            </p>
          ) : !summary?.notifications.length ? (
            !error && (
              <p className="p-4 text-sm">No comment notifications yet.</p>
            )
          ) : (
            <ul className="divide-y">
              {summary.notifications.map((message) => {
                return (
                  <li key={message.id}>
                    <form action={openMessage}>
                      <input
                        type="hidden"
                        name="commentId"
                        value={message.id}
                      />
                      <button
                        type="submit"
                        disabled={opening}
                        className={cn(
                          "block w-full px-4 py-3 text-left transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-un-blue disabled:cursor-wait",
                          !message.isRead && "bg-un-blue-surface",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <DocumentSymbol>
                            {message.documentSymbol}
                          </DocumentSymbol>
                          <span className="shrink-0 text-xs">
                            {!message.isRead && (
                              <span
                                aria-hidden="true"
                                className="me-1.5 inline-block h-2 w-2 rounded-full bg-un-blue-text"
                              />
                            )}
                            {message.isRead ? "Read" : "Unread"}
                          </span>
                        </div>
                        <p className="mt-2 truncate text-xs font-medium">
                          {message.userEmail}
                        </p>
                        <p className="mt-1 line-clamp-2 text-sm break-words whitespace-pre-wrap">
                          {message.comment}
                        </p>
                        <p className="mt-2 text-xs">
                          {message.entity}
                          {message.subprogramme && ` · ${message.subprogramme}`}
                          {" · "}
                          <time dateTime={message.createdAt}>
                            {new Date(message.createdAt).toLocaleString(
                              undefined,
                              {
                                month: "short",
                                day: "numeric",
                                hour: "numeric",
                                minute: "2-digit",
                              },
                            )}
                          </time>
                        </p>
                      </button>
                    </form>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {summary && summary.notifications.length >= 100 && (
          <p className="border-t px-4 py-2 text-xs">
            Showing the latest 100 messages.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
