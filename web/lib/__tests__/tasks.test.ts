import { it, expect } from "vitest";
import { nextVersion, cleanRows } from "../tasks";

it("increments versions from 0", () => {
  expect(nextVersion(0)).toBe(1);
  expect(nextVersion(4)).toBe(5);
});
it("cleans rows: trims, drops blanks and duplicates, keeps order", () => {
  expect(cleanRows([" Acme ", "", "Green Cafe", "Acme"])).toEqual(["Acme", "Green Cafe"]);
});
