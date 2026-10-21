"use client";

import { createContext } from "react";
import {
  CURRENT_BUDGET_VERSION,
  type BudgetVersion,
} from "@/lib/db/budget-version";
import type { ResolutionCommentCounts } from "@/types/comments";

export const CommentConversationContext = createContext<{
  budgetVersion: BudgetVersion;
  userEmail: string | null;
  canComment: boolean;
  counts: Record<string, ResolutionCommentCounts>;
}>({
  budgetVersion: CURRENT_BUDGET_VERSION,
  userEmail: null,
  canComment: false,
  counts: {},
});
