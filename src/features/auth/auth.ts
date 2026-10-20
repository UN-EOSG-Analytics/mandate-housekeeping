import { cookies } from "next/headers";
import { randomBytes, createHmac, timingSafeEqual } from "crypto";
import { query, type TransactionQueryFn } from "../../lib/db/db";

const AUTH_SECRET = process.env.AUTH_SECRET;
if (!AUTH_SECRET && process.env.NODE_ENV === "production") {
  throw new Error("AUTH_SECRET must be set in production");
}
const SECRET = AUTH_SECRET || "dev-secret-change-me";
const COOKIE_NAME = "auth_session";

export function isValidUnEmail(email: string): boolean {
  return email.toLowerCase().endsWith("@un.org");
}

export async function isAllowedDomain(email: string): Promise<boolean> {
  const domain = email.toLowerCase().split("@")[1];
  if (!domain) return false;

  const rows = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM mandates_housekeeping.allowed_domains WHERE domain = $1`,
    [domain],
  );
  return parseInt(rows[0]?.count || "0") > 0;
}

export function generateToken(): string {
  return randomBytes(32).toString("hex");
}

export async function recentTokenExists(email: string): Promise<boolean> {
  // Only block if there's an unused token sent in the last 2 minutes
  // Used tokens don't block - allows re-login after logout
  // Token expires 15 min after creation, so "created < 2 min ago" = expires_at > NOW() + 13 min
  const rows = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM mandates_housekeeping.magic_tokens 
     WHERE email = $1 AND used_at IS NULL AND expires_at > NOW() + INTERVAL '13 minutes'`,
    [email.toLowerCase()],
  );
  return parseInt(rows[0]?.count || "0") > 0;
}

export async function createMagicToken(email: string): Promise<string> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

  await query(
    `INSERT INTO mandates_housekeeping.magic_tokens (token, email, expires_at) VALUES ($1, $2, $3)`,
    [token, email.toLowerCase(), expiresAt],
  );

  return token;
}

export async function verifyMagicToken(token: string): Promise<string | null> {
  const rows = await query<{ email: string }>(
    `UPDATE mandates_housekeeping.magic_tokens 
     SET used_at = NOW() 
     WHERE token = $1 AND expires_at > NOW() AND used_at IS NULL 
     RETURNING email`,
    [token],
  );
  return rows[0]?.email || null;
}

export async function upsertUser(email: string): Promise<string> {
  const rows = await query<{ id: string }>(
    `INSERT INTO mandates_housekeeping.users (email, last_login_at) 
     VALUES ($1, NOW()) 
     ON CONFLICT (email) DO UPDATE SET last_login_at = NOW()
     RETURNING id`,
    [email.toLowerCase()],
  );
  return rows[0].id;
}

function signSession(userId: string): string {
  const payload = JSON.stringify({
    userId,
    exp: Date.now() + 30 * 24 * 60 * 60 * 1000,
  }); // 30 days
  const sig = createHmac("sha256", SECRET).update(payload).digest("hex");
  return Buffer.from(payload).toString("base64") + "." + sig;
}

export function verifySession(token: string): { userId: string } | null {
  try {
    const [payloadB64, sig] = token.split(".");
    if (!payloadB64 || !sig) return null;

    const payload = Buffer.from(payloadB64, "base64").toString();
    const expectedSig = createHmac("sha256", SECRET)
      .update(payload)
      .digest("hex");

    // Timing-safe comparison
    const sigBuf = Buffer.from(sig, "hex");
    const expectedBuf = Buffer.from(expectedSig, "hex");
    if (
      sigBuf.length !== expectedBuf.length ||
      !timingSafeEqual(sigBuf, expectedBuf)
    )
      return null;

    const data = JSON.parse(payload);
    if (data.exp < Date.now()) return null;

    return { userId: data.userId };
  } catch {
    return null;
  }
}

export async function createSession(userId: string) {
  const token = signSession(userId);
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60, // 30 days
    path: "/",
  });
}

export async function getSession(): Promise<{ userId: string } | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySession(token);
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function getCurrentUser(runQuery: TransactionQueryFn = query) {
  const session = await getSession();
  if (!session) return null;

  // Join with allowed_reviewers to dynamically determine reviewer status
  // This ensures removing someone from allowed_reviewers immediately revokes their reviewer access
  const rows = await runQuery<{
    id: string;
    email: string;
    entity: string | null;
    is_allowed_reviewer: boolean;
  }>(
    `SELECT 
       u.id, 
       u.email, 
       u.entity,
       (ar.email IS NOT NULL) as is_allowed_reviewer
     FROM mandates_housekeeping.users u
     LEFT JOIN mandates_housekeeping.allowed_reviewers ar 
       ON LOWER(u.email) = LOWER(ar.email)
     WHERE u.id = $1`,
    [session.userId],
  );
  if (!rows[0]) return null;

  const entity = rows[0].entity;
  const isAllowedReviewer = rows[0].is_allowed_reviewer;

  // Reviewer status is determined solely by the allowed_reviewers table
  const isReviewer = isAllowedReviewer;
  const isDMSPC = entity?.toUpperCase() === "DMSPC";

  return {
    id: rows[0].id,
    email: rows[0].email,
    entity: entity,
    isReviewer: isReviewer,
    isDMSPC: isDMSPC,
    // Must be BOTH: logged in as DMSPC entity AND be in allowed_reviewers
    canReviewAnyEntity: isDMSPC && isReviewer,
  };
}
