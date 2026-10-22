"use server";

import { getCurrentUser } from "@/features/auth/auth";

// Return type for actions
type ActionResult<T = void> =
  | { success: true; data?: T }
  | { success: false; error: string };

/**
 * Get current user's role information
 */
export async function getUserRoleAction(): Promise<
  ActionResult<{
    email: string;
    entity: string | null;
    isReviewer: boolean;
  }>
> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "unauthorized" };
  }

  return {
    success: true,
    data: {
      email: user.email,
      entity: user.entity,
      isReviewer: user.isReviewer,
    },
  };
}
