import "server-only";
import { ID } from "node-appwrite";
import { adminTables, DB_ID, T } from "./appwrite";

/** One audit row per change to tasks, policy, members or tokens. before/after are JSON. */
export async function audit(teamId: string, actor: string, action: string, entity: string, before?: unknown, after?: unknown) {
  await adminTables().createRow(DB_ID, T.audit, ID.unique(), {
    teamId, actor, action, entity, at: new Date().toISOString(),
    before: before === undefined ? null : JSON.stringify(before),
    after: after === undefined ? null : JSON.stringify(after),
  });
}
