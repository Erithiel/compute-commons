"use server";
// Server actions, backed by Appwrite through lib/*. Each checks the role first; the browser never talks to Appwrite.
// Later each feature can move its slice into its own actions.ts; the exports here keep the pages unchanged meanwhile.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { rowOrNull, T } from "@/lib/appwrite";
import { audit } from "@/lib/audit";
import { requireLead, requireMember } from "@/lib/auth";
import { rowText, saveNote, saveTask as saveTaskRow } from "@/lib/tasks";
import * as team from "@/lib/team";
import { createToken as newToken, revokeToken as revoke } from "@/lib/tokens";
import type { ApiToken, Role } from "@/lib/types";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const role = (f: FormData): Role => (str(f, "role") === "lead" ? "lead" : "member");
const done = () => revalidatePath("/", "layout");

// --- Auth (F1 replaces this mock login with Appwrite sessions) ---
export async function signIn(f: FormData) {
  (await cookies()).set("mock_member", str(f, "member"), { httpOnly: true, sameSite: "lax", path: "/" });
  redirect("/board");
}
export async function signOut() {
  (await cookies()).delete("mock_member");
  redirect("/login");
}

// --- Tasks (F2). Claiming is never done from the UI: only Claude claims, through MCP (F4/F5). ---
/** Create or edit a task: title, prompt, repeat, assignees, optional rows. A changed prompt is a new version. */
export async function saveTask(f: FormData) {
  const lead = await requireLead();
  const every = str(f, "repeat") === "every";
  const cells = f.getAll("items").map((v) => { try { return (JSON.parse(String(v)) as unknown[]).map(String); } catch { return [String(v)]; } });
  const { task, created, newVersion } = await saveTaskRow(str(f, "id") || null, {
    title: str(f, "title"),
    prompt: String(f.get("prompt") ?? ""),
    repeatDays: every ? Math.max(1, Number(str(f, "repeatDays")) || 1) : 0,
    // "for a [1] [month]": the repeat stops that many days after creation. ponytail: a month is 30 days.
    repeatFor: every ? Math.max(0, Number(str(f, "repeatFor")) || 0) * (Number(str(f, "repeatForUnit")) || 1) : 0,
    assignees: f.getAll("assignees").map(String),
    columns: f.getAll("columns").map(String),
    rows: cells.map(rowText),
    cells,
  }, lead.$id);
  if (created && str(f, "myNote")) await saveNote(task.$id, lead.$id, String(f.get("myNote")));
  await audit(lead.$id, created ? "task.create" : "task.edit", task.$id, undefined, { title: task.title, version: task.currentVersion, newVersion });
  done();
  redirect(`/tasks/${task.$id}`);
}
/** Any member: save (or clear) their own note on a task. Only their Claude receives it. */
export async function saveMyNote(f: FormData) {
  const me = await requireMember();
  await saveNote(str(f, "id"), me.$id, String(f.get("note") ?? ""));
  done();
}
export async function suggestChange(f: FormData) {
  const me = await requireMember();
  await audit(me.$id, "task.suggest", str(f, "id"), undefined, str(f, "note"));
  done();
}
/** Board quick-add: a once / anyone task with just a title and a prompt. */
export async function quickTask(f: FormData) {
  const lead = await requireLead();
  const { task } = await saveTaskRow(null, { title: str(f, "title"), prompt: String(f.get("prompt") ?? ""), repeatDays: 0, assignees: [], rows: [] }, lead.$id);
  await audit(lead.$id, "task.create", task.$id, undefined, { title: task.title });
  done();
}

// --- Settings: policy (F3), members (F1), tokens (F5). Member and policy writes live in lib/team.ts (shared with MCP). ---
export async function saveSettings(f: FormData) {
  const lead = await requireLead();
  await team.savePolicy(lead.$id, String(f.get("policy") ?? ""));
  done();
}
export async function addMember(f: FormData) {
  const lead = await requireLead();
  await team.addMember(lead.$id, str(f, "name"), role(f));
  done();
}
export async function setRole(f: FormData) {
  const lead = await requireLead();
  await team.setRole(lead.$id, str(f, "id"), role(f));
  done();
}
export async function removeMember(f: FormData) {
  const lead = await requireLead();
  await team.removeMember(lead.$id, str(f, "id"));
  done();
}
/** Returns the raw token once; only its hash is stored. The token always belongs to the caller. */
export async function createToken(_: unknown, f: FormData): Promise<{ token: string } | null> {
  const me = await requireMember();
  const scheduled = str(f, "kind") === "schedule";
  const { token, row } = await newToken(me.$id, str(f, "name"), scheduled);
  await audit(me.$id, "token.create", row.$id, undefined, { name: row.name, scheduled });
  done();
  return { token };
}
export async function revokeToken(f: FormData) {
  const me = await requireMember();
  const t = await rowOrNull<ApiToken>(T.apiTokens, str(f, "id"));
  if (!t || (t.owner !== me.$id && me.role !== "lead")) return;
  await revoke(t.$id);
  await audit(me.$id, "token.revoke", t.$id);
  done();
}
