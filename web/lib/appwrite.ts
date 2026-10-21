// Server-only Appwrite access (plan §3.2): Relay's database. The browser never talks to Appwrite; accounts are the CRM's (lib/crm.ts).
// node-appwrite is pinned to 22.1.3: the last SDK built for API 1.8.1, which api.rando.ge runs.
import "server-only";
import { AppwriteException, Client, Query, TablesDB } from "node-appwrite";
import { DB_ID } from "./tables";

export { DB_ID, T } from "./tables";

function base() {
  const endpoint = process.env.APPWRITE_ENDPOINT, project = process.env.APPWRITE_PROJECT_ID;
  if (!endpoint || !project) throw new Error("APPWRITE_ENDPOINT / APPWRITE_PROJECT_ID are not set (web/.env.local)");
  return new Client().setEndpoint(endpoint).setProject(project);
}

function admin() {
  const key = process.env.APPWRITE_API_KEY;
  if (!key) throw new Error("APPWRITE_API_KEY is not set (web/.env.local)");
  return base().setKey(key);
}

export const adminTables = () => new TablesDB(admin());

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

/** Rows by id, 100 ids per query (Appwrite's cap on values in one equal()). */
export async function rowsById<R>(table: string, ids: string[]): Promise<R[]> {
  const chunks = Array.from({ length: Math.ceil(ids.length / 100) }, (_, i) => ids.slice(i * 100, i * 100 + 100));
  return (await Promise.all(chunks.map((c) => allRows<R>(table, [Query.equal("$id", c)])))).flat();
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
