// Team admin writes shared by the web app (server actions) and the MCP tools. Callers check the lead role first.
import "server-only";
import { ID } from "node-appwrite";
import { adminTables, DB_ID, rowOrNull, T, TEAM_ID } from "./appwrite";
import { audit } from "./audit";
import { normalise } from "./tasks";
import type { Member, Role, Settings } from "./types";

const db = () => adminTables();

async function teamMember(memberId: string) {
  const m = await rowOrNull<Member>(T.members, memberId);
  if (!m || m.teamId !== TEAM_ID) throw new Error("Member not found");
  return m;
}

// ponytail: members without Appwrite users until F1 (invite by email, first-lead bootstrap).
export async function addMember(actorId: string, name: string, role: Role) {
  const m = { teamId: TEAM_ID, userId: ID.unique(), name: name.trim(), role };
  const row = await db().createRow(DB_ID, T.members, ID.unique(), m);
  await audit(actorId, "member.add", row.$id, undefined, m);
  return row as unknown as Member;
}

/** A lead cannot demote themselves (the team could be left without a lead). */
export async function setRole(actorId: string, memberId: string, role: Role) {
  const m = await teamMember(memberId);
  if (m.$id === actorId && role !== "lead") throw new Error("You cannot demote yourself.");
  await db().updateRow(DB_ID, T.members, m.$id, { role });
  await audit(actorId, "member.role", m.$id, m.role, role);
  return { ...m, role };
}

/** A lead cannot remove themselves. The removed member's tokens stop working: verifyBearer needs the member row. */
export async function removeMember(actorId: string, memberId: string) {
  const m = await teamMember(memberId);
  if (m.$id === actorId) throw new Error("You cannot remove yourself.");
  await db().deleteRow(DB_ID, T.members, m.$id);
  await audit(actorId, "member.remove", m.$id, m);
  return m;
}

export async function savePolicy(actorId: string, text: string) {
  const before = await rowOrNull<Settings>(T.settings, "settings");
  const policy = normalise(text);
  await db().upsertRow(DB_ID, T.settings, "settings", { teamId: TEAM_ID, policy });
  await audit(actorId, "settings.edit", "settings", before?.policy, policy);
}
