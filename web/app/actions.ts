"use server";
// Server actions, backed by Appwrite through lib/*. Each checks the role first; the browser never talks to Appwrite.
// Later each feature can move its slice into its own actions.ts; the exports here keep the pages unchanged meanwhile.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { adminTables, DB_ID, teamRow, T } from "@/lib/appwrite";
import { audit } from "@/lib/audit";
import { requireLead, requireMember } from "@/lib/auth";
import { changeRole, createInvite, removeMember as removeMemberRow, revokeInvite } from "@/lib/teams";
import { saveNote, saveTask as saveTaskRow } from "@/lib/tasks";
import { createToken as newToken, revokeToken as revoke } from "@/lib/tokens";
import type { ApiToken, Role, Settings } from "@/lib/types";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const role = (f: FormData): Role => (str(f, "role") === "lead" ? "lead" : "member");
const done = () => revalidatePath("/", "layout");
const db = () => adminTables();

// --- Tasks (F2). Claiming is never done from the UI: only Claude claims, through MCP (F4/F5). ---
/** Create or edit a task: title, prompt, repeat, assignees, optional rows. A changed prompt is a new version. */
export async function saveTask(f: FormData) {
  const lead = await requireLead();
  const { task, created, newVersion } = await saveTaskRow(lead.teamId, str(f, "id") || null, {
    title: str(f, "title"),
    prompt: String(f.get("prompt") ?? ""),
    repeatDays: str(f, "repeat") === "every" ? Math.max(1, Number(str(f, "repeatDays")) || 7) : 0,
    assignees: f.getAll("assignees").map(String),
    rows: f.getAll("items").map(String),
  }, lead.$id);
  await audit(lead.teamId, lead.$id, created ? "task.create" : "task.edit", task.$id, undefined, { title: task.title, version: task.currentVersion, newVersion });
  done();
  redirect(`/tasks/${task.$id}`);
}
/** Any member: save (or clear) their own note on a task. Only their Claude receives it. */
export async function saveMyNote(f: FormData) {
  const me = await requireMember();
  await saveNote(me.teamId, str(f, "id"), me.$id, String(f.get("note") ?? ""));
  done();
}
export async function suggestChange(f: FormData) {
  const me = await requireMember();
  await audit(me.teamId, me.$id, "task.suggest", str(f, "id"), undefined, str(f, "note"));
  done();
}
/** Board quick-add: a once / anyone task with just a title and a prompt. */
export async function quickTask(f: FormData) {
  const lead = await requireLead();
  const { task } = await saveTaskRow(lead.teamId, null, { title: str(f, "title"), prompt: String(f.get("prompt") ?? ""), repeatDays: 0, assignees: [], rows: [] }, lead.$id);
  await audit(lead.teamId, lead.$id, "task.create", task.$id, undefined, { title: task.title });
  done();
}

// --- Settings: policy (F3), members (F1), tokens (F5) ---
export async function saveSettings(f: FormData) {
  const lead = await requireLead();
  const before = await teamRow<Settings>(T.settings, lead.teamId, lead.teamId);
  const policy = String(f.get("policy") ?? "").replaceAll("\r\n", "\n").trim();
  await db().upsertRow(DB_ID, T.settings, lead.teamId, { teamId: lead.teamId, policy });
  await audit(lead.teamId, lead.$id, "settings.edit", "settings", before?.policy, policy);
  done();
}
export async function makeInvite(_: unknown, f: FormData): Promise<{ link: string } | { error: string } | null> {
  const lead = await requireLead();
  if (!process.env.APP_URL) return { error: "APP_URL is not set on the server." };
  const { code } = await createInvite(lead, str(f, "role") === "lead" ? "lead" : "member");
  done();
  return { link: `${process.env.APP_URL}/join/${code}` }; // shown once, never stored
}
export async function cancelInvite(f: FormData) {
  await revokeInvite(await requireLead(), str(f, "id"));
  done();
}
type Refusal = { error: string } | null; // returned, not thrown: production builds hide thrown action messages
export async function setRole(_: Refusal, f: FormData): Promise<Refusal> {
  const error = await changeRole(await requireLead(), str(f, "id"), role(f));
  if (error) return { error };
  done();
  return null;
}
export async function removeMember(_: Refusal, f: FormData): Promise<Refusal> {
  const error = await removeMemberRow(await requireLead(), str(f, "id"));
  if (error) return { error };
  done();
  return null;
}
export async function leaveTeam(): Promise<Refusal> {
  const me = await requireMember();
  const error = await removeMemberRow(me, me.$id);
  if (error) return { error };
  redirect("/welcome");
}
/** Returns the raw token once; only its hash is stored. The token always belongs to the caller. */
export async function createToken(_: unknown, f: FormData): Promise<{ token: string } | null> {
  const me = await requireMember();
  const scheduled = str(f, "kind") === "schedule";
  const { token, row } = await newToken(me.teamId, me.$id, str(f, "name"), scheduled);
  await audit(me.teamId, me.$id, "token.create", row.$id, undefined, { name: row.name, scheduled });
  done();
  return { token };
}
export async function revokeToken(f: FormData) {
  const me = await requireMember();
  const t = await teamRow<ApiToken>(T.apiTokens, str(f, "id"), me.teamId);
  if (!t || (t.owner !== me.$id && me.role !== "lead")) return;
  await revoke(t.$id);
  await audit(me.teamId, me.$id, "token.revoke", t.$id);
  done();
}
