"use server";
// Mock server actions. Each feature moves its slice into its own actions.ts backed by Appwrite.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { requireLead, requireMember } from "@/lib/auth";
import { db, id, logAudit, now, TEAM } from "@/lib/mock";
import type { Role, Task } from "@/lib/types";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const done = () => revalidatePath("/", "layout");

// --- Auth (F1) ---
export async function signIn(f: FormData) {
  (await cookies()).set("mock_member", str(f, "member"), { httpOnly: true, sameSite: "lax", path: "/" });
  redirect("/board");
}
export async function signOut() {
  (await cookies()).delete("mock_member");
  redirect("/login");
}

// --- Tasks (F2). Claiming is never done from the UI: only Claude claims, through MCP (F4/F5). ---
/** Keep a task's rows in sync with the editor table. A task without rows gets one hidden "" item. */
async function syncItems(taskId: string, texts: string[]) {
  const s = await db();
  const want = texts.length ? texts : [""];
  const existing = s.taskItems.filter((i) => i.taskId === taskId);
  // Rows removed from the table disappear; their logs keep the row text.
  s.taskItems = s.taskItems.filter((i) => i.taskId !== taskId || want.includes(i.text));
  want.forEach((text, position) => {
    const found = existing.find((i) => i.text === text);
    if (found) found.position = position;
    else s.taskItems.push({ $id: id("i"), teamId: TEAM, taskId, text, position, status: "available", lastDoneAt: null, lastLogId: null });
  });
}

/** Create or edit a task: title, prompt, repeat, assignees, optional rows. Every change to the prompt is a new version. */
export async function saveTask(f: FormData) {
  const lead = await requireLead();
  const s = await db();
  let task: Task | undefined = s.tasks.find((k) => k.$id === str(f, "id"));
  if (!task) {
    task = { $id: id("k"), teamId: TEAM, title: "", repeatDays: 0, assignees: [], currentVersion: 0 };
    s.tasks.push(task);
  }
  Object.assign(task, {
    title: str(f, "title"),
    repeatDays: str(f, "repeat") === "every" ? Math.max(1, Number(str(f, "repeatDays")) || 7) : 0,
    assignees: f.getAll("assignees").map(String),
  });
  const prompt = str(f, "prompt").replaceAll("\r\n", "\n"); // browsers send textarea line breaks as \r\n
  const cur = s.taskVersions.find((v) => v.taskId === task.$id && v.version === task.currentVersion);
  if (!cur || cur.prompt !== prompt) {
    task.currentVersion++;
    s.taskVersions.push({ $id: id("v"), taskId: task.$id, version: task.currentVersion, prompt, authorId: lead.$id, createdAt: now() });
  }
  await syncItems(task.$id, [...new Set(f.getAll("items").map((x) => String(x).trim()).filter(Boolean))]);
  await logAudit(lead.$id, cur ? "task.edit" : "task.create", task.$id, undefined, { title: task.title, version: task.currentVersion });
  done();
  redirect(`/tasks/${task.$id}`);
}
/** Any member: save (or clear) their own note on a task. Only their Claude receives it. */
export async function saveMyNote(f: FormData) {
  const me = await requireMember();
  const s = await db();
  const taskId = str(f, "id");
  const text = str(f, "note").replaceAll("\r\n", "\n");
  s.memberNotes = s.memberNotes.filter((n) => !(n.taskId === taskId && n.memberId === me.$id));
  if (text) s.memberNotes.push({ $id: id("n"), taskId, memberId: me.$id, text, updatedAt: now() });
  done();
}
export async function suggestChange(f: FormData) {
  const me = await requireMember();
  await logAudit(me.$id, "task.suggest", str(f, "id"), undefined, str(f, "note"));
  done();
}
/** Board quick-add: a once / anyone task with just a title and a prompt. */
export async function quickTask(f: FormData) {
  const lead = await requireLead();
  const s = await db();
  const t: Task = { $id: id("k"), teamId: TEAM, title: str(f, "title"), repeatDays: 0, assignees: [], currentVersion: 1 };
  s.tasks.push(t);
  s.taskVersions.push({ $id: id("v"), taskId: t.$id, version: 1, prompt: str(f, "prompt"), authorId: lead.$id, createdAt: now() });
  await syncItems(t.$id, []);
  await logAudit(lead.$id, "task.create", t.$id, undefined, { title: t.title });
  done();
}

// --- Settings: policy (F3), members (F1), tokens (F5) ---
export async function saveSettings(f: FormData) {
  const lead = await requireLead();
  const st = (await db()).settings;
  const before = { ...st };
  st.policy = str(f, "policy");
  await logAudit(lead.$id, "settings.edit", st.$id, before, st);
  done();
}
export async function addMember(f: FormData) {
  const lead = await requireLead();
  const m = { $id: id("m"), teamId: TEAM, userId: id("u"), name: str(f, "name"), role: str(f, "role") as Role };
  (await db()).members.push(m);
  await logAudit(lead.$id, "member.add", m.$id, undefined, m);
  done();
}
export async function setRole(f: FormData) {
  const lead = await requireLead();
  const m = (await db()).members.find((x) => x.$id === str(f, "id"))!;
  const before = m.role;
  m.role = str(f, "role") as Role;
  await logAudit(lead.$id, "member.role", m.$id, before, m.role);
  done();
}
export async function removeMember(f: FormData) {
  const lead = await requireLead();
  const s = await db();
  s.members = s.members.filter((m) => m.$id !== str(f, "id"));
  await logAudit(lead.$id, "member.remove", str(f, "id"));
  done();
}
/** Returns the raw token once; only a hash would be stored for real (F5). */
export async function createToken(_: unknown, f: FormData): Promise<{ token: string } | null> {
  const me = await requireMember();
  const scheduled = str(f, "kind") === "schedule";
  const token = `cc_${randomBytes(32).toString("base64url")}`;
  (await db()).apiTokens.push({ $id: id("t"), owner: me.$id, scheduled, name: str(f, "name") || "token", tokenHash: "mock", lastUsedAt: null, revoked: false });
  await logAudit(me.$id, "token.create", scheduled ? "schedule" : "personal");
  done();
  return { token };
}
export async function revokeToken(f: FormData) {
  const me = await requireMember();
  const t = (await db()).apiTokens.find((x) => x.$id === str(f, "id"));
  if (!t || (t.owner !== me.$id && me.role !== "lead")) return;
  t.revoked = true;
  await logAudit(me.$id, "token.revoke", t.$id);
  done();
}
