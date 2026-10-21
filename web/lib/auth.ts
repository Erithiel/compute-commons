// Accounts are our CRM's (D32): Google sign-in through the CRM's Supabase, session in its cookies, refreshed
// by proxy.ts. Only users approved in the CRM get in (lib/crm.ts); their first visit adds them to the team.
import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { approvedUser, crmSupabase, type CrmUser } from "./crm";
import { memberFor } from "./teams";
import type { Member } from "./types";

async function session() {
  const jar = await cookies();
  return crmSupabase({
    getAll: () => jar.getAll(),
    // Server Components cannot set cookies; proxy.ts refreshes the session there instead.
    setAll: (list) => { try { for (const { name, value, options } of list) jar.set(name, value, options); } catch {} },
  });
}

/** Where to send the browser to sign in with Google. */
export async function signInUrl(next: string): Promise<string> {
  const { data, error } = await (await session()).auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${process.env.APP_URL}/auth/callback?next=${encodeURIComponent(next)}`, queryParams: { prompt: "select_account" } },
  });
  if (error) throw error;
  return data.url;
}

/** The OAuth callback: trade the code for a session cookie. False when the code is bad or expired. */
export async function finishSignIn(code: string): Promise<boolean> {
  return !(await (await session()).auth.exchangeCodeForSession(code)).error;
}

export async function signOut() {
  await (await session()).auth.signOut();
}

/** The signed-in Supabase user id, or null. getClaims verifies the token; never trust getSession on the server. */
export const getUserId = cache(async (): Promise<string | null> => {
  const { data } = await (await session()).auth.getClaims();
  return data?.claims.sub ?? null;
});

/** Signed in AND approved in the CRM, or null. */
export const getUser = cache(async (): Promise<CrmUser | null> => {
  const id = await getUserId();
  return id ? approvedUser(id) : null;
});

/** The user's membership; their first visit adds them to the team. Null when not signed in or not approved. */
export const getMember = cache(async (): Promise<Member | null> => {
  const user = await getUser();
  return user ? memberFor(user) : null;
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
