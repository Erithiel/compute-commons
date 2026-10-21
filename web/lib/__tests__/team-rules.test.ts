import { describe, it, expect } from "vitest";
import { leadProblem, leadsKey, safeNext } from "../team-rules";
import type { Member } from "../types";

const mem = (id: string, role: Member["role"]): Member => ({ $id: id, teamId: "t1", userId: `u${id}`, name: id, role });

describe("a team keeps at least one lead", () => {
  const team = [mem("a", "lead"), mem("b", "member")];
  it("the only lead cannot be demoted", () => expect(leadProblem(team, "a", "member")).toMatch(/at least one lead/));
  it("with two leads, one can step down", () => {
    expect(leadProblem([...team, mem("c", "lead")], "a", "member")).toBeNull();
  });
  it("members can be changed freely", () => {
    expect(leadProblem(team, "b", "lead")).toBeNull();
  });
  it("unknown member", () => expect(leadProblem(team, "zz", "lead")).toMatch(/not found/));
});

describe("leadsKey", () => {
  const at = (id: string, role: Member["role"], u: string): Member => ({ ...mem(id, role), $updatedAt: u });
  it("same leads in any order give one key; a changed $updatedAt or lead set gives another", () => {
    const a = at("a", "lead", "1"), b = at("b", "lead", "1");
    expect(leadsKey("t1", [a, b, at("c", "member", "9")])).toBe(leadsKey("t1", [b, a]));
    expect(leadsKey("t1", [a, b])).not.toBe(leadsKey("t1", [at("a", "lead", "2"), b]));
    expect(leadsKey("t1", [a, b])).not.toBe(leadsKey("t1", [a]));
  });
});

it("safeNext only allows same-site paths", () => {
  expect(safeNext("/tasks/abc", "/board")).toBe("/tasks/abc");
  expect(safeNext("//evil.com", "/board")).toBe("/board");
  expect(safeNext("https://evil.com", "/board")).toBe("/board");
  expect(safeNext("/\\evil.com", "/board")).toBe("/board");
  expect(safeNext("/\t/evil.com", "/board")).toBe("/board");
  expect(safeNext("/\n/evil.com", "/board")).toBe("/board");
  expect(safeNext("/ok\r", "/board")).toBe("/board");
  expect(safeNext("/tasks/abc?x=1", "/board")).toBe("/tasks/abc?x=1");
  expect(safeNext(null, "/board")).toBe("/board");
});
