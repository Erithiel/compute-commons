// Claim engine (F4): what prevents double work. Only Claude claims (through MCP); the web app only reads.
// The lock is the claims row itself: its id is the task item id, so a second createRow gets HTTP 409.
import "server-only";
import { createHash } from "node:crypto";
import { ID, Query } from "node-appwrite";
import { adminTables, allRows, DB_ID, isCode, rowOrNull, rowsById, T, teamRow } from "./appwrite";
import type { Caller, Claim, Log, Task, TaskItem } from "./types";

const DAY = 86_400_000;
export const LEASE_MINUTES = 120;
export type ClaimFail = "taken" | "done" | "not-assigned" | "not-found";

// --- Pure rules (unit tested) ---

/** No assignees = anyone; otherwise only those listed (their Claude schedules included). */
export const canTake = (task: Task, memberId: string) => task.assignees.length === 0 || task.assignees.includes(memberId);

export const isActive = (claim: Claim | null, now: Date) => !!claim && new Date(claim.leaseUntil).getTime() > now.getTime();

/** Free to work on now: not held, and not done (a repeating task's item comes back repeatDays after it was done). */
export function isEligible(item: TaskItem, task: Task, claim: Claim | null, now: Date) {
  if (isActive(claim, now)) return false;
  if (item.status !== "done") return true;
  if (!task.repeatDays || !item.lastDoneAt || repeatEnded(task, now)) return false;
  return now.getTime() - new Date(item.lastDoneAt).getTime() >= task.repeatDays * DAY;
}

/** "Every N days for a month": the repeat stops repeatFor days after the task was created (0 = never stops). */
export const repeatEnded = (task: Task, now: Date) =>
  !!task.repeatFor && !!task.$createdAt && now.getTime() >= new Date(task.$createdAt).getTime() + task.repeatFor * DAY;

/** next_task holds back an item from the member who failed or skipped it for this long, so a run always reaches "nothing left". */
export const RETRY_AFTER_HOURS = 12;
export const gaveUpRecently = (log: Log | null, memberId: string, now: Date) =>
  !!log && log.by === memberId && log.outcome !== "done" && now.getTime() - new Date(log.finishedAt).getTime() < RETRY_AFTER_HOURS * 3_600_000;

/** Never-done first, then oldest done; ties keep the given order (task order, then row position). */
export const sortWork = (items: TaskItem[]) =>
  [...items].sort((a, b) => (a.lastDoneAt ? new Date(a.lastDoneAt).getTime() : -Infinity) - (b.lastDoneAt ? new Date(b.lastDoneAt).getTime() : -Infinity)
    || (a.taskId === b.taskId ? a.position - b.position : 0));

// --- Database ---

const db = () => adminTables();
const iso = (d: Date) => d.toISOString();
const leaseEnd = (now: Date, minutes: number) => iso(new Date(now.getTime() + minutes * 60_000));

/** Runs the staged writes in one Appwrite transaction (all or nothing). */
async function inTransaction(stage: (tx: string) => Promise<unknown>) {
  const tx = (await db().createTransaction()).$id;
  try {
    await stage(tx);
    await db().updateTransaction(tx, true);
  } catch (e) {
    await db().updateTransaction(tx, false, true).catch(() => {});
    throw e;
  }
}

/** Items the caller may claim right now, best first, with their task and last log. */
export async function listEligible(caller: Caller, limit = 10) {
  const now = new Date();
  const [tasks, items, claims] = await Promise.all([
    allRows<Task>(T.tasks, [Query.equal("teamId", caller.teamId)]),
    allRows<TaskItem>(T.taskItems, [Query.equal("teamId", caller.teamId), Query.orderAsc("position")]),
    allRows<Claim>(T.claims, [Query.equal("teamId", caller.teamId)]),
  ]);
  const taskOf = new Map(tasks.filter((t) => canTake(t, caller.memberId)).map((t) => [t.$id, t]));
  const claimOf = new Map(claims.map((c) => [c.$id, c]));
  const order = new Map(tasks.map((t, i) => [t.$id, i]));
  const free = items
    .filter((i) => taskOf.has(i.taskId) && isEligible(i, taskOf.get(i.taskId)!, claimOf.get(i.$id) ?? null, now))
    .sort((a, b) => order.get(a.taskId)! - order.get(b.taskId)! || a.position - b.position);
  const picked = sortWork(free).slice(0, limit);
  const logIds = picked.map((i) => i.lastLogId).filter((x): x is string => !!x);
  const logOf = new Map((await rowsById<Log>(T.logs, logIds)).map((l) => [l.$id, l]));
  return picked.map((item) => ({ item, task: taskOf.get(item.taskId)!, lastLog: (item.lastLogId && logOf.get(item.lastLogId)) || null }));
}

/** Take one item. The server is the only judge of "free". */
export async function claim(itemId: string, caller: Caller, leaseMinutes = LEASE_MINUTES):
  Promise<{ ok: true; leaseUntil: string } | { ok: false; reason: ClaimFail }> {
  const item = await rowOrNull<TaskItem>(T.taskItems, itemId);
  const task = item && await rowOrNull<Task>(T.tasks, item.taskId);
  if (!item || !task || item.teamId !== caller.teamId) return { ok: false, reason: "not-found" };
  if (!canTake(task, caller.memberId)) return { ok: false, reason: "not-assigned" };
  const now = new Date();
  if (!isEligible(item, task, null, now)) return { ok: false, reason: "done" };

  const data = { teamId: caller.teamId, by: caller.memberId, claimedAt: iso(now), leaseUntil: leaseEnd(now, leaseMinutes) };
  try {
    await db().createRow(DB_ID, T.claims, itemId, data);
  } catch (e) {
    if (!isCode(e, 409)) throw e;
    const held = await rowOrNull<Claim>(T.claims, itemId);
    if (isActive(held, now)) return { ok: false, reason: "taken" };
    // Expired (or released a moment ago). Only one claimer may replace it: whoever creates the takeover marker first.
    try {
      if (held) {
        const marker = createHash("sha256").update(`${itemId}|${held.claimedAt}`).digest("hex").slice(0, 36);
        await db().createRow(DB_ID, T.takeovers, marker, { itemId });
        await db().updateRow(DB_ID, T.claims, itemId, data).catch((e3) => {
          if (!isCode(e3, 404)) throw e3;
          return db().createRow(DB_ID, T.claims, itemId, data); // finished meanwhile: the re-check below sees it
        });
      } else {
        await db().createRow(DB_ID, T.claims, itemId, data);
      }
    } catch (e2) {
      if (isCode(e2, 409)) return { ok: false, reason: "taken" };
      throw e2;
    }
  }
  // We hold the lock. Someone may have finished the item between our read and our lock: check again.
  const fresh = await rowOrNull<TaskItem>(T.taskItems, itemId);
  if (!fresh || !isEligible(fresh, task, null, new Date())) {
    await db().deleteRow(DB_ID, T.claims, itemId).catch(() => {});
    return { ok: false, reason: fresh ? "done" : "not-found" };
  }
  return { ok: true, leaseUntil: data.leaseUntil };
}

/** Claim the best free item for the caller (the next_task MCP tool), or null when nothing is left. */
export async function claimNext(caller: Caller): Promise<{ item: TaskItem; task: Task; leaseUntil: string } | null> {
  const now = new Date();
  for (const { item, task, lastLog } of await listEligible(caller, Infinity)) {
    if (gaveUpRecently(lastLog, caller.memberId, now)) continue;
    const r = await claim(item.$id, caller);
    if (r.ok) return { item, task, leaseUntil: r.leaseUntil };
  }
  return null;
}

/** Only the holder can extend; works after expiry as long as nobody took it over. */
export async function heartbeat(itemId: string, caller: Caller, leaseMinutes = LEASE_MINUTES) {
  const held = await rowOrNull<Claim>(T.claims, itemId);
  if (!held || held.by !== caller.memberId) return { ok: false as const };
  const leaseUntil = leaseEnd(new Date(), leaseMinutes);
  await db().updateRow(DB_ID, T.claims, itemId, { leaseUntil });
  return { ok: true as const, leaseUntil };
}

/** The holder reports the result: log + item status + release, in one transaction. */
export async function finish(itemId: string, caller: Caller, outcome: "done" | "failed", data: { summary: string; details?: string }): Promise<Log> {
  const held = await rowOrNull<Claim>(T.claims, itemId);
  if (!held || held.by !== caller.memberId) throw new Error("You do not hold this item. Claim it first.");
  return writeLog(itemId, caller, outcome, data.summary, data.details ?? null, held);
}

/** Skip with a reason. No claim needed, but someone else's active claim blocks it. */
export async function recordSkip(itemId: string, caller: Caller, reason: string): Promise<Log> {
  if (!(await teamRow<TaskItem>(T.taskItems, itemId, caller.teamId))) throw new Error("not-found"); // before the claim: no "taken" leak across teams
  const held = await rowOrNull<Claim>(T.claims, itemId);
  if (isActive(held, new Date()) && held!.by !== caller.memberId) throw new Error("taken");
  return writeLog(itemId, caller, "skipped", reason, null, held?.by === caller.memberId ? held : null);
}

async function writeLog(itemId: string, caller: Caller, outcome: Log["outcome"], summary: string, details: string | null, held: Claim | null): Promise<Log> {
  const item = await rowOrNull<TaskItem>(T.taskItems, itemId);
  const task = item && await rowOrNull<Task>(T.tasks, item.taskId);
  if (!item || !task || item.teamId !== caller.teamId) throw new Error("not-found");
  if (!canTake(task, caller.memberId)) throw new Error("not-assigned");
  const now = iso(new Date());
  const log: Omit<Log, "$id"> = {
    teamId: task.teamId, taskId: task.$id, itemId, item: item.text, by: caller.memberId,
    outcome, summary, details, version: task.currentVersion, startedAt: held?.claimedAt ?? now, finishedAt: now,
  };
  const $id = ID.unique();
  await inTransaction(async (tx) => {
    await db().createRow(DB_ID, T.logs, $id, log, undefined, tx);
    await db().updateRow(DB_ID, T.taskItems, itemId, { status: outcome, lastLogId: $id, ...(outcome === "done" && { lastDoneAt: now }) }, undefined, tx);
    if (held) await db().deleteRow(DB_ID, T.claims, itemId, tx);
  });
  return { $id, ...log };
}
