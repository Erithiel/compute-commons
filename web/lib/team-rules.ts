// Pure rules for accounts and teams. No I/O, so they are unit tested.
import { createHash, randomBytes } from "node:crypto";
import type { Invite, Member, Role } from "./types";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export const INVITE_DAYS = 7;
export const newInviteCode = () => randomBytes(18).toString("base64url"); // 24 url-safe chars
export const hashCode = (code: string) => sha256(code);

export const INVITE_USED = "This invite link was already used. Ask your lead for a new one.";

/** Why an invite cannot be used, or null if it can. */
export function inviteProblem(inv: Invite | null, now: Date): string | null {
  if (!inv || inv.revoked) return "This invite link is not valid.";
  if (inv.usedBy) return INVITE_USED;
  if (new Date(inv.expiresAt).getTime() <= now.getTime()) return "This invite link has expired. Ask your lead for a new one.";
  return null;
}

/** Why a role change / removal / leaving is refused, or null. A team always keeps one lead. */
export function leadProblem(members: Member[], targetId: string, change: Role | "remove"): string | null {
  const target = members.find((m) => m.$id === targetId);
  if (!target) return "Member not found.";
  const leads = members.filter((m) => m.role === "lead").length;
  if (target.role === "lead" && change !== "lead" && leads === 1) return "A team needs at least one lead. Make someone else lead first.";
  return null;
}

/** Key for one lead set: the leads' ids and $updatedAt, so a later set that looks the same (after a role change) hashes differently. */
export const leadsKey = (teamId: string, members: Member[]) =>
  `leads|${teamId}|` + members.filter((m) => m.role === "lead").map((m) => `${m.$id}:${m.$updatedAt}`).sort().join(",");

export const LOGIN_MAX_FAILS = 5;
export const LOGIN_WINDOW_MS = 15 * 60_000;
/** Row id for login_attempts: Appwrite ids are at most 36 chars. */
export const emailKey = (email: string) => sha256(email.trim().toLowerCase()).slice(0, 36);
/** Fixed 15-minute windows. Each email gets slots 1..5 per window; the slot's row id is deterministic, so a new window needs no reset. */
export const loginWindow = (now: Date) => Math.floor(now.getTime() / LOGIN_WINDOW_MS);
export const attemptKey = (email: string, now: Date, slot: number) => sha256(`${emailKey(email)}:${loginWindow(now)}:${slot}`).slice(0, 36);
/** Whole minutes until the current window ends (when a locked email unlocks). */
export const minutesLeft = (now: Date) => Math.ceil((LOGIN_WINDOW_MS - (now.getTime() % LOGIN_WINDOW_MS)) / 60_000);

/** Only same-site paths: blocks open redirects through ?next=. */
export const safeNext = (next: string | null | undefined, fallback: string) =>
  next && /^\/(?![/\\])[^\x00-\x1f\x7f]*$/.test(next) ? next : fallback;
