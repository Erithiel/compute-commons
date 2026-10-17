// Accounts are Appwrite users. Our server creates the session with the API key and keeps its secret in an
// httpOnly cookie; every later request acts as that user. API-key calls skip Appwrite's rate limits,
// so login attempts are counted in lib/throttle.ts (login_attempts).
import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { ID, Query, type Models } from "node-appwrite";
import { adminAccount, adminUsers, allRows, isCode, sessionAccount, T } from "./appwrite";
import { minutesLeft } from "./team-rules";
import { clearAttempts, registerAttempt } from "./throttle";
import type { Member } from "./types";

const COOKIE = process.env.SESSION_COOKIE_NAME ?? "commons_session";

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
  const now = new Date();
  if (!(await registerAttempt(email, now))) {
    const m = minutesLeft(now);
    return `Too many failed attempts. Try again in ${m} minute${m === 1 ? "" : "s"}.`;
  }
  try {
    const s = await adminAccount().createEmailPasswordSession(email.trim(), password);
    (await cookies()).set(COOKIE, s.secret, {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires: new Date(s.expire),
    });
  } catch (e) {
    if (isCode(e, 400) || isCode(e, 401)) return "Wrong email or password."; // 400: malformed email / empty password
    throw e;
  }
  await clearAttempts(email, now).catch(() => {});
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
