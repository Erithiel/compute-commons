// Sign-in comes from our CRM (team.rando.ge, D32): its Supabase does the Google login, and its bridge route
// lists who is approved there. Relay keeps no passwords and never holds the CRM's service-role key.
import "server-only";
import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";

const env = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} is not set (web/.env.local)`);
  return v;
};

/** The CRM's Supabase, with the session kept in our cookies. Used by lib/auth.ts and proxy.ts. */
export const crmSupabase = (cookies: CookieMethodsServer) =>
  createServerClient(env("CRM_SUPABASE_URL"), env("CRM_SUPABASE_KEY"), { cookies });

export type CrmUser = { id: string; name: string; email: string };

const TTL_MS = 5 * 60_000;
let cache: { at: number; users: CrmUser[] } | null = null;

async function fetchApproved(): Promise<CrmUser[]> {
  const res = await fetch(`${env("CRM_URL")}/api/bridge/relay/approved`, {
    headers: { "x-api-key": env("RELAY_API_KEY") }, cache: "no-store", signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`CRM approved list: HTTP ${res.status}`);
  return ((await res.json()) as { users: CrmUser[] }).users;
}

/** Fake approved users for scripts/mcp-smoke.ts, from RELAY_TEST_USERS (ids, comma-separated). Never in production. */
const testUser = (id: string): CrmUser | null =>
  process.env.NODE_ENV !== "production" && process.env.RELAY_TEST_USERS?.split(",").includes(id) ? { id, name: id, email: `${id}@test` } : null;

/**
 * The approved CRM user with this Supabase user id, or null. The list is cached for 5 minutes, so unapproving
 * someone in the CRM shuts them out (pages and MCP tokens) within 5 minutes; a miss refetches at once, so a
 * newly approved person gets in straight away.
 * ponytail: per-instance cache, and every miss (e.g. a removed person's token) refetches; add a negative cache if that shows up.
 */
export async function approvedUser(id: string, now = Date.now()): Promise<CrmUser | null> {
  const t = testUser(id);
  if (t) return t;
  const hit = cache && now - cache.at < TTL_MS ? cache.users.find((u) => u.id === id) : undefined;
  if (hit) return hit;
  cache = { at: now, users: await fetchApproved() };
  return cache.users.find((u) => u.id === id) ?? null;
}
