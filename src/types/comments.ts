import type { BudgetVersion } from "@/lib/db/budget-version";
import type { MandateComment } from "@/types";

export interface CommentNotification extends MandateComment {
  isRead: boolean;
}

export interface ResolutionCommentCounts {
  total: number;
  unread: number;
}

export interface CommentNotificationSummary {
  budgetVersion: BudgetVersion;
  totalUnread: number;
  notifications: CommentNotification[];
  resolutions: Record<string, ResolutionCommentCounts>;
}
