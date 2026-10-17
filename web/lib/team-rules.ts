// Pure rules for accounts and teams. No I/O, so they are unit tested.
import { createHash, randomBytes } from "node:crypto";
import type { Invite, Member, Role } from "./types";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export const INVITE_DAYS = 7;
export const newInviteCode = () => randomBytes(18).toString("base64url"); // 24 url-safe chars
export const hashCode = (code: string) => sha256(code);

/** Why an invite cannot be used, or null if it can. */
export function inviteProblem(inv: Invite | null, now: Date): string | null {
  if (!inv || inv.revoked) return "This invite link is not valid.";
  if (inv.usedBy) return "This invite link was already used. Ask your lead for a new one.";
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

export const LOGIN_MAX_FAILS = 5;
export const LOGIN_WINDOW_MS = 15 * 60_000;
/** Row id for login_attempts: Appwrite ids are at most 36 chars. */
export const emailKey = (email: string) => sha256(email.trim().toLowerCase()).slice(0, 36);
export const loginLocked = (a: { fails: number; windowStart: string } | null, now: Date) =>
  !!a && a.fails >= LOGIN_MAX_FAILS && now.getTime() - new Date(a.windowStart).getTime() < LOGIN_WINDOW_MS;

/** Only same-site paths: blocks open redirects through ?next=. */
export const safeNext = (next: string | null | undefined, fallback: string) =>
  next && /^\/(?![/\\])[^\x00-\x1f\x7f]*$/.test(next) ? next : fallback;
