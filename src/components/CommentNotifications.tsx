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
import { Tooltip } from "@/components/Tooltip";

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
        <Tooltip asChild content={"Comment notifications"}>
          <Button
            variant="ghost"
            size="icon"
            className="relative text-foreground"
            aria-label={
              unread
                ? `Comment notifications, ${unread} unread messages`
                : "Comment notifications"
            }
          >
            <Bell aria-hidden="true" />
            {unread > 0 && (
              <span className="absolute -end-1 -top-1 min-w-4 rounded-full bg-un-blue-text px-1 text-[10px] leading-4 font-semibold text-white">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </Button>
        </Tooltip>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        collisionPadding={12}
        className="flex max-h-[min(38rem,var(--radix-popover-content-available-height))] w-[min(28rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl p-0 text-foreground shadow-lg"
        aria-label="Recent comment notifications"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b bg-muted/50 px-4 py-3.5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <h2 className="text-base font-semibold">Comments</h2>
              {unread > 0 && (
                <span className="rounded-full bg-un-blue-surface px-2 py-0.5 text-xs font-semibold text-un-blue-text-aaa">
                  {unread} unread
                </span>
              )}
            </div>
            <p className="mt-1 text-xs font-medium text-gray-700">
              {SUBMISSION_CYCLES[budgetVersion].label}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-gray-700">
              Comments on your entity’s citations and threads you’ve joined.
            </p>
          </div>
          <Button
            variant="outline"
            size="icon-sm"
            className="shrink-0 bg-background"
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
        <div className="min-h-0 overflow-y-auto overscroll-contain">
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
                          "block w-full cursor-pointer border-s-2 py-3.5 ps-3.5 pe-4 text-start transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-un-blue disabled:cursor-wait",
                          message.isRead
                            ? "border-transparent hover:bg-secondary"
                            : "border-un-blue-text bg-un-blue-surface hover:bg-un-blue-tint-50",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <DocumentSymbol>
                            {message.documentSymbol}
                          </DocumentSymbol>
                          {!message.isRead && (
                            <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-un-blue-text-aaa">
                              <span
                                aria-hidden="true"
                                className="size-1.5 rounded-full bg-current"
                              />
                              Unread
                            </span>
                          )}
                        </div>
                        <p
                          className={cn(
                            "mt-2 line-clamp-2 text-sm leading-5 wrap-anywhere whitespace-pre-wrap",
                            !message.isRead && "font-medium",
                          )}
                        >
                          {message.comment}
                        </p>
                        <p className="mt-2 text-xs leading-relaxed wrap-anywhere text-gray-700">
                          <span className="font-medium text-foreground">
                            {message.entity}
                          </span>
                          {message.subprogramme && ` · ${message.subprogramme}`}
                        </p>
                        <div className="mt-0.5 flex items-baseline justify-between gap-3 text-xs leading-relaxed text-gray-700">
                          <span className="min-w-0 truncate">
                            {message.userEmail}
                          </span>
                          <time
                            className="shrink-0"
                            dateTime={message.createdAt}
                          >
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
                        </div>
                      </button>
                    </form>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {summary && summary.notifications.length >= 100 && (
          <p className="shrink-0 border-t bg-muted/50 px-4 py-2 text-xs text-gray-700">
            Showing the latest 100 messages.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
