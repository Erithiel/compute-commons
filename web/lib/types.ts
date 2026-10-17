export type Role = "lead" | "member";
export type TaskMode = "once" | "routine";
export type ItemStatus = "available" | "done" | "failed" | "skipped";
export type Outcome = "done" | "failed" | "skipped";

export type Caller =
  { kind: "member"; memberId: string; role: Role; scheduled: boolean }; // scheduled = token made for a Claude schedule (logs are tagged "scheduled")

export interface Member { $id: string; teamId: string; userId: string; name: string; role: Role }
export interface Task {
  $id: string; teamId: string; title: string; description: string;
  mode: TaskMode; redoDays: number;      // routine: comes back after redoDays; once: 0
  items: string[];                       // optional list; [] = the task is a single item
  assignees: string[];                   // member ids; [] = anyone
  priority: number;
  currentVersion: number;               // every run uses the latest prompt; older versions are history
}
export interface TaskVersion {
  $id: string; taskId: string; version: number; prompt: string; // markdown, may use {{item}}
  authorId: string; createdAt: string;
}
export interface TaskItem {              // the unit of work and of claiming
  $id: string; teamId: string; taskId: string; item: string; // "" when the task has no list
  status: ItemStatus; lastDoneAt: string | null; lastLogId: string | null;
}
export interface Claim { $id: string /* = taskItemId */; by: string /* memberId */; scheduled: boolean; claimedAt: string; leaseUntil: string }
export interface Log {
  $id: string; taskItemId: string; taskId: string; by: string /* memberId */; scheduled: boolean; outcome: Outcome; summary: string;
  details: string | null;                // free text from Claude: what it did, where the result is (link, file, branch…), notes
  version: number; startedAt: string; finishedAt: string;
}
export interface Settings { $id: string; teamId: string; policy: string }
export interface ApiToken { $id: string; owner: string /* memberId */; scheduled: boolean; name: string; tokenHash: string; lastUsedAt: string | null; revoked: boolean }
export interface AuditEntry { $id: string; teamId: string; actor: string; action: string; entity: string; before: string | null; after: string | null; at: string }
