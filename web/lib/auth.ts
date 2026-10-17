// Accounts are Appwrite users. Our server creates the session with the API key and keeps its secret in an
// httpOnly cookie; every later request acts as that user. API-key calls skip Appwrite's rate limits,
// so failed logins are counted here (login_attempts).
import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { ID, Query, type Models } from "node-appwrite";
import { adminAccount, adminTables, adminUsers, allRows, DB_ID, isCode, rowOrNull, sessionAccount, T } from "./appwrite";
import { emailKey, LOGIN_WINDOW_MS, loginLocked } from "./team-rules";
import type { Member } from "./types";

const COOKIE = process.env.SESSION_COOKIE_NAME ?? "commons_session";
type Attempt = { $id: string; fails: number; windowStart: string };

/** Creates the account and signs in. Returns an error message, or null. */
export async function signUp(name: string, email: string, password: string): Promise<string | null> {
  try {
    await adminUsers().create(ID.unique(), email.trim(), undefined, password, name.trim());
  } catch (e) {
    if (isCode(e, 409)) return "An account with this email already exists. Sign in instead.";
    if (isCode(e, 400)) return (e as Error).message; // e.g. password shorter than 8 characters
    throw e;
  }
  return signIn(email, password);
}

/** Returns an error message, or null when the session cookie is set. */
export async function signIn(email: string, password: string): Promise<string | null> {
  const key = emailKey(email);
  const attempt = await rowOrNull<Attempt>(T.loginAttempts, key);
  const now = new Date();
  if (loginLocked(attempt, now)) return "Too many failed attempts. Try again in 15 minutes.";
  try {
    const s = await adminAccount().createEmailPasswordSession(email.trim(), password);
    (await cookies()).set(COOKIE, s.secret, {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires: new Date(s.expire),
    });
  } catch (e) {
    if (isCode(e, 400)) return "Wrong email or password."; // malformed email / empty password: not a failed attempt
    if (!isCode(e, 401)) throw e;
    const fresh = !attempt || now.getTime() - new Date(attempt.windowStart).getTime() >= LOGIN_WINDOW_MS;
    await adminTables().upsertRow(DB_ID, T.loginAttempts, key,
      fresh ? { fails: 1, windowStart: now.toISOString() } : { fails: attempt!.fails + 1, windowStart: attempt!.windowStart });
    return "Wrong email or password.";
  }
  if (attempt) await adminTables().deleteRow(DB_ID, T.loginAttempts, key).catch(() => {});
  return null;
}

export async function signOut() {
  await (await sessionAccount())?.deleteSession("current").catch(() => {});
  (await cookies()).delete(COOKIE);
}

/** The signed-in Appwrite user, or null (no cookie, or the session expired or was deleted). */
export const getUser = cache(async (): Promise<Models.User<Models.Preferences> | null> => {
  const account = await sessionAccount();
  if (!account) return null;
  try { return await account.get(); } catch { return null; }
});

/** The user's membership (one team per account), or null when they have no team yet. */
export const getMember = cache(async (): Promise<Member | null> => {
  const user = await getUser();
  if (!user) return null;
  return (await allRows<Member>(T.members, [Query.equal("userId", user.$id)]))[0] ?? null;
});

export async function requireMember(): Promise<Member> {
  const m = await getMember();
  if (!m) throw new Error("Forbidden");
  return m;
}

export async function requireLead(): Promise<Member> {
  const m = await requireMember();
  if (m.role !== "lead") throw new Error("Forbidden");
  return m;
}
