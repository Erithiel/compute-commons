// Pure rules for accounts and teams. No I/O, so they are unit tested.
import type { Member, Role } from "./types";

/** Why a role change is refused, or null. A team always keeps one lead. */
export function leadProblem(members: Member[], targetId: string, change: Role): string | null {
  const target = members.find((m) => m.$id === targetId);
  if (!target) return "Member not found.";
  const leads = members.filter((m) => m.role === "lead").length;
  if (target.role === "lead" && change !== "lead" && leads === 1) return "A team needs at least one lead. Make someone else lead first.";
  return null;
}

/** Key for one lead set: the leads' ids and $updatedAt, so a later set that looks the same (after a role change) hashes differently. */
export const leadsKey = (teamId: string, members: Member[]) =>
  `leads|${teamId}|` + members.filter((m) => m.role === "lead").map((m) => `${m.$id}:${m.$updatedAt}`).sort().join(",");

/** Only same-site paths: blocks open redirects through ?next=. */
export const safeNext = (next: string | null | undefined, fallback: string) =>
  next && /^\/(?![/\\])[^\x00-\x1f\x7f]*$/.test(next) ? next : fallback;
