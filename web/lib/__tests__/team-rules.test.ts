import { describe, it, expect } from "vitest";
import { emailKey, hashCode, inviteProblem, leadProblem, loginLocked, newInviteCode, safeNext } from "../team-rules";
import type { Invite, Member } from "../types";

const now = new Date("2026-10-20T12:00:00Z");
const inv = (o: Partial<Invite> = {}): Invite => ({
  $id: "v1", teamId: "t1", codeHash: "h", role: "member", createdBy: "m1",
  expiresAt: "2026-10-25T12:00:00Z", usedBy: null, usedAt: null, revoked: false, ...o,
});
const mem = (id: string, role: Member["role"]): Member => ({ $id: id, teamId: "t1", userId: `u${id}`, name: id, role });

describe("invites", () => {
  it("codes are random, url-safe, and stored only as a hash", () => {
    const a = newInviteCode(), b = newInviteCode();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(hashCode(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashCode(a)).toBe(hashCode(a));
  });
  it("a fresh invite is usable", () => expect(inviteProblem(inv(), now)).toBeNull());
  it("missing, revoked, used and expired invites are refused", () => {
    expect(inviteProblem(null, now)).toMatch(/not valid/);
    expect(inviteProblem(inv({ revoked: true }), now)).toMatch(/not valid/);
    expect(inviteProblem(inv({ usedBy: "m9", usedAt: "2026-10-19T00:00:00Z" }), now)).toMatch(/already used/);
    expect(inviteProblem(inv({ expiresAt: "2026-10-20T11:59:59Z" }), now)).toMatch(/expired/);
  });
});

describe("a team keeps at least one lead", () => {
  const team = [mem("a", "lead"), mem("b", "member")];
  it("the only lead cannot be demoted, removed or leave", () => {
    expect(leadProblem(team, "a", "member")).toMatch(/at least one lead/);
    expect(leadProblem(team, "a", "remove")).toMatch(/at least one lead/);
  });
  it("with two leads, one can step down", () => {
    expect(leadProblem([...team, mem("c", "lead")], "a", "remove")).toBeNull();
  });
  it("members can be changed freely", () => {
    expect(leadProblem(team, "b", "lead")).toBeNull();
    expect(leadProblem(team, "b", "remove")).toBeNull();
  });
  it("unknown member", () => expect(leadProblem(team, "zz", "remove")).toMatch(/not found/));
});

describe("login throttle", () => {
  it("emailKey ignores case and spaces and is a valid row id", () => {
    expect(emailKey(" Nino@Rando.ge ")).toBe(emailKey("nino@rando.ge"));
    expect(emailKey("x@y.z")).toMatch(/^[0-9a-f]{36}$/);
  });
  it("locks after 5 failures inside 15 minutes, then unlocks", () => {
    expect(loginLocked(null, now)).toBe(false);
    expect(loginLocked({ fails: 4, windowStart: "2026-10-20T11:50:00Z" }, now)).toBe(false);
    expect(loginLocked({ fails: 5, windowStart: "2026-10-20T11:50:00Z" }, now)).toBe(true);
    expect(loginLocked({ fails: 9, windowStart: "2026-10-20T11:40:00Z" }, now)).toBe(false);
  });
});

it("safeNext only allows same-site paths", () => {
  expect(safeNext("/join/abc", "/board")).toBe("/join/abc");
  expect(safeNext("//evil.com", "/board")).toBe("/board");
  expect(safeNext("https://evil.com", "/board")).toBe("/board");
  expect(safeNext("/\\evil.com", "/board")).toBe("/board");
  expect(safeNext(null, "/board")).toBe("/board");
});
