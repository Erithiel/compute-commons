"use server";
// Mock server actions. Each feature moves its slice into its own actions.ts backed by Appwrite.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { requireLead, requireMember } from "@/lib/auth";
import { db, ensureItems, id, logAudit, now, parseItems, TEAM } from "@/lib/mock";
import type { Outcome, RiskLabel, Role, TaskMode } from "@/lib/types";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const list = (v: string) => v.split(",").map((x) => x.trim()).filter(Boolean);
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

// --- Board: simulated MCP calls (removed once F5 lands) and lead actions (F6) ---
export async function claimItem(f: FormData) {
  const me = await requireMember();
  const s = await db();
  const iid = str(f, "id");
  const c = s.claims.find((x) => x.$id === iid);
  if (c && new Date(c.leaseUntil) > new Date()) return; // taken
  s.claims = s.claims.filter((x) => x.$id !== iid);
  s.claims.push({ $id: iid, by: me.$id, claimedAt: now(), leaseUntil: new Date(Date.now() + 120 * 60_000).toISOString() });
  done();
}
export async function finishItem(f: FormData) {
  const me = await requireMember();
  const s = await db();
  const iid = str(f, "id");
  const outcome = str(f, "outcome") as Outcome;
  const c = s.claims.find((x) => x.$id === iid);
  const item = s.taskItems.find((w) => w.$id === iid);
  if (!item || (outcome !== "skipped" && c?.by !== me.$id)) return;
  const task = s.tasks.find((k) => k.$id === item.taskId)!;
  const log = {
    $id: id("l"), taskItemId: iid, taskId: task.$id, by: me.$id, outcome,
    summary: { done: "Done (mock run).", failed: "Failed (mock run).", skipped: "Skipped by hand." }[outcome],
    branchUrl: outcome === "done" ? `https://github.com/rando-ge/example/tree/commons/${task.$id}-${now().slice(0, 10)}` : null,
    version: task.currentVersion, startedAt: c?.claimedAt ?? now(), finishedAt: now(),
  };
  s.logs.unshift(log);
  Object.assign(item, { status: outcome, lastLogId: log.$id, ...(outcome === "done" && { lastDoneAt: log.finishedAt }) });
  s.claims = s.claims.filter((x) => x.$id !== iid);
  done();
}
export async function releaseClaim(f: FormData) {
  const lead = await requireLead();
  const s = await db();
  const c = s.claims.find((x) => x.$id === str(f, "id"));
  s.claims = s.claims.filter((x) => x !== c);
  await logAudit(lead.$id, "claim.release", str(f, "id"), c);
  done();
}
export async function resetItem(f: FormData) {
  const lead = await requireLead();
  const item = (await db()).taskItems.find((w) => w.$id === str(f, "id"));
  if (item) item.status = "available";
  await logAudit(lead.$id, "item.reset", str(f, "id"));
  done();
}

// --- Tasks (F2) ---
/** Create or edit a task. Every save of the prompt is a new immutable version. */
export async function saveTask(f: FormData) {
  const lead = await requireLead();
  const s = await db();
  let task = s.tasks.find((k) => k.$id === str(f, "id"));
  if (!task) {
    task = { $id: id("k"), teamId: TEAM, title: "", description: "", mode: "once", redoDays: 0, items: [], requires: [], priority: 0, currentVersion: 0, approvedVersion: null };
    s.tasks.push(task);
  }
  const mode = str(f, "mode") as TaskMode;
  Object.assign(task, {
    title: str(f, "title"), description: str(f, "description"), mode,
    redoDays: mode === "routine" ? Math.max(1, Number(str(f, "redoDays")) || 7) : 0,
    items: parseItems(str(f, "items")), requires: list(str(f, "requires")), priority: Number(str(f, "priority")) || 0,
  });
  const prompt = str(f, "prompt");
  const cur = s.taskVersions.find((v) => v.taskId === task.$id && v.version === task.currentVersion);
  const riskLabel = str(f, "riskLabel") as RiskLabel;
  if (!cur || cur.prompt !== prompt || cur.riskLabel !== riskLabel) {
    task.currentVersion++;
    s.taskVersions.push({ $id: id("v"), taskId: task.$id, version: task.currentVersion, prompt, riskLabel, authorId: lead.$id, createdAt: now() });
  }
  await ensureItems(task.$id, task.items);
  await logAudit(lead.$id, cur ? "task.edit" : "task.create", task.$id, undefined, { title: task.title, version: task.currentVersion });
  done();
  redirect(`/tasks/${task.$id}`);
}
export async function approveVersion(f: FormData) {
  const lead = await requireLead();
  const task = (await db()).tasks.find((k) => k.$id === str(f, "id"))!;
  const before = task.approvedVersion;
  task.approvedVersion = Number(str(f, "version"));
  await logAudit(lead.$id, "task.approve", task.$id, before, task.approvedVersion);
  done();
}
export async function suggestChange(f: FormData) {
  const me = await requireMember();
  await logAudit(me.$id, "task.suggest", str(f, "id"), undefined, str(f, "note"));
  done();
}
/** Board quick-add: a one-off task with just a title and prompt. */
export async function quickTask(f: FormData) {
  const lead = await requireLead();
  const s = await db();
  const t = { $id: id("k"), teamId: TEAM, title: str(f, "title"), description: "", mode: "once" as const, redoDays: 0, items: [], requires: [], priority: 0, currentVersion: 1, approvedVersion: null };
  s.tasks.push(t);
  s.taskVersions.push({ $id: id("v"), taskId: t.$id, version: 1, prompt: str(f, "prompt"), riskLabel: "report-only", authorId: lead.$id, createdAt: now() });
  await ensureItems(t.$id, []);
  await logAudit(lead.$id, "task.create", t.$id, undefined, { title: t.title });
  done();
}

// --- Settings: policy + budget (F3), members (F1), tokens (F5) ---
export async function saveSettings(f: FormData) {
  const lead = await requireLead();
  const st = (await db()).settings;
  const before = { ...st };
  Object.assign(st, { policy: str(f, "policy"), maxItemsPerRun: Number(str(f, "maxItemsPerRun")), maxMinutesPerRun: Number(str(f, "maxMinutesPerRun")) });
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
  const owner = str(f, "owner") === "team" ? "team" : me.$id;
  if (owner === "team") await requireLead(); // schedule tokens are lead-only
  const token = `cc_${randomBytes(32).toString("base64url")}`;
  (await db()).apiTokens.push({ $id: id("t"), owner, name: str(f, "name") || "token", tokenHash: "mock", lastUsedAt: null, revoked: false });
  await logAudit(me.$id, "token.create", owner);
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
