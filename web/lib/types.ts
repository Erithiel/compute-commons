export type Role = "lead" | "member";
export type RiskLabel = "report-only" | "changes-files";
export type TaskMode = "once" | "routine";
export type ItemStatus = "available" | "done" | "failed" | "skipped";
export type Outcome = "done" | "failed" | "skipped";

export type Caller =
  | { kind: "member"; memberId: string; role: Role }
  | { kind: "team" }; // a Claude schedule's token: takes approved tasks only

export interface Member { $id: string; teamId: string; userId: string; name: string; role: Role }
export interface Task {
  $id: string; teamId: string; title: string; description: string;
  mode: TaskMode; redoDays: number;      // routine: comes back after redoDays; once: 0
  items: string[];                       // optional list; [] = the task is a single item
  requires: string[];                    // tools/keys the run needs, e.g. ["gh", "node"]
  priority: number;
  currentVersion: number; approvedVersion: number | null;
}
export interface TaskVersion {
  $id: string; taskId: string; version: number; prompt: string; // markdown, may use {{item}}
  riskLabel: RiskLabel; authorId: string; createdAt: string;
}
export interface TaskItem {              // the unit of work and of claiming
  $id: string; teamId: string; taskId: string; item: string; // "" when the task has no list
  status: ItemStatus; lastDoneAt: string | null; lastLogId: string | null;
}
export interface Claim { $id: string /* = taskItemId */; by: string /* memberId or "team" */; claimedAt: string; leaseUntil: string }
export interface Log {
  $id: string; taskItemId: string; taskId: string; by: string; outcome: Outcome; summary: string;
  branchUrl: string | null; version: number; startedAt: string; finishedAt: string;
}
export interface Settings { $id: string; teamId: string; policy: string; maxItemsPerRun: number; maxMinutesPerRun: number }
export interface ApiToken { $id: string; owner: string /* memberId or "team" */; name: string; tokenHash: string; lastUsedAt: string | null; revoked: boolean }
export interface AuditEntry { $id: string; teamId: string; actor: string; action: string; entity: string; before: string | null; after: string | null; at: string }
