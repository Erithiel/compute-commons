import { it, expect } from "vitest";
import { buildPrompt, itemPrompt } from "../prompt";

it("orders policy, prompt, note, row and skips empty parts", () => {
  expect(buildPrompt("P", "Do X")).toBe("P\n\n---\n\nDo X");
  expect(buildPrompt("", "Do X", "", "Acme")).toBe("Do X\n\n---\n\nItem: Acme");
  expect(buildPrompt("", "Do X", "Files in D:/x")).toBe("Do X\n\n---\n\nMy notes for this task:\nFiles in D:/x");
  expect(buildPrompt("P", "Do X", "N", "Acme")).toBe("P\n\n---\n\nDo X\n\n---\n\nMy notes for this task:\nN\n\n---\n\nItem: Acme");
});

it("a row with columns becomes Column: value lines", () => {
  const row = itemPrompt({ text: "Acme · acme.ge", data: '{"Client":"Acme","Site":"acme.ge","Contact":""}' });
  expect(row).toBe("Client: Acme\nSite: acme.ge");
  expect(buildPrompt("", "Do X", "", row)).toBe("Do X\n\n---\n\nItem:\nClient: Acme\nSite: acme.ge");
  expect(itemPrompt({ text: "Acme", data: null })).toBe("Acme");
  expect(itemPrompt({ text: "Acme", data: '{"Item":"Acme"}' })).toBe("Acme");
});
