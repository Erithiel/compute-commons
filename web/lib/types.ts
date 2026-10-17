export type Role = "lead" | "member";
export type ItemStatus = "available" | "done" | "failed" | "skipped";
export type Outcome = "done" | "failed" | "skipped";

export interface Team { $id: string; name: string; createdBy: string /* Appwrite user id */; createdAt: string }

/** One-time link to join a team. Only the hash of the code is stored. */
export interface Invite {
  $id: string; teamId: string; codeHash: string; role: Role; createdBy: string /* memberId */;
  expiresAt: string; usedBy: string | null /* memberId */; usedAt: string | null; revoked: boolean;
}

export type Caller =
  { kind: "member"; memberId: string; teamId: string; role: Role; scheduled: boolean }; // scheduled = token made for a Claude schedule (logs are tagged "scheduled")

export interface Member { $id: string; teamId: string; userId: string; name: string; role: Role }

/** A task is a title and a prompt. The prompt can ask for anything; we only store, hand out and track it. */
export interface Task {
  $id: string; teamId: string; title: string;
  repeatDays: number;                    // 0 = once; N = each item comes back N days after it was last done
  assignees: string[];                   // member ids; [] = anyone
  currentVersion: number;                // the prompt lives in task_versions; every run uses the latest
}
export interface TaskVersion { $id: string; teamId: string; taskId: string; version: number; prompt: string; authorId: string; createdAt: string }

/** A member's own addition to a task's prompt (e.g. where their files are). Only their Claude receives it. */
export interface MemberNote { $id: string; teamId: string; taskId: string; memberId: string; text: string; updatedAt: string }

/** The unit that is claimed and done. A task without rows has one hidden item with text "". */
export interface TaskItem {
  $id: string; teamId: string; taskId: string; text: string; position: number;
  status: ItemStatus; lastDoneAt: string | null; lastLogId: string | null;
}
export interface Claim { $id: string /* = taskItemId */; teamId: string; by: string /* memberId */; scheduled: boolean; claimedAt: string; leaseUntil: string }
export interface Log {
  $id: string; teamId: string; taskId: string; itemId: string; item: string /* row text at the time, "" for the whole task */;
  by: string /* memberId */; scheduled: boolean; outcome: Outcome; summary: string;
  details: string | null;                // free text from Claude: what it did, where the result is, notes
  version: number; startedAt: string; finishedAt: string;
}
export interface Settings { $id: string; teamId: string; policy: string }
export interface ApiToken { $id: string; teamId: string; owner: string /* memberId */; scheduled: boolean; name: string; tokenHash: string; lastUsedAt: string | null; revoked: boolean }
export interface AuditEntry { $id: string; teamId: string; actor: string; action: string; entity: string; before: string | null; after: string | null; at: string }
