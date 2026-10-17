// Read model for the pages: one snapshot of the team's data from Appwrite per request.
// Kept under its old name so pages need no edits while the UI is being reworked; rename to lib/data.ts afterwards.
// ponytail: loads every table on each request; fine for one team (hundreds of rows). Query per page when it is not.
import "server-only";
import { cache } from "react";
import { connection } from "next/server";
import { Query } from "node-appwrite";
import { allRows, rowOrNull, T, TEAM_ID } from "./appwrite";
import { canTake, isActive } from "./claims";
import { buildPrompt } from "./prompt";
import { DEFAULT_POLICY } from "./tables";
import type { ApiToken, AuditEntry, Claim, Log, Member, MemberNote, Settings, Task, TaskItem, TaskVersion } from "./types";

export type Store = {
  members: Member[]; tasks: Task[]; taskVersions: TaskVersion[]; taskItems: TaskItem[]; memberNotes: MemberNote[];
  claims: Claim[]; logs: Log[]; settings: Settings; apiTokens: ApiToken[]; audit: AuditEntry[];
};

const team = [Query.equal("teamId", TEAM_ID)];

/** Await before reading: marks the render as request-time (cacheComponents is on). Loaded once per request (layout + page share it). */
export const db = cache(async (): Promise<Store> => {
  await connection();
  const [members, tasks, taskVersions, taskItems, memberNotes, claims, logs, settings, apiTokens, audit] = await Promise.all([
    allRows<Member>(T.members, team),
    allRows<Task>(T.tasks, [...team, Query.orderAsc("$createdAt")]),
    allRows<TaskVersion>(T.taskVersions),
    allRows<TaskItem>(T.taskItems, team),
    allRows<MemberNote>(T.memberNotes),
    allRows<Claim>(T.claims),
    allRows<Log>(T.logs, [Query.orderDesc("finishedAt"), Query.limit(500)]), // ponytail: newest 500; page it when Logs needs more
    rowOrNull<Settings>(T.settings, "settings"),
    allRows<ApiToken>(T.apiTokens),
    allRows<AuditEntry>(T.audit, [...team, Query.orderDesc("at"), Query.limit(200)]),
  ]);
  return {
    members, tasks, taskVersions, taskItems, memberNotes, claims, logs, apiTokens, audit,
    settings: settings ?? { $id: "settings", teamId: TEAM_ID, policy: DEFAULT_POLICY },
  };
});

export { buildPrompt, canTake, DEFAULT_POLICY };

export const noteOf = (s: Store, taskId: string, memberId: string) =>
  s.memberNotes.find((n) => n.taskId === taskId && n.memberId === memberId)?.text ?? "";

export { MCP_INSTRUCTIONS, SETUP_PROMPT } from "./mcp/instructions";

/** The claim on an item if its lease has not expired (lease expiry is checked on read, no background job). */
export function activeClaim(s: Store, itemId: string) {
  return s.claims.find((c) => c.$id === itemId && isActive(c, new Date())) ?? null;
}

export const itemsOf = (s: Store, taskId: string) => s.taskItems.filter((i) => i.taskId === taskId).sort((a, b) => a.position - b.position);

/** Display name for a member id; adds "scheduled" for runs from that person's Claude schedule. */
export function who(s: Store, by: string, scheduled = false): string {
  if (scheduled) return `${who(s, by)} · ⏱ scheduled`;
  return s.members.find((m) => m.$id === by)?.name ?? by;
}

export const repeatLabel = (t: Task) => (t.repeatDays ? `every ${t.repeatDays}d` : "once");

/** Read-only state of an item for the UI: who is on it, or its last status. */
export function itemState(s: Store, item: TaskItem) {
  const c = activeClaim(s, item.$id);
  if (c) return { label: `${who(s, c.by, c.scheduled)} · until ${new Date(c.leaseUntil).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`, key: "in progress" };
  return { label: item.status === "available" ? "free" : item.status, key: item.status === "available" ? "free" : item.status };
}
