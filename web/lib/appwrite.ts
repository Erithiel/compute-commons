// Server-only Appwrite access (plan §3.2). The browser never talks to Appwrite in v1.
// node-appwrite is pinned to 22.1.3: the last SDK built for API 1.8.1, which api.rando.ge runs.
import "server-only";
import { cookies } from "next/headers";
import { Account, AppwriteException, Client, Query, TablesDB, Users } from "node-appwrite";
import { DB_ID } from "./tables";

const endpoint = process.env.APPWRITE_ENDPOINT!;
const project = process.env.APPWRITE_PROJECT_ID!;

export { DB_ID, T } from "./tables";

const base = () => new Client().setEndpoint(endpoint).setProject(project);

function admin() {
  const key = process.env.APPWRITE_API_KEY;
  if (!key) throw new Error("APPWRITE_API_KEY is not set (web/.env.local)");
  return base().setKey(key);
}

export const adminTables = () => new TablesDB(admin());
export const adminUsers = () => new Users(admin());

/** Account service with the API key: only for createEmailPasswordSession (it returns the session secret only to an API key). */
export const adminAccount = () => new Account(admin());

export async function sessionAccount(): Promise<Account | null> {
  const secret = (await cookies()).get(process.env.SESSION_COOKIE_NAME ?? "commons_session")?.value;
  return secret ? new Account(base().setSession(secret)) : null;
}

export const isCode = (e: unknown, code: number) => e instanceof AppwriteException && e.code === code;

/** Every row matching the queries, paged by cursor (Appwrite returns 25 by default). */
export async function allRows<R>(table: string, queries: string[] = []): Promise<R[]> {
  const out: R[] = [];
  for (let cursor: string | null = null; ;) {
    const page: { rows: Array<{ $id: string }> } = await adminTables().listRows(DB_ID, table, [...queries, Query.limit(500), ...(cursor ? [Query.cursorAfter(cursor)] : [])]);
    out.push(...(page.rows as unknown as R[]));
    if (page.rows.length < 500) return out;
    cursor = page.rows[page.rows.length - 1].$id;
  }
}

/** One row, or null when it does not exist. */
export async function rowOrNull<R>(table: string, id: string): Promise<R | null> {
  try {
    return (await adminTables().getRow(DB_ID, table, id)) as unknown as R;
  } catch (e) {
    if (isCode(e, 404)) return null;
    throw e;
  }
}

/** A row that belongs to this team, or null (a row of another team counts as missing). */
export async function teamRow<R extends { teamId: string }>(table: string, id: string, teamId: string): Promise<R | null> {
  const r = await rowOrNull<R>(table, id);
  return r?.teamId === teamId ? r : null;
}
