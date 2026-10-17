// Teams, memberships and invites. Checks that need the database live here; pure rules are in team-rules.ts.
import "server-only";
import { ID, Query } from "node-appwrite";
import { adminTables, allRows, DB_ID, isCode, rowOrNull, T, teamRow } from "./appwrite";
import { audit } from "./audit";
import { DEFAULT_POLICY } from "./tables";
import { hashCode, INVITE_DAYS, inviteProblem, leadProblem, newInviteCode } from "./team-rules";
import type { Invite, Member, Role, Team } from "./types";

const db = () => adminTables();
const now = () => new Date().toISOString();
type User = { $id: string; name: string; email: string };
export const ALREADY = "You are already in a team. Leave it first (Settings) to join another.";

/** The creator becomes the team's first lead. The member row goes first: its unique userId index stops double teams. */
export async function createTeam(user: User, name: string): Promise<string> {
  const teamId = ID.unique();
  const member = { teamId, userId: user.$id, name: user.name || user.email, role: "lead" as const };
  const row = await db().createRow(DB_ID, T.members, ID.unique(), member); // 409 → already in a team (caller shows ALREADY)
  let teamMade = false;
  try {
    await db().createRow(DB_ID, T.teams, teamId, { name: name.trim(), createdBy: user.$id, createdAt: now() });
    teamMade = true;
    await db().createRow(DB_ID, T.settings, teamId, { teamId, policy: DEFAULT_POLICY });
  } catch (e) {
    // Undo the half-made team, or the unique userId index leaves the user stuck as lead of nothing.
    if (teamMade) await db().deleteRow(DB_ID, T.teams, teamId).catch(() => {});
    await db().deleteRow(DB_ID, T.members, row.$id).catch(() => {});
    throw e;
  }
  await audit(teamId, row.$id, "team.create", teamId, undefined, { name: name.trim() });
  return teamId;
}

export async function createInvite(lead: Member, role: Role) {
  const code = newInviteCode();
  const data = {
    teamId: lead.teamId, codeHash: hashCode(code), role, createdBy: lead.$id,
    expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000).toISOString(), usedBy: null, usedAt: null, revoked: false,
  };
  const row = await db().createRow(DB_ID, T.invites, ID.unique(), data);
  await audit(lead.teamId, lead.$id, "invite.create", row.$id, undefined, { role });
  return { code, invite: row as unknown as Invite };
}

export async function findInvite(code: string) {
  const [invite] = await allRows<Invite>(T.invites, [Query.equal("codeHash", hashCode(code))]);
  if (!invite) return null;
  const team = await rowOrNull<Team>(T.teams, invite.teamId); // null when the team row is gone (404)
  if (!team) return null;
  return { invite, team };
}

// ponytail: two people opening the same link in the same instant could both join (check, then mark used).
// The link is secret and one-time; a lock row (as in claims) if this ever matters.
export async function joinTeam(user: User, code: string): Promise<string | null> {
  const found = await findInvite(code);
  const problem = inviteProblem(found?.invite ?? null, new Date());
  if (problem) return problem;
  const { invite } = found!;
  let row;
  try {
    row = await db().createRow(DB_ID, T.members, ID.unique(), { teamId: invite.teamId, userId: user.$id, name: user.name || user.email, role: invite.role });
  } catch (e) {
    if (isCode(e, 409)) return ALREADY;
    throw e;
  }
  await db().updateRow(DB_ID, T.invites, invite.$id, { usedBy: row.$id, usedAt: now() });
  await audit(invite.teamId, row.$id, "member.join", row.$id, undefined, { role: invite.role, invite: invite.$id });
  return null;
}

export async function changeRole(lead: Member, memberId: string, role: Role): Promise<string | null> {
  const members = await allRows<Member>(T.members, [Query.equal("teamId", lead.teamId)]);
  const problem = leadProblem(members, memberId, role);
  if (problem) return problem;
  const before = members.find((m) => m.$id === memberId)!.role;
  await db().updateRow(DB_ID, T.members, memberId, { role });
  await audit(lead.teamId, lead.$id, "member.role", memberId, before, role);
  return null;
}

/** A lead removes someone, or anyone removes themselves (leave team). Their MCP tokens stop working with the row. */
export async function removeMember(actor: Member, memberId: string): Promise<string | null> {
  if (actor.role !== "lead" && actor.$id !== memberId) return "Only a lead can remove someone else.";
  const members = await allRows<Member>(T.members, [Query.equal("teamId", actor.teamId)]);
  const problem = leadProblem(members, memberId, "remove");
  if (problem) return problem;
  const target = members.find((m) => m.$id === memberId)!;
  // Tokens first: if this stops midway, the member row still exists and the action can be retried.
  const tokens = await allRows<{ $id: string }>(T.apiTokens, [Query.equal("owner", memberId), Query.equal("teamId", actor.teamId)]);
  for (const t of tokens) await db().updateRow(DB_ID, T.apiTokens, t.$id, { revoked: true });
  await db().deleteRow(DB_ID, T.members, memberId);
  await audit(actor.teamId, actor.$id, actor.$id === memberId ? "member.leave" : "member.remove", memberId, target, { tokensRevoked: tokens.length });
  return null;
}

export async function revokeInvite(lead: Member, inviteId: string) {
  const inv = await teamRow<Invite>(T.invites, inviteId, lead.teamId);
  if (!inv) return;
  await db().updateRow(DB_ID, T.invites, inv.$id, { revoked: true });
  await audit(lead.teamId, lead.$id, "invite.revoke", inv.$id);
}
