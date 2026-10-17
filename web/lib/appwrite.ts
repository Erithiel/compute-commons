// Server-only Appwrite access (plan §3.2). The browser never talks to Appwrite in v1.
// node-appwrite is pinned to 22.1.3: the last SDK built for API 1.8.1, which api.rando.ge runs.
import "server-only";
import { cookies } from "next/headers";
import { Account, Client, TablesDB, Users } from "node-appwrite";

const endpoint = process.env.APPWRITE_ENDPOINT!;
const project = process.env.APPWRITE_PROJECT_ID!;

export const DB_ID = process.env.APPWRITE_DATABASE_ID ?? "commons";
export const TEAM_ID = process.env.TEAM_ID ?? "rando";
export const T = {
  members: "members", tasks: "tasks", taskVersions: "task_versions", taskItems: "task_items", memberNotes: "member_notes",
  claims: "claims", logs: "logs", settings: "settings", apiTokens: "api_tokens", audit: "audit_log",
} as const;

const base = () => new Client().setEndpoint(endpoint).setProject(project);

function admin() {
  const key = process.env.APPWRITE_API_KEY;
  if (!key) throw new Error("APPWRITE_API_KEY is not set (web/.env.local)");
  return base().setKey(key);
}

export const adminTables = () => new TablesDB(admin());
export const adminUsers = () => new Users(admin());

export async function sessionAccount(): Promise<Account | null> {
  const secret = (await cookies()).get(process.env.SESSION_COOKIE_NAME ?? "commons_session")?.value;
  return secret ? new Account(base().setSession(secret)) : null;
}

/** Checks the endpoint + project are reachable. Needs no API key. */
export async function ping(): Promise<boolean> {
  try {
    // Typed as string, but 22.1.3 actually returns { message: "Pong!" }.
    const r: unknown = await base().ping();
    return JSON.stringify(r).includes("Pong!");
  } catch {
    return false;
  }
}
