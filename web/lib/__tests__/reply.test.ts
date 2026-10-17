import { describe, it, expect } from "vitest";
import { leadOnly, ok, pickOne, run } from "../mcp/reply";
import type { Caller } from "../types";

const lead: Caller = { kind: "member", memberId: "m1", role: "lead", scheduled: false };
const ctx = (caller?: Caller) => ({ http: { authInfo: { extra: caller ? { caller } : {} } } });
const people = [{ $id: "m1", name: "Nino" }, { $id: "m2", name: "Giorgi" }, { $id: "m3", name: "giorgi " }];
const name = (p: { name: string }) => p.name;

describe("pickOne", () => {
  it("finds by id", () => expect(pickOne(people, "m2", name, "member").$id).toBe("m2"));
  it("finds by name, ignoring case and spaces", () => expect(pickOne(people, " nino ", name, "member").$id).toBe("m1"));
  it("unknown lists the choices", () => expect(() => pickOne(people, "Ana", name, "member")).toThrow(/No member "Ana". Known: Nino \(m1\)/));
  it("ambiguous asks for the id", () => expect(() => pickOne(people, "Giorgi", name, "member")).toThrow(/Several members.*m2.*m3/));
});

it("ok puts the plain line first, then JSON", () => {
  expect(ok("Done.").content[0].text).toBe("Done.");
  expect(ok("Done.", { a: 1 }).content[0].text).toBe('Done.\n\n{\n  "a": 1\n}');
});

it("run needs a caller and turns thrown errors into tool errors", async () => {
  expect((await run(ctx(), async () => ok("x"))).isError).toBe(true);
  const r = await run(ctx(lead), async (c) => { leadOnly({ ...c, role: "member" }); return ok("x"); });
  expect(r.isError).toBe(true);
  expect(r.content[0].text).toContain("Only a team lead");
  expect((await run(ctx(lead), async (c) => ok(c.memberId))).content[0].text).toBe("m1");
});
