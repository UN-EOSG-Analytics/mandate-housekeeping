"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  isAllowedDomain,
  createMagicToken,
  verifyMagicToken,
  upsertUser,
  createSession,
  clearSession,
  getCurrentUser,
  recentTokenExists,
} from "../auth/auth";
import { sendMagicLink } from "../auth/mail";
import { query } from "../../lib/db/db";

// Return type for auth actions
type ActionResult<T = void> =
  | { success: true; data?: T }
  | { success: false; error: string };

/**
 * Request a magic link to be sent to the user's email
 */
export async function requestMagicLinkAction(
  email: string,
): Promise<ActionResult> {
  // Validate email
  if (!email || typeof email !== "string" || !email.trim()) {
    return { success: false, error: "Email required" };
  }

  const trimmedEmail = email.trim();

  try {
    if (!(await isAllowedDomain(trimmedEmail))) {
      return { success: false, error: "Email domain not allowed" };
    }

    // Check for recent token to prevent spam
    const hasRecentToken = await recentTokenExists(trimmedEmail);
    if (hasRecentToken) {
      return {
        success: false,
        error:
          "A magic link was recently sent. Please check your email or wait a few minutes.",
      };
    }

    const token = await createMagicToken(trimmedEmail);
    await sendMagicLink(trimmedEmail, token);
    return { success: true };
  } catch (error) {
    console.error("Error sending magic link:", error);
    return { success: false, error: "Failed to send email. Please try again." };
  }
}

interface TokenRow {
  email: string;
}

interface UserRow {
  entity: string | null;
}

/**
 * Check if a token is valid and if the user has an entity set
 */
export async function checkEntityForTokenAction(
  token: string,
): Promise<
  ActionResult<{ email: string; hasEntity: boolean; entity: string | null }>
> {
  if (!token || typeof token !== "string") {
    return { success: false, error: "Missing token" };
  }

  // Validate token and get email
  const tokenRows = await query<TokenRow>(
    `SELECT email FROM mandates_housekeeping.magic_tokens 
     WHERE token = $1 AND expires_at > NOW() AND used_at IS NULL`,
    [token],
  );

  if (!tokenRows[0]) {
    return { success: false, error: "Invalid or expired token" };
  }

  const email = tokenRows[0].email;

  // Check if user exists and has entity set
  const userRows = await query<UserRow>(
    `SELECT entity FROM mandates_housekeeping.users WHERE email = $1`,
    [email.toLowerCase()],
  );

  const existingEntity = userRows[0]?.entity || null;

  return {
    success: true,
    data: {
      email,
      hasEntity: !!existingEntity,
      entity: existingEntity,
    },
  };
}

/**
 * Verify magic token and create session, optionally setting entity
 */
export async function verifyMagicTokenAction(
  token: string,
  entity?: string,
): Promise<ActionResult> {
  if (!token || typeof token !== "string") {
    return { success: false, error: "Missing token" };
  }

  const email = await verifyMagicToken(token);
  if (!email) {
    return { success: false, error: "Invalid or expired link" };
  }

  const userId = await upsertUser(email);

  // If entity is provided, update it
  if (entity && typeof entity === "string" && entity.trim()) {
    await query(
      `UPDATE mandates_housekeeping.users SET entity = $1 WHERE id = $2`,
      [entity.trim(), userId],
    );
  }

  await createSession(userId);
  revalidatePath("/", "layout");

  return { success: true };
}

/**
 * Update the current user's entity
 */
export async function updateEntityAction(
  entity: string,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  if (!entity || typeof entity !== "string" || !entity.trim()) {
    return { success: false, error: "Entity is required" };
  }

  await query(
    `UPDATE mandates_housekeeping.users SET entity = $1 WHERE id = $2`,
    [entity.trim(), user.id],
  );

  revalidatePath("/", "layout");

  return { success: true };
}

/**
 * Log out the current user
 */
export async function logoutAction(): Promise<void> {
  await clearSession();
  redirect("/about");
}
