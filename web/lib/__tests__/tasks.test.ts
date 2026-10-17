import { it, expect } from "vitest";
import { nextVersion, cleanRows, cleanColumns, patchTask, rowData, rowText } from "../tasks";

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
it("patches only what is given; adds and removes rows and assignees", () => {
  const cur = { title: "Audit", prompt: "Do X", repeatDays: 0, assignees: ["m1"], rows: ["Acme", "Green"] };
  expect(patchTask(cur, {})).toEqual(cur);
  expect(patchTask(cur, { repeatDays: 7, addRows: ["Blue", "Acme"], removeRows: [" Green "], addAssignees: ["m2"], removeAssignees: ["m1"] }))
    .toEqual({ ...cur, repeatDays: 7, rows: ["Acme", "Blue"], assignees: ["m2"] });
  expect(patchTask(cur, { assignees: [], rows: ["Only"] })).toEqual({ ...cur, assignees: [], rows: ["Only"] });
});
