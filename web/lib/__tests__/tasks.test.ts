import { it, expect } from "vitest";
import { nextVersion, cleanRows, cleanColumns, rowData, rowText } from "../tasks";

it("rows with columns: text joins values, data maps column to value", () => {
  expect(rowText([" Acme ", "", "acme.ge"])).toBe("Acme · acme.ge");
  expect(cleanColumns(["Client", " "])).toEqual(["Client", "Column 2"]);
  expect(rowData(["Client", "Site"], ["Acme", " acme.ge "])).toBe('{"Client":"Acme","Site":"acme.ge"}');
  expect(rowData([], ["Acme"])).toBeNull();
});

it("increments versions from 0", () => {
  expect(nextVersion(0)).toBe(1);
  expect(nextVersion(4)).toBe(5);
});
it("cleans rows: trims, drops blanks and duplicates, keeps order", () => {
  expect(cleanRows([" Acme ", "", "Green Cafe", "Acme"])).toEqual(["Acme", "Green Cafe"]);
});
