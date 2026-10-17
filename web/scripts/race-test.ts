// F4 acceptance against the real server: npm run race-test
// Runs in its own team id so a real team's tasks are never touched; deletes what it creates.
import assert from "node:assert/strict";
import { ID, Query } from "node-appwrite";
import { adminTables, DB_ID, T } from "../lib/appwrite";
import { claim, claimNext, finish, recordSkip } from "../lib/claims";
import { clearAttempts, registerAttempt } from "../lib/throttle";
import type { Caller } from "../lib/types";

const TEAM = "race-test";
const db = adminTables();
const bot = (n: number): Caller => ({ kind: "member", memberId: `racer${n}`, teamId: TEAM, role: "member" });
const created: Array<[string, string]> = [];
const make = async (table: string, data: Record<string, unknown>) => {
  const row = await db.createRow(DB_ID, table, ID.unique(), data);
  created.push([table, row.$id]);
  return row.$id;
};
const item = (taskId: string, text: string, position: number) =>
  make(T.taskItems, { teamId: TEAM, taskId, text, position, status: "available", lastDoneAt: null, lastLogId: null });
const email = `race-${Math.random().toString(36).slice(2, 10)}@example.com`;
const okCount = (rs: Array<{ ok: boolean }>) => rs.filter((r) => r.ok).length;

async function main() {
  const taskId = await make(T.tasks, { teamId: TEAM, title: "race", repeatDays: 0, assignees: [], currentVersion: 1 });
  const one = await item(taskId, "only", 0);

  const first = await Promise.all(Array.from({ length: 10 }, (_, n) => claim(one, bot(n))));
  assert.equal(okCount(first), 1, "10 concurrent claims: exactly one wins");
  console.log("✓ 10 concurrent claims → 1 winner", first.filter((r) => !r.ok).map((r) => !r.ok && r.reason).join(","));

  await db.updateRow(DB_ID, T.claims, one, { leaseUntil: new Date(Date.now() - 60_000).toISOString() });
  const takeover = await Promise.all(Array.from({ length: 5 }, (_, n) => claim(one, bot(20 + n))));
  assert.equal(okCount(takeover), 1, "5 concurrent takeovers of an expired claim: exactly one wins");
  console.log("✓ 5 takeovers of an expired lease → 1 winner");

  const winner = bot(20 + takeover.findIndex((r) => r.ok));
  await finish(one, winner, "done", { summary: "race test" });
  assert.deepEqual(await claim(one, bot(99)), { ok: false, reason: "done" }, "a finished one-off cannot be claimed again");
  console.log("✓ finished item → \"done\"");

  const three = await Promise.all([1, 2, 3].map((p) => item(taskId, `row ${p}`, p)));
  const next = await Promise.all(Array.from({ length: 5 }, (_, n) => claimNext(bot(40 + n))));
  const got = next.filter(Boolean).map((r) => r!.item.$id);
  assert.equal(got.length, 3, "5 claimNext on 3 free items: 3 get one");
  assert.equal(new Set(got).size, 3, "…and all different");
  assert.deepEqual(new Set(got), new Set(three));
  console.log("✓ 5 claimNext on 3 rows → 3 distinct, 2 null");

  await assert.rejects(recordSkip(three[0], { ...bot(98), teamId: "race-other" }, "x"), /not-found/, "another team's claimed item is not-found, not taken");
  console.log("✓ recordSkip on another team's claimed item → \"not-found\"");

  const now = new Date();
  const tries = await Promise.all(Array.from({ length: 10 }, () => registerAttempt(email, now)));
  assert.equal(tries.filter(Boolean).length, 5, "10 parallel login attempts: exactly 5 may proceed");
  console.log("✓ 10 parallel login attempts → 5 allowed, 5 refused");
  await clearAttempts(email, now);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => {
    await clearAttempts(email).catch(() => {});
    const logs = await db.listRows(DB_ID, T.logs, [Query.equal("taskId", created[0]?.[1] ?? "-")]).catch(() => ({ rows: [] }));
    const all: Array<[string, string]> = [...created, ...logs.rows.map((r): [string, string] => [T.logs, r.$id]),
      ...created.filter(([t]) => t === T.taskItems).map(([, id]): [string, string] => [T.claims, id])];
    const items = created.filter(([t]) => t === T.taskItems).map(([, id]) => id);
    const markers = items.length ? (await db.listRows(DB_ID, T.takeovers, [Query.equal("itemId", items)])).rows : [];
    all.push(...markers.map((r): [string, string] => [T.takeovers, r.$id]));
    await Promise.all(all.map(([t, id]) => db.deleteRow(DB_ID, t, id).catch(() => {})));
  });
