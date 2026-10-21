// The team and its memberships. Checks that need the database live here; pure rules are in team-rules.ts.
import "server-only";
import { createHash } from "node:crypto";
import { ID, Query } from "node-appwrite";
import { adminTables, allRows, DB_ID, isCode, rowOrNull, T, teamRow } from "./appwrite";
import { audit } from "./audit";
import { DEFAULT_POLICY } from "./tables";
import { normalise } from "./tasks";
import type { CrmUser } from "./crm";
import { leadProblem, leadsKey } from "./team-rules";
import type { Member, Role, Settings, Team } from "./types";

const db = () => adminTables();
const now = () => new Date().toISOString();
const LEADS_BUSY = "Someone else just changed this team's leads. Reload and try again.";

/** One-winner lock: a takeovers row whose id is a hash of key. Returns the id, or null if someone already took it (409). */
async function marker(key: string, itemId: string): Promise<string | null> {
  const id = createHash("sha256").update(key).digest("hex").slice(0, 36);
  try {
    await db().createRow(DB_ID, T.takeovers, id, { itemId });
    return id;
  } catch (e) {
    if (isCode(e, 409)) return null;
    throw e;
  }
}

/** One team for now (D32): everyone approved in the CRM is in it. "rando" is also the sample data's team. */
export const TEAM_ID = "rando";

/** The CRM user's member row. Their first visit adds them; the team's first person (no lead yet) becomes its lead. */
export async function memberFor(user: CrmUser): Promise<Member> {
  const [found] = await allRows<Member>(T.members, [Query.equal("userId", user.id)]);
  if (found) return found;
  await ensureTeam(user);
  const role: Role = (await allRows<Member>(T.members, [Query.equal("teamId", TEAM_ID), Query.equal("role", "lead")])).length ? "member" : "lead";
  try {
    const row = await db().createRow(DB_ID, T.members, ID.unique(), { teamId: TEAM_ID, userId: user.id, name: user.name, role });
    await audit(TEAM_ID, row.$id, "member.join", row.$id, undefined, { role });
    return row as unknown as Member;
  } catch (e) {
    if (!isCode(e, 409)) throw e; // two first visits at once: the unique userId index lets one through
    return (await allRows<Member>(T.members, [Query.equal("userId", user.id)]))[0];
  }
}

async function ensureTeam(user: CrmUser) {
  if (await rowOrNull<Team>(T.teams, TEAM_ID)) return;
  try {
    await db().createRow(DB_ID, T.teams, TEAM_ID, { name: "Rando", createdBy: user.id, createdAt: now() });
  } catch (e) {
    if (isCode(e, 409)) return;
    throw e;
  }
  await db().upsertRow(DB_ID, T.settings, TEAM_ID, { teamId: TEAM_ID, policy: DEFAULT_POLICY });
  await audit(TEAM_ID, user.id, "team.create", TEAM_ID, undefined, { name: "Rando" });
}

/** Taking a lead away needs the marker for the current lead set: two leads removing each other at once cannot both win. */
async function takeLeads(members: Member[], teamId: string, targetId: string, keepsLead: boolean) {
  const lead = members.find((m) => m.$id === targetId)?.role === "lead" && !keepsLead;
  return lead ? marker(leadsKey(teamId, members), teamId) : "";
}
/** Runs the write; a failed write frees the marker so it does not block that lead set forever. */
async function guarded(lock: string, write: () => Promise<unknown>) {
  try { await write(); } catch (e) {
    if (lock) await db().deleteRow(DB_ID, T.takeovers, lock).catch(() => {});
    throw e;
  }
}

export async function changeRole(lead: Member, memberId: string, role: Role): Promise<string | null> {
  const members = await allRows<Member>(T.members, [Query.equal("teamId", lead.teamId)]);
  const problem = leadProblem(members, memberId, role);
  if (problem) return problem;
  const before = members.find((m) => m.$id === memberId)!.role;
  if (before === role) return null; // no-op: a write would bump $updatedAt and change the lead-set key
  const lock = await takeLeads(members, lead.teamId, memberId, role === "lead");
  if (lock === null) return LEADS_BUSY;
  await guarded(lock, async () => { await db().updateRow(DB_ID, T.members, memberId, { role }); });
  await audit(lead.teamId, lead.$id, "member.role", memberId, before, role);
  return null;
}

/** The team policy, placed before every task prompt. Shared by the settings page and the MCP set_policy tool. */
export async function savePolicy(lead: Member, text: string) {
  const before = await teamRow<Settings>(T.settings, lead.teamId, lead.teamId);
  const policy = normalise(text);
  await db().upsertRow(DB_ID, T.settings, lead.teamId, { teamId: lead.teamId, policy });
  await audit(lead.teamId, lead.$id, "settings.edit", lead.teamId, before?.policy, policy);
}
