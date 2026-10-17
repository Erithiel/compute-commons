import { describe, it, expect } from "vitest";
import { canTake, gaveUpRecently, isEligible, sortWork } from "../claims";
import type { Task, TaskItem, Claim, Log } from "../types";

const task = (o: Partial<Task> = {}): Task => ({ $id: "k1", teamId: "t", title: "T", repeatDays: 0, repeatFor: 0, columns: [], assignees: [], currentVersion: 1, ...o });
const item = (o: Partial<TaskItem> = {}): TaskItem => ({
  $id: "i1", teamId: "t", taskId: "k1", text: "Acme", position: 0, status: "available", lastDoneAt: null, lastLogId: null, ...o,
});
const now = new Date("2026-10-20T12:00:00Z");

describe("isEligible", () => {
  it("free item is eligible", () => expect(isEligible(item(), task(), null, now)).toBe(true));
  it("active claim blocks", () => {
    const c: Claim = { $id: "i1", teamId: "t", by: "m1", claimedAt: "2026-10-20T11:00:00Z", leaseUntil: "2026-10-20T13:00:00Z" };
    expect(isEligible(item(), task(), c, now)).toBe(false);
  });
  it("expired claim does not block", () => {
    const c: Claim = { $id: "i1", teamId: "t", by: "m1", claimedAt: "2026-10-20T08:00:00Z", leaseUntil: "2026-10-20T10:00:00Z" };
    expect(isEligible(item(), task(), c, now)).toBe(true);
  });
  it("once means done once", () => {
    expect(isEligible(item({ status: "done", lastDoneAt: "2026-01-01T00:00:00Z" }), task(), null, now)).toBe(false);
  });
  it("failed items can be retried", () => expect(isEligible(item({ status: "failed" }), task(), null, now)).toBe(true));
  it("repeating task: an item comes back after repeatDays", () => {
    const t = task({ repeatDays: 7 });
    expect(isEligible(item({ status: "done", lastDoneAt: "2026-10-18T12:00:00Z" }), t, null, now)).toBe(false);
    expect(isEligible(item({ status: "done", lastDoneAt: "2026-10-01T12:00:00Z" }), t, null, now)).toBe(true);
  });
  it("repeating stops after repeatFor days from creation", () => {
    const done = item({ status: "done", lastDoneAt: "2026-10-18T12:00:00Z" });
    expect(isEligible(done, task({ repeatDays: 1, repeatFor: 30, $createdAt: "2026-10-01T00:00:00Z" }), null, now)).toBe(true);
    expect(isEligible(done, task({ repeatDays: 1, repeatFor: 7, $createdAt: "2026-10-01T00:00:00Z" }), null, now)).toBe(false);
    expect(isEligible(done, task({ repeatDays: 1, repeatFor: 0, $createdAt: "2020-01-01T00:00:00Z" }), null, now)).toBe(true);
  });
});

it("no assignees means anyone; otherwise only those listed", () => {
  expect(canTake(task(), "m1")).toBe(true);
  expect(canTake(task({ assignees: ["m2"] }), "m1")).toBe(false);
  expect(canTake(task({ assignees: ["m1", "m2"] }), "m2")).toBe(true);
});

it("orders never-done first, then oldest done", () => {
  const is = [item({ $id: "a", lastDoneAt: "2026-10-10T00:00:00Z" }), item({ $id: "b" }), item({ $id: "c", lastDoneAt: "2026-10-01T00:00:00Z" })];
  expect(sortWork(is).map((i) => i.$id)).toEqual(["b", "c", "a"]);
});

describe("gaveUpRecently", () => {
  const log = (o: Partial<Log> = {}) => ({ by: "me", outcome: "failed", finishedAt: "2026-10-20T11:00:00Z", ...o }) as Log;
  it("holds back my own recent fail or skip", () => {
    expect(gaveUpRecently(log(), "me", now)).toBe(true);
    expect(gaveUpRecently(log({ outcome: "skipped" }), "me", now)).toBe(true);
  });
  it("not someone else's, not a done, not after 12h, not with no log", () => {
    expect(gaveUpRecently(log({ by: "other" }), "me", now)).toBe(false);
    expect(gaveUpRecently(log({ outcome: "done" }), "me", now)).toBe(false);
    expect(gaveUpRecently(log({ finishedAt: "2026-10-19T23:59:00Z" }), "me", now)).toBe(false);
    expect(gaveUpRecently(null, "me", now)).toBe(false);
  });
});
