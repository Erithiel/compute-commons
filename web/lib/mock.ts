// Read model for the pages: one snapshot of the team's data from Appwrite per request.
// Kept under its old name so pages need no edits while the UI is being reworked; rename to lib/data.ts afterwards.
// Logs are the one table that grows without bound, so they are not in the snapshot: queryLogs / lastLogs fetch them.
// ponytail: the other tables load whole on each request; fine for one team (hundreds of rows). Query per page when it is not.
import "server-only";
import { cache } from "react";
import { connection } from "next/server";
import { Query } from "node-appwrite";
import { adminTables, allRows, DB_ID, rowOrNull, rowsById, T } from "./appwrite";
import { getMember } from "./auth";
import { canTake, isActive } from "./claims";
import { buildPrompt, itemPrompt } from "./prompt";
import { DEFAULT_POLICY } from "./tables";
import type { ApiToken, AuditEntry, Claim, Log, Member, MemberNote, Settings, Task, TaskItem, TaskVersion } from "./types";

export type Store = {
  members: Member[]; tasks: Task[]; taskVersions: TaskVersion[]; taskItems: TaskItem[]; memberNotes: MemberNote[];
  claims: Claim[]; settings: Settings; apiTokens: ApiToken[]; audit: AuditEntry[];
};

/** One snapshot of a team's data. MCP tools pass the caller's team; pages use db() below. */
export async function loadStore(teamId: string): Promise<Store> {
  const team = [Query.equal("teamId", teamId)];
  const [members, tasks, taskVersions, taskItems, memberNotes, claims, settings, apiTokens, audit] = await Promise.all([
    allRows<Member>(T.members, team),
    allRows<Task>(T.tasks, [...team, Query.orderAsc("$createdAt")]),
    allRows<TaskVersion>(T.taskVersions, team),
    allRows<TaskItem>(T.taskItems, team),
    allRows<MemberNote>(T.memberNotes, team),
    allRows<Claim>(T.claims, team),
    rowOrNull<Settings>(T.settings, teamId),
    allRows<ApiToken>(T.apiTokens, team),
    allRows<AuditEntry>(T.audit, [...team, Query.orderDesc("at"), Query.limit(200)]),
  ]);
  return {
    members, tasks, taskVersions, taskItems, memberNotes, claims, apiTokens, audit,
    settings: settings ?? { $id: teamId, teamId, policy: DEFAULT_POLICY },
  };
}

export type LogFilter = { taskId?: string; by?: string; outcome?: string };

/** One page of a team's logs, newest first. `after` is the last log id of the previous page. */
export async function queryLogs(teamId: string, f: LogFilter, limit = 100, after?: string): Promise<Log[]> {
  const q = [Query.equal("teamId", teamId), Query.orderDesc("finishedAt"), Query.limit(limit)];
  if (f.taskId) q.push(Query.equal("taskId", f.taskId));
  if (f.by) q.push(Query.equal("by", f.by));
  if (f.outcome) q.push(Query.equal("outcome", f.outcome));
  if (after) q.push(Query.cursorAfter(after));
  return (await adminTables().listRows(DB_ID, T.logs, q)).rows as unknown as Log[];
}

/** Each item's last log, by log id (the board shows them). */
export const lastLogs = async (s: Store) =>
  new Map((await rowsById<Log>(T.logs, s.taskItems.flatMap((i) => (i.lastLogId ? [i.lastLogId] : [])))).map((l) => [l.$id, l]));

/** Await before reading: marks the render as request-time (cacheComponents is on). Loaded once per request (layout + page share it). */
export const db = cache(async (): Promise<Store> => {
  await connection();
  const me = await getMember();
  if (!me) throw new Error("Forbidden"); // the (app) layout redirects before this happens
  return loadStore(me.teamId);
});

export { buildPrompt, canTake, DEFAULT_POLICY };

export const noteOf = (s: Store, taskId: string, memberId: string) =>
  s.memberNotes.find((n) => n.taskId === taskId && n.memberId === memberId)?.text ?? "";

/** The prompt of the version in use (every run uses the latest). */
export const promptOf = (s: Store, task: Task) =>
  s.taskVersions.find((v) => v.taskId === task.$id && v.version === task.currentVersion)?.prompt ?? "";

/** Exactly what this member's Claude receives for the item: policy, prompt, their own note, the row. */
export const claudePrompt = (s: Store, task: Task, item: TaskItem, memberId: string) =>
  buildPrompt(s.settings.policy, promptOf(s, task), noteOf(s, task.$id, memberId), itemPrompt(item));

export { MCP_INSTRUCTIONS, SETUP_PROMPT } from "./mcp/instructions";

/** The claim on an item if its lease has not expired (lease expiry is checked on read, no background job). */
export function activeClaim(s: Store, itemId: string) {
  return s.claims.find((c) => c.$id === itemId && isActive(c, new Date())) ?? null;
}

export const itemsOf = (s: Store, taskId: string) => s.taskItems.filter((i) => i.taskId === taskId).sort((a, b) => a.position - b.position);

/** Display name for a member id. */
export function who(s: Store, by: string): string {
  return s.members.find((m) => m.$id === by)?.name ?? by;
}

export const repeatLabel = (t: Task) => (t.repeatDays ? `every ${t.repeatDays}d${t.repeatFor ? ` for ${t.repeatFor}d` : ""}` : "once");

/** Read-only state of an item for the UI: who is on it, or its last status. */
export function itemState(s: Store, item: TaskItem) {
  const c = activeClaim(s, item.$id);
  if (c) return { label: `${who(s, c.by)} · until ${new Date(c.leaseUntil).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`, key: "in progress" };
  return { label: item.status === "available" ? "free" : item.status, key: item.status === "available" ? "free" : item.status };
}
